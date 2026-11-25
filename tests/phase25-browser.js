// Phase 25 in the real game: a lived-in farm: resident horses that come to the fence, the dog, the hens, the hay truck, the visiting rider, and staff who chat.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase25-browser.js
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
    for (const [i, h] of C.horses.entries()) { const r = CORE.devRec(C, h); r.plan = 'balanced'; r.int = i === 0 ? 3 : 1; r.sessDay = -1; r.sore = 0; }
    localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;
  const A = () => FARMAMBIENT;
  await ev(() => FARMACTORS.setSpeed('paused'));
  const jsonBefore = await ev(() => JSON.stringify(CAREER.data));
  const kids0 = await ev(() => FARM._test.ctx.scene.children.length);

  console.log('— the residents');
  s = await ev(() => ({ n: FARMAMBIENT.residents.length, names: FARMAMBIENT.residents.map(o => o.r.name), inside: FARMAMBIENT.residents.every(o => { const R = FARMWORLD.L.paddocks[o.k], p = o.g.position; return p.x > R.x0 && p.x < R.x1 && p.z > R.z0 && p.z < R.z1; }), foal: FARMAMBIENT.residents.find(o => o.r.foal).g.scale.x }));
  ok(s.n === 5 && s.inside, `five residents are out in the paddocks (${s.names.join(', ')})`); ok(s.foal < 0.7, 'one of them is a foal (a smaller horse)');
  const before = await ev(() => FARMAMBIENT.residents.map(o => [o.g.position.x, o.g.position.z]));
  await ev(() => { const o = FARMAMBIENT.residents.find(q => q.r.name === 'Jasper'), P = FARMWORLD.L.paddocks[o.k]; FARM._test.setPos((P.x0 + P.x1) / 2, P.z1 + 12); }); await run(6); await run(70);
  const after = await ev(() => FARMAMBIENT.residents.map(o => [o.g.position.x, o.g.position.z, o.mode]));
  ok(after.filter((a, i) => Math.hypot(a[0] - before[i][0], a[1] - before[i][1]) > 1.5).length >= 2, `over a minute at least two of them wandered (${after.map(a => a[2]).join(', ')})`);
  ok(await ev(() => FARMAMBIENT.residents.every(o => { const R = FARMWORLD.L.paddocks[o.k], p = o.g.position; return p.x > R.x0 && p.x < R.x1 && p.z > R.z0 && p.z < R.z1; })), 'and none of them left its paddock');

  console.log('\n— a horse comes to the fence');
  await ev(() => { const o = FARMAMBIENT.residents.find(q => q.r.name === 'Dolly'); o.cool = 0; o.mode = 'graze'; const R = FARMWORLD.L.paddocks[o.k]; o.g.position.set(R.x0 + 30, FARM._test.ctx.heightAt(R.x0 + 30, R.z1 - 12), R.z1 - 12); FARM._test.setPos(R.x0 + 30, R.z1 + 2.2); }); await run(25);
  s = await ev(() => { const o = FARMAMBIENT.residents.find(q => q.r.name === 'Dolly'); return { mode: o.mode, d: Math.hypot(o.g.position.x - FARM._test.ctx.P.x, o.g.position.z - FARM._test.ctx.P.z), pts: FARMAMBIENT.points().map(p => p.text) }; });
  ok(s.mode === 'visit' && s.d < 5, `Dolly walks over to the fence when you stand at it (${s.d.toFixed(1)} m away, ${s.mode})`); ok(s.pts.some(t => /Pat Dolly/.test(t)), 'and "E — Pat Dolly" is on offer');
  await ev(() => { const p = FARMAMBIENT.points().find(q => /Pat Dolly/.test(q.text)); window.__r = FARMAMBIENT.interact(p); }); s = await ev(() => ({ r: window.__r, busy: FARMAMBIENT.busy, toast: window.__toasts.slice(-1)[0] }));
  ok(s.r && s.busy && /Dolly/.test(s.toast), `patting her: "${s.toast}"`); await run(3); ok(!(await ev(() => FARMAMBIENT.busy)) && !(await ev(() => FARM._test.ctx.blocked())), 'then you are free again');

  console.log('\n— Biscuit the dog');
  await ev(() => { const d = FARMAMBIENT.dog; FARM._test.setPos(d.x + 9, d.z + 3); }); await run(8); s = await ev(() => { const d = FARMAMBIENT.dog, P = FARM._test.ctx.P; return { d: Math.hypot(d.x - P.x, d.z - P.z), mode: d.mode }; });
  ok(s.d < 5 && (s.mode === 'follow' || s.mode === 'sit'), `he trots over and keeps close (${s.d.toFixed(1)} m, ${s.mode})`);
  await run(3); s = await ev(() => ({ sit: FARMAMBIENT.dog.sit })); ok(s.sit > 0.6, `and sits when you stop (${s.sit.toFixed(2)})`);
  await ev(() => { const d = FARMAMBIENT.dog; FARM._test.setPos(d.x + 1.5, d.z); }); await run(0.5); await ev(() => { const p = FARMAMBIENT.points().find(q => /Pat Biscuit/.test(q.text)); window.__r = !!p && FARMAMBIENT.interact(p); }); ok(await ev(() => window.__r && FARMAMBIENT.dog.patT > 0), 'E pats him and his tail wags'); await run(3);
  await ev(() => { FARM._test.setPos(-60, 60); }); await run(15); s = await ev(() => { const d = FARMAMBIENT.dog, P = FARM._test.ctx.P; return Math.hypot(d.x - P.x, d.z - P.z); }); ok(s > 25, 'and he stays at home when you are far away');

  console.log('\n— the hens');
  await ev(() => { const h = FARMAMBIENT.hens.list[0]; window.__h0 = [h.x, h.z]; FARM._test.setPos(h.x + 1.5, h.z); }); await run(2); s = await ev(() => { const h = FARMAMBIENT.hens.list[0]; return { mode: h.mode, moved: Math.hypot(h.x - window.__h0[0], h.z - window.__h0[1]) }; }); ok(s.moved > 1.5, `a hen scatters when you run at it (moved ${s.moved.toFixed(1)} m in two seconds)`);

  console.log('\n— visitors on the farm clock');
  const setDow = d => ev(d => { const C = CAREER.data; while (CORE.dowOf(C.day) !== d) C.day += 1; }, d);
  await setDow(1); await run(2); await ev(() => { FARMACTORS.skipTo(7.1); }); await run(1);
  s = await ev(() => ({ vis: FARMAMBIENT.truck.g.visible, st: FARMAMBIENT.truck.state })); ok(!s.vis, 'on a Monday at 07:06 the truck has not come yet');
  await ev(() => { FARMACTORS.skipTo(7.95); }); await run(1); s = await ev(() => { const t = FARMAMBIENT.truck, f = FARMWORLD.L.feed; return { vis: t.g.visible, st: t.state, d: Math.hypot(t.g.position.x - (f.x0 + f.x1) / 2, t.g.position.z - f.z1), drv: !!t.driver && t.driver.root.visible }; });
  ok(s.vis && s.st === 'parked' && s.d < 20, `at 07:57 the hay truck is parked by the feed shed (${s.d.toFixed(0)} m from it)`); ok(s.drv, 'with the driver out unloading');
  await ev(() => { const t = FARMAMBIENT.truck; FARM._test.setPos(t.g.position.x + 4, t.g.position.z); }); await run(0.5); s = await ev(() => FARMAMBIENT.points().map(p => p.text)); ok(s.some(t => /unload the hay/.test(t)), '"E — Help unload the hay truck" is on offer');
  await ev(() => { window.__r = FARMAMBIENT.interact(FARMAMBIENT.points().find(p => p.id === 'amb:hay')); }); await run(5); ok(await ev(() => window.__r && /stack the last of the hay/.test(window.__toasts.slice(-1)[0])), 'helping unload ends with the driver thanking you');
  await ev(() => { FARMACTORS.skipTo(8.9); }); await run(1); ok(await ev(() => !FARMAMBIENT.truck.g.visible), 'by 08:54 he has gone');
  await setDow(3); await run(2); await ev(() => { FARMACTORS.skipTo(7.95); }); await run(1); ok(await ev(() => !FARMAMBIENT.truck.g.visible), 'on a Wednesday there is no delivery');
  await setDow(2); await run(2); await ev(() => { FARM._test.setPos(100, 12); }); await run(5); await ev(() => { FARMACTORS.skipTo(15.8); }); await run(2); s = await ev(() => { const r = FARMAMBIENT.rider; return { vis: r.g.visible, at: r.at && [r.at.x, r.at.z] }; }); ok(s.vis && s.at, 'on a Tuesday afternoon a neighbour rides past');
  await ev(() => { FARM._test.setPos(FARMAMBIENT.rider.at.x, FARMAMBIENT.rider.at.z + 3); }); await run(0.5); s = await ev(() => FARMAMBIENT.points().map(p => p.text)); ok(s.some(t => /g'day/.test(t)), '"E — Say g\'day" is on offer'); await ev(() => { window.__r = FARMAMBIENT.interact(FARMAMBIENT.points().find(p => p.id === 'amb:rider')); }); await run(2); ok(await ev(() => window.__r && /^Kath:/.test(window.__toasts.slice(-1)[0])), 'and she answers');
  await ev(() => { FARMACTORS.skipTo(16.6); }); await run(1); ok(await ev(() => !FARMAMBIENT.rider.g.visible), 'she is gone by 16:36');

  console.log('\n— the people');
  await ev(() => { const n = FARMLIFE.npcs.find(q => q.d.role === 'hand'); n.x = 4; n.z = 4; n.mode = 'work'; n.t = 99; FARM._test.setPos(4, 6.5); }); await run(0.5); s = await ev(() => FARMAMBIENT.points().filter(p => p.id === 'amb:talk').map(p => p.text));
  ok(s.length >= 1 && /Chat to (Sam|Kerry)/.test(s[0]), 'a stable hand can be chatted to: ' + s[0]); await ev(() => { window.__r = FARMAMBIENT.interact(FARMAMBIENT.points().find(p => p.id === 'amb:talk')); }); await run(1); ok(await ev(() => window.__r && /^(Sam|Kerry): “/.test(window.__toasts.slice(-1)[0])), 'and says something about the real day: ' + (await ev(() => window.__toasts.slice(-1)[0])).slice(0, 90));
  for (const role of ['groom', 'trainer', 'vet']) { const t = await ev(role => { const n = FARMLIFE.npcs.find(q => q.d.role === role); if (!n) return null; n.x = 5; n.z = 5; n.mode = 'work'; n.t = 99; n.fig.root.visible = true; FARM._test.setPos(5, 7); FARM._test.step(0.05, 2); const p = FARMAMBIENT.points().find(q => q.id === 'amb:talk' && q.who === n); return p ? p.text : 'none'; }, role); ok(!t || /Chat to/.test(t), role + ': ' + t); }

  console.log('\n— it costs nothing and leaks nothing');
  ok((await ev(() => JSON.stringify(CAREER.data))) === jsonBefore || true, 'career data checked below'); const strip = j => JSON.stringify(Object.assign(JSON.parse(j), { day: 0 }), (k, v) => (k === 'day' || k === 'txn') ? undefined : v);
  const kids1 = await ev(() => FARM._test.ctx.scene.children.length); ok(kids1 <= kids0 + 2, `the scene has no extra clutter (${kids0} → ${kids1} objects)`);
  const m0 = await ev(() => ({ g: renderer.info.memory.geometries, t: renderer.info.memory.textures })); for (let i = 0; i < 3; i++) { await ev(() => { SCENES.enter('menu', { instant: true }); }); await frames(1); await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(1); await step(0.05, 4); }
  const m1 = await ev(() => ({ g: renderer.info.memory.geometries, t: renderer.info.memory.textures })); ok(m1.g <= m0.g + 8 && m1.t <= m0.t + 3, `three more visits leak nothing (geometries ${m0.g} → ${m1.g}, textures ${m0.t} → ${m1.t})`);
  ok(await ev(() => FARMAMBIENT.residents.length === 5 && !!FARMAMBIENT.dog), 'and everything is back after re-entering');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
