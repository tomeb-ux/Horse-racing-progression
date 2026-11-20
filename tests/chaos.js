// CHAOS MODE scenario tests (spec scenarios A–E plus lap persistence and the one-kick rules).
// Chaos = a normal race + one kick per rider; every secondary fall must come from genuine body overlap.
const S = require('./loadsim')(process.argv[2] || 'public/sim.js');
const { Race, SIM_DT, riderKick } = S;
const LANE_W = 1.9, HORSE_LEN = S.HORSE_LEN, NOSE_OFF_ = 1.25;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; } console.log((cond ? ' ✓ ' : ' ✗ ') + name + (extra ? ' — ' + extra : '')); };
function mkRace(opts) {
  const r = new Race(Object.assign({ distance: 1600, field: 12, diff: 'medium', going: 'good', seed: 11, incidents: 'full', humans: [4, 0], chaos: true }, opts));
  r.state = 'count'; r.openGates();
  for (const h of r.humans) { r.st = h.st; h.st.launched = true; r.applyStart(h, 0.6, 0.25); }
  return r;
}
function runTo(r, clock) { while (r.clock < clock && r.state !== 'done') { for (const h of r.humans) h.effort = 0.8; r.step(SIM_DT); } }
// place a horse: progress (nose) and lane; zero lateral motion, given speed, and hold that lane
function put(h, progress, lane, v) { h.progress = progress; h.laneF = lane; h.targetLane = lane; h.latV = 0; if (v != null) h.v = v; if (h.bot) h.bot.laneCool = 99; }
const fallen = r => r.horses.filter(h => h.fallen);

{ // ---- kick geometry: reach, sides, one per race ----
  const r = mkRace({}); runTo(r, 12);
  const me = r.humans[0], tgt = r.horses[5], far = r.horses[6];
  r.horses.forEach((h, i) => put(h, 300 + i * 40, (i * 3) % 10, 16));                 // spread the field out of the way
  put(me, 300, 4, 16); put(tgt, 300, 4 + 2.4 / LANE_W, 16);                           // 2.4 m away: out of a boot's reach
  let res = riderKick(r, me, 1);
  ok(res && !res.ok && res.why === 'miss', 'A horse 2.4 m away is out of reach — the kick misses');
  ok(me.kickUsed !== true, 'a MISS does not use up the kick — still available');
  // now connect on a horse in reach: that spends the kick, and a second is then refused
  put(tgt, 300, 4 + 1.9 / LANE_W, 16);
  res = riderKick(r, me, 1);
  ok(res && res.ok && me.kickUsed === true, 'a connected kick uses it up');
  res = riderKick(r, me, 1);
  ok(res && !res.ok && res.why === 'used', 'a second kick after a connect is refused');
}
{ // wrong side / too far ahead are misses; in reach connects
  for (const [name, dlLanes, dp, side, want] of [
    ['target 1.9 m away on the chosen side connects', 1, 0, 1, true],
    ['same horse, kicking the other way, misses', 1, 0, -1, false],
    ['a horse 2 m ahead (not alongside) misses', 1, 2.0, 1, false],
    ['a horse clear behind misses', 1, -2.2, 1, false],
  ]) {
    const r = mkRace({ seed: 20 + dp * 7 }); runTo(r, 12);
    const me = r.humans[0], tgt = r.horses[5];
    r.horses.forEach((h, i) => put(h, 300 + i * 40, (i * 3) % 10, 16));
    put(me, 300, 4, 16); put(tgt, 300 + dp, 4 + dlLanes, 16);
    const res = riderKick(r, me, side);
    ok(!!res && res.ok === want && (want ? res.target === tgt : true), name, res && res.why);
  }
}
{ // ---- Scenario A: one isolated kick — only the target falls, nobody else is touched ----
  const r = mkRace({ seed: 31 }); runTo(r, 12);
  const me = r.humans[0], tgt = r.horses[5];
  r.horses.forEach((h, i) => put(h, 400 + i * 30, (i * 4) % 11, 16));                 // nobody behind the target's lanes
  put(me, 400, 4, 16); put(tgt, 400, 5, 16);
  const vOthers = r.horses.filter(h => h !== tgt && h !== me).map(h => h.v);
  const res = riderKick(r, me, 1);
  ok(res && res.ok && res.target === tgt && tgt.fallen, 'the kick connects and the target begins to fall');
  ok(fallen(r).length === 1, 'at the moment of the kick, only the target is falling (no area effect)');
  const dv = r.horses.filter(h => h !== tgt && h !== me).map((h, i) => Math.abs(h.v - vOthers[i]));
  ok(Math.max(...dv) < 1e-9, 'no other horse was given any speed change by the kick');
  runTo(r, r.clock + 4);
  ok(fallen(r).length === 1 && !me.fallen, '4 s later still only the target is down (field was clear behind)', fallen(r).map(h => h.def.name).join(','));
}
{ // ---- Scenario B: a horse directly behind runs into the body — and only at the body ----
  const r = mkRace({ seed: 32 }); runTo(r, 12);
  const me = r.humans[0], tgt = r.horses[5], chaser = r.horses[6];
  r.horses.forEach((h, i) => put(h, 500 + i * 35, (i * 4) % 11, 15));
  put(me, 500, 4, 15); put(tgt, 500, 5, 15); put(chaser, 500 - 14, 5, 17.5); chaser.effort = 0.95;
  riderKick(r, me, 1);
  let vAt6 = null, gapAtFall = null;
  while (r.clock < r.clock + 9 && !chaser.fallen && r.state !== 'done') {
    const gap = tgt.progress - chaser.progress;
    if (vAt6 == null && gap < 6) vAt6 = chaser.v;
    r.step(SIM_DT); for (const h of r.humans) h.effort = 0.8;
    if (chaser.fallen) gapAtFall = tgt.progress - NOSE_OFF_ - (chaser.progress - NOSE_OFF_);
  }
  ok(chaser.fallen, 'the chaser directly behind falls');
  ok(vAt6 != null && vAt6 > 16.2, 'chaos: it never braked for the body ahead (still ' + (vAt6 && vAt6.toFixed(1)) + ' m/s at a 6 m gap)');
  ok(gapAtFall != null && Math.abs(gapAtFall) < HORSE_LEN / 2 + 1.8, 'it fell at the body, not at a distance (centres ' + (gapAtFall && gapAtFall.toFixed(2)) + ' m apart)');
  ok(/running into|jockey/.test(chaser.fallCause), 'its cause is the real contact: ' + chaser.fallCause);
}
{ // ---- Scenario C: narrowly passing beside the body must NOT fall ----
  const r = mkRace({ seed: 33 }); runTo(r, 12);
  const me = r.humans[0], tgt = r.horses[5], passer = r.horses[6];
  r.horses.forEach((h, i) => put(h, 600 + i * 35, (i * 4) % 11, 15));
  put(me, 600, 6, 15); put(tgt, 600, 5, 15);                     // kicked from the outside: it falls towards the rail (legs to lane ~4)
  put(passer, 600 - 16, 6.6, 17); passer.effort = 0.95;          // passes ≈3 m on the clear side of the body
  riderKick(r, me, -1);
  ok(tgt.fallen && tgt.fallDir === -1, 'the target falls away from the kicker (towards the rail)');
  const t1 = r.clock + 6; while (r.clock < t1 && r.state !== 'done') { for (const h of r.humans) h.effort = 0.3; r.step(SIM_DT); }
  ok(!passer.fallen && passer.progress > tgt.progress + 10, 'the horse passing clear beside the body stays up and goes by');
}
{ // ---- Scenarios D + E: a real sequential pile-up; the body is solid while still falling ----
  const r = mkRace({ seed: 34 }); runTo(r, 12);
  const me = r.humans[0], A = r.horses[5], B = r.horses[6], C = r.horses[7], D = r.horses[8];
  r.horses.forEach((h, i) => put(h, 700 + i * 40, (i * 4) % 11, 15));
  put(me, 700, 4, 15); put(A, 700, 5, 15);
  put(B, 700 - 7, 5, 17);  B.effort = 1;                         // right behind: will hit A while A is still falling
  put(C, 700 - 22, 5.3, 17); C.effort = 1;                       // next: will reach B's body
  put(D, 700 - 20, 8, 17);  D.effort = 1;                        // three lanes wide: must pass untouched
  riderKick(r, me, 1);
  let aFallTAtB = null;
  while (r.clock < 1e9 && !(B.fallen && C.fallen) && r.state !== 'done' && r.clock < 60) {
    r.step(SIM_DT); for (const h of r.humans) h.effort = 0.3;
    if (B.fallen && aFallTAtB == null) aFallTAtB = A.fallT - B.fallT;
  }
  ok(B.fallen && /running into|jockey/.test(B.fallCause), 'B trips over A: ' + B.fallCause);
  ok(aFallTAtB != null && aFallTAtB < 0.9, 'B hit A while A was still falling (A was ' + (aFallTAtB && aFallTAtB.toFixed(2)) + ' s into its fall) — the body is solid mid-animation');
  ok(C.fallen && /running into|jockey/.test(C.fallCause) && (C.fallCause.includes(B.def.name) || C.fallCause.includes(A.def.name)), 'C falls over a body in the pile: ' + C.fallCause);
  ok(B.fallT > C.fallT && A.fallT > B.fallT, 'the falls happen in sequence, not at once');
  const t2 = r.clock + 4; while (r.clock < t2 && r.state !== 'done') { for (const h of r.humans) h.effort = 0.3; r.step(SIM_DT); }
  ok(!D.fallen && D.progress > A.progress + 10, 'D, three lanes wide, passes the whole incident untouched');
}
{ // ---- fallen horses still block a lap later (2400 m: the field comes round again) ----
  const r = mkRace({ seed: 35, distance: 2400 }); runTo(r, 10);
  const me = r.humans[0], tgt = r.horses[5], lapper = r.horses[6], LAP = 2 * 450 + 2 * Math.PI * 120;
  r.horses.forEach((h, i) => put(h, 150 + i * 30, (i * 4) % 11, 15));
  put(me, 150, 4, 15); put(tgt, 150, 5, 15);
  riderKick(r, me, 1); runTo(r, r.clock + 3);
  put(lapper, tgt.progress - LAP - 25, tgt.laneF, 17); lapper.effort = 1;             // same WORLD spot, one lap behind
  const t3 = r.clock + 5; while (r.clock < t3 && !lapper.fallen && r.state !== 'done') { for (const h of r.humans) h.effort = 0.3; r.step(SIM_DT); }
  ok(lapper.fallen && Math.abs((tgt.progress - lapper.progress) % LAP) < 4 || Math.abs((tgt.progress - lapper.progress) % LAP) > LAP - 4,
    'a horse coming round a lap later still trips over the body at its world position', lapper.fallCause);
}
{ // ---- an organic chaos race with no kick: no falls at all ----
  let any = 0;
  for (let s = 0; s < 12; s++) {
    const r = mkRace({ seed: 900 + s * 17, distance: 1000 });
    while (r.state !== 'done' && r.clock < 200) { for (const h of r.humans) { h.effort = 0.85; h.steerIn = 0; } r.step(SIM_DT); }
    if (r.dnfs.length) any++;
  }
  ok(any === 0, 'chaos with nobody kicking is just a normal race: 0 of 12 races had any fall');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
