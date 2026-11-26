// Phase 11 in the real game: the regional circuit on the dated calendar, eligibility, the country venue look and neutral commentary.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase11-browser.js
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
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer);  window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;

  const frames2 = n => frames(n);
  const regEv = id => ev(id => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'optional' && x.ref === id); return e && { id: e.id, day: e.day, venue: e.venue }; }, id);

  console.log('\n— regional races are on the dated calendar and bookable');
  s = await ev(() => { const C = CAREER.data, opt = C.cal.events.filter(e => e.kind === 'optional'), reg = SEASON.OPTIONAL.filter(m => m.regional).map(m => m.id); return { total: opt.length, regional: opt.filter(e => reg.includes(e.ref)).length, towns: new Set(opt.filter(e => reg.includes(e.ref)).map(e => e.venue)).size }; });
  ok(s.regional >= 39 && s.towns >= 13, `the season's calendar holds ${s.regional} regional meetings at ${s.towns} country towns (${s.total} open meetings in all)`);
  s = await ev(() => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'optional' && x.ref === 'g_picnic'); const h = C.horses[0]; return { ev: !!e, info: CAREER.calendarData && !!CAREER.calendarData(), h: h.name }; }); ok(s.ev, 'the Picnic Maiden is on the calendar');
  // eligibility is explained: Bay Majesty is a young maiden; Copper Coast has won
  s = await ev(() => { const C = CAREER.data; C.horses[1].wins = 4; const e = C.cal.events.find(x => x.kind === 'optional' && x.ref === 'g_picnic'), a = SEASON.eligibility(C.horses[0], SEASON.BY_ID.g_picnic), b = SEASON.eligibility(C.horses[1], SEASON.BY_ID.g_picnic); return { a: a.ok, b: b.ok, why: b.reqs.filter(r => !r.ok).map(r => r.label + ' — ' + r.detail).join('; ') }; });
  ok(s.a && !s.b && /Maiden/.test(s.why), `a maiden can enter the Picnic Maiden; a winner can't: "${s.why}"`);

  console.log('\n— running a regional race: the country look and neutral commentary');
  await ev(() => { const C = CAREER.data; C.horses[1].wins = 0; C.cash += 50000; });
  await ev(() => { const C = CAREER.data; CORE.advance(C, 8, { force: true }); C.season.rounds[0].st = 'done'; C.season.cur = 1; });   // the first championship round is over; the next one is weeks away, so the open meetings before it can be booked
  s = await ev(() => { const C = CAREER.data, reg = SEASON.OPTIONAL.filter(m => m.regional && !(m.req || []).length || ['g_picnic', 'g_trial', 'g_bm58', 'g_threeyo'].includes(m.id)).map(m => m.id); const evs = C.cal.events.filter(e => e.kind === 'optional' && reg.includes(e.ref) && e.day >= C.day).sort((a, b) => a.day - b.day); for (const e of evs) { const r = CAREER.book(e.id, C.horses[0].id); if (r.ok) return { ok: true, ref: e.ref, venue: e.venue, day: e.day - C.day }; } return { ok: false, tried: evs.length }; });
  ok(s.ok, `booking a regional race works (${s.ref} at ${s.venue}, ${s.day} days away)`); const town = s.venue;
  await ev(() => { CAREER.startBooked(); }); await p.waitForFunction(() => typeof race !== 'undefined' && race && race.state, null, { timeout: 60000 }); await frames(6); await p.waitForTimeout(1500);
  s = await ev(() => ({ id: VENUES.id, generic: VENUE_GENERIC.visible, venue: race.cfg.career.venue, style: race.cfg.career.venueStyle, booth: typeof COMM !== 'undefined' ? 1 : 0, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }));
  ok(/^country[0-5](_c_[a-z]+)?$/.test(s.id) && !s.generic && s.style && s.style.style === 'country' && s.style.town === town, `the race is run at the country venue "${s.id}" (the Furlong Park scenery is hidden) for ${s.venue}`);
  ok(s.calls < 300, `and it is cheap to draw: ${s.calls} draw calls, ${(s.tris / 1000).toFixed(0)}k triangles`);
  s = await ev(() => { const g = VENUES.current; let meshes = 0; g.traverse(o => { if (o.isMesh || o.isInstancedMesh) meshes++; }); return { n: meshes, hasStand: !!g.getObjectByName('country stand'), crowd: !!g.userData.crowd, finish: (g.userData.finishNear || []).length }; });
  ok(s.hasStand && s.finish > 0 && s.n < 400, `a stand, rails, trees and a modest crowd (${s.n} meshes) — a fraction of a flagship`);
  s = await ev(tn => { const f = race; const ls = []; try { const b = new COMM.Booth(race, { name: 'x', venue: tn, official: true }, { speak() {}, cancel() {}, tick() {} }, { player: race.horses[0], log: () => {} }); return { v: b.venue }; } catch (e) { return { err: String(e) }; } }, town);
  ok(s.v === town.toLowerCase().replace(/[^a-z]+/g, '_') || s.v === 'neutral', 'the commentator names a regional town (Phase 21) or treats another country venue as neutral — never "Furlong Park" (' + (s.v || s.err) + ')');
  // a second regional course gets the other look; a city course goes back to the original scenery

  s = await ev(() => { startRace(Object.assign(quickCfg(), { distance: 1200, field: 6, career: { id: 'x', name: 'Test', venue: 'Echuca', venueStyle: SEASON.venueStyle('Echuca'), grade: 'Maiden', tier: 1, official: false, rivalry: {} } })); return new Promise(r => setTimeout(() => r({ id: VENUES.id }), 1500)); });
  ok(/^country[0-5](_c_[a-z]+)?$/.test(s.id), 'another town also uses a country look (' + s.id + ')');
  const first = s.id; s = await ev(() => { startRace(Object.assign(quickCfg(), { distance: 1200, field: 6, career: { id: 'y', name: 'Warwick', venue: 'Warwick Farm', venueStyle: SEASON.venueStyle('Warwick Farm'), grade: 'Maiden', tier: 1, official: false, rivalry: {} } })); return new Promise(r => setTimeout(() => r({ id: VENUES.id, gen: VENUE_GENERIC.visible }), 1500)); });
  ok(s.id == null && s.gen, 'a city course keeps the original venue (' + first + ' → generic)');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
