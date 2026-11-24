// Phase 10 in the real game: the horse market (Office and empty box), listings and bands, bidding, buying, selling, the custom-horse fee, five-horse cap, save round-trip.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase10-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  if (fs.existsSync(__dirname + '/../public/vendor/three.min.js')) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_parade', '"off"'); localStorage.setItem('ff_celebrate', 'false'); localStorage.setItem('ff_autoReplay', 'false'); window.__noPresent = true; });
  const errs = []; const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  const ev = (f, a) => p.evaluate(f, a), frames = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  const step = (dt, n) => ev(([dt, n]) => FARM._test.step(dt, n), [dt, n]), run = sec => step(0.05, Math.ceil(sec / 0.05));
  const key = async (k, n) => { await p.keyboard.press(k); await step(0.05, n || 3); };
  await p.goto(BASE); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined' && FARM.showcase, null, { timeout: 90000 });
  await ev(() => {
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0] }], names = ['Bay Majesty', 'Copper Coast'];
    const mk = i => ({ id: 'h' + i, name: names[i], attrs: { top: 72, acc: 68, end: 66, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: [mk(0), mk(1)], active: 0, trophies: [], wins: 5, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;

  const txt = () => ev(() => document.body.innerText), click = sel => ev(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel), settle = () => frames(3);
  const top = async () => ev(() => ({ ui: ui.state, cash: CAREER.data.cash, n: CAREER.data.horses.length, slots: CAREER.market.slots(), listings: CAREER.data.market.listings.length }));
  await ev(() => { const C = CAREER.data; C.wins = 7; CORE.apply(C, 'test:fund', 400000, 'gift', 'test funds'); CAREER.openScreen('office'); }); await p.waitForFunction(() => document.getElementById('ofMarket'), null, { timeout: 20000 }); await settle();

  console.log('\n— the market from the Office');
  s = await txt(); ok(/Horse market/i.test(s) && /Open the horse market/i.test(s), 'the Office has a Horse market panel'); await click('#ofMarket'); await p.waitForFunction(() => document.getElementById('mkBack'), null, { timeout: 20000 }); await settle();
  s = await txt(); ok(/Horse Market/i.test(s) && /Young prospect|Developing|Race-ready|Late bloomer|Established/i.test(s) && /Ability now/i.test(s) && /Potential/i.test(s) && /Temperament/i.test(s) && /Suits/i.test(s), 'the market lists horses with ability and potential ranges, the trip they suit and their temperament');
  s = await ev(() => ({ cards: document.querySelectorAll('[data-card]').length, ranges: [...document.querySelectorAll('[data-card]')].every(c => /Ability now\s*\d+–\d+/.test(c.innerText) && /Potential\s*\d+–\d+/.test(c.innerText)) })); ok(s.cards === 6 && s.ranges, `six cards, each with ability and potential as ranges (${s.cards})`);
  s = await ev(() => { const L = CAREER.data.market.listings[0]; const t = document.getElementById('car_market').innerText; return { exact: Object.values(L.attrs).every(v => new RegExp('\\b' + v + '\\b').test(t)) }; }); ok(!s.exact, 'the true attribute numbers are not shown');
  // offer: a poor one is rejected, a good one is countered, accepting buys it
  const L0 = await ev(() => { const L = CAREER.data.market.listings[0]; return { id: L.id, name: L.name, ask: L.ask }; });
  await click(`[data-mkask="${L0.id}"]`); await p.waitForFunction(() => document.getElementById('mkOffer'), null, { timeout: 5000 }); await settle();
  await ev(a => { document.getElementById('mkOffer').value = 100; document.querySelector(`[data-mkoffer="${a}"]`).click(); }, L0.id); await settle(); s = await txt(); ok(/far below/i.test(s) && /2 rounds left/i.test(s), 'a very low offer is refused and uses a round');
  const raw = await ev(id => { const L = CAREER.data.market.listings.find(l => l.id === id); return { T: Math.round(L.reserve * (1 + 0.05 * L.heat) / 50) * 50 }; }, L0.id);
  await ev(([a, price]) => { document.getElementById('mkOffer').value = price; document.querySelector(`[data-mkoffer="${a}"]`).click(); }, [L0.id, Math.round(raw.T * 0.88 / 50) * 50]); await settle(); s = await txt(); ok(/will take/i.test(s) && /Accept their/i.test(s), 'a close offer is answered with a counter-offer you can accept');
  const c0 = await top(); await click('[data-mkbuy^="' + L0.id + ':"]'); await settle(); const c1 = await top(); s = await ev(name => ({ has: CAREER.data.horses.some(h => h.name === name), led: CAREER.data.ledger.slice(-1)[0] }), L0.name);
  ok(s.has && c1.n === c0.n + 1 && c1.cash < c0.cash && s.led.kind === 'horse' && s.led.amount === c1.cash - c0.cash && c1.listings === c0.listings - 1, `accepting buys ${L0.name}: ${c0.n} → ${c1.n} horses, ${c0.cash - c1.cash} paid, one ledger line`);
  s = await txt(); ok(/Bought!/i.test(s) && /is in your stable/i.test(s), 'the market confirms the purchase');
  s = await ev(() => ({ asks: [...document.querySelectorAll('[data-mkbuy]')].every(b => b.disabled), msg: /no free box/i.test(document.body.innerText) })); ok(s.asks && s.msg, 'with every unlocked box full, buying is disabled and the market says why');
  ok(await ev(() => { const r = CAREER.market.buy(CAREER.data.market.listings[0].id, CAREER.data.market.listings[0].ask); return !r.ok && r.reason === 'box'; }), 'and the API refuses too');

  console.log('\n— selling');
  await click('[data-mktab="sell"]'); await settle(); s = await txt(); ok(/Sell…/i.test(s) && /agent/i.test(s), 'the Sell tab lists your horses with an offer for each');
  const sellId = await ev(() => CAREER.data.horses[1].id), q = await ev(id => CAREER.market.quote(id), sellId), cs0 = await top();
  await click(`[data-mkconfirm="${sellId}"]`); await settle(); s = await txt(); ok(/Confirm sale/i.test(s), 'Sell asks for confirmation first'); ok((await top()).n === cs0.n, 'nothing is sold until you confirm');
  await click(`[data-mksell="${sellId}"]`); await settle(); const cs1 = await top(); ok(cs1.n === cs0.n - 1 && cs1.cash === cs0.cash + q.price, `confirming sells it for the quoted ${q.price}`); s = await txt(); ok(/Sold\./i.test(s), 'the market confirms the sale');
  await ev(() => { const C = CAREER.data; CAREER.market.sell(C.horses[C.horses.length - 1].id); }); s = await ev(() => CAREER.market.quote(CAREER.data.horses[0].id).blocked); ok(s === 'last', 'your last horse cannot be sold'); s = await txt(); ok(/your last horse/i.test(s), 'and the screen says so');
  ok(await ev(() => CORE.audit(CAREER.data).length === 0), 'the ledger audits clean');

  console.log('\n— the custom horse costs a fee');
  await click('[data-mktab="create"]'); await settle(); s = await txt(); const fee = await ev(() => CAREER.market.fee()); ok(fee > 0 && s.includes(fee.toLocaleString('en-AU')) && /Open the creator/i.test(s), `the Create tab shows the fee ($${fee.toLocaleString('en-AU')})`);
  const c2 = await top(); await click('#mkCreate'); await p.waitForFunction(() => document.querySelector('[data-step="5"]'), null, { timeout: 20000 }); await settle();
  await ev(() => { const T = CAREER._test, d = T.draft, keys = Object.keys(d.attrs); d.name = SEASON.PLAYER_NAMES.find(n => !CAREER.data.horses.some(h => h.name === n)); let left = T.START_POOL; for (const k of keys) d.attrs[k] = T.BASE; for (let g = 0; left > 0 && g < 2000; g++) { const k = keys[g % keys.length]; if (d.attrs[k] < T.START_CAP) { d.attrs[k]++; left--; } } left = T.POT_POOL; for (const k of keys) d.hr[k] = 0; for (let g = 0; left > 0 && g < 2000; g++) { const k = keys[g % keys.length]; if (d.attrs[k] + d.hr[k] < T.POT_CAP) { d.hr[k]++; left--; } } d.step = 5; document.querySelector('[data-step="5"]').click(); });
  await settle(); s = await txt(); ok(/Confirm & pay/i.test(s) && s.includes(fee.toLocaleString('en-AU')), 'the creator\'s last step shows the fee on the confirm button');
  await click('#cDone'); await settle(); await frames(4); const c3 = await top(); ok(c3.n === c2.n + 1 && c3.cash === c2.cash - fee, `confirming charges the fee (${c2.cash} → ${c3.cash}) and adds the horse`); ok(await ev(() => CORE.audit(CAREER.data).length === 0 && CAREER.data.ledger.slice(-1)[0].kind === 'horse'), 'one ledger line, audit clean');
  await ev(() => { const C = CAREER.data; CORE.apply(C, 'test:burn', -(C.cash - 1000), 'buy', 'burn'); C.wins = 12; });
  await ev(() => { CAREER.openScreen('office'); }); await p.waitForFunction(() => document.getElementById('ofMarket'), null, { timeout: 20000 }); await click('#ofMarket'); await settle(); await click('[data-mktab="create"]'); await settle();
  s = await ev(() => document.getElementById('mkCreate').disabled); ok(s, 'with too little cash the creator button is disabled');

  console.log('\n— the empty box on the farm and the save');
  await ev(() => { const C = CAREER.data; CORE.apply(C, 'test:fund2', 300000, 'gift', 'test funds'); }); await click('#mkBack'); await settle(); await ev(() => { CAREER.hidePanel(); SCENES.enter('farm', { instant: true }); }); await frames(4); await ev(() => { window.__rr = window.__rr || renderer.render.bind(renderer); renderer.render = () => {}; }); await step(0.05, 6);
  s = await ev(() => FARMCARE.points().filter(p => p.id === 'vacant').map(p => p.text)); ok(s.length === 1 && /horse market/i.test(s[0]), `an empty box on the farm points to the market: "${s[0]}"`);
  await ev(() => { const v = FARMCARE.points().find(p => p.id === 'vacant'); FARM._test.setPos(v.x, v.z); }); await step(0.05, 4); await key('e', 3); await frames(3); s = await ev(() => ({ screen: !!document.querySelector('#car_market:not([hidden])') })); ok(s.screen, 'E at an empty box opens the horse market');
  s = await ev(() => { const C = CAREER.data; const before = JSON.stringify(C.market.listings.map(l => [l.id, l.ask])), c2 = JSON.parse(JSON.stringify(C)); CORE.migrate(c2, { from: 4 }); CORE.marketSync(c2); return { same: before === JSON.stringify(c2.market.listings.map(l => [l.id, l.ask])), stored: JSON.parse(localStorage.getItem('ff_career')).market.listings.length }; }); ok(s.same && s.stored > 0, 'the market survives a save and reload unchanged');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
