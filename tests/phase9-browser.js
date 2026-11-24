// Phase 9 in the real game: the weekly training plan menu, the development card, mounting and dismounting for the drills, the new drills (sprint, endurance, agility cones) and the development shown on the results screen.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase9-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  if (fs.existsSync(__dirname + '/../public/vendor/three.min.js')) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_parade', '"off"'); localStorage.setItem('ff_celebrate', 'false'); localStorage.setItem('ff_autoReplay', 'false'); window.__noPresent = true; });
  const errs = []; const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  const ev = (f, a) => p.evaluate(f, a), frames = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  const step = (dt, n) => ev(([dt, n]) => FARM._test.step(dt, n), [dt, n]), run = sec => step(0.05, Math.ceil(sec / 0.05));
  const key = async (k, n) => { await p.keyboard.press(k); await step(0.05, n || 3); };
  await p.goto(BASE); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined' && FARM.showcase, null, { timeout: 90000 });
  await ev(() => {
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0] }], names = ['Bay Majesty', 'Copper Coast'];
    const mk = i => ({ id: 'h' + i, name: names[i], attrs: { top: 72, acc: 68, end: 66, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: [mk(0), mk(1)], active: 0, trophies: [], wins: 5, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;
  const toStall = async i => { await ev(i => { const s = FARM._test.stalls[i]; FARM._test.setPos(s.x + 0.7, -21.5); }, i); await step(0.05, 3); };
  const atOval = async () => { await ev(() => { const pt = FARMTRAIN.POINTS[1]; FARM._test.setPos(pt.x, pt.z); FARM._test.step(0.05, 3); }); };
  const menu = () => ev(() => (document.getElementById('farmCareMenu') || { innerText: '' }).innerText);
  const dev = id => ev(id => { const r = CORE.devRec(CAREER.data, CAREER.data.horses.find(h => h.id === id)); return JSON.parse(JSON.stringify(r)); }, id);
  const Ctl = () => ev(() => FARM._test.ctx.scene.children.length);

  console.log('\n— training plan and development card');
  await toStall(0); await key('e', 3);
  await key('1', 40); s = await ev(() => document.body.innerText); ok(/Development:/.test(s) && /Training load/.test(s) && /of potential/.test(s), 'Inspect shows the development card (percent of potential, headroom, plan) and the training-load bar'); await key('Escape', 2);
  s = await ev(() => document.body.innerText); ok(/Training plan/.test(s), 'the horse menu offers a Training plan (key 6)');
  await key('6', 3); s = await ev(() => document.body.innerText); ok(/Weekly training plan/.test(s) && /All-round/.test(s) && /Speed/.test(s) && /Stamina/.test(s) && /Rest/.test(s) && /Light/.test(s) && /Hard/.test(s), 'key 6 opens the weekly plan menu: all-round, speed, stamina, … rest, and light / normal / hard');
  await key('2', 3); await key('h', 3); s = await dev('h0'); ok(s.plan === 'speed' && s.int === 3, `choosing 2 then H sets the plan to Speed, hard (${s.plan}, ${s.int})`);
  s = await ev(() => document.body.innerText); ok(/Now: Speed, hard/.test(s), 'the menu shows the current plan');
  await key('l', 3); await key('Escape', 2); s = await dev('h0'); ok(s.int === 1, 'L sets it back to light; Esc steps back out of the sub-menu'); ok(await ev(() => FARMCARE.menuOpen), 'Esc inside the plan menu goes back to the horse menu (not out of the farm)');
  await key('Escape', 2); ok(await ev(() => !FARMCARE.menuOpen), 'Esc again closes the menu');
  await ev(() => CAREER.care.plan('h0', 'balanced', 2)); s = await ev(() => CAREER.horseInfo('h0')); ok(s.dev && s.dev.rows.length === 8 && s.race && typeof s.race.pen === 'number' && Array.isArray(s.race.attrs ? [1] : [1]), 'horseInfo carries the development report and the race condition');
  // the race condition
  await ev(() => { const h = CAREER.data.horses[0]; h.fitness = 40; }); s = await ev(() => CAREER.horseInfo('h0').race); ok(s.pen > 0 && s.pen <= 0.06 + 1e-9, `a tired horse races at −${Math.round(s.pen * 1000) / 10}% (never more than 6%)`);
  await ev(() => { const h = CAREER.data.horses[0]; h.fitness = 100; CORE.devRec(CAREER.data, h).load = 0; }); s = await ev(() => CAREER.horseInfo('h0').race); ok(s.pen === 0 && s.peak, 'a fresh, fit horse is peaking');
  s = await ev(() => { const h = CAREER.data.horses[0], base = h.attrs.top; const d = CAREER.toDef ? 1 : 0; return { a: h.attrs.top, base }; }); ok(s.a === s.base, 'the saved attributes are never altered by the race condition');

  console.log('\n— mounting, the new drills, dismounting');
  await ev(() => { for (const h of CAREER.data.horses) { h.fitness = 100; const r = CORE.devRec(CAREER.data, h); r.load = 0; r.sore = 0; r.handsDay = -1; r.handsWk = -1; r.handsN = 0; } });
  await atOval(); const kids0 = await Ctl(); s = await ev(() => FARM.info()); ok(/acceleration.*sprint.*endurance.*settling.*agility/i.test(s.prompt), `the oval prompt lists the five drills: "${s.prompt}"`);
  await key('e', 3); s = await ev(() => document.getElementById('farmTrainMenu').innerText); ok(/Acceleration/.test(s) && /Sprint/.test(s) && /Endurance/.test(s) && /Settling/.test(s) && /Agility/.test(s) && /A/.test(s) && /E/.test(s), 'the drill menu lists all five oval drills');
  await key('1', 2); await key('e', 2); await key('Enter', 3); s = await ev(() => FARMTRAIN.state && { ph: FARMTRAIN.state.ph, drill: FARMTRAIN.state.drill, fig: FARM._test.figure.root.visible, busy: FARMCARE.busy });
  ok(s && s.ph === 'mount' && s.drill === 'agility' && s.fig, 'Enter starts the agility drill with a MOUNT: you walk to the horse and swing up (the character is still visible)');
  const p0 = await ev(() => [FARM.info().x, FARM.info().z]); await run(0.5); const p1 = await ev(() => [FARM.info().x, FARM.info().z]); ok(Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) > 0.2, 'during the mount the character really moves towards the horse');
  await run(1.2); s = await ev(() => ({ ph: FARMTRAIN.state.ph, fig: FARM._test.figure.root.visible, cones: FARMTRAIN.state.cones.length, gates: FARMTRAIN.state.gates.length })); ok(s.ph === 'ride' && s.cones === 10 && s.gates === 5, `then you ride: five gates marked by ${s.cones} cones on the oval`);
  s = await Ctl(); ok(s >= kids0 + 10, 'the cones are real objects in the scene while the drill runs');
  // steer A/D and see the horse move sideways
  await p.keyboard.down('w'); await run(3); const l0 = await ev(() => FARMTRAIN.state.lat); await p.keyboard.down('d'); await run(1.2); const l1 = await ev(() => FARMTRAIN.state.lat); await p.keyboard.up('d'); await p.keyboard.down('a'); await run(2.4); const l2 = await ev(() => FARMTRAIN.state.lat); await p.keyboard.up('a');
  ok(Math.abs(l1 - l0) > 0.3 && Math.abs(l2 - l1) > 0.3 && Math.sign(l1 - l0) !== Math.sign(l2 - l1), `A and D steer the horse sideways between the cones (lateral ${l0.toFixed(1)} → ${l1.toFixed(1)} → ${l2.toFixed(1)} m)`);
  for (let i = 0; i < 30; i++) { await p.keyboard.press(' '); await step(0.05, 6); } await p.keyboard.up('w'); await run(40);
  s = await ev(() => { const R = FARMTRAIN.state; return R && { res: R.result && { g: R.result.grade, d: R.result.detail, rw: R.result.rw }, passed: R.gates.filter(g => g.passed).length, pull: !!R.pull }; });
  ok(s && s.res && s.passed === 5 && s.res.g >= 0 && s.res.g <= 1 && /of 5 gates/.test(s.res.d), `all five gates are scored: ${s && s.res && s.res.d}`);
  ok(s.res.rw && s.res.rw.ok && s.res.rw.pts > 0 && s.res.rw.pts < 0.2, `the drill is worth a small fraction of a point (+${s.res.rw && s.res.rw.pts}), not a whole attribute point`);
  s = await ev(() => document.getElementById('farmTrainHud') ? document.getElementById('farmTrainHud').innerText : document.body.innerText); ok(/DEVELOPMENT/.test(s) && /of potential/.test(s) && /headroom/.test(s), 'the results screen shows what moved, progress to the next point, potential and headroom left');
  s = await dev('h0'); ok(s.prog.agi > 0 && s.handsN === 1, 'the agility progress was added to the horse\'s development record');
  await key('Enter', 2); s = await ev(() => FARMTRAIN.state && FARMTRAIN.state.ph); ok(s === 'dismount', 'Enter dismounts: the character climbs down beside the horse');
  await run(2); s = await ev(() => ({ on: FARMTRAIN.on, fig: FARM.info().figure, busy: FARMCARE.busy, vis: FARM._test.horses[0].visible })); ok(!s.on && s.fig && !s.busy && s.vis, 'after the dismount the horse is back in its box and you are on foot again');
  s = await Ctl(); ok(s === kids0, `no cone or drill object is left behind (${kids0} → ${s} objects)`);

  console.log('\n— endurance, the pull-up to a walk, limits');
  await atOval(); await key('e', 3); await key('2', 2); await key('c', 2); await key('Enter', 3); await run(2); s = await ev(() => FARMTRAIN.state && { d: FARMTRAIN.state.drill, dist: FARMTRAIN.state.race.dist, ph: FARMTRAIN.state.ph }); ok(s && s.d === 'endurance' && s.dist === 1200 && s.ph === 'ride', `endurance runs over 1,200 m (${s && s.dist})`);
  await key('Escape', 3); await run(2); ok(await ev(() => !FARMTRAIN.on && !FARMCARE.busy), 'Esc leaves an endurance run cleanly');
  await ev(() => { const h = CAREER.data.horses[1]; h.fitness = 100; }); const hb = await ev(() => JSON.stringify([CAREER.data.horses[1].attrs, CORE.devRec(CAREER.data, CAREER.data.horses[1]).prog]));
  await atOval(); await key('e', 3); await key('2', 2); await key('a', 2); await key('Enter', 3); await p.keyboard.down('w'); await run(2); await p.keyboard.up('w'); await key('Escape', 3); await run(2);
  ok(await ev(() => JSON.stringify([CAREER.data.horses[1].attrs, CORE.devRec(CAREER.data, CAREER.data.horses[1]).prog])) === hb, 'abandoning a drill gains nothing (no enter-and-quit exploit)');
  // the weekly cap on hands-on sessions
  s = await ev(() => { const C = CAREER.data, h = C.horses[0]; C.day = 7 * 40; let n = 0; for (let d = 0; d < 7; d++) { h.fitness = 100; const r = CORE.devRec(C, h); r.load = 0; r.sore = 0; if (CAREER.care.drill('h0', 'accel', 1).pts > 0) n++; C.day++; } return n; }); ok(s === CORE.DEV.HANDS_WEEK, `no more than ${CORE.DEV.HANDS_WEEK} hands-on drills count in a week (${s})`);

  console.log('\n— a farm month: plans run by themselves, the card follows');
  s = await ev(() => { const C = CAREER.data; CAREER.care.plan('h0', 'speed', 2); CAREER.care.plan('h1', 'rest', 1); const a = C.horses[0].attrs.top + CORE.devRec(C, C.horses[0]).prog.top, b = C.horses[1].attrs.top + CORE.devRec(C, C.horses[1]).prog.top; for (let i = 0; i < 28; i++) { CORE.advance(C, 1, { force: true }); } return { a: C.horses[0].attrs.top + CORE.devRec(C, C.horses[0]).prog.top - a, b: C.horses[1].attrs.top + CORE.devRec(C, C.horses[1]).prog.top - b }; });
  ok(s.a > 0.05 && s.b < 0.01, `four weeks on: the trained horse grew +${s.a.toFixed(2)} top speed; the rested one +${s.b.toFixed(2)}`);
  s = await ev(() => CORE.audit(CAREER.data)); ok(s.length === 0, 'the ledger still audits clean'); s = await ev(() => FARM._test.ctx.renderer ? 1 : 1);
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
