'use strict';
/* =====================================================================
   FINAL FURLONG — PEOPLE: the player's character (rebuilt in Phase 6)
   A simple, smooth stable owner, ~1.8 m tall, built from tapered rounded shapes (an egg-shaped head with two eye dots and a small nose, a plain torso, smooth limbs and boots, six hair styles) — deliberately basic, like the owner's reference picture. Everything that belongs to one joint is merged into ONE
   vertex-coloured mesh, so a whole figure is 13 draw calls and one material (the Phase 5 figure was ~30 meshes and ~10 materials).
   Outfits: STABLE (akubra, work shirt with rolled sleeves, jeans, boots), TRAINING (riding helmet, polo, breeches, tall boots, gloves) and RACE DAY
   (jacket in your colour, white breeches, tall boots, helmet with a silk cover). Appearance (saved in C.player): look {head, hair, hairCol, skin, build},
   outfit, colours {shirt, trousers, boots}. Nothing here touches the race.
   Animation (all procedural): walk and run with heel/toe foot roll, hip sway, counter-rotating shoulders and arm swing; leaning into turns and
   stepping on the spot when turning while still; a breathing idle that now and then shifts weight, looks around or puts a hand on the hip; and
   ACTIONS for the horse work — brush, feed, pat, inspect, tack up, lead, drive — with the brush and the feed bucket as props in the hands.
   ===================================================================== */
const FARMPEOPLE = (() => {
  const SKINS = ["#f1d2b6", "#e0b48c", "#c68e6b", "#a06a48", "#7b4a30", "#523020"], HAIRS = ["#15110d", "#3a2616", "#6b4423", "#a9743a", "#c9a45c", "#8d8a85", "#7a2e1d"];
  const HAIR_STYLES = ["Short crop", "Side part", "Ponytail", "Shoulder length", "Cap of curls", "Bald"], FACES = ["Round", "Oval", "Square", "Narrow", "Broad"];
  const OUTFITS = [["stable", "Stable wear"], ["training", "Riding gear"], ["raceday", "Race day"]];
  const BUILDS = [-1, -0.5, 0, 0.5, 1];
  const DEFAULT = () => ({ look: { head: 1, hair: 0, hairCol: "#3a2616", skin: "#e0b48c", build: 0 }, outfit: "stable", colours: { shirt: "#2e5e8a", trousers: "#3a3a40", boots: "#4a2e1a" } });
  const TAU = Math.PI * 2, clampN = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------- geometry kit: lofts through elliptical rings, merged per joint with vertex colours
  // rings: [y, rx, rz, ox, oz] — a closed smooth tube (or egg) along y; the ends are capped with their own vertices (a hard edge)
  function loft(rings, seg, capTop, capBot) {
    seg = seg || 12; const pos = [], idx = [], n = rings.length;
    for (let r = 0; r < n; r++) { const [y, rx, rz, ox, oz] = rings[r]; for (let k = 0; k < seg; k++) { const a = k / seg * TAU; pos.push((ox || 0) + rx * Math.cos(a), y, (oz || 0) + rz * Math.sin(a)); } }
    for (let r = 0; r < n - 1; r++) for (let k = 0; k < seg; k++) { const a = r * seg + k, b = r * seg + (k + 1) % seg, c = (r + 1) * seg + k, d = (r + 1) * seg + (k + 1) % seg; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (capTop === false && capBot === false) return g;
    const caps = (ring, up) => {                                           // a separate fan so the cap has its own (flat) normals
      const [y, rx, rz, ox, oz] = ring, p2 = [], i2 = [], base = 0; p2.push(ox || 0, y, oz || 0); for (let k = 0; k < seg; k++) { const a = k / seg * TAU; p2.push((ox || 0) + rx * Math.cos(a), y, (oz || 0) + rz * Math.sin(a)); }
      for (let k = 0; k < seg; k++) { const a = 1 + k, b = 1 + (k + 1) % seg; if (up) i2.push(base, b, a); else i2.push(base, a, b); }
      const cg = new THREE.BufferGeometry(); cg.setAttribute("position", new THREE.Float32BufferAttribute(p2, 3)); cg.setIndex(i2); cg.computeVertexNormals(); return cg;
    };
    const out = [g]; if (capTop !== false) out.push(caps(rings[n - 1], true)); if (capBot !== false) out.push(caps(rings[0], false));
    return out.length === 1 ? g : mergeGeos(out.map(x => ({ g: x })), true);
  }
  // concatenates geometries into one; items: { g, hex?, m? (Matrix4), }. keepColor: copy nothing (used internally for caps)
  const _col = new THREE.Color();
  function mergeGeos(items, plain) {
    let nv = 0, ni = 0; for (const it of items) { nv += it.g.attributes.position.count; ni += it.g.index ? it.g.index.count : it.g.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), I = new Uint32Array(ni); let vo = 0, io = 0;
    const nm = new THREE.Matrix3();
    for (const it of items) {
      const g = it.g, pa = g.attributes.position, na = g.attributes.normal, c = it.hex != null ? _col.set(it.hex).convertSRGBToLinear() : null;
      if (it.m) nm.getNormalMatrix(it.m);
      const v = new THREE.Vector3(), nn = new THREE.Vector3();
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i); nn.fromBufferAttribute(na, i); if (it.m) { v.applyMatrix4(it.m); nn.applyMatrix3(nm).normalize(); }
        P[(vo + i) * 3] = v.x; P[(vo + i) * 3 + 1] = v.y; P[(vo + i) * 3 + 2] = v.z; N[(vo + i) * 3] = nn.x; N[(vo + i) * 3 + 1] = nn.y; N[(vo + i) * 3 + 2] = nn.z;
        if (c) { const j = it.v ? 1 + it.v * Math.sin(v.x * (it.f || 30) + v.y * (it.f || 30) * 1.7) * Math.cos(v.z * (it.f || 30) * 1.3 - v.y * (it.f || 30) * 0.9) : 1; C[(vo + i) * 3] = c.r * j; C[(vo + i) * 3 + 1] = c.g * j; C[(vo + i) * 3 + 2] = c.b * j; } else { C[(vo + i) * 3] = C[(vo + i) * 3 + 1] = C[(vo + i) * 3 + 2] = 1; }
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) I[io + i] = g.index.array[i] + vo; else for (let i = 0; i < pa.count; i++) I[io + i] = vo + i;
      vo += pa.count; io += g.index ? g.index.count : pa.count;
      if (!plain) g.dispose();
    }
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(P, 3)); out.setAttribute("normal", new THREE.BufferAttribute(N, 3)); out.setAttribute("color", new THREE.BufferAttribute(C, 3)); out.setIndex(new THREE.BufferAttribute(I, 1));
    if (plain) { for (const it of items) it.g.dispose(); }
    return out;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const xf = (x, y, z, sx, sy, sz, rx, ry, rz) => { _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e); return new THREE.Matrix4().compose(_p.set(x || 0, y || 0, z || 0), _q, _s.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz)); };
  const sphere = (() => { let g = null; return () => g || (g = new THREE.SphereGeometry(1, 10, 8)); })();       // a unit sphere (cloned by the merge, never mutated)
  const box1 = (() => { let g = null; return () => g || (g = new THREE.BoxGeometry(1, 1, 1)); })();
  const cyl1 = (() => { let g = null; return () => g || (g = new THREE.CylinderGeometry(1, 1, 1, 10)); })();
  const mixHex = (a, b, t) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  const shade = (a, t) => mixHex(a, t < 0 ? "#000000" : "#ffffff", Math.abs(t));

  // ---------------------------------------------------------------- the skeleton
  function make(app) {
    const A = Object.assign(DEFAULT(), app || {}); A.look = Object.assign(DEFAULT().look, A.look || {}); A.colours = Object.assign(DEFAULT().colours, A.colours || {});
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; };
    const pelvis = grp(body, 0, 0.94, 0), torsoG = grp(pelvis, 0, 0.02, 0), neckG = grp(torsoG, 0, 0.6, 0.0), headG = grp(neckG, 0, 0.04, 0);
    const limb = sx => { const hip = grp(pelvis, sx, -0.03, 0), knee = grp(hip, 0, -0.44, 0), ankle = grp(knee, 0, -0.4, 0); return { hip, knee, ankle }; };
    const arm = sx => { const sh = grp(torsoG, sx, 0.46, 0), el = grp(sh, 0, -0.29, 0), hand = grp(el, 0, -0.27, 0); return { sh, el, hand }; };
    const legL = limb(-0.09), legR = limb(0.09), armL = arm(-0.215), armR = arm(0.215);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const o = { A, root, body, parts: { pelvis, torsoG, neckG, headG, legL, legR, armL, armR }, mats: [mat], mat, meshes: {}, geos: [], phase: 0, speed: 0, idleT: 0, turn: 0, lean: 0, hip: 0.94, props: {}, action: null, idle: { t: 3, mode: "", gt: 0, dur: 2, dir: 1 }, dressed: [], blend: 0 };
    o.apply = app2 => apply(o, app2); o.act = (name, opt) => act(o, name, opt); o.handPos = (side, out) => { const h = side === "L" ? armL.hand : armR.hand; h.updateWorldMatrix(true, false); return (out || new THREE.Vector3()).setFromMatrixPosition(h.matrixWorld); };
    // props held in the hands: a grooming brush and a feed bucket (hidden unless an action uses them)
    const brush = new THREE.Group(); { const g1 = mergeGeos([{ g: box1(), hex: "#8a5a32", m: xf(0, -0.02, 0.0, 0.055, 0.03, 0.15) }, { g: box1(), hex: "#d8cfb8", m: xf(0, -0.045, 0.0, 0.05, 0.02, 0.135) }], true); o.geos.push(g1); const m = new THREE.Mesh(g1, mat); brush.add(m); }
    brush.position.set(0, -0.03, 0.03); brush.visible = false; armR.hand.add(brush); o.props.brush = brush;
    const bucket = new THREE.Group(); { const g1 = loft([[-0.11, 0.1, 0.1], [0.0, 0.115, 0.115], [0.1, 0.13, 0.13]], 14, false, true), g2 = loft([[0.095, 0.115, 0.115], [0.105, 0.115, 0.115]], 14, false, false); const gm = mergeGeos([{ g: g1, hex: "#2f6f8f" }, { g: new THREE.TorusGeometry(0.1, 0.008, 6, 14, Math.PI), hex: "#c9c9c9", m: xf(0, 0.1, 0, 1, 1, 1, 0, 0, 0) }], true); const gin = loft([[0.08, 0.12, 0.12], [0.085, 0.12, 0.12]], 14, true, false); const gm2 = mergeGeos([{ g: gin, hex: "#b88a3a" }], true); o.geos.push(gm, gm2); bucket.add(new THREE.Mesh(gm, mat), new THREE.Mesh(gm2, mat)); }
    bucket.position.set(0.0, -0.16, 0.18); bucket.visible = false; armR.hand.add(bucket); o.props.bucket = bucket;
    apply(o, A);
    return o;
  }

  // ---------------------------------------------------------------- dressing: rebuild the joint meshes from the appearance and outfit
  // Deliberately BASIC and smooth (the look the owner chose): tapered rounded limbs, a plain torso, a simple egg-shaped head with two eye dots and a small nose, a simple cap of hair,
  // and the hat or helmet — no joint balls, fingers, seams or fine facial detail. One vertex-coloured mesh per joint.
  function apply(o, app) {
    const A = o.A; if (app) { A.look = Object.assign(A.look, app.look || {}); A.colours = Object.assign(A.colours, app.colours || {}); if (app.outfit) A.outfit = app.outfit; }
    for (const k in o.meshes) { const m = o.meshes[k]; if (m.parent) m.parent.remove(m); } for (const g of o.dressedGeos || []) g.dispose(); o.dressedGeos = []; o.meshes = {}; o.dressed.length = 0;
    const P = o.parts, L = A.look, C = A.colours, out = A.outfit, bld = 1 + (+L.build || 0) * 0.14, skin = L.skin, hair = L.hairCol;
    o.body.scale.set(bld, 1, bld * 0.96);
    const dark = "#1b1713", lipC = mixHex(skin, "#a8484f", 0.5);
    const shirtHex = out === "training" ? "#f2efe6" : C.shirt, trouHex = out === "stable" ? C.trousers : out === "training" ? "#d9c9a2" : "#f4f2ea", bootHex = out === "stable" ? C.boots : "#1d1a18";
    const J = {};
    const put = (j, g, hex, x, y, z, sx, sy, sz, rx, ry, rz) => { (J[j] || (J[j] = [])).push({ g, hex, m: xf(x, y, z, sx, sy, sz, rx, ry, rz) }); };
    const putL = (j, g, hex) => { (J[j] || (J[j] = [])).push({ g, hex }); };
    const tall = out !== "stable", jacket = out === "raceday";
    // ---- legs, boots
    for (const sd of ["L", "R"]) {
      putL("thigh" + sd, loft([[0.05, 0.088, 0.094, 0, 0], [-0.1, 0.086, 0.09, 0, 0.004], [-0.28, 0.07, 0.074, 0, 0.004], [-0.44, 0.056, 0.06, 0, 0]], 14), trouHex);
      putL("shin" + sd, loft([[0.02, 0.058, 0.062, 0, 0], [-0.12, 0.058, 0.064, 0, -0.006], [-0.3, 0.048, 0.052, 0, 0], [-0.4, 0.046, 0.05, 0, 0]], 14), tall ? bootHex : trouHex);
      putL("foot" + sd, loft([[0.04, 0.046, 0.05, 0, 0], [-0.06, 0.05, 0.056, 0, 0]], 12), bootHex);
      put("foot" + sd, sphere(), bootHex, 0, -0.045, 0.08, 0.05, 0.034, 0.12); put("foot" + sd, box1(), "#1c1a16", 0, -0.068, 0.05, 0.095, 0.014, 0.25);
    }
    // ---- pelvis and torso: plain smooth shapes
    putL("pelvis", loft([[-0.12, 0.17, 0.115, 0, 0], [-0.03, 0.172, 0.118, 0, 0], [0.08, 0.15, 0.104, 0, 0]], 16, false, false), trouHex);
    put("pelvis", sphere(), trouHex, 0, -0.1, 0, 0.165, 0.07, 0.115);
    const jt = jacket ? 0.01 : 0;
    putL("torso", loft([[-0.03, 0.146 + jt, 0.098 + jt, 0, 0], [0.1, 0.15 + jt, 0.102 + jt, 0, 0.002], [0.28, 0.176 + jt, 0.114 + jt, 0, 0.004], [0.4, 0.19 + jt, 0.108 + jt, 0, -0.002], [0.47, 0.165 + jt, 0.095 + jt, 0, -0.006], [0.52, 0.11, 0.08, 0, -0.008], [0.56, 0.062, 0.058, 0, -0.004]], 18, false, false), jacket ? C.shirt : shirtHex);
    putL("torso", loft([[0.54, 0.05, 0.052, 0, 0.004], [0.62, 0.046, 0.05, 0, 0.012], [0.68, 0.044, 0.048, 0, 0.012]], 12, false, true), skin);                 // neck
    put("torso", sphere(), jacket ? C.shirt : shirtHex, 0, 0.47, -0.004, 0.19 + jt, 0.05, 0.1);                                                              // shoulder line
    if (jacket) putL("torso", loft([[-0.14, 0.2, 0.146, 0, 0], [-0.02, 0.192, 0.138, 0, 0], [0.08, 0.172, 0.122, 0, 0]], 16, false, true), C.shirt);          // jacket skirt
    // ---- arms and hands (smooth tapered sleeves)
    for (const sd of ["L", "R"]) {
      const sleeve = jacket ? C.shirt : shirtHex, long = out !== "training", hand = out === "training" ? "#2c2c2c" : jacket ? "#f2efe6" : skin;
      putL("uarm" + sd, loft([[0.05, 0.056, 0.056, 0, 0], [-0.1, 0.052, 0.054, 0, 0], [-0.29, 0.043, 0.045, 0, 0]], 12), sleeve);
      putL("farm" + sd, loft([[0.0, 0.043, 0.045, 0, 0], [-0.12, 0.04, 0.043, 0, 0.002], [-0.27, 0.03, 0.034, 0, 0]], 12), long ? sleeve : skin);
      put("farm" + sd, sphere(), hand, 0, -0.31, 0.004, 0.034, 0.05, 0.026);
    }
    // ---- head: a simple egg with eyes and a nose
    const hv = (L.head | 0) % 5, jaw = [1.0, 0.9, 1.14, 0.84, 1.08][hv], len = [1.0, 1.06, 0.97, 1.1, 0.98][hv], wd = [1.0, 0.95, 1.05, 0.91, 1.08][hv];
    const R = (y, rx, rz, oz) => [y * len, rx * wd, rz, 0, oz || 0];
    putL("head", loft([R(0.0, 0.03, 0.042, 0.05), R(0.025, 0.058 * jaw, 0.07, 0.04), R(0.07, 0.078 * (0.92 + 0.08 * jaw), 0.088, 0.02), R(0.13, 0.082, 0.098, 0.0), R(0.18, 0.08, 0.1, -0.003), R(0.22, 0.062, 0.084, -0.006), R(0.245, 0.03, 0.04, -0.01)], 18), skin);
    for (const sx of [-1, 1]) { put("head", sphere(), "#fbf8f1", sx * 0.034 * wd, 0.142 * len, 0.088, 0.0125, 0.0095, 0.008); put("head", sphere(), dark, sx * 0.034 * wd, 0.142 * len, 0.095, 0.0065, 0.0065, 0.004); put("head", sphere(), skin, sx * 0.079 * wd, 0.125 * len, -0.004, 0.008, 0.024, 0.018); }
    put("head", sphere(), mixHex(skin, "#000", 0.06), 0, 0.099 * len, 0.1, 0.014, 0.03, 0.017, 0.3, 0, 0);                                                    // nose
    put("head", sphere(), lipC, 0, 0.045 * len, 0.098, 0.022, 0.0075, 0.01);                                                                                  // mouth
    // ---- hair: a simple cap that follows the skull (hidden under a helmet), plus one simple extra per style
    const hs = L.hair | 0, helmet = out !== "stable";
    if (hs !== 5) {
      if (!helmet) putL("head", loft([[0.108 * len, 0.082 * wd, 0.099, 0, 0], [0.15 * len, 0.0835 * wd, 0.104, 0, -0.001], [0.2 * len, 0.0735 * wd, 0.0955, 0, -0.006], [0.232 * len, 0.054 * wd, 0.072, 0, -0.01], [0.248 * len, 0.026 * wd, 0.04, 0, -0.012]], 18, true, false), hair);
      const blob = (x, y, z, sx, sy, sz) => put("head", sphere(), hair, x, y * len, z, sx, sy, sz);
      if (hs === 1 && !helmet) blob(0.02, 0.2, 0.07, 0.07, 0.025, 0.05);
      if (hs === 2) { put("head", loft([[0.0, 0.032, 0.032], [-0.1, 0.038, 0.036], [-0.2, 0.028, 0.026], [-0.27, 0.01, 0.01]], 8, true, true), hair, 0, 0.15 * len, -0.115, 1, 1, 1, 0.45, 0, 0); }
      if (hs === 3) { blob(0, 0.07, -0.082, 0.078 * wd, 0.15, 0.03); for (const sx of [-1, 1]) blob(sx * 0.083 * wd, 0.06, 0.0, 0.016, 0.1, 0.04); }
      if (hs === 4 && !helmet) for (let i = 0; i < 14; i++) { const a = i * 2.399; blob(Math.cos(a) * 0.068 * wd, 0.19 + 0.05 * ((i * 7) % 5) / 5, Math.sin(a) * 0.08, 0.034, 0.034, 0.034); }
    }
    // ---- headwear: the akubra, or the helmet with a dark band (as in the owner's picture)
    if (out === "stable") {
      const bc = "#7b5a39";
      putL("head", loft([[0.198 * len, 0.098 * wd, 0.108, 0, 0], [0.205 * len, 0.16, 0.17, 0, 0.012], [0.192 * len, 0.215, 0.225, 0, 0.016], [0.188 * len, 0.219, 0.23, 0, 0.016]], 22, true, true), bc);
      putL("head", loft([[0.2 * len, 0.093 * wd, 0.103, 0, 0], [0.26 * len, 0.094 * wd, 0.104, 0, 0], [0.3 * len, 0.085 * wd, 0.094, 0, 0], [0.31 * len, 0.06 * wd, 0.07, 0, 0]], 18, true, false), bc);
      putL("head", loft([[0.2 * len, 0.0945 * wd, 0.1045, 0, 0], [0.222 * len, 0.0945 * wd, 0.1045, 0, 0]], 18, false, false), "#2a2018");
    } else {
      const hc = jacket ? C.shirt : "#1d2a44";
      putL("head", loft([[0.16 * len, 0.087 * wd, 0.106, 0, -0.002], [0.19 * len, 0.088 * wd, 0.109, 0, -0.003], [0.225 * len, 0.079 * wd, 0.101, 0, -0.006], [0.258 * len, 0.055 * wd, 0.077, 0, -0.01], [0.275 * len, 0.025 * wd, 0.04, 0, -0.012]], 18, true, true), hc);
      putL("head", loft([[0.185 * len, 0.0895 * wd, 0.111, 0, -0.003], [0.198 * len, 0.0895 * wd, 0.111, 0, -0.003]], 18, false, false), "#101418");   // dark band
      put("head", sphere(), "#101418", 0, 0.172 * len, 0.103, 0.077 * wd, 0.007, 0.052, 0.12, 0, 0);                                                           // peak
    }
    const attach = { pelvis: P.pelvis, torso: P.torsoG, head: P.headG, uarmL: P.armL.sh, uarmR: P.armR.sh, farmL: P.armL.el, farmR: P.armR.el, thighL: P.legL.hip, thighR: P.legR.hip, shinL: P.legL.knee, shinR: P.legR.knee, footL: P.legL.ankle, footR: P.legR.ankle };
    for (const k in attach) {
      const list = J[k]; if (!list || !list.length) continue; const geo = mergeGeos(list); o.dressedGeos.push(geo);
      const m = new THREE.Mesh(geo, o.mat); m.castShadow = true; m.frustumCulled = true; attach[k].add(m); o.meshes[k] = m; o.dressed.push(m);
    }
    o.hip = 0.94;
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
    if (!moving && !pivot && !act) {                                                      // idle: breathing, and now and then a look round, a weight shift or a hand on the hip
      if (I.mode) { I.gt += dt; if (I.gt >= I.dur) { I.mode = ""; I.t = 4 + Math.random() * 5; } else gv = Math.sin(Math.PI * I.gt / I.dur); }
      else { I.t -= dt; if (I.t <= 0) { I.mode = ["look", "shift", "hip", "look", "shift"][(Math.random() * 5) | 0]; I.gt = 0; I.dur = 2.4 + Math.random() * 1.6; I.dir = Math.random() < 0.5 ? -1 : 1; } }
    } else if (I.mode) { I.mode = ""; I.t = 3 + Math.random() * 3; }
    const g = (a, t, r) => a + (t - a) * Math.min(1, dt * r);
    // targets
    let shL = 0, shR = 0, elL = -0.1, elR = -0.1, torX = 0, torY = 0, torZ = 0, pelY = 0, pelZ = 0, pelX = 0, headX = 0, headY = 0, headZ = 0, hipLx = 0, hipRx = 0, kneeL = 0, kneeR = 0, ankL = 0, ankR = 0, bob = 0, hipDrop = 0;
    const lean = o.lean; o.lean += (clampN(-o.turn * Math.min(1, sp / 3) * 0.1, -0.16, 0.16) - lean) * Math.min(1, dt * 6);
    if (moving || pivot) {
      const stride = pivot ? 0.26 : eff < 3.4 ? 0.5 : 0.82, kb = 0.5 + 0.75 * run;
      hipLx = s * stride * k; hipRx = -s * stride * k;
      kneeL = (Math.max(0, -c) * kb + 0.1 * Math.max(0, s) * (1 - run)) * k; kneeR = (Math.max(0, c) * kb + 0.1 * Math.max(0, -s) * (1 - run)) * k;
      ankL = clampN(-(hipLx + kneeL), -0.9, 0.9) * 0.9 + (c > 0 ? 0 : 0.0) + 0.25 * Math.max(0, s) * k; ankR = clampN(-(hipRx + kneeR), -0.9, 0.9) * 0.9 + 0.25 * Math.max(0, -s) * k;     // flat foot while it carries weight, toe-off at the back
      shL = -s * stride * 0.85 * k; shR = s * stride * 0.85 * k; elL = -(0.2 + 0.9 * run) * k - 0.1 * (1 - k); elR = elL;
      torY = s * (0.14 + 0.1 * run) * k; torX = 0.04 + 0.2 * run; torZ = c * 0.025 * k; pelY = -s * 0.09 * k; pelZ = c * 0.04 * k; pelX = c * 0.012 * k; bob = Math.abs(Math.sin(o.phase)) * (0.02 + 0.04 * run) * k;
      headY = -torY * 0.6 - pelY * 0.3; headX = -torX * 0.6;
    } else {
      const b = Math.sin(o.idleT * 1.5), look = I.mode === "look" ? 1 : 0, shift = I.mode === "shift" ? 1 : 0, hip = I.mode === "hip" ? 1 : 0;
      shL = 0.03 * b; shR = -0.03 * b; elL = -0.1 + 0.02 * b; elR = elL; torX = 0.012 * b; pelX = shift * gv * 0.03 * I.dir; pelZ = shift * gv * 0.035 * I.dir; headY = Math.sin(o.idleT * 0.45) * 0.1 + look * gv * 0.7 * I.dir; headX = look * gv * -0.1 + 0.02 * b;
      torY = look * gv * 0.18 * I.dir; kneeL = shift * gv * (I.dir > 0 ? 0.1 : 0) ; kneeR = shift * gv * (I.dir < 0 ? 0.1 : 0);
      if (hip) { if (I.dir > 0) { shR = -0.2 * gv; elR = -0.2 - 1.1 * gv; } else { shL = -0.2 * gv; elL = -0.2 - 1.1 * gv; } }
    }
    // ---- actions override the arms, the torso and the head
    if (act) {
      const t = A.t, ease = Math.min(1, t * 3);
      if (act === "brush") { const sw = Math.sin(t * 7.5), rr = Math.sin(t * 3.2); shR = -1.2 + 0.2 * sw; elR = -0.75 - 0.35 * sw + 0.1 * rr; shL = -0.5; elL = -0.8; torX = 0.17 * ease; torY = 0.15 * ease; headX = 0.2; headY = -0.15 * ease; }
      else if (act === "feed") { const pour = Math.min(1, Math.max(0, (t - 0.6) / 1.2)); shR = -0.95; shL = -0.95; elR = -0.7; elL = -0.7; torX = 0.14 * ease; headX = 0.25; if (o.props.bucket) o.props.bucket.rotation.x = -0.9 * pour; }
      else if (act === "pat") { const p2 = Math.sin(t * 6); shR = -0.9 + 0.12 * p2; elR = -0.55 - 0.18 * p2; torX = 0.1 * ease; headX = 0.1; }
      else if (act === "inspect") { shR = -0.7 + 0.1 * Math.sin(t * 2); elR = -0.9; shL = -0.25; elL = -1.0; torX = 0.2 * ease; headX = 0.35; headY = Math.sin(t * 1.4) * 0.25; }
      else if (act === "tack") { const f = Math.sin(t * 4.5), f2 = Math.sin(t * 3.1 + 1); shR = -1.0 + 0.1 * f; elR = -0.9 + 0.2 * f2; shL = -0.9 + 0.1 * f2; elL = -0.8 - 0.2 * f; torX = 0.13 * ease; headX = 0.2; torY = 0.08 * Math.sin(t * 1.3); }
      else if (act === "lead") { shR = -0.62; elR = -1.0; torX = 0.04; }
      else if (act === "wave") { shR = -2.5 + 0.1 * Math.sin(t * 9); elR = -0.4 + 0.5 * Math.sin(t * 9); }
      else if (act === "drive") { shR = -0.95; shL = -0.95; elR = -0.45; elL = -0.45; headX = 0; }
      if (o.props.brush) o.props.brush.rotation.x = act === "brush" ? 0.7 : 0;
    } else if (o.props.bucket) o.props.bucket.rotation.x = 0;
    // ---- apply with a little smoothing (so a switch never pops)
    const R = 14;
    P.legL.hip.rotation.x = g(P.legL.hip.rotation.x, hipLx, R); P.legR.hip.rotation.x = g(P.legR.hip.rotation.x, hipRx, R);
    P.legL.knee.rotation.x = g(P.legL.knee.rotation.x, kneeL, R); P.legR.knee.rotation.x = g(P.legR.knee.rotation.x, kneeR, R);
    P.legL.ankle.rotation.x = g(P.legL.ankle.rotation.x, ankL, R); P.legR.ankle.rotation.x = g(P.legR.ankle.rotation.x, ankR, R);
    P.armL.sh.rotation.x = g(P.armL.sh.rotation.x, shL, R); P.armR.sh.rotation.x = g(P.armR.sh.rotation.x, shR, R); P.armL.el.rotation.x = g(P.armL.el.rotation.x, elL, R); P.armR.el.rotation.x = g(P.armR.el.rotation.x, elR, R);
    P.armL.sh.rotation.z = g(P.armL.sh.rotation.z, 0.04 + 0.1 * run * k, 8); P.armR.sh.rotation.z = g(P.armR.sh.rotation.z, -0.04 - 0.1 * run * k, 8);
    P.torsoG.rotation.x = g(P.torsoG.rotation.x, torX, 10); P.torsoG.rotation.y = g(P.torsoG.rotation.y, torY, 10); P.torsoG.rotation.z = g(P.torsoG.rotation.z, torZ, 10);
    P.pelvis.rotation.y = g(P.pelvis.rotation.y, pelY, 10); P.pelvis.rotation.z = g(P.pelvis.rotation.z, pelZ, 10); P.pelvis.position.x = g(P.pelvis.position.x, pelX, 10); P.pelvis.position.y = o.hip + bob - (act === "brush" || act === "feed" ? 0.01 : 0);
    P.headG.rotation.x = g(P.headG.rotation.x, headX, 10); P.headG.rotation.y = g(P.headG.rotation.y, headY, 8); P.headG.rotation.z = g(P.headG.rotation.z, -torZ * 0.5, 8);
    o.body.rotation.z = o.lean;
  }
  function dispose(o) { if (!o) return; for (const g of o.dressedGeos || []) g.dispose(); for (const g of o.geos) g.dispose(); o.mat.dispose(); o.mats.length = 0; if (o.root.parent) o.root.parent.remove(o.root); }
  function disposeShared() {}
  return { make, pose, act, dispose, disposeShared, SKINS, HAIRS, HAIR_STYLES, FACES, OUTFITS, BUILDS, DEFAULT };
})();
