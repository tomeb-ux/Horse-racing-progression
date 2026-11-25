// Phase 17 in the real game: the farm clock, the light that follows it, and the stable hands who walk horses between their boxes and the paddocks.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase17-browser.js
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
    localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;
  const st = () => ev(() => { const C = CAREER.data, A = FARMACTORS; return { t: A.hour(), day: C.day, live: A.live(), held: A.held, jobs: A.jobs.length, queue: A.queue.length, saved: C.farm && C.farm.clock && C.farm.clock.t,
    out: C.horses.map(h => FARMLIFE.isOut(h.id)), uOut: FARM._test.horses.map(g => !!g.userData.out), doorOpen: FARMCARE.doors.d.map(d => d.want !== 0), tod: FARM._test.atmoNow && FARM._test.atmoNow.tod, hourLive: FARM._test.atmoNow && FARM._test.atmoNow.hour }; });

  console.log('\n— the clock');
  s = await st(); ok(s.live && Math.abs(s.t - 5.5) < 0.02, `the farm day starts at 05:30 (${s.t.toFixed(2)})`); ok(s.out.every(o => !o), 'every horse starts in its box');
  const day0 = s.day; await run(30); const s1 = await st(); ok(s1.t > s.t + 0.6 && s1.t < s.t + 0.8, `30 s of free time moves the clock ~40 min (${((s1.t - s.t) * 60).toFixed(0)} min)`); const j0 = await ev(() => JSON.stringify(CAREER.data)); await run(5); ok((await ev(() => JSON.stringify(CAREER.data))) === j0 && s1.saved !== s1.t, 'walking about does not touch the career data (the clock is written back when you leave)');
  ok(await ev(() => /\d\d:\d\d/.test(document.getElementById('farmWx').textContent)), 'the HUD shows the farm time: "' + await ev(() => document.getElementById('farmWx').textContent) + '"');
  ok(await ev(() => FARM._test.atmoNow && FARM._test.atmoNow.live === true), 'the light follows the clock');
  console.log('\n— it never rushes you');
  const holdTest = async (name, setup, teardown) => { await ev(setup); await step(0.05, 4); const a = await st(); await run(8); const c = await st(); await ev(teardown); ok(Math.abs(c.t - a.t) < 1e-6, `the clock holds ${name}`); };
  await holdTest('with the map open', () => FARM._test.openPanel('map'), () => FARM._test.closePanel());
  await frames(2); await step(0.05, 3);
  const a2 = await st(); await ev(() => { FARMCARE.summon('h0', FARM._test.ctx.P.x + 2, FARM._test.ctx.P.z + 2); }); await run(6); const b2 = await st(); ok(Math.abs(b2.t - a2.t) < 1e-6, 'the clock holds while you are leading a horse'); await ev(() => FARMCARE.release()); await step(0.05, 3);
  await ev(() => FARMACTORS.setSpeed('paused')); const a3 = await st(); await run(10); const b3 = await st(); ok(Math.abs(b3.t - a3.t) < 1e-6, 'Clock: Paused stops it'); await ev(() => FARMACTORS.setSpeed('slow')); const a4 = await st(); await run(20); const b4 = await st(); ok(b4.t - a4.t > 0.2 && b4.t - a4.t < 0.3, `Clock: Slow runs at half speed (${((b4.t - a4.t) * 60).toFixed(0)} min in 20 s)`); await ev(() => FARMACTORS.setSpeed('normal'));
  ok((await st()).day === day0, 'the calendar never moved');

  console.log('\n— the stable hands turn a horse out');
  await ev(() => FARMACTORS.skipTo(9.9)); await step(0.05, 4); s = await st(); ok(!s.out[0] && s.jobs === 0, 'at 09:54 the first horse is still in its box');
  let seen = { job: false, door: false, led: false, rope: false }, firstPos = null;
  for (let i = 0; i < 400 && !(await ev(() => FARMLIFE.isOut('h0'))); i++) { await step(0.1, 2); const q = await ev(() => { const j = FARMACTORS.jobs[0]; return j ? { dir: j.dir, stage: j.stage, door: FARMCARE.doors.d[j.i].want !== 0, rope: !!(j.rope && j.rope.visible), uOut: !!j.g.userData.out, n: FARMACTORS.jobs.length, hand: FARMLIFE.npcs.filter(x => x.job).length } : null; }); if (q) { seen.job = true; if (q.door) seen.door = true; if (q.rope) seen.rope = true; if (q.stage === 3) seen.led = true; seen.max = Math.max(seen.max || 0, q.n); } }
  ok(seen.job, 'a stable hand starts the job at 10:00'); ok(seen.door, 'the door opens'); ok(seen.rope, 'the horse is on a rope'); ok(seen.led, 'the horse is led across the yard');
  s = await st(); ok(s.out[0] && s.uOut[0], 'the horse ends up in the paddock (' + s.t.toFixed(2) + ')'); ok(s.doorOpen.every(d => !d), 'its door is shut again');
  for (let i = 0; i < 1500 && (await ev(() => FARMACTORS.jobs.length + FARMACTORS.queue.length)) > 0; i++) await step(0.1, 2); s = await st(); ok(s.jobs === 0 && await ev(() => FARMLIFE.npcs.every(n => !n.job)), 'the hands are free again ' + JSON.stringify(await ev(() => FARMACTORS.jobs.map(j => [j.hid, j.dir, j.stage, +j.t.toFixed(1), j.pi, j.path && j.path.length]))));
  ok(await ev(() => CAREER.data.farm.turnout && CAREER.data.farm.turnout.h0 != null), 'the turn-out is saved with the career');
  ok(await ev(() => { const g = FARM._test.horses.find(x => x.userData.hid === 'h0'), P = FARMLIFE.padInfo(FARMLIFE.out.h0.k); return g.position.x >= P.x0 - 4 && g.position.x <= P.x1 + 4 && g.position.z >= P.z0 - 6 && g.position.z <= P.z1 + 4; }), 'the horse is inside its paddock');

  console.log('\n— and bring it back in');
  await ev(() => FARMACTORS.skipTo(15.4)); await step(0.05, 4); s = await st(); ok(s.out[0], 'at 15:24 the horse is still out');
  seen = { job: false, door: false };
  for (let i = 0; i < 700 && (await ev(() => FARMLIFE.isOut('h0')) || await ev(() => FARMACTORS.jobs.length > 0)); i++) { await step(0.1, 2); const q = await ev(() => { const j = FARMACTORS.jobs[0]; return j ? { dir: j.dir, door: FARMCARE.doors.d[j.i].want !== 0 } : null; }); if (q) { if (q.dir === 'in') seen.job = true; if (q.door) seen.door = true; } }
  ok(seen.job && seen.door, 'a hand fetches it at 15:30 and opens the door'); s = await st(); ok(!s.out[0] && !s.uOut[0], 'the horse is back in its box'); ok(s.doorOpen.every(d => !d), 'the door is shut');
  ok(await ev(() => { const g = FARM._test.horses.find(x => x.userData.hid === 'h0'), sx = FARM._test.world().stalls[g.userData.stallI]; return Math.abs(g.position.x - sx.x) < 0.5 && Math.abs(g.position.z - (sx.z + 0.55)) < 0.5; }), 'standing in its own box');
  ok(await ev(() => !(CAREER.data.farm.turnout && CAREER.data.farm.turnout.h0 != null)), 'the saved turn-out is cleared');

  const newDay = async () => { await ev(() => { CAREER.data.day += 1; }); await run(2); };
  console.log('\n— skipping (the clock only ever moves forward)');
  await newDay(); s = await st(); ok(Math.abs(s.t - 5.5) < 0.2 && s.out.every(o => !o), 'a new day starts at 05:30 with every horse in its box (' + s.t.toFixed(2) + ')');
  s = await st(); const n = await ev(() => FARMACTORS.skipNext()); const s2 = await st(); ok(s2.t > s.t && s2.t < 10.2, `"skip to next activity" jumps to ${s2.t.toFixed(2)} (${n})`);
  await ev(() => FARMACTORS.skipTo(5.6)); s = await st(); ok(s.t >= s2.t - 1e-6, 'skipping to an earlier time does nothing: the clock never goes back');
  await ev(() => FARMACTORS.skipTo(10.5)); s = await st(); ok(s.out[0] && s.uOut[0], 'skipping into the turn-out window snaps the first horse to its paddock'); ok(s.jobs === 0, 'no hand is left half way through a job after a skip');
  await ev(() => FARMACTORS.skipEvening()); s = await st(); ok(s.out.every(o => !o) && Math.abs(s.t - 18) < 0.01, 'the evening has every horse back in its box'); ok(s.doorOpen.every(d => !d), 'every door is shut');
  console.log('\n— the player is never overridden');
  await newDay(); await ev(() => FARMACTORS.skipTo(6)); await step(0.05, 3); await ev(() => { const g = FARM._test.horses[1]; FARMLIFE.placeOut(g, 1); }); await run(6); s = await st(); ok(s.out[1], 'a horse you turned out by hand stays out until the schedule changes');
  await ev(() => { const g = FARM._test.horses[0]; FARMCARE.summon('h0', FARM._test.ctx.P.x + 2, FARM._test.ctx.P.z + 2); }); await ev(() => FARMACTORS.skipTo(10.05)); await run(4); s = await st(); ok(!s.out[0], 'a horse you are leading is not taken by a hand');
  await ev(() => FARMCARE.release()); await step(0.05, 3);

  console.log('\n— race day');
  await newDay(); await ev(() => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); e.day = C.day + 1; const r = CAREER.book(e.id, 'h2'); e.day = C.day; C.booking.day = C.day; window.__bk = r && r.ok; window.__ev = e.id; });
  await run(2); await ev(() => FARM._test.ctx.applyAtmosphere(true)); const rd = await ev(() => ({ bk: window.__bk, live: FARMACTORS.live(), label: FARMACTORS.label(), race: FARMACTORS.raceDay(), tod: FARM._test.atmoNow && FARM._test.atmoNow.tod, want: (() => { const e = CAREER.data.cal.events.find(x => x.id === window.__ev); return e && e.tod; })() }));
  ok(rd.bk, 'a race is booked for today'); ok(rd.race && !rd.live && rd.label === '', 'on race day the farm clock steps aside (no clock shown)'); ok(rd.tod === rd.want, `the light keeps the race's own time of day (${rd.tod})`);
  await ev(() => FARMACTORS.skipTo(10.5)); s = await st(); ok(!s.out[2], 'the booked horse never leaves its box on race day');
  await ev(() => { CAREER.cancelBooking(); });
  console.log('\n— leaving and returning');
  await ev(() => FARMACTORS.skipTo(10.6)); const keep = await st(); await ev(() => { SCENES.enter('career'); }); await frames(3); await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(3); await step(0.05, 6); s = await st();
  ok(Math.abs(s.t - keep.t) < 0.2, `the clock is where you left it (${keep.t.toFixed(2)} → ${s.t.toFixed(2)})`); ok(s.out[0] === keep.out[0] && s.out[1] === keep.out[1], 'the horses are where the schedule puts them');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
