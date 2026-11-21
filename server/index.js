'use strict';
// Final Furlong multiplayer server: serves the game (public/) and runs private two-player races over WebSockets (/ws).
// Single process, no database. PORT from the environment (default 8080).
const http = require('http'), fs = require('fs'), path = require('path');
const { performance } = require('perf_hooks');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./rooms');
const P = require('./protocol');
const TTS = require('./tts');            // optional ElevenLabs commentary endpoint (key stays on the server)

const PORT = +(process.env.PORT || 8080), HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url.pathname === '/api/tts' || url.pathname === '/api/tts/status') { TTS.handle(req, res, url).catch(() => { try { res.writeHead(500); res.end(); } catch (e) {} }); return; }
  let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
    const hdr = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': rel.endsWith('.html') ? 'no-cache' : 'public, max-age=300', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin' };
    // cross-origin isolation: lets the enhanced commentary voice run on several CPU threads (SharedArrayBuffer).
    // Off with FF_COI=0 or ?coi=0 (if a browser extension or a third-party resource objects to it).
    if (rel.endsWith('.html') && process.env.FF_COI !== '0' && url.searchParams.get('coi') !== '0') { hdr['cross-origin-opener-policy'] = 'same-origin'; hdr['cross-origin-embedder-policy'] = 'require-corp'; }
    res.writeHead(200, hdr);
    res.end(data);
  });
});

const rooms = new RoomManager();
// Browsers always send Origin: accept our own host, plus any listed in ALLOWED_ORIGINS (comma-separated full origins,
// e.g. "https://my-game.example.com"), so another website can't open races from its visitors' browsers.
// Non-browser clients (no Origin header, e.g. the test scripts) are allowed; they are rate-limited like everyone else.
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
function originOk(info) {
  const o = (info.origin || '').toLowerCase(); if (!o) return true;
  if (ALLOWED.includes(o)) return true;
  try { return new URL(o).host === String(info.req.headers.host || '').toLowerCase(); } catch (e) { return false; }
}
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096, verifyClient: originOk });
const perIp = new Map();
const MAX_CONN_PER_IP = 12;

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const n = (perIp.get(ip) || 0) + 1; perIp.set(ip, n);
  if (n > MAX_CONN_PER_IP) { ws.close(4029, 'too many connections'); }
  // token bucket: generous for 30 Hz input plus presses, but stops floods
  ws.bucket = 120; ws.bucketT = performance.now(); ws.alive = true;
  const reply = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const fail = (code, extra) => reply(Object.assign({ type: 'error', code }, extra || {}));
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (data, isBinary) => {
    const now = performance.now();
    ws.bucket = Math.min(120, ws.bucket + (now - ws.bucketT) * 0.08); ws.bucketT = now;   // 80 msgs/s sustained
    if (ws.bucket < 1) return; ws.bucket -= 1;
    if (isBinary) return;
    let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m.type !== 'string') return;
    const room = ws.room, slot = ws.slot;
    switch (m.type) {
      case 'ping': reply({ type: 'pong', t: m.t, s: performance.now() }); return;
      case 'spr': if (room && room.players[slot] && Number.isFinite(m.s)) { const rtt = Math.max(1, Math.min(2000, now - m.s)); const p = room.players[slot]; p.rtt = p.rtt * 0.7 + rtt * 0.3; } return;
      case 'create': { if (room) return fail('already-in-room'); const r = rooms.create(ws, m.name); if (r.err) fail(r.err); return; }
      case 'join': { if (room) return fail('already-in-room'); const r = rooms.join(ws, m.code, m.name); if (r.err) fail(r.err); return; }
      case 'rejoin': { if (room) return fail('already-in-room'); const r = rooms.rejoin(ws, m.code, m.token); if (r.err) fail(r.err, { rejoin: true }); return; }
    }
    if (!room || slot == null || !room.players[slot] || room.players[slot].ws !== ws) return fail('not-in-room');
    room.touch();
    let err = null;
    switch (m.type) {
      case 'pick': err = room.pick(slot, m.horse); if (!err) room.broadcastLobby(); break;
      case 'ready': err = room.setReady(slot, m.ready); if (!err) room.broadcastLobby(); break;
      case 'settings': err = room.setSettings(slot, m.settings); if (!err) room.broadcastLobby(); break;
      case 'start': err = room.start(slot); break;
      case 'leave': room.leave(slot); ws.room = null; ws.slot = null; return;
      case 'input': if (room.session) room.session.setInput(slot, P.cleanInput(m.i)); return;
      case 'press': if (room.session) room.session.press(slot, m, room.players[slot].rtt); return;
      case 'kick': if (room.session) room.session.kick(slot, m.side === 1 || m.side === -1 ? m.side : 0); return;
      case 'debugFall': if (process.env.FF_TEST_HOOKS === '1' && room.session) room.session.debugFall(slot); return;   // automated tests only; off in production
      default: return;
    }
    if (err) fail(err);
  });
  ws.on('close', () => {
    perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
    const room = ws.room; if (room && ws.slot != null && room.players[ws.slot] && room.players[ws.slot].ws === ws) room.disconnect(ws.slot);
  });
});
// latency probe (server → client) every 2 s, and dead-connection detection
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; try { ws.ping(); } catch (e) {}
    if (ws.readyState === 1 && ws.room) ws.send(JSON.stringify({ type: 'sp', s: performance.now() }));
  }
}, 2000);

server.listen(PORT, HOST, () => console.log(`Final Furlong server on http://localhost:${PORT}  (WebSocket /ws)`));
module.exports = { server, rooms };
