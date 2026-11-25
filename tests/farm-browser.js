// The farm (Phase 4) in the real game: the property's layout, the right horse in the right box, collision against buildings, fences,
// rails and trees, that every interaction point can be reached on foot, the draw-call / triangle budget, and idle animation only
// where it can be seen.   PORT=8095 node server/index.js ; PORT=8095 node tests/farm-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  if (fs.existsSync(__dirname + '/../public/vendor/three.min.js')) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_sound', 'false'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(BASE); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined');
  const seed = n => p.evaluate(n => { const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0] }, { type: 'grey', coat: '#b7b2a9', face: 'none', socks: [0, 0, 0, 0] }, { type: 'black', coat: '#211915', face: 'snip', socks: [0, 0, 1, 1] }, { type: 'brown', coat: '#5b3a24', face: 'stripe', socks: [1, 0, 0, 0] }];
    const names = ['Bay Majesty', 'Copper Coast', 'Silver Billabong', 'Midnight Comet', 'Wattle Flame'], mk = i => ({ id: 'h' + i, name: names[i], attrs: { top: 70 + i, acc: 68, end: 66, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [{ raceId: 'maiden', name: 'Maiden Plate', place: i + 1, field: 10, dnf: false, t: 1 }] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: Array.from({ length: n }, (_, i) => mk(i)), active: 0, trophies: [], wins: 14, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C)); }, n);
  const frames = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  const enter = async () => { await p.evaluate(() => { CAREER.open(); SCENES.enter('farm', { instant: true }); }); await frames(4); };
  await seed(5); await p.reload(); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined');
  const t0 = Date.now(); await enter(); const enterMs = Date.now() - t0;

  console.log('\n— the property');
  const L = await p.evaluate(() => { const T = FARM._test, w = T.world(); return { built: FARM.built, colliders: T.colliders.length, segs: T.segs.length, points: T.points.map(q => q.id + '@' + Math.round(q.x) + ',' + Math.round(q.z)), stalls: T.stalls.map(s => Math.round(s.x)), layout: FARMWORLD.L, objects: FARM.info().objects, buildMs: FARM.info().buildMs, hasTerrain: typeof w.heightAt === 'function' }; });
  ok(L.built && L.colliders > 25 && L.segs > 200, `the farm is built: ${L.colliders} buildings/props and ${L.segs} fence/rail sections to collide with (entered in ${enterMs} ms, world build ${Math.round(L.buildMs)} ms on this software renderer)`);
  ok(L.stalls.join() === '-8,-4,0,4,8' && L.points.some(x => /^office@/.test(x)) && L.points.some(x => /^travel@/.test(x)), `five boxes at x = ${L.stalls.join(', ')}; interaction points: ${L.points.join(' · ')}`);
  ok(L.layout.paddocks.length === 3 && L.layout.walk.x === 110 && L.layout.walk.z === 80 && L.layout.track.r1 - L.layout.track.r0 >= 8 && L.layout.house.x1 < L.layout.court.x0 - 20 && L.layout.feed.x0 > L.layout.court.x1, 'layout: 3 paddocks, a 220 × 160 m walkable property, the oval, the farmhouse west and the feed shed east of the courtyard');
  const oval = await p.evaluate(() => { const c = FARMWORLD.L.track, per = 2 * 120 + 2 * Math.PI * ((c.r0 + c.r1) / 2); return { mid: Math.round(per), inner: Math.round(240 + 2 * Math.PI * c.r0), outer: Math.round(240 + 2 * Math.PI * c.r1) }; });
  ok(oval.mid >= 360 && oval.mid <= 420, `the exercise oval is ${oval.mid} m round the middle of the track (inner rail ${oval.inner} m, outer rail ${oval.outer} m)`);
  ok(await p.evaluate(() => { const h = FARMWORLD.heightAt; const flat = [[0, -24], [-51, -2], [31, -25], [38, 14], [0, 40], [-40, 27]].every(([x, z]) => Math.abs(h(x, z)) < 0.05); let lo = 1e9, hi = -1e9; for (let x = -100; x <= 100; x += 7) for (let z = -75; z <= 75; z += 7) { const v = h(x, z); lo = Math.min(lo, v); hi = Math.max(hi, v); } return flat && hi - lo > 1.2 && hi - lo < 16; }), 'the ground is level under every building and the oval, and rolls gently elsewhere (not flat terrain)');

  console.log('\n— the five boxes: the right horse, the right way round, the right plaque');
  const H = await p.evaluate(() => { const T = FARM._test, C = CAREER.data, st = CAREER.farmStalls();
    return { n: T.horses.length, plaques: T.plaques.length, rows: T.horses.map((g, i) => ({ x: Math.round(g.position.x * 10) / 10, z: Math.round(g.position.z * 10) / 10, y: Math.round(g.position.y * 100) / 100, ry: Math.round(g.rotation.y * 100) / 100, look: g.userData.look && { type: g.userData.look.type, face: g.userData.look.face, socks: g.userData.look.socks }, name: C.horses[i].name, want: C.horses[i].look })), st: st.map(s => s.name + ' | ' + s.line2 + ' | ' + s.line3 + ' | ' + s.line4) }; });
  ok(H.n === 5 && H.plaques === 5, 'all five boxes hold a horse and a plaque');
  ok(H.rows.every((r, i) => Math.abs(r.x - [-8, -4, 0, 4, 8][i]) < 0.3 && r.z > -25 && r.z < -22.5 && Math.abs(Math.abs(r.ry) - Math.PI / 2) < 0.2 && r.ry < 0 && r.y >= 0.1 && r.y <= 0.2), `each horse stands in its own box (${H.rows.map(r => r.x + ',' + r.z).join(' · ')}), head to the door, on the straw`);
  ok(H.rows.every(r => r.look && r.look.type === r.want.type && r.look.face === r.want.face && JSON.stringify(r.look.socks) === JSON.stringify(r.want.socks)), 'every box shows the horse as created: coat type, face marking and socks match the saved career horse (the same model the race uses)');
  ok(/^Bay Majesty \| 3yo · Fit · Rtg \d\d \| Form 1 \| Next: Maiden Plate · \d+ \w{3} \d{4}$/.test(H.st[0]) && H.st[1].endsWith('| ') && H.st[4].startsWith('Wattle Flame |'), 'plaques carry name, age, condition, rating, recent form, and the next race (date) for the active horse: ' + H.st[0]);
  // fewer horses: the other boxes are visibly vacant (and say why)
  await p.evaluate(() => SCENES.enter('career', { instant: true })); await seed(2); await p.evaluate(() => { CAREER.open(); }); await enter();
  const V = await p.evaluate(() => ({ h: FARM._test.horses.length, p: FARM._test.plaques.length, st: CAREER.farmStalls().length, slots: CAREER.farmStalls().slots }));
  ok(V.h === 2 && V.p === 5 && V.st === 2, `with two horses, three boxes are empty but still have plaques (${V.h} horses, ${V.p} plaques)`);
  await p.evaluate(() => SCENES.enter('career', { instant: true })); await seed(5); await p.evaluate(() => { CAREER.open(); }); await enter();

  console.log('\n— solid things are solid');
  // walk straight at an obstacle in small steps; the farm's own collision resolver (no rendering) decides where the walker ends up
  const probe = (name, sx, sz, dx, dz, steps) => p.evaluate(({ sx, sz, dx, dz, steps }) => { const T = FARM._test; let x = sx, z = sz; for (let i = 0; i < steps; i++) { const r = T.settle(x + dx * 0.12, z + dz * 0.12); x = r.x; z = r.z; } return { x, z }; }, { sx, sz, dx, dz, steps });
  const wall = await probe('stable', 0, -17, 0, -1, 80); ok(wall.z > -22.0, `walking at the stable block from the courtyard stops at the verandah (z ${wall.z.toFixed(2)}; wall at -22.2)`);
  const house = await probe('house', -38, -2, -1, 0, 80); ok(house.x > -45.2, `walking at the farmhouse stops at its wall (x ${house.x.toFixed(2)})`);
  const picket = await probe('picket', -50, 14, 0, -1, 70); ok(picket.z > 10.05, `the garden's picket fence stops you (z ${picket.z.toFixed(2)}; fence at 10)`);
  const pad = await probe('paddock', 60, -18, 0, -1, 70); ok(pad.z >= -21.45 && pad.z < -21.0, `a paddock fence stops you one body-width short (z ${pad.z.toFixed(2)}; fence at -22)`);
  const gatep = await probe('gate', 51.8, -18, 0, -1, 60); ok(gatep.z >= -21.45 && gatep.z < -21.0, `and so does a closed paddock gate (z ${gatep.z.toFixed(2)})`);
  const rail = await probe('rail', 20, 36, 0, -1, 40); ok(rail.z > 32.4 && rail.z < 32.8, `the oval's inner rail stops you (z ${rail.z.toFixed(2)}; rail at 32)`);
  const shed = await probe('shed', 31, -10, 0, -1, 80); ok(shed.z > -18.3, `the feed shed is solid (z ${shed.z.toFixed(2)})`);
  const flt = await probe('float', 30, 14, 1, 0, 70); ok(flt.x < 33.6, `so is the horse float (x ${flt.x.toFixed(2)})`);
  const edge = await probe('edge', 105, 4, 1, 0, 80); ok(edge.x <= 110.01, `and the property boundary holds (x ${edge.x.toFixed(2)})`);
  const inside = await p.evaluate(() => { const T = FARM._test; let n = 0, stuck = 0; for (const c of T.colliders) { if (c.x1 - c.x0 < 0.4 || c.z1 - c.z0 < 0.4) continue; n++; const r = T.settle((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2); if (r.x > c.x0 + 0.05 && r.x < c.x1 - 0.05 && r.z > c.z0 + 0.05 && r.z < c.z1 - 0.05) stuck++; } return { n, stuck }; });
  ok(inside.n > 15 && inside.stuck === 0, `dropped into the middle of ${inside.n} different buildings and props, the walker is pushed out of every one`);

  console.log('\n— everything you need can be reached on foot');
  const R = await p.evaluate(() => {
    const T = FARM._test, cols = T.colliders, segs = T.segs, PR = 0.45, X0 = -110, Z0 = -80, S = 0.5, NX = 441, NZ = 321, blocked = new Uint8Array(NX * NZ), idx = (i, j) => j * NX + i;
    for (const c of cols) for (let i = Math.max(0, Math.floor((c.x0 - PR - X0) / S)); i <= Math.min(NX - 1, Math.ceil((c.x1 + PR - X0) / S)); i++) for (let j = Math.max(0, Math.floor((c.z0 - PR - Z0) / S)); j <= Math.min(NZ - 1, Math.ceil((c.z1 + PR - Z0) / S)); j++) { const x = X0 + i * S, z = Z0 + j * S, dx = Math.max(c.x0 - x, 0, x - c.x1), dz = Math.max(c.z0 - z, 0, z - c.z1); if (Math.hypot(dx, dz) < PR - 0.02) blocked[idx(i, j)] = 1; }
    for (const s of segs) { const R = s.r + PR - 0.02, ex = Math.abs(s.x1 - s.x0), ez = Math.abs(s.z1 - s.z0); for (let i = Math.max(0, Math.floor((Math.min(s.x0, s.x1) - R - X0) / S)); i <= Math.min(NX - 1, Math.ceil((Math.max(s.x0, s.x1) + R - X0) / S)); i++) for (let j = Math.max(0, Math.floor((Math.min(s.z0, s.z1) - R - Z0) / S)); j <= Math.min(NZ - 1, Math.ceil((Math.max(s.z0, s.z1) + R - Z0) / S)); j++) {
      const x = X0 + i * S, z = Z0 + j * S, dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz || 1e-6, t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / l2)); if (Math.hypot(x - s.x0 - dx * t, z - s.z0 - dz * t) < R) blocked[idx(i, j)] = 1; } }
    const cell = (x, z) => [Math.round((x - X0) / S), Math.round((z - Z0) / S)], seen = new Uint8Array(NX * NZ), q = [], [si, sj] = cell(0, 4.5); seen[idx(si, sj)] = 1; q.push(si, sj);
    for (let h = 0; h < q.length; h += 2) { const i = q[h], j = q[h + 1]; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + a, nj = j + b; if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ || seen[idx(ni, nj)] || blocked[idx(ni, nj)]) continue; seen[idx(ni, nj)] = 1; q.push(ni, nj); } }
    const reach = (x, z, r) => { r = r || 0.6; const [ci, cj] = cell(x, z); for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) if (i >= 0 && j >= 0 && i < NX && j < NZ && seen[idx(i, j)] && Math.hypot(i - ci, j - cj) * S <= r + 1.2) return true; return false; };
    const pts = T.points, want = { 'the farmhouse door': [pts.find(p => p.id === 'office').x, pts.find(p => p.id === 'office').z], 'the horse float': [pts.find(p => p.id === 'travel').x, pts.find(p => p.id === 'travel').z], 'the stable verandah (box 1)': [-8, -20.4], 'the stable verandah (box 5)': [8, -20.4], 'the tack room door': [11.5, -20.6], 'the wash bay': [-12.3, -20.6],
      'the feed shed doors': [29, -13.5], 'the vet bay': [29.5, 3.5], 'the courtyard trough': [9.5, 3.4], 'the garden gate': [-36, 0], 'the oval gate': [-6.5, 21.5], 'the track itself': [-6.5, 27.5], 'the gate-practice barriers': [-36, 28], 'the east paddock gate': [51.8, -20], 'the north paddock gate': [0, -38], 'the west paddock gate': [-45.8, -24], 'the entrance gate': [108, 4], 'the timing hut': [-19, 21.4] };
    const out = {}; for (const k in want) out[k] = reach(want[k][0], want[k][1]);
    const no = { 'inside the stable block': [0, -25], 'inside the farmhouse': [-51, -2], 'inside a paddock (gates are closed)': [70, -45], 'inside the oval (no gap in the inner rail)': [0, 50] }; const un = {}; for (const k in no) un[k] = !reach(no[k][0], no[k][1], 0.2);
    let free = 0; for (let k = 0; k < seen.length; k++) free += seen[k]; return { out, un, free, total: NX * NZ };
  });
  const bad = Object.entries(R.out).filter(([, v]) => !v).map(([k]) => k);
  ok(bad.length === 0, `from the starting spot the walker can reach all ${Object.keys(R.out).length} places a player needs (${Object.keys(R.out).slice(0, 6).join(', ')} …)` + (bad.length ? ' — UNREACHABLE: ' + bad.join(', ') : ''));
  ok(Object.values(R.un).every(Boolean), `and cannot get into places that should be closed (${Object.keys(R.un).join('; ')})`);
  ok(R.free / R.total > 0.55, `${(R.free / R.total * 100).toFixed(0)}% of the property is open to walk on`);

  console.log('\n— interaction points work');
  await p.evaluate(() => FARM._test.setPos(FARM._test.TRAVEL.x, FARM._test.TRAVEL.z)); await frames(3);
  ok((await p.evaluate(() => FARM.info())).prompt === 'E — Horse float (book a race on the farmhouse calendar first)', 'at the float with nothing booked: "E — Horse float (book a race on the farmhouse calendar first)"');
  const of = await p.evaluate(() => { const o = FARM._test.points.find(q => q.id === 'office'); FARM._test.setPos(o.x, o.z); return o.text; }); await frames(3);
  ok((await p.evaluate(() => FARM.info())).prompt === of && /farmhouse/i.test(of), `at the farmhouse door: "${of}"`);
  await p.keyboard.press('e'); await frames(4); await p.evaluate(() => FARM._test.skipFade()); await frames(3);
  ok(await p.evaluate(() => FARM.active && FARM.info().place === 'in' && ui.state === 'farm'), 'E at the farmhouse door goes inside (the interior is its own room; the Office is the desk in it)');
  await p.evaluate(() => { const o = FARM._test.points.find(q => q.id === 'ledger'); FARM._test.setPos(o.x, o.z); }); await frames(3);
  await p.keyboard.press('e'); await frames(4);
  ok(await p.evaluate(() => ui.state === 'c_office' && SCENES.scene === 'office' && !FARM.active && FARM.info().listeners === 0), 'E at the desk opens the Office; the farm hands over cleanly (scene "office", listeners removed)');
  await p.evaluate(() => { document.getElementById('ofBack').click(); }); await p.waitForFunction(() => ui.state === 'farm' && FARM.active, null, { timeout: 30000 });
  ok(await p.evaluate(() => ui.state === 'farm'), 'and Back from the Office returns to the farm');
  await enter();

  console.log('\n— the budget (measured, software renderer, 960 × 540)');
  const stats = {}; for (const v of ['courtyard', 'stalls', 'farmhouse', 'paddock', 'training', 'overview', 'float']) { await p.evaluate(v => FARM.view(v), v); await frames(4); stats[v] = await p.evaluate(() => FARM.stats()); }
  await p.evaluate(() => FARM.view(null)); await frames(4); stats.walking = await p.evaluate(() => FARM.stats());
  const worstCalls = Math.max(...Object.values(stats).map(s => s.calls)), worstTris = Math.max(...Object.values(stats).map(s => s.tris));
  ok(worstCalls <= 210 && worstTris <= 500000, `across ${Object.keys(stats).length} camera positions: at most ${worstCalls} draw calls (budget 210 since Phase 16, leaving about 40 for walking horses and staff) and ${(worstTris / 1000).toFixed(0)}k triangles (budget 500k) — ` + Object.entries(stats).map(([k, s]) => `${k} ${s.calls}/${(s.tris / 1000).toFixed(0)}k`).join(' · '));
  ok(stats.overview.buildMeshes < 120 && stats.overview.instances > 800, `the whole property is ${stats.overview.buildMeshes} merged meshes plus ${stats.overview.instances} instanced trees, shrubs, tufts and rocks`);

  console.log('\n— nothing is animated that can\'t be seen');
  const anim = await p.evaluate(async () => { const orig = window.animateHorse; let n = 0; window.animateHorse = function (g) { if (!(g && g.userData && g.userData.amb)) n++; return orig.apply(this, arguments); };
    const fr = k => new Promise(r => { let i = 0; const f = () => ++i >= k ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }); const o = {};
    FARM.view('stalls'); await fr(1); n = 0; await fr(4); o.near = n; FARM.view('overview'); await fr(1); n = 0; await fr(4); o.far = n; FARM.view('training'); await fr(1); n = 0; await fr(4); o.training = n; window.animateHorse = orig; return o; });
  ok(anim.near >= 15 && anim.far === 0 && anim.training === 0, `idle animation runs for the five horses when the camera is near (${anim.near} updates in 4 frames) and not at all when the camera is far (${anim.far}) or looking at the oval (${anim.training})`);

  console.log('\n— memory: the bigger farm still comes and goes cleanly');
  await p.evaluate(() => { SCENES.enter('career', { instant: true }); SCENES.enter('farm', { instant: true }); }); await frames(3);
  const m0 = await p.evaluate(() => SCENES.snapshot());
  for (let i = 0; i < 4; i++) { await p.evaluate(() => { SCENES.enter('career', { instant: true }); SCENES.enter('farm', { instant: true }); }); await frames(2); }
  const m1 = await p.evaluate(() => SCENES.snapshot());
  ok(m1.geo - m0.geo <= 4 && m1.tex - m0.tex <= 4 && m1.farm.objects === m0.farm.objects, `4 more visits: geometries ${m0.geo} → ${m1.geo}, textures ${m0.tex} → ${m1.tex}, farm objects ${m0.farm.objects} → ${m1.farm.objects}`);
  const dz = await p.evaluate(() => { SCENES.enter('career', { instant: true }); const g0 = SCENES.snapshot(), ok1 = FARM.dispose(); const g1 = SCENES.snapshot(); SCENES.enter('farm', { instant: true }); return { ok1, g0: g0.geo + '/' + g0.tex, g1: g1.geo + '/' + g1.tex, geoDrop: g0.geo - g1.geo, texDrop: g0.tex - g1.tex }; });
  ok(dz.ok1 && dz.geoDrop > 100 && dz.texDrop >= 15, `FARM.dispose() really frees the property (geometries/textures ${dz.g0} → ${dz.g1}) and the next visit rebuilds it`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
