// Phase 15A diagnostics (public/perf.js, PERFLAB) in the real game, headless: F8 additions, the hitch log and its events, Shift+F8 report, the four hidden lab switches
// (and that none of them touches the saved quality settings or ff_autoLevel), the benchmark race, the farm GPU "park" and its safe restore, and that nothing is recorded
// while F8 is off. Frames are driven with a synthetic clock (so the numbers are exact); rendering is stubbed except in the park checks (they need real GPU uploads).
//   PORT=8095 node server/index.js ; PORT=8095 node tests/perflab-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const SPEECH_STUB = () => {            // headless Chromium has no voices: a stub that counts spoken lines
  window.__spoken = []; let speaking = null;
  class U { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ''; } }
  const synth = { get speaking() { return !!speaking; }, pending: false, paused: false, getVoices: () => [{ name: 'Karen', lang: 'en-AU', voiceURI: 'Karen', localService: true }], addEventListener() {}, resume() {},
    speak(u) { speaking = u; if (u.text.trim()) window.__spoken.push(u.text); u.__tm = setTimeout(() => { if (speaking === u) speaking = null; u.onend && u.onend({}); }, 300); }, cancel() { if (speaking) { clearTimeout(speaking.__tm); speaking = null; } } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true }); window.SpeechSynthesisUtterance = U;
};
const INIT = (o) => {
  localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_autoReplay', 'false'); localStorage.setItem('ff_parade', '"off"'); localStorage.setItem('ff_celebrate', 'false'); localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false');
  localStorage.setItem('ff_quality', '"auto"');      // Medium is the default preset now; these checks are about AUTO, so Auto is chosen
  if (!sessionStorage.getItem('__ff_seeded')) { sessionStorage.setItem('__ff_seeded', '1'); for (const k in o.seed) localStorage.setItem(k, o.seed[k]); }
  window.__noPresent = true; if (o.stubRaf) { window.__rafQ = []; window.requestAnimationFrame = f => { window.__rafQ.push(f); return 1; }; }
};
async function open(b, o) {
  const ctx = await b.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(SPEECH_STUB); await ctx.addInitScript(INIT, o);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  await p.goto(BASE, { waitUntil: 'load' }); await p.waitForFunction(() => typeof PERFLAB !== 'undefined' && typeof startRace === 'function' && typeof FARM !== 'undefined' && typeof GFX !== 'undefined');
  if (o.stubRaf) await p.evaluate(() => { window.__T = performance.now(); window.step = ms => { window.__T += ms; for (const f of __rafQ.splice(0)) f(window.__T); }; for (let i = 0; i < 30; i++) step(16.667); });
  return { ctx, p, errs };
}
const BENCHCFG = "Object.assign(quickCfg(), { distance: 1600, field: 12, track: 'randwick', incidents: 'off', seed: 11, allBots: true })";

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });

  // =============================================================== A: defaults, F8, hitch log, report, lab dialog (synthetic clock, render stubbed)
  console.log('— defaults: nothing changes for a player who never opens the lab; nothing is recorded while F8 is off');
  let { ctx, p, errs } = await open(b, { stubRaf: true, seed: { ff_autoLevel: '2' } });
  await p.evaluate(() => { window.__R0 = renderer.render.bind(renderer); renderer.render = () => {}; });
  let d = await p.evaluate(() => ({ lab: PERFLAB.lab, ls: localStorage.getItem('ff_lab'), auto: GFX.AUTO.lab, level: GFX.AUTO.level, stored: localStorage.getItem('ff_autoLevel'), q: settings.quality, rec: PERFLAB.rec, farm: FARM.built, show: FARM.showcase }));
  ok(JSON.stringify(d.lab) === JSON.stringify({ auto: 'normal', park: 'retain', light: 'normal', comm: 'normal' }) && d.ls === null && d.auto === 'normal', 'the four switches default to the normal game and no ff_lab key exists');
  ok(d.level === 2 && d.stored === '2' && d.q === 'auto', 'the stored AUTO level (2) was read as before; the preset is still AUTO');
  ok(d.rec === false && d.farm && d.show, 'per-frame recording is OFF by default; the farm is built at boot for the menu showcase (so it is resident even before a Quick Race)');
  await p.evaluate(() => { for (let i = 0; i < 90; i++) step(i === 40 ? 90 : 16.667); });
  d = await p.evaluate(() => ({ hl: PERFLAB.hitches.length, seg: !!PERFLAB.segment, ring: PERF.fn }));
  ok(d.hl === 0 && !d.seg && d.ring > 60, `with F8 off a 90 ms frame is not logged and no segment is opened (hitch log ${d.hl}; the existing frame ring still fills: ${d.ring})`);
  const rare = await p.evaluate(() => { GFX.applyQuality(); return PERFLAB.events.filter(e => e.k === 'applyQuality').length; });
  ok(rare >= 1, 'rare events (here applyQuality) are noted even with F8 off, so a report always carries the AUTO history');

  console.log('\n— F8: refresh interval, on-time %, longest frame, hitches per minute; the hitch log and its events');
  await p.keyboard.press('F8');
  let o = await p.evaluate(() => ({ on: PERF.on, rec: PERFLAB.rec, hidden: document.getElementById('perfOv').hidden }));
  ok(o.on && o.rec && !o.hidden, 'F8 shows the overlay and starts recording');
  await p.evaluate(() => { for (let i = 0; i < 400; i++) step(16.667 + (i % 3 - 1) * 0.3); });
  o = await p.evaluate(() => ({ ref: PERFLAB.refresh, txt: document.getElementById('perfOv').textContent }));
  ok(Math.abs(o.ref - 16.667) < 0.2, `a 60 Hz display is detected (${o.ref.toFixed(2)} ms)`);
  ok(/display 60 Hz/.test(o.txt) && /on-time 100\.0 %/.test(o.txt) && /hitches 0 \(0\.0\/min\)/.test(o.txt) && /longest/.test(o.txt), 'the overlay shows the refresh rate, on-time %, hitches per minute and the longest frame: ' + (o.txt.split('\n').find(l => /^last/.test(l)) || ''));
  await p.evaluate(() => { GFX.applyQuality(); GFX.setAtmosphere(ATMO.params('dusk', 'clear')); step(60); for (let i = 0; i < 30; i++) step(16.667); step(24); step(26.5); for (let i = 0; i < 20; i++) step(16.667); });
  const h = await p.evaluate(() => ({ log: PERFLAB.hitches.slice(), seg: PERFLAB.segment && { hit: PERFLAB.segment.hit, max: PERFLAB.segment.max } }));
  ok(h.log.length === 2 && h.log[0].ms === 60 && h.log[1].ms === 26.5, `a hitch is a frame over max(1.5 × refresh, refresh + 4 ms) = 25 ms: 60 ms and 26.5 ms are logged, 24 ms is not (${h.log.map(x => x.ms).join(', ')})`);
  ok(h.log[0].events.some(e => /^applyQuality/.test(e)) && h.log[0].events.some(e => /^setAtmosphere: dusk/.test(e)), `the 60 ms hitch lists the events of its frame: ${h.log[0].events.map(e => e.slice(0, 34)).join(' | ')}`);
  ok(h.log[0].jsPrev < 5 && /elsewhere/.test(h.log[0].hint), 'a long interval whose JavaScript was short is flagged as "time went elsewhere" (GPU / compositor / browser)');
  await p.evaluate(() => { const tx = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1); tx.needsUpdate = true; window.__dummy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: tx })); FARM._test.ctx.scene.add(__dummy); renderer.render = __R0; step(16.667); renderer.render = () => {}; });
  const ge = await p.evaluate(() => PERFLAB.events.filter(e => e.k === 'gpu').map(e => e.s));
  ok(ge.some(s => /geometries \+\d/.test(s) && /textures \+\d/.test(s) && /shader programs \+\d/.test(s)), `a change in the GPU geometry / texture / program counts is an event: "${(ge[ge.length - 1] || '').slice(0, 90)}"`);
  await p.evaluate(() => { FARM._test.ctx.scene.remove(__dummy); __dummy.geometry.dispose(); __dummy.material.map.dispose(); __dummy.material.dispose(); });
  await p.evaluate(() => { for (let i = 0; i < 700; i++) step(6.944 + (i % 3 - 1) * 0.1); });
  o = await p.evaluate(() => { step(10); step(12); for (let i = 0; i < 10; i++) step(6.944); return { ref: PERFLAB.refresh, thr: null, n: PERFLAB.hitches.slice(-1)[0] }; });
  ok(Math.abs(o.ref - 6.944) < 0.15 && o.n.ms === 12, `a 144 Hz display is detected (${o.ref.toFixed(2)} ms): 12 ms is a hitch (> max(10.4, 10.9) ms), 10 ms is not`);

  console.log('\n— the report (Shift+F8)');
  const rep = await p.evaluate(() => PERFLAB.report()), stored1 = await p.evaluate(() => localStorage.getItem('ff_autoLevel'));
  ok(/FARM: world IS resident in memory/.test(rep) && /GPU resources resident/.test(rep) && /LAB switches: AUTO=normal.*all defaults/.test(rep), 'the report says the farm world is resident in memory (built at boot for the menu) and that the lab is at its defaults');
  let js = null; try { js = JSON.parse(rep.slice(rep.indexOf('--- JSON')).split('\n')[1]); } catch (e) {}
  ok(js && js.farm.residentInMemory === true && js.farm.gpuResources === 'resident' && js.hitchLog.length >= 2 && js.display.hz === 144 && typeof js.context.gpuRenderer === 'string' && js.graphics.storedAutoLevel === stored1, 'its JSON block parses: farm resident, hitch log, refresh, GPU renderer string, stored AUTO level (as it really is: ' + stored1 + ')');
  ok(/HITCH LOG/.test(rep) && /EVENTS/.test(rep) && /FRAME STATISTICS/.test(rep), 'it has the frame statistics, hitch log and event sections');
  await p.keyboard.press('Shift+F8');
  let dlg = await p.evaluate(() => ({ shown: !document.getElementById('perfLab').hidden, ta: document.getElementById('pl_ta').value.length, ov: PERF.on }));
  ok(dlg.shown && dlg.ta > 2000 && dlg.ov, 'Shift+F8 opens the report dialog (the overlay toggle is not triggered by it)');
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); document.execCommand = () => false; });
  await p.click('#pl_copy'); await sleep(100);
  const cp = await p.evaluate(() => { const t = document.getElementById('pl_ta'); return { st: document.getElementById('pl_stat').textContent, sel: t.selectionEnd - t.selectionStart, len: t.value.length }; });
  ok(/Ctrl\+C/.test(cp.st) && cp.sel === cp.len, 'if the clipboard is blocked (artifact sandbox) the text is selected, with the instruction to press Ctrl/Cmd+C');
  await p.keyboard.press('Escape'); ok(await p.evaluate(() => document.getElementById('perfLab').hidden), 'Esc closes it');

  console.log('\n— the lab switches (ff_lab): stored only when they differ; never touch ff_autoLevel or the preset');
  const stored0 = await p.evaluate(() => localStorage.getItem('ff_autoLevel'));      // (12 s of healthy synthetic frames may already have stepped AUTO up from 2: that is the normal AUTO)
  await p.keyboard.press('Shift+F8');
  await p.selectOption('#pl_park', 'park'); await p.selectOption('#pl_light', 'clear'); await p.selectOption('#pl_comm', 'off'); await p.selectOption('#pl_auto', 'race');
  let l = await p.evaluate(() => ({ ls: JSON.parse(localStorage.getItem('ff_lab')), lab: PERFLAB.lab, auto: GFX.AUTO.lab, stored: localStorage.getItem('ff_autoLevel'), q: settings.quality, qs: localStorage.getItem('ff_quality') }));
  ok(l.ls.park === 'park' && l.ls.light === 'clear' && l.ls.comm === 'off' && l.ls.auto === 'race' && l.auto === 'race' && l.stored === stored0 && l.q === 'auto' && l.qs === '"auto"', `the four switches are stored under ff_lab; ff_autoLevel (${stored0}) and the quality preset are untouched by changing them`);
  ok(await p.evaluate(() => /⚠ not the normal game/.test(PERFLAB.report()) && /FORCED afternoon-clear/.test(PERFLAB.report()) && /PARKED while racing/.test(PERFLAB.report())), 'the report flags a non-default lab');
  await p.click('#pl_reset'); l = await p.evaluate(() => ({ ls: localStorage.getItem('ff_lab'), lab: PERFLAB.lab, auto: GFX.AUTO.lab }));
  ok(l.ls === null && l.auto === 'normal' && l.lab.park === 'retain', '"Reset all to normal" removes the key');
  await p.keyboard.press('Escape');
  // AUTO semantics (GFX.autoTick fed with synthetic intervals, the way auto-quality-browser does)
  const au = await p.evaluate(() => {
    const feed = (ms, secs, race) => { const n = Math.round(secs * 1000 / ms); for (let i = 0; i < n; i++) GFX.autoTick(ms / 1000, true, race); return GFX.AUTO.level; };
    const out = {}; GFX.AUTO.level = 0; GFX.AUTO.hold = 0; GFX.AUTO.fails = {}; localStorage.setItem('ff_autoLevel', '0'); const w0 = [];
    const sp = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { w0.push(k); return sp.call(this, k, v); };
    PERFLAB.setLab('auto', 'race'); out.raceOnlyFarm = feed(40, 10, false); out.raceOnlyRace = feed(40, 10, true);
    GFX.AUTO.level = 0; GFX.AUTO.hold = 0; GFX.AUTO.fails = {}; out.writesBefore = w0.length;
    PERFLAB.setLab('auto', 'normal'); out.normalFarm = feed(40, 10, false);
    GFX.AUTO.level = 5; GFX.AUTO.hold = 0; PERFLAB.setLab('auto', 'off'); const R = GFX.runtimeParams(); w0.length = 0; out.offRun = feed(60, 12, true); out.offWrites = w0.length; out.offLevel = GFX.AUTO.level; out.offPR = R.pr; out.offShadow = R.shadow;
    PERFLAB.setLab('auto', 'normal'); out.back = GFX.runtimeParams(); Storage.prototype.setItem = sp; return out;
  });
  ok(au.raceOnlyFarm === 0 && au.raceOnlyRace > 0, `"race frames only": 10 s of slow farm frames change nothing (level ${au.raceOnlyFarm}), slow race frames still step down (level ${au.raceOnlyRace})`);
  ok(au.normalFarm > 0, `"normal": slow farm frames feed AUTO exactly as before (level ${au.normalFarm})`);
  ok(au.offLevel === 5 && au.offWrites === 0 && au.offPR === 1.5 && au.offShadow === 2048 && au.back.shadow === 1024, `"off": fixed top level = Medium (render ×${au.offPR}, shadows ${au.offShadow}) whatever the stored level; 12 s of very slow frames change nothing and write nothing; switching back restores level 5 (shadows ${au.back.shadow})`);
  // race lighting
  const lt = await p.evaluate(() => { const go = () => { startRace(Object.assign(quickCfg(), { distance: 1000, field: 6, track: 'randwick', seed: 3, allBots: true, career: { name: 'Look test', exhibition: true, tod: 'golden_hour', wx: 'rain' } })); const a = GFX.atmo; const r = a.tod + '/' + a.wx; quitToMenu(); return r; };
    const n = go(); PERFLAB.setLab('light', 'clear'); const c = go(); PERFLAB.setLab('light', 'normal'); return { n, c, again: go() }; });
  ok(lt.n === 'golden_hour/rain' && lt.c === 'afternoon/clear' && lt.again === 'golden_hour/rain', `race lighting: normal uses the event's own look (${lt.n}); forced = ${lt.c}; back to normal = ${lt.again}`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // =============================================================== B: commentary switch (real time: the booth speaks on the wall clock)
  console.log('\n— commentary switch: off silences the call and decoding without touching the saved setting');
  const com = {};
  for (const mode of ['normal', 'off']) {
    ({ ctx, p, errs } = await open(b, { stubRaf: false, seed: { ff_lab: JSON.stringify({ auto: 'normal', park: 'retain', light: 'normal', comm: mode }), ff_commentary: JSON.stringify({ on: true, vol: 0.9, captions: true }), ff_eleven: JSON.stringify({ mode: 'local', nameFallback: 'local' }) } }));    // local speech: the stub can count it (the recorded clips use Web Audio)
    await p.evaluate(() => { renderer.render = () => {}; startRace(Object.assign(quickCfg(), { distance: 1000, field: 6, track: 'generic', seed: 3, allBots: true })); });
    await p.waitForFunction(() => race && race.state === 'running', null, { timeout: 60000 }); await sleep(9000);
    com[mode] = await p.evaluate(() => ({ spoken: window.__spoken.length, saved: localStorage.getItem('ff_commentary') })); await ctx.close();
  }
  ok(com.normal.spoken > 0 && com.off.spoken === 0 && com.off.saved === com.normal.saved && /"on":true/.test(com.off.saved), `commentary: ${com.normal.spoken} lines spoken normally, ${com.off.spoken} with the lab switch off; the saved ff_commentary is unchanged`);

  // =============================================================== C: the benchmark (short version of the real thing; synthetic clock)
  console.log('\n— benchmark race: fixed race, all-bot, recorded from the gates, report at the end, settings restored');
  ({ ctx, p, errs } = await open(b, { stubRaf: true, seed: { ff_autoLevel: '1' } }));
  await p.evaluate(() => { renderer.render = () => {}; const B = PERFLAB.benchmark; B.secs = 6; B.farmSecs = 2; window.__w = []; const sp = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === localStorage) window.__w.push(k); return sp.call(this, k, v); };
    window.__s0 = { cam: settings.cam, parade: settings.parade, keys: Object.keys(localStorage).sort().join(','), q: settings.quality }; PERFLAB.runBench('farm'); });
  const stepUntil = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await p.evaluate(() => { for (let i = 0; i < 20; i++) step(16.667); }); if (await p.evaluate(fn)) return true; await sleep(30); } return false; };
  ok(await p.evaluate(() => PERFLAB.benchmark.on && PERFLAB.benchmark.phase === 'farm' && PERFLAB.rec && !PERF.on), 'the "after 60 s on the farm" variant first waits on the menu showcase (recording without the F8 overlay)');
  ok(await stepUntil(() => PERFLAB.benchmark.phase === 'run' || PERFLAB.benchmark.phase === 'wait-gates', 20000), 'then the race starts by itself');
  const cfg = await p.evaluate(() => ({ track: race.cfg.track, dist: race.dist, field: race.horses.length, seed: race.cfg.seed, allBots: race.cfg.allBots, cam: camMode, tod: race.cfg.career.tod, parade: settings.parade }));
  ok(cfg.track === 'randwick' && cfg.dist === 1600 && cfg.field === 12 && cfg.seed === 11 && cfg.allBots && cfg.cam === 0 && cfg.tod === 'afternoon' && cfg.parade === 'off', 'fixed venue, distance, field, seed, all-bot riding and chase camera: ' + JSON.stringify(cfg));
  ok(await stepUntil(() => PERFLAB.benchmark.result && ui.state === 'menu' && document.getElementById('perfLab') && !document.getElementById('perfLab').hidden, 90000), 'after the measured seconds the race is left, the main menu is back and the report dialog opens by itself');
  const br = await p.evaluate(() => { const B = PERFLAB.benchmark, r = B.result; return { on: B.on, r, rec: PERFLAB.rec, now: { cam: settings.cam, parade: settings.parade, keys: Object.keys(localStorage).sort().join(','), q: settings.quality }, writes: [...new Set(window.__w)], ta: document.getElementById('pl_ta').value, s0: window.__s0 }; });
  ok(!br.on && !br.rec && br.now.cam === br.s0.cam && br.now.parade === br.s0.parade && br.now.q === br.s0.q && br.now.keys === br.s0.keys && br.writes.every(k => k === 'ff_autoLevel'), `settings restored (camera ${br.now.cam}, parade ${br.now.parade}); the benchmark wrote nothing to storage (the only key written during the run: ${br.writes.join(', ') || 'none'} — AUTO's own normal step-up after healthy frames); recording stopped`);
  ok(br.r && br.r.variant === 'after 60 s on the farm showcase' && br.r.stats && br.r.stats.seconds >= 5.5 && br.r.stats.frames > 300 && br.r.stats.onTimePct === 100 && br.r.stats.hitches === 0 && br.r.meets.onTime, `result: ${br.r && br.r.stats ? br.r.stats.seconds + ' s, ' + br.r.stats.frames + ' frames, on-time ' + br.r.stats.onTimePct + ' %, ' + br.r.stats.hitches + ' hitches (synthetic steady clock)' : 'none'}`);
  ok(/BENCHMARK RESULT/.test(br.ta) && /Royal Randwick · 1,600 m · 12 runners · seed 11/.test(br.ta) && /FARM: world IS resident/.test(br.ta), 'the report carries the benchmark section and says the farm was resident');
  // the straight-after-launch variant and cancelling
  await p.evaluate(() => { PERFLAB.close(); PERFLAB.benchmark.secs = 4; PERFLAB.runBench('now'); });
  ok(await stepUntil(() => PERFLAB.benchmark.phase === 'run', 20000) && await p.evaluate(() => PERFLAB.benchmark.variant === 'now'), 'the "straight after launching" variant starts the race at once');
  await p.evaluate(() => { handleEsc(); }); await sleep(700);      // the pause screen draws no frames: a 250 ms timer notices the race was left
  ok(await p.evaluate(() => !PERFLAB.benchmark.on && !PERFLAB.rec && settings.cam === window.__s0.cam && settings.parade === window.__s0.parade), 'leaving the race (pause) cancels the benchmark and restores the camera / parade settings');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  // =============================================================== D: park the farm's GPU resources before racing — and restore it (real rendering)
  console.log('\n— park: the farm\'s GPU resources are freed while racing and come back intact (real rendering)');
  ({ ctx, p, errs } = await open(b, { stubRaf: false, seed: {} }));
  await p.evaluate(() => { const mk = (id, n, r) => ({ id, name: n, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, pot: { top: r + 12, acc: r + 12, end: r + 12, spr: r + 12, rec: r + 12, tem: r + 12, agi: r + 12, sta: r + 12 }, look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, born: 1 });
    const C = { v: 3, seed: 2468, stable: 'Park Test Stable', horses: [mk('hA', 'Alpha Test', 72), mk('hB', 'Bravo Test', 66)], active: 0, trophies: [], wins: 0, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C)); });
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => typeof CAREER !== 'undefined' && typeof FARM !== 'undefined' && FARM.built);
  const frames = async n => { await p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n); };
  const gpu = () => p.evaluate(() => ({ geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, prog: renderer.info.programs.length }));
  const trip = async () => { await p.evaluate(() => { startRace(Object.assign(quickCfg(), { distance: 1000, field: 6, track: 'generic', seed: 5, allBots: true })); }); await frames(8); const mid = await gpu(); const info = await p.evaluate(() => ({ parked: FARM.parked, last: PERFLAB.report().match(/last race start:[^\n]*/)[0] })); await p.evaluate(() => SCENES.enter('farm', { instant: true })); await frames(6); return { mid, info }; };
  await p.evaluate(() => SCENES.enter('farm', { instant: true })); await frames(10);
  const data0 = await p.evaluate(() => localStorage.getItem('ff_career')), farm0 = await p.evaluate(() => ({ i: FARM.info(), calls: renderer.info.render.calls, st: FARM.stats() })), g0 = await gpu();
  await trip();                                        // warm-up trip: the race venue and horse geometry get built and cached
  await p.evaluate(() => SCENES.enter('farm', { instant: true })); await frames(10);
  const ret = await trip(), g1 = await gpu();           // retained: the normal game
  ok(ret.info.parked === false && /GPU resident/.test(ret.info.last), `retained (normal): the farm's GPU resources stay resident during the race (${ret.mid.geo} geometries / ${ret.mid.tex} textures alive in the race; farm alone ${g0.geo}/${g0.tex})`);
  await p.evaluate(() => PERFLAB.setLab('park', 'park'));
  await p.evaluate(() => SCENES.enter('farm', { instant: true })); await frames(10); const gp0 = await gpu();
  const prk = await trip(), gp1 = await gpu();
  ok(prk.info.parked === true && /PARKED/.test(prk.info.last), `parked: ${prk.info.last.replace('last race start: ', '').slice(0, 170)}`);
  ok(prk.mid.geo < ret.mid.geo - 15 && prk.mid.tex < ret.mid.tex - 2, `while racing, far fewer GPU objects are alive (geometries ${ret.mid.geo} → ${prk.mid.geo}, textures ${ret.mid.tex} → ${prk.mid.tex})`);
  const after = await p.evaluate(() => ({ i: FARM.info(), parked: FARM.parked, calls: renderer.info.render.calls, st: FARM.stats(), career: localStorage.getItem('ff_career'), fig: !!FARM._test.figure, scenes: SCENES.scene }));
  ok(!after.parked && after.scenes === 'farm' && after.i.horses === 2 && after.i.plaques === 5 && after.i.objects === farm0.i.objects && after.fig, `back on the farm: (parked ${after.parked}, scene ${after.scenes}, character ${after.fig}) un-parked, ${after.i.horses} horses in their boxes, ${after.i.plaques} plaques, ${after.i.objects} scene objects (was ${farm0.i.objects}), the character is there`);
  ok(Math.abs(after.calls - farm0.calls) <= Math.max(12, farm0.calls * 0.1) && after.calls > 100, `the farm draws as before after the re-upload (${after.calls} draw calls; ${farm0.calls} before)`);
  ok(after.career === data0, 'the career save is byte-for-byte unchanged');
  ok(gp1.geo <= gp0.geo + 4 && gp1.tex <= gp0.tex + 4 && gp1.geo >= g1.geo - 30, `the GPU objects return to the normal count (geometries ${gp0.geo} → ${gp1.geo}, textures ${gp0.tex} → ${gp1.tex}; retained run ended at ${g1.geo}/${g1.tex})`);
  // ten trips with the switch on: no growth
  await p.evaluate(() => { gc(); gc(); SCENES.mark('park'); }); const pb = await p.evaluate(() => SCENES.snapshot('park'));
  for (let i = 0; i < 10; i++) await trip();
  await p.evaluate(() => { gc(); gc(); }); await sleep(200);
  const pc = await p.evaluate(() => SCENES.check('park', { geo: 6, tex: 6, heapMB: 30 })), dataN = await p.evaluate(() => localStorage.getItem('ff_career'));
  ok(pc.ok && pc.now.farm.horses === 2 && dataN === data0, `10 more parked trips: geometries ${pb.geo} → ${pc.now.geo}, textures ${pb.tex} → ${pc.now.tex}, programs Δ${pc.delta.prog}, heap Δ${pc.delta.heapMB} MB; horses and career data intact`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
