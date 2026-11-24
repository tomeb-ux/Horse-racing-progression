// The single-file build (dist/final-furlong-single.html) opened straight from disk, with no server: the game boots, the career core is
// inlined, an old v3 save is migrated (with its backup), the Office opens, and multiplayer is hidden.
//   node tools/build-single.js && node tests/single-browser.js
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const FILE = path.join(__dirname, '..', 'dist', 'final-furlong-single.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (!fs.existsSync(FILE)) { console.log('dist/final-furlong-single.html is missing — run node tools/build-single.js first'); process.exit(1); }
  const html = fs.readFileSync(FILE, 'utf8');
  ok(/const CORE = \(\(\) =>/.test(html) && !/<script src="career-core\.js">/.test(html) && !/<script src="career\.js">/.test(html), 'career-core.js is inlined in the single file (no external script tags left for it)');
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
  const three = path.join(__dirname, '..', 'public', 'vendor', 'three.min.js');
  if (fs.existsSync(three)) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(three), contentType: 'text/javascript' }));
  await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto('file://' + FILE); await p.waitForFunction(() => typeof CAREER !== 'undefined' && typeof CORE !== 'undefined' && typeof SEASON !== 'undefined', null, { timeout: 30000 });
  // an existing v3 career, as the previous build stored it
  const v3 = await p.evaluate(() => { const C = { v: 3, seed: 31337, stable: 'Single File Stable', horses: [{ id: 'hS1', name: 'Keep Me', attrs: { top: 72, acc: 70, end: 68, spr: 71, rec: 66, tem: 64, agi: 63, sta: 65 }, pot: { top: 90, acc: 85, end: 80, spr: 88, rec: 76, tem: 75, agi: 72, sta: 79 }, look: { type: 'chestnut', coat: '#93502a', face: 'star', socks: [0, 2, 0, 1] }, xp: 10, trainPts: 2, lvl: 3, races: 5, wins: 2, places: 4, podiums: 3, prize: 80000, history: [] }], active: 0, trophies: [], wins: 2, history: [], season: null, created: 1 };
    SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C)); return JSON.stringify(C); });
  await p.reload(); await p.waitForFunction(() => typeof CAREER !== 'undefined');
  await p.evaluate(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; CAREER.open(); }); await sleep(300);
  const r = await p.evaluate(() => { const C = CAREER.data; return { v: C.v, cash: C.cash, name: C.horses[0].name, attrs: JSON.stringify(C.horses[0].attrs), look: C.horses[0].look.face + C.horses[0].look.socks.join(''), age: C.horses[0].age, bk: localStorage.getItem('ff_career_v3_backup'), mp: FF_FEATURES.multiplayer, btn: document.getElementById('btnMP').hidden, date: document.getElementById('hubDate').textContent, hubCash: document.getElementById('hubCash').textContent }; });
  ok(r.v === 4 && r.name === 'Keep Me' && r.attrs === '{"top":72,"acc":70,"end":68,"spr":71,"rec":66,"tem":64,"agi":63,"sta":65}' && r.look === 'star0201' && r.age === 3, 'the single-file build upgrades a v3 save to v4 and keeps the horse, attributes and look');
  ok(r.bk === v3 && r.cash === 158000 && r.hubCash === '$158,000' && r.date === 'Sat 1 Aug 2026', `the v3 backup is the untouched original text; cash $${r.cash.toLocaleString()} and the date show on the hub`);
  ok(r.mp === false && r.btn === true, 'multiplayer is hidden in the single file');
  await p.evaluate(() => CAREER._test.openOffice()); await sleep(150);
  ok(await p.evaluate(() => ui.state === 'c_office' && /Starting funds/.test(document.getElementById('car_office').textContent)), 'the Office opens in the single file');
  // a save from a NEWER game version must never be silently rewritten by this build: it is backed up first
  const v5 = await p.evaluate(() => { const C = JSON.parse(localStorage.getItem('ff_career')); C.v = 5; C.futureField = { keep: 1 }; const t = JSON.stringify(C); localStorage.setItem('ff_career', t); return t; });
  await p.reload(); await p.waitForFunction(() => typeof CAREER !== 'undefined'); await p.evaluate(() => { renderer.render = () => {}; CAREER.open(); });
  ok(await p.evaluate(t => localStorage.getItem('ff_career_v5_backup') === t, v5), 'a save marked as a newer version is backed up byte-for-byte before this build touches it');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
