// Phase 20 in the real game: the trot gait, the farm idle behaviours (toss, paw, swish, look over the door, doze, roll), and that none of it leaks or breaks the horse.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase20-browser.js
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
  const g0 = () => ev(() => { const g = FARM._test.horses[0], B = g.userData.B; return { hy: B.head.rotation.y, n1: B.neck1.rotation.z, rx: g.rotation.x, ord: g.rotation.order, y: g.position.y }; });

  await ev(() => FARMACTORS.setSpeed('paused'));          // the farm clock would start trackwork jobs on these horses
  console.log('\n— the trot');
  s = await ev(() => { const g = FARM._test.horses[0], u = g.userData, out = {}; const rot = () => u.legs.map(l => +l.b[0].rotation.z.toFixed(3));
    PRESENT.animateTrot(g, 0.25, 0.016, {}); out.a = rot(); PRESENT.animateTrot(g, 0.75, 0.016, {}); out.b = rot();
    // legs order: FL, FR, HL, HR. Diagonal pairs move together: FL with HR, FR with HL
    let pairs = 0, n = 0; for (let k = 0; k < 40; k++) { PRESENT.animateTrot(g, k / 40, 0.016, {}); const r = rot(); n++; if (Math.abs(r[0] - r[3]) < 0.25 && Math.abs(r[1] - r[2]) < 0.25) pairs++; }
    out.pairs = pairs; out.n = n; out.apart = 0; for (let k = 0; k < 40; k++) { PRESENT.animateTrot(g, k / 40, 0.016, {}); const r = rot(); if (Math.abs(r[0] - r[1]) > 0.3) out.apart++; } PRESENT.animateTrot(g, 0.1, 0.016, { jig: 1 }); out.jig = u.B.body.position.y; PRESENT.animateTrot(g, 0.1, 0.016, {}); out.flat = u.B.body.position.y;
    let finite = true; for (let k = 0; k < 60; k++) { PRESENT.animateTrot(g, k / 60, 0.016, { jig: k % 2 }); u.B.body.updateMatrixWorld(true); if (!isFinite(u.B.body.position.y) || !isFinite(u.legs[0].b[3].rotation.z)) finite = false; } out.finite = finite;
    return out; });
  ok(s.pairs >= s.n * 0.9, `the legs move in diagonal pairs (${s.pairs}/${s.n} phases)`); ok(s.apart >= 8, `the two diagonals are half a stride apart (${s.apart} phases with FL and FR clearly apart)`); ok(s.jig > s.flat, 'a keen horse jogs higher than a settled trot'); ok(s.finite, 'every pose is finite');

  console.log('\n— farm idle behaviour');
  const seen = await ev(() => { const g = FARM._test.horses[0], u = g.userData; const st = FARMIDLE.st(g); st.nerv = 1; const evs = new Set(); for (let i = 0; i < 4000; i++) { FARM._test.step(0.05, 1); if (st.ev) evs.add(st.ev); } return [...evs]; });
  ok(seen.length >= 2, 'a nervous horse in its box shows several behaviours over a few minutes: ' + seen.join(', '));
  await ev(() => { FARMACTORS.setSpeed('paused'); const g = FARM._test.horses[0], s = FARM._test.world().stalls[g.userData.stallI]; FARM._test.setPos(s.x + 0.3, s.z + 3.2); });
  await run(0.3); await ev(() => { const g = FARM._test.horses[0]; FARMIDLE.st(g).ev = null; FARMIDLE.st(g).t = 99; }); await run(4); s = await g0(); ok(Math.abs(s.hy) > 0.05, `the horse looks over the door at you when you come up to the box (head turned ${s.hy.toFixed(2)} rad)`);
  await ev(() => { FARM._test.setPos(60, 60); }); await run(4); s = await g0(); ok(Math.abs(s.hy) < 0.45, 'and turns back when you leave');
  console.log('\n— the paddock: doze and roll');
  await ev(() => { const g = FARM._test.horses[1]; FARMLIFE.placeOut(g, 0, true); FARM._test.setPos(FARMLIFE.padInfo(0).gate.x, FARMLIFE.padInfo(0).gate.z + 4); });
  await run(4); s = await ev(() => { const o = FARMLIFE.out.h1, g = o.g; o.mode = 'doze'; o.t = 6; o.dz = 0; return !!o; }); await run(3);
  s = await ev(() => { const g = FARM._test.horses[1], B = g.userData.B; return { n1: B.neck1.rotation.z, h: B.head.rotation.z, mode: FARMLIFE.out.h1.mode }; }); ok(s.mode === 'doze' && s.h > 0.3, `a dozing horse hangs its head (${s.h.toFixed(2)})`);
  await run(5); ok(await ev(() => FARMLIFE.out.h1.mode === 'graze'), 'and wakes up again');
  await ev(() => { const o = FARMLIFE.out.h1; o.mode = 'roll'; o.rt = null; }); await run(2); s = await ev(() => { const g = FARM._test.horses[1]; return { rx: g.rotation.x, ord: g.rotation.order, roll: FARMIDLE.rolling === g }; }); ok(Math.abs(s.rx) > 0.8 && s.roll, `the horse rolls onto its side (${s.rx.toFixed(2)} rad)`);
  await run(6); s = await ev(() => { const g = FARM._test.horses[1], o = FARMLIFE.out.h1; return { mm: o.mode, rx: g.rotation.x, ord: g.rotation.order, rolling: FARMIDLE.rolling, mode: o.mode, y: g.position.y, gy: FARM._test.ctx.heightAt(g.position.x, g.position.z) }; });
  ok(s.rx === 0 && s.ord === 'XYZ' && !s.rolling && s.mode !== 'roll' && Math.abs(s.y - s.gy) < 0.05, `then gets back up, upright and on the ground (rx ${s.rx}, order ${s.ord}, mode ${s.mm}, y ${s.y.toFixed(2)} vs ground ${s.gy.toFixed(2)})`);
  await ev(() => { const o = FARMLIFE.out.h1; o.mode = 'roll'; o.rt = null; }); await run(1.5); await ev(() => FARMLIFE.releaseOut('h1')); s = await ev(() => ({ rolling: FARMIDLE.rolling, rx: FARM._test.horses[1].rotation.x })); ok(!s.rolling && s.rx === 0, 'a horse brought in mid-roll is put upright and the roll is forgotten');
  ok(errs.length === 0, 'no page errors: ' + errs.slice(0, 3).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
