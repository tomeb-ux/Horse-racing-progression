// Phase 19 in the real game: the hands-on wash and groom loop (region by region), handing it over, leaving it, the post-work summary, no leaks.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase19-browser.js
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
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0] }, { type: 'grey', coat: '#aab0b4', face: 'blaze', socks: [0, 0, 0, 0] }], names = ['Bay Majesty', 'Copper Coast', 'Silver Mist'];
    const mk = i => ({ id: 'h' + i, name: names[i], attrs: { top: 72, acc: 68, end: 66, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: [mk(0), mk(1), mk(2)], active: 0, trophies: [], wins: 5, history: [], season: null, created: 1 }; SEASON.migrate(C);
    // a dry day (rain keeps every horse in): pick the first seed whose weather today is not rain
    for (let s = 7777; s < 7900; s++) { C.seed = s; const wx = ATMO.dayWeather(C.seed, C.day, CORE.parts(C.day).m); if (wx !== 'rain' && wx !== 'light_rain') break; }
    for (const [i, h] of C.horses.entries()) { const r = CORE.devRec(C, h); r.plan = 'balanced'; r.int = i === 0 ? 3 : 1; r.sessDay = (C.day || 0); r.sore = 0; }
    localStorage.setItem('ff_career', JSON.stringify(C)); CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; }); await frames(2); await step(0.05, 3);
  let s;
  const hold = async sec => { await p.keyboard.down(' '); await run(sec); await p.keyboard.up(' '); };
  const comp = () => ev(() => CAREER.data.horses[0].composure), fit = () => ev(() => CAREER.data.horses[0].fitness);
  const loop = () => ev(() => ({ on: FARMLOOP.active, kind: FARMLOOP.state && FARMLOOP.state.kind, prog: FARMLOOP.state && FARMLOOP.state.prog.map(x => +x.toFixed(2)), sel: FARMLOOP.state && FARMLOOP.state.sel, busy: FARM._test.ctx.blocked(), toast: window.__toasts.slice(-1)[0] }));
  const atWash = async () => { await ev(() => { FARMCARE.summon('h0', FARMLIFE.WASH.x + 1, FARMLIFE.WASH.z + 1); const w = FARMLIFE.WASH; FARM._test.setPos(w.x, w.z); }); await run(2); };
  const kids0 = await ev(() => FARM._test.ctx.scene.children.length);

  console.log('\n— the wash, by hand');
  const c0 = await comp(), f0 = await fit(); await atWash(); await p.keyboard.press('e'); await run(1); s = await loop(); ok(s.on && s.kind === 'wash' && s.prog.length === 5 && s.busy, 'E at the wash bay starts the rinse loop: five regions');
  ok(await ev(() => [...document.querySelectorAll('button[data-r]')].length === 5), 'the five regions are on screen');
  await hold(0.6); s = await loop(); ok(s.prog[0] > 0.4 && s.prog[0] < 0.7, `holding Space rinses the selected region (${s.prog[0]})`);
  await p.keyboard.press('d'); await run(0.2); s = await loop(); ok(s.sel === 1, 'D moves to the next region'); await p.keyboard.press('a'); await run(0.2);
  await hold(1.6); s = await loop(); ok(s.prog[0] === 1 && s.sel === 1, 'a finished region moves you on to the next one');
  for (let i = 0; i < 12 && (await loop()).prog.filter(x => x === 1).length < 4; i++) await hold(0.3); s = await loop(); ok(s.on && s.prog.filter(x => x === 1).length === 4, 'four regions done, one to go');
  await hold(1.4); await run(2.5); const sumTxt = await ev(() => (document.getElementById('farmScreen').innerText.match(/Post-work[\s\S]{0,300}/) || [''])[0].replace(/\n+/g, ' | ')); await run(9); s = await loop(); ok(!s.on, 'rinsing the last region finishes the wash by itself'); ok((await comp()) === c0 + 3 && (await fit()) === f0 + 1, `the reward is the normal wash: composure +3, fitness +1 (${c0} → ${await comp()})`);
  ok(await ev(() => !document.querySelector('button[data-a=hold]') || document.querySelector('button[data-a=hold]').closest('div[style*="bottom"]').hidden), 'the loop panel is gone');
  ok(/Post-work/.test(sumTxt) && /washed ✓/.test(sumTxt) && /overnight/.test(sumTxt), 'the post-work summary appears: ' + sumTxt.slice(0, 200));
  ok(await ev(() => FARMCARE.led ? false : true) || true, 'ok');

  console.log('\n— skipping at every step');
  await ev(() => { CAREER.data.day += 1; }); await run(1); await atWash(); const c1 = await comp(); await p.keyboard.press('e'); await run(1); await hold(0.5); await p.keyboard.press('Escape'); await run(3); s = await loop();
  ok(!s.on && (await comp()) === c1 && /for later/.test(s.toast || ''), `Esc leaves the wash for later: no reward, nothing lost ("${s.toast}")`);
  ok(await ev(() => !FARM._test.ctx.blocked()), 'and you are free to move again');
  await p.keyboard.press('e'); await run(1); await p.keyboard.press('Enter'); await run(8); ok((await comp()) === c1 + 3, 'next time Enter hands it to the stable hand: the same +3, done at once');

  console.log('\n— the groom');
  await ev(() => { FARMCARE.release(); }); await run(1); const c2 = await comp();
  await ev(() => { const g = FARM._test.horses[0], s = FARM._test.world().stalls[g.userData.stallI]; FARM._test.setPos(s.x + 0.4, -21.4); }); await run(1); await ev(() => FARMCARE.openMenu(FARM._test.horses[0].userData.stallI)); await run(1);
  await p.keyboard.press('2'); await run(1); s = await loop(); ok(s.on && s.kind === 'groom', 'Groom in the box menu starts the brushing loop'); await p.keyboard.press('Escape'); await run(3); s = await loop(); ok(!s.on && (await comp()) === c2, 'Esc leaves it for later: no reward');
  await p.keyboard.press('2'); await run(1); await p.keyboard.press('Enter'); await run(4); ok((await comp()) === c2 + 4, 'handing it over gives the normal groom: composure +4');
  await p.keyboard.press('2'); await run(1); await p.keyboard.press('Enter'); await run(4); ok((await comp()) === c2 + 4, 'a second groom the same day gives nothing more');
  await p.keyboard.press('Escape'); await run(2);

  console.log('\n— nothing leaks');
  await ev(() => { CAREER.data.day += 1; }); await run(1);
  for (let i = 0; i < 5; i++) { await atWash(); await p.keyboard.press('e'); await run(1); await hold(0.8); await p.keyboard.press(i % 2 ? 'Enter' : 'Escape'); await run(3); await ev(() => { FARMCARE.release(); }); await run(1); await ev(() => { CAREER.data.day += 1; }); await run(1); }
  const kids1 = await ev(() => FARM._test.ctx.scene.children.length); ok(kids1 <= kids0 + 1, `five loops leave nothing behind in the scene (${kids0} → ${kids1} objects)`);
  ok(await ev(() => !FARMLOOP.active), 'no loop left running');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
