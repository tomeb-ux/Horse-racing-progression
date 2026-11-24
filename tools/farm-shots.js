// Real in-game screenshots of the farm from the preset camera angles (and a few diagnostics), for visual review.
//   PORT=8095 node server/index.js ; PORT=8095 node tools/farm-shots.js <outDir> [view ...] [--w=1600 --h=900 --horses=5]
// With no view names it takes every preset. A career with five distinctly coloured horses is created so every box is occupied.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
const args = process.argv.slice(2), out = args.find(a => !a.startsWith('--') && !/^[a-z0-9]+$/i.test(a)) || args[0] || 'farm-shots', views = args.filter(a => !a.startsWith('--') && a !== out);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : null; };
const W = opt('w') || 1600, H = opt('h') || 900, NH = opt('horses') != null ? opt('horses') : 5;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(path.join(__dirname, '..', 'public', 'vendor', 'three.min.js')), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_quality', '"high"'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(BASE); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined');
  await p.evaluate(n => {
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2], maneCol: '#1a120c', tailCol: '#1a120c' }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0], maneCol: '#b7864a', tailCol: '#b7864a' },
      { type: 'grey', coat: '#b7b2a9', face: 'none', socks: [0, 0, 0, 0], maneCol: '#8c8984', tailCol: '#8c8984' }, { type: 'black', coat: '#211915', face: 'snip', socks: [0, 0, 1, 1], maneCol: '#0a0806', tailCol: '#0a0806' }, { type: 'brown', coat: '#5b3a24', face: 'stripe', socks: [1, 0, 0, 0], maneCol: '#2a1c10', tailCol: '#2a1c10' }];
    const names = ['Bay Majesty', 'Copper Coast', 'Silver Billabong', 'Midnight Comet', 'Wattle Flame'], mk = (i) => ({ id: 'h' + i, name: names[i], attrs: { top: 70 + i, acc: 68, end: 66 + i, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: ['#d62828', '#1d3557', '#2e8b57', '#e8c35a', '#7a4fd1'][i], silk2: '#f4f1ea', silkPat: ['hoops', 'sash', 'quartered', 'chevrons', 'stars'][i], born: 1, wins: i, races: 3 + i, history: [{ raceId: 'maiden', name: 'Maiden Plate', place: i + 1, field: 10, dnf: false, t: 1 }, { raceId: 'country', name: 'Country Cup', place: 2, field: 10, dnf: false, t: 2 }] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: Array.from({ length: n }, (_, i) => mk(i)), active: 0, trophies: [], wins: 14, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C));
  }, NH);
  await p.reload(); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined'); await p.evaluate(() => CAREER.open());
  const t0 = Date.now(); await p.evaluate(() => SCENES.enter('farm', { instant: true })); const buildMs = Date.now() - t0;
  const frames = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  await frames(8);
  const names = views.length ? views : await p.evaluate(() => FARM._test.presets);
  console.log(`farm built+entered in ${buildMs} ms; viewport ${W}×${H}`);
  for (const v of names) {
    const okv = await p.evaluate(v => FARM.view(v), v); if (!okv) { console.log('  unknown view', v); continue; }
    await frames(6);
    const st = await p.evaluate(() => FARM.stats());
    await p.screenshot({ path: path.join(out, v + '.png') });
    console.log(`  ${v.padEnd(11)} draw calls ${String(st.calls).padStart(3)} · triangles ${(st.tris / 1000).toFixed(0).padStart(4)}k · geometries ${st.geos}`);
  }
  if (errs.length) console.log('ERRORS:', errs.slice(0, 5));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
