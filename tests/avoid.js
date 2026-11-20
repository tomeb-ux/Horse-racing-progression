// NORMAL mode (not chaos) avoidance of a fallen horse:
//  · a jockey with time and room (fall well ahead) tries to avoid it;
//  · a jockey on the same path and within 40 m when it falls is too close to react — it stays committed and collides;
//  · a jockey further back on the same path can still react and avoid.
// CHAOS mode must apply none of this avoidance (contact alone decides).
const S = require('./loadsim')(process.argv[2] || 'public/sim.js');
const { Race, SIM_DT } = S; const LANE_W = 1.9, NOSEOFF = 1.25;
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) pass++; else fail++; console.log((c ? ' ✓ ' : ' ✗ ') + n + (e ? ' — ' + e : '')); };
function mk(chaos) { const r = new Race({ distance: 1600, field: 12, diff: 'hard', going: 'good', seed: 7, incidents: 'full', chaos, playerHorse: 0 }); r.state = 'count'; r.openGates(); for (const h of r.horses) { h.st && (h.st.launched = true); r.applyStart(h, 0.6, 0.25); h.started = true; } r.clock = 6; return r; }
function put(h, p, l, v) { h.progress = p; h.laneF = l; h.targetLane = l; h.latV = 0; if (v != null) h.v = v; }

{ // Scenario F: a faller well ahead (55 m), clear track beside it — the AI should move over and pass
  const r = mk(false);
  const F = r.horses[0], chaser = r.horses[1];
  r.horses.forEach((h, i) => put(h, 150 - i * 40, 9, 15));
  put(F, 300, 4, 0); F.cause = 'test'; F.stab = 0; F.fall(r, 1, 0, 'balance');
  put(chaser, 300 - 55, 4, 16); chaser.effort = 0.9;
  ok(!(F.noAvoid && F.noAvoid.has(chaser)), 'scenario F: 55 m back, it is NOT flagged too-close — it can react');
  let moved = false;
  for (let i = 0; i < 120 * 7 && !chaser.fallen && chaser.progress < 320; i++) { r.step(SIM_DT); if (Math.abs(chaser.laneF - 4) > 0.8) moved = true; }
  ok(!chaser.fallen && moved, 'with time and room it steers off its line and passes the faller safely');
}
{ // NEW RULE: a horse on the same path and 25 m behind when the fall happens cannot avoid it
  const r = mk(false);
  const F = r.horses[0], trapped = r.horses[1];
  r.horses.forEach((h, i) => put(h, 100 - i * 40, 9, 15));
  put(F, 300, 5, 0); put(trapped, 300 - 25, 5, 16); trapped.effort = 0.95;
  F.cause = 'test'; F.stab = 0; F.fall(r, 1, 0, 'balance');
  ok(F.noAvoid && F.noAvoid.has(trapped), 'same path, 25 m behind at the fall → flagged too-close to react');
  let braked = false, steered = false;
  for (let i = 0; i < 120 * 5 && !trapped.fallen; i++) { r.step(SIM_DT); if (trapped.obsBrake) braked = true; if (Math.abs(trapped.laneF - 5) > 1.0) steered = true; }
  ok(!braked, 'it never pulls up for the body (too close to react)');
  ok(!steered, 'it never swerves around the body');
  ok(trapped.fallen && /running into/.test(trapped.fallCause), 'it runs into the fallen horse and goes down', trapped.fallCause);
}
{ // the boundary: a horse on the same path but 60 m behind CAN still react and avoid
  const r = mk(false);
  const F = r.horses[0], chaser = r.horses[1];
  r.horses.forEach((h, i) => put(h, 100 - i * 40, 9, 15));
  put(F, 300, 5, 0); put(chaser, 300 - 60, 5, 16); chaser.effort = 0.9;
  F.cause = 'test'; F.stab = 0; F.fall(r, 1, 0, 'balance');
  ok(!(F.noAvoid && F.noAvoid.has(chaser)), '60 m back on the same path → NOT flagged too-close');
  let signalled = false;
  for (let i = 0; i < 120 * 7 && !chaser.fallen && chaser.progress < 305; i++) { r.step(SIM_DT); if (chaser.obsBrake || (chaser.blockCap != null && chaser.front === F)) signalled = true; }
  ok(signalled && !chaser.fallen, 'further back it does get the avoidance signal and stays up');
}
{ // Scenario G: fall right in front, boxed in both sides — contact is unavoidable
  const r = mk(false);
  const F = r.horses[0], trapped = r.horses[1], boxL = r.horses[2], boxR = r.horses[3];
  r.horses.forEach((h, i) => put(h, 60 - i * 40, 11, 15));
  put(F, 300, 5, 0); put(trapped, 300 - 9, 5, 16); trapped.effort = 0.95;
  put(boxL, 300 - 7, 5 - 0.95, 16); put(boxR, 300 - 7, 5 + 0.95, 16);
  F.cause = 'test'; F.stab = 0; F.fall(r, 1, 0, 'balance');
  let out = false;
  for (let i = 0; i < 120 * 5 && !trapped.fallen; i++) { r.step(SIM_DT); if (Math.abs(trapped.laneF - 5) > 1.2) out = true; }
  ok(trapped.fallen, 'scenario G: boxed in right behind the faller, it cannot avoid and goes down', trapped.fallCause);
  ok(!out, 'it did not magically squeeze out of the box');
}
{ // chaos: the body raises NO avoidance signal at all (obsBrake / blockCap never fire for it)
  const r = mk(true);
  const F = r.horses[0], chaser = r.horses[1];
  r.horses.forEach((h, i) => put(h, 200 - i * 50, 9, 15));
  put(F, 300, 4, 0); F.cause = 'test'; F.stab = 0; F.fall(r, 1, 0, 'balance');
  put(chaser, 300 - 16, 4, 17); chaser.effort = 1;
  let braked = false, capped = false;
  for (let i = 0; i < 120 * 4 && !chaser.fallen; i++) { r.step(SIM_DT); if (chaser.obsBrake) braked = true; if (chaser.blockCap != null && chaser.front === F) capped = true; }
  ok(!braked && !capped, 'chaos: a horse bearing down on the body gets no avoidance signal (no brake, no detour)');
  ok(chaser.fallen && /running into/.test(chaser.fallCause), 'it holds its line into the body and falls', chaser.fallCause);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
