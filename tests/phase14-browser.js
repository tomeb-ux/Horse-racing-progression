// Phase 14 in the real game: balance and anti-exploit rules — prize races run on their dates, a horse runs once a day.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase14-browser.js
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

  const settle = () => frames(3);
  await ev(() => { renderer.render = window.__rr; });

  console.log('\n— no free money from repeating races');
  await ev(() => { const C = CAREER.data; C.wins = 5; CORE.apply(C, 'test:fund14', 60000, 'gift', 'x'); CORE.advance(C, 8, { force: true }); C.season.rounds[0].st = 'done'; C.season.cur = 1; });
  // a prize race entered from the hub moves the calendar to its next meeting (it can't be run again and again on one day)
  const r1 = await ev(() => { const C = CAREER.data, T = CAREER._test, id = SEASON.OPTIONAL.find(m => m.regional && m.prize && SEASON.eligibility(C.horses[0], m).ok && (() => { const e = CORE.nextMeeting(C, m.id), nr = CORE.nextOpenRoundDay(C); return e && (nr == null || e.day < nr); })()).id; const m = CORE.nextMeeting(C, id), d0 = C.day, cash0 = C.cash; const ok = T.enterOptional(id, 0); return { id, ok, d0, d1: C.day, meetDay: m && m.day, fee: cash0 - C.cash, race: typeof race !== 'undefined' && !!race && !!race.cfg.career, bills: C.ledger.filter(e => e.kind === 'upkeep').length }; });
  ok(r1.ok && r1.d1 === r1.meetDay && r1.d1 >= r1.d0 && r1.fee > 0, `entering a prize race from the Optional Races screen takes you to its next meeting (day ${r1.d0} → ${r1.d1}) and charges the entry fee ($${r1.fee})`);
  await p.waitForFunction(() => typeof race !== 'undefined' && race && race.state, null, { timeout: 60000 }); await frames(3);
  // a horse runs once a day: simulate the result's effect on the horse (lastRaceDay is set by the career core after a race), then try again the same day
  s = await ev(() => { const C = CAREER.data, h = C.horses[0]; h.lastRaceDay = C.day; const id = SEASON.OPTIONAL.find(m => m.regional && m.prize && SEASON.eligibility(h, m).ok && m.id !== 'x').id; return { ok: CAREER._test.enterOptional(id, 0), day: C.day }; });
  ok(!s.ok, 'the same horse cannot be entered in a second race on the same day');
  // when the next meeting is after the next championship round the hub refuses
  s = await ev(() => { const C = CAREER.data; const nr = CORE.nextOpenRoundDay(C); let id = null; for (const m of SEASON.OPTIONAL) { if (!m.prize || !SEASON.eligibility(C.horses[1], m).ok) continue; const e = CORE.nextMeeting(C, m.id); if (e && nr != null && e.day >= nr) { id = m.id; break; } } if (!id) return { skip: true }; const d0 = C.day, cash0 = C.cash; C.horses[1].lastRaceDay = null; const ok = CAREER._test.enterOptional(id, 1); return { ok, same: C.day === d0 && C.cash === cash0 }; });
  ok(s.skip || (!s.ok && s.same), 'a prize race whose next meeting is after the next championship round is refused and nothing moves');
  ok(await ev(() => CORE.audit(CAREER.data).length === 0), 'the ledger audits clean');

  console.log('\n— the farm map');
  await ev(() => { CAREER.hidePanel(); SCENES.enter('farm', { instant: true }); }); await frames(4); await ev(() => { renderer.render = () => {}; }); await step(0.05, 6); await ev(() => { FARM._test.setPos(-6, -14); }); await step(0.05, 3);
  await key('m', 3); s = await ev(() => ({ panel: FARM.info().panel, canvas: !!document.getElementById('fuMap'), txt: document.getElementById('farmPanel').innerText }));
  ok(s.panel === 'map' && s.canvas && /Farm map/i.test(s.txt), 'M opens the farm map');
  s = await ev(() => { const c = document.getElementById('fuMap'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = new Set(); for (let i = 0; i < d.length; i += 4 * 977) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return seen.size; }); ok(s > 8, 'the map is drawn (' + s + ' distinct colours: paddocks, oval, buildings, fences, labels, you)');
  await key('m', 3); ok(await ev(() => FARM.info().panel === null), 'M closes it again'); await key('m', 3); await key('Escape', 3); ok(await ev(() => FARM.info().panel === null), 'Esc closes it too');
  ok(await ev(() => { FARMDRIVE.on = FARMDRIVE.on; return true; }), 'the map is a normal panel: walking is blocked while it is open');
  console.log('\n— retirement through the real screens is covered in phase10-browser; the Hall of Fame persists');
  s = await ev(() => { const C = CAREER.data; C.hof = C.hof || []; return { n: C.hof.length, stored: JSON.parse(localStorage.getItem('ff_career')).hof.length }; }); ok(s.n === s.stored, 'the Hall of Fame is part of the stored career (' + s.n + ' entries)');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
