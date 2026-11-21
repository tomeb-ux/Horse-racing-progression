// Dev tool: where do the triangles and draw calls go? For a race scene, every mesh in the camera frustum (and every
// shadow caster in the sun's shadow frustum) is attributed to a category. Usage: node tools/breakdown.js track dist at cam [career]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
const [track = 'randwick', dist = 1200, at = 700, cam = 2, major = '1'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(path.join(__dirname, '../public/vendor/three.min.js')), contentType: 'text/javascript' }));
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_comm', '"off"'); localStorage.setItem('ff_quality', '"high"'); window.__noPresent = true; });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(BASE); await p.waitForFunction(() => typeof startRace === 'function');
  const out = await p.evaluate(([track, dist, at, cam, major]) => {
    window.requestAnimationFrame = () => 0;
    settings.cam = +cam;
    const cfg = Object.assign(quickCfg(), { distance: +dist, field: track === 'flemington' && +dist === 3200 ? 24 : 12, track, incidents: 'off', allBots: true, seed: 11 });
    if (major === '1') cfg.career = { name: 'Feature', major: true, crown: true };
    startRace(cfg); race.state = 'count'; race.openGates();
    const lead = () => Math.max(...race.horses.map(h => h.progress)); let n = 0;
    while (race.dist - lead() > +at && n++ < 400000) race.step(SIM_DT);
    let now = performance.now(); for (let i = 0; i < 30; i++) frame(now += 16.667);
    const cat = o => {
      for (let q = o; q; q = q.parent) {
        if (q === gateGroup) return 'gates';
        if (horseMeshes.includes(q)) { if (o.isSkinnedMesh) { const nm = (o.name || '') + (o.material && o.material.customProgramCacheKey ? o.material.customProgramCacheKey() : ''); return /silk|jk|jock/i.test(nm) ? 'jockey' : 'horse'; } return 'horse-extra'; }
        if (q.name && /^venue/.test(q.name)) break;
      }
      const k = o.material && o.material.customProgramCacheKey ? o.material.customProgramCacheKey() : '';
      if (k === 'ffcrowd') return 'crowd';
      if (k === 'fftree') return 'trees';
      if (k === 'ffshrub') return 'shrubs/roses';
      if (o.isInstancedMesh) return o.name ? o.name.replace(/-lod\d/, '') : 'instanced-other';
      for (let q = o; q; q = q.parent) if (q.name && q.name !== '' && q.parent && /^venue/.test(q.parent.name || '')) return 'bld:' + q.name;
      if (o.material && o.material.map && /turf|lawn/i.test(o.material.name || '')) return 'turf';
      return 'static-other';
    };
    const tri = o => { const g = o.geometry; if (!g) return 0; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; return n * (o.isInstancedMesh ? o.count : 1); };
    const F = new THREE.Frustum(), M4 = new THREE.Matrix4(); camera.updateMatrixWorld(); M4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); F.setFromProjectionMatrix(M4);
    const SF = new THREE.Frustum(); const sc = sun.shadow.camera; sc.updateMatrixWorld(); M4.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse); SF.setFromProjectionMatrix(M4);
    const R = {}; const add = (c, k, v) => { R[c] = R[c] || { calls: 0, tris: 0, shCalls: 0, shTris: 0, objs: 0 }; R[c][k] += v; };
    scene.updateMatrixWorld(true);
    scene.traverseVisible(o => {
      if (!o.isMesh || !o.material) return;
      const c = cat(o), t = tri(o);
      const bs = o.geometry.boundingSphere || (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere);
      const inCam = !o.frustumCulled || F.intersectsSphere(bs.clone().applyMatrix4(o.matrixWorld));
      const inSh = renderer.shadowMap.enabled && o.castShadow && (!o.frustumCulled || SF.intersectsSphere(bs.clone().applyMatrix4(o.matrixWorld)));
      add(c, 'objs', 1);
      if (inCam) { add(c, 'calls', 1); add(c, 'tris', t); }
      if (inSh) { add(c, 'shCalls', 1); add(c, 'shTris', t); }
    });
    const info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    return { R, info };
  }, [track, dist, at, cam, major]);
  const rows = Object.entries(out.R).sort((a, b) => (b[1].tris + b[1].shTris) - (a[1].tris + a[1].shTris));
  console.log(`renderer.info: ${out.info.calls} calls, ${(out.info.tris / 1e6).toFixed(2)}M tris`);
  console.log('category'.padEnd(26), 'objs'.padStart(5), 'calls'.padStart(6), 'tris'.padStart(10), 'shCalls'.padStart(8), 'shTris'.padStart(10));
  for (const [k, v] of rows) console.log(k.padEnd(26), String(v.objs).padStart(5), String(v.calls).padStart(6), String(Math.round(v.tris)).padStart(10), String(v.shCalls).padStart(8), String(Math.round(v.shTris)).padStart(10));
  await b.close();
})();
