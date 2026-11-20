// Royal Randwick + track engine: geometry, route distances, starts/chutes, navigation, physics and AI races.
//   node tests/randwick.js [racesPerDistance=3]
const path = require('path');
const sim = require(path.join(__dirname, '..', 'public', 'sim.js'));
const N = +(process.argv[2] || 3);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const R = sim.getTrack('randwick'), G = sim.getTrack('generic');

console.log('— geometry');
ok(Math.abs(R.lap - 2224) < 0.01, `circumference ${R.lap.toFixed(2)} m (published 2224 m)`);
ok(Math.abs((R.lap - R.marks.home) - 410) < 0.01 && R.homeStraight === 410, `home straight ${(R.lap - R.marks.home).toFixed(1)} m from the turn to the post (published 410 m)`);
{ const a = R.point(0, 0, {}), b = R.point(R.lap - 1e-6, 0, {}); ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01 && Math.abs(a.hx - b.hx) < 1e-4, 'the loop closes smoothly (position and heading)'); }
{ let area = 0, prev = R.point(0, 0, {}); for (let s = 5; s <= R.lap; s += 5) { const p = R.point(s, 0, {}); area += prev.x * p.z - p.x * prev.z; prev = p; }
  ok(area > 0, 'clockwise (right-handed) on the map: the inside rail is on the right'); }
{ const rad = []; let inB = false, mx = 0; for (let s = 0; s <= R.lap; s += 1) { const k = R.kIn(s); if (k > 1 / 900) { inB = true; mx = Math.max(mx, k); } else if (inB) { rad.push(1 / mx); inB = false; mx = 0; } }
  ok(rad.length === 3 && Math.abs(rad[0] - rad[2]) > 8, `distinct bends: top turn r≈${rad[0].toFixed(0)} m, back-straight kink r≈${rad[1].toFixed(0)} m, home turn r≈${rad[2].toFixed(0)} m — not a symmetric oval`); }
{ let mj = 0; for (let s = 0; s < R.lap; s += 0.5) mj = Math.max(mj, Math.abs(R.kIn(s + 0.5) - R.kIn(s))); ok(mj < 2e-4, `curvature changes smoothly (largest step ${mj.toExponential(1)} per 0.5 m — easement spirals, no sudden balance jolt)`); }
{ let mx = 0; const p = {}; let prev = R.point(0, 0, {}); for (let s = 0.5; s < R.lap; s += 0.5) { R.point(s, 0, p); mx = Math.max(mx, Math.hypot(p.x - prev.x, p.z - prev.z)); prev = Object.assign({}, p); } ok(Math.abs(mx - 0.5) < 0.01, 'arc-length parametrisation: every 0.5 m of distance is 0.5 m of rail'); }

console.log('\n— race routes (measured along the actual racing path)');
for (const d of [1000, 1200, 1400, 1600, 2000, 2400, 3200]) {
  const rt = R.route(d); let len = 0; const p = {}, q = {}; rt.point(0, 0, q);
  for (let s = 0.5; s <= d + 1e-9; s += 0.5) { rt.point(s, 0, p); len += Math.hypot(p.x - q.x, p.z - q.z); q.x = p.x; q.z = p.z; }
  const post = R.point(0, 0, {}), end = rt.point(d, 0, {});
  const startOn = rt.inChute(0) ? `in the sprint chute (${rt.chuteLen.toFixed(0)} m, joining the course ${(d - rt.chuteLen).toFixed(0)} m from home)` : 'on the course proper';
  ok(Math.abs(len - d) < 0.6 && Math.hypot(end.x - post.x, end.z - post.z) < 0.05, `${d} m: route measures ${len.toFixed(1)} m and ends on the winning post · start ${startOn}`);
}
{ const rt = R.route(1200); const a = rt.point(rt.chuteLen - 0.25, 0, {}), b = rt.point(rt.chuteLen + 0.25, 0, {}); ok(rt.chuteLen > 80 && Math.abs(a.hx - b.hx) < 1e-3 && Math.abs(a.hz - b.hz) < 1e-3 && Math.hypot(a.x - b.x, a.z - b.z) < 0.6, 'The Everest (1200 m): starts in the chute, which joins the course tangentially before the long home turn'); }
{ const rt = R.route(1200), s0 = rt.point(0, sim.laneOff(0), {}), s11 = rt.point(0, sim.laneOff(11), {}); const dx = s11.x - s0.x, dz = s11.z - s0.z; ok(Math.abs(dx * s0.hx + dz * s0.hz) < 1e-6, 'starting gates sit square across the direction of racing'); }

console.log('\n— ground lost by racing wide (from the real curvature)');
{ const rt = R.route(2400); let s0 = 0, s8 = 0; for (let p = 0; p < 2400; p += 0.5) { s0 += 0.5 / rt.scale(p, sim.laneOff(0)); s8 += 0.5 / rt.scale(p, sim.laneOff(8)); }
  let turn = 0; for (let p = 0; p < 2400; p += 0.5) turn += rt.kIn(p + 0.25) * 0.5;      // total angle turned along the route
  const expect = turn * (sim.laneOff(8) - sim.laneOff(0));
  ok(Math.abs((s8 - s0) - expect) < 0.5, `lane 9 covers ${(s8 - s0).toFixed(1)} m more than the rail over 2400 m — exactly the ${(turn * 180 / Math.PI).toFixed(0)}° turned × the ${(sim.laneOff(8) - sim.laneOff(0)).toFixed(1)} m extra offset (${expect.toFixed(1)} m)`);
  const st = R.route(1200); let w = 0; for (let p = 0; p < st.chuteLen; p += 0.5) w += 0.5 / st.scale(p, sim.laneOff(8)) - 0.5; ok(Math.abs(w) < 1e-9, 'no ground is lost for width on a straight (the chute)'); }

console.log('\n— AI races at Randwick (every horse checked every step)');
const AK = ['top', 'acc', 'end', 'spr', 'rec', 'tem', 'agi', 'sta'];
let worstStep = 0, offTrack = 0, maxLane = 0, races = 0; const times = {};
for (const d of [1000, 1200, 1400, 1600, 2000, 2400, 3200]) for (let i = 0; i < N; i++) {
  for (const trk of ['randwick', 'generic']) {
    const r = new sim.Race({ distance: d, field: 12, diff: 'hard', playerHorse: i % 12, allBots: true, going: 'good', incidents: 'full', seed: 900 + i * 31 + d, track: trk });
    r.state = 'count'; r.openGates(); const prev = r.horses.map(h => ({ x: h.pos.x, z: h.pos.z }));
    while (r.finishOrder.length + r.dnfs.length < r.horses.length && r.clock < 600) {
      r.simStep(sim.SIM_DT);
      if (trk === 'randwick') r.horses.forEach((h, k) => { const st = Math.hypot(h.pos.x - prev[k].x, h.pos.z - prev[k].z); if (!h.fallen && h.v > 1) worstStep = Math.max(worstStep, st / Math.max(0.01, h.v * sim.SIM_DT)); prev[k].x = h.pos.x; prev[k].z = h.pos.z;
        if (h.laneF < -0.01 || h.laneF > sim.NLANES - 1 + 0.01 || sim.laneOff(h.laneF) > R.W) offTrack++; maxLane = Math.max(maxLane, h.laneF); });
    }
    r.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
    (times[d] = times[d] || { randwick: [], generic: [] })[trk].push(r.finishOrder[0].finishTime);
    if (trk === 'randwick') { races++; ok(r.finishOrder.length + r.dnfs.length === 12 && r.finishOrder[0].finishTime > d / 18 && r.finishOrder[0].finishTime < d / 14, `${d} m race ${i + 1}: complete result, winner ${r.finishOrder[0].def.name} in ${sim.SIM_EXPORTS ? r.finishOrder[0].finishTime.toFixed(2) : ''} s, ${r.dnfs.length} faller(s), ${r.leadChanges} lead changes`); }
  }
}
ok(offTrack === 0, `no horse ever left the racing surface or crossed a rail (${races} races, widest lane ${(maxLane + 1).toFixed(1)} of 12)`);
ok(worstStep < 1.6, `no teleports: the largest position step was ${worstStep.toFixed(2)}× the horse's own speed step`);
for (const d in times) { const a = times[d].randwick.reduce((x, y) => x + y) / N, b = times[d].generic.reduce((x, y) => x + y) / N; ok(Math.abs(a - b) / b < 0.06, `${d} m: average winning time ${a.toFixed(2)} s at Randwick vs ${b.toFixed(2)} s on the original oval (same physics, different course)`); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
