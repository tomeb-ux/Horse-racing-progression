// Dev tool: frame-time benchmark of real race scenes (headless Chromium). Same scenes, same seeds, same frame step for
// before/after comparisons. Drives the game's own frame() at a fixed 60 Hz step (so the race advances identically
// however slowly the software renderer draws) and splits every frame into:
//   cpu   — everything in frame() except the WebGL submission (simulation steps, animation, crowd/venue updates, camera, HUD)
//   draw  — three.js renderer.render() (scene traversal, culling, state changes, draw-call submission = CPU-side GPU work)
//   gpu   — gl.finish() after render (rasterisation; here SwiftShader on the CPU, so only RELATIVE numbers are meaningful)
// plus draw calls, triangles, textures, geometries, JS heap, horses visible, spectators drawn, and a no-shadows pass.
//   PORT=8095 node server/index.js &   node tools/bench.js [out.json] [scenario,...]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
const W = +(process.env.BW || 960), H = +(process.env.BH || 540), FR = +(process.env.FRAMES || 120);
const SCEN = {
  A_randwick_everest: { track: 'randwick', dist: 1200, field: 12, at: 700, cam: 2, career: { name: 'The Everest', major: true, crown: true }, q: 'high' },
  B_flemington_cup: { track: 'flemington', dist: 3200, field: 24, at: 700, cam: 2, career: { name: 'Melbourne Cup', major: true, crown: true }, q: 'high' },
  C_grandstand_view: { track: 'flemington', dist: 2400, field: 14, at: 330, cam: 2, career: { name: 'Group race', major: true }, q: 'high' },
  E_chase_close: { track: 'randwick', dist: 1600, field: 14, at: 900, cam: 0, career: null, q: 'high' },
  F_quick_generic: { track: 'generic', dist: 1600, field: 12, at: 900, cam: 2, career: null, q: 'high' },
};
const pick = process.argv[3] ? process.argv[3].split(',') : Object.keys(SCEN);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
(async () => {
  const results = {};
  for (const name of pick) {
    const s = SCEN[name];
    // a fresh browser per scene: a software-rendered heavy scene can leave the GPU process busy long after its page closes
    const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    if (fs.existsSync(path.join(__dirname, '../public/vendor/three.min.js'))) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(path.join(__dirname, '../public/vendor/three.min.js')), contentType: 'text/javascript' }));
    await ctx.addInitScript(q => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_autoReplay', 'false'); localStorage.setItem('ff_comm', '"off"'); localStorage.setItem('ff_quality', JSON.stringify(q)); localStorage.setItem('ff_parade', '"off"'); localStorage.setItem('ff_celebrate', 'false'); window.__noPresent = true; window.__bench = true; }, s.q);
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForFunction(() => typeof startRace === 'function' && typeof race !== 'undefined');
    await new Promise(r => setTimeout(r, 400));
    const res = await p.evaluate(async ([s, FR]) => {
      // stop the real-time loop; we drive frame() ourselves at an exact 60 Hz step
      window.requestAnimationFrame = () => 0;
      const gl = renderer.getContext(); const T = { draw: 0, gpu: 0 };
      renderer.info.autoReset = false;                     // count the shadow pass's draws too (reset by hand each frame)
      const R0 = renderer.render.bind(renderer);
      renderer.render = (sc, ca) => { const a = performance.now(); R0(sc, ca); const b = performance.now(); gl.finish(); const c = performance.now(); T.draw += b - a; T.gpu += c - b; };
      settings.cam = s.cam;
      const cfg = Object.assign(quickCfg(), { distance: s.dist, field: s.field, track: s.track, chaos: false, incidents: 'off', allBots: true, seed: 11 });
      if (s.career) cfg.career = s.career;
      const tb0 = performance.now(); startRace(cfg); const tBuild = performance.now() - tb0;
      race.state = 'count'; race.openGates();
      let n = 0; const lead = () => Math.max(...race.horses.map(h => h.progress));
      while (race.dist - lead() > s.at + 60 && n++ < 400000) race.step(SIM_DT);
      let now = performance.now(); lastT = now;
      // warm-up: shader compilation, texture uploads, the camera settling (also measured: first-frame stall)
      const w0 = performance.now(); frame(now += 16.667); const first = performance.now() - w0;
      for (let i = 0; i < 40; i++) frame(now += 16.667);
      const ft = [], cpu = [], draw = [], gpu = [], heap = [], tris = [], calls = [];
      let crowdDrawn = 0, horsesVis = 0;
      const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
      for (let i = 0; i < FR; i++) {
        T.draw = 0; T.gpu = 0; renderer.info.reset(); const a = performance.now(); frame(now += 16.667); const tot = performance.now() - a;
        ft.push(tot); draw.push(T.draw); gpu.push(T.gpu); cpu.push(tot - T.draw - T.gpu);
        calls.push(renderer.info.render.calls); tris.push(renderer.info.render.triangles);
        if (performance.memory) heap.push(performance.memory.usedJSHeapSize / 1048576);
        if (i === FR >> 1) {
          pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
          scene.traverseVisible(o => { if (o.isInstancedMesh && o.material && o.material.customProgramCacheKey && o.material.customProgramCacheKey() === 'ffcrowd') { const bs = o.geometry.boundingSphere; if (!bs || frustum.intersectsSphere(bs.clone().applyMatrix4(o.matrixWorld))) crowdDrawn += o.count; } });
          horsesVis = race.horses.filter(h => h.mesh && h.mesh.visible && frustum.intersectsObject(h.mesh.userData.blob || h.mesh.children[0] || h.mesh)).length;
        }
      }
      // the same view without shadows: the shadow pass's share
      const shOn = renderer.shadowMap.enabled; let noSh = null;
      if (shOn) { renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); for (let i = 0; i < 10; i++) frame(now += 16.667);
        const t2 = []; for (let i = 0; i < 30; i++) { T.draw = 0; T.gpu = 0; const a = performance.now(); frame(now += 16.667); t2.push(performance.now() - a); } noSh = t2; renderer.shadowMap.enabled = true; }
      const mem = renderer.info.memory;
      let geoCount = 0, instCount = 0, meshCount = 0; scene.traverse(o => { if (o.isMesh) { meshCount++; if (o.isInstancedMesh) instCount++; } });
      return { tBuild, first, ft, cpu, draw, gpu, calls, tris, heap, noSh, crowdDrawn, horsesVis, horses: race.horses.length, textures: mem.textures, geometries: mem.geometries, meshes: meshCount, instanced: instCount, programs: renderer.info.programs ? renderer.info.programs.length : null, pr: renderer.getPixelRatio(), shadowMap: shOn ? sun.shadow.mapSize.x : 0, quality: settings.quality };
    }, [s, FR]);
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const out = { scene: name, build_ms: +res.tBuild.toFixed(0), first_frame_ms: +res.first.toFixed(0),
      frame_avg: +avg(res.ft).toFixed(1), frame_med: +pct(res.ft, 50).toFixed(1), frame_p95: +pct(res.ft, 95).toFixed(1), frame_p99: +pct(res.ft, 99).toFixed(1), frame_max: +Math.max(...res.ft).toFixed(1),
      cpu_med: +pct(res.cpu, 50).toFixed(2), cpu_p95: +pct(res.cpu, 95).toFixed(2), cpu_max: +Math.max(...res.cpu).toFixed(2),
      draw_med: +pct(res.draw, 50).toFixed(2), draw_p95: +pct(res.draw, 95).toFixed(2), gpu_med: +pct(res.gpu, 50).toFixed(1),
      calls_med: pct(res.calls, 50), calls_max: Math.max(...res.calls), tris_med: pct(res.tris, 50), tris_max: Math.max(...res.tris),
      noShadow_med: res.noSh ? +pct(res.noSh, 50).toFixed(1) : null, textures: res.textures, geometries: res.geometries, meshes: res.meshes, instanced: res.instanced, programs: res.programs,
      heap_start: res.heap.length ? +res.heap[0].toFixed(1) : null, heap_end: res.heap.length ? +res.heap[res.heap.length - 1].toFixed(1) : null, heap_max: res.heap.length ? +Math.max(...res.heap).toFixed(1) : null,
      horses: res.horses, horses_visible: res.horsesVis, crowd_drawn: res.crowdDrawn, pixel_ratio: res.pr, shadow_map: res.shadowMap, quality: res.quality, errors: errs.length };
    console.log(JSON.stringify(out)); results[name] = out;
    await ctx.close(); await b.close();
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
})();
