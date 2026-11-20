// Online CHAOS MODE (server with FF_TEST_HOOKS=1): host-only setting, one kick per rider with a chosen side, no mass
// collapse (only contact brings others down), and an all-riders-down race running on to an AI winner.
const WebSocket = require('ws');
const URL_ = process.env.MP_URL || 'ws://localhost:8095/ws';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(URL_); const c = { ws, name, msgs: [] };
  ws.on('message', (d, isBin) => { if (isBin) return; const m = JSON.parse(d.toString()); c.msgs.push(m); if (m.type === 'snap') c.lastSnap = m; if (m.type === 'sp') ws.send(JSON.stringify({ type: 'spr', s: m.s })); });
  c.send = m => ws.send(JSON.stringify(m)); c.open = new Promise(r => ws.on('open', r)); return c;
}
const wait = async (c, type, ms = 5000, pred) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.msgs.find(x => x.type === type && (!pred || pred(x))); if (m) { c.msgs.splice(c.msgs.indexOf(m), 1); return m; } await sleep(20); } throw new Error(c.name + ' timed out waiting for ' + type); };
(async () => {
  const a = client('A'), b = client('B'); await a.open; await b.open;
  a.send({ type: 'create', name: 'Alice' }); const wa = await wait(a, 'welcome');
  b.send({ type: 'join', code: wa.code, name: 'Bob' }); await wait(b, 'welcome'); await sleep(150);
  b.send({ type: 'settings', settings: { chaos: true } }); console.log('guest turns chaos on →', (await wait(b, 'error')).code);
  a.send({ type: 'settings', settings: { chaos: 'yes' } }); console.log('bad chaos value →', (await wait(a, 'error')).code);
  a.send({ type: 'settings', settings: { chaos: true, dist: 1600, field: 12 } }); await sleep(200);
  a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true }); await sleep(200); a.send({ type: 'start' });
  const rs = await wait(a, 'raceStart'); await wait(b, 'raceStart');
  console.log('race cfg: chaos', rs.cfg.chaos, '· incidents', rs.cfg.incidents, '· field', rs.horses.length);
  // Alice rides up level with the nearest live AI horse; one kick, on the correct side, when truly alongside
  let kicked = null;
  const ride = () => { const s = a.lastSnap; if (!s || s.state !== 'running') return { effort: 0.9, steer: 0 }; const me = s.H[0]; let best = null, bi = -1;
    s.H.forEach((h, i) => { if (i < 2 || (h[15] & 8) || (h[15] & 1)) return; if (!best || Math.abs(h[0] - me[0]) + Math.abs(h[1] - me[1]) * 0.3 < Math.abs(best[0] - me[0]) + Math.abs(best[1] - me[1]) * 0.3) { best = h; bi = i; } });
    if (!best) return { effort: 0.9, steer: 0 };
    const dp = best[0] - me[0], dlm = (best[1] - me[1]) * 1.9;
    if (!kicked && s.c > 5 && Math.abs(dp) < 1.0 && Math.abs(dlm) > 1.05 && Math.abs(dlm) < 2.05) { kicked = { t: Date.now(), tgt: bi }; a.send({ type: 'kick', side: Math.sign(dlm) }); }
    if (Date.now() % 5000 < 55) console.log('  (riding: dp ' + dp.toFixed(1) + ' dlm ' + dlm.toFixed(1) + ')');
    return { effort: dp > 0.6 ? 1 : dp < -0.6 ? 0.65 : 0.88, steer: Math.abs(dlm) > 1.85 ? Math.sign(best[1] - me[1]) : 0, adv: true }; };
  const iv = setInterval(() => { a.send({ type: 'input', i: ride() }); b.send({ type: 'input', i: { effort: 0.85, steer: 0 } }); }, 50);
  const t0 = Date.now(); while (!(a.lastSnap && a.lastSnap.state === 'running' && a.lastSnap.c > 1)) { if (Date.now() - t0 > 30000) throw new Error('no start'); await sleep(50); }
  a.send({ type: 'press', rt: 0.3, tSeen: 0.3 }); b.send({ type: 'press', rt: 0.3, tSeen: 0.3 });
  const kr = await wait(a, 'kickres', 90000);
  console.log('kick result:', JSON.stringify(kr), '· target was', kicked && rs.horses[kicked.tgt]);
  const downAt = a.lastSnap.H.filter(h => h[15] & 8).length;
  await sleep(3000);
  const down3 = a.lastSnap.H.filter(h => h[15] & 8).length;
  console.log('down at the kick:', downAt, '→ 3 s later:', down3, 'of', a.lastSnap.H.length, '(a chain needs real contact — no field-wide collapse)');
  if (down3 > 6) throw new Error('mass collapse: ' + down3);
  // a second kick is refused
  a.send({ type: 'kick', side: 1 }); const kr2 = await wait(a, 'kickres', 5000);
  console.log('second kick →', JSON.stringify(kr2));
  // both riders down before the line: the race must run on to an AI winner, same results for both
  a.send({ type: 'debugFall' }); b.send({ type: 'debugFall' }); await sleep(400);
  console.log('riders down:', a.lastSnap.H.slice(0, 2).map(h => !!(h[15] & 8)).join(','), '· race state', a.lastSnap.state);
  const ra = await wait(a, 'results', 180000), rb = await wait(b, 'results', 5000); clearInterval(iv);
  const ord = r => r.order.map(o => o[0] + ':' + o[1].toFixed(3)).join(' ');
  console.log('winner:', ra.order.length ? 'horse #' + ra.order[0][0] + ' (AI: ' + (ra.order[0][0] > 1) + ')' : 'none', '· both riders DNF:', ra.riders.every(r => r.dnf), '· identical results:', ord(ra) === ord(rb));
  console.log('fall kinds in the official result:', ra.fallen.filter(Boolean).map(f => f[5]).join(','), '· kick in the events:', ra.events.some(e => e.type === 'kick'));
  a.ws.close(); b.ws.close(); setTimeout(() => process.exit(0), 200);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
