'use strict';
/* =====================================================================
   FINAL FURLONG — PEOPLE: the player's character (a rigged, skinned humanoid — rebuilt in Phase 9b)
   A real skeleton (23 bones: hips, spine, chest, neck, head, clavicles, arms, forearms, hands, fingers, thighs, shins, feet, toes) drives ONE skinned mesh
   (one draw call, one material, vertex colours): a believable young Australian stable owner / jockey, ~1.78 m, with anatomical proportions — shaped shoulders,
   deltoids, forearms, hands with fingers, a chest, waist and hips, thighs and calves — and a simple but real face (brow, eyes with lids, nose, lips, chin, ears) and hair
   that follows the skull. Clothes are part of the body surface (one continuous skin with colours and fitted details): work shirt with rolled sleeves, jeans,
   boots and an akubra / riding gear with a helmet / race-day jacket. All limbs are single continuous tubes weighted across their joints, so knees, elbows and
   the neck bend smoothly without gaps. Appearance (saved in C.player) is unchanged: look {head, hair, hairCol, skin, build}, outfit, colours {shirt, trousers, boots}.
   Animation is procedural on the bones: walk / run with foot roll, counter-rotating shoulders, breathing idle with looks and weight shifts, and the horse-work actions
   (brush, feed, pat, inspect, tack, lead, wave, drive) with the brush and the feed bucket as props. Nothing here touches the race.
   ===================================================================== */
const FARMPEOPLE = (() => {
  const SKINS = ["#f1d2b6", "#e0b48c", "#c68e6b", "#a06a48", "#7b4a30", "#523020"], HAIRS = ["#15110d", "#3a2616", "#6b4423", "#a9743a", "#c9a45c", "#8d8a85", "#7a2e1d"];
  const HAIR_STYLES = ["Short crop", "Side part", "Ponytail", "Shoulder length", "Cap of curls", "Bald"], FACES = ["Round", "Oval", "Square", "Narrow", "Broad"];
  const OUTFITS = [["stable", "Stable wear"], ["training", "Riding gear"], ["raceday", "Race day"]];
  const BUILDS = [-1, -0.5, 0, 0.5, 1];
  const DEFAULT = () => ({ look: { head: 1, hair: 0, hairCol: "#3a2616", skin: "#e0b48c", build: 0 }, outfit: "stable", colours: { shirt: "#2e5e8a", trousers: "#3a3a40", boots: "#4a2e1a" } });
  const TAU = Math.PI * 2, clampN = (v, a, b) => Math.max(a, Math.min(b, v)), sstep = t => { t = clampN(t, 0, 1); return t * t * (3 - 2 * t); };
  const _c = new THREE.Color(), _lin = new Map();
  const lin = hex => { let v = _lin.get(hex); if (!v) { _c.set(hex).convertSRGBToLinear(); v = [_c.r, _c.g, _c.b]; _lin.set(hex, v); } return v; };
  const mixHex = (a, b, t) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  const shade = (a, t) => mixHex(a, t < 0 ? "#000000" : "#ffffff", Math.abs(t));

  // ---------------------------------------------------------------- the skeleton (rest pose: standing, arms down, facing +z); [name, parent, x, y, z] relative to the parent
  const BDEF = [["hips", -1, 0, .93, 0], ["spine", 0, 0, .11, 0], ["chest", 1, 0, .16, 0], ["neck", 2, 0, .28, 0], ["head", 3, 0, .08, 0],
    ["clavL", 2, -.06, .20, 0], ["uarmL", 5, -.13, .02, 0], ["farmL", 6, 0, -.29, 0], ["handL", 7, 0, -.26, 0], ["fingL", 8, 0, -.075, 0],
    ["clavR", 2, .06, .20, 0], ["uarmR", 10, .13, .02, 0], ["farmR", 11, 0, -.29, 0], ["handR", 12, 0, -.26, 0], ["fingR", 13, 0, -.075, 0],
    ["thighL", 0, -.092, -.02, 0], ["shinL", 15, 0, -.43, 0], ["footL", 16, 0, -.40, 0], ["toeL", 17, 0, -.04, .13],
    ["thighR", 0, .092, -.02, 0], ["shinR", 19, 0, -.43, 0], ["footR", 20, 0, -.40, 0], ["toeR", 21, 0, -.04, .13]];
  const BI = {}; BDEF.forEach((b, i) => { BI[b[0]] = i; });

  // ---------------------------------------------------------------- geometry kit: everything is appended to one builder (positions, normals, colours, 4 bone indices + weights, skin flag)
  const newB = () => ({ P: [], N: [], C: [], SI: [], SW: [], S: [], I: [], nv: 0 });
  function emit(b, pos, nor, idx, colOf, wOf, skinOf) {
    const base = b.nv, n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; b.P.push(x, y, z); b.N.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
      const c = colOf(i); b.C.push(c[0], c[1], c[2]); b.S.push(skinOf ? skinOf(i) : 0);
      let w = wOf(x, y, z); if (w.length > 4) { w = w.slice().sort((p, q) => q[1] - p[1]).slice(0, 4); } let sum = 0; for (const q of w) sum += q[1]; if (sum <= 0) { w = [[0, 1]]; sum = 1; }
      for (let k = 0; k < 4; k++) { if (k < w.length) { b.SI.push(w[k][0]); b.SW.push(w[k][1] / sum); } else { b.SI.push(0); b.SW.push(0); } }
    }
    for (let i = 0; i < idx.length; i++) b.I.push(base + idx[i]); b.nv += n;
  }
  const W1 = bone => () => [[bone, 1]];
  function chainW(axis, knots) {                                         // knots [[u, bone]]: full weight at each knot, smooth blend between neighbours (symmetric 50/50 at the joint)
    const ks = knots.slice().sort((a, b) => a[0] - b[0]), n = ks.length;
    return (x, y, z) => { const u = axis === "y" ? y : z; if (u <= ks[0][0]) return [[ks[0][1], 1]]; for (let i = 0; i < n - 1; i++) if (u <= ks[i + 1][0]) { if (ks[i][1] === ks[i + 1][1]) return [[ks[i][1], 1]]; const t = sstep((u - ks[i][0]) / (ks[i + 1][0] - ks[i][0])); return [[ks[i][1], 1 - t], [ks[i + 1][1], t]]; } return [[ks[n - 1][1], 1]]; };
  }
  function normalsOf(pos, idx) {
    const n = new Float32Array(pos.length);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b2 = idx[t + 1] * 3, c = idx[t + 2] * 3, ux = pos[b2] - pos[a], uy = pos[b2 + 1] - pos[a + 1], uz = pos[b2 + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const q of [a, b2, c]) { n[q] += nx; n[q + 1] += ny; n[q + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; } return n;
  }
  // a (nc × nr) grid; posFn(i, j) → [x, y, z]; columns wrap round; winding follows the y-up convention (flip for z-axis lofts and downward profiles)
  function gridGeo(nc, nr, posFn, flip) {
    const pos = new Float32Array(nc * nr * 3), idx = [];
    for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) { const p = posFn(i, j); pos.set(p, (j * nc + i) * 3); }
    for (let j = 0; j < nr - 1; j++) for (let i = 0; i < nc; i++) { const a = j * nc + i, b2 = j * nc + (i + 1) % nc, c = (j + 1) * nc + i, d = (j + 1) * nc + (i + 1) % nc; if (flip) idx.push(a, b2, c, b2, d, c); else idx.push(a, c, b2, b2, c, d); }
    return { pos, idx, nor: null };
  }
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
  function xform(g, M) { if (!M) return; _nm.getNormalMatrix(M); for (let i = 0; i < g.pos.length; i += 3) { _v.set(g.pos[i], g.pos[i + 1], g.pos[i + 2]).applyMatrix4(M); g.pos[i] = _v.x; g.pos[i + 1] = _v.y; g.pos[i + 2] = _v.z; _n.set(g.nor[i], g.nor[i + 1], g.nor[i + 2]).applyMatrix3(_nm).normalize(); g.nor[i] = _n.x; g.nor[i + 1] = _n.y; g.nor[i + 2] = _n.z; } }
  // a smooth tube through rings: [u, a, b, o1, o2, hex]; axis "y": (o1 + a·cos, u, o2 + b·sin)  axis "z": (o1 + a·cos, o2 + b·sin, u). o: { seg, axis, cap: "top"|"bot"|"both", w, M, skin, hex, flip }
  function loft(b, rings, o) {
    const seg = o.seg || 16, axis = o.axis || "y", nr = rings.length, hexOf = j => rings[j][5] || o.hex || "#888888";
    const g = gridGeo(seg, nr, (i, j) => { const r = rings[j], t = i / seg * TAU, c = Math.cos(t), s = Math.sin(t); return axis === "y" ? [(r[3] || 0) + r[1] * c, r[0], (r[4] || 0) + r[2] * s] : [(r[3] || 0) + r[1] * c, (r[4] || 0) + r[2] * s, r[0]]; }, !!o.flip !== (axis === "z"));
    g.nor = normalsOf(g.pos, g.idx); xform(g, o.M);
    const skinOf = o.skin ? (i => hexOf((i / seg) | 0) === o.skin ? 1 : 0) : null;
    emit(b, g.pos, g.nor, g.idx, i => lin(hexOf((i / seg) | 0)), o.w, skinOf);
    const capAt = (j, from) => {                                                            // a fan closing one end, wound to face away from the tube
      const r = rings[j], p = [], idx = [], nor = []; const ctr = axis === "y" ? [r[3] || 0, r[0], r[4] || 0] : [r[3] || 0, r[4] || 0, r[0]]; p.push(...ctr);
      for (let i = 0; i < seg; i++) { const t = i / seg * TAU, c = Math.cos(t), s = Math.sin(t); p.push(...(axis === "y" ? [(r[3] || 0) + r[1] * c, r[0], (r[4] || 0) + r[2] * s] : [(r[3] || 0) + r[1] * c, (r[4] || 0) + r[2] * s, r[0]])); }
      const q = rings[from], d = axis === "y" ? [0, Math.sign(r[0] - q[0]) || 1, 0] : [0, 0, Math.sign(r[0] - q[0]) || 1];
      for (let i = 0; i < seg; i++) { const a = 1 + i, b2 = 1 + (i + 1) % seg; const ax = p[a * 3] - p[0], ay = p[a * 3 + 1] - p[1], az = p[a * 3 + 2] - p[2], bx = p[b2 * 3] - p[0], by = p[b2 * 3 + 1] - p[1], bz = p[b2 * 3 + 2] - p[2]; const dot = (ay * bz - az * by) * d[0] + (az * bx - ax * bz) * d[1] + (ax * by - ay * bx) * d[2]; if (dot >= 0) idx.push(0, a, b2); else idx.push(0, b2, a); }
      for (let i = 0; i <= seg; i++) nor.push(d[0], d[1], d[2]); const cg = { pos: new Float32Array(p), idx, nor: new Float32Array(nor) }; xform(cg, o.M);
      emit(b, cg.pos, cg.nor, cg.idx, () => lin(hexOf(j)), o.w, o.skin ? (() => hexOf(j) === o.skin ? 1 : 0) : null);
    };
    if (o.cap === "top" || o.cap === "both") capAt(nr - 1, nr - 2); if (o.cap === "bot" || o.cap === "both") capAt(0, 1);
  }
  // a strip on the torso's front surface between two polylines of [x, y] points (placket, lapels, collar edges)
  function ribbon(b, A0, B0, hex, w, lift, isSkin) {
    const sub = (P) => { const o = []; for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < 5; k++) o.push([P[i][0] + (P[i + 1][0] - P[i][0]) * k / 5, P[i][1] + (P[i + 1][1] - P[i][1]) * k / 5]); o.push(P[P.length - 1]); return o; }, A = sub(A0), B = sub(B0);
    const n = A.length, pos = [], idx = [], zOf = (x, y) => { const r = lerpTable(TORSO, y); return r[3] + r[2] * Math.sqrt(Math.max(0, 1 - (x / r[1]) * (x / r[1]))) + (lift || 0.003); };
    for (let i = 0; i < n; i++) for (const P of [A[i], B[i]]) pos.push(P[0], P[1], zOf(P[0], P[1]));
    for (let i = 0; i < n - 1; i++) { const a = i * 2, b2 = i * 2 + 1, c = a + 2, d = b2 + 2; idx.push(a, c, b2, b2, c, d); }
    const f = Float32Array.from(pos), nor = normalsOf(f, idx); for (let i = 0; i < nor.length; i += 3) if (nor[i + 2] < 0) { nor[i] = -nor[i]; nor[i + 1] = -nor[i + 1]; nor[i + 2] = -nor[i + 2]; }
    const c = lin(hex); emit(b, f, nor, idx, () => c, w, isSkin ? () => 1 : null);
  }
  const geoCache = {};
  function unit(kind) {
    if (geoCache[kind]) return geoCache[kind];
    const g = kind === "sphere" ? new THREE.SphereGeometry(1, 10, 7) : kind === "sphereLo" ? new THREE.SphereGeometry(1, 7, 5) : kind === "box" ? new THREE.BoxGeometry(1, 1, 1) : new THREE.CylinderGeometry(1, 1, 1, 10, 1);
    const r = { pos: Float32Array.from(g.attributes.position.array), nor: Float32Array.from(g.attributes.normal.array), idx: Array.from(g.index.array) }; g.dispose(); return (geoCache[kind] = r);
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const xf = (x, y, z, sx, sy, sz, rx, ry, rz) => { _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(x || 0, y || 0, z || 0), _q, _s.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz)); };
  function prim(b, kind, M, hex, w, skin) { const u = unit(kind), g = { pos: Float32Array.from(u.pos), nor: Float32Array.from(u.nor), idx: u.idx }; xform(g, M); const c = lin(hex); emit(b, g.pos, g.nor, g.idx, () => c, w, skin ? () => 1 : null); }
  const ell = (b, cx, cy, cz, rx, ry, rz, hex, w, o) => { o = o || {}; prim(b, o.lo ? "sphereLo" : "sphere", xf(cx, cy, cz, rx, ry, rz, o.rx, o.ry, o.rz), hex, w, o.skin); };
  const box = (b, cx, cy, cz, sx, sy, sz, hex, w, o) => { o = o || {}; prim(b, "box", xf(cx, cy, cz, sx, sy, sz, o.rx, o.ry, o.rz), hex, w); };
  const lerpTable = (T, y) => { if (y <= T[0][0]) return T[0].slice(); for (let i = 0; i < T.length - 1; i++) if (y <= T[i + 1][0]) { const t = (y - T[i][0]) / (T[i + 1][0] - T[i][0]); return T[i].map((v, k) => v + (T[i + 1][k] - v) * t); } return T[T.length - 1].slice(); };

  // ---------------------------------------------------------------- body tables (world coordinates of the rest pose): [y, rx, rz, oz]
  const TORSO = [[.80, .126, .078, -.010], [.85, .176, .090, -.016], [.90, .190, .100, -.015], [.97, .172, .108, -.006], [1.03, .147, .099, 0], [1.11, .148, .098, .004], [1.19, .158, .106, .010], [1.27, .171, .115, .016], [1.35, .178, .117, .014], [1.41, .174, .108, .006], [1.435, .164, .100, .002], [1.46, .140, .090, -.002], [1.485, .098, .072, -.004], [1.515, .056, .055, -.001], [1.545, .052, .053, .002], [1.58, .050, .052, -.004], [1.615, .046, .048, -.014]];
  const LEG = [[.075, .037, .039, 0], [.12, .040, .043, .001], [.22, .046, .050, -.003], [.36, .056, .063, -.010], [.44, .054, .058, -.004], [.50, .056, .060, .002], [.58, .066, .070, -.003], [.70, .082, .086, -.005], [.84, .090, .097, -.006], [.90, .087, .095, -.005], [.97, .085, .093, -.004]];
  const ARM = [[.885, .027, .031, 0], [.93, .032, .036, 0], [1.0, .040, .043, 0], [1.06, .044, .045, -.002], [1.13, .041, .043, -.006], [1.20, .046, .048, 0], [1.28, .049, .051, 0], [1.36, .054, .055, 0], [1.40, .054, .055, 0], [1.425, .046, .047, 0]];
  const HEAD = [[1.565, .034, .048, .060], [1.58, .056, .068, .044], [1.60, .070, .090, .018], [1.63, .076, .098, .008], [1.66, .078, .100, 0], [1.69, .077, .102, -.004], [1.72, .076, .103, -.006], [1.75, .072, .100, -.010], [1.78, .056, .086, -.014], [1.80, .028, .052, -.016]];

  // ---------------------------------------------------------------- make: the skeleton, the props, the first dressing
  function make(app) {
    const A = Object.assign(DEFAULT(), app || {}); A.look = Object.assign(DEFAULT().look, A.look || {}); A.colours = Object.assign(DEFAULT().colours, A.colours || {});
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const bones = BDEF.map(d => { const b = new THREE.Bone(); b.name = d[0]; b.position.set(d[2], d[3], d[4]); return b; }); BDEF.forEach((d, i) => { if (d[1] >= 0) bones[d[1]].add(bones[i]); }); body.add(bones[0]); body.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones), B = n => bones[BI[n]];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, skinning: true });
    const parts = { pelvis: B("hips"), torsoG: B("spine"), chest: B("chest"), neckG: B("neck"), headG: B("head"),
      legL: { hip: B("thighL"), knee: B("shinL"), ankle: B("footL"), toe: B("toeL") }, legR: { hip: B("thighR"), knee: B("shinR"), ankle: B("footR"), toe: B("toeR") },
      armL: { sh: B("uarmL"), el: B("farmL"), hand: B("handL"), fing: B("fingL"), clav: B("clavL") }, armR: { sh: B("uarmR"), el: B("farmR"), hand: B("handR"), fing: B("fingR"), clav: B("clavR") } };
    const o = { A, root, body, bones, skeleton, parts, mats: [mat], mat, meshes: {}, geos: [], phase: 0, speed: 0, idleT: 0, turn: 0, lean: 0, hip: 0.93, props: {}, action: null, idle: { t: 3, mode: "", gt: 0, dur: 2, dir: 1 }, dressed: [], blend: 0, mesh: null };
    o.apply = app2 => apply(o, app2); o.act = (name, opt) => act(o, name, opt); o.handPos = (side, out) => { const h = side === "L" ? parts.armL.hand : parts.armR.hand; h.updateWorldMatrix(true, false); return (out || new THREE.Vector3()).setFromMatrixPosition(h.matrixWorld).add(_v.set(0, -0.05, 0).transformDirection(h.matrixWorld).multiplyScalar(0.05)); };
    // props held in the right hand: a grooming brush and a feed bucket (hidden unless an action uses them)
    const pm = (g) => { o.geos.push(g); return g; };
    const brush = new THREE.Group(); { const bg = { P: [], N: [], C: [], SI: [], SW: [], S: [], I: [], nv: 0 }; box(bg, 0, -0.02, 0, 0.055, 0.03, 0.15, "#8a5a32", W1(0)); box(bg, 0, -0.045, 0, 0.05, 0.02, 0.135, "#d8cfb8", W1(0)); brush.add(new THREE.Mesh(pm(geoOf(bg)), plainMat(o))); }
    brush.position.set(0, -0.07, 0.03); brush.visible = false; parts.armR.hand.add(brush); o.props.brush = brush;
    const bucket = new THREE.Group(); { const bg = { P: [], N: [], C: [], SI: [], SW: [], S: [], I: [], nv: 0 }; loft(bg, [[-0.11, 0.1, 0.1], [0.0, 0.115, 0.115], [0.1, 0.13, 0.13]].map(r => r.concat([0, 0, "#2f6f8f"])), { seg: 14, cap: "bot", w: W1(0), flip: false }); loft(bg, [[0.08, 0.12, 0.12, 0, 0, "#b88a3a"], [0.085, 0.12, 0.12, 0, 0, "#b88a3a"]], { seg: 14, cap: "top", w: W1(0) });
      bucket.add(new THREE.Mesh(pm(geoOf(bg)), plainMat(o))); }
    bucket.position.set(0.0, -0.16, 0.18); bucket.visible = false; parts.armR.hand.add(bucket); o.props.bucket = bucket;
    apply(o, A); return o;
  }
  function plainMat(o) { if (!o.pmat) { o.pmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }); o.mats.push(o.pmat); } return o.pmat; }
  function geoOf(b) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(b.P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(b.N, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(b.C, 3)); g.setIndex(b.I); return g; }

  // ---------------------------------------------------------------- dressing: rebuild the one skinned mesh from the appearance and outfit
  function apply(o, app) {
    const A = o.A; if (app) { A.look = Object.assign(A.look, app.look || {}); A.colours = Object.assign(A.colours, app.colours || {}); if (app.outfit) A.outfit = app.outfit; }
    if (o.mesh) { if (o.mesh.parent) o.mesh.parent.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh = null; } o.meshes = {}; o.dressed.length = 0;
    const L = A.look, bld = 1 + (+L.build || 0) * 0.14; o.body.scale.set(bld, 1, bld * 0.96);
    const b = newB(); dress(b, A);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(b.P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(b.N, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(b.C, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(b.SI, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(b.SW, 4)); g.setIndex(new THREE.BufferAttribute(b.nv > 65000 ? Uint32Array.from(b.I) : Uint16Array.from(b.I), 1));
    const m = new THREE.SkinnedMesh(g, o.mat); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false; o.body.add(m); m.bind(o.skeleton, new THREE.Matrix4()); o.mesh = m; o.meshes = { body: m }; o.dressed.push(m); o.hip = 0.93;
  }

  function dress(b, A) {
    const L = A.look, C = A.colours, out = A.outfit, skin = L.skin, hair = L.hairCol, jacket = out === "raceday", tall = out !== "stable", train = out === "training";
    const shirt = train ? "#f2efe6" : C.shirt, trou = out === "stable" ? C.trousers : train ? "#d8c8a0" : "#f4f2ea", boot = out === "stable" ? C.boots : "#1c1917", glove = train ? "#2b2b2b" : jacket ? "#f3f1ea" : null, belt = "#3a2616";
    const lipC = mixHex(skin, "#a8484f", 0.55), dark = "#1b1713", browC = mixHex(hair, "#000000", 0.15);
    const ix = n => BI[n];
    // ---- torso (pelvis → shoulders → neck) as one continuous tube, coloured by region
    {
      const wT = chainW("y", [[0.80, ix("hips")], [0.93, ix("hips")], [1.06, ix("spine")], [1.18, ix("chest")], [1.45, ix("chest")], [1.50, ix("neck")], [1.545, ix("neck")], [1.585, ix("head")]]);
      const t = jacket ? 0.009 : 0, rings = [];
      const add = (y, dr, hex, extra) => { const r = lerpTable(TORSO, y); rings.push([y, r[1] + dr + (extra || 0), r[2] + dr * 0.8 + (extra || 0) * 0.7, 0, r[3], hex]); };
      add(0.80, 0, trou, 0); add(0.83, 0.002, trou);
      if (jacket) { add(0.834, 0.003, trou); add(0.83, 0.03, shirt); add(0.86, 0.022, shirt); add(0.91, 0.014, shirt); add(0.97, 0.012, shirt); } else { add(0.88, 0.002, trou); add(0.93, 0.003, trou); add(0.975, 0.003, trou); add(0.985, 0.009, belt); add(1.03, 0.009, belt); add(1.035, 0.004, shirt); }
      add(1.11, 0.004 + t, shirt); add(1.19, 0.004 + t, shirt); add(1.27, 0.004 + t, shirt); add(1.35, 0.003 + t, shirt); add(1.41, 0.002 + t, shirt); add(1.435, 0.002 + t, shirt); add(1.46, 0.002 + t, shirt); add(1.485, 0.002, shirt);
      const cw = jacket ? "#f2efe6" : shirt; rings.push([1.50, 0.071, 0.067, 0, -0.004, cw], [1.522, 0.066, 0.064, 0, -0.002, cw]); rings.push([1.526, 0.053, 0.054, 0, 0.002, skin]); add(1.545, 0, skin); add(1.58, 0, skin); add(1.615, 0, skin);
      rings.sort((p, q) => p[0] - q[0]); loft(b, rings, { seg: 24, cap: "both", w: wT, skin });
      // belt buckle, shirt placket, collar points, jacket lapels
      if (!jacket && out === "stable") { box(b, 0, 1.007, 0.108, 0.034, 0.026, 0.01, "#b8a05a", W1(ix("spine"))); }
      if (!jacket) { const vb = out === "stable" ? 1.37 : 1.43, ys = [1.04, 1.12, 1.2, 1.28, vb - 0.01]; ribbon(b, ys.map(y => [-0.009, y]), ys.map(y => [0.009, y]), shade(shirt, 0.1), chainW("y", [[1.06, ix("spine")], [1.18, ix("chest")]]));
        const vy = [1.505, (1.505 + vb) / 2, vb], wv = W1(ix("chest")); ribbon(b, [[-0.034, vy[0]], [-0.017, vy[1]], [0, vy[2]]], [[0.034, vy[0]], [0.017, vy[1]], [0, vy[2]]], skin, wv, 0.0035, true);
        for (const sx of [-1, 1]) ribbon(b, [[sx * 0.034, vy[0]], [sx * 0.017, vy[1]], [0, vy[2]]], [[sx * 0.047, vy[0] + 0.004], [sx * 0.026, vy[1]], [sx * 0.007, vy[2] - 0.004]], shade(shirt, 0.16), wv, 0.0045); }
      else { const ys = [0.99, 1.07, 1.15, 1.23, 1.31, 1.39, 1.47], wl = chainW("y", [[1.06, ix("spine")], [1.18, ix("chest")]]); for (const sx of [-1, 1]) ribbon(b, ys.map((y, i) => [sx * (0.006 + 0.002 * i), y]), ys.map((y, i) => [sx * (0.012 + 0.0085 * i), y]), shade(shirt, -0.12), wl, 0.004) }
    }
    // ---- legs: one tube per leg from the hip to the ankle, then the foot
    for (const sd of [-1, 1]) {
      const sx = sd, S = sd < 0 ? "L" : "R", wL = chainW("y", [[0.98, ix("hips")], [0.85, ix("thigh" + S)], [0.55, ix("thigh" + S)], [0.41, ix("shin" + S)], [0.14, ix("shin" + S)], [0.02, ix("foot" + S)]]), ox = sx * 0.092, rings = [];
      const add = (y, dr, hex) => { const r = lerpTable(LEG, y); rings.push([y, r[1] + dr, r[2] + dr, ox, r[3], hex]); };
      if (!tall) { add(0.075, 0.004, boot); add(0.11, 0.004, boot); add(0.19, 0.004, boot); add(0.194, 0.014, trou); add(0.22, 0.011, trou); add(0.28, 0.006, trou); [0.36, 0.5, 0.58, 0.7, 0.84, 0.90, 0.97].forEach(y => add(y, 0.003, trou)); }
      else { add(0.075, 0.004, boot); add(0.12, 0.005, boot); add(0.22, 0.006, boot); add(0.36, 0.008, boot); add(0.44, 0.006, boot); add(0.462, 0.005, boot); add(0.472, 0.013, boot); add(0.476, 0.004, trou); [0.5, 0.58, 0.7, 0.84, 0.90, 0.97].forEach(y => add(y, 0.001, trou)); }
      loft(b, rings, { seg: 18, cap: "top", w: wL });
      // the foot (a loft along z: heel → toe), a heel block and a sole
      const fz = [[-0.07, 0.034, 0.012, 0.105], [-0.04, 0.040, 0.006, 0.115], [0.0, 0.043, 0.004, 0.108], [0.06, 0.045, 0.004, 0.075], [0.12, 0.050, 0.004, 0.058], [0.18, 0.044, 0.004, 0.046], [0.215, 0.028, 0.006, 0.037]];
      const fr = fz.map(f => [f[0], f[1], (f[3] - f[2]) / 2, ox, (f[3] + f[2]) / 2, boot]); const wF = chainW("z", [[0.095, ix("foot" + S)], [0.155, ix("toe" + S)]]);
      loft(b, fr, { seg: 14, axis: "z", cap: "both", w: wF });
      box(b, ox, 0.014, -0.038, 0.066, 0.026, 0.07, "#161310", W1(ix("foot" + S))); box(b, ox, 0.005, 0.07, 0.074, 0.01, 0.2, "#161310", wF);
    }
    // ---- arms: shoulders (deltoids), sleeves, bare forearms or cuffs, hands and fingers
    for (const sd of [-1, 1]) {
      const sx = sd, S = sd < 0 ? "L" : "R", ox = sx * 0.19, wA = chainW("y", [[1.46, ix("chest")], [1.40, ix("uarm" + S)], [1.19, ix("uarm" + S)], [1.07, ix("farm" + S)], [0.93, ix("farm" + S)], [0.82, ix("hand" + S)]]), rings = [];
      const sleeve = jacket ? shirt : shirt, add = (y, dr, hex) => { const r = lerpTable(ARM, y); rings.push([y, r[1] + dr, r[2] + dr, ox, r[3], hex]); };
      if (jacket) { add(0.885, 0.006, "#f2efe6"); add(0.925, 0.012, "#f2efe6"); add(0.929, 0.008, sleeve); [1.0, 1.06, 1.13, 1.2, 1.28, 1.36, 1.40, 1.425].forEach(y => add(y, 0.007, sleeve)); }
      else if (train) { add(0.885, 0, skin); add(0.93, 0, skin); add(1.0, 0, skin); add(1.06, 0, skin); add(1.13, 0, skin); add(1.2, 0, skin); add(1.215, 0, skin); add(1.226, 0.007, shirt); add(1.28, 0.006, shirt); add(1.36, 0.005, shirt); add(1.40, 0.004, shirt); add(1.425, 0.004, shirt); }
      else { add(0.885, 0, skin); add(0.93, 0, skin); add(1.0, 0, skin); add(1.052, 0, skin); add(1.058, 0.011, shirt); add(1.095, 0.012, shirt); add(1.099, 0.007, shirt); [1.13, 1.2, 1.28, 1.36, 1.40, 1.425].forEach(y => add(y, 0.006, sleeve)); }
      const hs = glove || skin; if (glove) { rings[0][5] = glove; rings[1][5] = glove; if (rings[2][1] < 0.05) { /* gloved wrist */ } }
      loft(b, rings, { seg: 16, cap: "top", w: wA, skin });
      ell(b, ox - sx * 0.004, 1.402, 0, 0.054, 0.044, 0.052, shirt === "#f2efe6" && train ? shirt : (train ? shirt : sleeve), chainW("y", [[1.30, ix("uarm" + S)], [1.46, ix("chest")]]));
      // the hand: a palm (thin along x, wide along z), four fingers with a relaxed curl, and a thumb
      const wH = W1(ix("hand" + S)), wFi = chainW("y", [[0.775, ix("fing" + S)], [0.815, ix("hand" + S)]]), hand = hs, inward = -sx;
      loft(b, [[0.795, 0.014, 0.040, ox, 0.0, hand], [0.83, 0.017, 0.044, ox, 0.0, hand], [0.865, 0.016, 0.040, ox, 0.0, hand], [0.9, 0.022, 0.034, ox, 0, hand]], { seg: 12, cap: "bot", w: wH, skin: glove ? null : skin });
      [[0.029, 0.078], [0.010, 0.085], [-0.010, 0.079], [-0.027, 0.064]].forEach(([z, len]) => {
        const fr = [[-len, 0.0052, 0.0052, ox + inward * 0.030, z + 0.003, hand], [-len * 0.62, 0.0068, 0.0068, ox + inward * 0.022, z + 0.001, hand], [-len * 0.3, 0.0078, 0.0078, ox + inward * 0.008, z, hand], [0, 0.0085, 0.0085, ox, z, hand]].map(r => [r[0] + 0.80, ...r.slice(1)]);
        loft(b, fr, { seg: 7, cap: "bot", w: wFi, skin: glove ? null : skin });
      });
      loft(b, [[-0.058, 0.0062, 0.0062, 0, 0, hand], [-0.03, 0.0085, 0.0085, 0, 0, hand], [0, 0.011, 0.011, 0, 0, hand]], { seg: 7, cap: "bot", w: wH, M: xf(ox + inward * 0.012, 0.855, 0.030, 1, 1, 1, -0.75, 0, inward * 0.12), skin: glove ? null : skin });
    }
    // ---- the head: skull and jaw, ears, brows, eyes with lids, nose, lips; its shape varies with the chosen face
    const hv = (L.head | 0) % 5, jaw = [1.0, 0.9, 1.14, 0.84, 1.08][hv], len = [1.0, 1.06, 0.97, 1.1, 0.98][hv], wd = [1.0, 0.95, 1.05, 0.91, 1.08][hv];
    const hy = y => 1.565 + (y - 1.565) * len, jawF = y => 1 + (jaw - 1) * clampN((1.64 - y) / 0.075, 0, 1);
    const HT = HEAD.map(r => [hy(r[0]), r[1] * wd * jawF(r[0]), r[2], r[3]]), HP = y => lerpTable(HT, y), HW = chainW("y", [[1.55, BI.neck], [1.585, BI.head]]), wHd = W1(BI.head);
    const faceZ = (y, x) => { const p = HP(y); return p[3] + p[2] * Math.sqrt(Math.max(0, 1 - (x / p[1]) * (x / p[1]))); };
    loft(b, HT.map(r => [r[0], r[1], r[2], 0, r[3], skin]), { seg: 28, cap: "both", w: chainW("y", [[1.565, BI.neck], [1.60, BI.head]]), skin });
    for (const sx of [-1, 1]) {
      const ex = sx * 0.034 * wd, ey = hy(1.69), ez = faceZ(ey, ex);
      ell(b, ex, ey, ez - 0.0035, 0.0150, 0.0092, 0.0055, "#f6f2ea", wHd, { lo: 1 }); ell(b, ex + sx * 0.0005, ey, ez - 0.0006, 0.0070, 0.0070, 0.0035, "#4a3322", wHd, { lo: 1 }); ell(b, ex + sx * 0.0005, ey, ez + 0.0006, 0.0034, 0.0034, 0.002, "#0e0b09", wHd, { lo: 1 });    // eye, iris, pupil
      ell(b, ex, ey + 0.0098, ez - 0.0045, 0.0165, 0.0036, 0.0065, shade(skin, -0.07), wHd, { lo: 1 }); ell(b, ex, ey - 0.0092, ez - 0.0045, 0.0140, 0.0022, 0.005, shade(skin, -0.03), wHd, { lo: 1 });       // upper lid fold and lower lid
      ell(b, ex + sx * 0.002, hy(1.714), faceZ(hy(1.714), ex) - 0.002, 0.0225, 0.0046, 0.0072, browC, wHd, { rz: -sx * 0.12 });                                                           // eyebrow
      const ey2 = hy(1.668); ell(b, sx * (HP(ey2)[1] - 0.001), ey2, HP(ey2)[3] + 0.002, 0.0075, 0.026, 0.0175, shade(skin, -0.025), wHd, { ry: sx * 0.35, skin: 1 }); ell(b, sx * (HP(ey2)[1] + 0.004), ey2 - 0.002, HP(ey2)[3] + 0.004, 0.0028, 0.016, 0.009, shade(skin, -0.12), wHd, { skin: 1, lo: 1 });   // ear and its inner fold
    }
    { const nr = [[1.633, 0.0155, 0.013, 0.019], [1.642, 0.0175, 0.0155, 0.0225], [1.653, 0.0125, 0.014, 0.0205], [1.666, 0.0095, 0.0105, 0.0145], [1.683, 0.0075, 0.0078, 0.0085], [1.697, 0.0068, 0.0062, 0.004]].map(r => { const y = hy(r[0]), fz = faceZ(y, 0), prot = r[3], zc = fz - 0.008 + (prot + 0.008) / 2; return [y, r[1], (prot + 0.008) / 2 * (r[2] / r[2]), 0, zc, shade(skin, -0.015)]; });
      loft(b, nr, { seg: 10, cap: "both", w: wHd, skin });
      for (const sx of [-1, 1]) { const nz = faceZ(hy(1.634), 0); ell(b, sx * 0.0072, hy(1.6325), nz + 0.013, 0.0042, 0.0028, 0.0042, "#3a2018", wHd, { lo: 1 }); }
      const uy = hy(1.612), lz = faceZ(uy, 0); ell(b, 0, uy + 0.0035, lz - 0.001, 0.0205, 0.0052, 0.0088, lipC, wHd, { rx: 0.1 }); ell(b, 0, uy - 0.0092, lz - 0.003, 0.0185, 0.0062, 0.0092, shade(lipC, 0.05), wHd, { rx: -0.1 }); ell(b, 0, uy - 0.0008, lz - 0.0016, 0.0205, 0.0013, 0.007, mixHex(skin, "#3a1a1a", 0.55), wHd, { lo: 1 });      // lips and the mouth line
    }
    // ---- hair: a cap that follows the skull (columns around the head, hairline per style), plus the style's extras
    const hs = L.hair | 0, helmet = out !== "stable" && true, headTop = HT[HT.length - 1][0];
    if (hs !== 5) {
      const lowest = [1.655, 1.655, 1.655, 1.52, 1.66][hs] || 1.655, front = [1.744, 1.738, 1.742, 1.74, 1.752][hs] || 1.744, sideLow = [1.70, 1.69, 1.70, 1.58, 1.71][hs] || 1.70, thickTop = [1.04, 1.07, 1.045, 1.06, 1.1][hs] || 1.04;
      const ymin = a => { const fr = (1 + Math.sin(a)) / 2, sd = Math.abs(Math.cos(a)); return sstep(fr * 1.0) * 0 + (lowest + (front - lowest) * fr + (sideLow - (lowest + (front - lowest) * 0.5)) * sd * (1 - Math.abs(fr - 0.5) * 2) * 1); };
      const NC = 30, NR = 9; const hg = gridGeo(NC, NR, (i, j) => { const a = i / NC * TAU, y0 = ymin(a), y = y0 + (headTop + 0.004 - y0) * Math.pow(j / (NR - 1), 0.9), p = HP(Math.max(y, 1.58)), tk = (1.006 + (thickTop - 1.006) * sstep((y - y0) / 0.07)) * (hs === 1 ? 1 + 0.05 * Math.max(0, Math.cos(a - 0.5)) * sstep((y - 1.715) / 0.04) : 1) * (hs === 3 ? 1 + 1.6 * sstep((1.66 - y) / 0.14) * (1 - 0.5 * (1 + Math.sin(a)) / 2) : 1); return [p[1] * tk * Math.cos(a), y, p[3] * tk + p[2] * tk * Math.sin(a)]; }, false);
      hg.nor = normalsOf(hg.pos, hg.idx); const hc = lin(hair), hcol = i => { const j = (i / NC) | 0, v = 1 + 0.06 * Math.sin(i * 1.7) * Math.cos(j * 2.3); return [hc[0] * v, hc[1] * v, hc[2] * v]; }; emit(b, hg.pos, hg.nor, hg.idx, hcol, wHd);
      if (hs === 2) loft(b, [[1.50, 0.008, 0.008, 0, -0.14, hair], [1.56, 0.02, 0.02, 0, -0.147, hair], [1.63, 0.031, 0.03, 0, -0.138, hair], [1.70, 0.034, 0.034, 0, -0.123, hair], [1.738, 0.03, 0.03, 0, -0.108, "#2a2018"], [1.752, 0.032, 0.032, 0, -0.104, hair]], { seg: 10, cap: "both", w: wHd });
      if (hs === 4 && !tall) for (let i = 0; i < 34; i++) { const a = i * 2.399, r = 0.4 + 0.6 * ((i * 7) % 11) / 10, y = 1.725 + 0.07 * r, p = HP(Math.min(y, 1.79)); const sc = Math.max(0.2, 1 - (y - 1.72) / 0.1); ell(b, Math.cos(a) * p[1] * (0.4 + 0.65 * sc), y + 0.005, p[3] + Math.sin(a) * p[2] * (0.4 + 0.65 * sc), 0.026, 0.024, 0.026, hair, wHd, { lo: 1 }); }
    }
    // ---- headwear
    if (out === "stable") {
      const bc = "#7b5a39", band = "#2a2018", yb = hy(1.752);
      const hr = [[yb + 0.158, 0.0, 0.0, 0, -0.004, bc], [yb + 0.148, 0.042, 0.054, 0, 0.004, bc], [yb + 0.13, 0.074, 0.09, 0, 0.0, bc], [yb + 0.096, 0.084, 0.102, 0, -0.004, bc], [yb + 0.056, 0.0875, 0.106, 0, -0.006, bc], [yb + 0.038, 0.089, 0.108, 0, -0.006, band], [yb + 0.01, 0.0905, 0.11, 0, -0.006, band], [yb + 0.008, 0.0905, 0.11, 0, -0.006, bc],
        [yb + 0.005, 0.115, 0.135, 0, 0.0, bc], [yb + 0.0, 0.15, 0.172, 0, 0.012, bc], [yb - 0.01, 0.177, 0.2, 0, 0.018, bc], [yb - 0.0175, 0.1815, 0.2045, 0, 0.018, bc], [yb - 0.0215, 0.178, 0.2, 0, 0.018, shade(bc, -0.15)], [yb - 0.0165, 0.15, 0.172, 0, 0.012, shade(bc, -0.2)], [yb - 0.011, 0.115, 0.135, 0, 0.0, shade(bc, -0.25)], [yb - 0.006, 0.093, 0.112, 0, -0.005, shade(bc, -0.3)]];
      loft(b, hr.slice().reverse(), { seg: 30, cap: "bot", w: wHd, flip: false, M: xf(0, 0, 0) });

    } else {
      const hc = jacket ? C.shirt : "#1d2a44", band = "#101418", yy = hy(1.745), hlm = [[yy + 0.115, 0.0, 0.0, 0, -0.016, hc], [yy + 0.106, 0.034, 0.05, 0, -0.016, hc], [yy + 0.086, 0.059, 0.086, 0, -0.014, hc], [yy + 0.052, 0.077, 0.101, 0, -0.01, hc], [yy + 0.02, 0.0825, 0.1075, 0, -0.007, hc], [yy + 0.004, 0.0835, 0.109, 0, -0.006, band], [yy - 0.012, 0.0835, 0.109, 0, -0.006, band], [yy - 0.014, 0.0825, 0.1075, 0, -0.006, hc]];
      loft(b, hlm.slice().reverse(), { seg: 28, cap: "bot", w: wHd, flip: false });
      box(b, 0, yy - 0.006, faceZ(yy, 0) + 0.018, 0.075 * wd, 0.006, 0.05, band, wHd, { rx: 0.14 });                                                                             // the peak
      for (const sx of [-1, 1]) { box(b, sx * (HP(yy - 0.05)[1] + 0.001), yy - 0.095, HP(yy - 0.05)[3] + 0.012, 0.004, 0.17, 0.01, band, wHd, { rz: 0 }); }      // chin-strap
      ell(b, 0, hy(1.568), faceZ(hy(1.568), 0) - 0.002, 0.03, 0.005, 0.012, band, wHd, { lo: 1 });
      if (jacket) ell(b, 0, yy + 0.118, -0.016, 0.014, 0.012, 0.014, "#f2efe6", wHd, { lo: 1 });                                                                                      // pompon on the silk cover
    }
    finish(b, skin);
  }

  // ---------------------------------------------------------------- finishing: ambient-occlusion darkening in the creases and a little life in the face (cheeks, eye sockets, brow)
  const AO = [[-0.165, 1.33, 0, 0.075, 0.26], [0.165, 1.33, 0, 0.075, 0.26], [0, 0.80, 0.0, 0.07, 0.16], [0, 1.555, 0.04, 0.06, 0.22], [0, 1.49, 0, 0.07, 0.12], [-0.092, 0.47, -0.05, 0.05, 0.12], [0.092, 0.47, -0.05, 0.05, 0.12], [-0.19, 1.13, 0.035, 0.045, 0.14], [0.19, 1.13, 0.035, 0.045, 0.14], [0, 1.0, 0, 0.17, 0.05]];
  function finish(b, skin) {
    const sk = lin(skin), blush = lin(mixHex(skin, "#d4685c", 0.5));
    for (let i = 0; i < b.nv; i++) {
      const x = b.P[i * 3], y = b.P[i * 3 + 1], z = b.P[i * 3 + 2]; let m = 1;
      for (const a of AO) { const d = Math.hypot(x - a[0], y - a[1], z - a[2]); if (d < a[3]) { const f = 1 - d / a[3]; m -= a[4] * f * f; } }
      let r = b.C[i * 3], g = b.C[i * 3 + 1], bl = b.C[i * 3 + 2];
      if (b.S[i] && y > 1.56 && z > 0) {                                                                                                                                         // face: cheeks warm, eye sockets and under the brow a touch deeper
        const cx = Math.min(Math.hypot(x - 0.047, y - 1.648, z - 0.07), Math.hypot(x + 0.047, y - 1.648, z - 0.07)); if (cx < 0.034) { const f = (1 - cx / 0.034) * 0.5; r += (blush[0] - r) * f; g += (blush[1] - g) * f; bl += (blush[2] - bl) * f; }
        const ex = Math.min(Math.hypot(x - 0.034, y - 1.69, z - 0.085), Math.hypot(x + 0.034, y - 1.69, z - 0.085)); if (ex < 0.03) m -= 0.16 * (1 - ex / 0.03);
      }
      if (!b.S[i]) m *= 1 + 0.035 * Math.sin(x * 38 + y * 22) * Math.cos(z * 31 - y * 17);                                                                                // a little cloth variation so flat colour reads as fabric
      b.C[i * 3] = r * m; b.C[i * 3 + 1] = g * m; b.C[i * 3 + 2] = bl * m;
    }
    void sk;
  }

  // ---------------------------------------------------------------- actions (the horse work) — set once, run until cleared
  function act(o, name, opt) { if (!name) { o.action = null; for (const k in o.props) o.props[k].visible = false; return; } o.action = Object.assign({ name, t: 0 }, opt || {}); o.props.brush.visible = name === "brush"; o.props.bucket.visible = name === "feed"; }

  // ---------------------------------------------------------------- pose: speed in m/s drives the cycle (walk ≈ 2.4, run ≈ 5.2); turn = yaw rate (rad/s)
  function pose(o, dt, speed, turn) {
    const P = o.parts; dt = Math.min(dt, 0.1); o.speed += (speed - o.speed) * Math.min(1, dt * 10); const sp = o.speed; o.idleT += dt;
    const tr = turn || 0; o.turn += (tr - o.turn) * Math.min(1, dt * 8);
    const moving = sp > 0.15, pivot = !moving && Math.abs(o.turn) > 0.7;                   // turning on the spot: small steps
    const eff = moving ? sp : pivot ? 1.1 : 0, run = sp > 3.4 ? clampN((sp - 3.4) / 1.4, 0, 1) : 0, k = Math.min(1, eff / 2.4);
    o.phase += dt * (eff * (eff < 3.4 ? 1.9 : 1.5));
    const s = Math.sin(o.phase), c = Math.cos(o.phase);
    const act = o.action && o.action.name, A = o.action; if (A) A.t += dt;
    const I = o.idle; let gv = 0;
    if (!moving && !pivot && !act) {                                                      // idle: breathing, and now and then a look round or a hand on the hip
      if (I.mode) { I.gt += dt; if (I.gt >= I.dur) { I.mode = ""; I.t = 4 + Math.random() * 5; } else gv = Math.sin(Math.PI * I.gt / I.dur); }
      else { I.t -= dt; if (I.t <= 0) { I.mode = ["look", "hip", "look", "hip"][(Math.random() * 4) | 0]; I.gt = 0; I.dur = 2.4 + Math.random() * 1.6; I.dir = Math.random() < 0.5 ? -1 : 1; } }
    } else if (I.mode) { I.mode = ""; I.t = 3 + Math.random() * 3; }
    const g = (a, t, r) => a + (t - a) * Math.min(1, dt * r);
    // targets
    let shL = 0, shR = 0, elL = -0.12, elR = -0.12, torX = 0, torY = 0, torZ = 0, pelY = 0, pelZ = 0, pelX = 0, headX = 0, headY = 0, hipLx = 0, hipRx = 0, kneeL = 0, kneeR = 0, ankL = 0, ankR = 0, bob = 0, curlL = 0.3, curlR = 0.3;
    o.lean = 0;
    if (moving || pivot) {
      const stride = pivot ? 0.26 : eff < 3.4 ? 0.52 : 0.78, kb = 0.5 + 0.7 * run;
      hipLx = s * stride * k; hipRx = -s * stride * k;
      kneeL = (Math.max(0, -c) * kb + 0.1 * Math.max(0, s) * (1 - run)) * k; kneeR = (Math.max(0, c) * kb + 0.1 * Math.max(0, -s) * (1 - run)) * k;
      ankL = clampN(-(hipLx + kneeL), -0.9, 0.9) * 0.9 + 0.25 * Math.max(0, s) * k; ankR = clampN(-(hipRx + kneeR), -0.9, 0.9) * 0.9 + 0.25 * Math.max(0, -s) * k;
      shL = -s * stride * 0.8 * k; shR = s * stride * 0.8 * k; elL = -(0.18 + 0.7 * run) * k - 0.12 * (1 - k); elR = elL;
      torY = s * 0.12 * k; torX = 0.05 + 0.12 * run; pelY = -s * 0.06 * k; bob = Math.abs(c) * (0.025 + 0.03 * run) * k; headY = -s * 0.04 * k; curlL = curlR = 0.35 + 0.5 * run;
    } else {
      const b = Math.sin(o.idleT * 1.5), look = I.mode === "look" ? 1 : 0, hip = I.mode === "hip" ? 1 : 0;
      shL = 0.03 * b; shR = -0.03 * b; elL = -0.14 + 0.02 * b; elR = elL; torX = 0.012 * b; headY = Math.sin(o.idleT * 0.45) * 0.1 + look * gv * 0.7 * I.dir; headX = look * gv * -0.1 + 0.02 * b;
      torY = look * gv * 0.18 * I.dir;
      if (hip) { if (I.dir > 0) { shR = -0.2 * gv; elR = -0.2 - 1.1 * gv; curlR = 0.6; } else { shL = -0.2 * gv; elL = -0.2 - 1.1 * gv; curlL = 0.6; } }
    }
    // ---- actions override the arms, the torso and the head
    if (act) {
      const t = A.t, ease = Math.min(1, t * 3);
      if (act === "brush") { const sw = Math.sin(t * 7.5), rr = Math.sin(t * 3.2); shR = -1.2 + 0.2 * sw; elR = -0.75 - 0.35 * sw + 0.1 * rr; shL = -0.5; elL = -0.8; torX = 0.17 * ease; torY = 0.15 * ease; headX = 0.2; headY = -0.15 * ease; curlR = 1.0; }
      else if (act === "feed") { const pour = Math.min(1, Math.max(0, (t - 0.6) / 1.2)); shR = -0.95; shL = -0.95; elR = -0.7; elL = -0.7; torX = 0.14 * ease; headX = 0.25; curlR = 1.0; if (o.props.bucket) o.props.bucket.rotation.x = -0.9 * pour; }
      else if (act === "pat") { const p2 = Math.sin(t * 6); shR = -0.9 + 0.12 * p2; elR = -0.55 - 0.18 * p2; torX = 0.1 * ease; headX = 0.1; curlR = 0.15; }
      else if (act === "inspect") { shR = -0.7 + 0.1 * Math.sin(t * 2); elR = -0.9; shL = -0.25; elL = -1.0; torX = 0.2 * ease; headX = 0.35; headY = Math.sin(t * 1.4) * 0.25; curlR = 0.2; }
      else if (act === "tack") { const f = Math.sin(t * 4.5), f2 = Math.sin(t * 3.1 + 1); shR = -1.0 + 0.1 * f; elR = -0.9 + 0.2 * f2; shL = -0.9 + 0.1 * f2; elL = -0.8 - 0.2 * f; torX = 0.13 * ease; headX = 0.2; torY = 0.08 * Math.sin(t * 1.3); curlL = curlR = 0.8; }
      else if (act === "lead") { shR = -0.62; elR = -1.0; torX = 0.04; curlR = 1.1; }
      else if (act === "wave") { shR = -2.5 + 0.1 * Math.sin(t * 9); elR = -0.4 + 0.5 * Math.sin(t * 9); curlR = 0.1; }
      else if (act === "drive") { shR = -0.95; shL = -0.95; elR = -0.45; elL = -0.45; headX = 0; curlL = curlR = 1.0; }
      if (o.props.brush) o.props.brush.rotation.x = act === "brush" ? 0.7 : 0;
    } else if (o.props.bucket) o.props.bucket.rotation.x = 0;
    // ---- apply with a little smoothing (so a switch never pops)
    const R = 14;
    P.legL.hip.rotation.x = g(P.legL.hip.rotation.x, hipLx, R); P.legR.hip.rotation.x = g(P.legR.hip.rotation.x, hipRx, R);
    P.legL.knee.rotation.x = g(P.legL.knee.rotation.x, kneeL, R); P.legR.knee.rotation.x = g(P.legR.knee.rotation.x, kneeR, R);
    P.legL.ankle.rotation.x = g(P.legL.ankle.rotation.x, ankL, R); P.legR.ankle.rotation.x = g(P.legR.ankle.rotation.x, ankR, R);
    P.legL.toe.rotation.x = g(P.legL.toe.rotation.x, clampN(-ankL * 0.9, -0.1, 0.7), R); P.legR.toe.rotation.x = g(P.legR.toe.rotation.x, clampN(-ankR * 0.9, -0.1, 0.7), R);
    P.armL.sh.rotation.x = g(P.armL.sh.rotation.x, shL, R); P.armR.sh.rotation.x = g(P.armR.sh.rotation.x, shR, R); P.armL.el.rotation.x = g(P.armL.el.rotation.x, elL, R); P.armR.el.rotation.x = g(P.armR.el.rotation.x, elR, R);
    P.armL.sh.rotation.z = g(P.armL.sh.rotation.z, -0.07 - 0.1 * run * k, 8); P.armR.sh.rotation.z = g(P.armR.sh.rotation.z, 0.07 + 0.1 * run * k, 8);                   // arms hang a little away from the body
    P.armL.fing.rotation.z = g(P.armL.fing.rotation.z, curlL, 10); P.armR.fing.rotation.z = g(P.armR.fing.rotation.z, -curlR, 10);
    P.armL.hand.rotation.x = g(P.armL.hand.rotation.x, -0.12, 8); P.armR.hand.rotation.x = g(P.armR.hand.rotation.x, -0.12, 8);
    P.torsoG.rotation.x = g(P.torsoG.rotation.x, torX, 10); P.torsoG.rotation.y = g(P.torsoG.rotation.y, torY, 10); P.torsoG.rotation.z = g(P.torsoG.rotation.z, torZ, 10);
    P.chest.rotation.x = Math.sin(o.idleT * 1.5) * 0.012;
    P.pelvis.rotation.y = g(P.pelvis.rotation.y, pelY, 10); P.pelvis.rotation.z = g(P.pelvis.rotation.z, pelZ, 10); P.pelvis.position.x = g(P.pelvis.position.x, pelX, 10); P.pelvis.position.y = o.hip + bob - (act === "brush" || act === "feed" ? 0.01 : 0);
    P.headG.rotation.x = g(P.headG.rotation.x, headX * 0.65, 10); P.headG.rotation.y = g(P.headG.rotation.y, headY * 0.65, 8); P.headG.rotation.z = 0;
    P.neckG.rotation.x = g(P.neckG.rotation.x, headX * 0.35, 10); P.neckG.rotation.y = g(P.neckG.rotation.y, headY * 0.35, 8);
    o.body.rotation.z = o.lean;
  }
  function dispose(o) { if (!o) return; if (o.mesh) { o.mesh.geometry.dispose(); } for (const g of o.geos) g.dispose(); try { o.skeleton.dispose(); } catch (e) {} for (const m of o.mats) m.dispose(); o.mats.length = 0; if (o.root.parent) o.root.parent.remove(o.root); }
  function disposeShared() {}
  return { make, pose, act, dispose, disposeShared, SKINS, HAIRS, HAIR_STYLES, FACES, OUTFITS, BUILDS, DEFAULT };
})();
