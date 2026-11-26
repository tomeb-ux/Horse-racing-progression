// Phase 26 in the real game: the training board beside each box: spend a horse's training points without leaving the farm (same rules as the Training screen).
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase26-browser.js
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
    for (const [i, h] of C.horses.entries()) { const r = CORE.devRec(C, h); r.plan = 'balanced'; r.int = i === 0 ? 3 : 1; r.sessDay = -1; h.trainPts = 12 - i * 5; h.trained = 0; r.sore = 0; }
    localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;
  await ev(() => FARMACTORS.setSpeed('paused'));
  const view = () => ev(() => CAREER.training.view('h0'));
  console.log('— the boards');
  s = await ev(() => ({ boards: !!FARM._test.ctx.scene.getObjectByName('trainingBoards'), pts: FARMCARE.points().filter(p => p.id === 'trainboard').map(p => p.text) }));
  ok(s.boards, 'a board mesh hangs on the stable wall (one mesh, one texture)'); ok(s.pts.length === 3 && /Bay Majesty · 12 points/.test(s.pts[0]) && /Copper Coast · 7 points/.test(s.pts[1]) && /Silver Mist · 2 points/.test(s.pts[2]), 'one board per horse, each saying how many points are to spend: ' + s.pts.join(' | '));
  console.log('\n— using one');
  await ev(() => { const g = FARM._test.horses[0], st = FARM._test.world().stalls[g.userData.stallI]; FARM._test.setPos(st.x - 1.5, -21.0); }); await run(1);
  s = await ev(() => FARM.info()); ok(s.near === 'trainboard' && /Training board: Bay Majesty/.test(s.prompt), 'standing by the board offers it: "' + s.prompt + '"');
  await p.keyboard.press('e'); await run(1); s = await ev(() => ({ panel: FARM.info().panel, rows: document.querySelectorAll('#farmPanel .tr').length, txt: document.getElementById('farmPanel').innerText.replace(/\n+/g, ' | ').slice(0, 160) }));
  ok(s.panel === 'train' && s.rows === 8, `E opens the training board: eight attributes (${s.txt})`);
  let v = await view(), a0 = v.rows[0], pts0 = v.pts; ok(v.pts === 12 && a0.can, `${v.name} has ${v.pts} points; ${a0.lab} costs ${a0.cost}`);
  ok(await ev(() => CAREER.training.view('h0').rows.every(r => r.cost === SEASON.upgCost(r.v))), 'every cost is the Training screen\'s own (SEASON.upgCost)');
  const click = k => ev(k => document.querySelector(`#farmPanel [data-up="${k}"]`).click(), k);
  await click(a0.k); await run(0.3); v = await view(); ok(v.rows[0].v === a0.v + 1 && v.pts === pts0 - a0.cost && v.rows[0].gained === 1, `+1 ${a0.lab}: ${a0.v} → ${v.rows[0].v}, points ${pts0} → ${v.pts}`);
  ok(await ev(() => /\+1/.test(document.getElementById('farmPanel').innerText)), 'the panel shows the gain');
  await ev(() => document.getElementById('fuUndo').click()); await run(0.3); v = await view(); ok(v.rows[0].v === a0.v && v.pts === pts0, 'Undo gives the point back');
  // spend everything possible
  for (let i = 0; i < 40; i++) { v = await view(); const r = v.rows.find(r => r.can); if (!r) break; await click(r.k); } v = await view();
  ok(v.rows.every(r => !r.can) && v.pts >= 0 && v.rows.every(r => r.v <= r.p), `spending until nothing is affordable: ${v.pts} points left, no attribute above its potential`);
  ok(await ev(() => document.querySelectorAll('#farmPanel [data-up]:not([disabled])').length === 0), 'every button is disabled');
  console.log('\n— leaving');
  await p.keyboard.press('Escape'); await run(1); s = await ev(() => ({ panel: FARM.info().panel, busy: FARM._test.ctx.blocked() })); ok(!s.panel && !s.busy, 'Esc closes it and you are free to move');
  ok(await ev(() => { const h = CAREER.data.horses[0]; return h.trainPts === CAREER.training.points('h0') && h.trained > 0; }), 'the points are spent in the career data (the Training screen sees the same horse)');
  ok(await ev(() => FARMCARE.points().find(p => p.id === 'trainboard' && p.hid === 'h0').text.includes(CAREER.training.points('h0') + ' point')), 'the board now shows the new total');
  await ev(() => { CAREER.open(); }); await frames(2); ok(await ev(() => { const h = CAREER.data.horses[0]; return h.attrs.top >= 72; }), 'and the career still loads');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
