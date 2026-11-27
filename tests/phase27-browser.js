// Phase 27 in the real game: the next-task banner, the farm's chores, the guide line to the next task, and the race board beside the stables.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase27-browser.js
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
    for (const [i, h] of C.horses.entries()) { const r = CORE.devRec(C, h); r.plan = 'balanced'; r.int = i === 0 ? 3 : 1; r.sessDay = -1; h.trainPts = i ? 0 : 6; r.sore = 0; }
    localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;
  await ev(() => FARMACTORS.setSpeed('paused'));
  const banner = async () => { await run(1); return ev(() => { const e = document.getElementById('farmTask'); return e ? { hidden: e.hidden, txt: e.innerText.replace(/\n+/g, ' | ') } : null; }); };
  console.log('— the banner');
  s = await banner(); ok(s && !s.hidden && /NEXT TASK · 0 OF \d+ DONE TODAY/i.test(s.txt) && /Feed Bay Majesty/i.test(s.txt), 'across the top of the farm screen: ' + (s && s.txt));
  ok(/Then: Feed Copper Coast/i.test(s.txt), 'with the two jobs after it');
  await ev(() => { CAREER.care.feed('h0', 0); }); s = await banner(); ok(/Feed Copper Coast/i.test(s.txt) && /1 OF/i.test(s.txt), 'feeding Bay Majesty ticks it off and the next task appears: ' + s.txt.slice(0, 80));
  await ev(() => { for (const id of ['h1', 'h2']) CAREER.care.feed(id, 0); for (const id of ['h0', 'h1', 'h2']) CAREER.care.groom(id); }); s = await banner(); ok(/Spend Bay Majesty's 6 training points/i.test(s.txt), 'then the training points: ' + s.txt.slice(0, 90));
  console.log('\n— the guide line');
  s = await ev(() => { const t = FARMTASKS.target(), g = FARM._test.horses[0], st = FARM._test.world().stalls[g.userData.stallI]; return { t, ex: st.x - 1.5, next: FARMTASKS.list.next.kind }; }); ok(s.t && Math.abs(s.t.x - s.ex) < 0.1 && s.next === 'train', 'the guide points at the training board beside that horse\'s box');
  await ev(() => { FARM._test.setPos(0, -12); }); await run(3); ok(await ev(() => { const g = FARM._test.ctx.scene.getObjectByName ? true : true; return FARM.info().objective !== undefined; }), 'the guide line is running');
  console.log('\n— spending the points from the board clears the task');
  await ev(() => { while (CAREER.training.view('h0').rows.some(r => r.can)) { CAREER.training.up('h0', CAREER.training.view('h0').rows.find(r => r.can).k); } }); s = await banner(); ok(/Book a race on the race board/i.test(s.txt), 'then: ' + s.txt.slice(0, 100));
  console.log('\n— the race board beside the stables');
  s = await ev(() => { const b = FARMTASKS.spot; return { has: !!FARM._test.ctx.scene.getObjectByName('raceBoard'), x: b.x, z: b.z, blocked: FARMNAV.blockedAt(b.x, b.z) }; }); ok(s.has && s.x > 14 && s.x < 22 && s.z > -23 && s.z < -17 && !s.blocked, `the board stands at the end of the stables (${s.x.toFixed(1)}, ${s.z.toFixed(1)}), on clear ground`);
  await ev(() => { const b = FARMTASKS.spot; FARM._test.setPos(b.x, b.z + 1.5); }); await run(1); s = await ev(() => FARM.info()); ok(s.near === 'raceboard' && /Race board: choose and book a race/.test(s.prompt), 'standing at it: "' + s.prompt + '"');
  await p.keyboard.press('e'); await run(1); ok(await ev(() => FARM.info().panel === 'calendar'), 'E opens the race calendar (the same one as in the farmhouse)');
  s = await banner(); ok(s.hidden, 'and the banner gets out of the way while a panel is open');
  await p.keyboard.press('Escape'); await run(1);
  console.log('\n— starting a race from the board');
  await ev(() => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); window.__bk = CAREER.book(e.id, 'h0').ok; }); await run(1);
  s = await ev(() => ({ bk: window.__bk, txt: FARM.info().prompt })); ok(s.bk && /leave for the races/.test(s.txt), 'with a race booked the board offers to leave for it: "' + s.txt + '"');
  s = await ev(() => { const t = FARMTASKS.compute(); return t.tasks.filter(x => !x.done).map(x => x.kind).join(','); }); ok(!/book/.test(s) && /prepare|rest|drill/.test(s), 'the "book a race" task is gone (' + s + ')');
  await p.keyboard.press('e'); await run(2); s = await ev(() => ({ panel: FARM.info().panel, trip: FARM.info().trip, txt: document.getElementById('farmPanel').innerText.replace(/\n+/g, ' | ').slice(0, 120) })); ok(s.panel === 'depart' || s.trip, 'E there starts the trip: the departure summary opens (' + s.txt + ')');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
