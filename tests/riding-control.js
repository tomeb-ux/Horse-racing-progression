// Riding control: the three-stage start, the distinct riding actions, steering precision, horse personalities and
// the final drive — each checked in the real simulation with a scripted rider.
//   node tests/riding-control.js
const sim = require('../public/sim.js');
const { Race, SIM_DT, ROSTER } = sim;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

/* ---- the start ---- */
// balance: 'good' (a human-like controller with ~0.25 s reaction), 'none'; react: seconds after the gates open (null = never);
// early: presses before the gates open; kicks: 'good' | 'none' | 'mash'
function start(seed, o) {
  const r = new Race({ distance: 1200, field: 10, diff: 'medium', playerHorse: o.horse != null ? o.horse : 4, seed, going: 'good', incidents: 'off' });
  const p = r.player, S = p.st, seen = [];
  let pressed = false, earlyLeft = o.early || 0, nextEarly = 0, nextKick = 0, openT = null, rdyAtOpen = null;
  for (let n = 0; n < 120 * 14; n++) {
    const t = n * SIM_DT;
    seen.push([S.poise, S.pv]); const lag = seen[Math.max(0, seen.length - 1 - (o.lag || 30))];        // the rider sees the horse 0.25 s late
    const poiseIn = o.balance === 'good' ? Math.max(-1, Math.min(1, -(lag[0] * 2.6 + lag[1] * 0.9))) : 0;
    sim.applyRiderInput(r, p, { poiseIn, poise: poiseIn, effort: 0.6 }, SIM_DT);
    if (r.state === 'count' && earlyLeft > 0 && t >= nextEarly) { sim.riderPress(r, p); earlyLeft--; nextEarly = t + 0.8; }
    if (r.state === 'running' && openT == null) { openT = t; rdyAtOpen = S.R; }
    if (r.state === 'running' && !pressed && o.react != null && t - openT >= o.react) { sim.riderPress(r, p); pressed = true; }
    if (p.started && t >= nextKick) {
      if (o.kicks === 'good' && p.strideAcc() > 0.82) { sim.riderPress(r, p); nextKick = t + 0.2; }
      if (o.kicks === 'mash') { sim.riderPress(r, p); nextKick = t + 0.12; }
    }
    r.step(SIM_DT);
    if (openT != null && t - openT > 4.5) break;
  }
  return { cat: p.startCat, q: S.q, R: rdyAtOpen, al: S.alignedT / Math.max(1e-6, S.trackT), dist: p.progress, S: p.S, push: p.jumpPush, delay: openT };
}
console.log('— the start');
const seeds = [...Array(16).keys()].map(i => 300 + i * 7);
const good = seeds.map(s => start(s, { balance: 'good', react: 0.2, kicks: 'good' }));
const passive = seeds.map(s => start(s, { balance: 'none', react: 0.2, kicks: 'none' }));
const late = seeds.map(s => start(s, { balance: 'good', react: 0.55, kicks: 'none' }));
const early = seeds.map(s => start(s, { balance: 'good', react: 0.2, early: 1, kicks: 'good' }));
const mash = seeds.map(s => start(s, { balance: 'good', react: 0.2, kicks: 'mash' }));
const nokick = seeds.map(s => start(s, { balance: 'good', react: 0.2, kicks: 'none' }));
const cnt = (L, c) => L.filter(x => x.cat === c).length;
ok(mean(good.map(x => x.R)) > mean(passive.map(x => x.R)) + 0.25, `balancing the horse in the stalls builds readiness: ${mean(good.map(x => x.R)).toFixed(2)} vs ${mean(passive.map(x => x.R)).toFixed(2)} left alone`);
ok(cnt(good, 'PERFECT') >= 10 && cnt(passive, 'PERFECT') <= 4, `well prepared + quick reaction: ${cnt(good, 'PERFECT')}/16 perfect breaks; no preparation: ${cnt(passive, 'PERFECT')}/16`);
ok(mean(late.map(x => x.q)) < mean(good.map(x => x.q)) - 0.1 && cnt(late, 'MISSED') === 0, `reacting late (0.55 s) costs the break (q ${mean(late.map(x => x.q)).toFixed(2)} vs ${mean(good.map(x => x.q)).toFixed(2)}) without ruining it`);
ok(mean(early.map(x => x.q)) < mean(good.map(x => x.q)) - 0.05 && cnt(early, 'MISSED') === 0, `anticipating the start once costs readiness (q ${mean(early.map(x => x.q)).toFixed(2)}) but never misses the break`);
const delays = good.map(x => x.delay), sd = Math.sqrt(mean(delays.map(d => (d - mean(delays)) ** 2)));
ok(sd > 0.45 && Math.max(...delays) - Math.min(...delays) > 1.5, `the gates open after a variable delay: ${Math.min(...delays).toFixed(1)}–${Math.max(...delays).toFixed(1)} s from loading (sd ${sd.toFixed(2)} s)`);
ok(mean(good.map(x => x.dist)) > mean(nokick.map(x => x.dist)) + 1.2, `well-timed pushes into stride (push ${mean(good.map(x => x.push)).toFixed(2)}): ${(mean(good.map(x => x.dist)) - mean(nokick.map(x => x.dist))).toFixed(1)} m further after 4.5 s than no pushes`);
ok(mean(mash.map(x => x.S)) < mean(good.map(x => x.S)) - 1 && mean(mash.map(x => x.dist)) < mean(good.map(x => x.dist)), `frantic pushing wastes energy (stamina ${mean(mash.map(x => x.S)).toFixed(1)} vs ${mean(good.map(x => x.S)).toFixed(1)}) and gains less ground`);
const hot = [...Array(12).keys()].map(i => start(500 + i, { horse: 8, balance: 'good', lag: 84, react: 0.2, kicks: 'none' })), cool = [...Array(12).keys()].map(i => start(500 + i, { horse: 10, balance: 'good', lag: 84, react: 0.2, kicks: 'none' }));   // a slow (0.7 s) rider
ok(mean(cool.map(x => x.al)) > mean(hot.map(x => x.al)), `a composed horse is easier to keep balanced in the stalls (balanced ${(100 * mean(cool.map(x => x.al))).toFixed(0)} % of the time) than a fractious one (${(100 * mean(hot.map(x => x.al))).toFixed(0)} %)`);

/* ---- riding actions mid-race ---- */
console.log('\n— riding actions');
function cruise(horse, seed, fn, secs) {
  const r = new Race({ distance: 2400, field: 1, diff: 'medium', playerHorse: horse, seed, going: 'good', incidents: 'off' });
  r.state = 'count'; r.openGates(); const p = r.player; r.st.launched = true; r.applyStart(p, 0.7, 0.2);
  let t = 0; const log = [];
  while (t < secs) { fn(p, t, r); r.simStep(SIM_DT); t += SIM_DT; log.push({ t, v: p.v, S: p.S, F: p.F, relax: p.relax, keen: p.keen, lane: p.laneF, e: p.eAct }); }
  return { p, log };
}
{ const a = cruise(4, 1, (p, t) => { p.effort = 0.62; p.restrain = t > 20 && t < 21; }, 22), b = cruise(4, 1, (p) => { p.effort = 0.62; }, 22);
  const at = (L, s) => L.log.find(x => x.t >= s).v;
  ok(at(b, 21) - at(a, 21) > 1.5, `a check (Q) takes real momentum off: ${(at(b, 21) - at(a, 21)).toFixed(1)} m/s slower after one second`); }
{ const urge = cruise(4, 2, (p, t) => { p.effort = 0.7; if (t > 20 && t < 20.02) { p.urgeT = 0.7; } }, 22), drive = cruise(4, 2, (p, t) => { p.effort = 0.7; p.drive = t > 20; }, 22);
  const dv = L => L.log.find(x => x.t >= 21.5).v - L.log.find(x => x.t >= 20).v, dS = L => L.log.find(x => x.t >= 20).S - L.log.find(x => x.t >= 21.5).S;
  ok(dv(drive) > dv(urge) && dS(drive) > dS(urge) * 1.5, `urging is a nudge (+${dv(urge).toFixed(2)} m/s, ${dS(urge).toFixed(1)} stamina); driving is all-out (+${dv(drive).toFixed(2)} m/s, ${dS(drive).toFixed(1)} stamina)`); }
{ const settled = cruise(4, 3, (p) => { p.effort = 0.72; p.settle = true; }, 60), plain = cruise(4, 3, (p) => { p.effort = 0.72; }, 60);
  ok(settled.p.S > plain.p.S + 1 && settled.p.F < plain.p.F, `settling (E) conserves energy at a cruising pace: stamina ${settled.p.S.toFixed(1)} vs ${plain.p.S.toFixed(1)}, fatigue ${settled.p.F.toFixed(1)} vs ${plain.p.F.toFixed(1)} after 60 s`); }
// driving too early is costly; the same effort saved for the finish is not
{ const pace = early => (rem) => ({ e: rem > 400 ? 0.74 : 0.95, drive: early ? rem < 1100 : rem < 350 });
  const tE = [], tL = [];
  for (let s = 0; s < 6; s++) { tE.push(sim.SIM_EXPORTS.simRace({ distance: 1600, horse: 4, seed: 70 + s, pacing: pace(true), tapping: 'average' }).player.finishTime); tL.push(sim.SIM_EXPORTS.simRace({ distance: 1600, horse: 4, seed: 70 + s, pacing: pace(false), tapping: 'average' }).player.finishTime); }
  ok(mean(tL) < mean(tE) - 0.3, `driving from 1100 m out is wasted: ${mean(tE).toFixed(2)} s vs ${mean(tL).toFixed(2)} s driving from the 350`); }
// steering: a tap nudges, holding moves decisively
{ const tap = cruise(4, 4, (p, t) => { p.effort = 0.8; p.steerIn = t > 15 && t < 15.12 ? 1 : 0; p.steerAssist = true; }, 17), hold = cruise(4, 4, (p, t) => { p.effort = 0.8; p.steerIn = t > 15 && t < 15.8 ? 1 : 0; p.steerAssist = true; }, 17);
  const moved = L => L.log[L.log.length - 1].lane - L.log.find(x => x.t >= 15).lane;
  ok(moved(tap) > 0.05 && moved(tap) < 0.35 && moved(hold) > 0.55, `steering: a tap nudges ${moved(tap).toFixed(2)} lanes, holding 0.8 s moves ${moved(hold).toFixed(2)} lanes`); }

/* ---- personalities ---- */
console.log('\n— horses ride differently');
{ const relaxT = h => { const L = cruise(h, 5, p => { p.effort = 0.55; p.settle = true; }, 30); const x = L.log.find(q => q.relax > 0.6); return x ? x.t : 99; };
  const hotT = relaxT(3), calmT = relaxT(10);   // Tempted vs Goodie Two Shoes
  ok(hotT > calmT + 0.4, `an eager horse takes longer to settle (Tempted ${hotT.toFixed(1)} s) than a calm one (Goodie Two Shoes ${calmT.toFixed(1)} s)`); }
{ // same attributes, different character: a diesel winds up slower but holds speed once rolling
  const run = diesel => cruise(4, 6, (p, t) => { if (t < 0.01) p.rp = Object.assign({}, p.rp, { diesel }); p.effort = t < 8 ? 0.6 : 0.92; }, 30);
  const D = run(0.8), Q = run(0.1), v = (L, s) => L.log.find(x => x.t >= s).v;
  ok(v(Q, 9.5) - v(Q, 8) > v(D, 9.5) - v(D, 8), `a diesel winds up slower (+${(v(D, 9.5) - v(D, 8)).toFixed(2)} vs +${(v(Q, 9.5) - v(Q, 8)).toFixed(2)} m/s in 1.5 s)…`);
  ok(D.p.F < Q.p.F + 0.5 || v(D, 29) >= v(Q, 29) - 0.05, `…and holds its speed once rolling (at 29 s ${v(D, 29).toFixed(2)} vs ${v(Q, 29).toFixed(2)} m/s)`); }
{ const keenIn = nerve => { const r = new Race({ distance: 2000, field: 12, diff: 'medium', playerHorse: 4, seed: 9, going: 'good', incidents: 'off' }); r.state = 'count'; r.openGates(); const p = r.player; p.rp = Object.assign({}, p.rp, { nerve, eager: 0.3 }); r.st.launched = true; r.applyStart(p, 0.7, 0.2);
    let k = 0, n = 0; for (let t = 0; t < 40; t += SIM_DT) { p.effort = 0.58; r.simStep(SIM_DT); if (t > 8) { k += p.keen; n++; } } return k / n; };
  const nerv = keenIn(0.9), calm = keenIn(0.1);
  ok(nerv > calm * 1.2, `a nervous horse gets keener among the runners (avg keenness ${nerv.toFixed(3)} vs ${calm.toFixed(3)})`); }

/* ---- the final drive ---- */
console.log('\n— the final drive');
{ const fin = (e, tapEvery) => { const momS = [], S0 = []; for (let s = 0; s < 6; s++) { const r = sim.SIM_EXPORTS.simRace({ distance: 1200, horse: 4, seed: 40 + s, pacing: (rem) => ({ e: rem > 450 ? 0.72 : e }), tapping: tapEvery ? null : 'good' });
      momS.push(r.player.stat.syncSum / Math.max(1e-6, r.player.stat.syncN)); S0.push(r.player.finishTime); } return { mom: mean(momS), t: mean(S0) }; };
  const hard = fin(0.95), soft = fin(0.62);
  ok(hard.mom > soft.mom + 0.1, `rhythm taps only become speed when the horse is asked to sprint: momentum ${hard.mom.toFixed(2)} at 95% effort vs ${soft.mom.toFixed(2)} at 62%`); }
{ const r = new Race({ distance: 1000, field: 1, diff: 'medium', playerHorse: 4, seed: 3, going: 'good', incidents: 'off' }); r.state = 'count'; r.openGates(); const p = r.player; r.st.launched = true; r.applyStart(p, 0.7, 0.2);
  while (r.dist - p.progress > 440) { p.effort = 0.8; r.simStep(SIM_DT); }
  const S0 = p.S; let t = 0, last = -9; while (t < 2) { p.effort = 0.95; if (t - last >= 0.1) { p.tap(0.9, r.clock); last = t; } r.simStep(SIM_DT); t += SIM_DT; }
  ok(p.stat.extraTaps >= 10 && p.penT > 0 && S0 - p.S > 2, `mashing the rhythm key wastes energy and breaks the stride (${p.stat.extraTaps} wasted taps, ${(S0 - p.S).toFixed(1)} stamina in 2 s)`); }
/* ---- the finish: the lunge ---- */
console.log('\n— the finish');
// lunge: null = none, or the time-to-line at which Space is pressed
function finish(seed, lunge, horse) {
  const r = new Race({ distance: 1200, field: 1, diff: 'medium', playerHorse: horse != null ? horse : 4, seed, going: 'good', incidents: 'off' });
  r.state = 'count'; r.openGates(); const p = r.player; r.st.launched = true; r.applyStart(p, 0.7, 0.2);
  let t = 0, res = null;
  while (!p.finished && t < 200) {
    const rem = r.dist - p.progress;
    sim.applyRiderInput(r, p, { effort: rem < 420 ? 1 : 0.72, steer: 0, drive: rem < 250 }, SIM_DT);
    if (lunge != null && p.lungeT == null && p.ttl() <= lunge) res = sim.riderPress(r, p);
    r.step(SIM_DT); t += SIM_DT;
  }
  return { t: p.finishTime, res };
}
{ const sd = [11, 12, 13, 14, 15, 16, 17, 18], m = (l) => sd.map(s => finish(s, l));
  // the horse always runs straight: no drift in the straight without the rider steering
  { const r = new Race({ distance: 1000, field: 1, diff: 'medium', playerHorse: 4, seed: 5, going: 'good', incidents: 'off' }); r.state = 'count'; r.openGates(); const p = r.player; r.st.launched = true; r.applyStart(p, 0.7, 0.2);
    let lane0 = null; while (!p.finished) { const rem = r.dist - p.progress; if (rem < 420 && lane0 == null) lane0 = p.laneF; sim.applyRiderInput(r, p, { effort: rem < 420 ? 1 : 0.72, steer: 0, drive: rem < 250 }, SIM_DT); r.step(SIM_DT); }
    ok(Math.abs(p.laneF - lane0) < 0.05, `driven out in the straight with no steering, the horse keeps its line (moved ${Math.abs(p.laneF - lane0).toFixed(2)} lanes)`); }
  const none = m(null), good = m(0.27), early = m(0.85), late = m(0.04);
  const gain = (L) => (mean(none.map(x => x.t)) - mean(L.map(x => x.t))) * 16.5;
  ok(gain(good) > 0.3 && gain(good) <= sim.LUNGE_M + 0.05 && good.every(x => x.res && x.res.kind === 'lunge' && x.res.res === 'perfect'), `a lunge timed for the line gains ${gain(good).toFixed(2)} m (a head is ~0.4 m)`);
  ok(gain(early) < 0, `lunging too soon is over before the line and costs ground (${gain(early).toFixed(2)} m, "${early[0].res.res}")`);
  ok(gain(late) > 0 && gain(late) < gain(good), `lunging very late gains only part of it (${gain(late).toFixed(2)} m)`);
  // only one lunge: a second press in the final strides does nothing
  { const r = new Race({ distance: 1000, field: 1, diff: 'medium', playerHorse: 4, seed: 9, going: 'good', incidents: 'off' }); r.state = 'count'; r.openGates(); const p = r.player; r.st.launched = true; r.applyStart(p, 0.7, 0.2);
    while (p.ttl() > 0.6) { p.effort = 0.95; r.simStep(SIM_DT); }
    const a = sim.riderPress(r, p); r.simStep(SIM_DT); const b = sim.riderPress(r, p);
    ok(a && a.kind === 'lunge' && !(b && b.kind === 'lunge'), 'one lunge per race: a second press in the final strides is not another lunge'); }
  // AI riders lunge as well, Hard jockeys more accurately than Easy ones
  const botQ = diff => { const q = []; for (let s = 0; s < 6; s++) { const r = new Race({ distance: 1000, field: 10, diff, playerHorse: 4, seed: 60 + s, allBots: true, going: 'good', incidents: 'off' }); r.state = 'count'; r.openGates();
    while (r.finishOrder.length < r.horses.length && r.clock < 200) r.simStep(SIM_DT); for (const h of r.horses) if (h.stat.lungeQ != null) q.push(h.stat.lungeQ); } return q; };
  const qh = botQ('hard'), qe = botQ('easy');
  ok(qh.length > 40 && mean(qh) > mean(qe), `AI riders lunge too: Hard jockeys get ${(100 * mean(qh)).toFixed(0)}% of the stretch at the line, Easy ${(100 * mean(qe)).toFixed(0)}%`);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
