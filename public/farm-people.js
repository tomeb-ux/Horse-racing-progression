'use strict';
/* =====================================================================
   FINAL FURLONG — PEOPLE: the player's character (rebuilt in Phase 6)
   A believable stable owner, ~1.8 m tall, built from smooth lofted shapes (egg-shaped head with jaw, brow, nose, lips, eyes and ears; tapered
   torso, arms, hands, legs and boots; hair in six styles) instead of the Phase 5 cylinders. Everything that belongs to one joint is merged into ONE
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
  // Everything is a smooth organic shape: lofted rings for limbs / torso / skull, ellipsoids for joints, features, hair locks and fabric folds;
  // per-vertex colour carries skin tones, shading and fine hair-strand variation.
  function apply(o, app) {
    const A = o.A; if (app) { A.look = Object.assign(A.look, app.look || {}); A.colours = Object.assign(A.colours, app.colours || {}); if (app.outfit) A.outfit = app.outfit; }
    for (const k in o.meshes) { const m = o.meshes[k]; if (m.parent) m.parent.remove(m); } for (const g of o.dressedGeos || []) g.dispose(); o.dressedGeos = []; o.meshes = {}; o.dressed.length = 0;
    const P = o.parts, L = A.look, C = A.colours, out = A.outfit, bld = 1 + (+L.build || 0) * 0.14, skin = L.skin, hair = L.hairCol;
    o.body.scale.set(bld, 1, bld * 0.96);
    const lipC = mixHex(skin, "#a8484f", 0.55), cheekC = mixHex(skin, "#c8736c", 0.1), shadeSkin = shade(skin, -0.14), warm = mixHex(skin, "#d58a78", 0.22), browC = shade(hair, -0.25), dark = "#1b1713", white = "#f6f3ec", lid = shade(skin, -0.06);
    const hairL = new THREE.Color(hair).getHSL({}).l, irisC = hairL > 0.42 ? "#5a86a6" : hairL > 0.22 ? "#6b5238" : "#3b281a";
    const shirtHex = out === "training" ? "#f2efe6" : C.shirt, trouHex = out === "stable" ? C.trousers : out === "training" ? "#d9c9a2" : "#f4f2ea", bootHex = out === "stable" ? C.boots : "#1d1a18";
    const J = {};
    const put = (j, g, hex, x, y, z, sx, sy, sz, rx, ry, rz, v, f) => { (J[j] || (J[j] = [])).push({ g, hex, m: xf(x, y, z, sx, sy, sz, rx, ry, rz), v: v || 0, f: f || 30 }); };
    const putL = (j, g, hex, v, f) => { (J[j] || (J[j] = [])).push({ g, hex, v: v || 0, f: f || 30 }); };
    const ball = (j, hex, x, y, z, rx, ry, rz, v) => put(j, sphere(), hex, x, y, z, rx, ry == null ? rx : ry, rz == null ? rx : rz, 0, 0, 0, v);
    const band = (j, hex, y0, y1, rx, rz, ox, oz, seg) => putL(j, loft([[y0, rx, rz, ox || 0, oz || 0], [y1, rx, rz, ox || 0, oz || 0]], seg || 16, false, false), hex);
    const tall = out !== "stable", jacket = out === "raceday";
    const trouV = out === "stable" ? 0.035 : 0.02;
    // ---- legs
    for (const sd of ["L", "R"]) {
      const sg = sd === "L" ? -1 : 1;
      putL("thigh" + sd, loft([[0.05, 0.094, 0.1, 0, 0], [-0.04, 0.094, 0.1, 0, 0.004], [-0.16, 0.083, 0.088, 0, 0.006], [-0.3, 0.07, 0.074, 0, 0.004], [-0.44, 0.058, 0.062, 0, 0]], 16), trouHex, trouV, 22);
      ball("thigh" + sd, trouHex, 0, 0, 0, 0.088, 0.088, 0.094);
      if (out === "stable") { put("thigh" + sd, box1(), shade(trouHex, -0.2), sg * 0.082, -0.14, 0.0, 0.004, 0.3, 0.012); }   // jeans: side seam
      ball("shin" + sd, tall ? bootHex : trouHex, 0, 0, 0, 0.05, 0.05, 0.052);
      putL("shin" + sd, tall ? loft([[0.02, 0.064, 0.068, 0, 0], [-0.06, 0.066, 0.07, 0, -0.004], [-0.17, 0.064, 0.072, 0, -0.008], [-0.3, 0.052, 0.056, 0, 0], [-0.4, 0.048, 0.052, 0, 0]], 16) : loft([[0.02, 0.058, 0.062, 0, 0], [-0.1, 0.06, 0.066, 0, -0.008], [-0.26, 0.05, 0.056, 0, 0], [-0.37, 0.056, 0.062, 0, 0.004]], 16), tall ? bootHex : trouHex, tall ? 0.015 : trouV, 22);
      if (tall) { band("shin" + sd, shade(bootHex, 0.16), 0.0, 0.025, 0.069, 0.073, 0, 0); }   // boot cuff
      // foot: boot with an arched instep, heel, sole and toe cap
      putL("foot" + sd, loft([[0.04, 0.048, 0.052, 0, 0], [0.0, 0.05, 0.056, 0, 0.002], [-0.04, 0.05, 0.058, 0, 0.0]], 12), bootHex, 0.02);
      ball("foot" + sd, bootHex, 0, -0.045, 0.08, 0.052, 0.036, 0.125, 0.02); ball("foot" + sd, shade(bootHex, 0.12), 0, -0.032, 0.17, 0.042, 0.027, 0.05);
      put("foot" + sd, box1(), "#1c1a16", 0, -0.068, 0.05, 0.098, 0.016, 0.255); put("foot" + sd, box1(), "#222018", 0, -0.058, -0.045, 0.082, 0.032, 0.05);
      if (!tall) put("foot" + sd, sphere(), trouHex, 0, 0.0, 0.0, 0.062, 0.03, 0.066);                                    // jean hem breaking over the boot
    }
    // ---- pelvis, belt, buckle
    putL("pelvis", loft([[-0.13, 0.175, 0.118, 0, 0], [-0.06, 0.18, 0.124, 0, -0.004], [0.02, 0.168, 0.114, 0, 0], [0.08, 0.152, 0.104, 0, 0]], 18, false, false), trouHex, trouV, 22);
    ball("pelvis", trouHex, 0, -0.1, -0.012, 0.172, 0.075, 0.12);
    if (out !== "training") { band("pelvis", out === "stable" ? "#3a2a1a" : "#222", 0.045, 0.085, 0.157, 0.107, 0, 0, 18); put("pelvis", box1(), "#cdb97f", 0, 0.065, 0.108, 0.04, 0.028, 0.012); }
    // ---- torso: ribcage, waist, shoulder slope; neck; collar; shirt details
    const TR = [[-0.03, 0.146, 0.098], [0.07, 0.15, 0.101], [0.19, 0.165, 0.11], [0.31, 0.186, 0.118], [0.4, 0.192, 0.11], [0.46, 0.17, 0.098]];
    const torsoR = y => { for (let i = 0; i < TR.length - 1; i++) if (y <= TR[i + 1][0]) { const t = (y - TR[i][0]) / (TR[i + 1][0] - TR[i][0]); return [TR[i][1] + (TR[i + 1][1] - TR[i][1]) * t, TR[i][2] + (TR[i + 1][2] - TR[i][2]) * t]; } return [TR[TR.length - 1][1], TR[TR.length - 1][2]]; };
    const ts = jacket ? 0.012 : 0, shirtC = jacket ? C.shirt : shirtHex, tv = out === "stable" ? 0.03 : 0.018;
    putL("torso", loft([[-0.03, 0.146 + ts, 0.098 + ts, 0, 0], [0.07, 0.15 + ts, 0.101 + ts, 0, 0.002], [0.19, 0.165 + ts, 0.11 + ts, 0, 0.006], [0.31, 0.186 + ts, 0.118 + ts, 0, 0.006], [0.4, 0.192 + ts, 0.11 + ts, 0, 0.0], [0.46, 0.17 + ts, 0.098 + ts, 0, -0.006], [0.5, 0.118, 0.082, 0, -0.008], [0.54, 0.072, 0.066, 0, -0.006], [0.57, 0.056, 0.056, 0, -0.004]], 20, false, false), shirtC, tv, 20);
    putL("torso", loft([[0.54, 0.05, 0.052, 0, 0.004], [0.62, 0.046, 0.05, 0, 0.012], [0.68, 0.044, 0.048, 0, 0.012]], 14, false, true), skin);                                    // neck
    ball("torso", shade(skin, -0.05), 0, 0.565, 0.036, 0.016, 0.02, 0.016);                                                                                                      // adam's apple
    put("torso", sphere(), shirtC, 0, 0.47, -0.004, 0.2 + ts, 0.05, 0.105, 0, 0, 0, tv);                                                                                      // trapezius slope
    if (jacket) {
      putL("torso", loft([[-0.17, 0.188, 0.14, 0, 0], [-0.05, 0.19, 0.14, 0, 0], [0.04, 0.168, 0.12, 0, 0]], 18, false, true), C.shirt, 0.02);                                         // jacket skirt
      for (const [y0, y1] of [[0.06, 0.12], [0.2, 0.26], [0.33, 0.39]]) { const a = torsoR((y0 + y1) / 2); band("torso", "#f2efe6", y0, y1, a[0] + ts + 0.004, a[1] + ts + 0.004, 0, 0.004, 20); }   // silk hoops
      put("torso", box1(), shade(C.shirt, -0.28), 0, 0.28, 0.123, 0.012, 0.36, 0.008);                                                                                         // front seam
      put("torso", sphere(), "#f2efe6", -0.045, 0.545, 0.06, 0.05, 0.012, 0.035, 0.5, 0.2, 0.5); put("torso", sphere(), "#f2efe6", 0.045, 0.545, 0.06, 0.05, 0.012, 0.035, 0.5, -0.2, -0.5);   // white collar points
    } else {
      put("torso", box1(), shade(shirtC, -0.25), 0, 0.3, 0.113, 0.016, 0.46, 0.008);                                                                                          // button placket
      for (let k = 0; k < 4; k++) ball("torso", shade(shirtC, 0.3), 0, 0.17 + k * 0.1, 0.118, 0.007, 0.007, 0.004);
      const col = out === "training" ? "#c23a3a" : shade(shirtC, 0.08);
      put("torso", sphere(), col, -0.04, 0.565, 0.05, 0.05, 0.014, 0.034, 0.55, 0.25, 0.45); put("torso", sphere(), col, 0.04, 0.565, 0.05, 0.05, 0.014, 0.034, 0.55, -0.25, -0.45);     // collar points
      band("torso", col, 0.53, 0.575, 0.056, 0.058, 0, -0.004, 16);
      if (out === "stable") { put("torso", box1(), shade(shirtC, -0.12), -0.075, 0.33, 0.115, 0.068, 0.07, 0.008); put("torso", box1(), shade(shirtC, -0.2), -0.075, 0.362, 0.117, 0.07, 0.01, 0.006); }
    }
    // ---- arms: sleeves, forearms, hands with fingers
    for (const sd of ["L", "R"]) {
      const sg = sd === "L" ? -1 : 1, sleeve = jacket ? C.shirt : shirtHex, long = out !== "training";
      ball("uarm" + sd, sleeve, 0, 0.0, 0, 0.05, 0.05, 0.05, tv); put("torso", sphere(), sleeve, sg * 0.205, 0.452, -0.002, 0.066, 0.052, 0.066, 0, 0, 0, tv);   // shoulder cap on the torso                                                                                                         // shoulder (deltoid)
      if (long) putL("uarm" + sd, loft([[0.05, 0.058, 0.058, 0, 0], [-0.05, 0.057, 0.058, 0, 0], [-0.16, 0.05, 0.052, 0, 0], [-0.29, 0.044, 0.046, 0, 0]], 14), sleeve, tv, 24);
      else { putL("uarm" + sd, loft([[0.05, 0.058, 0.058, 0, 0], [-0.05, 0.057, 0.058, 0, 0], [-0.13, 0.052, 0.054, 0, 0]], 14), sleeve, tv); putL("uarm" + sd, loft([[-0.12, 0.051, 0.053, 0, 0], [-0.29, 0.043, 0.045, 0, 0]], 14), skin, 0.02); band("uarm" + sd, shade(sleeve, -0.1), -0.125, -0.115, 0.053, 0.055, 0, 0, 14); }
      if (jacket) band("uarm" + sd, "#f2efe6", -0.1, -0.15, 0.052, 0.054, 0, 0, 14);
      ball("farm" + sd, out === "stable" ? shirtHex : jacket ? sleeve : skin, 0, 0, 0, 0.038, 0.038, 0.04);                                                                         // elbow
      putL("farm" + sd, loft([[0.0, 0.043, 0.045, 0, 0], [-0.07, 0.042, 0.046, 0, 0.002], [-0.17, 0.034, 0.038, 0, 0], [-0.265, 0.029, 0.033, 0, 0]], 14), jacket ? sleeve : skin, jacket ? 0.015 : 0.02, 40);
      if (out === "stable") { putL("farm" + sd, loft([[0.012, 0.049, 0.05, 0, 0], [-0.07, 0.047, 0.05, 0, 0.001]], 14, false, false), shirtHex, tv); band("farm" + sd, shade(shirtHex, -0.12), -0.07, -0.082, 0.05, 0.052, 0, 0.001, 14); }   // sleeve rolled to the forearm
      if (jacket) putL("farm" + sd, loft([[-0.04, 0.043, 0.047, 0, 0.002], [-0.2, 0.034, 0.038, 0, 0]], 14, false, false), sleeve);
      const hc = out === "stable" ? skin : out === "training" ? "#2c2c2c" : "#f2efe6", palm = out === "stable" ? warm : hc;
      if (out !== "stable") band("farm" + sd, shade(hc, 0.06), -0.225, -0.27, 0.034, 0.038, 0, 0, 12);                                                                              // glove / cuff
      ball("farm" + sd, palm, 0, -0.3, 0.004, 0.034, 0.027, 0.02);                                                                                                               // palm
      for (let k = 0; k < 4; k++) put("farm" + sd, sphere(), hc, sg * (-0.017 + k * 0.0115), -0.352 + (k === 1 || k === 2 ? -0.006 : 0), 0.006, 0.0075, 0.03, 0.0085, 0.15, 0, 0);     // fingers
      put("farm" + sd, sphere(), hc, sg * -0.033, -0.318, 0.014, 0.0095, 0.026, 0.0095, 0.35, 0, sg * 0.5);                                                                        // thumb
    }
    // ---- head: skull with brow ridge, cheekbones, jaw and chin; ears; eyes with lids and lashes; nose; lips
    const hv = (L.head | 0) % 5, jaw = [1.0, 0.9, 1.14, 0.84, 1.08][hv], len = [1.0, 1.06, 0.97, 1.1, 0.98][hv], wd = [1.0, 0.95, 1.05, 0.91, 1.08][hv];
    const R = (y, rx, rz, oz) => [y * len, rx * wd, rz, 0, oz || 0];
    putL("head", loft([R(0.0, 0.026, 0.04, 0.05), R(0.02, 0.05 * jaw, 0.06, 0.044), R(0.05, 0.068 * (0.9 + 0.1 * jaw), 0.081, 0.03), R(0.09, 0.077, 0.092, 0.012), R(0.13, 0.08, 0.099, 0.0), R(0.17, 0.079, 0.1, -0.003), R(0.205, 0.07, 0.092, -0.006), R(0.232, 0.05, 0.068, -0.01), R(0.245, 0.024, 0.036, -0.012)], 20), skin, 0.015, 60);
    ball("head", skin, 0, 0.006 * len, 0.074, 0.03 * jaw, 0.022, 0.026);                                                                                                         // chin
    for (const sx of [-1, 1]) {
      ball("head", cheekC, sx * 0.045 * wd, 0.085 * len, 0.074, 0.02, 0.016, 0.012);                                                                                              // cheeks
      put("head", sphere(), skin, sx * 0.078 * wd, 0.125 * len, -0.004, 0.0085, 0.027, 0.019); put("head", sphere(), shadeSkin, sx * 0.08 * wd, 0.122 * len, -0.0, 0.004, 0.017, 0.011);   // ears
      ball("head", shade(skin, -0.07), sx * 0.033 * wd, 0.141 * len, 0.0825, 0.0185, 0.0115, 0.01);                                                                                // eye socket shading
      put("head", sphere(), white, sx * 0.033 * wd, 0.141 * len, 0.087, 0.0145, 0.0105, 0.0095); put("head", sphere(), irisC, sx * 0.033 * wd, 0.141 * len, 0.0945, 0.0072, 0.0072, 0.004); put("head", sphere(), dark, sx * 0.033 * wd, 0.141 * len, 0.0975, 0.0035, 0.0035, 0.002);   // eye
      put("head", sphere(), lid, sx * 0.033 * wd, 0.148 * len, 0.0895, 0.0158, 0.0045, 0.0105, 0.3, 0, 0);                                                                       // upper lid
      put("head", sphere(), shade(dark, 0.05), sx * 0.033 * wd, 0.1505 * len, 0.0925, 0.0165, 0.0022, 0.005);                                                                      // lashes
      put("head", sphere(), browC, sx * 0.034 * wd, 0.1625 * len, 0.0895, 0.021, 0.0042, 0.006, 0.3, 0, sx * -0.1, 0.1);                                                          // brows
      put("head", sphere(), lipC, sx * 0.0115, 0.056 * len, 0.0985, 0.011, 0.0055, 0.008, 0, 0, sx * -0.12);                                                                     // upper lip (two lobes)
      ball("head", shade(skin, -0.1), sx * 0.0125, 0.082 * len, 0.098, 0.0075, 0.0055, 0.006);                                                                                    // alae of the nose
      ball("head", "#3a2420", sx * 0.007, 0.0755 * len, 0.1, 0.0035, 0.0028, 0.003);                                                                                              // nostrils
    }
    ball("head", skin, 0, 0.118 * len, 0.092, 0.0105, 0.034, 0.013, 0.0); put("head", sphere(), skin, 0, 0.118 * len, 0.0905, 0.0105, 0.034, 0.013, 0.3, 0, 0);               // nose bridge
    ball("head", warm, 0, 0.081 * len, 0.1055, 0.0135, 0.0115, 0.0135);                                                                                                         // tip
    put("head", sphere(), lipC, 0, 0.041 * len, 0.097, 0.0215, 0.0085, 0.0105, -0.1, 0, 0); put("head", sphere(), shade(lipC, -0.25), 0, 0.0505 * len, 0.0985, 0.021, 0.0016, 0.0045);   // lower lip, mouth line
    // ---- hair: a cap that follows the skull plus layered locks (colours vary slightly lock to lock)
    const hs = L.hair | 0, hv2 = (j, g, x, y, z, sx, sy, sz, rx, ry, rz, t) => put(j, g, shade(hair, (t == null ? 0 : t)), x, y, z, sx, sy, sz, rx, ry, rz, 0.1, 140);
    const helmet = out !== "stable";
    if (hs !== 5) {
      const cap = loft([[0.1 * len, 0.0815 * wd, 0.0985, 0, 0], [0.13 * len, 0.0825 * wd, 0.1025, 0, 0.0], [0.17 * len, 0.082 * wd, 0.1035, 0, -0.003], [0.205 * len, 0.0735 * wd, 0.0955, 0, -0.006], [0.232 * len, 0.054 * wd, 0.0715, 0, -0.01], [0.248 * len, 0.026 * wd, 0.04, 0, -0.012]], 20, true, false);
      if (!helmet) putL("head", cap, hair, 0.1, 140);
      for (const sx of [-1, 1]) hv2("head", sphere(), sx * 0.077 * wd, 0.118 * len, 0.012, 0.011, 0.034, 0.03, 0, 0, 0, -0.1);                                                  // sideburns
      const lock = (x, y, z, sx, sy, sz, rx, ry, rz, t) => { if (!helmet || y < 0.12) hv2("head", sphere(), x, y * len, z, sx, sy, sz, rx, ry, rz, t); };
      if (hs === 0) { for (let k = 0; k < 7; k++) { const a = -0.9 + k * 0.3; lock(Math.sin(a) * 0.07 * wd, 0.19, 0.075 + Math.cos(a) * 0.014, 0.024, 0.02, 0.02, -0.2, 0, 0, (k % 3) * 0.08 - 0.06); } lock(0, 0.1, -0.09, 0.07 * wd, 0.05, 0.02, 0, 0, 0, -0.08); }
      if (hs === 1) { for (let k = 0; k < 6; k++) lock(-0.055 + k * 0.025, 0.2 - k * 0.003, 0.07, 0.034, 0.016, 0.03, -0.3, 0, 0.5, (k % 2) * 0.08); lock(0.03, 0.235, 0.0, 0.07 * wd, 0.02, 0.09, 0, 0, -0.2, 0.06); lock(0, 0.09, -0.085, 0.074 * wd, 0.075, 0.02, 0, 0, 0, -0.08); put("head", box1(), shade(skin, -0.1), -0.026, 0.225 * len, 0.058, 0.002, 0.004, 0.07, 0, 0, 0.0); }
      if (hs === 2) { lock(0, 0.17, -0.098, 0.034, 0.05, 0.03, 0, 0, 0, 0.02); put("head", loft([[0.0, 0.032, 0.032], [-0.08, 0.04, 0.038], [-0.18, 0.034, 0.03], [-0.27, 0.014, 0.012]], 10, true, true), shade(hair, 0.0), 0, 0.15 * len, -0.118, 1, 1, 1, 0.5, 0, 0, 0.1, 140); band("head", "#c23a3a", 0.0, 0.016, 0.03, 0.03, 0, -0.114, 8); for (let k = 0; k < 5; k++) lock(-0.04 + k * 0.02, 0.2, 0.07, 0.03, 0.016, 0.028, -0.2, 0, 0, (k % 2) * 0.07); }
      if (hs === 3) { for (const sx of [-1, 1]) { hv2("head", sphere(), sx * 0.083 * wd, 0.06 * len, 0.0, 0.016, 0.1, 0.04, 0, 0, sx * 0.06, -0.04); hv2("head", sphere(), sx * 0.085 * wd, -0.02 * len, 0.008, 0.012, 0.06, 0.03, 0, 0, sx * 0.1, 0.05); }
        hv2("head", sphere(), 0, 0.07 * len, -0.082, 0.075 * wd, 0.15, 0.03, 0, 0, 0, -0.08); hv2("head", sphere(), 0, -0.05 * len, -0.07, 0.07 * wd, 0.07, 0.03, 0, 0, 0, 0.0); for (let k = 0; k < 6; k++) lock(-0.055 + k * 0.022, 0.2, 0.073, 0.03, 0.016, 0.026, -0.25, 0, 0.3, (k % 2) * 0.08); }
      if (hs === 4) { for (let i = 0; i < 46; i++) { const a = i * 2.399, ring = (i % 3) * 0.02, y = 0.115 + 0.13 * ((i * 37 % 29) / 29); lock(Math.cos(a) * (0.066 + ring) * wd, y + 0.045, Math.sin(a) * (0.085 + ring) * 0.95, 0.027, 0.027, 0.027, 0, 0, 0, ((i * 7) % 5) * 0.04 - 0.08); } }
    }
    // ---- headwear (shaped, not a flat disc)
    if (out === "stable") {                                                                                                                                                    // akubra: sloping brim with a rolled edge, a pinched crown, a leather band
      const bc = "#7b5a39";
      putL("head", loft([[0.198 * len, 0.098 * wd, 0.108, 0, 0], [0.205 * len, 0.15, 0.162, 0, 0.012], [0.195 * len, 0.205, 0.215, 0, 0.016], [0.188 * len, 0.236, 0.245, 0, 0.018], [0.194 * len, 0.239, 0.248, 0, 0.018]], 24, true, true), bc, 0.04, 60);
      putL("head", loft([[0.2 * len, 0.093 * wd, 0.103, 0, 0], [0.235 * len, 0.094 * wd, 0.104, 0, 0], [0.275 * len, 0.09 * wd, 0.1, 0, 0], [0.3 * len, 0.082 * wd, 0.09, 0, 0], [0.31 * len, 0.06 * wd, 0.07, 0, 0], [0.305 * len, 0.03 * wd, 0.04, 0, 0]], 20, true, false), bc, 0.04, 60);
      putL("head", loft([[0.2 * len, 0.0945 * wd, 0.1045, 0, 0], [0.222 * len, 0.0945 * wd, 0.1045, 0, 0]], 20, false, false), "#2a2018"); put("head", box1(), "#2a2018", 0.0, 0.211 * len, 0.106, 0.03, 0.022, 0.006);
      hv2("head", sphere(), 0, 0.2 * len, -0.02, 0.09 * wd, 0.02, 0.1, 0, 0, 0, -0.5);                                                                                               // shadow under the brim
    } else if (out === "training") {
      putL("head", loft([[0.16 * len, 0.087 * wd, 0.106, 0, -0.002], [0.19 * len, 0.087 * wd, 0.108, 0, -0.003], [0.225 * len, 0.078 * wd, 0.1, 0, -0.006], [0.255 * len, 0.053 * wd, 0.075, 0, -0.01], [0.27 * len, 0.025 * wd, 0.04, 0, -0.012]], 20, true, true), "#1d2a44", 0.02);
      put("head", sphere(), "#1d2a44", 0, 0.17 * len, 0.1, 0.075 * wd, 0.007, 0.052, 0.12, 0, 0); put("head", box1(), "#c23a3a", 0, 0.172 * len, -0.0, 0.004, 0.003, 0.2);                                                // peak, band
      put("head", box1(), "#101418", 0.088 * wd, 0.135 * len, 0.0, 0.004, 0.065, 0.012, 0, 0, 0); put("head", box1(), "#101418", -0.088 * wd, 0.135 * len, 0.0, 0.004, 0.065, 0.012);        // chin strap
    } else {
      putL("head", loft([[0.16 * len, 0.087 * wd, 0.106, 0, -0.002], [0.19 * len, 0.088 * wd, 0.109, 0, -0.003], [0.225 * len, 0.079 * wd, 0.101, 0, -0.006], [0.258 * len, 0.055 * wd, 0.077, 0, -0.01], [0.275 * len, 0.025 * wd, 0.04, 0, -0.012]], 20, true, true), C.shirt, 0.02);
      put("head", sphere(), "#14181c", 0, 0.17 * len, 0.103, 0.077 * wd, 0.007, 0.052, 0.12, 0, 0); put("head", sphere(), "#f2efe6", 0, 0.276 * len, -0.012, 0.016, 0.014, 0.016); band("head", "#f2efe6", 0.19 * len, 0.205 * len, 0.0895 * wd, 0.111, 0, -0.003, 20);
      put("head", box1(), "#101418", 0.088 * wd, 0.135 * len, 0.0, 0.004, 0.065, 0.012); put("head", box1(), "#101418", -0.088 * wd, 0.135 * len, 0.0, 0.004, 0.065, 0.012);
    }
    // ---- merge each joint into one mesh
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
