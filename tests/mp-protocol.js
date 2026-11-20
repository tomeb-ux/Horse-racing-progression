// Headless multi-client protocol test (rooms of up to 6) against a running server (or starts one): lobby, validation, a full race, results.
const WebSocket = require('ws');
const URL_ = process.env.MP_URL || 'ws://localhost:8099/ws';
let srv; if (!process.env.MP_URL) { process.env.PORT = 8099; srv = require('../server/index.js'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(URL_); const c = { ws, name, msgs: [], last: {}, snaps: 0, bin: null };
  ws.on('message', (d, isBin) => { if (isBin) { c.bin = d; return; } const m = JSON.parse(d.toString()); c.msgs.push(m); c.last[m.type] = m; if (m.type === 'snap') { c.snaps++; c.lastSnap = m; } if (m.type === 'sp') ws.send(JSON.stringify({ type: 'spr', s: m.s })); });
  c.send = m => ws.send(JSON.stringify(m)); c.open = new Promise(r => ws.on('open', r)); return c;
}
const wait = async (c, type, ms = 5000, pred) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.msgs.find(x => x.type === type && (!pred || pred(x))); if (m) { c.msgs.splice(c.msgs.indexOf(m), 1); return m; } await sleep(20); } throw new Error(c.name + ' timed out waiting for ' + type); };
(async () => {
  const a = client('A'), b = client('B'); await a.open; await b.open;
  a.send({ type: 'create', name: 'Alice' }); const wa = await wait(a, 'welcome'); console.log('room code', wa.code, 'token length', wa.token.length);
  b.send({ type: 'join', code: 'ZZZZZZ', name: 'Bob' }); console.log('bad code →', (await wait(b, 'error')).code);
  b.send({ type: 'join', code: wa.code.toLowerCase(), name: 'Bob<script>' }); const wb = await wait(b, 'welcome'); console.log('joined as', wb.name, 'slot', wb.slot);
  // fill the room to 6, check a 7th is turned away, then two leave again: a 4-rider race
  const extra = []; for (const nm of ['Carol', 'Dave', 'Erin', 'Finn']) { const c = client(nm); await c.open; c.send({ type: 'join', code: wa.code, name: nm }); const w = await wait(c, 'welcome'); c.slot = w.slot; extra.push(c); }
  const c7 = client('G'); await c7.open; c7.send({ type: 'join', code: wa.code, name: 'Gus' }); console.log('7th player →', (await wait(c7, 'error')).code); c7.ws.close();
  console.log('seats taken:', a.last.lobby && (await sleep(100), a.last.lobby.players.filter(Boolean).map(p => p.name + '#' + p.horse).join(', ')));
  for (const c of extra.slice(2)) { c.send({ type: 'leave' }); await sleep(50); c.ws.close(); }
  const [c, d] = extra; await sleep(150);
  console.log('after two left:', a.last.lobby.players.filter(Boolean).map(p => p.name).join(', '));
  b.send({ type: 'pick', horse: 0 }); await sleep(100);
  a.send({ type: 'pick', horse: 0 }); console.log('duplicate horse →', (await wait(a, 'error')).code);
  a.send({ type: 'pick', horse: 9 });
  b.send({ type: 'settings', settings: { dist: 1000 } }); console.log('guest changes settings →', (await wait(b, 'error')).code);
  a.send({ type: 'settings', settings: { dist: 1000, going: 'good', field: 10, diff: 'medium', incidents: 'stumbles' } });
  a.send({ type: 'start' }); console.log('start before ready →', (await wait(a, 'error')).code);
  a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true }); c.send({ type: 'ready', ready: true }); await sleep(150);
  a.send({ type: 'start' }); console.log('start with one rider not ready →', (await wait(a, 'error')).code);
  d.send({ type: 'ready', ready: true }); await sleep(150);
  a.send({ type: 'start' });
  const rs = await wait(a, 'raceStart'); await wait(b, 'raceStart'); await wait(c, 'raceStart'); await wait(d, 'raceStart');
  console.log('race start: seed', rs.cfg.seed, 'humans', rs.cfg.humans, 'seats', rs.slots, 'names', rs.names.join('/'), 'field', rs.horses.length, 'dist', rs.cfg.distance);
  // ride: Alice holds Space during load/count; both press on GO; then race at sensible effort, tapping in the last 450 m
  let gate = false, aDone = false, bDone = false, t0 = Date.now();
  const iv = setInterval(() => {
    const s = a.lastSnap; if (!s) return;
    const hold = s.state !== 'running' && (s.P[0].st.m < s.P[0].st.z);
    a.send({ type: 'input', i: { effort: 0.8, steer: 0, hold } }); b.send({ type: 'input', i: { effort: 0.85, steer: 0, hold: false } });
    c.send({ type: 'input', i: { effort: 0.75, steer: 0 } }); d.send({ type: 'input', i: { effort: 0.9, steer: 0 } });
    if (s.state === 'running' && !gate) { gate = true; setTimeout(() => a.send({ type: 'press', rt: 0.2, tSeen: 0.2 }), 200); setTimeout(() => b.send({ type: 'press', rt: 0.35, tSeen: 0.35 }), 350); setTimeout(() => c.send({ type: 'press', rt: 0.3, tSeen: 0.3 }), 300); }
  }, 33);
  await sleep(1500); const snapA = a.lastSnap, snapC = c.lastSnap;
  console.log('snapshot detail: A gets full detail for', snapA.P.map((p, k) => p.st !== undefined ? k : null).filter(k => k != null).join(','), '· C for', snapC.P.map((p, k) => p.st !== undefined ? k : null).filter(k => k != null).join(','), '· light info for all', snapA.P.length);
  const res = await wait(a, 'results', 120000); const resB = await wait(b, 'results', 5000); const resC = await wait(c, 'results', 5000); const resD = await wait(d, 'results', 5000);
  clearInterval(iv); await sleep(400);
  const starts = a.msgs.concat(Object.values(a.last)).filter(m => m.type === 'snap').length;
  console.log('race took', ((Date.now() - t0) / 1000).toFixed(1), 's real time · snapshots received A', a.snaps, 'B', b.snaps, '(≈', (a.snaps / ((Date.now() - t0) / 1000)).toFixed(1), '/s)');
  const ord = r => r.order.map(o => o[0] + ':' + o[1].toFixed(3)).join(' ');
  console.log('identical official results for all four:', [resB, resC, resD].every(r => ord(r) === ord(res) && JSON.stringify(r.dnfs) === JSON.stringify(res.dnfs)));
  console.log('riders:', res.riders.map(r => `${r.name} horse#${r.i} place ${res.order.findIndex(o => o[0] === r.i) + 1} start ${r.startCat} react ${r.stat.reactT && r.stat.reactT.toFixed(2)}`).join(' | '));
  const meta = a.last.replayMeta; console.log('replay recording:', meta.n, 'frames @60Hz +', meta.m, '@20Hz,', (meta.bytes / 1024).toFixed(0), 'KB; binary received', !!a.bin && a.bin.length === meta.bytes);
  const lob = a.last.lobby; console.log('back in lobby:', lob.state, 'ready reset:', lob.players.filter(Boolean).map(p => p.ready).join(','));
  // reconnect with token during lobby
  b.ws.close(); await sleep(300); const b2 = client('B2'); await b2.open; b2.send({ type: 'rejoin', code: wa.code, token: 'nope' }); console.log('rejoin with a wrong token →', (await wait(b2, 'error')).code);
  b2.send({ type: 'rejoin', code: wa.code, token: wb.token }); const wb2 = await wait(b2, 'welcome'); console.log('rejoin with token → slot', wb2.slot, 'name', wb2.name);
  a.ws.close(); b2.ws.close(); c.ws.close(); d.ws.close(); if (srv) { srv.rooms.stop(); srv.server.close(); } setTimeout(() => process.exit(0), 200);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
