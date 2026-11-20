// worker: runs a slice of the field-test matrix and prints JSON rows
const S = require('./loadsim')(process.argv[2]); const X = S.extra;
const [k, K, n] = [+process.argv[3], +process.argv[4], +process.argv[5]];
const diffs = ['easy', 'medium', 'hard'], dists = [1000, 1200, 1400, 1600, 2000, 2400, 3200], goings = ['firm', 'good', 'soft', 'heavy'];
const jobs = [];
for (let s = 0; s < n; s++) { const diff = diffs[s % 3], dist = dists[(s * 5) % 7], going = goings[(s * 3 + (s >> 2)) % 4]; jobs.push({ s, diff, dist, going }); }
const rows = [];
for (let i = k; i < jobs.length; i += K) {
  const j = jobs[i];
  const r = X.simRace({ distance: j.dist, horse: j.s % 12, diff: j.diff, going: j.going, seed: 20000 + j.s * 7919 });
  rows.push(Object.assign({ diff: j.diff, dist: j.dist, going: j.going }, X.raceStats(r)));
}
process.stdout.write(JSON.stringify(rows));
