// Flemington + Straight Six + Melbourne Cup route: geometry, direction, routes, straight-course rules, navigation, AI races.
//   node tests/flemington.js [racesPerDistance=2]
const path = require('path');
const sim = require(path.join(__dirname, '..', 'public', 'sim.js'));
const N = +(process.argv[2] || 2);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const F = sim.getTrack('flemington'), R = sim.getTrack('randwick');

console.log('— geometry');
ok(Math.abs(F.lap - 2312) < 0.01, `circumference ${F.lap.toFixed(2)} m (published 2312 m)`);
ok(Math.abs((F.lap - F.marks.home) - 450) < 0.01, `home straight ${(F.lap - F.marks.home).toFixed(1)} m (published 450 m)`);
ok(Math.abs(F.marks.homeTurn - (F.lap - 1200)) < 0.01 && Math.abs(F.marks.homeTurn_end - (F.lap - 450)) < 0.01, 'the sweeping home turn runs from the 1200 m mark to the 450 m mark');
{ const a = F.point(0, 0, {}), b = F.point(F.lap - 1e-6, 0, {}); ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01 && Math.abs(a.hx - b.hx) < 1e-4, 'the loop closes smoothly (position and heading)'); }
{ let area = 0, prev = F.point(0, 0, {}); for (let s = 5; s <= F.lap; s += 5) { const p = F.point(s, 0, {}); area += prev.x * p.z - p.x * prev.z; prev = p; }
  let areaR = 0; prev = R.point(0, 0, {}); for (let s = 5; s <= R.lap; s += 5) { const p = R.point(s, 0, {}); areaR += prev.x * p.z - p.x * prev.z; prev = p; }
  ok(area < 0 && areaR > 0, 'anticlockwise (left-handed) — the opposite direction to Randwick: the inside rail is on the left'); }
{ const rad = []; let inB = false, mx = 0; for (let s = 0; s <= F.lap; s += 1) { const k = F.kIn(s); if (k > 1 / 900) { inB = true; mx = Math.max(mx, k); } else if (inB) { rad.push(1 / mx); inB = false; mx = 0; } }
  ok(rad.length === 2 && rad[1] > rad[0] * 1.35, `pear-shaped: a tight first turn (r≈${rad[0].toFixed(0)} m) and a broad sweeping home turn (r≈${(rad[1] || 0).toFixed(0)} m)`); }
{ let mj = 0; for (let s = 0; s < F.lap; s += 0.5) mj = Math.max(mj, Math.abs(F.kIn(s + 0.5) - F.kIn(s))); ok(mj < 2e-4, `curvature changes smoothly (largest step ${mj.toExponential(1)} per 0.5 m)`); }
{ const c = F.chutes.straight, a = F.point(F.marks.home + 1, 0, {}); ok(c.straightCourse && Math.abs(c.hx - a.hx) < 1e-6 && Math.abs(c.hz - a.hz) < 1e-6, 'the Straight Six continues exactly in line with the home straight'); }

console.log('\n— race routes (measured along the actual racing path)');
for (const d of [1000, 1100, 1200, 1400, 1600, 2000, 2400, 2500, 3200]) {
  const rt = F.route(d); let len = 0, turn = 0; const p = {}, q = {}; rt.point(0, 0, q);
  for (let s = 0.5; s <= d + 1e-9; s += 0.5) { rt.point(s, 0, p); len += Math.hypot(p.x - q.x, p.z - q.z); q.x = p.x; q.z = p.z; turn += rt.kIn(s - 0.25) * 0.5; }
  const post = F.point(0, 0, {}), end = rt.point(d, 0, {});
  ok(Math.abs(len - d) < 0.6 && Math.hypot(end.x - post.x, end.z - post.z) < 0.05, `${d} m: measures ${len.toFixed(1)} m, ends on the post, turns ${(turn * 180 / Math.PI).toFixed(0)}° · ${rt.straightRace ? 'STRAIGHT SIX' : rt.chuteLen ? 'chute start (' + rt.chuteLen.toFixed(0) + ' m)' : 'course proper'}${rt.isTurn(0) ? ' — START ON A BEND' : ''}`);
  if (d <= 1200) ok(rt.straightRace && turn === 0 && rt.finalBend === rt.homeStraight && !rt.inFinalBend(d - 600), `${d} m is a true straight race: no curvature at all, no "final bend" phase`);
}
{ const rt = F.route(3200); const a = rt.point(887.9, 0, {}), b = rt.point(888.1, 0, {}), post = F.point(0, 0, {});
  const passes = []; for (let s = 1; s < 3200; s += 1) { const p = rt.point(s, 0, {}); if (Math.hypot(p.x - post.x, p.z - post.z) < 0.6) passes.push(s); }
  ok(rt.chuteLen > 400 && rt.chute.id === 'straight' && Math.abs(passes[0] - 888) < 2 && passes.filter(s => s < 3150).length <= 2, `Melbourne Cup: starts on the straight course ${rt.chuteLen.toFixed(0)} m beyond the home-turn junction, passes the post after ${passes[0]} m, then a full lap (${(F.lap).toFixed(0)} m) home`);
  ok(sim.racePhase(100, 3100, 3200, rt) === 'opening' && sim.racePhase(2400, 800, 3200, rt) === 'final bend' && sim.racePhase(2900, 300, 3200, rt) === 'home straight', 'Cup phases: opening → … → final bend (from the 1200 m) → home straight (450 m)'); }
{ const rt = F.route(1200), s0 = rt.point(0, sim.laneOff(0), {}), s11 = rt.point(0, sim.laneOff(11), {}); ok(Math.abs((s11.x - s0.x) * s0.hx + (s11.z - s0.z) * s0.hz) < 1e-6, 'starting gates sit square across the direction of racing'); }

console.log('\n— straight-course rules');
{ const st = F.route(1200); let w = 0, acc = 0; for (let p = 0; p < 1200; p += 0.5) { w += 0.5 / st.scale(p, sim.laneOff(10)) - 0.5; acc += st.bendAcc(p, sim.laneOff(10), 17); }
  ok(Math.abs(w) < 1e-9 && acc === 0, 'Straight Six: lane 11 covers exactly the same ground as lane 1 and there is no bend loading anywhere'); }
{ const rt = F.route(3200); let s0 = 0, s8 = 0, turn = 0; for (let p = 0; p < 3200; p += 0.5) { s0 += 0.5 / rt.scale(p, sim.laneOff(0)); s8 += 0.5 / rt.scale(p, sim.laneOff(8)); turn += rt.kIn(p + 0.25) * 0.5; }
  const expect = turn * (sim.laneOff(8) - sim.laneOff(0)); ok(Math.abs((s8 - s0) - expect) < 0.5, `Cup: lane 9 covers ${(s8 - s0).toFixed(1)} m more than the rail — ${(turn * 180 / Math.PI).toFixed(0)}° turned × ${(sim.laneOff(8) - sim.laneOff(0)).toFixed(1)} m (${expect.toFixed(1)} m)`); }

console.log('\n— AI races at Flemington (every horse checked every step)');
let worstStep = 0, offTrack = 0, maxLane = 0, races = 0, overtakes = 0; const times = {};
for (const d of [1000, 1200, 1600, 2000, 2400, 3200]) for (let i = 0; i < N; i++) {
  for (const trk of ['flemington', 'generic']) {
    const r = new sim.Race({ distance: d, field: 12, diff: 'hard', playerHorse: i % 12, allBots: true, going: 'good', incidents: 'full', seed: 700 + i * 37 + d, track: trk });
    r.state = 'count'; r.openGates(); const prev = r.horses.map(h => ({ x: h.pos.x, z: h.pos.z }));
    while (r.finishOrder.length + r.dnfs.length < r.horses.length && r.clock < 700) {
      r.simStep(sim.SIM_DT);
      if (trk === 'flemington') r.horses.forEach((h, k) => { const st = Math.hypot(h.pos.x - prev[k].x, h.pos.z - prev[k].z); if (!h.fallen && h.v > 1) worstStep = Math.max(worstStep, st / Math.max(0.01, h.v * sim.SIM_DT)); prev[k].x = h.pos.x; prev[k].z = h.pos.z;
        if (h.laneF < -0.01 || h.laneF > sim.NLANES - 1 + 0.01 || sim.laneOff(h.laneF) > F.W) offTrack++; maxLane = Math.max(maxLane, h.laneF); });
    }
    r.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
    (times[d] = times[d] || { flemington: [], generic: [] })[trk].push(r.finishOrder[0].finishTime);
    if (trk === 'flemington') { races++; overtakes += r.leadChanges; ok(r.finishOrder.length + r.dnfs.length === r.horses.length && r.finishOrder[0].finishTime > d / 18.6 && r.finishOrder[0].finishTime < d / 14, `${d} m race ${i + 1}: complete result, winner ${r.finishOrder[0].def.name} in ${r.finishOrder[0].finishTime.toFixed(2)} s, ${r.dnfs.length} faller(s), ${r.leadChanges} lead changes`); }
  }
}
ok(offTrack === 0, `no horse ever left the racing surface (${races} races, widest lane ${(maxLane + 1).toFixed(1)} of 12)`);
ok(worstStep < 1.6, `no teleports: largest position step ${worstStep.toFixed(2)}× the horse's own speed step`);
ok(overtakes > races, `the AI overtakes (${overtakes} lead changes in ${races} races)`);
for (const d in times) { const a = times[d].flemington.reduce((x, y) => x + y) / N, b = times[d].generic.reduce((x, y) => x + y) / N; ok(Math.abs(a - b) / b < 0.06, `${d} m: average winning time ${a.toFixed(2)} s at Flemington vs ${b.toFixed(2)} s on the original oval`); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
