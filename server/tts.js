'use strict';
/* Final Furlong — ElevenLabs commentary endpoint (optional, "ElevenLabs enhanced" mode).
   The browser never sees the API key: it asks this server for a short phrase, the server calls ElevenLabs with the key
   from its environment, caches the MP3 on disk and returns it. Everything is bounded so a bug, a loop or a stranger
   cannot run up the bill:
     • key and voice only from the environment:  ELEVENLABS_API_KEY (required), ELEVENLABS_VOICE_ID (default
       MTGAJpjryOZn2Xr8FOtm, the "Commentator" voice), ELEVENLABS_MODEL (default eleven_v4, the model the shipped
       recordings were made with; falls back to eleven_multilingual_v2 if refused)
     • text: ≤ 120 characters, letters/digits/basic punctuation only; identical text is served from the cache forever
       (no second charge), the cache is capped (ELEVENLABS_CACHE_MB, default 50) and oldest-first evicted
     • per IP: 20 requests a minute; whole server: ELEVENLABS_DAILY_CHARS a day (default 2000 ≈ 130 horse names)
     • 8 s timeout; ElevenLabs errors are passed back as a short code (not-configured, invalid-key, no-credits,
       rate-limited, timeout, service-error) so the game simply keeps using the recordings / local voice.
   GET  /api/tts/status → { configured, voiceId, model, remainingToday, cached }
   POST /api/tts  { text, kind: "name_c" | "name_x" | "name_s" | "name" | "line" } → audio/mpeg
   A name is generated in the same three deliveries as the recorded library (before a phrase mid-race, excited in the
   straight, screamed at the finish) with the same audio tags, so a custom horse name matches the recordings. */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), https = require('https'), http = require('http');

const ENV = () => ({
  key: process.env.ELEVENLABS_API_KEY || '',
  voice: process.env.ELEVENLABS_VOICE_ID || 'MTGAJpjryOZn2Xr8FOtm',
  model: process.env.ELEVENLABS_MODEL || 'eleven_v4',
  base: process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io',
  daily: +(process.env.ELEVENLABS_DAILY_CHARS || 2000),
  cacheMB: +(process.env.ELEVENLABS_CACHE_MB || 50),
  dir: process.env.ELEVENLABS_CACHE_DIR || path.join(__dirname, 'cache', 'tts'),
});
const day = { d: '', used: 0 };
const ipHits = new Map();
let modelFallback = null;

function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }
function clean(t) { return String(t || '').replace(/[^\p{L}\p{N}' ,.!?\-&]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); }
function budgetLeft(E) { const d = new Date().toISOString().slice(0, 10); if (day.d !== d) { day.d = d; day.used = 0; } return Math.max(0, E.daily - day.used); }
function rateOk(ip) { const now = Date.now(), a = (ipHits.get(ip) || []).filter(t => now - t < 60000); if (a.length >= 20) { ipHits.set(ip, a); return false; } a.push(now); ipHits.set(ip, a); return true; }
function evict(E) {
  try { const f = fs.readdirSync(E.dir).map(n => { const p = path.join(E.dir, n), s = fs.statSync(p); return { p, s: s.size, t: s.mtimeMs }; }).sort((a, b) => a.t - b.t);
    let tot = f.reduce((x, y) => x + y.s, 0); while (tot > E.cacheMB * 1048576 && f.length) { const o = f.shift(); fs.unlinkSync(o.p); tot -= o.s; } } catch (e) {}
}
// one request to ElevenLabs text-to-speech (MP3 44.1 kHz 64 kbps)
function upstream(E, text, model) {
  return new Promise((resolve) => {
    const u = new URL(`/v1/text-to-speech/${encodeURIComponent(E.voice)}?output_format=mp3_44100_64`, E.base);
    const body = JSON.stringify({ text, model_id: model });
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, { method: 'POST', headers: { 'xi-api-key': E.key, 'content-type': 'application/json', accept: 'audio/mpeg', 'content-length': Buffer.byteLength(body) }, timeout: 8000 }, r => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, err: 'timeout' }); });
    req.on('error', e => resolve({ status: 0, err: e.code || e.message }));
    req.end(body);
  });
}
function errCode(r) {
  if (r.status === 0) return r.err === 'timeout' ? 'timeout' : 'service-error';
  const t = (r.body || '').toString().toLowerCase();
  if (r.status === 401) return /quota|credit/.test(t) ? 'no-credits' : 'invalid-key';
  if (r.status === 402 || /quota_exceeded|insufficient|credits/.test(t)) return 'no-credits';
  if (r.status === 429) return 'rate-limited';
  return 'service-error';
}
async function handle(req, res, url) {
  const E = ENV();
  if (url.pathname === '/api/tts/status') {
    let cached = 0; try { cached = fs.readdirSync(E.dir).length; } catch (e) {}
    return json(res, 200, { configured: !!E.key, voiceId: E.voice, model: modelFallback || E.model, remainingToday: budgetLeft(E), cached });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 2000) return json(res, 413, { error: 'too-long' }); }
  let m; try { m = JSON.parse(raw); } catch (e) { return json(res, 400, { error: 'bad-json' }); }
  const kind = ['line', 'name_c', 'name_x', 'name_s'].includes(m.kind) ? m.kind : 'name', said = clean(m.text);
  if (!said) return json(res, 400, { error: 'empty' });
  const model = modelFallback || E.model;
  // the same delivery as the recorded library: names called with excitement (eleven_v3/v4 read [tags]; older models don't)
  const TAG = { name: ['[urgent, fast and loud] ', '!'], name_c: ['[lively race caller] ', ','], name_x: ['[urgent, fast and loud] ', '!'], name_s: ['[screaming with excitement, very fast] ', '!'], line: ['[lively race caller] ', ''] }[kind];
  const text = /eleven_v[34]/.test(model) ? TAG[0] + said.replace(/[,.!?]+$/, '') + TAG[1] : said;
  const h = crypto.createHash('sha256').update(E.voice + '|' + model + '|' + text).digest('hex').slice(0, 32), file = path.join(E.dir, h + '.mp3');
  if (fs.existsSync(file)) { const b = fs.readFileSync(file); fs.utimesSync(file, new Date(), new Date()); res.writeHead(200, { 'content-type': 'audio/mpeg', 'x-tts-cache': 'hit', 'cache-control': 'private, max-age=31536000' }); return res.end(b); }
  if (!E.key) return json(res, 503, { error: 'not-configured' });
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateOk(ip)) return json(res, 429, { error: 'rate-limited' });
  if (budgetLeft(E) < text.length) return json(res, 429, { error: 'daily-limit' });
  day.used += text.length;
  let r = await upstream(E, text, model);
  if ((r.status === 400 || r.status === 404 || r.status === 422) && /model/i.test((r.body || '').toString()) && !modelFallback && model !== 'eleven_multilingual_v2') {
    modelFallback = 'eleven_multilingual_v2'; r = await upstream(E, said, modelFallback);            // the model was refused: one retry on a standard model
  }
  if (r.status !== 200 || !r.body || r.body.length < 200) return json(res, r.status === 0 ? 504 : 502, { error: errCode(r) });
  try { fs.mkdirSync(E.dir, { recursive: true }); fs.writeFileSync(file, r.body); evict(E); } catch (e) {}
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'x-tts-cache': 'miss', 'cache-control': 'private, max-age=31536000' }); res.end(r.body);
}
module.exports = { handle, _reset() { day.d = ''; day.used = 0; ipHits.clear(); modelFallback = null; } };
