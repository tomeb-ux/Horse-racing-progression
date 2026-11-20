const S = require('./loadsim')(process.argv[2]); const X = S.extra, R = S.Race;
const diffs = ['easy', 'medium', 'hard'], dists = [1000, 1200, 1400, 1600, 2000, 2400, 3200], goings = ['firm', 'good', 'soft', 'heavy'];
const orig = R.prototype.initRec; R.prototype.initRec = function () { this.dbg = []; orig.call(this); };
for (let s = 0; s < 120; s++) {
  const diff = diffs[s % 3], dist = dists[(s * 5) % 7], going = goings[(s * 3 + (s >> 2)) % 4];
  const r = X.simRace({ distance: dist, horse: s % 12, diff, going, seed: 20000 + s * 7919 });
  if (r.emerg > 0) { console.log('race', s, dist, diff, going, 'emerg', r.emerg); r.dbg.slice(0, 8).forEach(x => console.log(JSON.stringify(x))); break; }
}
