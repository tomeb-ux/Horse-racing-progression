'use strict';
/* =====================================================================
   FINAL FURLONG — THE FARM: land, sky, plants and the assembly (Phase 4)
   • Rolling terrain (a fine mesh round the property, a coarse one out to the hills) drawn with the racecourse turf shader
     plus a painted "splat" map: gravel paths, the courtyard, worn dirt, the sand of the oval all come from one texture read by
     the ground shader, with broken noisy edges — no extra geometry, no z-fighting, paths follow the land.
   • A gradient sky dome matched to the haze, warm low sun, light fog.
   • Australian vegetation: eucalypts (the racecourse kit's gum), cypress windbreaks, a Moreton Bay fig, palms; wattle and
     grevillea shrubs; grass tufts; boulders — all instanced, with a distance-based switch to a cheaper twin.
   assemble() builds everything into the scene farm.js hands in and returns the handle farm.js drives each frame.
   ===================================================================== */
const FARMGROUND = (() => {
  const W = FARMWORLD, L = W.L, TAU = W.TAU, G = GFX, lin = G.lin, fbm = G.fbm, hash = G.hash, sstep = W.sstep, clamp = W.clamp, heightAt = W.heightAt;

  // ---------------------------------------------------------------- the splat map: R gravel/courtyard, G worn dirt, B oval sand
  const SPL = { x0: -132, z0: -112, w: 264, h: 224, tw: 792, th: 672 };
  function distSeg(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); }
  function makeSplat() {
    const t = L.track, paths = [   // [width, ...points]
      [5.2, 160, 4, 112, 4, 70, 4, 46, 5.5, 20, 3], [2.4, -17, 0, -34, 0, -39.8, 0], [3.2, -8, 9, -8, 22, -6.5, 25], [3.4, 17, -12, 41, -12], [2.6, 17, -3, 25, -3], [3.0, 50, 5, 51.5, -20],
      [3.2, -17, -16, -17, -33, 0, -33, 0, -39], [3.2, -17, -20, -30, -24, -46, -25], [3.0, 17, 6, 30, 6, 36, 12], [2.2, -14, -17.5, -17, -17.5], [2.6, -3, 25, -3, 20, 0, 9],
    ];
    const rects = [   // gravel areas: x0,z0,x1,z1,radius
      [L.court.x0, L.court.z0, L.court.x1, L.court.z1, 4], [24, -18, 40, -12.2, 1.2], [26, -9, 36, 3.5, 1.4], [28, 6, 47, 21, 2.5], [-12, 22, -3, 27, 1.5],
    ];
    const dirt = [[50, -22, 3.8], [-0.0, -40, 3.8], [-46, -26, 3.8], [48.5, -32, 2.6], [22, -43, 2.6], [-43.5, -50, 2.6], [40, -10, 3], [-19, -17, 2.5], [-8, 13.5, 2.2], [53, -26, 3.2], [3, -43, 3.2], [-43, -29, 3.2]];
    const d = new Uint8Array(SPL.tw * SPL.th * 4), sx = SPL.w / SPL.tw, sz = SPL.h / SPL.th;
    for (let j = 0; j < SPL.th; j++) for (let i = 0; i < SPL.tw; i++) {
      const x = SPL.x0 + (i + 0.5) * sx, z = SPL.z0 + (j + 0.5) * sz; let g = 0, dm = 0, sa = 0;
      for (const p of paths) { const wd = p[0] / 2; for (let k = 1; k + 3 < p.length; k += 2) { const dd = distSeg(x, z, p[k], p[k + 1], p[k + 2], p[k + 3]); if (dd < wd + 1.2) g = Math.max(g, 1 - sstep(wd - 0.6, wd + 0.7, dd)); } }
      for (const r of rects) { const dx = Math.max(r[0] - x, 0, x - r[2]), dz = Math.max(r[1] - z, 0, z - r[3]); if (dx < 3 && dz < 3) { const out = Math.hypot(dx, dz), inside = Math.min(x - r[0], r[2] - x, z - r[1], r[3] - z), sd = out > 0 ? out : -inside; g = Math.max(g, 1 - sstep(-0.35, 0.45, sd)); } }
      for (const c of dirt) { const dd = Math.hypot(x - c[0], z - c[1]); if (dd < c[2] + 1.5) dm = Math.max(dm, 1 - sstep(c[2] * 0.4, c[2] + 0.8, dd)); }
      { const dxs = Math.abs(x - clamp(x, -60, 60)), dd = Math.hypot(dxs, z - t.cz); if (dd > t.r0 - 1 && dd < t.r1 + 1 && z > t.cz - t.r1 - 1 && z < t.cz + t.r1 + 1) sa = sstep(t.r0 - 0.15, t.r0 + 0.45, dd) * (1 - sstep(t.r1 - 0.45, t.r1 + 0.15, dd)); }
      const q = (j * SPL.tw + i) * 4; d[q] = g * 255; d[q + 1] = dm * 255; d[q + 2] = sa * 255; d[q + 3] = 255;
    }
    const tex = new THREE.DataTexture(d, SPL.tw, SPL.th, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
    return tex;
  }
  function groundMaterial(splat) {
    const m = G.turfMaterial("ground", 0xe6ecd2); m.vertexColors = true; const base = m.onBeforeCompile;
    m.onBeforeCompile = sh => {
      base(sh); sh.uniforms.uSplat = { value: splat }; sh.uniforms.uGravel = { value: W.T.gravel.map }; sh.uniforms.uDirt = { value: W.T.dirt.map }; sh.uniforms.uSand = { value: W.T.sand.map }; sh.uniforms.uBox = { value: new THREE.Vector4(SPL.x0, SPL.z0, SPL.w, SPL.h) };
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D uSplat, uGravel, uDirt, uSand; uniform vec4 uBox;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec2 spuv = (vWP.xz - uBox.xy) / uBox.zw;
          vec4 sp = (spuv.x > 0.0 && spuv.x < 1.0 && spuv.y > 0.0 && spuv.y < 1.0) ? texture2D(uSplat, spuv) : vec4(0.0);
          float nz = texture2D(uGravel, vWP.xz / 1.7).g, nz2 = texture2D(uDirt, vWP.xz / 3.1).r;
          float mG = smoothstep(0.42, 0.58, sp.r + (nz - 0.5) * 0.5), mD = smoothstep(0.38, 0.62, sp.g + (nz2 - 0.5) * 0.7) * (1.0 - mG), mS = smoothstep(0.45, 0.55, sp.b + (nz - 0.5) * 0.25) * (1.0 - mG);
          vec3 gr = pow(mix(texture2D(uGravel, vWP.xz / 2.0).rgb, texture2D(uGravel, vWP.xz / 6.7 + 0.37).rgb, 0.45), vec3(2.2));
          vec3 dr = pow(mix(texture2D(uDirt, vWP.xz / 2.4).rgb, texture2D(uDirt, vWP.xz / 8.0).rgb, 0.4), vec3(2.2));
          vec3 sa = pow(texture2D(uSand, vWP.xz / 1.9).rgb, vec3(2.2)) * (0.9 + 0.2 * texture2D(uDirt, vWP.xz / 1.1).r);
          diffuseColor.rgb = mix(diffuseColor.rgb, gr * 0.62, mG); diffuseColor.rgb = mix(diffuseColor.rgb, dr * 0.62, mD); diffuseColor.rgb = mix(diffuseColor.rgb, sa * 0.52, mS);
          float hard = clamp(mG + mD + mS, 0.0, 1.0);`)
        .replace("mapN.xy *= normalScale;", "mapN.xy *= normalScale * (1.0 - 0.75 * hard);");
    };
    m.customProgramCacheKey = () => "fffarmground"; return m;
  }
  function terrain(scene, mat, owned) {
    const mk = (w, d, sw, sd, yoff, dry0, dry1) => {
      const g = new THREE.PlaneGeometry(w, d, sw, sd); g.rotateX(-Math.PI / 2); const P = g.attributes.position, c = new Float32Array(P.count * 3), col = new THREE.Color();
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i), y = heightAt(x, z); P.setY(i, y + yoff);
        const lush = fbm(x / 26 + 11, z / 26 + 11, 1e6, 6, 3) * 0.7 + fbm(x / 7 + 3, z / 7 + 3, 1e6, 13, 2) * 0.3, dry = sstep(dry0, dry1, Math.max(Math.abs(x) * 0.9, Math.abs(z) * 1.15)) * (0.6 + 0.6 * fbm(x / 70, z / 70, 1e6, 8, 2)) + (1 - lush) * 0.28;
        col.setRGB(0.98 + 0.55 * dry + 0.06 * lush, 0.74 + 0.16 * dry - 0.12 * (1 - lush) + 0.05 * lush, 0.50 - 0.12 * dry); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
      g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); g.computeBoundingSphere(); owned.geo.push(g);
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); return m;
    };
    mk(264, 224, 132, 112, 0, 70, 190); mk(760, 680, 100, 90, -0.35, 70, 190);
  }

  // ---------------------------------------------------------------- the sky dome (+ matching fog)
  function sky(scene, owned, sunDir) {
    const g = new THREE.SphereGeometry(900, 32, 16), m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sunDir: { value: sunDir } },
      vertexShader: "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `varying vec3 vD; uniform vec3 sunDir;
        void main() { vec3 d = normalize(vD); float h = clamp(d.y, -0.2, 1.0);
          vec3 hor = vec3(0.74, 0.83, 0.90), mid = vec3(0.50, 0.69, 0.89), top = vec3(0.25, 0.46, 0.79);
          vec3 c = mix(hor, mid, smoothstep(0.05, 0.4, h)); c = mix(c, top, smoothstep(0.3, 0.9, h));
          float s = max(dot(d, normalize(sunDir)), 0.0); c += vec3(1.0, 0.82, 0.55) * (pow(s, 6.0) * 0.28 + pow(s, 80.0) * 0.55);
          c = mix(c, vec3(0.62, 0.66, 0.60), smoothstep(0.0, -0.2, d.y)); gl_FragColor = vec4(c, 1.0); }` });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -10; scene.add(mesh); owned.geo.push(g); owned.mat.push(m);
    scene.fog = new THREE.Fog(new THREE.Color(0.74, 0.83, 0.90).convertSRGBToLinear(), 80, 300);
    return mesh;
  }

  // ---------------------------------------------------------------- instanced plants with a near/far switch
  function scatter(scene, items, geoHi, geoLo, mat, o) {
    const cell = o.cell || 70, cells = new Map(), out = [];
    items.forEach((it, i) => { const k = Math.floor(it.x / cell) + "," + Math.floor(it.z / cell); (cells.get(k) || cells.set(k, []).get(k)).push(i); });
    const dm = new THREE.Object3D(), col = new THREE.Color();
    for (const idx of cells.values()) {
      let cx = 0, cz = 0; for (const i of idx) { cx += items[i].x; cz += items[i].z; } cx /= idx.length; cz /= idx.length;
      const mats = new Float32Array(idx.length * 16), cols = new Float32Array(idx.length * 3), r = W.rng(idx.length * 31 + (cx | 0));
      idx.forEach((i, j) => { const it = items[i]; dm.position.set(it.x, it.y != null ? it.y : heightAt(it.x, it.z) - (o.sink || 0), it.z); dm.rotation.set(0, it.rot != null ? it.rot : r() * TAU, 0); const s = it.s || 1; dm.scale.set(s * (0.9 + r() * 0.2), s * (it.sy || 1), s * (0.9 + r() * 0.2)); dm.updateMatrix(); dm.matrix.toArray(mats, j * 16);
        const v = 0.86 + r() * 0.26; if (it.tint) col.set(it.tint); else col.setRGB(v, v, v * (0.92 + r() * 0.14)); cols[j * 3] = col.r; cols[j * 3 + 1] = col.g; cols[j * 3 + 2] = col.b; });
      let rad = 0; for (const i of idx) rad = Math.max(rad, Math.hypot(items[i].x - cx, items[i].z - cz));
      const mk = (geo, shadow) => { const m = new THREE.InstancedMesh(geo, mat, idx.length); m.instanceMatrix = new THREE.InstancedBufferAttribute(mats, 16); m.instanceColor = new THREE.InstancedBufferAttribute(cols, 3); m.castShadow = shadow; m.receiveShadow = !!o.receive; m.frustumCulled = false; scene.add(m); return m; };
      out.push({ hi: mk(geoHi, o.shadow !== false), lo: geoLo ? mk(geoLo, false) : null, cx, cz, rad: rad + (o.pad || 14), n: idx.length });
    }
    return out;
  }
  function updateScatter(list, cam, nearD, farD) {
    for (const c of list) { const d = Math.hypot(cam.x - c.cx, cam.z - c.cz) - c.rad, vis = d < farD; c.hi.visible = vis && (!c.lo || d < nearD); if (c.lo) c.lo.visible = vis && d >= nearD; }
  }
  // low-poly shrub / boulder / tuft geometry (own; freed in dispose)
  function shrubGeo(top, base, seed, bloom) {
    const g = new THREE.IcosahedronGeometry(0.62, 1), P = g.attributes.position, c = new Float32Array(P.count * 3), a = lin(base), b = lin(top), lt = a.clone().lerp(lin(0xa9b88a), 0.35), col = new THREE.Color();
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = 0.72 + 0.5 * fbm(x * 1.3 + seed, y * 1.3 + z, 1e6, seed | 0, 2); P.setXYZ(i, x * n * 1.25, y * n * 0.82 + 0.45, z * n * 1.25);
      const spot = bloom && y > -0.15 && fbm(x * 5.5 + seed * 3, y * 5.5 + z * 5.5, 1e6, (seed * 5) | 0, 2) > 0.68;
      col.copy(a).lerp(lt, clamp(y + 0.55, 0, 1)); if (spot) col.copy(b); const f = 0.85 + 0.3 * hash(Math.round(x * 9), Math.round(z * 9), seed | 0); c[i * 3] = col.r * f; c[i * 3 + 1] = col.g * f; c[i * 3 + 2] = col.b * f; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); return g;
  }
  function rockGeo() {
    const g = new THREE.IcosahedronGeometry(0.6, 1), P = g.attributes.position, c = new Float32Array(P.count * 3), col = new THREE.Color();
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = 0.7 + 0.6 * fbm(x * 2 + 5, y * 2 + z * 2, 1e6, 3, 2); P.setXYZ(i, x * n * 1.3, y * n * 0.8 + 0.1, z * n); col.setRGB(0.5, 0.46, 0.4).convertSRGBToLinear(); const f = 0.75 + 0.4 * hash(Math.round(x * 7), Math.round(z * 7), 4); c[i * 3] = col.r * f; c[i * 3 + 1] = col.g * f; c[i * 3 + 2] = col.b * f; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); return g;
  }
  function tuftGeo() {
    const q = (rot) => { const g = new THREE.PlaneGeometry(0.9, 0.75); g.translate(0, 0.375, 0); g.rotateY(rot); return g; }, A = q(0), B = q(Math.PI / 2), C = q(Math.PI / 4);
    const geos = [A, B, C], pos = [], uv = [], nor = [], idx = []; let base = 0;
    for (const g of geos) { const P = g.attributes.position, U = g.attributes.uv; for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); uv.push(U.getX(i), U.getY(i)); nor.push(0, 1, 0); } for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); base += P.count; g.dispose(); }
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3)); out.setIndex(idx); return out;
  }
  // exclusion zones for random planting (x0,z0,x1,z1)
  const NOGO = [[-21, -34, 48, 30], [-70, -22, -33, 16], [-95, 18, 95, 85], [20, -40, 50, -12], [26, 4, 56, 26], [20, -4, 112, 12], [-100, -80, 112, -20]];
  const blocked = (x, z, m) => NOGO.some(r => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m);

  const _pm = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sp = new THREE.Sphere();
  function assemble(scene, o) {
    o = o || {}; const owned = { geo: [], mat: [], tex: [] }, t0 = performance.now();
    W.makeTextures(); W.makeMaterials();
    const splat = makeSplat(); owned.tex.push(splat); const gm = groundMaterial(splat); owned.mat.push(gm); terrain(scene, gm, owned);
    const sunDir = new THREE.Vector3(0.55, 0.62, 0.56).normalize(); sky(scene, owned, sunDir);
    const built = FARMBUILD.build(scene, o);
    // ---- plants
    const uT = { value: 0 }, leaf = W.M.leaf; leaf.onBeforeCompile = sh => { sh.uniforms.uTime = uT; sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace("#include <begin_vertex>", `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.07; float sw = max(0.0, transformed.y - 2.5) * 0.010; transformed.x += sin(uTime * 1.2 + ph) * sw; transformed.z += sin(uTime * 0.85 + ph * 1.7) * sw * 0.6;`); }; leaf.customProgramCacheKey = () => "fffarmleaf";
    const rnd = W.rng(4242), trees = { gum: [], cypress: [], fig: [], palm: [] }, T = (sp, x, z, s) => trees[sp].push({ x, z, s: s || 1 });
    T("fig", -12, 3, 1.15); T("palm", -62, 9, 0.9); T("palm", -38.5, -12.5, 0.8); T("palm", -63, -12, 0.85);
    for (let x = 100; x >= 56; x -= 9.5) { T("gum", x + rnd() * 3, -2.6 - rnd() * 1.2, 1.0 + rnd() * 0.3); T("gum", x + 4 + rnd() * 3, 10.8 + rnd() * 1.2, 1.0 + rnd() * 0.3); }
    for (const [x, z] of [[62, -40], [80, -54], [88, -30], [-18, -52], [16, -62], [-8, -44.5], [-70, -44], [-58, -34], [-86, -58], [38, -50]]) T("gum", x, z, 0.95 + rnd() * 0.3);
    for (const [x, z] of [[-34, 50], [-8, 47], [22, 53], [44, 49], [-52, 54]]) T("gum", x, z, 0.85 + rnd() * 0.3);
    for (const [x, z] of [[50, -48], [92, -40], [70, -58], [-4, -56], [24, -48], [-36, -60], [-64, -54], [-90, -34], [-52, -36], [64, -28]]) T("gum", x, z, 0.85 + rnd() * 0.35);
    for (let i = 0; i < 12; i++) T("cypress", -68 - rnd() * 1.2, -12 + i * 2.4, 0.9 + rnd() * 0.3);
    for (let i = 0; i < 9; i++) T("cypress", 22 + i * 2.2, -37.5 - rnd() * 1.0, 0.95 + rnd() * 0.3);
    for (let x = -108; x <= 108; x += 11) { if (Math.abs(x) < 8) continue; T("gum", x + rnd() * 5, -88 - rnd() * 8, 1.1 + rnd() * 0.5); T("gum", x + rnd() * 5, 88 + rnd() * 8, 1.1 + rnd() * 0.5); }
    for (let z = -80; z <= 80; z += 11) { T("gum", -118 - rnd() * 8, z + rnd() * 5, 1.1 + rnd() * 0.5); if (Math.abs(z - 4) > 8) T("gum", 118 + rnd() * 8, z + rnd() * 5, 1.1 + rnd() * 0.5); }
    for (let i = 0, n = 0; i < 700 && n < 120; i++) { const x = (rnd() - 0.5) * 520, z = (rnd() - 0.5) * 460; if (Math.abs(x) < 122 && Math.abs(z) < 92 && (rnd() < 0.82 || blocked(x, z, 6))) continue; if (Math.abs(x) >= 122 || Math.abs(z) >= 92 || !blocked(x, z, 6)) { T(rnd() < 0.9 ? "gum" : "cypress", x, z, 1.1 + rnd() * 0.9); n++; } }
    const veg = [], addSway = m => { const prev = m.onBeforeCompile; m.onBeforeCompile = sh => { sh.uniforms.uTime = uT; sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace("#include <begin_vertex>", `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.07; float sw = max(0.0, transformed.y - 2.5) * 0.008; transformed.x += sin(uTime * 1.2 + ph) * sw; transformed.z += sin(uTime * 0.85 + ph * 1.7) * sw * 0.6;`); }; m.customProgramCacheKey = () => "fffarmsway"; };
    const woodM = FARMTREES.woodMaterial(); addSway(woodM); const leafM = { gum: FARMTREES.leafMaterial("gum"), fig: FARMTREES.leafMaterial("fig") }; leafM.cypress = leafM.fig; addSway(leafM.gum); addSway(leafM.fig);
    const tag = c => Object.assign(c, { far: 430, near: 62 });
    for (const [sp, nv] of [["gum", 2], ["fig", 1], ["cypress", 1]]) for (let v = 0; v < nv; v++) {
      const list = trees[sp].filter((t, i) => (nv === 1 || (Math.round(t.x * 7 + t.z * 3) & 1) === v)); if (!list.length) continue;
      const hi = FARMTREES.get(sp, v, 0), lo = FARMTREES.get(sp, v, 1), o2 = { cell: 80, pad: 12, sink: 0.1 };
      veg.push(...scatter(scene, list, hi.wood, lo.wood, woodM, o2).map(tag)); veg.push(...scatter(scene, list, hi.leaf, lo.leaf, leafM[sp], o2).map(tag));
    }
    for (const sp of ["palm"]) if (trees[sp].length) veg.push(...scatter(scene, trees[sp], G.treeGeo(sp), G.treeGeo(sp, true), leaf, { cell: 80, pad: 12, sink: 0.1 }).map(tag));
    // shrubs: garden beds, courtyard bed, fence lines, the infield — wattle (yellow), grevillea (red), saltbush (grey-green), plain bush
    const sg = { wattle: shrubGeo(0xe2c23a, 0x58703a, 1, true), grev: shrubGeo(0x9c2f26, 0x4a6540, 2, true), salt: shrubGeo(0x93a38a, 0x66765d, 3, false), bush: shrubGeo(0x6b8a48, 0x3e5a30, 4, false) }, shr = { wattle: [], grev: [], salt: [], bush: [] }, S = (k, x, z, s) => shr[k].push({ x, z, s: s || 1 });
    for (let i = 0; i < 18; i++) { const a = rnd() * TAU, r = 4.4 + rnd() * 1.8; S(i % 3 ? "grev" : "wattle", -12 + Math.cos(a) * r, 3 + Math.sin(a) * r, 0.55 + rnd() * 0.4); }
    for (let i = 0; i < 40; i++) { const x = -64 + rnd() * 26, z = -13 + rnd() * 22; if (Math.abs(z) < 2.2 && x > -44 || x > -46 && x < -41 || (x > -58.5 && x < -44.5 && z > -8.5 && z < 4.5)) continue; S(["wattle", "grev", "bush", "bush"][i % 4], x, z, 0.6 + rnd() * 0.7); }
    for (let i = 0; i < 70; i++) { const x = (rnd() - 0.5) * 220, z = (rnd() - 0.5) * 160; if (blocked(x, z, 1) && rnd() < 0.9) continue; S(["salt", "bush", "wattle"][i % 3], x, z, 0.6 + rnd() * 0.8); }
    for (let i = 0; i < 28; i++) { const t = rnd(), x = -52 + 104 * t, z = 50 + (rnd() - 0.5) * 26; if (Math.abs(z - 50) > 10 && Math.abs(z - 50) < 18.8) continue; if (rnd() < 0.5) S("salt", x, 50 + (rnd() - 0.5) * 8, 0.5 + rnd() * 0.4); }
    for (const k of Object.keys(shr)) if (shr[k].length) veg.push(...scatter(scene, shr[k], sg[k], null, leaf, { cell: 60, pad: 3, sink: 0.05 }).map(c => Object.assign(c, { far: 150, near: 1e9 })));
    owned.geo.push(...Object.values(sg));
    // boulders and a few fallen logs
    const rg = rockGeo(), rocks = []; for (let i = 0; i < 46; i++) { const x = (rnd() - 0.5) * 230, z = (rnd() - 0.5) * 170; if (blocked(x, z, 1)) continue; rocks.push({ x, z, s: 0.5 + rnd() * 1.1, sy: 0.8 + rnd() * 0.5 }); }
    owned.geo.push(rg); veg.push(...scatter(scene, rocks, rg, null, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { cell: 90, pad: 2, sink: 0.15, receive: true }).map(c => { owned.mat.push(c.hi.material); return Object.assign(c, { far: 180, near: 1e9 }); }));
    // grass tufts: along fences and paddock edges, round buildings, scattered over the lawns
    const tg = tuftGeo(); owned.geo.push(tg); const tm = W.M.tuft; tm.vertexColors = true; tm.needsUpdate = true; const tufts = [];
    const along = (xa, za, xb, zb, n, off) => { const len = Math.hypot(xb - xa, zb - za), ux = (xb - xa) / len, uz = (zb - za) / len; for (let i = 0; i < n; i++) { const t = rnd() * len, side = (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * off); tufts.push({ x: xa + ux * t - uz * side, z: za + uz * t + ux * side, s: 0.8 + rnd() * 1.1 }); } };
    for (const p of L.paddocks) { along(p.x0, p.z0, p.x1, p.z0, 90, 1.1); along(p.x1, p.z0, p.x1, p.z1, 70, 1.1); along(p.x1, p.z1, p.x0, p.z1, 90, 1.1); along(p.x0, p.z1, p.x0, p.z0, 70, 1.1); for (let i = 0; i < 160; i++) tufts.push({ x: p.x0 + 1 + rnd() * (p.x1 - p.x0 - 2), z: p.z0 + 1 + rnd() * (p.z1 - p.z0 - 2), s: 0.7 + rnd() * 1.0 }); }
    along(-65, -14, -37, -14, 30, 1.2); along(-65, 10, -37, 10, 30, 1.2); along(-65, -14, -65, 10, 24, 1.2); along(-14.6, -27.6, 14.6, -27.6, 50, 1.2); along(-14.6, -27.6, -14.6, -22, 12, 1.0); along(14.6, -27.6, 14.6, -22, 12, 1.0);
    along(24, -32.5, 38, -32.5, 26, 1.2); along(112, -82, 112, 82, 70, 1.4); along(-112, -82, -112, 82, 70, 1.4); along(-112, 82, 112, 82, 80, 1.4); along(-112, -82, 112, -82, 80, 1.4);
    for (let i = 0; i < 330; i++) { const x = (rnd() - 0.5) * 224, z = (rnd() - 0.5) * 164; if (blocked(x, z, -1) && rnd() < 0.85) continue; tufts.push({ x, z, s: 0.7 + rnd() * 1.2 }); }
    for (const t of tufts) { const ln = 0.4 + 0.6 * hash(Math.round(t.x * 3), Math.round(t.z * 3), 21); t.tint = new THREE.Color().setRGB(0.52 + 0.4 * ln, 0.56 + 0.3 * ln, 0.34 + 0.16 * ln).convertSRGBToLinear(); t.s *= 0.72; }
    veg.push(...scatter(scene, tufts, tg, null, tm, { cell: 45, pad: 4, sink: 0.04, shadow: false, receive: false }).map(c => Object.assign(c, { far: 75, near: 1e9, shadowOk: false })));
    return {
      structures: built, heightAt, colliders: built.colliders, segs: built.segs, points: built.points, stalls: built.stalls, sunDir, ms: performance.now() - t0,
      // per frame: sway clock, then for every plant cell: distance (detail level + far cull), a frustum test (instanced meshes carry no bounds of their own) and, for trees, shadows only when near
      update(dt, camera) {
        uT.value += dt; const cam = camera.position; camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
        for (const c of veg) {
          const d = Math.hypot(cam.x - c.cx, cam.z - c.cz) - c.rad; _sp.center.set(c.cx, 5, c.cz); _sp.radius = c.rad + 10;
          const vis = d < (c.far || 300) && _fr.intersectsSphere(_sp), near = c.near || 60;
          c.hi.visible = vis && (!c.lo || d < near); if (c.lo) c.lo.visible = vis && d >= near; c.hi.castShadow = c.shadowOk !== false && d < 75;
        }
      },
      stats() { let tris = 0, vis = 0; for (const c of veg) { if (c.hi.visible) vis++; } return { vegCells: veg.length, vegVisible: vis, instances: veg.reduce((s, c) => s + c.n, 0), buildMeshes: built.meshes.length, buildMs: this.ms }; },
      dispose() {
        scene.traverse(ob => { if (ob.isMesh || ob.isLine || ob.isInstancedMesh) { if (ob.geometry && !ob.geometry.userData.sharedWithGfx) { /* geometry ownership below */ } } });
        for (const m of built.meshes) { m.geometry.dispose(); }
        for (const g of built.owned.geo) g.dispose(); for (const t of built.owned.tex) t.dispose(); for (const m of built.owned.mat) m.dispose();
        for (const g of owned.geo) g.dispose(); for (const t of owned.tex) t.dispose(); for (const m of owned.mat) m.dispose();
        for (const c of veg) { c.hi.dispose(); if (c.lo) c.lo.dispose(); }
        FARMTREES.dispose(); W.disposeKit();
      },
    };
  }
  return { assemble, heightAt, SPL };
})();
