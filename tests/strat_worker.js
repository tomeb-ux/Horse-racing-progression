const S = require('./loadsim')(process.argv[2]); const X = S.extra;
const [k, K, N, mode] = [+process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]];
const out = [];
if (mode === 'strategy') {
  const types = [[0, 'Sprinter'], [4, 'All-rounder'], [2, 'Finisher'], [1, 'Stayer']], dists = [1000, 1600, 2400, 3200];
  const jobs = []; for (const t of types) for (const d of dists) for (const p of Object.keys(X.PACING)) for (let s = 0; s < N; s++) jobs.push([t, d, p, s]);
  for (let i = k; i < jobs.length; i += K) { const [[hi, lab], d, p, s] = jobs[i]; const r = X.simRace({ distance: d, horse: hi, diff: 'medium', seed: 900 + s * 13 + d, pacing: p, tapping: 'average' }); out.push({ lab, d, p, place: r.finishOrder.indexOf(r.player) + 1, t: r.player.finishTime }); }
} else if (mode === 'difficulty') {
  // a competent rider (zone-aware pacing, steering, good taps) vs each difficulty
  const jobs = []; for (const diff of ['easy', 'medium', 'hard']) for (let s = 0; s < N; s++) jobs.push([diff, s]);
  const dists = [1000, 1200, 1600, 2000, 2400, 3200];
  for (let i = k; i < jobs.length; i += K) { const [diff, s] = jobs[i]; const d = dists[s % dists.length], hi = (s * 5) % 12; const r = X.simRace({ distance: d, horse: hi, diff, seed: 7000 + s * 101, pacing: d >= 2400 ? 'steady' : 'reactive', tapping: 'good' }); out.push({ grp: diff, tk: 'good', place: r.finishOrder.indexOf(r.player) + 1, t: r.player.finishTime, win: r.finishOrder[0] === r.player ? 1 : 0, S: r.player.S, F: r.player.F, mom: r.player.stat.peakMom }); }
} else {
  // sprint: identical seeds; vary tapping only. Plus fatigue control.
  const jobs = [];
  for (const tk of Object.keys(X.TAPPING)) for (let s = 0; s < N; s++) { jobs.push(['fresh', 4, 1600, 'lateKick', tk, s]); jobs.push(['spent', 4, 1600, 'flatOut', tk, s]); jobs.push(['finisher', 2, 2000, 'lateKick', tk, s]); }
  for (let i = k; i < jobs.length; i += K) { const [grp, hi, d, pace, tk, s] = jobs[i]; const r = X.simRace({ distance: d, horse: hi, diff: 'medium', seed: 500 + s * 31, pacing: pace, tapping: tk }); out.push({ grp, tk, place: r.finishOrder.indexOf(r.player) + 1, t: r.player.finishTime, win: r.finishOrder[0] === r.player ? 1 : 0, S: r.player.S, F: r.player.F, mom: r.player.stat.peakMom }); }
}
process.stdout.write(JSON.stringify(out));
