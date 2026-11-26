// Phase 24: the five regional (country) course layouts: geometry, route distances, curvature, and AI races on every one, run with the full set of race incidents.
//   node tests/country-tracks.js [racesPerCourse=2]
const path = require('path');
const sim = require(path.join(__dirname, '..', 'public', 'sim.js'));
const N = +(process.argv[2] || 2);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const IDS = ['c_tight', 'c_long', 'c_pear', 'c_dogleg', 'c_sweep'], G = sim.getTrack('generic');
const DISTS = [1000, 1100, 1200, 1400, 1600, 2000, 2400];
const summary = {};
for (const id of IDS) {
  const T = sim.getTrack(id); console.log(`\n— ${id}: ${T.name}`);
  ok(T.country === true && T.analytic === false && T.character.length > 10, `a country table track with a description ("${T.character}")`);
  const a = T.point(0, 0, {}), b = T.point(T.lap - 1e-6, 0, {}); ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01 && Math.abs(a.hx - b.hx) < 1e-4 && Math.abs(a.hz - b.hz) < 1e-4, `the ${T.lap.toFixed(0)} m loop closes smoothly (position and heading)`);
  { let area = 0, prev = T.point(0, 0, {}); for (let s = 5; s <= T.lap; s += 5) { const p = T.point(s, 0, {}); area += prev.x * p.z - p.x * prev.z; prev = p; } ok((area > 0) === T.cw, `${T.cw ? 'clockwise (right-handed)' : 'anticlockwise (left-handed)'} on the map`); }
  { let mj = 0; for (let s = 0; s < T.lap; s += 0.5) mj = Math.max(mj, Math.abs(T.kIn(s + 0.5) - T.kIn(s))); ok(mj < 2e-4, `curvature changes smoothly (largest step ${mj.toExponential(1)} per 0.5 m)`); }
  let mk = 0; for (let s = 0; s < T.lap; s += 0.5) mk = Math.max(mk, T.kIn(s)); const minR = 1 / mk;
  ok(Math.abs(T.homeStraight - (T.lap - T.marks.home)) < 0.5, `home straight ${T.homeStraight} m (${(T.lap - T.marks.home).toFixed(1)} m from the last turn to the post)`);
  ok(T.marks.homeTurn != null && T.marks.topTurn != null && T.marks.runout_end != null, 'named turns and run-out are marked');
  summary[id] = { lap: T.lap, home: T.homeStraight, minR, W: T.W };
  for (const d of DISTS) {
    const rt = T.route(d); let len = 0; const p = {}, q = {}; rt.point(0, 0, q);
    for (let s = 0.5; s <= d + 1e-9; s += 0.5) { rt.point(s, 0, p); len += Math.hypot(p.x - q.x, p.z - q.z); q.x = p.x; q.z = p.z; }
    const post = T.point(0, 0, {}), end = rt.point(d, 0, {});
    ok(Math.abs(len - d) < 0.6 && Math.hypot(end.x - post.x, end.z - post.z) < 0.05 && !rt.inChute(0) && !rt.straightRace, `${d} m: the route measures ${len.toFixed(1)} m, ends on the winning post, starts on the course proper`);
  }
  { const rt = T.route(1400), s0 = rt.point(0, sim.laneOff(0), {}), s11 = rt.point(0, sim.laneOff(11), {}); ok(Math.abs((s11.x - s0.x) * s0.hx + (s11.z - s0.z) * s0.hz) < 1e-6, 'starting gates sit square across the direction of racing'); }
  { const rt = T.route(2400); let s0 = 0, s8 = 0; for (let p = 0; p < 2400; p += 0.5) { s0 += 0.5 / rt.scale(p, sim.laneOff(0)); s8 += 0.5 / rt.scale(p, sim.laneOff(8)); } let turn = 0; for (let p = 0; p < 2400; p += 0.5) turn += rt.kIn(p + 0.25) * 0.5; const expect = turn * (sim.laneOff(8) - sim.laneOff(0)); ok(Math.abs((s8 - s0) - expect) < 0.5, `lane 9 covers ${(s8 - s0).toFixed(1)} m more than the rail over 2400 m (the ${(turn * 180 / Math.PI).toFixed(0)}° turned × the extra offset)`); }
}
console.log('\n— the courses really differ');
{ const laps = IDS.map(i => summary[i].lap), homes = IDS.map(i => summary[i].home), radii = IDS.map(i => summary[i].minR);
  ok(new Set(laps.map(x => Math.round(x))).size === 5 && new Set(homes).size === 5, `five different laps (${laps.map(x => x.toFixed(0)).join(', ')} m) and five different home straights (${homes.join(', ')} m)`);
  ok(Math.max(...radii) / Math.min(...radii) > 1.8, `tightest bend radius ranges from ${Math.min(...radii).toFixed(0)} m to ${Math.max(...radii).toFixed(0)} m (the original oval is 120 m)`);
  ok(new Set(IDS.map(i => sim.getTrack(i).cw)).size === 2, 'both directions are used'); }

console.log('\n— existing courses are untouched');
{ const R = sim.getTrack('randwick'), F = sim.getTrack('flemington'); ok(Math.abs(R.lap - 2224) < 0.01 && Math.abs(F.lap - 2312) < 0.01 && R.country === false && F.country === false && G.lap > 1600 && G.lap < 1700, `Randwick ${R.lap.toFixed(2)} m, Flemington ${F.lap.toFixed(2)} m, generic ${G.lap.toFixed(0)} m, none flagged as country`); }

console.log('\n— AI races on every course (every horse checked every step, all incidents on)');
let worstStep = 0, offTrack = 0, races = 0, maxLane = 0, stuck = 0; const times = {};
for (const id of IDS) { const T = sim.getTrack(id); for (const d of DISTS) for (let i = 0; i < N; i++) {
  for (const trk of [id, 'generic']) {
    const r = new sim.Race({ distance: d, field: 12, diff: 'hard', playerHorse: i % 12, allBots: true, going: 'good', incidents: 'full', seed: 4000 + i * 37 + d, track: trk });
    r.state = 'count'; r.openGates(); const prev = r.horses.map(h => ({ x: h.pos.x, z: h.pos.z }));
    while (r.finishOrder.length + r.dnfs.length < r.horses.length && r.clock < 600) {
      r.simStep(sim.SIM_DT);
      if (trk === id) r.horses.forEach((h, k) => { const st = Math.hypot(h.pos.x - prev[k].x, h.pos.z - prev[k].z); if (!h.fallen && h.v > 1) worstStep = Math.max(worstStep, st / Math.max(0.01, h.v * sim.SIM_DT)); prev[k].x = h.pos.x; prev[k].z = h.pos.z;
        if (h.laneF < -0.01 || h.laneF > sim.NLANES - 1 + 0.01 || sim.laneOff(h.laneF) > T.W) offTrack++; maxLane = Math.max(maxLane, h.laneF); });
    }
    r.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
    if (r.clock >= 600) stuck++;
    (times[id + d] = times[id + d] || { own: [], generic: [] })[trk === id ? 'own' : 'generic'].push(r.finishOrder[0] ? r.finishOrder[0].finishTime : NaN);
    if (trk === id) { races++; const w = r.finishOrder[0]; ok(r.finishOrder.length + r.dnfs.length === 12 && w && w.finishTime > d / 18 && w.finishTime < d / 14 && r.clock < 600, `${id} ${d} m race ${i + 1}: complete result, winner in ${w ? w.finishTime.toFixed(2) : '?'} s, ${r.dnfs.length} DNF`); }
  } } }
ok(stuck === 0, 'no race ever hung (every one finished inside 600 s)');
ok(offTrack === 0, `no horse ever left the racing surface or crossed a rail (${races} races, widest lane ${(maxLane + 1).toFixed(1)} of 12)`);
ok(worstStep < 1.6, `no teleports: the largest position step was ${worstStep.toFixed(2)}× the horse's own speed step`);
{ const diffs = []; for (const k in times) { const a = times[k].own.reduce((x, y) => x + y) / times[k].own.length, b = times[k].generic.reduce((x, y) => x + y) / times[k].generic.length; diffs.push(Math.abs(a - b) / b); } const mx = Math.max(...diffs); ok(mx < 0.07, `winning times stay within ${(mx * 100).toFixed(1)}% of the original oval's (same physics, different course; limit 7%)`); }
{ // the courses play differently: sectional (last 400 m) time of the same field differs between the tight and the long-straight course
  const sec = id => { const r = new sim.Race({ distance: 1400, field: 10, diff: 'hard', playerHorse: 0, allBots: true, going: 'good', incidents: 'off', seed: 77, track: id }); r.state = 'count'; r.openGates(); let t400 = null; while (r.finishOrder.length < r.horses.length && r.clock < 300) { r.simStep(sim.SIM_DT); const L = r.horses.reduce((m, h) => h.progress > m.progress ? h : m); if (t400 == null && L.progress >= 1000) t400 = r.clock; } r.finishOrder.sort((a, b) => a.finishTime - b.finishTime); return r.finishOrder[0].finishTime - t400; };
  const a = sec('c_tight'), b = sec('c_long'); ok(Math.abs(a - b) > 0.05, `the last 400 m of the same 1,400 m race takes ${a.toFixed(2)} s on the tight course and ${b.toFixed(2)} s on the long-straight one (the layout changes the race)`); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
