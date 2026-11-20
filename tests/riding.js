// riding technique tests in parallel: one worker per variant group
const S = require('./loadsim')(process.argv[2]); const X = S.extra;
const mode = process.argv[3] || 'riding';
if (mode === 'riding') { console.log('1600 m, medium bots, 4 horses (sprinter/all-rounder/aggressive/metronome) x', +(process.argv[4] || 6), 'seeds'); X.runRidingTests({ n: +(process.argv[4] || 6) }); }
if (mode === 'start') {
  const rows = {};
  for (const dist of [1000, 2400]) for (const [lab, eff, react] of [['bold start 95% · sharp', 0.95, 0.12], ['steady start 70% · sharp', 0.7, 0.12], ['soft start 50% · sharp', 0.5, 0.12], ['70% · late reaction', 0.7, 0.9]]) {
    let t = 0, p200 = 0, S = 0, n = 0;
    for (const hi of [0, 4, 3]) for (let s = 0; s < 6; s++) {
      const startPlan = (rem, d, h, r) => r.clock < 8 ? { e: eff } : X.PACING.reactive(rem, d, h, r);
      const r = X.simRace({ distance: dist, horse: hi, diff: 'medium', seed: 800 + s * 11 + hi, pacing: startPlan, tapping: 'average', react, startEffort: eff });
      t += r.player.finishTime; S += r.player.S; n++;
      const tl = r.tel; let k = tl.t.findIndex(x => x >= 12); p200 += tl.rank[0][Math.max(0, k)];
    }
    rows[dist + ' m · ' + lab] = { posAt12s: +(p200 / n).toFixed(2), finishTime: +(t / n).toFixed(2), staminaLeft: +(S / n).toFixed(1) };
  }
  console.table(rows);
}
if (mode === 'steer') {
  const rows = {};
  for (const sm of ['assisted', 'advanced']) {
    let em = 0, pl = 0, minSep = 99, n = 0, overtakes = 0;
    for (const hi of [4, 2, 1]) for (let s = 0; s < 6; s++) {
      // rider steers continuously out of trouble and back towards the rail when clear
      const plan = (rem, d, h, r) => { const sp = X.PACING.reactive(rem, d, h, r); const room = r.roomAheadPred(h, h.laneF, 30);
        sp.steer = h.blocked || room < 8 ? 1 : (h.laneF > 0.6 && r.corridorClear(h, h.laneF - 0.6) && room > 15 ? -1 : 0); return sp; };
      plan.steers = true;
      const r = X.simRace({ distance: 1600, horse: hi, diff: 'hard', seed: 600 + s * 17 + hi, pacing: plan, tapping: 'good', steerMode: sm });
      em += r.emerg; minSep = Math.min(minSep, r.minSep); pl += r.finishOrder.indexOf(r.player) + 1; overtakes += r.player.stat.overtakes; n++;
    }
    rows[sm] = { races: n, emergencies: em, minLateralSep: minSep === 99 ? 'never overlapped' : minSep.toFixed(2), avgPlace: +(pl / n).toFixed(2), overtakesPerRace: +(overtakes / n).toFixed(1) };
  }
  console.table(rows);
}
if (mode === 'keen') {
  const rows = {};
  for (const hi of [9, 10, 0, 6, 1, 11]) { let keen = 0, settled = 0, n = 0;
    for (let s = 0; s < 6; s++) { const r = X.simRace({ distance: 1600, horse: hi, diff: 'medium', seed: 200 + s * 7, pacing: (rem, d, h, rr) => { const sp = X.PACING.reactive(rem, d, h, rr); sp.e = Math.min(sp.e, h.comfort() - 0.03); sp.settle = false; return sp; } }); keen += r.player.stat.keenT; settled += r.player.stat.settledT; n++; }
    rows[S.ROSTER[hi].name + ' (temperament ' + S.ROSTER[hi].attrs.tem + ')'] = { keenSeconds: +(keen / n).toFixed(1), settledSeconds: +(settled / n).toFixed(1) }; }
  console.table(rows);
}
