// The three-stage start in the real game (headless): the stalls (W/S balance), an early press, the jump on the opening,
// pushes into stride — the HUD shows each stage and the result; no page errors.   PORT=8095 node tests/start-browser.js [shotsDir]
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`, SHOTS = process.argv[2];
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 680 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_comm', '"off"'); window.__noPresent = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => typeof startRace === 'function');
  await p.evaluate(() => { renderer.render = () => {}; });
  await p.evaluate(() => { settings.parade = 'off'; ui.state = 'racing'; startRace(Object.assign(quickCfg(), { distance: 1200, field: 8, track: 'flemington', incidents: 'off', seed: 4 })); if (typeof PRESENT !== 'undefined' && PRESENT.mode) PRESENT.finish(); });
  // stage 1: balance with W/S (a scripted rider reacting to the HUD pin), one early press during "SET"
  const lab = [];
  let early = null;
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => ({ s: race.state, poise: race.st.poise, R: race.st.R, label: document.getElementById('smLabel').textContent, hidden: document.getElementById('startMeter').hidden, open: race.st.open }));
    if (st.s === 'running') break;
    if (i === 30 && SHOTS) await p.screenshot({ path: SHOTS + '/start-1-stalls.png' });
    lab.push(st.label);
    await p.evaluate(pz => { keys.w = pz < -0.06; keys.s = pz > 0.06; }, st.poise);
    if (st.s === 'count' && early == null) { await p.keyboard.press(' '); early = await p.evaluate(() => race.st.early); }
    await sleep(25);
  }
  await p.evaluate(() => { keys.w = false; keys.s = false; });
  ok(lab.some(l => /balanced|leaning on the gate|sitting back/.test(l)), 'stage 1: the HUD shows the horse\'s balance in the stalls (' + lab.find(l => /balanced|leaning|sitting/.test(l)) + ')');
  ok(early === 1, 'pressing Space before the gates open is an early press (the horse anticipates), not a launch');
  const R0 = await p.evaluate(() => race.st.R);
  ok(R0 > 0.4, `readiness when the gates opened: ${(R0 * 100).toFixed(0)}% (balanced by W/S)`);
  // stage 2: the jump
  await p.waitForFunction(() => race.st.open, null, { timeout: 15000 });
  if (SHOTS) await p.screenshot({ path: SHOTS + '/start-2-gates.png' });
  await sleep(180); await p.keyboard.press(' ');
  const j = await p.evaluate(() => ({ cat: race.player.startCat, rt: race.st.rt, label: document.getElementById('smLabel').textContent }));
  ok(!!j.cat && j.rt > 0.05, `stage 2: jumped on the opening — ${j.cat}, reaction ${j.rt && j.rt.toFixed(2)} s`);
  // stage 3: push with the stride
  let kicks = 0;
  for (let i = 0; i < 200 && kicks < 4; i++) {
    const s = await p.evaluate(() => ({ win: race.player.strideWin(), a: race.player.strideAcc(), label: document.getElementById('smLabel').textContent }));
    if (!s.win) { await sleep(20); continue; }
    if (s.a > 0.75) { await p.keyboard.press(' '); kicks++; if (kicks === 2 && SHOTS) await p.screenshot({ path: SHOTS + '/start-3-stride.png' }); await sleep(120); } else await sleep(10);
  }
  const k = await p.evaluate(() => ({ push: race.player.jumpPush, kicks: race.player.kicks, label: document.getElementById('smLabel').innerHTML }));
  ok(k.kicks >= 3 && k.push > 0.3, `stage 3: ${k.kicks} pushes into stride, drive ${(k.push * 100).toFixed(0)}%`);
  await sleep(2500);
  const after = await p.evaluate(() => ({ hidden: document.getElementById('startMeter').hidden, effort: race.player.effort }));
  ok(after.hidden, 'the start panel clears once the horse is in its stride');
  await p.keyboard.press('w'); await sleep(60);
  const e2 = await p.evaluate(() => race.player.effort);
  ok(Math.abs(e2 - after.effort - 0.05) < 0.03, `a tap of W raises effort by a fine step (${(after.effort * 100).toFixed(0)}% → ${(e2 * 100).toFixed(0)}%)`);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/race.png' });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
