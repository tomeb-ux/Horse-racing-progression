// Phase 5 review screenshots, taken in the real game: the menu over the property, walking (first / third person), the character in its three
// outfits, the farmhouse interior, the race-calendar board and booking screen, the wardrobe, and the loading / drive-off sequence.
//   PORT=8095 node server/index.js ; PORT=8095 node tools/phase5-shots.js <outDir> [--w=1600 --h=900]
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
const args = process.argv.slice(2), out = args.find(a => !a.startsWith('--')) || 'phase5-shots';
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : null; };
const W = opt('w') || 1440, H = opt('h') || 810;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(path.join(__dirname, '..', 'public', 'vendor', 'three.min.js')), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_quality', '"high"'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  const frames = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  const shot = async n => { await frames(4); await p.screenshot({ path: path.join(out, n + '.png') }); console.log('  ' + n); };
  await p.goto(BASE); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined');
  await p.evaluate(() => {
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0] }, { type: 'grey', coat: '#b7b2a9', face: 'none', socks: [0, 0, 0, 0] }, { type: 'black', coat: '#211915', face: 'snip', socks: [0, 0, 1, 1] }, { type: 'brown', coat: '#4a2f1d', face: 'stripe', socks: [1, 1, 0, 0] }];
    const names = ['Bay Majesty', 'Copper Coast', 'Silver Billabong', 'Midnight Comet', 'Wattle Flame'], mk = i => ({ id: 'h' + i, name: names[i], attrs: { top: 70 + i, acc: 68, end: 66 + i, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: ['#d62828', '#1f5fa8', '#e8c35a', '#2f6b4a', '#7a3a8a'][i], silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [{ raceId: 'maiden', name: 'Maiden Plate', place: i + 1, field: 10, dnf: false, t: 1 }] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: [0, 1, 2, 3, 4].map(mk), active: 0, trophies: [], wins: 14, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C));
  });
  await p.reload(); await p.waitForFunction(() => typeof FARM !== 'undefined' && FARM.showcase, null, { timeout: 90000 });
  console.log('the main menu, over the property');
  await frames(8); await shot('01-menu');
  await p.evaluate(() => { const t0 = performance.now(); window.__t = t0; }); await p.waitForTimeout(600); await frames(3);
  await p.evaluate(() => document.getElementById('btnQuick').click()); await frames(3); await shot('02-menu-quick-race-select');
  await p.evaluate(() => show('menu')); await p.evaluate(() => document.getElementById('btnSettings').click()); await frames(3); await p.evaluate(() => { const e = document.getElementById('optPerson'); if (e) e.scrollIntoView(); }); await shot('03-settings');
  await p.evaluate(() => show('menu'));
  console.log('career mode: onto the farm');
  await p.evaluate(() => document.getElementById('btnCareer').click()); await p.waitForFunction(() => FARM.active, null, { timeout: 60000 }); await frames(6);
  await shot('04-farm-third-person-start');
  await p.evaluate(() => { FARM._test.setPos(0.5, -12); FARM._test.ctx.CAM.yaw = 0.4; FARM._test.ctx.CAM.pitch = -0.2; }); await frames(25); await shot('05-farm-third-person-courtyard');
  await p.keyboard.press('v'); await p.evaluate(() => { FARM._test.setPos(2, -13); FARM._test.ctx.CAM.yaw = -0.15; FARM._test.ctx.CAM.pitch = 0.04; }); await frames(4); await shot('06-farm-first-person-stalls');
  await p.keyboard.press('v');
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'office'); FARM._test.setPos(o.x + 3, o.z + 2.4); FARM._test.ctx.CAM.yaw = -1.2; FARM._test.ctx.CAM.pitch = -0.15; }); await frames(30); await shot('07-farmhouse-front-steps');
  console.log('the character, in each outfit');
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'office'); FARM._test.setPos(o.x + 1.0, o.z); }); await frames(2);
  await p.keyboard.press('e'); await frames(3); await p.evaluate(() => FARM._test.skipFade()); await frames(3);
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'mirror'); FARM._test.setPos(o.x, o.z); }); await frames(2);
  await p.keyboard.press('e'); await frames(30);
  await shot('08-wardrobe');
  for (const [k, o] of [['stable', 'stable'], ['riding', 'training'], ['raceday', 'raceday']]) {
    await p.evaluate(o => { CAREER.setPlayer({ outfit: o }); FARM._test.ctx.refreshFigure(); document.getElementById('farmPanel').style.visibility = 'hidden'; }, o); await frames(40); await shot('09-character-' + k);
    await p.evaluate(() => { document.getElementById('farmPanel').style.visibility = 'visible'; });
  }
  await p.evaluate(() => { CAREER.setPlayer({ outfit: 'stable' }); FARM._test.ctx.refreshFigure(); }); await p.keyboard.press('Escape'); await frames(3);
  console.log('inside the farmhouse');
  for (const v of ['room', 'room2', 'board', 'desk', 'cabinet', 'sofa']) { await p.evaluate(v => FARM.view(v), v); await frames(4); await shot('10-house-' + v); }
  console.log('the calendar');
  await p.evaluate(() => { FARM.view(null); const o = FARM._test.points.find(x => x.id === 'board'); FARM._test.setPos(o.x, o.z); FARM._test.ctx.CAM.yaw = 0; FARM._test.ctx.CAM.pitch = -0.1; }); await frames(3);
  await p.keyboard.press('e'); await frames(4); await shot('11-calendar-open');
  await p.evaluate(() => { document.querySelectorAll('#farmPanel .hc')[1].click(); document.getElementById('fuBook').click(); }); await frames(3); await shot('12-calendar-booked');
  await p.keyboard.press('Escape'); await frames(3); await p.evaluate(() => { FARM.view('board'); }); await frames(5); await shot('13-board-after-booking');
  console.log('loading up and driving off');
  await p.evaluate(() => { FARM.view(null); FARM._test.exitHouse(); }); await frames(3); await p.evaluate(() => FARM._test.skipFade()); await frames(2);
  await p.evaluate(() => { const T = FARM._test.TRAVEL; FARM._test.setPos(T.x - 1, T.z); FARM._test.ctx.CAM.yaw = 2.6; FARM._test.ctx.CAM.pitch = -0.2; }); await frames(25); await shot('14-float-prompt');
  await p.keyboard.press('e'); await frames(3);
  const adv = async (sec, name) => { await p.evaluate(sec => { for (let k = 0; k < Math.round(sec / 0.1); k++) FARMTRIP.frame(0.1); }, sec); await frames(3); if (name) await shot(name); };
  await adv(3.3, '15-trip-lead'); await adv(1.6, '16-trip-lead-ramp'); await adv(2.2, '17-trip-ramp-up'); await adv(3.4, '18-trip-walk-to-ute'); await adv(2.5, '19-trip-drive-away'); await adv(3.5, '20-trip-drive-chase'); await adv(2.0, '21-trip-leaving');
  console.log('no errors:', errs.length === 0, errs.slice(0, 3));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
