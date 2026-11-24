'use strict';
/* =====================================================================
   FINAL FURLONG — THE FARM WORLD (Phase 4): an Australian thoroughbred training property
   THE KIT: the layout constants, terrain height, procedurally generated textures + materials, and the geometry batcher the
   builders in farm-build.js use. Builds nothing by itself. Layout (metres; x east, z south; the courtyard is the origin; the walkable land is 220 × 160 m):
     • central courtyard (crushed granite, concrete apron, fig tree, trough, hitching rail) with the sign arch to the south
     • north: the stable block — five loose boxes under a long verandah, wash bay and tack room at the ends, corrugated roof
     • west: the farmhouse (weatherboard, hipped iron roof, verandah, chimney, tank, picket-fenced garden)
     • east: feed & equipment shed (hay, silo, tank), vet bay, horse float + ute on a hardstand, the drive to the road gate
     • south: a ~380 m sand exercise oval (post-and-rail, furlong poles, starting-gate practice, timing hut)
     • three fenced paddocks (troughs, gates, shade trees, a shelter), post-and-wire boundary, eucalypt windbreaks, rolling land
   How it is made cheap: every box/roof/rail of a material is merged into a few large meshes per ~48 m cell (so only nearby
   cells are drawn or cast shadows); paths, gravel, dirt and sand are painted into one splat map read by the ground shader (no
   extra geometry); trees, tufts, bales and shrubs are instanced with a distance-based detail switch; detail is spent where the
   player looks (the stalls, the verandah, the house front) and kept coarse further out.
   ===================================================================== */
const FARMWORLD = (() => {
  const G = GFX, lin = G.lin, fbm = G.fbm, hash = G.hash, dataTex = G.dataTex;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;
  const rng = seed => { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  // ---------------------------------------------------------------- the layout (single source of truth)
  const L = {
    walk: { x: 110, z: 80 }, fence: { x: 112, z: 82 },
    court: { x0: -17, x1: 17, z0: -19, z1: 9 },
    stable: { x0: -14.6, x1: 14.6, zBack: -26.8, zFront: -22.2, eave: 3.05, ridge: 4.9, stallX: [-8, -4, 0, 4, 8], stallW: 4 },
    house: { x0: -58, x1: -45, z0: -8, z1: 4, floor: 0.55, wall: 2.9 },
    feed: { x0: 24, x1: 38, z0: -32, z1: -18 }, vet: { x0: 25, x1: 34, z0: -8, z1: 1.5 }, float: { x: 38, z: 14 },
    track: { cx: 60, cz: 50, r0: 18, r1: 27 },                       // stadium: straights x ∈ [-60, 60]; inner rail radius r0, outer r1
    paddocks: [{ x0: 44, x1: 96, z0: -64, z1: -22, name: "East paddock" }, { x0: -30, x1: 30, z0: -72, z1: -40, name: "North paddock" }, { x0: -96, x1: -40, z0: -64, z1: -26, name: "West paddock" }],
    gate: { x: 112, z: 4 },
  };
  // ---------------------------------------------------------------- terrain height (flat where things are built, rolling elsewhere)
  const FLAT = [[-30, 46, -36, 18, 8], [-68, -33, -20, 14, 6], [-92, 92, 20, 84, 8], [24, 50, 4, 26, 6], [20, 112, -2, 10, 6], [-8, 4, -68, -58, 3]];   // x0, x1, z0, z1, falloff
  function heightAt(x, z) {
    let flat = 0; for (const f of FLAT) { const dx = Math.max(f[0] - x, 0, x - f[1]), dz = Math.max(f[2] - z, 0, z - f[3]); flat = Math.max(flat, 1 - sstep(0, f[4], Math.hypot(dx, dz))); }
    const roll = (fbm(x / 60 + 300, z / 60 + 300, 1e6, 3, 3) - 0.5) * 3.6 + (fbm(x / 17 + 90, z / 17 + 90, 1e6, 9, 2) - 0.5) * 0.45;
    const out = Math.max(Math.abs(x) - 120, Math.abs(z) - 92, 0), hills = 24 * (1 - Math.exp(-out / 120)) * (0.5 + fbm(x / 90 + 40, z / 90 + 40, 1e6, 5, 3));
    return roll * (1 - flat) + hills;
  }

  // ---------------------------------------------------------------- textures (generated once; every one is freed by dispose())
  const T = {};
  function normalTex(H, w, h, k) {
    return dataTex(w, h, d => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = H[y * w + (x + w - 1) % w], r = H[y * w + (x + 1) % w], u = H[((y + h - 1) % h) * w + x], dn = H[((y + 1) % h) * w + x];
      let nx = (l - r) * k, ny = (u - dn) * k, nz = 1; const n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n; const i = (y * w + x) * 4;
      d[i] = (nx * .5 + .5) * 255; d[i + 1] = (ny * .5 + .5) * 255; d[i + 2] = (nz * .5 + .5) * 255; d[i + 3] = 255; } });
  }
  // a texture + its relief from one height function: rgb(h, x, y) → [r, g, b]
  function pair(w, h, hf, col, k) {
    const H = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = hf(x, y);
    return { map: dataTex(w, h, d => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = col(H[y * w + x], x, y), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } }, { srgb: true }), normal: normalTex(H, w, h, k) };
  }
  function makeTextures() {
    // weathered vertical timber boards (stable fronts, doors, sheds): grain streaks, seams, knots; grey where the sun has bleached it
    T.boards = pair(512, 512, (x, y) => { const b = Math.floor(x / 64), seam = (x % 64) < 3 ? -0.55 : 0; return seam + 0.32 * fbm(x / 6 + b * 31, y / 150, 1e6, b + 3, 4) + 0.12 * (fbm(x / 2.2 + b * 7, y / 40, 1e6, b + 9, 2) - 0.5); },
      (h, x, y) => { const b = Math.floor(x / 64), t = 0.55 + 0.45 * h, w = 0.84 + 0.3 * hash(b, 5, 2); return [(176 + 70 * t) * w * 0.95, (134 + 58 * t) * w * 0.95, (92 + 44 * t) * w * 0.95]; }, 3.0);
    // wood grain along u (rails, posts, beams)
    T.wood = pair(512, 256, (x, y) => 0.5 * fbm(x / 140, y / 4.4, 1e6, 17, 4) + 0.25 * (fbm(x / 30, y / 3, 1e6, 4, 2) - 0.5), (h, x, y) => { const t = 0.62 + h * 0.6; return [176 * t, 138 * t, 98 * t]; }, 2.0);
    // painted weatherboards: lap shadows every 0.15 m; chalky white
    T.weather = pair(256, 256, (x, y) => { const f = (y % 32) / 32; return (f < 0.12 ? -0.9 * (1 - f / 0.12) : 0.35 * f) + 0.06 * fbm(x / 20, y / 8, 1e6, 7, 2); },
      (h, x, y) => { const f = (y % 32) / 32, s = f < 0.1 ? 0.62 + 3 * f : 1 - 0.05 * f, v = 232 * s * (0.95 + 0.05 * hash(x >> 4, y >> 5, 3)); return [v, v * 0.985, v * 0.94]; }, 3.2);
    // corrugated iron: 16 ribs per tile, faint rust streaks and dust
    T.iron = pair(256, 256, (x, y) => Math.cos((x / 16) * TAU) * 0.5, (h, x, y) => { const st = fbm(x / 10, y / 90, 1e6, 8, 3), rust = Math.pow(fbm(x / 40, y / 60, 1e6, 12, 3), 3) * 0.7, v = 205 + 30 * h + 14 * st; return [v + 8 * rust * 3, v - 14 * rust * 2, v - 34 * rust * 2]; }, 2.2);
    // crushed granite / gravel
    T.gravel = pair(256, 256, (x, y) => 0.6 * fbm(x / 7, y / 7, 1e6, 21, 3) + 0.4 * hash(x, y, 8), (h, x, y) => { const g = 0.78 + 0.34 * h, tint = hash(x >> 2, y >> 2, 13); return [(176 + 28 * tint) * g, (164 + 22 * tint) * g, (142 + 16 * tint) * g]; }, 2.0);
    T.dirt = pair(256, 256, (x, y) => 0.7 * fbm(x / 12, y / 12, 1e6, 31, 3) + 0.3 * hash(x, y, 9), (h, x, y) => { const g = 0.7 + 0.4 * h; return [138 * g, 104 * g, 70 * g]; }, 1.4);
    T.sand = pair(256, 256, (x, y) => 0.5 * fbm(x / 9, y / 9, 1e6, 41, 3) + 0.2 * Math.sin(y / 2.5) * 0.3 + 0.3 * hash(x, y, 10), (h, x, y) => { const g = 0.85 + 0.25 * h; return [196 * g, 168 * g, 124 * g]; }, 1.8);
    T.straw = pair(128, 128, (x, y) => 0.5 * hash(x >> 1, y >> 3, 5) + 0.5 * fbm(x / 4, y / 20, 1e6, 6, 2), (h, x, y) => { const g = 0.7 + 0.5 * h; return [214 * g, 180 * g, 98 * g]; }, 2.6);
    T.concrete = pair(256, 256, (x, y) => 0.5 * fbm(x / 24, y / 24, 1e6, 51, 4) + 0.2 * hash(x, y, 11) + ((x % 128) < 1 || (y % 128) < 1 ? -0.7 : 0), (h, x, y) => { const g = 0.74 + 0.4 * h; return [196 * g, 194 * g, 188 * g]; }, 1.2);
    // grass blade card for the tufts (alpha-tested)
    const c = document.createElement("canvas"); c.width = 128; c.height = 128; const g = c.getContext("2d"); g.clearRect(0, 0, 128, 128);
    const r = rng(77); for (let i = 0; i < 26; i++) { const x0 = 64 + (r() - 0.5) * 70, h = 50 + r() * 70, lean = (r() - 0.5) * 36, w = 2.2 + r() * 2.6; g.fillStyle = `hsl(${58 + r() * 24},${26 + r() * 18}%,${24 + r() * 22}%)`; g.beginPath(); g.moveTo(x0 - w, 128); g.quadraticCurveTo(x0 - w * 0.4 + lean * 0.4, 128 - h * 0.6, x0 + lean, 128 - h); g.quadraticCurveTo(x0 + w * 0.4 + lean * 0.4, 128 - h * 0.6, x0 + w, 128); g.fill(); }
    T.tuft = new THREE.CanvasTexture(c); T.tuft.encoding = THREE.sRGBEncoding; T.tuft.anisotropy = 4;
    for (const k of Object.keys(T)) { const t = T[k]; if (t.map) { t.map.anisotropy = 8; } }
  }

  // ---------------------------------------------------------------- materials
  const M = {};
  function makeMaterials() {
    const std = (map, extra) => new THREE.MeshStandardMaterial(Object.assign({ map: map.map, normalMap: map.normal, vertexColors: true, roughness: 0.85, metalness: 0 }, extra));
    M.timber = std(T.boards, { roughness: 0.82 }); M.wood = std(T.wood, { roughness: 0.78 }); M.weather = std(T.weather, { roughness: 0.7 });
    M.iron = std(T.iron, { roughness: 0.52, metalness: 0.18, side: THREE.DoubleSide }); M.concrete = std(T.concrete, { roughness: 0.9 });
    M.straw = std(T.straw, { roughness: 1 }); M.gravel = std(T.gravel, { roughness: 1 });
    M.steel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.85 });
    M.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
    M.rubber = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x35505a, roughness: 0.08, metalness: 0.7, envMapIntensity: 1.3 });
    M.water = new THREE.MeshStandardMaterial({ color: 0x486f78, roughness: 0.04, metalness: 0.25, envMapIntensity: 1.2 });
    const bm = G.mats(); M.brick = bm.brick;       // shared with the racecourses (not owned: never disposed here)
    M.leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
    M.tuft = new THREE.MeshStandardMaterial({ map: T.tuft, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, vertexColors: false });
  }

  // ---------------------------------------------------------------- the batcher: boxes, quads, cylinders merged per material and ~48 m cell
  const CELL = 48;
  class Batch {
    constructor() { this.m = new Map(); }
    _b(mat, x, z) { const k = mat.uuid + "|" + Math.floor(x / CELL) + "|" + Math.floor(z / CELL); let b = this.m.get(k); if (!b) this.m.set(k, b = { mat, p: [], n: [], c: [], u: [], i: [] }); return b; }
    // a planar quad a,b,c,d (counter-clockwise seen from the side the normal `n` points to; flipped if given the wrong way)
    quad(mat, a, b, c, d, col, uv, hint) {
      const bt = this._b(mat, (a[0] + c[0]) / 2, (a[2] + c[2]) / 2), ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let P = [a, b, c, d], U = uv;
      if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { P = [a, d, c, b]; U = [uv[0], uv[3], uv[2], uv[1]]; nx = -nx; ny = -ny; nz = -nz; }
      const base = bt.p.length / 3, C = typeof col === "number" ? lin(col) : col;
      for (let k = 0; k < 4; k++) { bt.p.push(P[k][0], P[k][1], P[k][2]); bt.n.push(nx, ny, nz); bt.c.push(C.r, C.g, C.b); bt.u.push(U[k][0], U[k][1]); }
      bt.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    // an axis-aligned box (centre cx,cy,cz; size sx,sy,sz), optionally turned about its own vertical axis. Faces carry metre-based UVs (tile = metres per texture repeat).
    box(mat, cx, cy, cz, sx, sy, sz, col, o) {
      o = o || {}; const ry = o.ry || 0, cs = Math.cos(ry), sn = Math.sin(ry), tile = o.tile || 1.6, grain = o.grain, hx = sx / 2, hy = sy / 2, hz = sz / 2;
      const W = (lx, ly, lz) => [cx + lx * cs + lz * sn, cy + ly, cz - lx * sn + lz * cs];
      const long = sx >= sz ? 0 : 1, t = 1 / tile;
      const face = (pts, ua, va, nrm) => { const q = pts.map(p => W(p[0], p[1], p[2])); this.quad(mat, q[0], q[1], q[2], q[3], col, [[ua[0] * t, va[0] * t], [ua[1] * t, va[1] * t], [ua[2] * t, va[2] * t], [ua[3] * t, va[3] * t]], [nrm[0] * cs + nrm[2] * sn, nrm[1], -nrm[0] * sn + nrm[2] * cs]); };
      const ox = cx + cz * 0.37, oz = cz - cx * 0.21;                        // continuity offset so neighbouring boxes of one wall share texture phase
      const uh = (p) => (ry === 0 ? p : 0);
      // front/back (±z): u along x
      face([[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], grain && long === 0 ? [0, sx, sx, 0] : [cx - hx, cx + hx, cx + hx, cx - hx], grain && long === 0 ? [0, 0, sy, sy] : [cy - hy, cy - hy, cy + hy, cy + hy], [0, 0, 1]);
      face([[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], grain && long === 0 ? [sx, 0, 0, sx] : [cx + hx, cx - hx, cx - hx, cx + hx], grain && long === 0 ? [0, 0, sy, sy] : [cy - hy, cy - hy, cy + hy, cy + hy], [0, 0, -1]);
      face([[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], grain && long === 1 ? [0, sz, sz, 0] : [cz + hz, cz - hz, cz - hz, cz + hz], grain && long === 1 ? [0, 0, sy, sy] : [cy - hy, cy - hy, cy + hy, cy + hy], [1, 0, 0]);
      face([[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], grain && long === 1 ? [sz, 0, 0, sz] : [cz - hz, cz + hz, cz + hz, cz - hz], grain && long === 1 ? [0, 0, sy, sy] : [cy - hy, cy - hy, cy + hy, cy + hy], [-1, 0, 0]);
      if (!o.noTop) face([[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [ox - hx, ox + hx, ox + hx, ox - hx], [oz + hz, oz + hz, oz - hz, oz - hz], [0, 1, 0]);
      if (!o.noBottom) face([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [ox - hx, ox + hx, ox + hx, ox - hx], [oz - hz, oz - hz, oz + hz, oz + hz], [0, -1, 0]);
    }
    // an upright cylinder (r, h), side + optional cap; tile in metres
    cyl(mat, cx, y0, cz, r, h, col, segs, o) {
      o = o || {}; segs = segs || 12; const rt = o.rTop != null ? o.rTop : r, tile = o.tile || 1.6;
      for (let k = 0; k < segs; k++) { const a0 = k / segs * TAU, a1 = (k + 1) / segs * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const u0 = a0 * r / tile, u1 = a1 * r / tile;
        this.quad(mat, [cx + c0 * r, y0, cz + s0 * r], [cx + c1 * r, y0, cz + s1 * r], [cx + c1 * rt, y0 + h, cz + s1 * rt], [cx + c0 * rt, y0 + h, cz + s0 * rt], col, [[u0, y0 / tile], [u1, y0 / tile], [u1, (y0 + h) / tile], [u0, (y0 + h) / tile]], [(c0 + c1) / 2, 0, (s0 + s1) / 2]);
        if (o.cap !== false && rt > 0) this.quad(mat, [cx, y0 + h, cz], [cx + c0 * rt, y0 + h, cz + s0 * rt], [cx + c1 * rt, y0 + h, cz + s1 * rt], [cx + c1 * rt * 0.999, y0 + h, cz + s1 * rt * 0.999], col, [[0.5, 0.5], [0.5 + c0 * 0.4, 0.5 + s0 * 0.4], [0.5 + c1 * 0.4, 0.5 + s1 * 0.4], [0.5 + c1 * 0.4, 0.5 + s1 * 0.4]], [0, 1, 0]); }
    }
    // a post/rail between two points (square section) — for angled rails and braces
    beam(mat, a, b, w, hgt, col, o) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 1, ux = dx / len, uy = dy / len, uz = dz / len;
      let sx = -uz, sz = ux, sl = Math.hypot(sx, sz); if (sl < 1e-4) { sx = 1; sz = 0; sl = 1; } sx /= sl; sz /= sl;
      const nx = uy * sz, ny = uz * sx - ux * sz, nz = -uy * sx, nl = Math.hypot(nx, ny, nz) || 1, vx = nx / nl, vy = ny / nl, vz = nz / nl, hw = w / 2, hh = hgt / 2, tile = (o && o.tile) || 1.6;
      const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [sx * hw * i + vx * hh * j, vy * hh * j, sz * hw * i + vz * hh * j]);
      const P = (p, k) => [p[0] + C[k][0], p[1] + C[k][1], p[2] + C[k][2]];
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4, mid = [(C[k][0] + C[k2][0]) / 2, (C[k][1] + C[k2][1]) / 2, (C[k][2] + C[k2][2]) / 2];
        this.quad(mat, P(a, k), P(a, k2), P(b, k2), P(b, k), col, [[0, 0], [w / tile, 0], [w / tile, len / tile], [0, len / tile]].map(([u, v]) => (o && o.grain) ? [v, u] : [u, v]), mid); }
    }
    flush(group, castShadow, receive) {
      const out = [];
      for (const b of this.m.values()) {
        if (!b.i.length) continue;
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute(b.c, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(b.u, 2)); g.setIndex(b.i); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, b.mat); m.castShadow = castShadow !== false; m.receiveShadow = receive !== false; m.matrixAutoUpdate = false; group.add(m); out.push(m);
      }
      this.m.clear(); return out;
    }
  }

    // frees every texture and material this kit made (the brick material belongs to the racecourse kit and is left alone)
  function disposeKit() {
    for (const k of Object.keys(T)) { const t = T[k]; if (t && t.map) { t.map.dispose(); t.normal.dispose(); } else if (t && t.dispose) t.dispose(); delete T[k]; }
    for (const k of Object.keys(M)) { if (M[k] !== M.brick && M[k].dispose) M[k].dispose(); delete M[k]; }
  }
  return { L, heightAt, T, M, Batch, makeTextures, makeMaterials, disposeKit, rng, sstep, clamp, TAU };
})();
