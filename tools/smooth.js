// Smoothness measurement (motion judder, CPU time per frame, allocation rate) in the real game, headless.
// The game's own frame() is driven with a synthetic display clock (60 Hz with ±0.7 ms jitter, or 144 Hz) so the
// motion can be measured independently of this machine's (software) GPU; rendering is skipped for the motion pass and
// done for real for the CPU-cost pass.
//   PORT=8095 node tools/smooth.js [label]   → prints one JSON line per condition
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`, LABEL = process.argv[2] || 'run';
const conds = [];
const ENV = k => process.env[k] ? process.env[k].split(',') : null;
for (const track of ENV('TRACKS') || ['randwick', 'flemington']) for (const cam of (ENV('CAMS') || [0, 1, 2]).map(Number)) conds.push({ track, cam });
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  for (const c of conds) for (const hz of (ENV('HZ') || [60, 144]).map(Number)) {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
    await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_comm', '"off"'); window.__noPresent = true;
      window.__rafQ = []; window.requestAnimationFrame = f => { window.__rafQ.push(f); return 1; }; });   // we drive the frames
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    p.on('requestfailed', q => errs.push('failed: ' + q.url().slice(0, 120) + ' ' + (q.failure() || {}).errorText));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 240000 });
    try { await p.waitForFunction(() => typeof startRace === 'function', null, { timeout: 120000 }); } catch (e) { console.error('no startRace', errs, await p.evaluate(() => document.readyState + ' ' + document.scripts.length).catch(x => x.message)); throw e; } await p.waitForFunction(() => typeof startRace === 'function', null, { timeout: 240000 });
    const r = await p.evaluate(async ({ c, hz, vis }) => {
      let t = performance.now(); const step = dtMs => { t += dtMs; const q = window.__rafQ.splice(0); for (const f of q) f(t); };
      settings.parade = 'off'; settings.crowd = 'full'; settings.cam = c.cam; ui.state = 'racing';
      startRace(Object.assign(quickCfg(), { distance: 1600, field: 12, track: c.track, incidents: 'off', seed: 11, allBots: true }));
      if (typeof PRESENT !== 'undefined' && PRESENT.mode) PRESENT.finish();
      camMode = c.cam; if (vis === 'off' && typeof VIS !== 'undefined') VIS.on = false;   // A/B: the old path (draw the latest step)
      const R0 = renderer.render.bind(renderer); renderer.render = () => {};
      // get to the race proper (gates open, settled into stride), 60 Hz
      for (let i = 0; i < 60 * 14 && !(race.state === 'running' && race.clock > 6); i++) step(1000 / 60);
      // motion pass: 600 frames at the display rate with realistic frame-clock jitter
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const P = race.player, rec = [];
      for (let i = 0; i < 600; i++) {
        const dt = 1000 / hz + (rnd() - 0.5) * 1.4; step(dt);
        const m = P.mesh.position, e = camera.matrixWorld.elements; rec.push([dt, m.x, m.z, camera.position.x, camera.position.y, camera.position.z, -e[8], -e[9], -e[10]]);
      }
      const jit = (k0) => { const v = []; for (let i = 2; i < rec.length; i++) { const d = Math.hypot(rec[i][k0] - rec[i - 1][k0], rec[i][k0 + 1] - rec[i - 1][k0 + 1]); v.push(d / (rec[i][0] / 1000)); }
        const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
        // frame-to-frame change in apparent speed (what the eye reads as judder), and frames with no movement at all
        let dd = 0; for (let i = 1; i < v.length; i++) dd += Math.abs(v[i] - v[i - 1]); return { speed: +m.toFixed(2), cv: +(100 * sd / m).toFixed(1), d2: +(100 * dd / (v.length - 1) / m).toFixed(1), stall: v.filter(x => x < m * 0.2).length }; };
      const horse = jit(1), camj = jit(3);
      // camera rotation (what a panning broadcast camera does): angular speed of the view direction, frame to frame
      const av = []; for (let i = 2; i < rec.length; i++) { const a = rec[i], b = rec[i - 1]; const d = Math.min(1, a[6] * b[6] + a[7] * b[7] + a[8] * b[8]); av.push(Math.acos(d) / (a[0] / 1000)); }
      const am = av.reduce((x, y) => x + y, 0) / av.length; let add = 0; for (let i = 1; i < av.length; i++) add += Math.abs(av[i] - av[i - 1]);
      const camRot = { degPerS: +(am * 57.3).toFixed(1), d2: am > 1e-4 ? +(100 * add / (av.length - 1) / am).toFixed(1) : null, cuts: av.filter(x => x > 3).length };
      // CPU pass: real rendering, 90 frames — per-frame CPU time split, and the allocation rate
      renderer.render = R0; if (window.gc) window.gc();
      const ft = [], heap0 = performance.memory.usedJSHeapSize, t0 = performance.now();
      for (let i = 0; i < 90; i++) { const a = performance.now(); step(1000 / 60); ft.push(performance.now() - a); }
      const heap1 = performance.memory.usedJSHeapSize, el = performance.now() - t0;
      renderer.render = () => {};
      // allocation in the update path (no rendering): heap growth in 20-frame chunks; a chunk with a GC in it is skipped
      const upd = [], rates = []; let hp = performance.memory.usedJSHeapSize;
      for (let i = 0; i < 240; i++) { const a = performance.now(); step(1000 / 60); upd.push(performance.now() - a);
        if (i % 20 === 19) { const h2 = performance.memory.usedJSHeapSize; if (h2 >= hp) rates.push((h2 - hp) / 1e6 * 3); hp = h2; } }
      rates.sort((x, y) => x - y); const updAlloc = rates.length ? +rates[rates.length >> 1].toFixed(2) : null;
      const pct = (a, q) => { a = a.slice().sort((x, y) => x - y); return +a[Math.min(a.length - 1, Math.floor(a.length * q))].toFixed(2); };
      return { horse, camj, camRot, update: { p50: pct(upd, 0.5), p95: pct(upd, 0.95), p99: pct(upd, 0.99) }, withRender: { p50: pct(ft, 0.5), p95: pct(ft, 0.95) }, allocMBs: +((heap1 - heap0) / 1e6 / (90 / 60)).toFixed(2), updAllocMBs: updAlloc, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, vis: typeof VIS !== 'undefined' ? VIS.on : 'n/a' };
    }, { c, hz, vis: process.env.VIS || 'on' });
    console.log(JSON.stringify(Object.assign({ label: LABEL, track: c.track, cam: ['chase', 'jockey', 'broadcast'][c.cam], hz }, r, errs.length ? { errs } : {})));
    await ctx.close();
  }
  await b.close();
})();
