// Phase 18 in the real game: morning trackwork on the oval, the cool-out (horse walker with the Recovery facility), the wash, and back to the box.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase18-browser.js
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
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0] }, { type: 'grey', coat: '#aab0b4', face: 'blaze', socks: [0, 0, 0, 0] }], names = ['Bay Majesty', 'Copper Coast', 'Silver Mist'];
    const mk = i => ({ id: 'h' + i, name: names[i], attrs: { top: 72, acc: 68, end: 66, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: [mk(0), mk(1), mk(2)], active: 0, trophies: [], wins: 5, history: [], season: null, created: 1 }; SEASON.migrate(C);
    // a dry day (rain keeps every horse in): pick the first seed whose weather today is not rain
    for (let s = 7777; s < 7900; s++) { C.seed = s; const wx = ATMO.dayWeather(C.seed, C.day, CORE.parts(C.day).m); if (wx !== 'rain' && wx !== 'light_rain') break; }
    for (const [i, h] of C.horses.entries()) { const r = CORE.devRec(C, h); r.plan = 'balanced'; r.int = i === 0 ? 3 : 1; r.sessDay = i === 2 ? -1 : (C.day || 0); r.sore = 0; }
    localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;
  const st = hid => ev(hid => { const j = FARMWORK.find(hid), g = FARM._test.horses.find(x => x.userData.hid === hid), C = CAREER.data; return { t: FARMACTORS.hour(), job: !!j, stage: j ? j.stage : -1, ran: j ? j.ran : 0, x: g.position.x, z: g.position.z, out: !!g.userData.out, rider: !!(g.userData.jk && g.userData.jk.mesh.visible), steam: !!(j && j.steam), hand: j && j.w ? j.w.d.id : null, wk: j ? !!j.wk : false, onw: j ? j.wst === 1 : false, doors: FARMCARE.doors.d.some(d => d.want !== 0), last: FARMWORK.lastFor(hid), walker: !!FARMWORK.walker, ang: FARMWORK.walker ? FARMWORK.walker.ang : 0, day: C.day, sx: FARM._test.world().stalls[g.userData.stallI].x, sz: FARM._test.world().stalls[g.userData.stallI].z }; }, hid);
  const until = async (hid, pred, max) => { for (let i = 0; i < (max || 1500); i++) { await step(0.1, 2); const q = await st(hid); if (pred(q)) return q; } return null; };
  const track = await ev(() => FARMWORLD.L.track);

  console.log('\n— the morning session');
  s = await st('h0'); ok(!s.job && !s.out && !s.rider, 'at 05:30 every horse is in its box, no rider up');
  ok(await ev(() => FARMACTORS.entry('h0').work && FARMACTORS.entry('h1').work && !FARMACTORS.entry('h2').work), 'h0 and h1 have a session today, h2 does not (the schedule is derived from the career)');
  await ev(() => FARMACTORS.skipTo(6.2)); await step(0.05, 4); const jsonBefore = await ev(() => JSON.stringify(CAREER.data)); s = await st('h0'); ok(!s.job, 'at 06:12 the first horse has not gone yet');
  ok(!(await st('h2')).out, 'a horse with no session stays in its box through the work window'); let q = await until('h0', x => x.job, 400); ok(q, 'the work rider takes the first horse out at 06:15'); 
  q = await until('h0', x => x.stage >= 1, 200); ok(q && q.doors && q.rider, 'the door opens and a rider is up');
  q = await until('h0', x => x.stage >= 2, 200); ok(q, 'it is ridden out of the box');
  q = await until('h0', x => x.stage === 3, 600); ok(q, 'it reaches the exercise oval');
  await step(0.1, 80); const p0 = await st('h0'); await step(0.1, 20); const p1 = await st('h0'); const spd = Math.hypot(p1.x - p0.x, p1.z - p0.z) / 2; ok(spd > 4 && spd < 14, `it works at a canter or better (${spd.toFixed(1)} m/s)`);
  ok(p1.z > track.cz - 27 && p1.z < track.cz + 27 && p1.rider, `it is on the oval with the rider up (z ${p1.z.toFixed(1)})`);
  q = await until('h0', x => x.stage >= 4, 1800); ok(q && q.steam, 'one lap done: it comes off the oval steaming'); const lap = await ev(() => FARMWORK.find('h0').sec); ok(lap > 20 && lap < 120, `the lap time is recorded (${lap.toFixed(1)} s)`);
  q = await until('h0', x => x.stage >= 5, 800); ok(q && !q.rider, 'the rider hands it over at the courtyard');
  q = await until('h0', x => x.stage >= 6 && x.hand, 800); ok(q, 'a stable hand takes it to cool it out (' + (q && q.hand) + ')'); ok(!q.wk, 'with no Recovery facility it is walked round the courtyard');
  q = await until('h0', x => x.stage >= 8, 1500); ok(q, 'then it goes to the wash bay');
  q = await until('h0', x => x.stage >= 9, 800); ok(q, 'and is washed');
  q = await until('h0', x => !x.job, 1500); ok(q && !q.out && !q.rider && !q.doors, 'it is back in its box, rider gone, door shut');
  s = await st('h0'); ok(Math.abs(s.x - s.sx) < 0.5 && Math.abs(s.z - (s.sz + 0.55)) < 0.5, 'standing in its own box'); ok(!!s.last && s.last.sec > 0, 'the trainer\'s stopwatch time is shown in Inspect: ' + (await ev(() => FARMACTORS.todayLines('h0').join(' · '))).slice(0, 140));
  await until('h1', x => !x.job, 3000); ok(await ev(() => FARMWORK.jobs.length === 0 && FARMLIFE.npcs.every(n => !n.job || n.job.dir)), 'no hand is still tied up with the work (a hand may be out turning a horse out)');
  { const now = await ev(() => JSON.stringify(CAREER.data)); if (now !== jsonBefore) { const A = JSON.parse(jsonBefore), B = JSON.parse(now), ks = []; const walk = (a, b, path) => { if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], path + '.' + k); } else if (a !== b) ks.push(path + ': ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b)); }; walk(A, B, ''); console.log('   diff:', ks.slice(0, 6).join(' | ')); } }
  ok((await ev(() => JSON.stringify(CAREER.data))) === jsonBefore, 'the whole morning changed nothing in the career data (the session was applied by the calendar, not by the picture of it)');

  console.log('\n— the horse walker');
  await ev(() => { CAREER.data.fac = CAREER.data.fac || {}; CAREER.data.fac.recovery = 2; CAREER.data.day += 1; const C = CAREER.data; for (const h of C.horses.slice(0, 2)) { const r = CORE.devRec(C, h); r.sessDay = C.day; r.sore = 0; } FARMWORK.buildWalker(); }); await run(2); s = await st('h0'); ok(s.walker, 'with Recovery level 2 the horse walker is built');
  ok(await ev(() => FARMNAV.ready && !FARMNAV.blockedAt(FARMWORK.POINTS.WALK.x, FARMWORK.POINTS.WALK.z)), 'it stands on clear ground');
  await ev(() => FARMACTORS.skipTo(6.2)); await step(0.05, 4);
  q = await until('h0', x => x.job && x.onw, 3000); ok(q, 'the horse is cooled out on the walker'); const w0 = (await st('h0')).ang; await step(0.1, 60); const w1 = (await st('h0')).ang; ok(w1 > w0 + 0.5, `the arm turns (${(w1 - w0).toFixed(1)} rad in 6 s)`);
  q = await until('h0', x => !x.job, 3000); ok(q && !q.out, 'and it goes back to its box afterwards');

  console.log('\n— skipping');
  await ev(() => { CAREER.data.day += 1; const C = CAREER.data; for (const h of C.horses.slice(0, 2)) { const r = CORE.devRec(C, h); r.sessDay = C.day; r.sore = 0; } }); await run(2);
  await ev(() => FARMACTORS.skipTo(7.0)); await step(0.05, 4); s = await st('h0'); ok(s.job && s.stage === 3 && s.out && s.rider, 'skipping into the work window puts the horse on the oval');
  await ev(() => FARMACTORS.skipTo(9)); await step(0.05, 4); s = await st('h0'); ok(!s.job && !s.out && !s.rider, 'skipping past it puts the horse back in its box'); ok(await ev(() => FARMLIFE.npcs.every(n => !n.job)), 'and the hands are free');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
