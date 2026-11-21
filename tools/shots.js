// Dev tool: capture real in-game screenshots (headless Chromium, software WebGL).
//   PORT=8095 node server/index.js &   then   node tools/shots.js <outDir> [shotsJson]
// A shot: { name, track, dist, field, at (m from home; omit = pre-start), cam (0 chase,1 jockey,2 broadcast), w, h, eval (extra JS) }
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
const out = process.argv[2] || 'shots'; fs.mkdirSync(out, { recursive: true });
const SHOTS = process.argv[3] ? JSON.parse(fs.existsSync(process.argv[3]) ? fs.readFileSync(process.argv[3], 'utf8') : process.argv[3]) : [
  { name: 'randwick_bend', track: 'randwick', dist: 1200, at: 700, cam: 2 },
  { name: 'randwick_straight', track: 'randwick', dist: 1200, at: 240, cam: 2 },
  { name: 'randwick_chase', track: 'randwick', dist: 1200, at: 380, cam: 0 },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const s of SHOTS) {
    const ctx = await b.newContext({ viewport: { width: s.w || 1280, height: s.h || 720 }, deviceScaleFactor: 1 });
    if (fs.existsSync(path.join(__dirname, '../public/vendor/three.min.js'))) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(path.join(__dirname, '../public/vendor/three.min.js')), contentType: 'text/javascript' }));
    await ctx.addInitScript(q => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_autoReplay', 'false'); localStorage.setItem('ff_comm', '"off"'); if (q) for (const k in q) localStorage.setItem(k, JSON.stringify(q[k])); }, s.ls || null);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE); await p.waitForFunction(() => typeof startRace === 'function' && typeof race !== 'undefined');
    await sleep(500);
    const t0 = Date.now();
    await p.evaluate(s => {
      settings.cam = s.cam != null ? s.cam : 2;
      const cfg = Object.assign(quickCfg(), { distance: s.dist || 1200, field: s.field || 12, track: s.track || 'generic', chaos: false, incidents: 'off', allBots: true, seed: s.seed || 7 }, s.cfg || {});
      if (s.meta) cfg.meta = s.meta;
      startRace(cfg);
      if (s.skipParade && typeof PRESENT !== 'undefined' && PRESENT.mode) PRESENT.finish();
      if (s.at != null) {
        race.state = 'count'; race.openGates && race.openGates();
        let n = 0; const lead = () => Math.max(...race.horses.map(h => h.progress));
        while (race.state !== 'done' && race.dist - lead() > s.at && n++ < 200000) race.step(SIM_DT);
      } else if (s.t != null) { let n = 0; while (n++ < s.t / SIM_DT) race.step(SIM_DT); }
      if (s.close) {                     // close-up: a camera fixed in the chosen horse's local frame
        const c = s.close; window.__close = c;
        updateCamera = function () { const h = c.horse === 'player' ? race.player : race.horses[c.horse || 0], m = h.mesh; if (!m) return;
          const q = m.quaternion, o = new THREE.Vector3(...c.off).applyQuaternion(q).add(m.position), l = new THREE.Vector3(...(c.look || [0, 1.2, 0])).applyQuaternion(q).add(m.position);
          camera.fov = c.fov || 35; camera.updateProjectionMatrix(); camera.position.copy(o); camera.lookAt(l); };
        if (c.freeze) { race.step = () => {}; }
      }
      if (s.view) {                      // a fixed camera given in course coordinates: s along the loop (from the post), off outward
        const v = s.view; updateCamera = function () { const T = race.trk, a = T.point(v.s, v.off, {}), b = T.point(v.ls != null ? v.ls : v.s, v.loff != null ? v.loff : 0, {});
          camera.fov = v.fov || 50; camera.updateProjectionMatrix(); camera.position.set(a.x, v.h, a.z); camera.lookAt(b.x, v.lh || 0, b.z);
          sun.position.set(b.x + 120, 220, b.z + 80); sun.target.position.set(b.x, 0, b.z); sun.target.updateMatrixWorld(); };
      }
      if (s.hideHud) { const st = document.createElement('style'); st.textContent = '#hud, #toasts, #raceMsg, .toasts, .race-msg, #commCap, .comm-cap { display: none !important }'; document.head.appendChild(st); }
      if (s.eval) (0, eval)(s.eval);
    }, s);
    await sleep(s.settle || 2500);
    const info = await p.evaluate(() => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }));
    await p.screenshot({ path: path.join(out, s.name + '.png'), timeout: 120000 });
    console.log(s.name, JSON.stringify(info), (Date.now() - t0) + 'ms', errs.length ? 'ERR ' + errs.join(' | ') : '');
    await ctx.close();
  }
  await b.close();
})();
