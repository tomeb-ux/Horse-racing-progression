// start outcomes: time to reach 20/50/100 m and lengths gained vs a GOOD break; same seeds, only the break differs
const S = require('./loadsim')(process.argv[2]); const X = S.extra;
const cats = [['PERFECT', 0.9, 0.17], ['GOOD', 0.65, 0.28], ['SLOW', 0.42, 0.45], ['MISSED', 0.15, 1.1]];
const horses = [[0, 'Desert Comet (start 88)'], [4, 'Bay Majesty (start 70)'], [8, 'Midnight Ember (start 48)']];
const rows = {};
for (const [hi, hl] of horses) {
  const res = {};
  for (const [cat, q, rt] of cats) {
    let t = { 20: 0, 50: 0, 100: 0 }, pos = 0, fin = {}, n = 0;
    for (const dist of [1000, 3200]) fin[dist] = 0;
    for (let s = 0; s < 6; s++) for (const dist of [1000, 3200]) {
      const R = S.Race, orig = R.prototype.simStep; const marks = {};
      R.prototype.simStep = function (dt) { orig.call(this, dt); const p = this.player; for (const m of [20, 50, 100]) if (marks[m] == null && p.progress >= m) marks[m] = this.clock; if (marks.p100 == null && p.progress >= 100) marks.p100 = p.rank; };
      const r = X.simRace({ distance: dist, horse: hi, diff: 'medium', seed: 4000 + s * 13 + hi, pacing: 'reactive', tapping: 'average', startQ: q, react: rt });
      R.prototype.simStep = orig;
      if (dist === 1000) { for (const m of [20, 50, 100]) t[m] += marks[m]; pos += marks.p100; n++; }
      fin[dist] += r.finishOrder.indexOf(r.player) + 1;
    }
    res[cat] = { t20: t[20] / n, t50: t[50] / n, t100: t[100] / n, posAt100m: pos / n, place1000: fin[1000] / 6, place3200: fin[3200] / 6 };
  }
  for (const [cat] of cats) {
    const r = res[cat], g = res.GOOD, L = m => ((g['t' + m] - r['t' + m]) * 16 / 2.4);   // lengths ahead of a GOOD break at ~16 m/s
    rows[hl + ' · ' + cat] = { 'at 20m (L)': +L(20).toFixed(1), 'at 50m (L)': +L(50).toFixed(1), 'at 100m (L)': +L(100).toFixed(1), 'pos @100m': +r.posAt100m.toFixed(1), '1000m place': +r.place1000.toFixed(1), '3200m place': +r.place3200.toFixed(1) };
  }
}
console.log('Lengths ahead (+) / behind (−) of a GOOD break at the same horse, 10-runner medium fields, 6 seeds each'); console.table(rows);
