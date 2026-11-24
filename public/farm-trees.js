'use strict';
/* =====================================================================
   FINAL FURLONG — THE FARM: trees (Phase 4)
   Proper-looking Australian trees at a few hundred triangles each: a tapering, leaning trunk with a few limbs (vertex-coloured:
   pale smooth bark above, rough dark base), and the foliage as many crossed "leaf spray" cards carrying a generated eucalypt
   (or broad fig) leaf texture, alpha-tested. Card normals point away from the canopy centre, so the crown shades as one soft
   rounded mass rather than as flat cards. Two shape variants per species, a full and a cheap level of detail each.
   ===================================================================== */
const FARMTREES = (() => {
  const TAU = Math.PI * 2, lin = GFX.lin;
  const rng = seed => { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  // ---------------------------------------------------------------- leaf textures
  function leafTexture(kind) {
    const S = 256, c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d"); g.clearRect(0, 0, S, S); const r = rng(kind === "gum" ? 91 : 17);
    const spray = (cx, cy, n, len, wid, hue, sat, lit) => {
      for (let i = 0; i < n; i++) {
        const a = (kind === "gum" ? Math.PI * 0.5 : -Math.PI * 0.5 + (r() - 0.5) * 2.4) + (r() - 0.5) * (kind === "gum" ? 1.5 : 0.9), l = len * (0.7 + r() * 0.5), w = wid * (0.8 + r() * 0.5), x0 = cx + (r() - 0.5) * 70, y0 = cy + (r() - 0.5) * 50;
        const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l, mx = (x0 + x1) / 2 + Math.sin(a) * l * 0.18, my = (y0 + y1) / 2 - Math.cos(a) * l * 0.18;
        g.fillStyle = `hsl(${hue + (r() - 0.5) * 22},${sat + (r() - 0.5) * 12}%,${lit + (r() - 0.5) * 16}%)`; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx + Math.cos(a + 1.57) * w, my + Math.sin(a + 1.57) * w, x1, y1); g.quadraticCurveTo(mx - Math.cos(a + 1.57) * w, my - Math.sin(a + 1.57) * w, x0, y0); g.fill();
        if (kind !== "gum") { g.strokeStyle = "rgba(20,40,10,.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); } }
    };
    if (kind === "gum") {
      spray(128, 70, 80, 78, 7.5, 100, 22, 36); spray(128, 118, 90, 82, 7.5, 108, 24, 41); spray(128, 164, 70, 70, 7, 96, 20, 33); spray(128, 100, 40, 70, 6, 125, 18, 52); }
    else spray(128, 140, 70, 74, 17, 108, 42, 26), spray(128, 120, 60, 66, 15, 100, 38, 32), spray(128, 150, 40, 60, 14, 112, 40, 38);
    // copy to a DataTexture: transparent texels get the leaves' average colour so mip-mapping never blends in black; rows flipped to GL order
    const id = g.getImageData(0, 0, S, S), d = id.data; let sr = 0, sg = 0, sb = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
    sr /= n || 1; sg /= n || 1; sb /= n || 1; const out = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = ((S - 1 - y) * S + x) * 4, k = (y * S + x) * 4, a = d[k + 3]; out[i] = a < 12 ? sr : d[k]; out[i + 1] = a < 12 ? sg : d[k + 1]; out[i + 2] = a < 12 ? sb : d[k + 2]; out[i + 3] = a; }
    const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
  }

  // ---------------------------------------------------------------- geometry helpers
  class Buf { constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; }
    vert(x, y, z, nx, ny, nz, col, u, v) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.u.push(u || 0, v || 0); return this.p.length / 3 - 1; }
    geo() { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2)); g.setIndex(this.i); g.computeBoundingSphere(); return g; } }
  // a tapering tube along a polyline of centres [x,y,z,r]
  function tube(buf, pts, seg, colFn) {
    const rings = [];
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[Math.min(k + 1, pts.length - 1)], o = pts[Math.max(k - 1, 0)]; let tx = q[0] - o[0], ty = q[1] - o[1], tz = q[2] - o[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let ax = Math.abs(ty) > 0.9 ? 1 : 0, ay = Math.abs(ty) > 0.9 ? 0 : 1, az = 0; let bx = ty * az - tz * ay, by = tz * ax - tx * az, bz = tx * ay - ty * ax; const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
      const cx = by * tz - bz * ty, cy = bz * tx - bx * tz, cz = bx * ty - by * tx, ring = [], col = colFn(k / (pts.length - 1), p);
      for (let s = 0; s <= seg; s++) { const a = s / seg * TAU, ca = Math.cos(a), sa = Math.sin(a), nx = bx * ca + cx * sa, ny = by * ca + cy * sa, nz = bz * ca + cz * sa; ring.push(buf.vert(p[0] + nx * p[3], p[1] + ny * p[3], p[2] + nz * p[3], nx, ny, nz, col, s / seg, k / (pts.length - 1))); }
      rings.push(ring);
    }
    for (let k = 0; k + 1 < rings.length; k++) for (let s = 0; s < seg; s++) { const a = rings[k][s], b = rings[k][s + 1], c = rings[k + 1][s + 1], d = rings[k + 1][s]; buf.i.push(a, d, c, a, c, b); }
  }
  // a foliage clump: two crossed cards, each double-faced (two single-sided quads with the same canopy-centred normals)
  function clump(buf, x, y, z, w, h, yaw, tilt, center, col, rnd) {
    for (const rot of [0, Math.PI / 2 + (rnd() - 0.5) * 0.5]) {
      const ca = Math.cos(yaw + rot), sa = Math.sin(yaw + rot), P = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]].map(([u, v]) => { const tx = u * ca, tz = u * sa, ty = v * Math.cos(tilt), dz = v * Math.sin(tilt); return [x + tx - sa * dz * 0.6, y + ty - h * 0.35, z + tz + ca * dz * 0.6]; });
      const ids = P.map((p, k) => { let nx = p[0] - center[0], ny = p[1] - center[1] + 0.35 * center[3], nz = p[2] - center[2]; const nl = Math.hypot(nx, ny, nz) || 1; const shade = 0.62 + 0.38 * Math.min(1, Math.max(0, (p[1] - (center[1] - center[3])) / (2 * center[3]))); const cc = new THREE.Color(col.r * shade, col.g * shade, col.b * shade);
        return buf.vert(p[0], p[1], p[2], nx / nl, ny / nl, nz / nl, cc, k === 1 || k === 2 ? 1 : 0, k > 1 ? 1 : 0); });
      buf.i.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
      const ids2 = P.map((p, k) => { const o = ids[k]; return buf.vert(p[0], p[1], p[2], buf.n[o * 3], buf.n[o * 3 + 1], buf.n[o * 3 + 2], new THREE.Color(buf.c[o * 3], buf.c[o * 3 + 1], buf.c[o * 3 + 2]), k === 1 || k === 2 ? 1 : 0, k > 1 ? 1 : 0); });
      buf.i.push(ids2[0], ids2[2], ids2[1], ids2[0], ids2[3], ids2[2]);
    }
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  // a tall dark columnar cypress (windbreak): a thin trunk and a spiral of broad cards narrowing to the tip
  function cypress(r, hi) {
    const wood = new Buf(), leaf = new Buf(), H = 11, n = hi ? 40 : 15, cc = [0, H * 0.55, 0, H * 0.5], bark = lin(0x5b4a38);
    tube(wood, [[0, 0, 0, 0.3], [0, H * 0.5, 0, 0.2], [0, H, 0, 0.05]], 5, () => bark.clone());
    for (let k = 0; k < n; k++) { const t = k / n, a = k * 2.399 + r() * 0.5, rad = 1.9 * Math.pow(1 - t, 0.8) + 0.15, w = (2.8 * (1 - t) + 1.1) * (hi ? 1 : 1.4), tint = new THREE.Color().setRGB(0.2 + 0.1 * r(), 0.34 + 0.12 * r(), 0.2 + 0.08 * r()).convertSRGBToLinear();
      clump(leaf, Math.cos(a) * rad * 0.75, 0.9 + t * (H - 1.6), Math.sin(a) * rad * 0.75, w, w * 1.15, a, 0.1, cc, tint, r); }
    return { wood: wood.geo(), leaf: leaf.geo(), height: H, radius: 3 };
  }
  // species: gum (tall, open, pale trunk, drooping silver-green sprays) · fig (short buttressed trunk, broad dense dome)
  function make(species, variant, lod) {
    const r = rng(species.length * 1337 + variant * 7919 + 11), wood = new Buf(), leaf = new Buf(), hi = lod === 0;
    if (species === "cypress") return cypress(r, hi);
    const gum = species === "gum", seg = hi ? 8 : 5, barkHi = lin(gum ? 0xd9cfba : 0x8d8577), barkLo = lin(gum ? 0x6e5d4b : 0x5f574a), limbCol = lin(gum ? 0xc9bfa8 : 0x827a6c);
    const H = gum ? 8.5 + variant * 1.8 : 3.5, lean = (r() - 0.5) * 0.9, leanDir = r() * TAU, rings = hi ? 9 : 5, r0 = gum ? 0.46 : 0.95, r1 = gum ? 0.2 : 0.6;
    const tpts = []; for (let k = 0; k <= rings; k++) { const t = k / rings, bow = Math.sin(t * 2.2) * lean * 0.7 * t; tpts.push([Math.cos(leanDir) * bow * H * 0.12, t * H, Math.sin(leanDir) * bow * H * 0.12, lerp(r0, r1, Math.pow(t, 0.8)) * (k === 0 ? 1.35 : 1) * (gum && t < 0.12 ? 1.2 - t * 1.4 : 1)]); }
    tube(wood, tpts, seg, (t) => { const k = Math.min(1, Math.max(0, (t - 0.12) / 0.35)); const c = barkLo.clone().lerp(barkHi, k); const f = 0.88 + 0.2 * r(); return new THREE.Color(c.r * f, c.g * f, c.b * f); });
    if (!gum) for (let b = 0; b < (hi ? 7 : 4); b++) { const a = b / (hi ? 7 : 4) * TAU + r() * 0.4, pts = []; for (let k = 0; k <= 3; k++) { const t = k / 3; pts.push([Math.cos(a) * (0.5 + 1.1 * (1 - t)) , 0.15 + t * 1.0 * (1 - 0.3 * t), Math.sin(a) * (0.5 + 1.1 * (1 - t)), 0.36 * (1 - t * 0.6)]); } tube(wood, pts, 5, () => barkLo.clone()); }
    // limbs and their foliage
    const nl = gum ? (hi ? 5 : 3) : (hi ? 7 : 4), top = tpts[tpts.length - 1], cc = [top[0], gum ? H * 1.05 : 6.2, top[2], gum ? 4.4 : 5.4];
    const sprays = []; const limbs = [];
    for (let l = 0; l < nl; l++) {
      const a = l / nl * TAU + r() * 0.8, from = tpts[Math.min(rings, Math.round(rings * (gum ? 0.62 + 0.3 * r() : 0.88)))], len = gum ? 4.2 + r() * 3.0 : 4.6 + r() * 2.6, rise = gum ? 2.6 + r() * 2.4 : 1.6 + r() * 1.8, pts = [];
      for (let k = 0; k <= (hi ? 5 : 3); k++) { const t = k / (hi ? 5 : 3); pts.push([from[0] + Math.cos(a) * len * t, from[1] + rise * Math.sin(t * 1.6) - (gum ? 0 : 0.2 * t * t), from[2] + Math.sin(a) * len * t, (gum ? 0.2 : 0.42) * (1 - t * 0.78)]); }
      tube(wood, pts, hi ? 6 : 4, (t) => { const f = 0.9 + 0.15 * r(); return new THREE.Color(limbCol.r * f, limbCol.g * f, limbCol.b * f); }); limbs.push(pts);
    }
    const nSpray = gum ? (hi ? 34 : 14) : (hi ? 30 : 13);
    for (let k = 0; k < nSpray; k++) {
      const pts = limbs[k % limbs.length], t = 0.45 + 0.55 * r(), idx = Math.min(pts.length - 1, Math.round(t * (pts.length - 1))), p = pts[idx];
      const w = (gum ? 3.3 : 4.4) * (0.8 + r() * 0.5) * (hi ? 1 : 1.35), h = w * (gum ? 1.0 : 0.85), ox = (r() - 0.5) * (gum ? 2.2 : 3.4), oz = (r() - 0.5) * (gum ? 2.2 : 3.4), oy = (r() - 0.35) * (gum ? 1.6 : 1.8) + (gum ? 0.2 : 0.9);
      const tint = gum ? new THREE.Color().setRGB(0.55 + 0.25 * r(), 0.62 + 0.2 * r(), 0.5 + 0.18 * r()).convertSRGBToLinear() : new THREE.Color().setRGB(0.4 + 0.2 * r(), 0.55 + 0.2 * r(), 0.32 + 0.12 * r()).convertSRGBToLinear();
      clump(leaf, p[0] + ox, p[1] + oy, p[2] + oz, w, h, r() * TAU, (r() - 0.5) * 0.7 + (gum ? 0.25 : 0), cc, tint, r);
    }
    return { wood: wood.geo(), leaf: leaf.geo(), height: H + (gum ? 7 : 5), radius: gum ? 6 : 8 };
  }
  const cache = {}, tex = {};
  function get(species, variant, lod) { const k = species + variant + "_" + lod; return cache[k] || (cache[k] = make(species, variant, lod)); }
  function leafMaterial(species) {
    if (tex[species]) return tex[species].mat;
    const map = leafTexture(species), mat = new THREE.MeshStandardMaterial({ map, alphaTest: species === "gum" ? 0.42 : 0.5, vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.FrontSide });
    tex[species] = { map, mat }; return mat;
  }
  function woodMaterial() { return tex.wood ? tex.wood.mat : (tex.wood = { mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }) }).mat; }
  function dispose() { for (const k of Object.keys(cache)) { cache[k].wood.dispose(); cache[k].leaf.dispose(); delete cache[k]; } for (const k of Object.keys(tex)) { if (tex[k].map) tex[k].map.dispose(); tex[k].mat.dispose(); delete tex[k]; } }
  return { get, leafMaterial, woodMaterial, dispose };
})();
