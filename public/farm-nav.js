'use strict';
/* =====================================================================
   FINAL FURLONG — GUIDANCE (Phase 6): walkable routes and the glowing ground line
   FARMNAV.find(a, b) searches a 1 m grid built from the farm's real colliders (buildings, props, every fence rail and gate) inflated by the
   walker's radius, so a route can never pass through a building or a fence; the path is then straightened (string-pulled) wherever the way is clear.
   FARMNAV.guide(...) draws it as ONE ribbon mesh of soft dashes lying on the ground (plus a pulsing ring and a faint light column at the end — 2 more
   draw calls) which fades with distance. Settings → "guidance lines": Full route · Subtle (only the nearest ~25 m, no column) · Off.
   ===================================================================== */
const FARMNAV = (() => {
  const CELL = 1, X0 = -113, Z0 = -85, NX = 227, NZ = 171, PR = 0.45;
  let hard = null, soft = null, builtFor = null;
  const idx = (ix, iz) => iz * NX + ix, cx = ix => X0 + (ix + 0.5) * CELL, cz = iz => Z0 + (iz + 0.5) * CELL;
  const toI = x => Math.floor((x - X0) / CELL), toJ = z => Math.floor((z - Z0) / CELL);

  // mark every cell whose centre is within `r` of an obstacle
  function rasterize(world, r, out) {
    const mark = (x0, z0, x1, z1, rad, seg) => {
      const ix0 = Math.max(0, toI(Math.min(x0, x1) - rad)), ix1 = Math.min(NX - 1, toI(Math.max(x0, x1) + rad)), iz0 = Math.max(0, toJ(Math.min(z0, z1) - rad)), iz1 = Math.min(NZ - 1, toJ(Math.max(z0, z1) + rad));
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const x = cx(ix), z = cz(iz); let d;
        if (seg) { const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1e-6, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2)); d = Math.hypot(x - x0 - dx * t, z - z0 - dz * t); }
        else d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
        if (d <= rad) out[idx(ix, iz)] = 1;
      }
    };
    for (const c of world.colliders) mark(c.x0, c.z0, c.x1, c.z1, r, false);
    for (const s of world.segs) mark(s.x0, s.z0, s.x1, s.z1, s.r + r, true);
    for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) { const x = cx(ix), z = cz(iz); if (Math.abs(x) > 109.5 - r + PR || Math.abs(z) > 79.5 - r + PR) out[idx(ix, iz)] = 1; }
  }
  function prepare(world) {
    if (builtFor === world && hard) return;
    hard = new Uint8Array(NX * NZ); soft = new Uint8Array(NX * NZ);
    rasterize(world, PR + 0.12, hard); rasterize(world, PR + 1.0, soft); builtFor = world;
  }
  const blockedAt = (x, z) => { const ix = toI(x), iz = toJ(z); return ix < 0 || iz < 0 || ix >= NX || iz >= NZ || hard[idx(ix, iz)] === 1; };
  function lineClear(ax, az, bx, bz) { const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.35)); for (let i = 0; i <= n; i++) { const t = i / n; if (blockedAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false; } return true; }
  function nearestFree(x, z) {
    if (!blockedAt(x, z)) return [x, z];
    for (let r = 1; r <= 8; r++) { let best = null, bd = 1e9; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const px = x + dx, pz = z + dz; if (!blockedAt(px, pz)) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [px, pz]; } } } if (best) return best; }
    return null;
  }
  // binary min-heap on f
  class Heap { constructor() { this.a = []; } push(f, i) { const a = this.a; a.push([f, i]); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } } return top; } get size() { return this.a.length; } }

  // the route from a to b ([x, z] each) or null; points are in metres, straightened, always starting at a and ending at b
  function find(world, a, b) {
    prepare(world);
    const s = nearestFree(a[0], a[1]), e = nearestFree(b[0], b[1]); if (!s || !e) return null;
    const si = idx(toI(s[0]), toJ(s[1])), ei = idx(toI(e[0]), toJ(e[1])), g = new Float32Array(NX * NZ).fill(1e9), par = new Int32Array(NX * NZ).fill(-1), closed = new Uint8Array(NX * NZ), H = new Heap();
    const ex = toI(e[0]), ez = toJ(e[1]), h = (ix, iz) => { const dx = Math.abs(ix - ex), dz = Math.abs(iz - ez); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    g[si] = 0; H.push(h(toI(s[0]), toJ(s[1])), si); let found = false, it = 0;
    while (H.size && it++ < 60000) {
      const [, cur] = H.pop(); if (closed[cur]) continue; closed[cur] = 1; if (cur === ei) { found = true; break; }
      const ix = cur % NX, iz = (cur / NX) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = ix + dx, nz = iz + dz; if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue; const ni = idx(nx, nz); if (closed[ni] || hard[ni]) continue;
        if (dx && dz && (hard[idx(ix + dx, iz)] || hard[idx(ix, iz + dz)])) continue;                 // no cutting a corner
        const ng = g[cur] + (dx && dz ? 1.4142 : 1) + (soft[ni] ? 0.9 : 0); if (ng < g[ni]) { g[ni] = ng; par[ni] = cur; H.push(ng + h(nx, nz), ni); }
      }
    }
    if (!found) return null;
    const raw = []; for (let c = ei; c !== -1; c = par[c]) raw.push([cx(c % NX), cz((c / NX) | 0)]); raw.reverse(); raw[0] = [s[0], s[1]]; raw[raw.length - 1] = [e[0], e[1]];
    // string-pull: from each anchor jump to the furthest point still in clear sight
    const pts = [raw[0]]; let i = 0;
    while (i < raw.length - 1) { let j = raw.length - 1; while (j > i + 1 && !lineClear(raw[i][0], raw[i][1], raw[j][0], raw[j][1])) j--; pts.push(raw[j]); i = j; }
    if (a[0] !== s[0] || a[1] !== s[1]) pts.unshift([a[0], a[1]]);
    if (b[0] !== e[0] || b[1] !== e[1]) pts.push([b[0], b[1]]);
    let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    return { pts, len };
  }
  const reachable = (world, a, b) => !!find(world, a, b);

  // ---------------------------------------------------------------- the ground line
  function guide(scene, heightAt) {
    const MAXS = 700, geo = new THREE.BufferGeometry(), P = new Float32Array(MAXS * 2 * 3), U = new Float32Array(MAXS * 2 * 2), A = new Float32Array(MAXS * 2), IDX = new Uint16Array((MAXS - 1) * 6);
    for (let i = 0; i < MAXS - 1; i++) { const a = i * 2; IDX.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
    geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(U, 2)); geo.setAttribute("a", new THREE.BufferAttribute(A, 1)); geo.setIndex(new THREE.BufferAttribute(IDX, 1)); geo.setDrawRange(0, 0);
    const vs = "attribute float a; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
    const fs = "uniform float time; uniform vec3 col; uniform float op; varying vec2 vUv; varying float vA; void main(){ float d = fract(vUv.x / 1.5 - time * 0.55); float dash = smoothstep(0.0, 0.14, d) * (1.0 - smoothstep(0.5, 0.66, d)); float edge = 1.0 - smoothstep(0.35, 1.0, abs(vUv.y * 2.0 - 1.0)); gl_FragColor = vec4(col, vA * (0.18 + 0.82 * dash) * edge * op); }";
    const mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, col: { value: new THREE.Color(1.0, 0.84, 0.4) }, op: { value: 0.8 } }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const ribbon = new THREE.Mesh(geo, mat); ribbon.frustumCulled = false; ribbon.renderOrder = 6; ribbon.visible = false; scene.add(ribbon);
    // the destination: a pulsing ring on the ground and a faint column of light
    const rg = new THREE.RingGeometry(0.7, 1.05, 40); rg.rotateX(-Math.PI / 2);
    const rmat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, col: { value: new THREE.Color(1.0, 0.84, 0.4) }, op: { value: 0.8 } }, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: "uniform float time; uniform vec3 col; uniform float op; varying vec2 vUv; void main(){ gl_FragColor = vec4(col, op * (0.55 + 0.45 * sin(time * 3.0))); }", transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(rg, rmat); ring.frustumCulled = false; ring.renderOrder = 6; ring.visible = false; scene.add(ring);
    const cg = new THREE.CylinderGeometry(0.28, 0.28, 11, 14, 1, true); cg.translate(0, 5.5, 0);
    const cmat = new THREE.ShaderMaterial({ uniforms: { col: { value: new THREE.Color(1.0, 0.84, 0.4) }, op: { value: 0.8 } }, vertexShader: "varying float vH; void main(){ vH = position.y / 11.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: "uniform vec3 col; uniform float op; varying float vH; void main(){ gl_FragColor = vec4(col, op * 0.5 * (1.0 - vH) * (1.0 - vH)); }", transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const column = new THREE.Mesh(cg, cmat); column.frustumCulled = false; column.renderOrder = 7; column.visible = false; scene.add(column);
    const S = { path: null, samples: [], n: 0, mode: "full", width: 0.34, target: null, t: 0, lift: 0.07, colorKey: "" };
    function setPath(path, o) {
      o = o || {}; S.path = path; S.width = o.width || 0.34; S.lift = o.lift || 0.07;
      if (!path || path.pts.length < 2) { S.n = 0; S.samples = []; geo.setDrawRange(0, 0); ribbon.visible = false; ring.visible = false; column.visible = false; return; }
      const pts = path.pts, step = Math.max(0.5, path.len / (MAXS - 3)), out = []; let acc = 0, carry = 0;
      for (let k = 1; k < pts.length; k++) {
        const ax = pts[k - 1][0], az = pts[k - 1][1], bx = pts[k][0], bz = pts[k][1], d = Math.hypot(bx - ax, bz - az); if (d < 1e-6) continue; const dx = (bx - ax) / d, dz = (bz - az) / d;
        for (let t = carry; t <= d; t += step) { out.push({ x: ax + dx * t, z: az + dz * t, dx, dz, u: acc + t }); carry = t + step - d; }
        acc += d; if (carry < 0) carry = 0;
      }
      const last = pts[pts.length - 1]; if (!out.length || Math.hypot(out[out.length - 1].x - last[0], out[out.length - 1].z - last[1]) > 0.1) { const l = out[out.length - 1] || { dx: 1, dz: 0 }; out.push({ x: last[0], z: last[1], dx: l.dx, dz: l.dz, u: acc }); }
      // smooth the direction at corners so the ribbon bends instead of kinking
      for (let i = 0; i < out.length; i++) { let sx = 0, sz = 0; for (let j = Math.max(0, i - 2); j <= Math.min(out.length - 1, i + 2); j++) { sx += out[j].dx; sz += out[j].dz; } const l = Math.hypot(sx, sz) || 1; out[i].nx = -sz / l; out[i].nz = sx / l; }
      S.samples = out.slice(0, MAXS); S.n = S.samples.length; const hw = S.width / 2;
      for (let i = 0; i < S.n; i++) { const q = S.samples[i];
        for (let sd = 0; sd < 2; sd++) { const o2 = (i * 2 + sd), sgn = sd ? 1 : -1, x = q.x + q.nx * hw * sgn, z = q.z + q.nz * hw * sgn; P[o2 * 3] = x; P[o2 * 3 + 1] = heightAt(x, z) + S.lift; P[o2 * 3 + 2] = z; U[o2 * 2] = q.u; U[o2 * 2 + 1] = sd; } }
      geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true; geo.setDrawRange(0, Math.max(0, (S.n - 1) * 6));
      S.target = last; ring.position.set(last[0], heightAt(last[0], last[1]) + 0.1, last[1]); column.position.set(last[0], heightAt(last[0], last[1]), last[1]);
    }
    // per frame: fade by distance to the walker (and the end), animate the flow
    function update(dt, px, pz, mode, op) {
      S.t += dt; mat.uniforms.time.value = S.t; rmat.uniforms.time.value = S.t; S.mode = mode;
      const on = S.n > 1 && mode !== "off"; ribbon.visible = on; ring.visible = on && S.target; column.visible = on && mode === "full" && S.target;
      if (!on) return;
      mat.uniforms.op.value = rmat.uniforms.op.value = cmat.uniforms.op.value = (op == null ? 0.8 : op) * (mode === "subtle" ? 0.7 : 1);
      // distance of every sample from the walker (along the straight line — cheap) drives its alpha
      const reach = mode === "subtle" ? 25 : 90; let first = 0, bd = 1e9;
      for (let i = 0; i < S.n; i += 1) { const q = S.samples[i], d = Math.hypot(q.x - px, q.z - pz); if (d < bd) { bd = d; first = i; } }
      for (let i = 0; i < S.n; i++) { const q = S.samples[i], dEnd = Math.hypot(q.x - px, q.z - pz), behind = i < first ? Math.max(0, 1 - (first - i) * 0.35) : 1, a = Math.max(0, 1 - Math.max(0, dEnd - 4) / reach) * behind * Math.min(1, dEnd / 2.2 + 0.1); A[i * 2] = A[i * 2 + 1] = a; }
      geo.attributes.a.needsUpdate = true;
      if (S.target) { const d = Math.hypot(S.target[0] - px, S.target[1] - pz), sc = 1 + 0.06 * Math.sin(S.t * 3); ring.scale.set(sc, 1, sc); ring.visible = on && (mode === "full" || d < 30); }
    }
    function dispose() { scene.remove(ribbon, ring, column); geo.dispose(); mat.dispose(); rg.dispose(); rmat.dispose(); cg.dispose(); cmat.dispose(); }
    return { setPath, update, dispose, get path() { return S.path; }, get on() { return ribbon.visible; }, get n() { return S.n; }, meshes: [ribbon, ring, column] };
  }
  return { find, reachable, prepare, blockedAt, lineClear, guide, reset() { hard = soft = builtFor = null; }, get ready() { return !!hard; } };
})();
