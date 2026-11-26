// Phase 24 in the real game: a country meeting is run on its town's own layout, with the venue built along that route, the minimap, camera shots and commentary following it.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase24-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' })); await ctx.route(/fonts\./, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_crowd', '"light"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_autoReplay', 'false'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(BASE); await p.waitForFunction(() => typeof startRace === 'function' && typeof VENUES !== 'undefined' && typeof SEASON !== 'undefined');
  console.log('— towns and layouts');
  const map = await p.evaluate(() => { const o = {}; for (const v of SEASON.REGIONAL_VENUES) { const s = SEASON.venueStyle(v); o[v] = s.layout; } return o; });
  ok(Object.values(map).every(l => /^c_(tight|long|pear|dogleg|sweep)$/.test(l)) && new Set(Object.values(map)).size === 5, `all ${Object.keys(map).length} regional venues have one of the five layouts, and all five are used`);
  ok(await p.evaluate(() => SEASON.venueStyle('Moree').layout === 'c_tight' && SEASON.venueStyle('Dubbo').layout === 'c_long' && SEASON.venueStyle('Echuca').layout === 'c_pear' && SEASON.venueStyle('Tamworth').layout === 'c_dogleg' && SEASON.venueStyle('Geelong').layout === 'c_sweep' && SEASON.venueStyle('Randwick') === null), 'a town always has the same layout; the city courses have none');
  console.log('\n— each course in the game');
  const towns = { c_tight: 'Moree', c_long: 'Dubbo', c_pear: 'Echuca', c_dogleg: 'Tamworth', c_sweep: 'Geelong' }, seen = {};
  for (const [lay, town] of Object.entries(towns)) {
    const o = await p.evaluate(([lay, town]) => { startRace(Object.assign(quickCfg(), { distance: 1400, field: 8, track: SEASON.venueStyle(town).layout, career: { id: 'x', name: town + ' Cup', venue: town, venueStyle: SEASON.venueStyle(town), tod: 'midday', wx: 'clear', grade: 'Maiden', tier: 1, official: false, rivalry: {} } }));
      return new Promise(r => setTimeout(() => { const q0 = race.route.point(40, 0, {}), q1 = race.route.point(260, 0, {}); camera.position.set(q0.x - q0.hx * 10 + q0.nx * 6, 7, q0.z - q0.hz * 10 + q0.nz * 6); camera.lookAt(q1.x, 1.5, q1.z); camera.updateMatrixWorld(true); for (let i = 0; i < 3; i++) renderer.render(scene, camera);
        r({ trk: race.trk.id, lap: Math.round(race.trk.lap), vid: VENUES.id, vis: VENUES.current && VENUES.current.visible, generic: VENUE_GENERIC.visible, calls: renderer.info.render.calls, geos: renderer.info.memory.geometries, mm: MM.s > 0 && isFinite(MM.ox) && isFinite(MM.oy), shots: SHOTS.length, route: Math.round(race.route.point(race.dist, 0, {}).x * 0) + 1, note: typeof CAREER !== 'undefined' ? 1 : 0 }); }, 1200)); }, [lay, town]);
    seen[lay] = o; ok(o.trk === lay && o.lap > 1000 && /^country[0-5]_c_/.test(o.vid) && o.vis && !o.generic, `${town}: raced on ${o.trk} (${o.lap} m lap), venue ${o.vid} built along that route, the original oval hidden`);
    ok(o.mm && o.shots >= 16 && o.calls < 120, `${town}: minimap fitted, ${o.shots} camera positions, ${o.calls} draw calls from a fixed pose`);
  }
  console.log('\n— the race itself runs and finishes');
  for (const [lay, town] of Object.entries(towns)) { const r = await p.evaluate(([lay, town]) => { startRace(Object.assign(quickCfg(), { distance: 1200, field: 8, track: lay, career: { id: 'x', name: town + ' Cup', venue: town, venueStyle: SEASON.venueStyle(town), tod: 'midday', wx: 'clear', grade: 'Maiden', tier: 1, official: false, rivalry: {} } })); race.cfg.allBots = true; let n = 0; race.state = 'count'; race.openGates(); while (race.finishOrder.length + race.dnfs.length < race.horses.length && race.clock < 400 && n++ < 90000) race.simStep(SIM_DT); const W = race.finishOrder.slice().sort((a, b) => a.finishTime - b.finishTime)[0]; return { done: race.finishOrder.length + race.dnfs.length === race.horses.length, t: W && W.finishTime }; }, [lay, town]); ok(r.done && r.t > 60 && r.t < 90, `${town}: all eight finish; the winner takes ${r.t && r.t.toFixed(1)} s for 1,200 m`); }
  console.log('\n— the commentary and the calendar');
  ok(await p.evaluate(() => { const b = new COMM.Booth(race, { name: 'x', venue: 'Echuca', official: true }, { speak() {}, cancel() {}, tick() {} }, { player: race.horses[0], log: () => {} }); return b.venue === 'echuca' && b.isTown; }), 'the caller names the town on a course with its own layout');
  ok(await p.evaluate(() => typeof getTrack === 'function' && getTrack('c_long').character.includes('520 m straight') && getTrack('c_tight').character.includes('tight')), 'each layout has a description for the calendar and the departure panel');
  console.log('\n— no cost beyond the course cache');
  const g0 = await p.evaluate(() => renderer.info.memory.geometries); for (let i = 0; i < 2; i++) for (const [lay, town] of Object.entries(towns)) await p.evaluate(([lay, town]) => { startRace(Object.assign(quickCfg(), { distance: 1200, field: 6, track: lay, career: { id: 'x', name: 'C', venue: town, venueStyle: SEASON.venueStyle(town), tod: 'midday', wx: 'clear', grade: 'Maiden', tier: 1, official: false, rivalry: {} } })); }, [lay, town]);
  const g1 = await p.evaluate(() => renderer.info.memory.geometries); ok(g1 <= g0 + 12, `a second visit to every course builds nothing new (geometries ${g0} → ${g1})`);
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
