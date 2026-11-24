'use strict';
/* =====================================================================
   FINAL FURLONG — THE FARM: structures (Phase 4)
   The stable block with its five boxes, the farmhouse, feed shed, vet bay, horse float + ute, the exercise oval and its rails,
   paddock fences and gates, the courtyard furniture and the boundary. Everything is merged by FARMWORLD.Batch (per material and
   ~48 m cell) so the whole property is a few dozen draw calls. See farm-world.js for the layout and farm-ground.js for the
   land, sky and plants.
   ===================================================================== */
const FARMBUILD = (() => {
  const W = FARMWORLD, L = W.L, M = W.M, TAU = W.TAU, lin = GFX.lin, hash = GFX.hash;
  const S = L.stable;

  // colours (sRGB hex; the batcher converts to linear)
  const COL = { boardDark: 0x6d5236, boardMid: 0x8a6a46, boardGrey: 0x9a8f7c, cream: 0xeee7d3, white: 0xf3f1ea, green: 0x2f4a38, deepGreen: 0x23382b, red: 0x8a2f26, galv: 0xaab0b4, steel: 0x6c7378, black: 0x1d2024,
    ironGrey: 0xc9cdcf, ironGreen: 0x4d6652, ironRed: 0x9a4a38, ironCream: 0xdcd9cd, sleeper: 0x6a5a48, concrete: 0xcfcdc6, straw: 0xd9bd72, rubber: 0x2a2c2e, brick: 0xb86b4d, silver: 0xdfe3e6 };
  const jit = (hex, k, seed) => { const c = lin(hex), f = 1 + (hash(seed | 0, (seed * 7) | 0, 3) - 0.5) * k; return new THREE.Color(c.r * f, c.g * f, c.b * f); };

  function build(scene, o) {
    o = o || {};
    let B = new W.Batch(), rigB = null, col = [], seg = [], pts = [], stalls = [], signs = [], owned = { tex: [], geo: [], mat: [] };
    const bx = (mat, x0, y0, z0, x1, y1, z1, c, opt) => B.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c, opt);
    const gy = (x, z) => W.heightAt(x, z);
    const colBox = (x0, z0, x1, z1) => col.push({ x0, x1, z0, z1 });
    const colSeg = (x0, z0, x1, z1, r) => seg.push({ x0, z0, x1, z1, r: r || 0.2 });
    // cylinder along an axis (wheels, pipes, tanks on their side)
    const cylAxis = (mat, cx, cy, cz, r, len, axis, c, n) => {
      n = n || 12; const P = (a, d) => axis === "z" ? [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + d] : [cx + d, cy + Math.cos(a) * r, cz + Math.sin(a) * r];
      for (let k = 0; k < n; k++) { const a0 = k / n * TAU, a1 = (k + 1) / n * TAU, h = len / 2;
        B.quad(mat, P(a0, -h), P(a1, -h), P(a1, h), P(a0, h), c, [[0, 0], [1, 0], [1, 1], [0, 1]], axis === "z" ? [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0] : [0, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)]);
        const ctr = axis === "z" ? [cx, cy, cz + h] : [cx + h, cy, cz], ctr2 = axis === "z" ? [cx, cy, cz - h] : [cx - h, cy, cz];
        B.quad(mat, ctr, P(a0, h), P(a1, h), P(a1, h), c, [[.5, .5], [0, 0], [1, 0], [1, 0]], axis === "z" ? [0, 0, 1] : [1, 0, 0]); B.quad(mat, ctr2, P(a1, -h), P(a0, -h), P(a0, -h), c, [[.5, .5], [0, 0], [1, 0], [1, 0]], axis === "z" ? [0, 0, -1] : [-1, 0, 0]); }
    };
    // a sign board: a textured plane mesh (its own little canvas texture), added straight to the scene
    const sign = (text, sub, x, y, z, w, h, ry, bg, fg) => {
      const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext("2d");
      g.fillStyle = bg || "#223a2e"; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = "#d8b45a"; g.lineWidth = 7; g.strokeRect(10, 10, c.width - 20, c.height - 20);
      g.fillStyle = fg || "#f4efe2"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `700 ${Math.round(c.height * (sub ? 0.36 : 0.44))}px Archivo, Inter, Arial, sans-serif`; g.fillText(text, c.width / 2, c.height * (sub ? 0.38 : 0.52), c.width - 40);
      if (sub) { g.font = `500 ${Math.round(c.height * 0.2)}px Archivo, Inter, Arial, sans-serif`; g.fillStyle = "#d8cfae"; g.fillText(sub, c.width / 2, c.height * 0.76, c.width - 40); }
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; const m = new THREE.MeshBasicMaterial({ map: t }), geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.y = ry || 0; scene.add(mesh); owned.tex.push(t); owned.mat.push(m); owned.geo.push(geo); signs.push(mesh); return mesh;
    };
    // roofs ---------------------------------------------------------------------------------------------------------------------
    // gable roof, ridge along x: eave line z = za / zb (the walls), overhang oh at the eaves and ox at the ends
    const gable = (x0, x1, za, zb, yEave, yRidge, oh, ox, c, thick) => {
      const zr = (za + zb) / 2, run = Math.abs(zb - za) / 2, k = (yRidge - yEave) / run, ye = yEave - k * oh, ze = oh;
      const rib = 1.216, u0 = (x0 - ox) / rib, u1 = (x1 + ox) / rib, sl = Math.hypot(run + oh, yRidge - ye) / rib;
      B.quad(M.iron, [x0 - ox, ye, za - ze], [x1 + ox, ye, za - ze], [x1 + ox, yRidge + 0.03, zr], [x0 - ox, yRidge + 0.03, zr], c, [[u0, 0], [u1, 0], [u1, sl], [u0, sl]], [0, 1, -0.3]);
      B.quad(M.iron, [x1 + ox, ye, zb + ze], [x0 - ox, ye, zb + ze], [x0 - ox, yRidge + 0.03, zr], [x1 + ox, yRidge + 0.03, zr], c, [[u1, 0], [u0, 0], [u0, sl], [u1, sl]], [0, 1, 0.3]);
      bx(M.iron, x0 - ox, yRidge, zr - 0.22, x1 + ox, yRidge + 0.09, zr + 0.22, c);                                    // ridge cap
      for (const [zz, s] of [[za - ze, -1], [zb + ze, 1]]) bx(M.paint, x0 - ox, ye - 0.16, zz - (s > 0 ? 0 : 0.03), x1 + ox, ye + 0.03, zz + (s > 0 ? 0.03 : 0), 0xe9e4d6);   // fascia
      // under-surface (rafters/lining seen from below)
      B.quad(M.timber, [x0 - ox, ye - 0.04, za - ze], [x0 - ox, yRidge, zr], [x1 + ox, yRidge, zr], [x1 + ox, ye - 0.04, za - ze], 0x8f7a5c, [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => [u * (x1 - x0 + 2 * ox) / 1.6, v * 3]), [0, -1, 0.3]);
      B.quad(M.timber, [x1 + ox, ye - 0.04, zb + ze], [x1 + ox, yRidge, zr], [x0 - ox, yRidge, zr], [x0 - ox, ye - 0.04, zb + ze], 0x8f7a5c, [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => [u * (x1 - x0 + 2 * ox) / 1.6, v * 3]), [0, -1, -0.3]);
    };
    // gable end (triangle) in the plane x = x, between z = za..zb, from y0 up to the ridge
    const gableEnd = (mat, x, za, zb, y0, yR, c, tile) => {
      const zr = (za + zb) / 2, t = tile || 1.6; B.quad(mat, [x, y0, za], [x, y0, zb], [x, yR, zr], [x, yR, zr], c, [[za / t, y0 / t], [zb / t, y0 / t], [zr / t, yR / t], [zr / t, yR / t]], [x > 0 ? 1 : -1, 0, 0]);
    };
    // ============================================================ STABLE BLOCK
    const stable = () => {
      const x0 = S.x0, x1 = S.x1, zb = S.zBack, zf = S.zFront, eave = S.eave, zV = -18.9;
      // courtyard-side apron under the verandah + kerb; wash bay slab
      bx(M.concrete, x0 - 0.2, 0, zf - 0.1, x1 + 0.2, 0.13, zV + 0.2, COL.concrete, { tile: 6 });
      bx(M.concrete, x0 - 0.2, 0, zV + 0.2, x1 + 0.2, 0.06, zV + 0.45, 0xbdbab2, { tile: 6 });                       // kerb step
      // back + end walls (weathered boards), plinth
      bx(M.timber, x0, 0, zb - 0.18, x1, eave + 0.1, zb, 0x7e6446, { tile: 2.0 });
      bx(M.timber, x0 - 0.18, 0, zb - 0.18, x0, eave + 0.1, zf, 0x7a6042, { tile: 2.0 }); bx(M.timber, x1, 0, zb - 0.18, x1 + 0.18, eave + 0.1, zf, 0x7a6042, { tile: 2.0 });
      gableEnd(M.weather, x0 - 0.18, zb - 0.8, zV + 0.35, eave + 0.1, S.ridge, COL.cream); gableEnd(M.weather, x1 + 0.18, zb - 0.8, zV + 0.35, eave + 0.1, S.ridge, COL.cream);
      colBox(x0 - 0.3, zb - 0.3, x1 + 0.3, zf);
      // roof, ventilators, gutter + downpipes
      gable(x0, x1, zb - 0.45, zV, eave, S.ridge, 0.38, 0.65, COL.ironGreen);
      for (const vx of [-8, 0, 8]) { bx(M.timber, vx - 0.4, S.ridge, -23.3, vx + 0.4, S.ridge + 0.55, -22.9, 0xcfc5ae); B.quad(M.iron, [vx - 0.52, S.ridge + 0.5, -23.4], [vx + 0.52, S.ridge + 0.5, -23.4], [vx + 0.52, S.ridge + 0.78, -23.1], [vx - 0.52, S.ridge + 0.78, -23.1], COL.ironGreen, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, -0.2]); B.quad(M.iron, [vx + 0.52, S.ridge + 0.5, -22.8], [vx - 0.52, S.ridge + 0.5, -22.8], [vx - 0.52, S.ridge + 0.78, -23.1], [vx + 0.52, S.ridge + 0.78, -23.1], COL.ironGreen, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0.2]); }
      bx(M.steel, x0 - 0.3, eave - 0.2, zV + 0.2, x1 + 0.3, eave - 0.06, zV + 0.36, COL.galv);                            // front gutter
      // verandah: posts, top plate, brackets
      bx(M.wood, x0 - 0.2, eave - 0.14, zV - 0.08, x1 + 0.2, eave + 0.02, zV + 0.08, 0x7b6244, { grain: true });
      for (let i = 0; i < 8; i++) { const px = x0 + 0.2 + i * (x1 - x0 - 0.4) / 7; bx(M.wood, px - 0.08, 0, zV - 0.08, px + 0.08, eave - 0.1, zV + 0.08, 0x8a6e4c, { grain: true }); bx(M.concrete, px - 0.13, 0, zV - 0.13, px + 0.13, 0.22, zV + 0.13, 0xb9b6ae);
        B.beam(M.wood, [px, eave - 0.1, zV], [px, eave - 0.62, zV - 0.0], 0.09, 0.09, 0x6f563a); colBox(px - 0.15, zV - 0.15, px + 0.15, zV + 0.15); bx(M.steel, px - 0.025, 0.05, zV + 0.2, px + 0.025, eave - 0.2, zV + 0.075, COL.galv); }   // post, footing, downpipe
      // the five loose boxes
      S.stallX.forEach((xc, i) => {
        const xa = xc - 2, xb = xc + 2, dw = 0.72;
        // front: lintel beam, flanking boards (lower) + steel bars (upper), door posts
        bx(M.wood, xa, 2.3, zf - 0.14, xb, 2.62, zf + 0.02, jit(COL.boardDark, 0.2, i + 1), { grain: true });
        for (const sd of [-1, 1]) { const a = sd < 0 ? xa : xc + dw, b = sd < 0 ? xc - dw : xb; bx(M.timber, a, 0, zf - 0.1, b, 1.25, zf, jit(0x7e6446, 0.2, i * 3 + sd + 5), { tile: 1.6 });
          bx(M.steel, a, 1.25, zf - 0.1, b, 1.3, zf, COL.galv); bx(M.steel, a, 2.22, zf - 0.1, b, 2.3, zf, COL.galv);
          for (let k = 0; k < 11; k++) { const bxk = a + (b - a) * (k + 0.5) / 11; bx(M.steel, bxk - 0.011, 1.3, zf - 0.07, bxk + 0.011, 2.22, zf - 0.05, COL.steel); } }
        for (const sd of [-1, 1]) bx(M.wood, xc + sd * dw - 0.07, 0, zf - 0.14, xc + sd * dw + 0.07, 2.3, zf + 0.04, 0x6b5238, { grain: true });
        // Dutch door: lower leaf shut (boards, strap hinges, latch), upper leaf swung open against the wall, kick plate
        bx(M.timber, xc - dw + 0.07, 0.06, zf - 0.07, xc + dw - 0.07, 1.25, zf - 0.01, 0x8a6a46, { tile: 1.2 }); bx(M.steel, xc - dw + 0.07, 0.5, zf + 0.0, xc - 0.1, 0.56, zf + 0.025, COL.steel); bx(M.steel, xc - dw + 0.07, 0.95, zf + 0.0, xc - 0.1, 1.01, zf + 0.025, COL.steel);
        bx(M.steel, xc + dw - 0.2, 1.05, zf + 0.0, xc + dw - 0.1, 1.12, zf + 0.05, COL.black);
        bx(M.timber, xc - dw - 0.75, 1.3, zf + 0.04, xc - dw - 0.69, 2.22, zf + 0.7, jit(0x7e6446, 0.15, i + 20), { tile: 1.2 });           // upper leaf standing open
        // partitions (solid boards below, bars above) and kick boards
        for (const px of [xa, xb]) { bx(M.timber, px - 0.05, 0, zb, px + 0.05, 1.6, zf, 0x866a49, { tile: 1.8 }); bx(M.wood, px - 0.07, 1.6, zb, px + 0.07, 1.68, zf, 0x6b5238, { grain: true }); bx(M.wood, px - 0.07, 2.45, zb, px + 0.07, 2.52, zf, 0x6b5238, { grain: true });
          for (let k = 0; k < 22; k++) { const z = zb + 0.12 + k * (zf - zb - 0.24) / 21; bx(M.steel, px - 0.011, 1.68, z - 0.011, px + 0.011, 2.45, z + 0.011, COL.steel); } }
        // bedding: a deep straw bed, banked at the walls, a few loose heaps; rubber mat by the door
        bx(M.straw, xa + 0.07, 0.0, zb + 0.02, xb - 0.07, 0.16, zf - 0.55, jit(COL.straw, 0.18, i + 40), { tile: 1.4 });
        bx(M.rubber, xa + 0.07, 0.0, zf - 0.55, xb - 0.07, 0.07, zf - 0.02, COL.rubber);
        for (const [bxx, bzz, ww, dd] of [[xa + 0.35, -24.3, 0.55, 3.4], [xb - 0.35, -24.6, 0.5, 2.9], [xc, zb + 0.35, 3.0, 0.5]]) bx(M.straw, bxx - ww / 2, 0.14, bzz - dd / 2, bxx + ww / 2, 0.38, bzz + dd / 2, jit(COL.straw, 0.25, i * 5 + Math.round(bxx)), { tile: 1.2 });
        // fittings: hay net, water bucket, feed bin, tie ring, ceiling light cage
        B.cyl(M.rubber, xc + 1.35, 1.35, zb + 0.35, 0.2, 0.55, 0x8b7a52, 8, { rTop: 0.13 }); bx(M.steel, xc + 1.3, 1.95, zb + 0.04, xc + 1.4, 2.0, zb + 0.14, COL.steel);
        B.cyl(M.paint, xc - 1.55, 0.95, zb + 0.55, 0.19, 0.3, 0x2f6f8f, 10, { rTop: 0.22 }); bx(M.steel, xc - 1.78, 1.2, zb + 0.35, xc - 1.72, 1.28, zb + 0.75, COL.steel);
        bx(M.paint, xb - 0.95, 0.9, zb + 0.05, xb - 0.35, 1.22, zb + 0.55, 0x3d6a45); bx(M.steel, xc + 0.35, 1.3, zb + 0.02, xc + 0.45, 1.4, zb + 0.07, COL.steel);
        bx(M.steel, xc - 0.12, eave - 0.08, -24.4, xc + 0.12, eave, -24.15, COL.black);
        // the horse stands here; the plaque hangs on the lintel
        stalls.push({ i, x: xc, z: -24.35, door: zf, plaque: [xc + 1.36, 1.8, zf + 0.03] });
      });
      // tack room (east end) and wash bay (west end)
      const tx0 = 10.12;
      bx(M.weather, tx0, 0, zf - 0.08, x1, eave + 0.05, zf + 0.06, COL.cream, { tile: 1.6 }); bx(M.timber, tx0, 0, zb, tx0 + 0.08, eave, zf, 0x866a49);
      bx(M.timber, 11.0, 0.0, zf + 0.06, 12.0, 2.15, zf + 0.12, COL.deepGreen, { tile: 1.2 }); bx(M.steel, 11.8, 1.0, zf + 0.12, 11.9, 1.06, zf + 0.17, COL.steel);
      bx(M.paint, 12.9, 1.0, zf + 0.06, 14.1, 2.0, zf + 0.11, COL.white); bx(M.glass, 13.0, 1.1, zf + 0.115, 14.0, 1.9, zf + 0.125, 0x35505a); bx(M.wood, 12.9, 1.46, zf + 0.115, 14.1, 1.5, zf + 0.15, COL.white);
      sign("TACK ROOM", "", 11.5, 2.5, zf + 0.16, 1.2, 0.34, 0, "#2b3f33");
      // wash bay: concrete falls to a drain, hose reel, wash rail with tie rings, rubber matting
      bx(M.concrete, x0, 0, zb, -10.05, 0.1, zf, 0xbfbdb5, { tile: 1.8 }); bx(M.steel, -13.0, 0.1, -24.4, -12.0, 0.115, -24.0, COL.black);
      bx(M.steel, x0 + 0.06, 0.9, -25.0, x0 + 0.5, 1.0, -22.8, COL.steel); bx(M.wood, x0 + 0.06, 0.0, -25.0, x0 + 0.5, 1.0, -24.9, 0x6b5238);
      B.cyl(M.paint, -13.7, 1.35, zb + 0.06, 0.26, 0.12, 0x2f6f8f, 14); for (const wx of [-13.4, -12.2, -11.0]) bx(M.steel, wx - 0.05, 1.0, zb + 0.02, wx + 0.05, 1.1, zb + 0.17, COL.galv);
      bx(M.rubber, -13.5, 0.1, -25.8, -10.5, 0.16, -23.0, COL.rubber); bx(M.wood, x0, 2.2, zb, -10.05, 2.28, zf - 0.02, 0x6b5238, { grain: true });
      sign("WASH BAY", "", -12.3, 2.55, zf + 0.05, 1.3, 0.34, 0, "#2b3f33");
    };
    // ============================================================ FARMHOUSE
    const house = () => {
      const h = L.house, x0 = h.x0, x1 = h.x1, z0 = h.z0, z1 = h.z1, fl = h.floor, wh = h.wall, top = fl + wh, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rib = 1.216;
      // brick piers + dark skirt, floor, weatherboard walls, corner boards
      for (let ix = 0; ix <= 6; ix++) for (const z of [z0 + 0.4, z1 - 0.4, cz]) { const px = x0 + 0.3 + ix * (x1 - x0 - 0.6) / 6; bx(M.brick, px - 0.16, 0, z - 0.16, px + 0.16, fl - 0.05, z + 0.16, 0xffffff, { tile: 1.2 }); }
      bx(M.timber, x0 + 0.05, 0.12, z0 + 0.05, x1 - 0.05, fl, z1 - 0.05, 0x3a3128, { tile: 1.0 });
      bx(M.weather, x0, fl, z0, x1, top, z1, jit(COL.cream, 0.04, 3), { tile: 1.6 }); colBox(x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
      for (const [a2, b2] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) bx(M.paint, a2 - 0.08, fl, b2 - 0.08, a2 + 0.08, top, b2 + 0.08, COL.white);
      bx(M.paint, x0 - 0.04, fl, z0 - 0.04, x1 + 0.04, fl + 0.14, z1 + 0.04, COL.white);
      // hipped corrugated roof, one pitch (24°) on all four planes, eave overhang 0.75
      const oh = 0.75, ex0 = x0 - oh, ex1 = x1 + oh, ez0 = z0 - oh, ez1 = z1 + oh, ye = top + 0.05, hz = (ez1 - ez0) / 2, rise = hz * 0.445, yr = ye + rise, rx0 = ex0 + hz, rx1 = Math.max(rx0 + 0.2, ex1 - hz), sl = Math.hypot(hz, rise) / rib, C = COL.ironGreen;
      B.quad(M.iron, [ex0, ye, ez0], [ex1, ye, ez0], [rx1, yr, cz], [rx0, yr, cz], C, [[ex0 / rib, 0], [ex1 / rib, 0], [rx1 / rib, sl], [rx0 / rib, sl]], [0, 1, -1]);
      B.quad(M.iron, [ex1, ye, ez1], [ex0, ye, ez1], [rx0, yr, cz], [rx1, yr, cz], C, [[ex1 / rib, 0], [ex0 / rib, 0], [rx0 / rib, sl], [rx1 / rib, sl]], [0, 1, 1]);
      B.quad(M.iron, [ex0, ye, ez1], [ex0, ye, ez0], [rx0, yr, cz], [rx0, yr, cz], C, [[ez1 / rib, 0], [ez0 / rib, 0], [cz / rib, sl], [cz / rib, sl]], [-1, 1, 0]);
      B.quad(M.iron, [ex1, ye, ez0], [ex1, ye, ez1], [rx1, yr, cz], [rx1, yr, cz], C, [[ez0 / rib, 0], [ez1 / rib, 0], [cz / rib, sl], [cz / rib, sl]], [1, 1, 0]);
      B.beam(M.iron, [rx0, yr + 0.04, cz], [rx1, yr + 0.04, cz], 0.3, 0.12, C);
      for (const [xa, za, xb, zb] of [[ex0, ez0, ex1, ez0], [ex0, ez1, ex1, ez1], [ex0, ez0, ex0, ez1], [ex1, ez0, ex1, ez1]]) bx(M.paint, Math.min(xa, xb) - 0.02, ye - 0.15, Math.min(za, zb) - 0.02, Math.max(xa, xb) + 0.02, ye + 0.02, Math.max(za, zb) + 0.02, COL.white);
      B.quad(M.timber, [ex0, ye - 0.02, ez0], [ex0, ye - 0.02, ez1], [ex1, ye - 0.02, ez1], [ex1, ye - 0.02, ez0], 0xe8e2d0, [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => [u * 10, v * 10]), [0, -1, 0]);        // eaves lining
      // brick chimney through the ridge
      bx(M.brick, -52.3, top - 0.3, cz - 0.45, -51.3, yr + 1.0, cz + 0.45, 0xffffff, { tile: 1.2 }); bx(M.concrete, -52.42, yr + 1.0, cz - 0.57, -51.18, yr + 1.12, cz + 0.57, 0xbdbab2); B.cyl(M.paint, -51.8, yr + 1.12, cz, 0.2, 0.4, 0xb86b4d, 8);
      // front verandah (east): timber decking, skillion roof, posts, brackets, balustrade, steps
      const vx1 = x1 + 2.7, vz0 = z0 - 0.5, vz1 = z1 + 0.5, vl = (vz1 - vz0 + 0.4);
      bx(M.wood, x1, fl - 0.12, vz0, vx1, fl, vz1, 0x7a634a, { grain: true, tile: 0.9 });
      B.quad(M.iron, [x1, top - 0.05, vz0 - 0.2], [x1, top - 0.05, vz1 + 0.2], [vx1 + 0.3, top - 0.7, vz1 + 0.2], [vx1 + 0.3, top - 0.7, vz0 - 0.2], C, [[(vz0 - 0.2) / rib, 0], [(vz1 + 0.2) / rib, 0], [(vz1 + 0.2) / rib, 3 / rib], [(vz0 - 0.2) / rib, 3 / rib]], [0.3, 1, 0]);
      B.quad(M.timber, [x1, top - 0.1, vz1 + 0.2], [x1, top - 0.1, vz0 - 0.2], [vx1 + 0.3, top - 0.75, vz0 - 0.2], [vx1 + 0.3, top - 0.75, vz1 + 0.2], 0xcfc6ac, [[0, 0], [vl / 1.6, 0], [vl / 1.6, 2], [0, 2]], [-0.3, -1, 0]);
      for (let i = 0; i <= 5; i++) { const z = vz0 + 0.12 + i * (vz1 - vz0 - 0.24) / 5; bx(M.paint, vx1 - 0.07, fl, z - 0.07, vx1 + 0.07, top - 0.68, z + 0.07, COL.white); bx(M.paint, vx1 - 0.2, top - 0.92, z - 0.03, vx1 + 0.04, top - 0.75, z + 0.03, COL.white); colBox(vx1 - 0.1, z - 0.1, vx1 + 0.1, z + 0.1); }
      bx(M.paint, vx1 - 0.08, fl + 0.88, vz0, vx1 + 0.08, fl + 0.96, vz1, COL.white); bx(M.paint, vx1 - 0.05, fl + 0.1, vz0, vx1 + 0.05, fl + 0.16, vz1, COL.white);
      for (let k = 0; k < 44; k++) { const z = vz0 + 0.1 + k * (vz1 - vz0 - 0.2) / 43; if (Math.abs(z - cz) < 1.05) continue; bx(M.paint, vx1 - 0.02, fl + 0.16, z - 0.02, vx1 + 0.02, fl + 0.88, z + 0.02, COL.white); }
      for (let k = 0; k < 4; k++) bx(M.wood, vx1 + k * 0.3, fl - 0.15 - k * 0.15, cz - 0.75, vx1 + k * 0.3 + 0.3, fl - 0.12 - k * 0.15 + 0.01 - 0.01, cz + 0.75, 0x7a634a, { grain: true, noBottom: true });
      for (let k = 0; k < 4; k++) bx(M.wood, vx1 + k * 0.3, 0.0, cz - 0.75, vx1 + k * 0.3 + 0.3, fl - 0.12 - k * 0.15, cz + 0.75, 0x6b5238, { grain: true });
      colBox(x1, vz0, vx1 + 0.1, vz0 + 0.12); colBox(x1, vz1 - 0.12, vx1 + 0.1, vz1);
      // front door (deep green, panels, fanlight), windows with shutters
      bx(M.paint, x1, fl + 0.02, cz - 0.55, x1 + 0.08, fl + 2.15, cz + 0.55, COL.deepGreen); for (const dz of [-0.42, 0.04]) { bx(M.paint, x1 + 0.08, fl + 0.3, cz + dz, x1 + 0.1, fl + 1.0, cz + dz + 0.38, 0x2c4636); bx(M.paint, x1 + 0.08, fl + 1.25, cz + dz, x1 + 0.1, fl + 1.95, cz + dz + 0.38, 0x2c4636); }
      bx(M.steel, x1 + 0.1, fl + 1.05, cz + 0.38, x1 + 0.14, fl + 1.12, cz + 0.48, 0xc9a24a); bx(M.paint, x1, fl + 2.15, cz - 0.7, x1 + 0.1, fl + 2.3, cz + 0.7, COL.white); bx(M.paint, x1, fl, cz - 0.7, x1 + 0.1, fl + 0.05, cz + 0.7, COL.white);
      const wy = fl + 0.95, wh2 = 1.35;
      const winX = (xw, zc, s) => { const e = (a, b2) => [Math.min(a, b2), Math.max(a, b2)];
        let [a2, b2] = e(xw - 0.03 * s, xw + 0.08 * s); bx(M.paint, a2, wy - 0.07, zc - 0.62, b2, wy + wh2 + 0.07, zc + 0.62, COL.white);
        [a2, b2] = e(xw + 0.07 * s, xw + 0.09 * s); bx(M.glass, a2, wy, zc - 0.5, b2, wy + wh2, zc + 0.5, 0x35505a);
        [a2, b2] = e(xw + 0.08 * s, xw + 0.11 * s); bx(M.paint, a2, wy + wh2 / 2 - 0.02, zc - 0.5, b2, wy + wh2 / 2 + 0.02, zc + 0.5, COL.white); bx(M.paint, a2, wy, zc - 0.02, b2, wy + wh2, zc + 0.02, COL.white);
        [a2, b2] = e(xw + 0.04 * s, xw + 0.14 * s); bx(M.paint, a2, wy - 0.1, zc - 0.7, b2, wy - 0.03, zc + 0.7, COL.white);
        for (const sd of [-1, 1]) { [a2, b2] = e(xw + 0.05 * s, xw + 0.09 * s); bx(M.timber, a2, wy - 0.05, zc + sd * 0.95 - 0.27, b2, wy + wh2 + 0.05, zc + sd * 0.95 + 0.27, 0x3d5a47, { tile: 0.8 }); } };
      const winZ = (xc, zw, s) => { const e = (a, b2) => [Math.min(a, b2), Math.max(a, b2)];
        let [a2, b2] = e(zw - 0.03 * s, zw + 0.08 * s); bx(M.paint, xc - 0.62, wy - 0.07, a2, xc + 0.62, wy + wh2 + 0.07, b2, COL.white);
        [a2, b2] = e(zw + 0.07 * s, zw + 0.09 * s); bx(M.glass, xc - 0.5, wy, a2, xc + 0.5, wy + wh2, b2, 0x35505a);
        [a2, b2] = e(zw + 0.08 * s, zw + 0.11 * s); bx(M.paint, xc - 0.5, wy + wh2 / 2 - 0.02, a2, xc + 0.5, wy + wh2 / 2 + 0.02, b2, COL.white); bx(M.paint, xc - 0.02, wy, a2, xc + 0.02, wy + wh2, b2, COL.white);
        [a2, b2] = e(zw + 0.04 * s, zw + 0.14 * s); bx(M.paint, xc - 0.7, wy - 0.1, a2, xc + 0.7, wy - 0.03, b2, COL.white);
        for (const sd of [-1, 1]) { [a2, b2] = e(zw + 0.05 * s, zw + 0.09 * s); bx(M.timber, xc + sd * 0.95 - 0.27, wy - 0.05, a2, xc + sd * 0.95 + 0.27, wy + wh2 + 0.05, b2, 0x3d5a47, { tile: 0.8 }); } };
      for (const z of [-5.6, -3.0, 3.0]) winX(x1, z, 1); winX(x0, -4.5, -1); winX(x0, 0.5, -1); winX(x0, 2.8, -1);
      for (const x of [-56, -52.5, -49, -46.5]) { winZ(x, z0, -1); winZ(x, z1, 1); }
      sign(o.stableName || "Southern Cross Stable", "Training & racing", x1 + 0.12, fl + 2.65, cz, 1.7, 0.42, Math.PI / 2, "#223a2e");
      pts.push({ id: "office", x: vx1 + 1.6, z: cz, r: 2.6, text: "E — Enter the farmhouse" });
      // rainwater tank + stand
      B.cyl(M.iron, -60.8, 0.5, -5.5, 1.55, 2.4, 0xb9bdbf, 16, { rTop: 1.55, tile: 1.216 }); B.cyl(M.iron, -60.8, 2.9, -5.5, 1.55, 0.18, 0xa9aeb0, 16, { rTop: 0.5, tile: 1.216 }); B.cyl(M.wood, -60.8, 0, -5.5, 1.3, 0.5, 0x6b5238, 12, { tile: 1.0 }); colBox(-62.5, -7.2, -59.1, -3.8);
      // picket-fenced garden (white pickets, gate gap on the east side for the path)
      const gx0 = -65, gx1 = -37, gz0 = -14, gz1 = 10, gateZ = [-1.1, 1.1];
      const picket = (a, b2, c2, d) => { const len = Math.hypot(c2 - a, d - b2), n = Math.max(2, Math.round(len / 0.2)), ux = (c2 - a) / len, uz = (d - b2) / len, ry = Math.abs(uz) > 0.5 ? Math.PI / 2 : 0;
        for (const y of [0.3, 0.76]) bx(M.paint, Math.min(a, c2) - 0.02, y, Math.min(b2, d) - 0.02, Math.max(a, c2) + 0.02, y + 0.07, Math.max(b2, d) + 0.02, COL.white);
        for (let k = 0; k <= n; k++) { const t = k / n * len, px = a + ux * t, pz = b2 + uz * t; if (Math.abs(px - gx1) < 0.3 && pz > gateZ[0] && pz < gateZ[1]) continue; B.box(M.paint, px, 0.46, pz, 0.07, 0.92, 0.03, COL.white, { ry, noBottom: true }); }
        if (Math.abs(a - gx1) < 0.1 && Math.abs(c2 - gx1) < 0.1) { colSeg(a, b2, a, gateZ[0], 0.12); colSeg(a, gateZ[1], c2, d, 0.12); } else colSeg(a, b2, c2, d, 0.12); };
      picket(gx0, gz0, gx1, gz0); picket(gx0, gz1, gx1, gz1); picket(gx0, gz0, gx0, gz1); picket(gx1, gz0, gx1, gz1);
      for (const [a2, b2] of [[gx0, gz0], [gx1, gz0], [gx0, gz1], [gx1, gz1], [gx1, gateZ[0]], [gx1, gateZ[1]]]) bx(M.paint, a2 - 0.07, 0, b2 - 0.07, a2 + 0.07, 1.05, b2 + 0.07, COL.white);
    };
    // ============================================================ FEED SHED, SILO, TANK, VET BAY
    const feedShed = () => {
      const f = L.feed, x0 = f.x0, x1 = f.x1, z0 = f.z0, z1 = f.z1, eh = 4.4, ridge = 5.9;
      bx(M.concrete, x0 - 0.3, 0, z0 - 0.3, x1 + 0.3, 0.14, z1 + 3.2, 0xb9b6ae, { tile: 6 });
      // portal frame (steel), cladding in light grey, roller door + person door + window
      bx(M.iron, x0, 0.14, z0, x1, eh, z1, COL.ironCream, { tile: 1.216 }); colBox(x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1);
      gableEnd(M.iron, x0, z0, z1, eh, ridge, COL.ironCream, 1.216); gableEnd(M.iron, x1, z0, z1, eh, ridge, COL.ironCream, 1.216);
      gable(x0, x1, z0, z1, eh, ridge, 0.4, 0.35, COL.ironGreen);
      for (let i = 0; i <= 4; i++) { const px = x0 + i * (x1 - x0) / 4; bx(M.steel, px - 0.1, 0.14, z1 + 0.0, px + 0.1, eh, z1 + 0.18, COL.galv); }
      bx(M.paint, 27.0, 0.14, z1 + 0.02, 31.2, 3.4, z1 + 0.16, 0x4d6652); for (let k = 0; k < 16; k++) bx(M.paint, 27.0, 0.3 + k * 0.205, z1 + 0.16, 31.2, 0.34 + k * 0.205, z1 + 0.19, 0x3c523f);
      bx(M.paint, 33.0, 0.14, z1 + 0.02, 34.0, 2.2, z1 + 0.14, COL.deepGreen); bx(M.glass, 35.2, 1.2, z1 + 0.02, 36.6, 2.1, z1 + 0.12, 0x35505a);
      sign("FEED & EQUIPMENT", "", 29.1, 3.75, z1 + 0.22, 2.4, 0.42, 0, "#2b3f33");
      // lean-to for hay on the east side, loaded with bales
      bx(M.iron, x1, 0.14, z0 + 1, x1 + 5, 0.15, z1 - 1, 0xb9b6ae); B.quad(M.iron, [x1, 3.9, z0 + 0.6], [x1, 3.9, z1 - 0.6], [x1 + 5.4, 3.0, z1 - 0.6], [x1 + 5.4, 3.0, z0 + 0.6], COL.ironGreen, [[0, 0], [10, 0], [10, 5], [0, 5]], [0.3, 1, 0]);
      for (const z of [z0 + 0.8, z1 - 0.8]) bx(M.wood, x1 + 4.9, 0, z - 0.1, x1 + 5.1, 3.0, z + 0.1, 0x6b5238, { grain: true });
      const r = W.rng(12);
      for (let y = 0; y < 4; y++) for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 8 - y; iz++) { if (y > 1 && r() < 0.18) continue; bx(M.straw, x1 + 0.4 + ix * 1.05, 0.15 + y * 0.46, z0 + 1.0 + iz * 0.55 + (y % 2) * 0.27, x1 + 1.4 + ix * 1.05, 0.15 + (y + 1) * 0.46 - 0.02, z0 + 1.45 + iz * 0.55 + (y % 2) * 0.27, jit(COL.straw, 0.3, y * 99 + ix * 7 + iz), { tile: 0.9 }); }
      colBox(x1, z0 + 0.5, x1 + 5.2, z1 - 0.5);
      // silo (steel, on legs) + feed bins + rainwater tank, a few bales and a barrow by the door
      B.cyl(M.steel, 31, 1.4, -36.0, 1.1, 3.4, 0xc7ccd0, 16, { rTop: 1.1 }); B.cyl(M.steel, 31, 4.8, -36.0, 1.1, 1.0, 0xc7ccd0, 16, { rTop: 0.2 }); for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) bx(M.steel, 31 + dx - 0.07, 0, -36 + dz - 0.07, 31 + dx + 0.07, 1.4, -36 + dz + 0.07, COL.steel);
      colBox(29.7, -37.3, 32.3, -34.7);
      B.cyl(M.iron, 41.2, 0, -22.0, 1.5, 2.3, 0x8c9a8c, 16, { tile: 1.216 }); B.cyl(M.iron, 41.2, 2.3, -22.0, 1.5, 0.15, 0x8a8f90, 16, { rTop: 0.4 }); colBox(39.6, -23.6, 42.8, -20.4);
      for (let k = 0; k < 3; k++) bx(M.paint, 22.4 + k * 0.01, 0, -20.0 - k * 0.9, 23.1, 0.9, -19.4 - k * 0.9, 0x3d6a45); bx(M.steel, 33.6, 0.14, -17.2, 35.4, 0.3, -16.6, COL.black);
      for (let y = 0; y < 3; y++) for (let ix = 0; ix < 3; ix++) bx(M.straw, 24.2 + ix * 1.0, 0.14 + y * 0.46, -16.2, 25.1 + ix * 1.0, 0.14 + (y + 1) * 0.46 - 0.02, -15.7, jit(COL.straw, 0.3, y * 13 + ix), { tile: 0.9 });
    };
    const vetBay = () => {
      const v = L.vet, x0 = v.x0, x1 = v.x1, z0 = v.z0, z1 = v.z1;
      bx(M.concrete, x0, 0, z0, x1, 0.12, z1, 0xc3c1b9, { tile: 6 });
      for (const [px, pz] of [[x0 + 0.2, z1 - 0.2], [x1 - 0.2, z1 - 0.2], [x0 + 0.2, z0 + 0.2], [x1 - 0.2, z0 + 0.2]]) bx(M.wood, px - 0.1, 0.12, pz - 0.1, px + 0.1, 3.1, pz + 0.1, 0x6b5238, { grain: true });
      B.quad(M.iron, [x0 - 0.5, 3.35, z0 - 0.4], [x1 + 0.5, 3.35, z0 - 0.4], [x1 + 0.5, 2.85, z1 + 0.7], [x0 - 0.5, 2.85, z1 + 0.7], COL.ironCream, [[0, 0], [(x1 - x0 + 1) / 1.216, 0], [(x1 - x0 + 1) / 1.216, 5], [0, 5]], [0, 1, 0.1]);
      bx(M.timber, x0, 0.12, z0, x1, 3.0, z0 + 0.12, 0x8a6a46, { tile: 1.8 }); colBox(x0, z0 - 0.1, x1, z0 + 0.2);
      // crush (steel frame with rails), stainless table, cabinet, hose
      const cx = 28.2, cz = -3.2; for (const sx of [-0.45, 0.45]) for (const sz of [-1.1, 1.1]) bx(M.steel, cx + sx - 0.04, 0.12, cz + sz - 0.04, cx + sx + 0.04, 1.8, cz + sz + 0.04, COL.galv);
      for (const sx of [-0.45, 0.45]) for (const y of [0.5, 0.95, 1.4, 1.8]) bx(M.steel, cx + sx - 0.025, y, cz - 1.1, cx + sx + 0.025, y + 0.05, cz + 1.1, COL.galv);
      bx(M.steel, cx - 0.5, 1.8, cz - 1.1, cx + 0.5, 1.86, cz - 1.0, COL.galv); bx(M.steel, cx - 0.5, 1.8, cz + 1.0, cx + 0.5, 1.86, cz + 1.1, COL.galv);
      bx(M.steel, 32.0, 0.12, -6.8, 33.6, 0.95, -5.9, 0xc9ced1); bx(M.steel, 31.9, 0.95, -6.9, 33.7, 1.0, -5.8, 0xdfe3e6); bx(M.paint, 25.2, 0.12, -7.5, 26.2, 1.9, -6.9, COL.white); bx(M.paint, 25.7 - 0.12, 1.3, -6.89, 25.7 + 0.12, 1.55, -6.86, 0xb53a30); bx(M.paint, 25.7 - 0.04, 1.2, -6.885, 25.7 + 0.04, 1.65, -6.865, 0xb53a30);
      sign("VETERINARY", "", 29.5, 3.0, z1 + 0.78, 1.7, 0.4, 0, "#2b3f33"); colBox(x0 - 0.3, z0 - 0.3, x0 + 0.5, z0 + 0.5);
    };
    // ============================================================ HORSE FLOAT, UTE, HARDSTAND
    const floatAndUte = () => {
      const FX = L.float.x, FZ = L.float.z, y0 = 0.62;
      bx(M.concrete, FX - 9.5, 0, FZ - 4.6, FX + 8.5, 0.05, FZ + 4.8, 0xb5b2aa, { tile: 6 });
      // the rig (float + ute) is built at its own origin into its own batch, so it becomes a group that can drive off the property
      const mainB = B; B = new W.Batch(); const rig = () => { const fx = 24, fz = 24;       // built around (24, 24) so the whole rig sits in ONE 48 m batch cell (fewer draw calls); the group is offset back
      // float: chassis, floor, painted body, roof, ramp (down), window slots, wheels, drawbar, jockey wheel
      bx(M.steel, fx - 2.8, y0 - 0.15, fz - 1.0, fx + 2.8, y0, fz + 1.0, COL.steel); bx(M.paint, fx - 2.8, y0, fz - 1.15, fx + 2.8, y0 + 0.08, fz + 1.15, 0xcfd3d6);
      bx(M.paint, fx - 2.8, y0 + 0.08, fz - 1.15, fx + 2.8, y0 + 2.0, fz - 1.07, 0xeef0ef); bx(M.paint, fx - 2.8, y0 + 0.08, fz + 1.07, fx + 2.8, y0 + 2.0, fz + 1.15, 0xeef0ef);
      bx(M.paint, fx + 2.72, y0 + 0.08, fz - 1.15, fx + 2.8, y0 + 2.0, fz + 1.15, 0xe3e6e5); bx(M.paint, fx - 2.72, y0 + 1.93, fz - 1.07, fx + 2.72, y0 + 2.0, fz + 1.07, 0x6c7378); bx(M.paint, fx - 2.72, y0 + 0.08, fz - 1.07, fx + 2.72, y0 + 0.12, fz + 1.07, 0x8a6a46);   // open at the rear (the ramp is the door): ceiling and floor boards inside
      for (let k = 0; k < 6; k++) { const wx = fx - 2.3 + k * 0.9; bx(M.paint, wx - 0.3, y0 + 1.25, fz - 1.19, wx + 0.3, y0 + 1.75, fz - 1.14, 0x2a3a40); bx(M.paint, wx - 0.3, y0 + 1.25, fz + 1.14, wx + 0.3, y0 + 1.75, fz + 1.19, 0x2a3a40); bx(M.steel, wx - 0.34, y0 + 1.22, fz + 1.14, wx + 0.34, y0 + 1.25, fz + 1.2, COL.galv); bx(M.steel, wx - 0.34, y0 + 1.22, fz - 1.2, wx + 0.34, y0 + 1.25, fz - 1.14, COL.galv); }
      for (const sz of [-1, 1]) { bx(M.paint, fx - 2.8, y0 + 0.3, fz + sz * 1.15 - (sz < 0 ? 0.03 : 0), fx + 2.8, y0 + 0.78, fz + sz * 1.15 + (sz > 0 ? 0.03 : 0), 0x1f3a52); bx(M.steel, fx - 2.8, y0 + 0.2, fz + sz * 1.15 - (sz < 0 ? 0.04 : 0), fx + 2.8, y0 + 0.26, fz + sz * 1.15 + (sz > 0 ? 0.04 : 0), COL.galv);
        for (const wx of [fx - 0.7, fx + 0.5]) bx(M.paint, wx - 0.62, y0 - 0.1, fz + sz * 1.0 - (sz < 0 ? 0.28 : -0.0), wx + 0.62, y0 + 0.5, fz + sz * 1.0 + (sz > 0 ? 0.28 : 0), 0x2a2d30); }
      for (const sz of [-0.9, 0.9]) bx(M.paint, fx - 2.84, y0 + 0.4, fz + sz - 0.12, fx - 2.8, y0 + 0.62, fz + sz + 0.12, 0xb8221c);          // tail lights
      B.quad(M.paint, [fx - 2.9, y0 + 2.0, fz - 1.25], [fx + 2.9, y0 + 2.0, fz - 1.25], [fx + 2.9, y0 + 2.35, fz], [fx - 2.9, y0 + 2.35, fz], 0xf4f5f4, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, -0.3]); B.quad(M.paint, [fx + 2.9, y0 + 2.0, fz + 1.25], [fx - 2.9, y0 + 2.0, fz + 1.25], [fx - 2.9, y0 + 2.35, fz], [fx + 2.9, y0 + 2.35, fz], 0xf4f5f4, [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0.3]);
      B.quad(M.paint, [fx - 2.9, y0 + 2.0, fz - 1.25], [fx - 2.9, y0 + 2.0, fz + 1.25], [fx - 2.9, y0 + 2.35, fz], [fx - 2.9, y0 + 2.35, fz], 0xe8eae9, [[0, 0], [1, 0], [1, 1], [1, 1]], [-1, 0, 0]);
      // (the tail ramp is a separate hinged mesh, added below, so it can be raised before the rig drives off)
      for (const sz of [-1.05, 1.05]) for (const wx of [fx - 0.7, fx + 0.5]) { cylAxis(M.paint, wx, 0.5, fz + sz, 0.5, 0.26, "z", COL.rubber, 14); cylAxis(M.steel, wx, 0.5, fz + sz + Math.sign(sz) * 0.14, 0.27, 0.04, "z", COL.galv, 10); }
      bx(M.steel, fx + 2.8, y0 - 0.08, fz - 0.07, fx + 4.6, y0 + 0.0, fz + 0.07, COL.steel); bx(M.steel, fx + 3.9, 0.12, fz - 0.04, fx + 3.98, y0 - 0.08, fz + 0.04, COL.galv);
      const ux = fx + 7.0, uy = 0.34;       // the ute (4WD, white) hitched to the float
      bx(M.paint, ux - 2.3, uy + 0.2, fz - 0.95, ux + 2.3, uy + 0.8, fz + 0.95, 0xe9ebec); bx(M.paint, ux - 0.4, uy + 0.8, fz - 0.9, ux + 1.45, uy + 1.55, fz + 0.9, 0xe9ebec);
      bx(M.paint, ux - 0.2, uy + 0.9, fz - 0.92, ux + 1.3, uy + 1.45, fz + 0.92, 0x2e444d); bx(M.paint, ux - 2.3, uy + 0.8, fz - 0.92, ux - 0.45, uy + 1.0, fz + 0.92, 0xdcdede); bx(M.steel, ux + 2.28, uy + 0.25, fz - 0.9, ux + 2.45, uy + 0.55, fz + 0.9, COL.steel); bx(M.paint, ux + 2.28, uy + 0.4, fz - 0.85, ux + 2.32, uy + 0.55, fz - 0.55, 0xf4e3a0); bx(M.paint, ux + 2.28, uy + 0.4, fz + 0.55, ux + 2.32, uy + 0.55, fz + 0.85, 0xf4e3a0); bx(M.steel, ux + 2.28, uy + 0.57, fz - 0.4, ux + 2.33, uy + 0.75, fz + 0.4, COL.black); for (const sz of [-0.93, 0.93]) bx(M.steel, ux - 2.3, uy + 0.8, fz + sz - 0.02, ux + 0.0, uy + 1.0, fz + sz + 0.02, COL.galv);
      bx(M.steel, ux - 2.42, uy + 0.25, fz - 0.9, ux - 2.28, uy + 0.5, fz + 0.9, COL.steel); bx(M.steel, ux - 2.0, uy + 0.82, fz - 0.4, ux - 1.2, uy + 1.0, fz + 0.4, COL.black);
      for (const sx of [-1.45, 1.35]) for (const sz of [-0.95, 0.95]) { cylAxis(M.paint, ux + sx, 0.42, fz + sz, 0.42, 0.28, "z", COL.rubber, 14); cylAxis(M.steel, ux + sx, 0.42, fz + sz + Math.sign(sz) * 0.15, 0.22, 0.03, "z", COL.galv, 10); }
      }; rig(); rigB = B; B = mainB;
      colBox(FX - 4.6, FZ - 1.4, FX + 4.7, FZ + 1.4); colBox(FX + 7 - 2.5, FZ - 1.1, FX + 7 + 2.5, FZ + 1.1);
      sign("TRANSPORT", "Horses to the races", FX - 0.4, 3.9, FZ + 3.2, 2.2, 0.55, 0, "#223a2e");
      bx(M.wood, FX - 1.1, 0, FZ + 3.12, FX - 1.0, 3.5, FZ + 3.22, 0x6b5238, { grain: true }); bx(M.wood, FX + 0.2, 0, FZ + 3.12, FX + 0.3, 3.5, FZ + 3.22, 0x6b5238, { grain: true });
      pts.push({ id: "travel", x: FX - 0.2, z: FZ + 5.3, r: 3.0, text: "E — Horse float" });
    };
    // ============================================================ EXERCISE OVAL: rails, furlong poles, starting gates, timing hut
    const stadium = (r, t) => {                     // point at parameter t∈[0,1) on a stadium offset r from the centreline (straights ±60 m, semicircles about x = ±60)
      const c = L.track, st = 120, arc = Math.PI * r, per = 2 * st + 2 * arc, d = ((t % 1) + 1) % 1 * per;
      if (d < st) return [-60 + d, c.cz - r, 0, -1];                                                              // north straight, heading east
      if (d < st + arc) { const a = (d - st) / r; return [60 + Math.sin(a) * r, c.cz - Math.cos(a) * r, Math.cos(a), Math.sin(a)]; }
      if (d < 2 * st + arc) return [60 - (d - st - arc), c.cz + r, -1, 0];
      const a = (d - 2 * st - arc) / r; return [-60 - Math.sin(a) * r, c.cz + Math.cos(a) * r, -Math.cos(a), -Math.sin(a)];
    };
    const track = () => {
      const c = L.track, rails = [[c.r0, 1.0, false], [c.r1, 1.0, true]];
      for (const [r, tint, outer] of rails) {
        const per = 240 + 2 * Math.PI * r, n = Math.round(per / 3), pts2 = []; for (let i = 0; i <= n; i++) pts2.push(stadium(r, i / n));
        for (let i = 0; i < n; i++) { const a = pts2[i], b = pts2[i + 1], mx = (a[0] + b[0]) / 2;
          const gateGap = outer && a[1] < c.cz - 20 && mx > -11 && mx < -2;                       // an opening in the outer rail on the north straight
          if (!gateGap) { for (const y of [0.55, 1.05]) B.beam(M.wood, [a[0], y, a[1]], [b[0], y, b[1]], 0.1, 0.075, jit(0xe8e5da, 0.08, i * 3 + y * 10), { grain: true }); colSeg(a[0], a[1], b[0], b[1], 0.15); }
          if (!(gateGap && i > 0 && mx > -10.5 && mx < -2.5)) bx(M.wood, a[0] - 0.07, 0, a[1] - 0.07, a[0] + 0.07, 1.22, a[1] + 0.07, jit(0xe4e1d4, 0.1, i + 7), { grain: true }); }
      }
      bx(M.wood, -11.3, 0, c.cz - 27 - 0.1, -10.9, 1.5, c.cz - 27 + 0.1, 0xe4e1d4, { grain: true }); bx(M.wood, -2.1, 0, c.cz - 27 - 0.1, -1.7, 1.5, c.cz - 27 + 0.1, 0xe4e1d4, { grain: true });
      // furlong poles on the inner rail (striped), every ~100 m
      for (let k = 0; k < 4; k++) { const p = stadium(c.r0 - 0.6, k / 4 + 0.03); for (let s = 0; s < 4; s++) bx(M.paint, p[0] - 0.05, 1.0 + s * 0.28, p[1] - 0.05, p[0] + 0.05, 1.0 + (s + 1) * 0.28, p[1] + 0.05, s % 2 ? 0xf2f0e8 : 0xb53a30); bx(M.wood, p[0] - 0.06, 0, p[1] - 0.06, p[0] + 0.06, 1.0, p[1] + 0.06, 0xe4e1d4); }
      // starting-gate practice: a four-stall barrier unit across the north straight at x = -38 (open to the east)
      const gx = -38, gz0 = c.cz - c.r1 + 0.5, gz1 = c.cz - c.r0 - 0.5, w = (gz1 - gz0) / 4;
      for (let i = 0; i <= 4; i++) { const z = gz0 + i * w; bx(M.steel, gx - 1.2, 0.0, z - 0.05, gx + 1.2, 0.1, z + 0.05, COL.steel); for (const dx of [-1.15, -0.1, 1.1]) bx(M.steel, gx + dx - 0.045, 0, z - 0.045, gx + dx + 0.045, 2.05, z + 0.045, COL.galv); for (const y of [0.55, 1.05, 1.6, 2.0]) bx(i % 4 === 0 || i === 4 ? M.steel : M.rubber, gx - 1.15, y, z - 0.03, gx + 1.1, y + 0.08, z + 0.03, y > 1.5 ? COL.galv : 0x5a6268); }
      for (let i = 0; i < 4; i++) { const z = gz0 + (i + 0.5) * w; bx(M.steel, gx - 1.2, 2.0, z - w / 2, gx - 1.1, 2.08, z + w / 2, COL.galv); bx(M.rubber, gx - 1.15, 0.0, z - w / 2 + 0.05, gx - 1.05, 2.0, z + w / 2 - 0.05, 0x4a5258); B.beam(M.steel, [gx + 1.1, 0.1, z - w / 2 + 0.1], [gx + 1.1, 2.0, z - w / 2 + 0.1], 0.05, 0.05, COL.galv); }
      bx(M.steel, gx - 1.2, 2.04, gz0 - 0.05, gx + 1.1, 2.12, gz1 + 0.05, COL.galv); colBox(gx - 1.4, gz0 - 0.2, gx - 0.9, gz1 + 0.2);
      sign("GATE PRACTICE", "", gx + 0.0, 2.45, gz0 + 2 * w, 1.6, 0.34, Math.PI / 2, "#2b3f33");
      // timing hut + bench by the rail, with a post-and-rail tie-up
      const hx = -19, hz = c.cz - 27 - 4.6;
      bx(M.timber, hx - 1.8, 0, hz - 1.4, hx + 1.8, 2.3, hz + 1.4, 0x8a6a46, { tile: 1.8 }); colBox(hx - 1.9, hz - 1.5, hx + 1.9, hz + 1.5);
      B.quad(M.iron, [hx - 2.3, 2.9, hz - 1.9], [hx + 2.3, 2.9, hz - 1.9], [hx + 2.3, 2.1, hz + 2.2], [hx - 2.3, 2.1, hz + 2.2], COL.ironRed, [[0, 0], [4, 0], [4, 3], [0, 3]], [0, 1, 0.2]);
      bx(M.glass, hx - 1.2, 1.2, hz + 1.38, hx + 1.2, 1.9, hz + 1.42, 0x35505a); bx(M.paint, hx - 1.3, 1.1, hz + 1.4, hx + 1.3, 1.2, hz + 1.5, COL.white);
      sign("TIMING", "", hx, 2.5, hz + 1.5, 1.4, 0.32, 0, "#2b3f33");
      bx(M.wood, hx - 1.6, 0.45, hz + 2.0, hx + 1.6, 0.52, hz + 2.4, 0x6b5238, { grain: true }); for (const dx of [-1.4, 1.4]) bx(M.wood, hx + dx - 0.05, 0, hz + 2.1, hx + dx + 0.05, 0.45, hz + 2.3, 0x6b5238);
    };
    // ============================================================ PADDOCKS: post-and-rail fences, gates, troughs, shelter
    const fenceLine = (xa, za, xb, zb, o2) => {
      o2 = o2 || {}; const len = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(len / 3)), ux = (xb - xa) / len, uz = (zb - za) / len, h = 1.3, r = W.rng(Math.round(xa * 13 + za * 7 + len));
      const inGap = t => o2.gap && t > o2.gap[0] && t < o2.gap[1];
      for (let i = 0; i <= n; i++) { const t = i / n * len, px = xa + ux * t, pz = za + uz * t; if (inGap(t)) continue; const g0 = gy(px, pz), hh = h + (r() - 0.5) * 0.12;
        bx(M.wood, px - 0.075, g0 - 0.25, pz - 0.075, px + 0.075, g0 + hh, pz + 0.075, jit(o2.col || 0x9c9484, 0.28, Math.round(px * 3 + pz)), { grain: true });
        if (i < n) { const t2 = (i + 1) / n * len, qx = xa + ux * t2, qz = za + uz * t2, g1 = gy(qx, qz); if (inGap((t + t2) / 2)) continue; for (const y of [0.45, 0.82, 1.17]) B.beam(M.wood, [px, g0 + y + (r() - 0.5) * 0.02, pz], [qx, g1 + y + (r() - 0.5) * 0.02, qz], 0.12, 0.045, jit(o2.col || 0xa59d8c, 0.3, Math.round(px + pz + y * 10)), { grain: true }); } }
      if (!o2.noCol) { if (o2.gap) { colSeg(xa, za, xa + ux * o2.gap[0], za + uz * o2.gap[0], 0.15); colSeg(xa + ux * o2.gap[1], za + uz * o2.gap[1], xb, zb, 0.15); } else colSeg(xa, za, xb, zb, 0.15); }
    };
    const gate = (x, z, ang, w) => {   // galvanised pipe gate hung from a heavy post, closed across the opening (ang = direction of the opening)
      const ux = Math.cos(ang), uz = Math.sin(ang), a = [x, z], b2 = [x + ux * w, z + uz * w], g0 = gy(x, z), g1 = gy(b2[0], b2[1]);
      for (const y of [0.35, 0.7, 1.05, 1.4]) B.beam(M.steel, [a[0], g0 + y, a[1]], [b2[0], g1 + y, b2[1]], 0.05, 0.05, COL.galv);
      B.beam(M.steel, [a[0], g0 + 0.35, a[1]], [b2[0], g1 + 1.4, b2[1]], 0.04, 0.04, COL.galv);
      for (let k = 0; k <= 4; k++) { const px = a[0] + ux * w * k / 4, pz = a[1] + uz * w * k / 4, g = gy(px, pz); bx(M.steel, px - 0.025, g + 0.35, pz - 0.025, px + 0.025, g + 1.4, pz + 0.025, COL.galv); }
      for (const [p, g] of [[a, g0], [b2, g1]]) bx(M.wood, p[0] - 0.11, g - 0.25, p[1] - 0.11, p[0] + 0.11, g + 1.6, p[1] + 0.11, 0x7a6a56, { grain: true });
    };
    const trough = (x, z, ry) => { const g = gy(x, z); bx(M.concrete, x - 1.1, g - 0.1, z - 0.3, x + 1.1, g + 0.62, z + 0.3, 0xb5b2aa, { ry, tile: 1.6 }); B.box(M.water, x, g + 0.56, z, 1.9, 0.02, 0.5, 0x486f78, { ry, noBottom: true }); };
    const paddocks = () => {
      // each paddock's gate sits on its south side, toward the lanes from the courtyard / drive; t = distance along the side from its start corner
      const GATES = [{ t: [42.4, 46.0], x: 50, z: -22 }, { t: [28.2, 31.8], x: -1.8, z: -40 }, { t: [4.0, 7.6], x: -47.6, z: -26 }];
      L.paddocks.forEach((p, k) => {
        const sides = [[p.x0, p.z0, p.x1, p.z0], [p.x1, p.z0, p.x1, p.z1], [p.x1, p.z1, p.x0, p.z1], [p.x0, p.z1, p.x0, p.z0]];
        sides.forEach((s2, i) => fenceLine(s2[0], s2[1], s2[2], s2[3], i === 2 ? { gap: GATES[k].t } : {}));
        gate(GATES[k].x, GATES[k].z, 0, 3.6); colSeg(GATES[k].x, GATES[k].z, GATES[k].x + 3.6, GATES[k].z, 0.12);
      });
      const e = L.paddocks[0], n = L.paddocks[1], w = L.paddocks[2];
      trough(e.x0 + 4.5, e.z1 - 10, Math.PI / 2); trough(n.x1 - 8, n.z1 - 3.0, 0); trough(w.x1 - 3.5, w.z0 + 14, Math.PI / 2);
      // shelter in the north paddock: three timber walls, skillion iron roof
      const sx = -2, sz = -62; bx(M.timber, sx - 3.2, 0, sz - 2.0, sx + 3.2, 2.5, sz - 1.8, 0x8a6a46, { tile: 1.8 }); bx(M.timber, sx - 3.2, 0, sz - 2.0, sx - 3.0, 2.5, sz + 1.6, 0x8a6a46, { tile: 1.8 }); bx(M.timber, sx + 3.0, 0, sz - 2.0, sx + 3.2, 2.5, sz + 1.6, 0x8a6a46, { tile: 1.8 });
      B.quad(M.iron, [sx - 3.7, 2.9, sz - 2.4], [sx + 3.7, 2.9, sz - 2.4], [sx + 3.7, 2.3, sz + 2.1], [sx - 3.7, 2.3, sz + 2.1], COL.ironGrey, [[0, 0], [6, 0], [6, 4], [0, 4]], [0, 1, 0.2]); for (const dx of [-3.1, 3.1]) bx(M.wood, sx + dx - 0.08, 0, sz + 1.5, sx + dx + 0.08, 2.35, sz + 1.66, 0x6b5238, { grain: true });
      colBox(sx - 3.4, sz - 2.2, sx + 3.4, sz + 1.8);
      // hay feeder rings (steel) and a few round bales
      for (const [fx, fz] of [[e.x0 + 12, e.z0 + 12], [n.x0 + 10, n.z0 + 10], [w.x0 + 14, w.z1 - 12]]) { const g = gy(fx, fz); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; bx(M.steel, fx + Math.cos(a) * 1.2 - 0.03, g - 0.1, fz + Math.sin(a) * 1.2 - 0.03, fx + Math.cos(a) * 1.2 + 0.03, g + 1.0, fz + Math.sin(a) * 1.2 + 0.03, COL.galv); } B.cyl(M.straw, fx, g - 0.05, fz, 1.0, 0.95, 0xcdb165, 12, { tile: 1.2 }); }
    };
    // ============================================================ COURTYARD FURNITURE, SIGN ARCH, BOUNDARY, GATE
    const courtyard = () => {
      // fig tree bed (sleeper ring), bench, trough, hitching rails, mounting block, lamps, barrow
      const fx = -12, fz = 3, rr = 3.3, n = 16;
      for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU; B.beam(M.wood, [fx + Math.cos(a0) * rr, 0.22, fz + Math.sin(a0) * rr], [fx + Math.cos(a1) * rr, 0.22, fz + Math.sin(a1) * rr], 0.24, 0.45, jit(COL.sleeper, 0.2, i + 3), { grain: true }); }
      B.cyl(M.straw, fx, 0.0, fz, rr - 0.14, 0.38, 0x6a5238, 16, { tile: 1.6 }); colSeg(fx, fz, fx, fz, 3.5);
      for (const a of [0.6, 2.4, 4.3]) { const bxp = fx + Math.cos(a) * (rr + 0.7), bzp = fz + Math.sin(a) * (rr + 0.7); bx(M.wood, bxp - 0.9, 0.42, bzp - 0.2, bxp + 0.9, 0.5, bzp + 0.2, 0x7a634a, { ry: -a, grain: true }); bx(M.wood, bxp - 0.7, 0, bzp - 0.15, bxp - 0.6, 0.42, bzp + 0.15, 0x5f4a34, { ry: -a }); bx(M.wood, bxp + 0.6, 0, bzp - 0.15, bxp + 0.7, 0.42, bzp + 0.15, 0x5f4a34, { ry: -a }); }
      trough(9.5, 1.5, 0); colBox(8.3, 1.0, 10.7, 2.0);
      for (const [a, b2] of [[-9, -3], [3, 9]]) { fenceLine(a, -16.4, b2, -16.4, { noCol: true, col: 0x7a6a56 }); }
      bx(M.concrete, -5.5, 0, -14.6, -4.3, 0.2, -13.8, 0xb5b2aa); bx(M.concrete, -5.5, 0.2, -14.6, -4.9, 0.4, -13.8, 0xb5b2aa);
      for (const [lx, lz] of [[-12, -12], [12, -12], [0, 6.3]]) { bx(M.steel, lx - 0.05, 0, lz - 0.05, lx + 0.05, 3.6, lz + 0.05, COL.steel); bx(M.steel, lx - 0.25, 3.6, lz - 0.25, lx + 0.25, 3.72, lz + 0.25, COL.steel); bx(M.paint, lx - 0.16, 3.4, lz - 0.16, lx + 0.16, 3.6, lz + 0.16, 0xe8dcb8); }
      // barrow, hay bales and feed bins along the verandah, buckets
      bx(M.steel, 12.0, 0.35, -17.8, 12.7, 0.55, -16.6, 0x2f6f8f); bx(M.wood, 11.2, 0.4, -17.5, 12.0, 0.46, -17.4, 0x6b5238); bx(M.wood, 11.2, 0.4, -17.0, 12.0, 0.46, -16.9, 0x6b5238); cylAxis(M.rubber, 12.8, 0.18, -17.2, 0.18, 0.08, "z", COL.rubber, 10);
      for (let y = 0; y < 2; y++) for (let ix = 0; ix < 3; ix++) bx(M.straw, -13.7 + ix * 1.0, 0.13 + y * 0.46, -20.4, -12.8 + ix * 1.0, 0.13 + (y + 1) * 0.46 - 0.02, -19.9, jit(COL.straw, 0.3, ix + y * 9), { tile: 0.9 });
      // sign arch at the south of the courtyard
      const az = 7.9;
      for (const sx of [-3.4, 3.4]) { bx(M.wood, sx - 0.16, 0, az - 0.16, sx + 0.16, 3.7, az + 0.16, 0x6b5238, { grain: true }); colBox(sx - 0.25, az - 0.25, sx + 0.25, az + 0.25); }
      bx(M.wood, -3.7, 3.55, az - 0.16, 3.7, 3.9, az + 0.16, 0x6b5238, { grain: true }); B.quad(M.iron, [-3.9, 3.95, az - 0.5], [3.9, 3.95, az - 0.5], [3.9, 3.9, az + 0.6], [-3.9, 3.9, az + 0.6], COL.ironGreen, [[0, 0], [6, 0], [6, 1], [0, 1]], [0, 1, 0]);
      sign(o.stableName || "Southern Cross Stable", "Training & racing · est. 2026", 0, 2.85, az + 0.0, 4.4, 1.0, 0, "#223a2e"); for (const sx of [-2.1, 2.1]) bx(M.steel, sx - 0.02, 2.2, az - 0.1, sx + 0.02, 3.55, az - 0.06, COL.steel);
    };
    const boundary = () => {
      const fx = L.fence.x, fz = L.fence.z, g = L.gate;
      const lines = [], post = (x, z, big) => { const g = gy(x, z); if (big) bx(M.wood, x - 0.13, g - 0.25, z - 0.13, x + 0.13, g + 1.7, z + 0.13, 0x7a6a56, { grain: true }); else bx(M.steel, x - 0.025, g - 0.2, z - 0.025, x + 0.025, g + 1.35, z + 0.025, COL.steel); };
      const run = (xa, za, xb, zb, skip) => { const len = Math.hypot(xb - xa, zb - za), n = Math.round(len / 10); for (let i = 0; i <= n; i++) { const x = xa + (xb - xa) * i / n, z = za + (zb - za) * i / n; if (skip && skip(x, z)) continue; post(x, z, i === 0 || i === n); }
        for (const y of [0.35, 0.65, 0.95, 1.3]) for (let i = 0; i < n; i++) { const x0 = xa + (xb - xa) * i / n, z0 = za + (zb - za) * i / n, x1 = xa + (xb - xa) * (i + 1) / n, z1 = za + (zb - za) * (i + 1) / n; if (skip && skip((x0 + x1) / 2, (z0 + z1) / 2)) continue; lines.push(x0, gy(x0, z0) + y, z0, x1, gy(x1, z1) + y, z1); } };
      run(-fx, -fz, fx, -fz); run(-fx, fz, fx, fz); run(-fx, -fz, -fx, fz); run(fx, -fz, fx, fz, (x, z) => z > g.z - 3.2 && z < g.z + 3.4);
      // entrance: brick pillars, an open steel farm gate, stable name board, letterbox, drive-in sign
      for (const dz of [-3.2, 3.4]) { bx(M.brick, fx - 0.4, 0, g.z + dz - 0.4, fx + 0.4, 2.0, g.z + dz + 0.4, 0xffffff, { tile: 1.2 }); bx(M.concrete, fx - 0.5, 2.0, g.z + dz - 0.5, fx + 0.5, 2.12, g.z + dz + 0.5, 0xbdbab2); colBox(fx - 0.5, g.z + dz - 0.5, fx + 0.5, g.z + dz + 0.5); }
      for (const y of [0.4, 0.8, 1.2, 1.6]) B.beam(M.steel, [fx - 0.5, y, g.z - 3.1], [fx - 3.3, y, g.z - 5.4], 0.05, 0.05, COL.galv); B.beam(M.steel, [fx - 0.5, 0.4, g.z - 3.1], [fx - 3.3, 1.6, g.z - 5.4], 0.04, 0.04, COL.galv);
      for (const y of [0.4, 0.8, 1.2, 1.6]) B.beam(M.steel, [fx - 0.5, y, g.z + 3.3], [fx - 3.3, y, g.z + 5.6], 0.05, 0.05, COL.galv); B.beam(M.steel, [fx - 0.5, 0.4, g.z + 3.3], [fx - 3.3, 1.6, g.z + 5.6], 0.04, 0.04, COL.galv);
      sign(o.stableName || "Southern Cross Stable", "Private training establishment", fx - 0.55, 1.2, g.z - 6.4, 2.6, 0.7, Math.PI / 2, "#223a2e"); bx(M.wood, fx - 0.7, 0, g.z - 7.8, fx - 0.5, 1.7, g.z - 7.6, 0x6b5238); bx(M.wood, fx - 0.7, 0, g.z - 5.0, fx - 0.5, 1.7, g.z - 4.8, 0x6b5238);
      bx(M.steel, fx - 1.4, 0, g.z + 6.9, fx - 1.34, 1.1, g.z + 6.96, COL.steel); bx(M.paint, fx - 1.6, 1.1, g.z + 6.7, fx - 1.1, 1.38, g.z + 7.3, 0x2f6f8f);
      const arr = new Float32Array(lines), geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(arr, 3)); const lm = new THREE.LineBasicMaterial({ color: 0x4d5256, transparent: true, opacity: 0.8 });
      const ls = new THREE.LineSegments(geo, lm); ls.frustumCulled = false; scene.add(ls); owned.geo.push(geo); owned.mat.push(lm);
    };
    stable(); house(); feedShed(); vetBay(); floatAndUte(); track(); paddocks(); courtyard(); boundary();
    const meshes = B.flush(scene, true, true);
    const rigGroup = new THREE.Group(); rigGroup.position.set(L.float.x, 0, L.float.z); scene.add(rigGroup);
    const rigIn = new THREE.Group(); rigIn.position.set(-24, 0, -24); rigGroup.add(rigIn); for (const m of rigB.flush(rigIn, true, true)) { if (m.material === M.glass) m.castShadow = false; meshes.push(m); }       // (window glass casts no shadow: one less shadow draw call)
    { const rg = new THREE.BoxGeometry(2.12, 0.07, 2.0); rg.translate(-1.06, 0, 0); const rm = new THREE.Mesh(rg, M.timber); rm.castShadow = false; rm.receiveShadow = true;
      const hinge = new THREE.Group(); hinge.position.set(24 - 2.8, 0.72, 24); hinge.rotation.z = 0.296; hinge.add(rm); rigIn.add(hinge); rigGroup.userData.ramp = hinge; owned.geo.push(rg); }
    return { colliders: col, segs: seg, points: pts, stalls, meshes, owned, stadium, rig: rigGroup };
  }
  return { build, COL };
})();
