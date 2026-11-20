const { execFile } = require('child_process'); const path = require('path');
const file = process.argv[2] || 'index.html', mode = process.argv[3] || 'strategy', N = +(process.argv[4] || 4), K = require('os').cpus().length;
const t0 = Date.now();
Promise.all([...Array(K).keys()].map(k => new Promise((res, rej) => execFile('node', [path.join(__dirname, 'strat_worker.js'), file, k, K, N, mode], { maxBuffer: 1 << 26 }, (e, out) => e ? rej(e) : res(JSON.parse(out)))))).then(parts => {
  const rows = parts.flat();
  if (mode === 'strategy') {
    const g = {}; rows.forEach(r => { const key = r.lab + ' ' + r.d; (g[key] = g[key] || {}); (g[key][r.p] = g[key][r.p] || []).push(r); });
    const table = [], bestCount = {};
    for (const [key, ps] of Object.entries(g)) {
      const row = { race: key }; let best = null, bt = 1e9;
      for (const [p, rs] of Object.entries(ps)) { const pl = rs.reduce((s, r) => s + r.place, 0) / rs.length, t = rs.reduce((s, r) => s + r.t, 0) / rs.length; row[p] = pl.toFixed(1); if (t < bt) { bt = t; best = p; } }
      row.best = best; bestCount[best] = (bestCount[best] || 0) + 1; table.push(row);
    }
    console.log('avg finishing position (10 runners) by pacing plan, medium bots, average tapping'); console.table(table);
    console.log('fastest plan count:', bestCount);
  } else if (mode === 'difficulty') {
    const g = {}; rows.forEach(r => (g[r.grp] = g[r.grp] || []).push(r));
    const t = {}; for (const [d, rs] of Object.entries(g)) { const n = rs.length; t[d] = { races: n, winRate: Math.round(rs.reduce((s, r) => s + r.win, 0) / n * 100) + '%', top3: Math.round(rs.filter(r => r.place <= 3).length / n * 100) + '%', avgPlace: (rs.reduce((s, r) => s + r.place, 0) / n).toFixed(2) }; }
    console.log('Competent rider (zone-aware pacing, steering, good rhythm) vs each difficulty, mixed horses & trips:'); console.table(t);
  } else {
    const g = {}; rows.forEach(r => { const key = r.grp; (g[key] = g[key] || {}); (g[key][r.tk] = g[key][r.tk] || []).push(r); });
    for (const [grp, ts] of Object.entries(g)) {
      const t = {}; const none = ts.none.reduce((s, r) => s + r.t, 0) / ts.none.length;
      for (const [tk, rs] of Object.entries(ts)) { const n = rs.length, at = rs.reduce((s, r) => s + r.t, 0) / n; t[tk] = { avgTime: at.toFixed(2), vsNone: (at - none).toFixed(2), avgPlace: (rs.reduce((s, r) => s + r.place, 0) / n).toFixed(2), wins: rs.reduce((s, r) => s + r.win, 0), peakMom: (rs.reduce((s, r) => s + r.mom, 0) / n).toFixed(2), endS: (rs.reduce((s, r) => s + r.S, 0) / n).toFixed(0), endF: (rs.reduce((s, r) => s + r.F, 0) / n).toFixed(0) }; }
      console.log('SPRINT TEST:', grp); console.table(t);
    }
  }
  console.log('races', rows.length, 'elapsed', ((Date.now() - t0) / 1000).toFixed(0), 's');
});
