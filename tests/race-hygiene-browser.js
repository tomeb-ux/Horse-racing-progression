// Race hygiene (Phase 15A): what the page does WHILE a race is running, counted per race second after the gates open.
//   texture uploads (texImage2D / texSubImage2D / …) · buffer uploads (bufferData / bufferSubData) · shader compilations (compileShader / linkProgram)
//   localStorage writes · applyQuality() calls · setPixelRatio() calls (each applyQuality makes exactly one, and it reallocates the drawing buffer)
// Everything is counted from OUTSIDE the game: Playwright injects wrappers around the WebGL context prototypes, Storage and (once the page has loaded) the
// renderer's setPixelRatio and GFX.applyQuality. No hook in the game is used, so this file runs UNCHANGED against old builds (e.g. 5139a6f).
// Counts are valid under SwiftShader even though timings are not. Frames are driven with a synthetic 60 Hz clock (steady frames), so AUTO graphics only reacts to
// what the test feeds it; the "afterfarm" scenario feeds it slow menu-showcase frames first (a mechanism check: can the farm's frames change quality before/in a race?).
//   PORT=8095 node tests/race-hygiene-browser.js            (BASE=http://localhost:8103/ for another build; SCENS=quick,afterfarm  CAMS=0,2  SECS=20  VW=480 VH=270  INFO=1 → never exit non-zero)
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
const SECS = +(process.env.SECS || 20), SETTLE = 3, CAMS = (process.env.CAMS || '0,2').split(',').map(Number), SCENS = (process.env.SCENS || 'quick,afterfarm').split(',');
const LABEL = process.env.LABEL || BASE;
let pass = 0, fail = 0, info = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const note = m => { info++; console.log(' · ' + m); };

// ---- installed before any page script runs ----
const INIT = () => {
  // seed the settings first (the counters below are installed afterwards, so these writes are not counted)
  localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_autoReplay', 'false'); localStorage.setItem('ff_parade', '"off"'); localStorage.setItem('ff_celebrate', 'false');
  localStorage.setItem('ff_commentary', JSON.stringify({ on: false, vol: 0.9, captions: false })); localStorage.removeItem('ff_quality'); localStorage.removeItem('ff_autoLevel');
  window.__noPresent = true;
  window.__rafQ = []; window.requestAnimationFrame = f => { window.__rafQ.push(f); return 1; };            // the test drives every frame
  const H = window.__hyg = { b: 'pre', bucket: {}, total: {}, stack: [] };
  const add = (k, n) => { n = n || 1; const o = H.bucket[H.b] || (H.bucket[H.b] = {}); o[k] = (o[k] || 0) + n; H.total[k] = (H.total[k] || 0) + n; };
  const wrap = (proto, names, key, bytes) => { for (const n of names) { const o = proto && proto[n]; if (typeof o !== 'function') continue;
    proto[n] = function () { add(key); if (bytes) { const a = arguments[1]; add(key + 'Bytes', typeof a === 'number' ? a : (a && a.byteLength) || 0); } return o.apply(this, arguments); }; } };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue; const p = C.prototype;
    wrap(p, ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'copyTexImage2D', 'copyTexSubImage2D'], 'texUploads');
    wrap(p, ['bufferData', 'bufferSubData'], 'bufUploads', true);
    wrap(p, ['compileShader'], 'shaderCompiles'); wrap(p, ['linkProgram'], 'programLinks');
  }
  for (const n of ['setItem', 'removeItem', 'clear']) { const o = Storage.prototype[n]; Storage.prototype[n] = function () { if (this === window.localStorage) { add('lsWrites'); if (n === 'setItem') (H.lsKeys || (H.lsKeys = {}))[arguments[0]] = (H.lsKeys[arguments[0]] || 0) + 1; } return o.apply(this, arguments); }; }
  // the game's own functions, wrapped from outside as soon as the page has loaded (before any race starts)
  window.addEventListener('load', () => {
    try { const o = renderer.setPixelRatio; renderer.setPixelRatio = function () { add('setPixelRatio'); if (/applyQuality/.test(new Error().stack || '')) add('applyQuality'); return o.apply(this, arguments); }; } catch (e) { H.noRenderer = String(e); }
    try { const o = GFX.applyQuality; GFX.applyQuality = function () { add('applyQualityExternal'); return o.apply(this, arguments); }; } catch (e) { H.noGfx = String(e); }
  });
};

(async () => {
  console.log(`race hygiene · ${LABEL} · ${SECS} race seconds per run (the first ${SETTLE} s are "settling", the rest must be clean)`);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = [];
  for (const scen of SCENS) for (const cam of CAMS) {
    const ctx = await b.newContext({ viewport: { width: +(process.env.VW || 480), height: +(process.env.VH || 270) }, deviceScaleFactor: 1 });   // small by default: the counts do not depend on the size, software rendering does
    await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(INIT);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE, { waitUntil: 'load', timeout: 240000 });
    await p.waitForFunction(() => typeof startRace === 'function' && typeof race !== 'undefined' && typeof GFX !== 'undefined', null, { timeout: 120000 });
    const hasFarm = await p.evaluate(() => typeof FARM !== 'undefined');
    console.log(`\n== ${scen} · camera ${['chase', 'jockey', 'broadcast'][cam]} ==`);
    if (scen === 'afterfarm' && !hasFarm) { note('BLOCKED: this build has no farm (it predates the Career expansion), so there is no farm / menu showcase to run first'); results.push({ scen, cam, blocked: 'no farm in this build' }); await ctx.close(); continue; }
    const r = await p.evaluate(async ({ scen, cam, SECS, SETTLE }) => {
      const H = window.__hyg; let t = performance.now(); const step = dt => { t += dt; const q = window.__rafQ.splice(0); for (const f of q) f(t); };
      const out = { wrapperErrors: [H.noRenderer, H.noGfx].filter(Boolean) };
      for (let i = 0; i < 30; i++) step(16.667);                                  // boot: the menu (and, in newer builds, the farm showcase) settle
      if (scen === 'afterfarm') {                                               // 8 s of menu-showcase frames at 40 fps (what a modest device does on the farm): does that feed AUTO?
        out.autoBefore = GFX.AUTO.level; for (let i = 0; i < 320; i++) step(25); out.autoAfterFarm = GFX.AUTO.level; out.storedAfterFarm = localStorage.getItem('ff_autoLevel');
      }
      out.autoStart = GFX.AUTO.level; out.autoChangesStart = GFX.AUTO.changes; out.storedStart = localStorage.getItem('ff_autoLevel');
      settings.parade = 'off'; settings.crowd = 'full'; settings.cam = cam;
      H.b = 'pre';
      const g0 = renderer.info.memory.geometries, t0 = renderer.info.memory.textures, p0 = renderer.info.programs ? renderer.info.programs.length : 0;
      startRace(Object.assign(quickCfg(), { distance: 1600, field: 12, track: 'randwick', incidents: 'off', seed: 11, allBots: true }));
      if (typeof PRESENT !== 'undefined' && PRESENT.mode) PRESENT.finish();
      let pre = 0; while (!(race.state === 'running') && pre++ < 900) step(16.667);
      out.preGateFrames = pre; out.gatesOpened = race.state === 'running';
      out.gpuAtGates = { geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, prog: renderer.info.programs ? renderer.info.programs.length : 0, geo0: g0, tex0: t0, prog0: p0 };
      out.autoAtGates = GFX.AUTO.level; out.autoChangesAtGates = GFX.AUTO.changes; out.storedAtGates = localStorage.getItem('ff_autoLevel');
      let n = 0; const startClock = race.clock;
      while (race.state === 'running' && race.clock - startClock < SECS && n++ < 20000) { H.b = 's' + Math.floor(race.clock - startClock); step(16.667); }
      H.b = 'post';
      out.framesRaced = n; out.raceClock = +(race.clock - startClock).toFixed(2); out.state = race.state;
      out.autoEnd = GFX.AUTO.level; out.autoChangesEnd = GFX.AUTO.changes; out.storedEnd = localStorage.getItem('ff_autoLevel');
      out.gpuEnd = { geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, prog: renderer.info.programs ? renderer.info.programs.length : 0 };
      out.bucket = H.bucket; out.total = H.total; out.lsKeys = H.lsKeys || {};
      return out;
    }, { scen, cam, SECS, SETTLE });
    // ---- per-second table + totals (seconds ≥ SETTLE are "clean" territory)
    const KEYS = ['texUploads', 'bufUploads', 'shaderCompiles', 'programLinks', 'lsWrites', 'applyQuality', 'setPixelRatio'];
    const sec = i => r.bucket['s' + i] || {}, cnt = (k, a, z) => { let s = 0; for (let i = a; i < z; i++) s += sec(i)[k] || 0; return s; };
    const secs = Math.floor(r.raceClock);
    console.log(`  gates opened: ${r.gatesOpened} after ${r.preGateFrames} frames · raced ${r.raceClock} s (${r.framesRaced} frames) · GPU objects at the gates ${r.gpuAtGates.geo} geometries / ${r.gpuAtGates.tex} textures / ${r.gpuAtGates.prog} programs → end ${r.gpuEnd.geo}/${r.gpuEnd.tex}/${r.gpuEnd.prog}`);
    if (scen === 'afterfarm') console.log(`  AUTO level: before the farm frames ${r.autoBefore} → after ${r.autoAfterFarm} (stored ff_autoLevel ${r.storedAfterFarm}) → at the gates ${r.autoAtGates} → end ${r.autoEnd}`);
    else console.log(`  AUTO level: start ${r.autoStart} → gates ${r.autoAtGates} → end ${r.autoEnd}`);
    console.log('  per race second:       ' + KEYS.map(k => k.padStart(14)).join(''));
    for (let i = 0; i < secs; i++) console.log(`    sec ${String(i).padStart(2)}${i < SETTLE ? ' (settling)' : '           '}` + KEYS.map(k => String(sec(i)[k] || 0).padStart(14)).join(''));
    console.log(`    seconds 0–${SETTLE - 1}              ` + KEYS.map(k => String(cnt(k, 0, SETTLE)).padStart(14)).join(''));
    console.log(`    seconds ${SETTLE}–${secs - 1} (clean)     ` + KEYS.map(k => String(cnt(k, SETTLE, secs)).padStart(14)).join(''));
    console.log(`    before the gates     ` + KEYS.map(k => String((r.bucket.pre || {})[k] || 0).padStart(14)).join(''));
    console.log(`  localStorage keys written (whole run): ${JSON.stringify(r.lsKeys)}`);
    const clean = k => cnt(k, SETTLE, secs), autoCh = r.autoChangesEnd - r.autoChangesAtGates;
    // sanity: the wrappers really count
    ok(r.wrapperErrors.length === 0, 'the page wrappers installed' + (r.wrapperErrors.length ? ': ' + r.wrapperErrors.join('; ') : ''));
    ok((r.total.texUploads || 0) > 0 && (r.total.bufUploads || 0) > 0 && (r.total.shaderCompiles || 0) > 0, `the counters see activity at all (texture uploads ${r.total.texUploads || 0}, buffer uploads ${r.total.bufUploads || 0}, shader compiles ${r.total.shaderCompiles || 0})`);
    ok(r.gatesOpened && secs >= SETTLE + 5, `the race ran ${r.raceClock} s after the gates (needs ≥ ${SETTLE + 5})`);
    // the hygiene rules (ROADMAP_P15 §2.5), after the first SETTLE seconds
    ok(clean('applyQuality') === 0 && clean('applyQualityExternal') === 0, `no applyQuality() calls after ${SETTLE} s (${clean('applyQuality')} internal, ${clean('applyQualityExternal') } external)`);
    ok(clean('setPixelRatio') === 0, `no setPixelRatio() calls after ${SETTLE} s (${clean('setPixelRatio')}) — each reallocates the drawing buffer`);
    ok(clean('shaderCompiles') === 0 && clean('programLinks') === 0, `no shader compilations after ${SETTLE} s (compile ${clean('shaderCompiles')}, link ${clean('programLinks')})`);
    ok(clean('lsWrites') === 0, `no localStorage writes after ${SETTLE} s (${clean('lsWrites')})`);
    ok(autoCh === 0, `no AUTO level change from the gates to the end (${autoCh}; level ${r.autoAtGates} → ${r.autoEnd})`);
    // information (a whitelist is expected: the documented periodic canvases)
    note(`uploads after ${SETTLE} s, per second: texture ${(clean('texUploads') / Math.max(1, secs - SETTLE)).toFixed(1)}/s (${clean('texUploads')} total) · buffer ${(clean('bufUploads') / Math.max(1, secs - SETTLE)).toFixed(1)}/s (${clean('bufUploads')} calls, ${(((r.bucket && Object.keys(r.bucket).filter(k => /^s\d+$/.test(k) && +k.slice(1) >= SETTLE).reduce((a, k) => a + (r.bucket[k].bufUploadsBytes || 0), 0)) || 0) / 1024).toFixed(0)} KB)`);
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    results.push({ scen, cam, secs, clean: Object.fromEntries(KEYS.map(k => [k, clean(k)])), settling: Object.fromEntries(KEYS.map(k => [k, cnt(k, 0, SETTLE)])), pre: Object.fromEntries(KEYS.map(k => [k, (r.bucket.pre || {})[k] || 0])), autoChanges: autoCh, auto: [r.autoStart, r.autoAtGates, r.autoEnd], gpu: [r.gpuAtGates, r.gpuEnd] });
    await ctx.close();
  }
  console.log('\nHYGIENE_JSON ' + JSON.stringify({ label: LABEL, results }));
  console.log(`\n${pass} passed, ${fail} failed (${info} informational lines)`); await b.close(); process.exit(fail && !process.env.INFO ? 1 : 0);
})();
