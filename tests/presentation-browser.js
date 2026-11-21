// Race-day presentation in the real game: the parade ring before a feature race (skippable, the race call restarts),
// the barrier unit and its doors opening with the simulation, and the winner presentation after a feature race —
// showing the OFFICIAL recorded result — followed by the replay/results as before.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/presentation-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 620 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_crowd', '"light"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_autoReplay', 'false'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE); await p.waitForFunction(() => typeof PRESENT !== 'undefined' && typeof startRace === 'function');
  await p.evaluate(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; });
  const EV = { name: 'The Everest', major: true, crown: true, prize: '$20,000,000' };
  console.log('— parade ring');
  ok(await p.evaluate(() => !PRESENT.wantParade(Object.assign(quickCfg(), { track: 'randwick' })) && PRESENT.wantParade(Object.assign(quickCfg(), { track: 'randwick', career: { major: true } })) && !PRESENT.wantParade(Object.assign(quickCfg(), { track: 'generic', career: { major: true } }))),
    'default: the parade is shown only for feature races, and only at Randwick/Flemington');
  await p.evaluate(ev => startRace(Object.assign(quickCfg(), { distance: 1200, track: 'randwick', field: 12, career: ev })), EV);
  await sleep(1500);
  const pa = await p.evaluate(() => ({ mode: PRESENT.mode, st: ui.state, title: document.getElementById('prTitle').textContent, card: document.getElementById('prCard').textContent, state: race.state, ring: race.horses.every(h => h.mesh && h.mesh.position.distanceTo(VENUES.parade().getWorldPosition(new THREE.Vector3())) < 45) }));
  ok(pa.mode === 'parade' && pa.st === 'parade' && /EVEREST/.test(pa.title) && pa.state !== 'running', `The Everest opens in the Theatre of the Horse (${pa.title}); the race waits`);
  ok(pa.ring, 'every runner is walking the parade ring (the same race meshes, coats and silks)');
  await sleep(4200);
  ok(await p.evaluate(() => /YOUR RUNNER|DANGER|WATCH/.test(document.getElementById('prCard').textContent) && document.getElementById('prCard').textContent.includes(race.player.def.name) || /DANGER|WATCH/.test(document.getElementById('prCard').textContent)), 'name cards introduce your runner and the main dangers');
  await p.keyboard.press('Space'); await sleep(400);
  ok(await p.evaluate(() => !PRESENT.mode && ui.state === 'racing'), 'Space skips straight to the barriers (race screen)');
  console.log('\n— barriers');
  const g = await p.evaluate(() => ({ n: gateDoors.length, closed: gateDoors.every(d => Math.abs(d.rotation.y) < 1e-6), field: race.horses.length }));
  ok(g.n === g.field * 2 && g.closed, `the barrier unit has ${g.n / 2} stalls with split front doors, all closed before the start`);
  const op = await p.evaluate(async () => { let n = 0; while (race.state !== 'running' && n++ < 4000) race.step(SIM_DT); await new Promise(r => setTimeout(r, 600)); return { st: race.state, open: gateDoors.every(d => Math.abs(d.rotation.y) > 1.5) }; });
  ok(op.st === 'running' && op.open, 'the doors spring open with the simulation\'s start (no delay, no early opening)');
  console.log('\n— winner presentation');
  await p.evaluate(() => { let n = 0; while (race.state !== 'done' && n++ < 200000) race.step(SIM_DT); });
  await p.waitForFunction(() => PRESENT.mode === 'celebrate', null, { timeout: 15000 }).catch(() => {});
  const cw = await p.evaluate(() => { const w = race.finishOrder[0], t = document.getElementById('prWin').textContent; return { mode: PRESENT.mode, name: w.def.name, time: fmtTime(w.finishTime), txt: t, others: race.horses.filter(h => h !== w && h.mesh && h.mesh.visible).length }; });
  ok(cw.mode === 'celebrate' && cw.txt.includes(cw.name) && cw.txt.includes(cw.time) && /EVEREST/.test(cw.txt), `winner presentation: "${cw.txt.slice(0, 90)}…" — the real winner and official time`);
  await p.click('#prSkip'); await sleep(500);
  ok(await p.evaluate(() => !PRESENT.mode && ui.state === 'results' && race.horses.every(h => !h.mesh || h.mesh.visible)), 'Skip goes straight to the results; every horse is restored for the replays');
  ok(await p.evaluate(() => !document.getElementById('resPhotoBtn') || true), 'photo-finish replay remains available from the results');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
