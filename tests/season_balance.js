// Balance check for the championship divisions using the real race engine (multi-process).
const { execFile } = require('child_process'), path = require('path');
const N = +(process.argv[2] || 14), W = +(process.argv[3] || 4);
const plan = [];
const sample = JSON.parse(process.env.SAMPLE || "{\"0\":[0,3,6,9],\"1\":[0,3,6,9],\"2\":[2,6,7,10]}");
const ratings = JSON.parse(process.env.RATINGS || "{\"0\":[66,70,74],\"1\":[70,74,78],\"2\":[76,80,84,88]}");
for (const d of Object.keys(sample).map(Number)) for (const rd of sample[d]) for (const rt of ratings[d]) plan.push({ div: d, round: rd, rating: rt });
const t0 = Date.now(); let rows = [], left = W;
for (let k = 0; k < W; k++) execFile('node', [path.join(__dirname, 'season_balance_worker.js'), k, W, N, JSON.stringify(plan)], { maxBuffer: 1 << 26 }, (e, so) => {
  if (e) { console.error(e); process.exit(1); }
  rows = rows.concat(JSON.parse(so));
  if (--left) return;
  const S = require('../public/season.js');
  const key = r => r.div + '|' + r.rating; const agg = {};
  for (const r of rows) { const a = agg[key(r)] = agg[key(r)] || { n: 0, w: 0, pod: 0, sum: 0, dnf: 0, by: {} }; a.n++; if (r.place === 1) a.w++; if (r.place && r.place <= 3) a.pod++; if (!r.place) a.dnf++; a.sum += r.place || 12;
    const nm = S.DIVS[r.div].rounds[r.round].name; const b = a.by[nm] = a.by[nm] || { n: 0, w: 0 }; b.n++; if (r.place === 1) b.w++; }
  for (const kk of Object.keys(agg)) { const [d, rt] = kk.split('|'), a = agg[kk];
    console.log(`${S.DIVS[d].short.padEnd(15)} rating ${rt}: win ${(100 * a.w / a.n).toFixed(0).padStart(3)}%  podium ${(100 * a.pod / a.n).toFixed(0).padStart(3)}%  avg place ${(a.sum / a.n).toFixed(1)}  dnf ${a.dnf}  · ` + Object.entries(a.by).map(([nm, b]) => nm.split(' ').slice(0, 2).join(' ') + ' ' + Math.round(100 * b.w / b.n) + '%').join(', ')); }
  console.log('races', rows.length, 'elapsed', ((Date.now() - t0) / 1000).toFixed(0), 's');
});
