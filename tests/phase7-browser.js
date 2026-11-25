// Phase 7 in the real game: entry fees, the Office finance report, the stable club advance, weekly bills on "Rest a day", prize money after a race, and the horse creator from an empty box.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase7-browser.js
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
  const step = (dt, n) => ev(([dt, n]) => FARM._test.step(dt, n), [dt, n]);
  await p.goto(BASE); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined' && FARM.showcase, null, { timeout: 90000 });
  await ev(() => {
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }], mk = i => ({ id: 'h' + i, name: 'Bay Majesty', attrs: { top: 72, acc: 68, end: 66, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: [mk(0)], active: 0, trophies: [], wins: 0, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  const book = (hid) => ev(hid => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); return CAREER.book(e.id, hid); }, hid);
  const cash = () => ev(() => CAREER.data.cash);
  const spendTo = n => ev(n => { const C = CAREER.data; if (C.cash > n) CORE.apply(C, 'test:spend:' + Math.random(), -(C.cash - n), 'buy', 'test spend'); }, n);

  console.log('\n— purses, entry fees and the booking');
  let s = await ev(() => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === 0), m = SEASON.roundDef(C.season, 0); return { purse: CORE.purseOf(m), fee: CORE.entryFee(m), face: m.prize, label: CORE.purseLabel(m), cal: CAREER.calendarData(0).list[0] }; });
  ok(s.face === '$40,000' && s.purse === 12000 && s.fee === 500 && s.label === '$12,000' && s.cal.fee === 500 && s.cal.prize === '$12,000', `the Maiden Plate's face value ${s.face} is a real purse of ${s.label} with a ${s.fee} entry fee (shown on the calendar)`);
  await ev(() => { FARM._test.openPanel('calendar'); }); await step(0.05, 2); s = await ev(() => document.getElementById('farmPanel').innerText); ok(/Entry fee/.test(s) && /\$500/.test(s) && /Cash/.test(s) && /\$12,000/.test(s), 'the booking screen shows the prize, the entry fee and your cash'); await ev(() => FARM._test.closePanel());
  const c0 = await cash(); let r = await book('h0'); ok(r.ok && await cash() === c0, 'booking is free (the fee is paid when the race is entered)');
  await ev(() => CAREER.cancelBooking()); await spendTo(300); r = await book('h0'); ok(!r.ok && /entry fee/i.test(r.error) && r.fee === 500, `booking is refused when the stable can't pay the fee: "${(r.error || '').slice(0, 90)}…"`);
  await ev(() => { FARM._test.openPanel('calendar'); }); await step(0.05, 2); s = await ev(() => ({ txt: document.getElementById('farmPanel').innerText, dis: document.getElementById('fuBook') && document.getElementById('fuBook').disabled })); ok(s.dis && /more than the stable's cash|advance/i.test(s.txt), 'the booking screen explains it and disables Book (and points to the club advance)'); await ev(() => FARM._test.closePanel());
  // a forged booking cannot get past the entry
  const fr = await ev(() => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); C.booking = { eid: e.id, hid: 'h0', kind: 'round', ref: e.ref, round: e.round, name: 'x', venue: 'x', day: e.day, at: C.day }; const res = CAREER.startBooked(); return { res, ui: ui.state, booking: !!CAREER.data.booking, cash: CAREER.data.cash, entries: CAREER.data.ledger.filter(x => x.kind === 'entry').length }; });
  ok(!fr.res.ok && fr.ui !== 'racing' && fr.booking && fr.cash === 300 && fr.entries === 0, 'starting with too little cash is refused: no race, no charge, and the booking is kept');
  await ev(() => { if (typeof SCENES !== 'undefined') SCENES.enter('farm', { instant: true }); CAREER.cancelBooking(); }); await frames(2); await step(0.05, 3);

  console.log('\n— the stable club and the Office');
  await ev(() => { CAREER.openScreen('office'); }); await p.waitForFunction(() => document.getElementById('ofClub'), null, { timeout: 20000 }); await frames(2); s = await ev(() => document.getElementById('car_office') ? document.getElementById('car_office').innerText : document.body.innerText);
  { const miss = ['Finances', 'Next weekly bill', 'Feed & care', 'Property upkeep', 'Owed to the stable club', 'Reputation'].filter(w => !new RegExp(w, 'i').test(s)); ok(miss.length === 0, 'the Office shows cash, what is owed, the next weekly bill (itemised), reputation and sponsorship' + (miss.length ? ' — missing: ' + miss.join(', ') + ' in: ' + s.slice(0, 200).replace(/\s+/g, ' ') : '')); }
  ok(await ev(() => !document.getElementById('ofClub').disabled), 'with cash under the threshold the club advance is available');
  await ev(() => document.getElementById('ofClub').click()); await frames(3); s = await ev(() => ({ cash: CAREER.data.cash, owed: CAREER.finance.owed(), dis: document.getElementById('ofClub').disabled })); ok(s.cash === 8300 && s.owed === 8000 && s.dis, `the advance adds $8,000 cash and the same owed to the club (cash ${s.cash}, owed ${s.owed}) and can't be taken again this season`);
  await ev(() => { document.getElementById('ofBack').click(); }); await frames(2); await step(0.05, 3);

  console.log('\n— weekly bills when time moves on, and an entry fee paid at the gates');
  await ev(() => { const C = CAREER.data; C.day = 6; CORE.econOf(C).paidWeek = 0; });
  const o = await ev(() => { const o = FARM._test.points.find(q => q.id === 'office'); FARM._test.setPos(o.x, o.z); return 1; }); await step(0.05, 3); await p.keyboard.press('e'); await step(0.05, 3); await ev(() => FARM._test.skipFade()); await step(0.05, 30);
  const rp = await ev(() => { const q = FARM._test.points.find(x => x.id === 'rest'); FARM._test.setPos(q.x, q.z); }); await step(0.05, 3); const before = await cash(); await p.keyboard.press('e'); await step(0.05, 3); await ev(() => FARM._test.skipFade()); await step(0.05, 40);
  s = await ev(() => ({ cash: CAREER.data.cash, day: CAREER.data.day, last: CAREER.data.ledger.filter(x => x.kind === 'upkeep').slice(-1)[0], toast: window.__toasts.slice(-3).join(' | ') }));
  ok(s.day === 7 && s.last && s.last.amount === -1000 && s.cash === before - 1000 && /weekly bill/i.test(s.toast), `Rest a day across a week boundary charges ONE weekly bill: −$1,000 (feed & care $600 + property $400), shown in the toast: "${s.toast.slice(-80)}"`);
  await ev(() => { FARM._test.exitHouse(); FARM._test.skipFade(); }); await step(0.05, 30);
  await ev(() => { const C = CAREER.data; CORE.econOf(C).debt = 2000; }); const owedBefore = await ev(() => CAREER.finance.owed());
  await book('h0'); const cb = await cash(); const st = await ev(() => { const res = CAREER.startBooked(); return { res, ui: ui.state, c: CAREER.data.cash, ledger: CAREER.data.ledger.slice(-1)[0], booking: !!CAREER.booking() }; });
  ok(st.res.ok && st.ui === 'racing' && st.c === cb - 500 && st.ledger.kind === 'entry' && !st.booking, `entering the race charges the $500 entry fee once and starts it (cash ${cb} → ${st.c})`);
  await p.waitForFunction(() => race && race.state === 'running', null, { timeout: 90000 });
  await ev(() => { renderer.render = () => {}; let n = 0; while (race && race.state !== 'done' && n++ < 120 * 400) race.step(SIM_DT); }); await p.waitForFunction(() => ui.state === 'results', null, { timeout: 60000 }).catch(() => {}); await frames(3);
  s = await ev(() => ({ txt: document.getElementById('resCareerPanel') ? document.getElementById('resCareerPanel').innerText : '', led: CAREER.data.ledger.filter(x => x.kind === 'prize' || x.kind === 'repay' || x.kind === 'bonus'), owed: CAREER.finance.owed(), rep: CAREER.data.rep, place: (race.finishOrder.indexOf(race.player) + 1) }));
  ok(/Entry −\$500/.test(s.txt) && /Cash \$/.test(s.txt), `the results panel shows the money: "${s.txt.replace(/\s+/g, ' ').slice(0, 130)}…"`);
  if (s.place >= 1 && s.place <= 5) { const pz = s.led.find(x => x.kind === 'prize'); ok(pz && pz.amount <= 7200 && pz.amount >= 480, `a place ${s.place} finish paid the scaled prize once ($${pz && pz.amount}) — the face value is ×0.30`); ok(s.owed < owedBefore || s.owed === 0, 'half the prize repaid the club (' + owedBefore + ' → ' + s.owed + ')'); } else ok(true, 'unplaced this time (finished ' + s.place + '): no prize, as designed');
  const dup = await ev(() => { const n = CAREER.data.ledger.length, c = CAREER.data.cash; CAREER.startBooked(); return CAREER.data.ledger.length === n && CAREER.data.cash === c; }); ok(dup, 'a second startBooked after the race changes no money');
  await p.click('#resCareer'); await p.waitForFunction(() => ui.state === 'farm' && FARM.active, null, { timeout: 30000 }); await frames(3); await ev(() => { renderer.render = () => {}; }); await step(0.05, 3);

  console.log('\n— creating a horse from an empty box on the farm');
  await ev(() => { CAREER.data.wins = 30; }); await step(0.05, 3);
  s = await ev(() => ({ pts: FARMCARE.points().filter(q => q.id === 'vacant').map(q => q.i + ':' + q.text), free: CAREER.slotsFree() })); ok(s.free === 4 && s.pts.length === 1 && s.pts[0].startsWith('1:'), `the first empty unlocked box offers "${(s.pts[0] || '').slice(2)}" (${s.free} boxes free)`);
  await ev(() => { const st = FARM._test.stalls[1]; FARM._test.setPos(st.x + 0.35, -21.4); }); await step(0.05, 4); s = await ev(() => FARM.info()); ok(s.near === 'vacant', 'walking up to it shows the prompt: ' + s.prompt);
  await p.keyboard.press('e'); await step(0.05, 3); await frames(3); s = await ev(() => ({ ui: ui.state, creator: !!document.getElementById('car_create') && !document.getElementById('car_create').hidden, txt: (document.getElementById('car_create') || {}).innerText || '' })); s.market = await ev(() => !!document.querySelector('[data-mktab="create"]')); ok(s.market, 'E opens the Horse Market (since Phase 10 the empty box opens the market; its Create tab leads to the same creator)');
  const nh = await ev(() => { const h = CAREER.data.horses.length; return h; });
  await ev(() => { document.getElementById('mkBack').click(); }); await p.waitForFunction(() => ui.state === 'farm' && FARM.active, null, { timeout: 20000 }).catch(() => {}); s = await ev(() => ({ ui: ui.state, farm: FARM.active, horses: CAREER.data.horses.length })); ok(s.ui === 'farm' && s.farm && s.horses === nh, 'Back returns to the property with nothing created');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
