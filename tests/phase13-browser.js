// Phase 13 in the real game: the preparation summary, save-then-travel (atomic), the all-or-nothing start, and coming home.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase13-browser.js
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

  const I = () => ev(() => FARM.info()), panelText = () => ev(() => document.getElementById('farmPanel').innerText);
  const book = hid => ev(hid => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); return CAREER.book(e.id, hid); }, hid);
  const toFloat = async () => { await ev(() => { const T = FARM._test.TRAVEL; FARM._test.setPos(T.x, T.z); }); await step(0.05, 4); };

  console.log('\n— the preparation summary');
  s = await ev(() => CAREER.travel.summary()); ok(s === null, 'with nothing booked there is no summary');
  s = await book('h0'); ok(s.ok, 'a race is booked'); await toFloat();
  s = await ev(() => CAREER.travel.summary()); const ev0 = await ev(() => { const C = CAREER.data, b = C.booking, e = C.cal.events.find(x => x.id === b.eid); return { tod: CORE.TOD_LABEL[e.tod], wx: CORE.WX_LABEL[e.forecast.weather], going: GOING[e.forecast.going].label, venue: e.venue, name: b.name }; });
  ok(s && s.horse.name === 'Bay Majesty' && s.horse.fitness > 0 && s.tod === ev0.tod && s.weather === ev0.wx && s.going === ev0.going && s.venue === ev0.venue && s.name === ev0.name, `the summary reads the booking: ${s.horse.name}, fitness ${s.horse.fitness}, ${s.tod}, ${s.weather}, ${s.going} going at ${s.venue}`);
  ok(s.fee > 0 && s.cash > 0 && s.afford && Array.isArray(s.warnings), 'it shows the entry fee, the cash and any warnings (' + s.warnings.length + ')');
  await key('e', 3); s = await I(); const t = await panelText(); ok(s.panel === 'depart' && /Ready to go/i.test(t) && new RegExp(ev0.venue, 'i').test(t) && /Fitness/i.test(t) && new RegExp(ev0.tod, 'i').test(t) && /Entry fee/i.test(t) && /saved before you travel/i.test(t), 'E at the float opens the "Ready to go?" panel with the horse, the race, the forecast and the fee');
  s = await ev(() => document.getElementById('fuLeave') && !document.getElementById('fuLeave').disabled && !!document.getElementById('fuStay')); ok(s, 'with a "Leave now" and a "Not yet" button');

  console.log('\n— not yet');
  const snap0 = await ev(() => JSON.stringify(CAREER.data)); await key('Escape', 3); s = await I(); ok(!s.panel && !s.trip, 'Esc closes the panel and nothing happens'); ok(await ev(snap => JSON.stringify(CAREER.data) === snap && !!CAREER.booking(), snap0), 'the career and the booking are exactly as they were');
  await key('e', 3); await ev(() => document.getElementById('fuStay').click()); await step(0.05, 3); s = await I(); ok(!s.panel && !s.trip, '"Not yet" does the same');

  console.log('\n— save, then travel');
  await key('e', 3); await ev(() => { window.__ss = 0; const o = Storage.prototype.setItem; window.__so = o; Storage.prototype.setItem = function (k, v) { if (k === 'ff_career') window.__ss++; return o.call(this, k, v); }; });
  await ev(() => document.getElementById('fuLeave').click()); await step(0.05, 4); s = await ev(() => ({ n: window.__ss, same: localStorage.getItem('ff_career') === JSON.stringify(CAREER.data), trip: FARM.info().trip, phase: FARMTRIP.phase })); ok(s.n >= 1 && s.same, `leaving writes the career and reads it back before anything moves (${s.n} write, stored copy identical)`); ok(s.trip && s.phase === 'fadeIn', 'then the departure sequence starts'); await ev(() => { Storage.prototype.setItem = window.__so; });
  await key('Space', 3); await step(0.05, 2); ok(await ev(() => FARMTRIP.phase === 'out'), 'and it can be skipped (Space)');
  await ev(() => { FARMTRIP.abort(); FARM._test.step(0.05, 2); }); await ev(() => { try { FARMDAY.reset(); } catch (e) {} }); await step(0.05, 4);

  console.log('\n— a failed save keeps the horse at home');
  await ev(() => { if (!CAREER.booking()) { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); CAREER.book(e.id, 'h0'); } }); await toFloat(); const snap1 = await ev(() => JSON.stringify(CAREER.data));
  await key('e', 3); await ev(() => { const o = Storage.prototype.setItem; window.__so = o; Storage.prototype.setItem = function (k, v) { if (k === 'ff_career') throw new Error('QuotaExceededError'); return o.call(this, k, v); }; });
  await ev(() => document.getElementById('fuLeave').click()); await step(0.05, 4); s = await I(); const t2 = await panelText(); ok(s.panel === 'depart' && !s.trip && /couldn't be saved/i.test(t2) && /stays home/i.test(t2), 'if the career cannot be stored the panel says so and the horse stays home');
  ok(await ev(snap => JSON.stringify(CAREER.data) === snap && !!CAREER.booking(), snap1), 'nothing was changed and the booking is intact'); await ev(() => { Storage.prototype.setItem = window.__so; });
  await ev(() => document.getElementById('fuLeave').click()); await step(0.05, 4); s = await I(); ok(s.trip, 'once the storage works again, Leave now goes ahead'); await ev(() => { FARMTRIP.abort(); FARMDAY.reset(); }); await step(0.05, 4);

  console.log('\n— the start is all or nothing');
  await ev(() => { CAREER.cancelBooking(); const C = CAREER.data; C.wins = 5; CORE.apply(C, 'test:fund13', 60000, 'gift', 'x'); CORE.advance(C, 8, { force: true }); C.season.rounds[0].st = 'done'; C.season.cur = 1; });
  s = await ev(() => { const C = CAREER.data, evs = C.cal.events.filter(e => e.kind === 'optional' && SEASON.BY_ID[e.ref].prize && !(SEASON.BY_ID[e.ref].req || []).some(r => r.k === 'age' || r.k === 'maxrating' && r.max < 70) && e.day > C.day + 3).sort((a, b) => a.day - b.day); for (const e of evs) { const r = CAREER.book(e.id, C.horses[0].id); if (r.ok) return { ok: true, fee: CORE.entryFee(SEASON.BY_ID[e.ref]), ref: e.ref, day: e.day - C.day }; } return { ok: false }; }); ok(s.ok && s.fee > 0, `an open race is booked (${s.ref}, ${s.day} days away, entry fee ${s.fee})`);
  const before = await ev(() => ({ day: CAREER.data.day, cash: CAREER.data.cash, ledger: CAREER.data.ledger.length, snap: JSON.stringify(CAREER.data) })); await ev(() => { const C = CAREER.data; CORE.apply(C, 'test:burn13', -(C.cash - 10), 'buy', 'burn'); });
  const mid = await ev(() => ({ cash: CAREER.data.cash, ledger: CAREER.data.ledger.length, day: CAREER.data.day }));
  s = await ev(() => { const r = CAREER.startBooked(); const C = CAREER.data; return { ok: r.ok, day: C.day, cash: C.cash, ledger: C.ledger.length, booked: !!C.booking, audit: CORE.audit(C).length }; });
  ok(!s.ok && s.day === mid.day && s.cash === mid.cash && s.ledger === mid.ledger && s.booked && s.audit === 0, `when the entry fails (no cash for the fee) the date, the money and the bills are exactly as before (day ${mid.day} → ${s.day}, cash ${mid.cash} → ${s.cash}) and the booking stays`);
  ok(s.day === before.day, 'the calendar did not move even though the entry tried to advance it');

  console.log('\n— coming home');
  await ev(() => { CAREER.cancelBooking(); SCENES.enter('career'); }); await frames(3);
  await ev(() => { CAREER.returnHome(); }); await frames(4); await ev(() => { renderer.render = () => {}; }); s = await ev(() => { const T = FARM._test.TRAVEL, i = FARM.info(); return { d: Math.hypot(i.x - 31.5, i.z - 10.5), active: i.active, place: i.place, fade: document.getElementById('farmFade').style.opacity, horses: FARM._test.horses.filter(g => g.visible).length, rigX: FARM._test.rig.position.x }; });
  ok(s.active && s.place === 'out' && s.d < 3, `you arrive back at the hardstand (${s.d.toFixed(1)} m from the float)`); ok(s.horses === 2, 'both horses are back in their boxes'); ok(Math.abs(s.rigX - 38) < 0.1, 'the ute and float are parked at the hardstand');
  await step(0.05, 40); await p.waitForTimeout(1300); s = await ev(() => ({ fade: document.getElementById('farmFade').style.opacity, toast: window.__toasts.slice(-3).join(' | ') })); ok(s.fade === '0' && /Welcome home/.test(s.toast), 'the screen fades up from black with a welcome home: "' + s.toast.split('|').pop().trim() + '"');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
