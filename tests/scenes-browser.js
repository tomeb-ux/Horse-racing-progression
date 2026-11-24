// Scene separation (public/scenes.js + public/farm.js) in the real game: the farm and the race world never run or listen at the same
// time, keyboard input is isolated per scene, commentary stops when a race is left, and repeated farm ↔ race trips do not leak.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/scenes-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
const TRIPS = +(process.env.TRIPS || 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };

const SPEECH_STUB = () => {            // headless Chromium has no voices: a recording stub so spoken lines and cancels can be counted
  window.__spoken = []; window.__cancels = 0; let speaking = null;
  class U { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ''; } }
  const voices = [{ name: 'Karen', lang: 'en-AU', voiceURI: 'Karen', localService: true }];
  const synth = { get speaking() { return !!speaking; }, pending: false, paused: false, getVoices: () => voices, addEventListener() {}, resume() {},
    speak(u) { speaking = u; if (u.text.trim()) window.__spoken.push({ t: performance.now() / 1000, text: u.text }); u.__tm = setTimeout(() => { if (speaking === u) speaking = null; u.onend && u.onend(); }, 400 + u.text.split(/\s+/).length * 250); },
    cancel() { window.__cancels++; if (speaking) { clearTimeout(speaking.__tm); speaking = null; } } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true }); window.SpeechSynthesisUtterance = U;
};

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  if (fs.existsSync(__dirname + '/../public/vendor/three.min.js')) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_parade', '"off"'); window.__noPresent = true; });
  await ctx.addInitScript(SPEECH_STUB);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(BASE); await p.waitForFunction(() => typeof CAREER !== 'undefined' && typeof SCENES !== 'undefined' && typeof FARM !== 'undefined' && typeof COMM !== 'undefined');
  // a career with two horses, set up through the game's own save path
  await p.evaluate(() => { const mk = (id, n, r) => ({ id, name: n, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, pot: { top: r + 12, acc: r + 12, end: r + 12, spr: r + 12, rec: r + 12, tem: r + 12, agi: r + 12, sta: r + 12 }, look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, born: 1 });
    const C = { v: 3, seed: 2468, stable: 'Scene Test Stable', horses: [mk('hA', 'Alpha Test', 72), mk('hB', 'Bravo Test', 66)], active: 0, trophies: [], wins: 0, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C)); });
  await p.reload(); await p.waitForFunction(() => typeof CAREER !== 'undefined' && typeof SCENES !== 'undefined' && typeof FARM !== 'undefined');
  const S = () => p.evaluate(() => ({ scene: SCENES.scene, input: SCENES.input, ui: ui.state, farm: FARM.info(), race: !!race, meshes: horseMeshes.length }));
  const frames = async n => { await p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n); };
  const toRace = async () => { await p.evaluate(() => { settings.dist = 1000; settings.opp = 7; settings.track = 'generic'; let a = 12345; const rnd = Math.random; Math.random = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };   // same field every trip
      try { startRace(quickCfg()); } finally { Math.random = rnd; } }); await p.waitForFunction(() => race && race.state !== 'load', null, { timeout: 60000 }); await frames(3); };

  console.log('\n— scenes follow the game state');
  let s = await S(); ok(s.scene === 'menu' && s.input === 'ui' && !s.farm.built, 'the game starts in the menu scene with the keyboard in the UI context and no farm built');
  await p.evaluate(() => CAREER.open()); await sleep(300); s = await S();
  ok(s.scene === 'stable' && s.input === 'ui' && s.ui === 'c_hub', 'Career screens are the stable scene');
  await p.evaluate(() => CAREER._test.openOffice()); s = await S(); ok(s.scene === 'office', 'the Office is its own scene');
  await p.evaluate(() => CAREER.open());
  ok(await p.evaluate(() => [...document.querySelectorAll('#hubBtns button')].some(b => b.textContent === 'Farm (preview)')), 'the Career hub has a Farm button');

  console.log('\n— entering the farm (through the loading overlay)');
  const pr = await p.evaluate(() => { const o = SCENES.enter('farm'); const el = document.getElementById('sceneLoad'); return { shown: !!el && !el.hidden, txt: el && el.textContent, o: typeof o.then }; });
  ok(pr.shown && /farm/i.test(pr.txt) && pr.o === 'function', 'a loading overlay is shown while the farm loads');
  await p.waitForFunction(() => SCENES.scene === 'farm', null, { timeout: 10000 }); await frames(5); s = await S();
  ok(!(await p.evaluate(() => !document.getElementById('sceneLoad').hidden)), 'the overlay is gone once the farm is up');
  ok(s.scene === 'farm' && s.input === 'farm' && s.ui === 'farm' && s.farm.active && s.farm.built, 'the farm is the active scene and owns the keyboard');
  ok(s.farm.horses === 2 && s.farm.plaques === 5 && s.farm.listeners === 7, `your 2 horses stand in the 5 boxes (5 plaques); the farm attached its ${s.farm.listeners} listeners`);
  ok(!s.race && s.meshes === 0, 'no race exists and no race meshes are alive while on the farm');
  ok(await p.evaluate(() => !document.getElementById('farmScreen').hidden && !document.getElementById('menuScreen').offsetParent), 'the farm HUD is shown and the menu is hidden');

  console.log('\n— nothing from the race world is drawn or updated on the farm; diagnostics still run');
  await p.evaluate(() => { window.__rc = { race: 0, other: 0 }; const o = renderer.render.bind(renderer); window.__ro = o; renderer.render = (sc, c) => { (sc === scene ? window.__rc.race++ : window.__rc.other++); return o(sc, c); }; window.__pf0 = PERF.fn; window.__clk0 = race ? race.clock : -1; window.__at = { n: 0, active: 0 }; const oa = GFX.autoTick; window.__oa = oa; GFX.autoTick = function (dt, act) { window.__at.n++; if (act) window.__at.active++; return oa.apply(this, arguments); }; });
  await p.waitForFunction(() => window.__rc.other >= 20, null, { timeout: 120000 }); await frames(2);
  const fr = await p.evaluate(() => { GFX.autoTick = window.__oa; return { rc: window.__rc, pf: PERF.fn > window.__pf0 || PERF.fn === 300, auto: window.__at.n > 5 && window.__at.active === window.__at.n, q: settings.quality }; });
  ok(fr.rc.other > 20 && fr.rc.race === 0, `frames drawn on the farm: ${fr.rc.other} from the farm's own scene, ${fr.rc.race} from the race scene`);
  ok(fr.pf && fr.auto, 'the performance counters (F8) keep counting and AUTO quality is fed every frame as "active" while on the farm');

  console.log('\n— farm controls');
  const hold = async (key, n) => { await p.keyboard.down(key); await frames(n); await p.keyboard.up(key); };
  const pos0 = (await S()).farm;
  await hold('w', 6); let f1 = (await S()).farm;
  ok(f1.z < pos0.z - 0.5, `W walks forward (z ${pos0.z.toFixed(2)} → ${f1.z.toFixed(2)})`);
  await hold('d', 6); let f2 = (await S()).farm;
  ok(f2.x > f1.x + 0.4, `D steps right (x ${f1.x.toFixed(2)} → ${f2.x.toFixed(2)})`);
  await hold('s', 6); let f3 = (await S()).farm; ok(f3.z > f2.z + 0.3, 'S walks back');
  await p.evaluate(() => FARM._test.setPos(0, 4)); await frames(2); const z0 = (await S()).farm.z; await p.keyboard.down('Shift'); await hold('w', 6); await p.keyboard.up('Shift'); const run = z0 - (await S()).farm.z;
  await p.evaluate(() => FARM._test.setPos(0, 4)); await frames(2); const z1 = (await S()).farm.z; await hold('w', 6); const wk = z1 - (await S()).farm.z;
  ok(run > wk * 1.5, `Shift runs faster than walking (${run.toFixed(2)} m vs ${wk.toFixed(2)} m in the same 6 frames)`);
  const yaw0 = (await S()).farm.yaw; await hold('ArrowRight', 6); ok((await S()).farm.yaw > yaw0 + 0.3, '→ turns the camera');
  await p.evaluate(() => FARM._test.setPos(0, -23)); await frames(3); let c = (await S()).farm; ok(c.z > -22.2 || c.z < -27.1, `the player cannot stand inside the stable block (pushed out to z ${c.z.toFixed(2)})`);
  await p.evaluate(() => FARM._test.setPos(200, 0)); await frames(3); c = (await S()).farm; ok(Math.abs(c.x) <= 110.01 && Math.abs(c.z) <= 80.01, `or walk off the edge of the land (x ${c.x.toFixed(1)}, z ${c.z.toFixed(1)})`);

  console.log('\n— keyboard isolation: farm keys never reach the riding controls');
  const iso = await p.evaluate(() => ({ keys: Object.keys(keys).filter(k => keys[k]), eff: riderInput.effort, cam: camMode }));
  await p.keyboard.down('w'); await p.keyboard.press('Space'); await p.keyboard.press('p'); await p.keyboard.press('c'); await p.keyboard.press('q'); await p.keyboard.press('r'); await sleep(200);
  const iso2 = await p.evaluate(() => ({ keys: Object.keys(keys).filter(k => keys[k]), eff: riderInput.effort, cam: camMode, farmW: FARM._test.keys.w === true, state: ui.state }));
  ok(iso2.keys.length === 0 && iso2.eff === iso.eff && iso2.cam === iso.cam && iso2.state === 'farm' && iso2.farmW, 'W, Space, P, C, Q, R on the farm change nothing in the global key map, effort or camera mode (the farm holds its own W)');
  await p.keyboard.up('w');

  console.log('\n— the interaction point');
  await p.evaluate(() => FARM._test.setPos(0, 4)); await frames(3);
  ok((await S()).farm.prompt === '' && (await p.evaluate(() => FARM._test.interact())) === false, 'away from the float there is no prompt and E does nothing');
  await p.evaluate(() => FARM._test.setPos(FARM._test.TRAVEL.x, FARM._test.TRAVEL.z)); await frames(4);
  ok((await S()).farm.prompt === 'E — Travel to next race', 'at the float the prompt "E — Travel to next race" appears');
  await p.keyboard.press('e'); await sleep(400); s = await S();
  ok(s.ui === 'c_event' && s.scene === 'stable' && s.input === 'ui' && !s.farm.active && s.farm.horses === 0 && s.farm.plaques === 0 && s.farm.listeners === 0, 'pressing E leaves the farm for the event screen: farm horses and plaques disposed, farm listeners removed');
  ok(await p.evaluate(() => /Maiden Plate/.test(document.getElementById('car_event').textContent)), 'the event screen is the real next championship round (Maiden Plate)');
  await p.evaluate(() => SCENES.enter('farm', { instant: true })); await frames(3);
  await p.keyboard.press('Escape'); await sleep(300); s = await S(); ok(s.ui === 'c_hub' && s.scene === 'stable' && !s.farm.active && s.farm.listeners === 0, 'Esc on the farm returns to the Career hub');

  console.log('\n— a race: riding keys work, farm state is gone');
  await p.evaluate(() => SCENES.enter('farm', { instant: true })); await frames(2);
  await p.keyboard.down('w');                                           // held on the farm…
  const held = await p.evaluate(() => FARM._test.keys.w === true);
  await toRace(); s = await S();                                        // …then a race starts
  ok(held && s.scene === 'race' && s.input === 'race' && s.farm.listeners === 0 && s.farm.horses === 0 && !s.farm.active, 'starting a race: scene "race", riding context, farm listeners removed and farm horses disposed');
  ok(await p.evaluate(() => Object.keys(keys).filter(k => keys[k]).length === 0 && Object.keys(FARM._test.keys).length === 0), 'a key held on the farm is released at the switch (nothing carried into the race)');
  await p.keyboard.up('w');
  await p.evaluate(() => { window.__rc = { race: 0, other: 0 }; }); await p.waitForFunction(() => window.__rc.race >= 12, null, { timeout: 60000 });
  const rcR = await p.evaluate(() => window.__rc);
  ok(rcR.race > 5 && rcR.other === 0, `during the race only the race scene is drawn (${rcR.race} race frames, ${rcR.other} from any other scene)`);
  await p.waitForFunction(() => race && race.state === 'running', null, { timeout: 60000 });
  const e0 = await p.evaluate(() => riderInput.effort); await p.keyboard.press('w'); await sleep(150); const e1 = await p.evaluate(() => riderInput.effort);
  ok(e1 > e0, `in the race W raises effort (${e0.toFixed(2)} → ${e1.toFixed(2)}): the riding controls work normally`);

  console.log('\n— leaving a race stops its commentary');
  await p.evaluate(() => { window.__spoken.length = 0; window.__cancels = 0; });
  await p.waitForFunction(() => window.__spoken.length > 0 || race.clock > 14, null, { timeout: 60000 }).catch(() => {});
  const c0 = await p.evaluate(() => ({ cancels: window.__cancels, spoken: window.__spoken.length }));
  await p.evaluate(() => SCENES.enter('farm', { instant: true })); await sleep(150);
  const c1 = await p.evaluate(() => ({ cancels: window.__cancels, spoken: window.__spoken.length, race: !!race, meshes: horseMeshes.length }));
  await sleep(3500); const c2 = await p.evaluate(() => window.__spoken.length);
  ok(c1.cancels > c0.cancels && c2 === c1.spoken && !c1.race && c1.meshes === 0, `entering the farm cancelled speech (${c0.cancels} → ${c1.cancels} cancels) and nothing more was spoken (${c1.spoken} lines before, ${c2} after); race and its meshes are gone`);
  ok(await p.evaluate(() => { const l = SCENES.log; return l.length > 4 && l.some(x => x.from === 'race' && x.to === 'farm') && l.some(x => x.from === 'farm' && x.to === 'race'); }), 'the scene log records farm ↔ race transitions');

  console.log(`\n— ${TRIPS} farm ↔ race round trips: no resource growth, career data untouched`);
  await p.evaluate(() => { SCENES.enter('farm', { instant: true }); });
  await frames(3); await toRace(); await p.evaluate(() => SCENES.enter('farm', { instant: true })); await frames(3);     // warm-up trip (venue + horse geometry get cached)
  const data0 = await p.evaluate(() => JSON.stringify(CAREER.data)); await p.evaluate(() => { gc(); gc(); SCENES.mark('base'); }); const base = await p.evaluate(() => SCENES.snapshot('base'));
  for (let i = 0; i < TRIPS; i++) { await toRace(); await sleep(150); await p.evaluate(() => SCENES.enter('farm', { instant: true })); await frames(3); }
  await p.evaluate(() => { gc(); gc(); }); await sleep(300);
  const chk = await p.evaluate(() => SCENES.check('base', { geo: 6, tex: 6, heapMB: 30 })), after = await p.evaluate(() => JSON.stringify(CAREER.data));
  ok(chk.ok, `after ${TRIPS} trips: geometries ${base.geo} → ${chk.now.geo} (Δ${chk.delta.geo}), textures ${base.tex} → ${chk.now.tex} (Δ${chk.delta.tex}), programs Δ${chk.delta.prog}, JS heap Δ${chk.delta.heapMB} MB`);
  ok(chk.now.farm.horses === 2 && chk.now.farm.plaques === 5 && chk.now.farm.objects === base.farm.objects && !chk.now.raceAlive && chk.now.raceMeshes === 0, `the farm is back to exactly what it was (${chk.now.farm.objects} scene objects, 2 horses, 5 plaques); no race left alive`);
  ok(data0 === after, 'the career save data is byte-for-byte unchanged by scene changes');
  await p.evaluate(() => SCENES.enter('career', { instant: true })); await sleep(200);
  const dz = await p.evaluate(() => { const g0 = SCENES.snapshot().geo, t0 = SCENES.snapshot().tex; const ok1 = FARM.dispose(); const g1 = SCENES.snapshot().geo; SCENES.enter('farm', { instant: true }); const g2 = SCENES.snapshot().geo; return { ok1, g0, g1, g2, built: FARM.built }; });
  ok(dz.ok1 && dz.g1 < dz.g0 && dz.g2 <= dz.g0 + 12 && dz.built, `FARM.dispose() frees the farm's static geometry (${dz.g0} → ${dz.g1} geometries) and the next visit rebuilds it (${dz.g2})`);

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
