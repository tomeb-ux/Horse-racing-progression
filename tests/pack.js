// pack tactics: what bots choose at the home turn and what it costs/earns them; ground lost by running wide
const S = require('./loadsim')(process.argv[2]); const X = S.extra, R = S.Race;
const diffs = ['easy', 'medium', 'hard'], dists = [1200, 1600, 2000, 2400];
const by = {}, byDiff = { easy: {}, medium: {}, hard: {} };
let boxedFinal = 0, nH = 0, overtakes = 0, races = 0;
for (let s = 0; s < 144; s++) {
  const diff = diffs[s % 3], dist = dists[(s >> 2) % 4];
  const snap = new Map();
  const orig = R.prototype.simStep;
  R.prototype.simStep = function (dt) {
    orig.call(this, dt);
    for (const h of this.horses) {
      const rem = this.dist - h.progress;
      if (!snap.has(h) && rem < 760) snap.set(h, { rank: h.rank, gl: h.groundLost, blk: 0 });
      const sn = snap.get(h); if (sn && h.blocked && rem > 0) sn.blk += dt;
    }
  };
  const r = X.simRace({ distance: dist, horse: s % 12, diff, seed: 7100 + s * 37 });
  R.prototype.simStep = orig; races++;
  for (const h of r.horses) {
    if (!h.bot || !h.bot.fb) continue;
    const sn = snap.get(h); if (!sn) continue;
    const place = r.finishOrder.indexOf(h) + 1, k = h.bot.fb;
    const o = by[k] || (by[k] = { n: 0, gained: 0, glBend: 0, blocked: 0, wins: 0 });
    o.n++; o.gained += sn.rank - place; o.glBend += h.groundLost - sn.gl; o.blocked += sn.blk; if (place === 1) o.wins++;
    byDiff[diff][k] = (byDiff[diff][k] || 0) + 1;
    nH++; if (sn.blk > 2) boxedFinal++;
    overtakes += h.stat.overtakes || 0;
  }
}
const rows = {}; for (const k in by) { const o = by[k]; rows[k] = { share: (o.n / nH * 100).toFixed(0) + '%', 'places gained from 760m': +(o.gained / o.n).toFixed(2), 'extra metres wide (final bend+)': +(o.glBend / o.n).toFixed(1), 'seconds blocked': +(o.blocked / o.n).toFixed(1), 'win %': (o.wins / o.n * 100).toFixed(1) }; }
console.log(`Home-turn decisions by bot riders (${races} races, ${nH} rides)`); console.table(rows);
console.log('choice mix by difficulty:', JSON.stringify(byDiff));
console.log('rides boxed > 2 s from the home turn:', (boxedFinal / nH * 100).toFixed(1) + '%', '· overtakes per horse:', (overtakes / nH).toFixed(1));
// geometry: ground covered per bend by lane (π·(R + offset))
const geo = {}; for (const lane of [0, 2, 4, 6, 8]) { const off = 1.7 + lane * 1.9; geo['lane ' + lane] = { 'extra m per bend vs rail': +(Math.PI * (off - 1.7)).toFixed(1), 'lengths': +(Math.PI * (off - 1.7) / 2.5).toFixed(1) }; }
console.log('Ground cost of racing wide (one 180° bend):'); console.table(geo);
