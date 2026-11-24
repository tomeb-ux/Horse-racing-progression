// Phase 5 in the real game: the property is the heart of the game.
//   the main menu sits over the farm · Career Mode lands on the farm (a first career makes its first horse, then lands there) ·
//   first / third person, mouse look, sensitivity, camera pull-in · pause menu · the farmhouse interior, its race-calendar board,
//   booking a race, the ledger, the trophy cabinet, the wardrobe · loading the float and driving off → the booked race starts ·
//   after the race you are back on the property.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/farm-flow-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const mkCtx = async () => {
    const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
    if (fs.existsSync(__dirname + '/../public/vendor/three.min.js')) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('__ff_init')) { sessionStorage.setItem('__ff_init', '1'); } localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_parade', '"off"'); localStorage.setItem('ff_celebrate', 'false'); localStorage.setItem('ff_autoReplay', 'false'); window.__noPresent = true; });
    return ctx;
  };
  const errs = [];
  const mkPage = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); }); return p; };
  const frames = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  const seed = (p, n) => p.evaluate(n => {
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0] }, { type: 'grey', coat: '#b8b8b8', face: 'none', socks: [0, 0, 0, 0] }];
    const names = ['Bay Majesty', 'Copper Coast', 'Silver Billabong'], mk = i => ({ id: 'h' + i, name: names[i], attrs: { top: 70 + i, acc: 68, end: 66, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: Array.from({ length: n }, (_, i) => mk(i)), active: 0, trophies: [], wins: 0, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C)); }, n);
  const ready = (p, fn) => p.waitForFunction(fn || (() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined' && typeof SCENES !== 'undefined' && FARM.showcase), null, { timeout: 90000 });
  const I = p => p.evaluate(() => FARM.info());
  const stubRender = p => p.evaluate(() => { if (!window.__rr) window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; });

  // =========================================================== 1. the main menu sits over the farm (no career yet)
  console.log('\n— the main menu is drawn over the horse property');
  const ctx = await mkCtx(); const p = await mkPage(ctx);
  await p.goto(BASE); await ready(p); await stubRender(p); await frames(p, 4);
  let s = await p.evaluate(() => ({ i: FARM.info(), scene: SCENES.scene, input: SCENES.input, ui: ui.state, save: localStorage.getItem('ff_career'), btns: ['btnQuick', 'btnCareer', 'btnSettings', 'btnHow'].map(id => { const e = document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; }), menuShown: !document.getElementById('menuScreen').hidden, mp: document.getElementById('btnMP').hidden }));
  ok(s.i.showcase && s.i.built && !s.i.active && s.scene === 'menu' && s.input === 'ui' && s.ui === 'menu', 'the game opens on the main menu with the horse property drawn behind it');
  ok(s.btns.every(Boolean) && s.menuShown && s.mp, 'Quick Race, Career Mode, Settings and How to Play are on the menu (multiplayer stays hidden)');
  ok(s.i.horses === 5 && s.i.plaques === 5 && s.i.showHorse && s.i.listeners === 0, `five of the game's own horses stand in the boxes (${s.i.horses}), the Quick Race horse is on show, and the background takes no input (${s.i.listeners} listeners)`);
  ok(s.save === null, 'drawing the menu background created no career save');
  const oldShow = await p.evaluate(() => FARM._test.showHorse.uuid); await p.evaluate(() => setMenuHorse(1)); await frames(p, 2);
  ok(await p.evaluate(u => FARM._test.showHorse && FARM._test.showHorse.uuid !== u, oldShow), 'choosing another Quick Race horse changes the horse on show in the courtyard');
  const cam0 = (await I(p)).cam; await frames(p, 30); const cam1 = (await I(p)).cam;
  ok(Math.hypot(cam1[0] - cam0[0], cam1[2] - cam0[2]) > 0.002, 'the camera drifts slowly over the courtyard');
  // settings and the screens that sit on the menu keep the background; the farm's own settings are there
  await p.click('#btnSettings'); await frames(p, 3);
  s = await p.evaluate(() => ({ sc: FARM.showcase, rows: ['optPerson', 'optLook', 'optLock'].map(id => document.querySelectorAll('#' + id + ' .chip, #' + id + ' button').length) }));
  ok(s.sc && s.rows.every(n => n >= 2), 'the Settings screen sits over the farm and has the farm view, look-sensitivity and mouse-capture controls');
  await p.evaluate(() => { [...document.querySelectorAll('#optLook button, #optLook .chip')].find(e => /fast/i.test(e.textContent)).click(); [...document.querySelectorAll('#optPerson button, #optPerson .chip')].find(e => /first/i.test(e.textContent)).click(); });
  s = await p.evaluate(() => ({ look: settings.lookSens, person: settings.person, st: [localStorage.getItem('ff_lookSens'), localStorage.getItem('ff_person')] }));
  ok(s.look === 2 && s.person === 1 && s.st[0] === '2' && s.st[1] === '1', 'sensitivity and the default view are chosen in Settings and remembered');
  await p.evaluate(() => { [...document.querySelectorAll('#optLook button, #optLook .chip')].find(e => /normal/i.test(e.textContent)).click(); [...document.querySelectorAll('#optPerson button, #optPerson .chip')].find(e => /third/i.test(e.textContent)).click(); show('menu'); });

  // Quick Race still works, and leaves the farm cleanly
  await p.evaluate(() => { settings.dist = 1000; settings.opp = 7; settings.track = 'generic'; startRace(quickCfg()); }); await p.waitForFunction(() => race && race.state !== 'load', null, { timeout: 60000 }); await frames(p, 3);
  s = await p.evaluate(() => ({ i: FARM.info(), scene: SCENES.scene, st: ui.state, meshes: horseMeshes.length }));
  ok(s.st === 'racing' && s.scene === 'race' && !s.i.showcase && s.i.horses === 0 && s.i.plaques === 0 && s.meshes > 5, 'Quick Race starts as before: the property background is released and the race world takes over');
  await p.evaluate(() => { quitToMenu(); }); await frames(p, 4);
  s = await p.evaluate(() => ({ i: FARM.info(), scene: SCENES.scene, st: ui.state }));
  ok(s.st === 'menu' && s.scene === 'menu' && s.i.showcase && s.i.horses === 5 && s.i.showHorse, 'quitting back to the menu brings the property background back');

  // =========================================================== 2. a first career: create the first horse, then land on the farm
  console.log('\n— Career Mode: a brand-new career');
  await p.click('#btnCareer'); await sleep(400);
  s = await p.evaluate(() => ({ st: ui.state, scene: SCENES.scene, hub: !!document.querySelector('#hubBtns') && !document.getElementById('car_hub').hidden }));
  ok(s.st === 'c_create' && !s.hub, 'with no horse yet, Career Mode opens the horse creator (not a menu of options)');
  await p.evaluate(() => { document.getElementById('cBack').click(); }); await frames(p, 3);
  ok(await p.evaluate(() => ui.state === 'menu' && FARM.showcase), 'Back from the first step returns to the main menu');
  await p.click('#btnCareer'); await sleep(300);
  const made = await p.evaluate(() => {
    const T = CAREER._test, d = T.draft, keys = Object.keys(d.attrs); d.name = SEASON.PLAYER_NAMES[0];
    let left = T.START_POOL; for (const k of keys) { d.attrs[k] = T.BASE; } for (let g = 0; left > 0 && g < 2000; g++) { const k = keys[g % keys.length]; if (d.attrs[k] < T.START_CAP) { d.attrs[k]++; left--; } }
    left = T.POT_POOL; for (const k of keys) d.hr[k] = 0; for (let g = 0; left > 0 && g < 2000; g++) { const k = keys[g % keys.length]; if (d.attrs[k] + d.hr[k] < T.POT_CAP) { d.hr[k]++; left--; } }
    d.step = 5; document.querySelector('[data-step="5"]').click(); const done = document.getElementById('cDone'); if (!done) return { err: 'no done button' }; done.click(); return { name: d.name };
  });
  await p.waitForFunction(() => ui.state === 'farm', null, { timeout: 30000 }); await frames(p, 4);
  s = await p.evaluate(() => ({ i: FARM.info(), n: CAREER.data.horses.length, nm: CAREER.data.horses[0] && CAREER.data.horses[0].name, scene: SCENES.scene }));
  ok(!made.err && s.n === 1 && s.nm === made.name && s.i.active && s.scene === 'farm' && s.i.place === 'out' && s.i.horses === 1, `after the first horse (${s.nm}) is created you walk out onto the property, and the horse is in its box`);

  // =========================================================== 3. a career with horses: straight onto the farm
  console.log('\n— Career Mode: an existing career');
  await p.evaluate(() => { SCENES.enter('menu', { instant: true }); }); await frames(p, 3);
  await seed(p, 3); await p.reload(); await ready(p); await stubRender(p); await frames(p, 3);
  s = await p.evaluate(() => ({ h: FARM._test.horses.length, names: FARM._test.horses.length })); ok(s.h === 3, 'with a saved career the menu background shows your three horses in their boxes');
  await p.click('#btnCareer'); await p.waitForFunction(() => ui.state === 'farm' && FARM.active, null, { timeout: 30000 }); await frames(p, 4);
  s = await p.evaluate(() => ({ i: FARM.info(), scene: SCENES.scene, input: SCENES.input, hubShown: !!document.getElementById('car_hub') && !document.getElementById('car_hub').hidden, keys: Object.keys(keys).filter(k => keys[k]) }));
  ok(s.i.active && s.scene === 'farm' && s.input === 'farm' && !s.hubShown && s.i.place === 'out' && s.i.person === 3 && s.i.figure, 'Career Mode loads straight into the farm in third person with your character on the property (no hub screen)');
  ok(/calendar/i.test(s.i.objective), `the objective points you to the calendar: "${s.i.objective}"`);
  ok(s.i.listeners >= 8 && s.i.horses === 3, 'the farm listens for keys and mouse only while it is active');

  // =========================================================== 4. walking, first / third person, look, pull-in
  console.log('\n— walking and the camera');
  const hold = async (key, n) => { await p.keyboard.down(key); await frames(p, n); await p.keyboard.up(key); };
  const z0 = (await I(p)).z; await hold('w', 40); const z1 = (await I(p)).z;
  ok(z1 < z0 - 1, `W walks forward (north): z ${z0.toFixed(1)} → ${z1.toFixed(1)}`);
  await p.keyboard.press('v'); await frames(p, 3);
  s = await p.evaluate(() => { const i = FARM.info(); return { i, fov: FARM._test.ctx.cam.fov, store: localStorage.getItem('ff_person') }; });
  ok(s.i.person === 1 && !s.i.figure && Math.abs(s.i.cam[1] - (s.i.y + 1.62)) < 0.06 && s.fov > 68 && s.store === '1', `V swaps to first person: the character is hidden, the eye is at ${(s.i.cam[1] - s.i.y).toFixed(2)} m, the view is wider (fov ${s.fov}), and the choice is remembered`);
  const yaw0 = (await I(p)).yaw; await p.evaluate(() => FARM._test.look(100, 0, 0.0055)); const yaw1 = (await I(p)).yaw; await p.evaluate(() => { settings.lookSens = 2; FARM._test.look(100, 0, 0.0055); settings.lookSens = 1; }); const yaw2 = (await I(p)).yaw;
  ok(yaw1 > yaw0 + 0.4 && Math.abs((yaw2 - yaw1) - 2 * (yaw1 - yaw0)) < 0.01, `mouse look turns the view (${(yaw1 - yaw0).toFixed(2)} rad) and the sensitivity setting doubles it (${(yaw2 - yaw1).toFixed(2)})`);
  const p0 = (await I(p)).pitch; await p.evaluate(() => FARM._test.look(0, -400, 0.0055)); const p1 = (await I(p)).pitch; await p.evaluate(() => FARM._test.look(0, 4000, 0.0055)); const p2 = (await I(p)).pitch;
  ok(p1 > p0 && p1 <= 1.36 && p2 >= -1.36 && p2 < p1, `looking up and down is limited (pitch ${p1.toFixed(2)} up, ${p2.toFixed(2)} down)`);
  // a drag on the canvas turns the view too
  await p.evaluate(() => { const c = renderer.domElement; const ev = (t, x) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: 100, button: 0, bubbles: true })); const mv = x => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 100, bubbles: true })); ev('pointerdown', 100); mv(160); mv(220); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  ok((await I(p)).yaw > yaw2 + 0.5, 'dragging the mouse across the view also turns it');
  await p.keyboard.press('v'); await frames(p, 3);
  s = await I(p); ok(s.person === 3 && s.figure, 'V again returns to third person and the character is back');
  // pull-in: back to a wall, the camera comes in and never ends up inside a building
  await p.evaluate(() => { FARM._test.setPos(0, -20.9); FARM._test.ctx.CAM.yaw = Math.PI; FARM._test.ctx.CAM.pitch = -0.15; FARM._test.ctx.CAM.dist = 6; }); await frames(p, 6);
  s = await p.evaluate(() => { const i = FARM.info(); return { i, bad: FARM._test.blockedAt(i.cam[0], i.cam[1], i.cam[2]) }; });
  ok(s.i.camDist < 3 && !s.bad, `with the stable wall behind you the camera pulls in (${s.i.camDist.toFixed(2)} m of 6) and is never inside solid geometry`);
  await p.evaluate(() => { FARM._test.setPos(0, 0); FARM._test.ctx.CAM.yaw = 0; FARM._test.ctx.CAM.dist = 4.6; }); await frames(p, 90);
  ok((await I(p)).camDist > 4.4, 'in the open the camera eases back out to its full distance');

  // =========================================================== 5. pause
  console.log('\n— the pause menu');
  await p.keyboard.press('Escape'); await frames(p, 2);
  s = await p.evaluate(() => ({ i: FARM.info(), vis: !document.getElementById('farmPause').hidden }));
  ok(s.i.paused && s.vis, 'Esc opens the pause menu (Resume, Career, Main menu)');
  const zp = (await I(p)).z; await hold('w', 25); ok(Math.abs((await I(p)).z - zp) < 0.01, 'the walker does not move while paused');
  await p.keyboard.press('Escape'); await frames(p, 2); ok(!(await I(p)).paused, 'Esc again resumes');
  await p.keyboard.press('Escape'); await frames(p, 2); await p.click('#fpMenu'); await frames(p, 5);
  s = await p.evaluate(() => ({ i: FARM.info(), st: ui.state, scene: SCENES.scene }));
  ok(s.st === 'menu' && s.scene === 'menu' && s.i.showcase && !s.i.active && s.i.listeners === 0, 'Main menu from the pause screen returns to the menu over the property (farm listeners removed)');
  await p.click('#btnCareer'); await p.waitForFunction(() => FARM.active, null, { timeout: 30000 }); await frames(p, 3);
  await p.keyboard.press('Escape'); await frames(p, 2); await p.click('#fpHub'); await sleep(300);
  s = await p.evaluate(() => ({ st: ui.state, back: [...document.querySelectorAll('#hubBtns button')].map(b => b.textContent) }));
  ok(s.st === 'c_hub' && s.back.includes('Back to the Farm'), 'Career from the pause screen opens the stable hub, which has a "Back to the Farm" button');
  await p.evaluate(() => [...document.querySelectorAll('#hubBtns button')].find(b => b.textContent === 'Back to the Farm').click()); await p.waitForFunction(() => FARM.active, null, { timeout: 30000 }); await frames(p, 3);

  // =========================================================== 6. the farmhouse
  console.log('\n— inside the farmhouse');
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'office'); FARM._test.setPos(o.x + 1.0, o.z); }); await frames(p, 3);
  s = await I(p); ok(/Enter the farmhouse/.test(s.prompt), `at the front steps the prompt is "${s.prompt}"`);
  await p.keyboard.press('e'); await frames(p, 4); await p.evaluate(() => FARM._test.skipFade()); await frames(p, 4);
  s = await p.evaluate(() => { const i = FARM.info(), w = FARM._test.house(); return { i, ids: FARM._test.points.map(x => x.id).sort().join(), b: w.bounds, col: w.colliders.length }; });
  ok(s.i.place === 'in' && s.ids === 'board,cabinet,door,ledger,mirror' && s.col >= 8, `E goes inside (fade through black): a walkable room with a calendar board, ledger, trophy cabinet, mirror and door (${s.col} solid pieces)`);
  const wall = await p.evaluate(() => [FARM._test.settle(-20, 0), FARM._test.settle(0, 20), FARM._test.settle(20, 0), FARM._test.settle(0, -20)]);
  const bd = (await p.evaluate(() => FARM._test.house().bounds));
  ok(wall[0].x >= bd.x0 - 1e-6 && wall[1].z <= bd.z1 + 1e-6 && wall[2].x <= bd.x1 + 1e-6 && wall[3].z >= bd.z0 - 1e-6, 'the walls hold: you cannot walk out of the room');
  const furn = await p.evaluate(() => { const T = FARM._test; return [T.settle(-4.0, -3.2), T.settle(-0.8, 1.9), T.settle(-1.0, 3.5)].map(r => Math.round(r.x * 10) / 10 + ',' + Math.round(r.z * 10) / 10).join(' | '); });
  ok(!/^-4,-3.2 \| -0.8,1.9 \| -1,3.5$/.test(furn), `furniture is solid (desk, coffee table, sofa push you out: ${furn})`);
  // the interior camera is inside the room in both views
  s = await p.evaluate(() => { const i = FARM.info(), b = FARM._test.house().bounds; return { i, inside: i.cam[0] > b.x0 - 0.4 && i.cam[0] < b.x1 + 0.4 && i.cam[2] > b.z0 - 0.4 && i.cam[2] < b.z1 + 0.4 && i.cam[1] < 2.8 }; });
  ok(s.inside, 'the third-person camera stays inside the room');
  await p.keyboard.press('v'); await frames(p, 3); s = await p.evaluate(() => ({ i: FARM.info(), b: FARM._test.house().bounds })); ok(s.i.person === 1 && Math.abs(s.i.cam[1] - 1.62) < 0.06, 'first person works indoors too (eye height 1.62 m)'); await p.keyboard.press('v'); await frames(p, 2);
  // the ledger: the Office screen, and back to the same spot in the house
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'ledger'); FARM._test.setPos(o.x, o.z); }); await frames(p, 3);
  s = await I(p); ok(/ledger/i.test(s.prompt), `at the desk: "${s.prompt}"`);
  const atDesk = await I(p); await p.keyboard.press('e'); await sleep(400);
  s = await p.evaluate(() => ({ st: ui.state, scene: SCENES.scene, i: FARM.info() }));
  ok(s.st === 'c_office' && s.scene === 'office' && !s.i.active && s.i.listeners === 0, 'E at the desk opens the stable ledger (the Office), and the farm hands over cleanly');
  await p.evaluate(() => document.getElementById('ofBack').click()); await p.waitForFunction(() => FARM.active, null, { timeout: 30000 }); await frames(p, 3);
  s = await I(p); ok(s.place === 'in' && Math.hypot(s.x - atDesk.x, s.z - atDesk.z) < 0.3, 'Back from the ledger puts you back in the farmhouse where you stood (not at the front gate)');
  // the trophy cabinet
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'cabinet'); FARM._test.setPos(o.x, o.z); }); await frames(p, 3);
  await p.keyboard.press('e'); await sleep(400); s = await p.evaluate(() => ({ st: ui.state, txt: document.getElementById('car_trophy') && /trophy|trophies/i.test(document.getElementById('car_trophy').textContent) }));
  ok(s.st === 'c_trophy' && s.txt, 'E at the cabinet opens the Trophy Room');
  await p.evaluate(() => document.getElementById('trBack').click()); await p.waitForFunction(() => FARM.active, null, { timeout: 30000 }); await frames(p, 3); ok((await I(p)).place === 'in', 'and Back returns you to the farmhouse');

  // =========================================================== 7. the calendar board and booking
  console.log('\n— the race calendar: choosing and booking a race');
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'board'); FARM._test.setPos(o.x, o.z); }); await frames(p, 3);
  s = await I(p); ok(/calendar/i.test(s.prompt), `at the board: "${s.prompt}"`);
  await p.keyboard.press('e'); await frames(p, 3);
  s = await p.evaluate(() => ({ i: FARM.info(), txt: document.getElementById('farmPanel').textContent, races: document.querySelectorAll('#farmPanel .ri').length, horses: document.querySelectorAll('#farmPanel .hc').length, today: !!document.querySelector('#farmPanel .day.today') }));
  ok(s.i.panel === 'calendar' && /Race Calendar/.test(s.txt) && /Maiden Plate/.test(s.txt) && s.horses === 3 && s.races >= 3 && s.today, 'E at the board opens the race calendar: this month, today, the upcoming races and your three horses');
  ok(await p.evaluate(() => { const r = [...document.querySelectorAll('#farmPanel .ri')]; return r.length > 1 && /Opens after the previous round/.test(r[1].textContent) && document.getElementById('fuBook') && !document.getElementById('fuBook').disabled; }), 'only the current championship round can be booked; later rounds are marked as not open yet');
  const sel = await p.evaluate(() => { document.querySelectorAll('#farmPanel .hc')[1].click(); document.getElementById('fuBook').click(); const b = CAREER.booking(); return b && { name: b.name, horse: b.horse, kind: b.kind, round: b.round, day: b.day, stored: JSON.parse(localStorage.getItem('ff_career')).booking && JSON.parse(localStorage.getItem('ff_career')).booking.hid }; });
  ok(sel && sel.name === 'Maiden Plate' && sel.horse === 'Copper Coast' && sel.kind === 'round' && sel.round === 0 && sel.stored === 'h1', `choosing a horse and pressing Book books ${sel && sel.horse} for the ${sel && sel.name} (saved with the career)`);
  s = await p.evaluate(() => ({ txt: document.getElementById('farmPanel').textContent, obj: FARM.info().objective }));
  ok(/Booked:/.test(s.txt) && /Cancel booking/.test(s.txt) && /Copper Coast/.test(s.obj) && /float/i.test(s.obj), 'the screen shows the booking (with Cancel) and the objective now tells you to take the horse to the float');
  const bad = await p.evaluate(() => { const C = CAREER.data, ev = C.cal.events.find(e => e.kind === 'optional' && e.ref === 'o_wfa'), rd2 = C.cal.events.find(e => e.kind === 'round' && e.round === 1); return { opt: CAREER.book(ev.id, 'h0'), r2: CAREER.book(rd2.id, 'h0'), none: CAREER.book('nope', 'h0'), still: CAREER.booking().horse }; });
  ok(!bad.opt.ok && !bad.r2.ok && !bad.none.ok && bad.still === 'Copper Coast', `a race that is not open (round 2, or an optional race after the next round) cannot be booked, and the booking is untouched ("${bad.r2.error}")`);
  await p.evaluate(() => { document.getElementById('fuCancel').click(); }); ok(await p.evaluate(() => CAREER.booking() === null && !JSON.parse(localStorage.getItem('ff_career')).booking), 'Cancel booking clears it');
  await p.evaluate(() => { document.querySelectorAll('#farmPanel .hc')[0].click(); document.getElementById('fuBook').click(); });
  await p.keyboard.press('Escape'); await frames(p, 2); s = await I(p); ok(!s.panel && !s.paused, 'Esc closes the calendar (it does not open the pause menu)');
  const bt = await p.evaluate(() => { const b = FARM._test.house(); return !!b; }); ok(bt, 'the board is redrawn from the career each time (booked race ringed, next race card)');
  // the wardrobe
  console.log('\n— the wardrobe');
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'mirror'); FARM._test.setPos(o.x, o.z); }); await frames(p, 3);
  await p.keyboard.press('e'); await frames(p, 4);
  s = await p.evaluate(() => ({ i: FARM.info(), txt: document.getElementById('farmPanel').textContent }));
  ok(s.i.panel === 'wardrobe' && /Wardrobe/.test(s.txt) && /Riding gear/.test(s.txt) && /Race day/.test(s.txt), 'E at the mirror opens the wardrobe (Stable wear, Riding gear, Race day, skin, hair, face, build, colours)');
  const wd = await p.evaluate(() => { const before = FARM._test.figure.A.outfit; document.querySelector('[data-outfit="training"]').click(); document.querySelector('[data-skin="#7b4a30"]').click(); document.querySelector('[data-hair="4"]').click(); document.querySelector('[data-shirt="#8a2f26"]').click();
    const P = CAREER.data.player, st = JSON.parse(localStorage.getItem('ff_career')).player; return { before, now: FARM._test.figure.A.outfit, P, st }; });
  ok(wd.before === 'stable' && wd.now === 'training' && wd.P.outfit === 'training' && wd.P.look.skin === '#7b4a30' && wd.P.look.hair === 4 && wd.P.colours.shirt === '#8a2f26' && wd.st.outfit === 'training', 'choosing an outfit, skin, hair and shirt colour changes the character at once and saves to the career');
  await p.keyboard.press('Escape'); await frames(p, 2);
  s = await p.evaluate(() => { const i = FARM.info(); return { i, bad: FARM._test.blockedAt(i.cam[0], i.cam[1], i.cam[2]) }; }); ok(!s.i.panel, 'closing the wardrobe returns you to the room');
  // out through the front door
  await p.evaluate(() => { const o = FARM._test.points.find(x => x.id === 'door'); FARM._test.setPos(o.x - 0.3, o.z); }); await frames(p, 3);
  s = await I(p); ok(/outside/i.test(s.prompt), `at the door: "${s.prompt}"`);
  await p.keyboard.press('e'); await frames(p, 4); await p.evaluate(() => FARM._test.skipFade()); await frames(p, 3);
  s = await p.evaluate(() => { const i = FARM.info(), o = FARM._test.points.find(x => x.id === 'office'); return { i, d: Math.hypot(i.x - o.x, i.z - o.z) }; });
  ok(s.i.place === 'out' && s.d < 1.5, 'E at the door goes back outside, to the front steps');
  // revisiting the house does not grow memory
  const geo = async () => p.evaluate(() => renderer.info.memory.geometries);
  const g1 = await geo(); for (let k = 0; k < 4; k++) { await p.evaluate(() => { FARM._test.enterHouse(); }); await frames(p, 2); await p.evaluate(() => FARM._test.skipFade()); await frames(p, 2); await p.evaluate(() => { FARM._test.exitHouse(); }); await frames(p, 2); await p.evaluate(() => FARM._test.skipFade()); await frames(p, 2); }
  const g2 = await geo(); ok(g2 - g1 <= 2, `going in and out of the farmhouse four more times does not leak geometry (${g1} → ${g2})`);

  // =========================================================== 8. the float: no booking, then the trip
  console.log('\n— loading the float and driving off');
  await p.evaluate(() => { CAREER.cancelBooking(); const T = FARM._test.TRAVEL; FARM._test.setPos(T.x, T.z); }); await frames(p, 4);
  s = await I(p); ok(/book a race/i.test(s.prompt), `with nothing booked the float says so: "${s.prompt}"`);
  await p.keyboard.press('e'); await frames(p, 3); ok(!(await I(p)).trip && (await I(p)).active, 'E with nothing booked does nothing but remind you');
  await p.evaluate(() => { const C = CAREER.data, ev = C.cal.events.find(e => e.kind === 'round' && e.round === 0); CAREER.book(ev.id, 'h2'); }); await frames(p, 4);
  s = await I(p); ok(/Load Silver Billabong and leave for Maiden Plate/.test(s.prompt), `with a race booked: "${s.prompt}"`);
  await p.keyboard.press('e'); await frames(p, 3);
  s = await p.evaluate(() => ({ i: FARM.info(), ph: FARMTRIP.phase, boxHidden: FARM._test.horses.filter(g => !g.visible).length, hs: FARM._test.ctx.scene.children.length }));
  ok(s.i.trip && s.ph === 'fadeIn' && s.boxHidden === 1, 'E at the float starts the loading sequence (the horse leaves its box)');
  // run the whole sequence in simulated time (no rendering) and record what happens
  const seq = await p.evaluate(() => { const rig = FARM._test.rig, T0 = rig.position.x, seenPh = [], out = { ramp: [], x: [] }; let last = ''; for (let k = 0; k < 600 && FARMTRIP.on; k++) { FARMTRIP.frame(0.05); const ph = FARMTRIP.phase; if (ph !== last) { seenPh.push(ph); last = ph; } if (ph === 'lead' && k % 20 === 0) out.ramp.push(+rig.userData.ramp.rotation.z.toFixed(2)); if (ph === 'drive') { out.x.push(+rig.position.x.toFixed(1)); out.rampDrive = +rig.userData.ramp.rotation.z.toFixed(2); } if (ph === 'out' && out.sawOut === undefined) out.sawOut = true; if (ui.state !== 'farm') break; } return Object.assign(out, { seenPh, T0, end: rig.position.x, st: ui.state }); });
  seq.seenPh = seq.seenPh.filter(Boolean); ok(seq.seenPh.join() === 'fadeIn,lead,shut,walk,drive,out', `the sequence runs fade-in → lead the horse up the ramp → raise the ramp → walk to the ute → drive off → fade out (${seq.seenPh.join(' → ')})`);
  ok(seq.rampDrive < -1.4 && seq.x.length > 20 && seq.x[seq.x.length - 1] > seq.T0 + 60, `the ramp is up and the ute and float drive ${Math.round(seq.x[seq.x.length - 1] - seq.T0)} m east along the farm drive toward the road gate`);
  await p.waitForFunction(() => race && race.state !== 'load' || ui.state === 'racing', null, { timeout: 60000 }); await frames(p, 2);
  s = await p.evaluate(() => ({ st: ui.state, scene: SCENES.scene, c: race && race.cfg.career, pl: race && race.player.def.name, i: FARM.info(), booking: CAREER.booking(), stored: JSON.parse(localStorage.getItem('ff_career')).booking }));
  ok(s.st === 'racing' && s.scene === 'race' && s.c && s.c.name === 'Maiden Plate' && s.c.official && s.pl === 'Silver Billabong', `at the end the booked race starts: ${s.c && s.c.name} with ${s.pl}`);
  ok(s.booking === null && !s.stored && !s.i.active && s.i.horses === 0 && s.i.listeners === 0, 'the booking is used up, and the farm is released while the race runs');
  ok(await p.evaluate(() => { const g = FARM._test.rig; return !g || (g.position.x < 100); }), 'the rig is parked again for the next visit (or the farm was freed)');
  // finish the race and come home
  await p.waitForFunction(() => race && race.state === 'running', null, { timeout: 90000 }); await p.evaluate(() => { let n = 0; while (race && race.state !== 'done' && n++ < 120 * 400) race.step(SIM_DT); }); await p.waitForFunction(() => ui.state === 'results', null, { timeout: 60000 }).catch(() => {}); await frames(p, 3);
  s = await p.evaluate(() => ({ st: ui.state, btn: document.getElementById('resCareer').hidden ? null : document.getElementById('resCareer').textContent, cur: CAREER.data.season.cur }));
  ok(s.btn === 'Return to the Farm' && s.cur === 1, `the results screen offers "${s.btn}" and the round is recorded (round 1 done)`);
  await p.click('#resCareer'); await p.waitForFunction(() => ui.state === 'farm' && FARM.active, null, { timeout: 30000 }); await frames(p, 4);
  s = await p.evaluate(() => ({ i: FARM.info(), hub: !document.getElementById('car_hub') || document.getElementById('car_hub').hidden, resHidden: document.getElementById('resultsScreen').hidden, cash: CAREER.data.cash }));
  ok(s.i.active && s.i.place === 'out' && Math.abs(s.i.x - 31.5) < 3 && s.hub && s.resHidden, `after the race you are back on the property by the float (x ${s.i.x.toFixed(1)}), not on a menu`);
  ok(/calendar/i.test(s.i.objective) && s.i.horses === 3, 'the objective is back to "check the calendar" and all three horses are in their boxes');
  // skip: Space jumps to the end of the sequence
  await p.evaluate(() => { const C = CAREER.data, ev = C.cal.events.find(e => e.kind === 'round' && e.round === 1); CAREER.book(ev.id, 'h0'); const T = FARM._test.TRAVEL; FARM._test.setPos(T.x, T.z); }); await frames(p, 4);
  await p.keyboard.press('e'); await frames(p, 3); ok((await I(p)).trip, 'a second booking (round 2) can be made and the sequence started');
  await p.keyboard.press('Space'); await frames(p, 2); ok(await p.evaluate(() => FARMTRIP.phase === 'out'), 'Space skips straight to the end of the sequence');
  await p.evaluate(() => { for (let k = 0; k < 200 && FARMTRIP.on; k++) FARMTRIP.frame(0.05); }); await p.waitForFunction(() => ui.state === 'racing', null, { timeout: 60000 }); ok(await p.evaluate(() => race.cfg.career.round === 2 && race.player.def.name === 'Bay Majesty'), 'and the booked round-2 race starts with its horse');
  await p.evaluate(() => { race = null; clearRaceMeshes(); SCENES.enter('menu', { instant: true }); }); await frames(p, 3);

  // =========================================================== 9. the character persists
  console.log('\n— the character is saved with the career');
  await p.reload(); await ready(p); await stubRender(p); await p.click('#btnCareer'); await p.waitForFunction(() => FARM.active, null, { timeout: 30000 }); await frames(p, 3);
  s = await p.evaluate(() => ({ o: FARM._test.figure.A.outfit, sk: FARM._test.figure.A.look.skin, sh: FARM._test.figure.A.colours.shirt }));
  ok(s.o === 'training' && s.sk === '#7b4a30' && s.sh === '#8a2f26', 'after a reload your character still wears the riding gear, skin and shirt you chose');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
