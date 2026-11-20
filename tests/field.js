// master: N all-bot races in parallel workers, then aggregate
const { execFile } = require('child_process'); const path = require('path');
const file = process.argv[2] || 'index.html', N = +(process.argv[3] || 520), K = require('os').cpus().length;
const S = require('./loadsim')(file); const X = S.extra;
const t0 = Date.now();
Promise.all([...Array(K).keys()].map(k => new Promise((res, rej) => execFile('node', [path.join(__dirname, 'field_worker.js'), file, k, K, N], { maxBuffer: 1 << 26 }, (e, out) => e ? rej(e) : res(JSON.parse(out))))))
  .then(parts => {
    const rows = parts.flat();
    const sum = X.summarise(rows);
    const by = (key) => { const g = {}; rows.forEach(r => (g[r[key]] = g[r[key]] || []).push(r)); return Object.fromEntries(Object.entries(g).map(([k, v]) => { const s = X.summarise(v); return [k, { races: s.races, closeUnder05s: s.closeUnder05s, avgLeadChanges: s.avgLeadChanges, avgSpread: s.avgFieldSpreadS, topStyle: Object.entries(s.winByStyle)[0].join(' '), topHorse: Object.entries(s.winByHorse)[0].join(' ') }]; })); };
    console.log(JSON.stringify(sum, null, 1));
    console.log('BY DISTANCE'); console.table(by('dist'));
    console.log('BY DIFFICULTY'); console.table(by('diff'));
    console.log('BY GOING'); console.table(by('going'));
    console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(0), 's on', K, 'workers');
    require('fs').writeFileSync(path.join(__dirname, 'field_last.json'), JSON.stringify({ sum, rows }, null, 0));
  });
