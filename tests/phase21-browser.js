// Phase 21 in the real game: the betting board in the mounting yard (display only), floodlight towers at evening meetings (and only then), no extra cost by day.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase21-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1000, height: 620 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_crowd', '"light"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_autoReplay', 'false'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE); await p.waitForFunction(() => typeof PRESENT !== 'undefined' && typeof startRace === 'function' && typeof VENUES !== 'undefined');
  await p.evaluate(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; });
  console.log('— the betting board');
  await p.evaluate(() => startRace(Object.assign(quickCfg(), { distance: 1200, track: 'randwick', field: 12, career: { name: 'The Everest', major: true, crown: true, prize: '$20,000,000' } }))); await sleep(1500);
  const o = await p.evaluate(() => { const el = document.getElementById('prOdds'); return { hidden: el.hidden, rows: el.querySelectorAll('div.r').length, me: el.querySelectorAll('div.me').length, txt: el.innerText.replace(/\n+/g, ' | '), player: race.player.def.name }; });
  ok(!o.hidden && o.rows >= 8 && o.me === 1 && o.txt.includes(o.player), `the board lists the runners with your horse marked (${o.rows} rows): ${o.txt.slice(0, 110)}`);
  const pr = await p.evaluate(() => [...document.querySelectorAll('#prOdds div.r span:last-child')].map(x => parseFloat(x.textContent.replace('$', ''))).filter(x => !isNaN(x)));
  ok(pr.length >= 8 && pr.every((x, i) => i === 0 || x >= pr[i - 1]) && pr[0] >= 1.3, `prices run from the favourite up (${pr.slice(0, 5).join(', ')} …)`);
  ok(await p.evaluate(() => !document.querySelector('#prOdds button, #prOdds input')), 'it is display only: nothing to click, no betting');
  await p.keyboard.press('Space'); await sleep(400); ok(await p.evaluate(() => document.getElementById('prOdds').hidden), 'the board goes away with the parade');
  console.log('\n— floodlights');
  const flood = async tod => p.evaluate(tod => { startRace(Object.assign(quickCfg(), { distance: 1200, track: 'generic', field: 8, career: { name: 'Dubbo Cup', venue: 'Dubbo', tod, venueStyle: { style: 'country', town: 'Dubbo', variant: 0 } } })); return new Promise(r => setTimeout(() => { VENUES.update(1); const g = VENUES.current && VENUES.current.userData.flood; r({ has: !!g, vis: g ? g.visible : null, kids: g ? g.children.length : 0, atmo: GFX.atmo && GFX.atmo.tod }); }, 600)); }, tod);
  let f = await flood('evening'); ok(f.has && f.vis && f.kids === 3 && f.atmo === 'evening', `an evening meeting has floodlights (3 draws: poles, lamps, halos) — atmosphere ${f.atmo}`);
  f = await flood('dusk'); ok(f.vis, 'dusk too');
  f = await flood('midday'); ok(f.has && f.vis === false, 'a midday meeting hides them (nothing drawn by day)');
  f = await flood('golden_hour'); ok(f.vis === false, 'golden hour is still daylight: no floodlights');
  ok(await p.evaluate(() => { const g = VENUES.current.userData.flood; let n = 0; g.traverse(o => { if (o.isMesh || o.isPoints) n++; }); return n === 3; }), 'three renderable objects in all');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
