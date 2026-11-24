// Phase 12 in the real game: time of day and weather in the race and on the farm — looks, caching, the calendar, a Quick Race unchanged.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase12-browser.js
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

  const lum = () => ev(async () => { const F = race.trk.finishD, a = race.trk.point(F - 150, race.trk.W + 28, {}), bb = race.trk.point(F - 55, race.trk.W + 8, {}), cam = camera.clone(); cam.position.set(a.x, 7, a.z); cam.lookAt(bb.x, 3, bb.z); cam.fov = 55; cam.updateProjectionMatrix(); const r0 = window.__rr || renderer.render.bind(renderer); r0(scene, cam); const url = renderer.domElement.toDataURL(); const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, img.width, img.height).data; let t = 0, n = 0; for (let i = 0; i < d.length; i += 16) { t += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return t / n; });
  const race12 = (tod, wx) => ev(([tod, wx]) => { startRace(Object.assign(quickCfg(), { distance: 1200, field: 8, career: { id: 'x', name: 'Test Cup', venue: 'Moree', venueStyle: SEASON.venueStyle('Moree'), tod, wx, grade: 'Maiden', tier: 1, official: true, rivalry: {} } })); return new Promise(r => setTimeout(r, 1200)); }, [tod, wx]);
  const info = () => ev(() => ({ tod: GFX.atmo.tod, wx: GFX.atmo.wx, sun: +sun.intensity.toFixed(2), expo: +renderer.toneMappingExposure.toFixed(3), fogFar: Math.round(scene.fog.far), rain: !!(GFX.atmosphere.rain && GFX.atmosphere.rain.visible), env: GFX.atmosphere.env.size, calls: renderer.info.render.calls, tex: renderer.info.memory.textures, geo: renderer.info.memory.geometries, sunY: +sun.position.y.toFixed(0), key: GFX.atmo.key }));
  await ev(() => { renderer.render = window.__rr; });   // real rendering for these checks

  console.log('\n— a Quick Race is unchanged');
  await ev(() => { startRace(Object.assign(quickCfg(), { distance: 1200, field: 8 })); return new Promise(r => setTimeout(r, 1200)); }); s = await info();
  ok(s.tod === 'afternoon' && s.wx === 'clear' && s.sun === 2.3 && s.expo === 0.82 && !s.rain, `no calendar event → the original afternoon (sun ${s.sun}, exposure ${s.expo})`);

  console.log('\n— every time of day looks different');
  const L = {}, I = {}; for (const t of ['early_morning', 'mid_morning', 'midday', 'afternoon', 'late_afternoon', 'golden_hour', 'dusk', 'evening']) { await race12(t, 'clear'); I[t] = await info(); L[t] = await lum(); }
  ok(Object.keys(I).every(t => I[t].tod === t && I[t].wx === 'clear' && !I[t].rain), 'the race applies the time of day it is given: ' + Object.keys(I).map(t => t.replace('_', ' ')).join(', '));
  ok(I.midday.sun > I.late_afternoon.sun && I.late_afternoon.sun > I.golden_hour.sun && I.golden_hour.sun > I.dusk.sun, `sunlight weakens through the afternoon (${I.midday.sun} → ${I.late_afternoon.sun} → ${I.golden_hour.sun} → ${I.dusk.sun})`);
  ok(I.golden_hour.sunY < I.midday.sunY * 0.5, `the sun (and so every shadow) is lower at the golden hour (${I.golden_hour.sunY} vs ${I.midday.sunY})`);
  ok(L.midday > L.golden_hour * 1.05 && L.golden_hour > L.dusk * 1.1, `the screen is brightest at midday and darkens to dusk (mean luminance ${L.midday.toFixed(0)} · ${L.golden_hour.toFixed(0)} · ${L.dusk.toFixed(0)})`);
  ok(I.evening.sun > 1 && L.evening > 20, `the lit evening is floodlit, not black (sun ${I.evening.sun}, luminance ${L.evening.toFixed(0)})`);

  console.log('\n— weather');
  const W = {}, WL = {}; for (const w of ['clear', 'partly_cloudy', 'overcast', 'light_rain', 'rain']) { await race12('midday', w); W[w] = await info(); WL[w] = await lum(); }
  ok(W.clear.sun > W.overcast.sun && W.overcast.sun > W.rain.sun && WL.clear > WL.rain * 1.1, `rain darkens the day (sun ${W.clear.sun} → ${W.overcast.sun} → ${W.rain.sun}; luminance ${WL.clear.toFixed(0)} → ${WL.rain.toFixed(0)})`);
  ok(W.clear.fogFar > W.overcast.fogFar && W.overcast.fogFar > W.rain.fogFar, `and shortens the view (${W.clear.fogFar} → ${W.overcast.fogFar} → ${W.rain.fogFar} m)`);
  ok(!W.clear.rain && !W.overcast.rain && W.light_rain.rain && W.rain.rain, 'rain falls only in the two rain kinds');
  ok(W.rain.calls <= W.clear.calls + 2, `the rain costs one draw call (${W.clear.calls} → ${W.rain.calls})`);
  await race12('midday', 'clear'); s = await info(); ok(!s.rain, 'when the weather clears the rain stops');

  console.log('\n— the environment maps are cached and the memory is steady');
  const t0 = await info(); for (let i = 0; i < 24; i++) await race12(['early_morning', 'midday', 'golden_hour', 'dusk', 'midday', 'afternoon'][i % 6], ['clear', 'overcast', 'rain', 'clear'][i % 4]); const t1 = await info();
  ok(t1.env <= 5, `at most 5 environment maps are kept (${t1.env})`); ok(t1.tex <= t0.tex + 12 && t1.geo <= t0.geo + 30, `24 more atmosphere changes leak nothing (textures ${t0.tex} → ${t1.tex}, geometries ${t0.geo} → ${t1.geo})`);
  s = await ev(() => { const t = performance.now(); GFX.setAtmosphere(ATMO.params('golden_hour', 'overcast')); GFX.setAtmosphere(ATMO.params('golden_hour', 'overcast')); return performance.now() - t; }); ok(s < 400, `switching to a look already seen is quick (${s.toFixed(0)} ms for two switches)`);

  console.log('\n— the calendar says what the race looks like');
  await ev(() => { const C = CAREER.data; C.wins = 5; CORE.apply(C, 'test:fund', 50000, 'gift', 'x'); CORE.advance(C, 8, { force: true }); C.season.rounds[0].st = 'done'; C.season.cur = 1; });
  const booked = await ev(() => { const C = CAREER.data; const evs = C.cal.events.filter(e => e.kind === 'optional' && SEASON.BY_ID[e.ref].regional && e.day >= C.day).sort((a, b) => a.day - b.day); for (const e of evs) { const r = CAREER.book(e.id, C.horses[0].id); if (r.ok) return { ok: true, eid: e.id, tod: e.tod, wx: e.forecast.weather, venue: e.venue, label: CORE.TOD_LABEL[e.tod], wlabel: CORE.WX_LABEL[e.forecast.weather] }; } return { ok: false }; });
  ok(booked.ok, `a regional race is booked (${booked.venue}: ${booked.label}, ${booked.wlabel})`);
  s = await ev(eid => { const cd = CAREER.calendarData(0), it = cd.list.find(x => x.eid === eid); return it ? { tod: it.tod, weather: it.weather } : null; }, booked.eid); ok(s && s.tod === booked.label && s.weather === booked.wlabel, `the calendar shows "${s && s.tod} · ${s && s.weather}" — the same as the stored event`);
  await ev(() => { CAREER.startBooked(); }); await p.waitForFunction(() => typeof race !== 'undefined' && race && race.state && race.cfg.career, null, { timeout: 60000 }); await frames(6); await p.waitForTimeout(800);
  s = await ev(() => ({ cfg: { tod: race.cfg.career.tod, wx: race.cfg.career.wx }, now: { tod: GFX.atmo.tod, wx: GFX.atmo.wx } })); ok(s.cfg.tod === booked.tod && s.cfg.wx === booked.wx && s.now.tod === booked.tod && s.now.wx === booked.wx, `the race you booked is run exactly as forecast: ${s.now.tod} / ${s.now.wx}`);

  console.log('\n— the farm follows the same sky');
  await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(4); await ev(() => { renderer.render = () => {}; }); await step(0.05, 6);
  s = await ev(() => { const a = FARM._test.atmo('golden_hour', 'clear'); FARM._test.step(0.05, 3); return { hud: document.getElementById('farmWx').textContent, sun: +FARM._test.ctx.sunLight.intensity.toFixed(2), tod: a.tod }; });
  ok(/Golden hour/.test(s.hud) && /Clear/.test(s.hud), `the farm HUD names the day: "${s.hud}"`);
  const fa = await ev(() => { const o = {}; for (const t of ['midday', 'golden_hour', 'dusk']) { FARM._test.atmo(t, 'clear'); o[t] = +FARM._test.ctx.sunLight.intensity.toFixed(2); } FARM._test.atmo('midday', 'rain'); o.rain = +FARM._test.ctx.sunLight.intensity.toFixed(2); o.rainMesh = FARM._test.ctx.scene.children.some(c => c.isLineSegments && c.userData.N && c.visible); FARM._test.atmo('midday', 'clear'); o.rainOff = !FARM._test.ctx.scene.children.some(c => c.isLineSegments && c.userData.N && c.visible); return o; });
  ok(fa.midday > fa.golden_hour && fa.golden_hour > fa.dusk && fa.rain < fa.midday * 0.3, `the farm is lit by the same day: ${fa.midday} · ${fa.golden_hour} · ${fa.dusk}; rain ${fa.rain}`); ok(fa.rainMesh && fa.rainOff, 'rain falls on the farm on a wet day and stops on a dry one');
  s = await ev(() => { FARM._test.atmo(null); const C = CAREER.data; const seen = new Set(); for (let d = 0; d < 40; d++) { C.day = 20 + d; FARM._test.step(0.05, 2); const a = FARM._test.atmoNow; seen.add(a.tod + '/' + a.wx); } return { n: seen.size }; }); ok(s.n >= 8, `ordinary farm days differ: ${s.n} different looks in 40 days`);
  s = await ev(() => { const C = CAREER.data, b = C.booking; if (!b) return null; const e = C.cal.events.find(x => x.id === b.eid); C.day = e.day; FARM._test.step(0.05, 3); const a = FARM._test.atmoNow; return { same: a.tod === e.tod && a.wx === e.forecast.weather, e: e.tod }; }); ok(!s || s.same, 'on race day the farm shows the booked race\'s own time of day and weather');
  await ev(() => { FARM._test.atmo('dusk', 'clear'); SCENES.enter('career'); }); await frames(3); s = await ev(() => ({ expo: +renderer.toneMappingExposure.toFixed(3), want: +GFX.atmo.expo.toFixed(3) })); ok(Math.abs(s.expo - s.want) < 0.01, 'leaving the farm gives the race scene back its own exposure (' + s.expo + ')');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
