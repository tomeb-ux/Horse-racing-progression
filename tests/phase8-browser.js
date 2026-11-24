// Phase 8 in the real game: facilities and staff bought from the Office, the living property (stable hand / groom / trainer / vet at work, facility signs, horses turned out to graze in the paddocks, the wash bay).
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase8-browser.js
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

  console.log('\n— facilities and staff in the Office');
  await ev(() => { CORE.apply(CAREER.data, 'test:fund', 300000, 'gift', 'test funds'); CAREER.openScreen('office'); }); await p.waitForFunction(() => document.getElementById('ofClub'), null, { timeout: 20000 }); await frames(2);
  s = await ev(() => document.body.innerText); { const miss = ['Facilities', 'Training equipment', 'Exercise track surface', 'Vet bay', 'Trainer', 'Groom', 'capped at \\+25%'].filter(w => !new RegExp(w, 'i').test(s)); ok(miss.length === 0, 'the Office lists the seven facilities and the three staff roles, and states that the boost is capped' + (miss.length ? ' — missing: ' + miss.join(', ') : '')); }
  const c0 = await ev(() => CAREER.data.cash); await ev(() => document.querySelector('[data-buy="training"]').click()); await frames(3);
  s = await ev(() => ({ cash: CAREER.data.cash, lv: CAREER.data.fac.training, led: CAREER.data.ledger.slice(-1)[0] })); ok(s.lv === 1 && s.cash === c0 - 25000 && s.led.kind === 'facility', 'Build $25,000 buys level 1 of the training equipment through the ledger');
  await ev(() => { document.querySelector('[data-hire="groom:1"]').click(); }); await frames(3); s = await ev(() => ({ g: CAREER.data.staff.groom, bill: CAREER.fac.effects().groom, wk: CAREER.finance.bill().cost })); ok(s.g && s.g.tier === 1 && s.g.name && s.bill && s.wk === 2 * 600 + 400 + 150 + 300, `hiring a groom works; the weekly bill is now $${s.wk} (2 horses $1,200 + property $400 + facility upkeep $150 + wages $300)`);
  await ev(() => { document.querySelector('[data-hire="trainer:1"]').click(); }); await frames(3); ok(await ev(() => !!CAREER.data.staff.trainer), 'a trainer can be hired too');
  await ev(() => { document.getElementById('ofBack').click(); }); await frames(2); await step(0.05, 4);

  console.log('\n— the property is alive');
  s = await ev(() => ({ npcs: FARMLIFE.npcs.map(n => n.d.role), signs: !!FARM._test.ctx.scene.children.find(o => o.material && o.material.map && o.material.vertexColors && o.frustumCulled === false && o.geometry.attributes.uv) }));
  ok(s.npcs.join() === 'hand,groom,trainer', `a stable hand, your groom and your trainer are on the property (${s.npcs.join(', ')})`); ok(s.signs, 'facility signs (with level pips) stand at the facilities');
  await ev(() => { FARM._test.setPos(-6, -15); }); await run(1);
  const pos0 = await ev(() => FARMLIFE.npcs.map(n => [n.x, n.z, n.d.role])); await run(25); const pos1 = await ev(() => FARMLIFE.npcs.map(n => [n.x, n.z, n.d.role]));
  ok(pos0.some((a, i) => Math.hypot(a[0] - pos1[i][0], a[1] - pos1[i][1]) > 2), 'they move about doing their jobs (the people walk between their stations)');
  s = await ev(() => FARMLIFE.npcs.filter(n => n.fig.root.visible).length); ok(s >= 1, `the people near you are drawn (${s} visible); far ones are not`);
  await ev(() => { FARM._test.setPos(90, 60); }); await run(1); s = await ev(() => FARMLIFE.npcs.filter(n => n.fig.root.visible).length); ok(s === 0, 'on the far side of the property none of them is drawn (distance gating)');

  console.log('\n— turning a horse out into a paddock');
  await ev(() => { FARM._test.setPos(-3.3, -21.5); }); await step(0.05, 3); await key('e', 3); await key('5', 12); await run(5); ok(await ev(() => FARMCARE.ledHid() === 'h1'), 'Copper Coast is out of the box on the lead');
  const g0 = await ev(() => FARMLIFE.padInfo(0).gate); await ev(g => FARM._test.setPos(g.x, g.z + 0.5), g0); await run(1); s = await ev(() => FARM.info()); ok(s.near === 'pad:out' && /Turn Copper Coast out into the east paddock/.test(s.prompt), `at the east paddock gate: "${s.prompt}"`);
  await p.keyboard.press('e'); await run(6); s = await ev(() => ({ out: Object.keys(FARMLIFE.out), led: FARMCARE.ledHid(), t: CAREER.data.farm.turnout, busy: FARMCARE.busy, pos: FARM._test.horses[1].position.z, vis: FARM._test.horses[1].visible }));
  ok(s.out.join() === 'h1' && !s.led && s.t.h1 === 0 && s.pos < -22.5 && s.vis, `the horse walks in through the gate and is turned out (z ${s.pos.toFixed(1)}); it is remembered in the save`);
  const a0 = await ev(() => [FARM._test.horses[1].position.x, FARM._test.horses[1].position.z]); await run(40); const a1 = await ev(() => [FARM._test.horses[1].position.x, FARM._test.horses[1].position.z, FARMLIFE.out.h1.mode]);
  ok(Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) > 1.5 && (a1[2] === 'graze' || a1[2] === 'walk'), `out in the paddock the horse grazes and wanders (moved ${Math.hypot(a1[0] - a0[0], a1[1] - a0[1]).toFixed(1)} m, now "${a1[2]}")`);
  s = await ev(() => { const g = FARM._test.horses[1], P = FARMLIFE.padInfo(0); return g.position.x >= P.x0 - 4 && g.position.x <= P.x1 + 4 && g.position.z >= P.z0 - 4 && g.position.z <= P.z1 + 6; }); ok(s, 'and stays inside the paddock fence');
  ok(await ev(() => !FARMCARE.points().some(q => q.id === 'stall' && q.hid === 'h1')), 'its empty box offers no horse menu while it is out');
  // persists across a visit; the booked horse is brought in
  await ev(() => { SCENES.enter('menu', { instant: true }); }); await frames(2); await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(2); await step(0.05, 4); ok(await ev(() => !!FARMLIFE.out.h1), 'it is still out in the paddock the next time you come to the farm');
  await ev(() => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); CAREER.book(e.id, 'h1'); SCENES.enter('menu', { instant: true }); }); await frames(2); await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(2); await step(0.05, 4);
  ok(await ev(() => !FARMLIFE.out.h1 && !CAREER.data.farm.turnout.h1), 'with a race booked its horse is brought in from the paddock automatically'); await ev(() => CAREER.cancelBooking());
  // bring in by hand
  await ev(() => { FARMLIFE.setTurnout('h0', 1); SCENES.enter('menu', { instant: true }); }); await frames(2); await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(2); await step(0.05, 4); const g1 = await ev(() => FARMLIFE.padInfo(1).gate); await ev(g => FARM._test.setPos(g.x, g.z + 0.5), g1); await run(1); s = await ev(() => FARM.info());
  ok(s.near === 'pad:in' && /Bring Bay Majesty in/.test(s.prompt), `at the north paddock gate: "${s.prompt}"`); await key('e', 3); s = await ev(() => ({ led: FARMCARE.ledHid(), out: Object.keys(FARMLIFE.out), t: CAREER.data.farm.turnout })); ok(s.led === 'h0' && s.out.length === 0 && !('h0' in s.t), 'E brings the horse in: it is on the lead again');

  console.log('\n— the wash bay');
  await ev(() => { const w = FARMLIFE.WASH; FARM._test.setPos(w.x, w.z); }); await run(2); s = await ev(() => FARM.info()); ok(s.near === 'wash' && /Wash Bay Majesty/.test(s.prompt), `at the wash bay: "${s.prompt}"`);
  const cp0 = await ev(() => CAREER.data.horses[0].composure); await p.keyboard.press('e'); await run(2); ok(await ev(() => FARMLIFE.anim && FARMLIFE.anim.kind === 'wash' && FARM._test.figure.props.brush.visible), 'the washing animation plays (the brush is in your hand, the horse stands relaxed)'); await run(6);
  s = await ev(() => ({ comp: CAREER.data.horses[0].composure, st: window.__toasts.slice(-1)[0], busy: FARMCARE.busy })); ok(s.comp === cp0 + 3 && /clean and relaxed/.test(s.st), `composure +3 after the wash ("${s.st}")`);
  await p.keyboard.press('e'); await run(8); ok(await ev(() => CAREER.data.horses[0].composure) === cp0 + 3, 'washing again the same day gives nothing more');

  console.log('\n— performance and leaks');
  await ev(() => { renderer.render = window.__rr; }); s = await ev(() => { const out = []; for (const v of ['courtyard', 'overview', 'stalls', 'float', 'training']) { FARM.view(v); renderer.render(FARM._test.ctx.scene, FARM._test.ctx.cam); out.push(renderer.info.render.calls); } return out; });
  ok(Math.max(...s) <= 300, `draw calls at five camera positions with people and signs present: ${s.join(', ')} (budget 300 with the living farm; the empty farm is ≤ 250)`);
  const m0 = await ev(() => ({ g: renderer.info.memory.geometries, t: renderer.info.memory.textures })); for (let i = 0; i < 3; i++) { await ev(() => { SCENES.enter('menu', { instant: true }); }); await frames(1); await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(1); }
  const m1 = await ev(() => ({ g: renderer.info.memory.geometries, t: renderer.info.memory.textures })); ok(m1.g <= m0.g + 4 && m1.t <= m0.t + 3, `three more visits leak nothing (geometries ${m0.g} → ${m1.g}, textures ${m0.t} → ${m1.t})`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
