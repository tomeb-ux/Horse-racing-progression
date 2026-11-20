'use strict';
/* =====================================================================
   FINAL FURLONG — THE 3D RACING STABLE
   A professional Australian thoroughbred racing yard: a timber-and-steel stable block with a concrete aisle, five
   loose boxes along one side, a tack wall (saddle racks, bridle hooks, feed bins, hay), a trophy corner and, at the
   open end, a rubber-floored grooming / presentation bay lit by daylight through the big doors.

   It is its own THREE.Scene drawn by the game's renderer whenever a Career screen is open. The horses are the game's
   real procedural horse models (buildHorse — same anatomy, coat shading, markings, silks and skeleton as in a race),
   so what you see here is exactly what races.

   Camera: orbit the bay horse (drag), zoom (wheel / pinch / buttons), presets (full body, head, legs, silks), reset.
   Picking: click a stall to open that horse, click a trophy to inspect it.
   Performance: shared geometries + instancing for repeated props, one shadow-casting light, canvas textures built once,
   and every preview horse is disposed when replaced (no GPU growth when the creator is used repeatedly).
   ===================================================================== */
const STABLE3D = (() => {
  let scene = null, cam = null, built = false, active = false, mode = "bay";
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  // layout (metres). The building runs along x: stalls + tack wall at the west end, the grooming bay at the east end
  const BX0 = -21, BX1 = 13, BZ = 8, WALL_H = 4.4, RIDGE = 7.8;
  const STALL_X = [-3.8, -7.4, -11.0, -14.6, -18.2], STALL_Z0 = 4.0, STALL_W = 3.6, STALL_D = 4.0;
  const BAY = new THREE.Vector3(6.2, 0, 0);
  const stallHorses = [null, null, null, null, null], stallDefs = [null, null, null, null, null], plaques = [];
  let bayHorse = null, bayDef = null, bayShowRider = false, trophyGroup = null, trophyItems = [], hoverObj = null;
  let onPick = null;
  // orbit camera
  const orbit = { tx: 6.2, ty: 1.15, tz: 0, yaw: -1.2, pitch: 0.16, dist: 5.6, gtx: 6.2, gty: 1.15, gtz: 0, gyaw: -1.2, gpitch: 0.16, gdist: 5.6, min: 1.6, max: 9.5, pmin: -0.08, pmax: 1.15 };
  const PRESETS = {
    full: { t: [6.35, 1.1, 0], yaw: -1.3, pitch: 0.12, dist: 6.6 },
    head: { t: [7.5, 1.8, 0], yaw: -0.6, pitch: 0.05, dist: 2.3 },
    legs: { t: [6.2, 0.45, 0], yaw: -1.4, pitch: 0.1, dist: 3.8 },
    silks: { t: [6.3, 1.85, 0], yaw: -1.2, pitch: 0.14, dist: 4.6 },
    rear: { t: [5.8, 1.2, 0], yaw: -2.5, pitch: 0.16, dist: 5.4 },
    stalls: { t: [-11.0, 0.55, 5.0], yaw: -Math.PI / 2, pitch: 0.16, dist: 12.2, lock: true, fov: 62 },
    trophy: { t: [-4.6, 1.85, -7.6], yaw: 1.45, pitch: 0.06, dist: 5.6, lock: true, fov: 44 },
  };
  let drag = null; const pts = new Map(); let pinch0 = null;

  // ---------- materials & textures (built once) ----------
  const M = {};
  function tex(w, h, draw, rx, ry) { return canvasTex(w, h, draw, rx, ry); }
  const rnd = (() => { let a = 1234567; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  function makeMaterials() {
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o));
    M.concrete = std({ map: tex(512, 512, (g, w, h) => { g.fillStyle = "#9b9890"; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const c = 130 + rnd() * 50 | 0; g.fillStyle = `rgba(${c},${c - 3},${c - 8},${0.08 + rnd() * 0.12})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); }
      g.strokeStyle = "rgba(60,58,54,.35)"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); }, 8, 4), roughness: 0.92 });
    M.rubber = std({ map: tex(256, 256, (g, w, h) => { g.fillStyle = "#2a2b2c"; g.fillRect(0, 0, w, h); g.fillStyle = "#333536"; for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 8; x < w; x += 16) { g.beginPath(); g.arc(x + 4, y + 4, 3.2, 0, 7); g.fill(); }
      g.strokeStyle = "#1a1b1c"; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2); }, 6, 6), roughness: 0.95 });
    const plank = (base, dark, vertical) => tex(512, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h); const n = 8, bw = w / n;
      for (let i = 0; i < n; i++) { const sh = (rnd() - 0.5) * 26; g.fillStyle = `rgba(${sh > 0 ? 255 : 0},${sh > 0 ? 235 : 0},${sh > 0 ? 200 : 0},${Math.abs(sh) / 255})`; g.fillRect(i * bw, 0, bw, h);
        for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(60,35,15,${0.05 + rnd() * 0.08})`; g.lineWidth = 1; g.beginPath(); const x = i * bw + rnd() * bw; g.moveTo(x, 0); g.bezierCurveTo(x + rnd() * 6 - 3, h * 0.3, x + rnd() * 6 - 3, h * 0.7, x + rnd() * 4 - 2, h); g.stroke(); }
        g.fillStyle = dark; g.fillRect(i * bw, 0, 2, h); }
      if (!vertical) { /* rotated by uv below */ }
    }, 1, 1);
    M.timber = std({ map: plank("#8a5f3a", "#3e2814"), roughness: 0.78 });
    M.timberDark = std({ map: plank("#5f3d22", "#2a180b"), roughness: 0.8 });
    M.wallPaint = std({ map: tex(256, 256, (g, w, h) => { g.fillStyle = "#e7e1d3"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(150,140,120,${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } }, 4, 2), roughness: 0.9 });
    M.steel = std({ color: 0x3b4146, roughness: 0.5, metalness: 0.55 });
    M.steelLight = std({ color: 0x9aa3a8, roughness: 0.35, metalness: 0.7 });
    M.green = std({ color: 0x1f4a33, roughness: 0.6 });                                    // stable-door green
    M.straw = std({ map: tex(256, 256, (g, w, h) => { g.fillStyle = "#b99a55"; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const c = rnd(); g.strokeStyle = c < 0.5 ? "rgba(225,196,120,.7)" : c < 0.8 ? "rgba(160,124,62,.6)" : "rgba(240,220,160,.5)"; g.lineWidth = 1 + rnd(); g.beginPath(); const x = rnd() * w, y = rnd() * h, a = rnd() * 6.3, l = 6 + rnd() * 16; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }, 2, 2), roughness: 1 });
    M.hay = std({ map: tex(256, 256, (g, w, h) => { g.fillStyle = "#a8a061"; g.fillRect(0, 0, w, h); for (let i = 0; i < 2200; i++) { g.strokeStyle = rnd() < 0.6 ? "rgba(200,190,110,.7)" : "rgba(120,110,55,.6)"; g.lineWidth = 1.2; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + 14 * (rnd() - 0.5), y + 3 * (rnd() - 0.5)); g.stroke(); } g.fillStyle = "rgba(90,70,40,.8)"; g.fillRect(0, h * 0.3, w, 4); g.fillRect(0, h * 0.7, w, 4); }, 1, 1), roughness: 1 });
    M.roof = std({ map: tex(256, 64, (g, w, h) => { const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, "#8c9396"); grd.addColorStop(0.5, "#b8bec0"); grd.addColorStop(1, "#8c9396"); for (let y = 0; y < h; y += 16) { g.fillStyle = grd; g.fillRect(0, y, w, 16); } }, 1, 24), roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide });
    M.leather = std({ color: 0x5a2f17, roughness: 0.5 });
    M.leatherDark = std({ color: 0x24140a, roughness: 0.55 });
    M.bucketBlue = std({ color: 0x2457a6, roughness: 0.55 });
    M.bucketBlack = std({ color: 0x1b1c1e, roughness: 0.6 });
    M.feedBin = std({ color: 0x6a7d74, roughness: 0.45, metalness: 0.5 });
    M.glow = new THREE.MeshBasicMaterial({ color: 0xfff6e2 });
    M.window = new THREE.MeshBasicMaterial({ color: 0xe9f1f4 });
    M.outside = new THREE.MeshBasicMaterial({ map: tex(512, 256, (g, w, h) => { const sky = g.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, "#9cc4e6"); sky.addColorStop(1, "#dfeaf0"); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = "#4f6e3b"; for (let i = 0; i < 26; i++) { const x = rnd() * w, r = 18 + rnd() * 30; g.beginPath(); g.arc(x, h * 0.6 - r * 0.3, r, 0, 7); g.fill(); }
      g.fillStyle = "#7fa456"; g.fillRect(0, h * 0.6, w, h); g.strokeStyle = "#f2efe6"; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h * 0.72); g.lineTo(w, h * 0.72); g.moveTo(0, h * 0.78); g.lineTo(w, h * 0.78); g.stroke();
      for (let x = 10; x < w; x += 34) { g.fillStyle = "#f2efe6"; g.fillRect(x, h * 0.69, 3, h * 0.13); } }) });
    M.gold = new THREE.MeshStandardMaterial({ color: 0xd9a933, roughness: 0.22, metalness: 0.95 });
    M.silver = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.2, metalness: 0.95 });
    M.plinth = std({ color: 0x1d1a17, roughness: 0.35 });
    M.felt = std({ color: 0x173326, roughness: 1 });
    M.halter = std({ color: 0x1d3a72, roughness: 0.6 });
  }
  const G = {};
  function sharedGeos() {
    G.box = new THREE.BoxGeometry(1, 1, 1);
    G.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    G.bar = new THREE.CylinderGeometry(0.018, 0.018, 1, 6);
    G.bucket = new THREE.CylinderGeometry(0.17, 0.13, 0.3, 16, 1, true);
    G.cone = new THREE.ConeGeometry(0.28, 0.22, 20, 1, true);
    G.plane = new THREE.PlaneGeometry(1, 1);
    G.torus = new THREE.TorusGeometry(0.12, 0.012, 6, 20);
    const cup = []; [[0, 0], [0.11, 0], [0.11, 0.03], [0.04, 0.05], [0.025, 0.12], [0.03, 0.17], [0.1, 0.22], [0.15, 0.32], [0.16, 0.42], [0.15, 0.43]].forEach(p => cup.push(new THREE.Vector2(p[0], p[1])));
    G.cup = new THREE.LatheGeometry(cup, 28);
    G.handle = new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI);
  }
  const add = (geo, mat, x, y, z, sx, sy, sz, ry, opts) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx || 1, sy || 1, sz || 1); if (ry) m.rotation.y = ry;
    m.receiveShadow = true; m.castShadow = !(opts && opts.noShadow); scene.add(m); return m;
  };
  // UVs scaled to world size so plank / concrete textures keep a constant density on any box
  function worldBox(mat, x0, y0, z0, x1, y1, z1, opts) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, pos = geo.attributes.position, nor = geo.attributes.normal, k = (opts && opts.uvk) || 0.4;
    for (let i = 0; i < uv.count; i++) {
      const px = pos.getX(i) + w / 2, py = pos.getY(i) + h / 2, pz = pos.getZ(i) + d / 2, ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
      if (ax > 0.5) uv.setXY(i, pz * k, py * k); else if (ay > 0.5) uv.setXY(i, px * k, pz * k); else uv.setXY(i, px * k, py * k);
    }
    const m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.receiveShadow = true; m.castShadow = !(opts && opts.noShadow); scene.add(m); return m;
  }
  function textPlaque(lines, w, h, bg, fg) {
    return new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2, map: tex(512, Math.round(512 * h / w), (g, W, H) => {
      g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = "#c8a24a"; g.lineWidth = 8; g.strokeRect(6, 6, W - 12, H - 12);
      g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
      lines.forEach((l, i) => { g.font = (i === 0 ? "700 " : "500 ") + Math.round(H * (i === 0 ? 0.34 : 0.2)) + "px Archivo, Inter, sans-serif"; g.fillText(l, W / 2, H * (lines.length === 1 ? 0.52 : i === 0 ? 0.4 : 0.74), W - 30); });
    }) });
  }

  // ---------- the building ----------
  function build() {
    if (built) return; built = true;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0xd8e4ec);
    cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 200);
    makeMaterials(); sharedGeos();
    // light: soft daylight through the big east doors + windows, gentle warm overheads, neutral fill. One shadow caster.
    scene.add(new THREE.HemisphereLight(0xe8eef2, 0x5c4c3a, 0.5));
    const sun = new THREE.DirectionalLight(0xfff4e6, 0.95); sun.position.set(26, 16, -9); sun.target.position.set(4, 0, 0); scene.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 14, bottom: -14, near: 4, far: 70 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfe7ff, 0.28); fill.position.set(-6, 5, -12); scene.add(fill);
    const fill2 = new THREE.DirectionalLight(0xfff0dc, 0.16); fill2.position.set(2, 6, 14); scene.add(fill2);
    for (const [x, z] of [[6.2, 0], [-5, 0], [-15, 0]]) { const p = new THREE.PointLight(0xfff0d8, 0.32, 14, 2); p.position.set(x, 3.7, z); scene.add(p); }
    // floor: concrete aisle, rubber in the bay
    worldBox(M.concrete, BX0, -0.2, -BZ, BX1, 0, BZ, { uvk: 0.12, noShadow: true });
    worldBox(M.rubber, 1.6, 0, -4.6, 11.4, 0.025, 4.6, { uvk: 0.25, noShadow: true });
    // outside: paddock + sky beyond the open doors
    const out = add(G.plane, M.outside, BX1 + 18, 6, 0, 60, 26, 1, -Math.PI / 2, { noShadow: true }); out.receiveShadow = false;
    const grass = add(G.plane, new THREE.MeshStandardMaterial({ color: 0x6f9b4a, roughness: 1 }), BX1 + 14, -0.05, 0, 30, 60, 1, 0, { noShadow: true }); grass.rotation.x = -Math.PI / 2;
    // walls: timber dado, painted upper wall, windows; the east end is mostly open (sliding doors drawn back)
    const wallZ = (z) => { worldBox(M.timberDark, BX0, 0, z - 0.1, BX1, 1.4, z + 0.1); worldBox(M.wallPaint, BX0, 1.4, z - 0.08, BX1, WALL_H, z + 0.08, { uvk: 0.25 }); };
    wallZ(BZ); wallZ(-BZ);
    worldBox(M.timberDark, BX0 - 0.1, 0, -BZ, BX0 + 0.1, 1.4, BZ); worldBox(M.wallPaint, BX0 - 0.08, 1.4, -BZ, BX0 + 0.08, WALL_H, BZ);
    for (const s of [-1, 1]) { worldBox(M.timberDark, BX1 - 0.1, 0, s * 3.2, BX1 + 0.1, WALL_H, s * BZ); }   // door jambs: opening |z| < 2.9
    worldBox(M.timberDark, BX1 - 0.1, 3.6, -3.2, BX1 + 0.1, WALL_H, 3.2);
    for (const s of [-1, 1]) { const d = worldBox(M.green, BX1 + 0.12, 0.02, s * 3.3, BX1 + 0.22, 3.55, s * 6.4); d.castShadow = false; }   // doors slid open
    // clerestory windows (bright frosted panes) along the south wall: daylight
    for (let x = -17; x < 11; x += 4) { add(G.plane, M.window, x, 2.85, -BZ + 0.1, 2.2, 0.9, 1, 0, { noShadow: true }); worldBox(M.timberDark, x - 1.15, 2.36, -BZ + 0.05, x + 1.15, 2.42, -BZ + 0.2, { noShadow: true }); }
    // roof: steel portal frames, purlins, corrugated sheeting, ridge vent
    for (const x of [-20.5, -16.2, -11.9, -7.6, -3.3, 1.0, 12.4]) {
      for (const s of [-1, 1]) { add(G.box, M.steel, x, WALL_H / 2, s * (BZ - 0.25), 0.22, WALL_H, 0.3); const raf = add(G.box, M.steel, x, (WALL_H + RIDGE) / 2, s * BZ / 2, 0.18, 0.28, Math.hypot(BZ, RIDGE - WALL_H) + 0.2); raf.rotation.x = s * Math.atan2(RIDGE - WALL_H, BZ); }
      add(G.box, M.steel, x, WALL_H + 0.5, 0, 0.12, 0.12, BZ * 2 - 0.6, 0, { noShadow: true });
    }
    for (const s of [-1, 1]) { const sheet = add(G.plane, M.roof, (BX0 + BX1) / 2, (WALL_H + RIDGE) / 2 + 0.12, s * BZ / 2, BX1 - BX0 + 1, Math.hypot(BZ, RIDGE - WALL_H) + 0.5, 1, 0, { noShadow: true });
      sheet.rotation.order = "YXZ"; sheet.rotation.x = Math.PI / 2 + s * Math.atan2(RIDGE - WALL_H, BZ); sheet.castShadow = true;
      for (let k = 1; k < 4; k++) { const t = k / 4, pr = add(G.box, M.steelLight, (BX0 + BX1) / 2, WALL_H + (RIDGE - WALL_H) * t - 0.1, s * BZ * (1 - t), BX1 - BX0, 0.08, 0.1, 0, { noShadow: true }); pr.castShadow = false; } }
    worldBox(M.wallPaint, BX0, WALL_H, -0.02, BX0 + 0.05, RIDGE, 0.02, { noShadow: true });
    // gable ends (triangles) so the roof reads from inside
    for (const [x, open] of [[BX0, false], [BX1, true]]) { const sh = new THREE.Shape(); sh.moveTo(-BZ, WALL_H); sh.lineTo(BZ, WALL_H); sh.lineTo(0, RIDGE); sh.lineTo(-BZ, WALL_H);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), open ? M.timberDark : M.wallPaint); m.position.set(x, 0, 0); m.rotation.y = Math.PI / 2; m.material.side = THREE.DoubleSide; scene.add(m); }
    // pendant lights (emissive shades) over the aisle and the bay
    for (const [x, z] of [[6.2, 0], [2.5, 0], [-5, 0], [-11, 0], [-17, 0]]) { add(G.cone, M.steelLight, x, 3.6, z, 1, 1, 1, 0, { noShadow: true }); add(G.box, M.glow, x, 3.5, z, 0.3, 0.02, 0.3, 0, { noShadow: true }); add(G.cyl, M.steel, x, 4.4, z, 0.02, 1.6, 0.02, 0, { noShadow: true }); }
    buildStalls(); buildTackWall(); buildBay(); buildTrophyCorner();
    resize3d();
  }
  function buildStalls() {
    // five loose boxes on the north side: timber kickboards, steel grilles, sliding doors, straw beds
    const z0 = STALL_Z0, z1 = STALL_Z0 + STALL_D;
    const bars = [];
    for (let i = 0; i <= STALL_X.length; i++) {
      const x = -20.0 + i * STALL_W;
      worldBox(M.timber, x - 0.06, 0, z0, x + 0.06, 1.35, z1); add(G.box, M.steel, x, 1.35 + 0.95, (z0 + z1) / 2, 0.08, 0.06, STALL_D);
      for (let k = 0; k < 18; k++) bars.push([x, 1.35 + 0.475, z0 + 0.15 + k * (STALL_D - 0.3) / 17, 0.95]);
      add(G.box, M.steel, x, 1.2, z0 + 0.02, 0.1, 2.4, 0.1);
    }
    STALL_X.forEach((cx, i) => {
      // floor straw bed + a heap in the corner
      const st = add(G.plane, M.straw, cx, 0.03, z0 + STALL_D / 2, STALL_W - 0.15, STALL_D - 0.1, 1, 0, { noShadow: true }); st.rotation.x = -Math.PI / 2;
      add(G.box, M.straw, cx - STALL_W / 2 + 0.55, 0.18, z1 - 0.55, 0.9, 0.36, 0.8);
      // front: kickboard either side of the door opening, grille above, door slid open, name plaque
      worldBox(M.timber, cx - STALL_W / 2, 0, z0 - 0.06, cx - 0.65, 1.3, z0 + 0.06); worldBox(M.timber, cx + 0.65, 0, z0 - 0.06, cx + STALL_W / 2, 1.3, z0 + 0.06);
      for (let k = 0; k < 7; k++) { const x = cx - STALL_W / 2 + 0.12 + k * 0.17; bars.push([x, 1.3 + 0.55, z0, 1.1]); bars.push([cx + 0.7 + k * 0.17, 1.3 + 0.55, z0, 1.1]); }
      add(G.box, M.steel, cx, 2.42, z0, STALL_W, 0.08, 0.08);
      const door = worldBox(M.green, cx - 1.78, 0.05, z0 - 0.2, cx - 0.68, 2.4, z0 - 0.14); door.userData.stall = i;
      add(G.box, M.steel, cx, 2.58, z0 - 0.17, STALL_W + 0.4, 0.06, 0.06);   // door track
      const pm = new THREE.Mesh(G.plane, textPlaque(["Vacant"], 1.4, 0.36, "#1f2a24", "#f2efe6")); pm.position.set(cx + 0.35, 2.78, z0 - 0.1); pm.scale.set(1.3, 0.34, 1); pm.rotation.y = Math.PI; scene.add(pm); plaques[i] = pm;
      // buckets + hay net
      add(G.bucket, M.bucketBlue, cx + STALL_W / 2 - 0.35, 0.95, z1 - 0.3, 1, 1, 1); add(G.box, M.hay, cx + STALL_W / 2 - 0.45, 1.5, z1 - 0.35, 0.5, 0.55, 0.4);
      // invisible click box for the whole stall
      const hit = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(cx, 1.4, z0 + STALL_D / 2); hit.scale.set(STALL_W - 0.2, 2.8, STALL_D); hit.userData.stall = i; scene.add(hit);
    });
    const inst = new THREE.InstancedMesh(G.bar, M.steelLight, bars.length), mm = new THREE.Matrix4();
    bars.forEach((b, i) => { mm.makeScale(1, b[3], 1); mm.setPosition(b[0], b[1], b[2]); inst.setMatrixAt(i, mm); });
    inst.castShadow = true; scene.add(inst);
  }
  function buildTackWall() {
    // south side, west end: tack room wall with saddle racks, bridle hooks, rugs, feed bins and hay
    const z = -BZ + 0.12;
    for (let k = 0; k < 6; k++) {
      const x = -19 + k * 1.5;
      add(G.box, M.timberDark, x, 1.25, z + 0.25, 0.08, 0.06, 0.5);                                  // rack arm
      const sad = add(G.cyl, M.leather, x, 1.38, z + 0.32, 0.5, 0.3, 0.42); sad.rotation.z = Math.PI / 2; sad.scale.set(0.42, 0.55, 0.3);
      add(G.box, M.leatherDark, x, 1.1, z + 0.36, 0.05, 0.42, 0.04);                                  // girth strap
      add(G.box, M.timberDark, x, 2.05, z + 0.05, 0.05, 0.05, 0.12);                                   // bridle hook
      const br = add(G.torus, M.leatherDark, x, 1.86, z + 0.1, 1, 1.6, 1); br.rotation.y = 0;
      add(G.box, M.leatherDark, x, 1.62, z + 0.1, 0.02, 0.5, 0.01, 0, { noShadow: true });
    }
    // rug rail with stable rugs in the yard colours
    add(G.box, M.steel, -9.5, 2.2, z + 0.15, 4.5, 0.05, 0.05);
    for (let k = 0; k < 3; k++) add(G.box, k % 2 ? M.halter : M.green, -11 + k * 1.4, 1.75, z + 0.18, 1.2, 0.9, 0.04);
    // feed bins and hay bales
    for (let k = 0; k < 3; k++) { add(G.box, M.feedBin, -19.2 + k * 0.9, 0.4, -4.6, 0.8, 0.8, 0.7); add(G.box, M.steelLight, -19.2 + k * 0.9, 0.82, -4.6, 0.84, 0.05, 0.74); }
    const bales = [[-20.2, 0.25, 5.4], [-20.2, 0.25, 4.2], [-20.2, 0.75, 4.8]];
    for (const [x, y, z2] of bales) add(G.box, M.hay, x, y, z2, 1.1, 0.5, 0.95);
    for (let k = 0; k < 4; k++) add(G.bucket, k % 2 ? M.bucketBlack : M.bucketBlue, -16 + k * 0.45, 0.15, -6.3, 1, 1, 1);
    // wheelbarrow-ish cart + fork against the wall
    add(G.box, M.green, -14, 0.45, -6.2, 1.1, 0.4, 0.6); add(G.cyl, M.bucketBlack, -14.6, 0.2, -6.2, 0.4, 0.06, 0.4).rotation.x = Math.PI / 2;
    const fork = add(G.cyl, M.timber, -13, 0.85, -6.7, 0.03, 1.7, 0.03); fork.rotation.z = 0.25;
  }
  function buildBay() {
    // grooming / presentation bay: cross-tie posts, a grooming kit, a wash corner, and a jockey silks rack
    add(G.box, M.timberDark, 10.5, 0.45, 6.4, 1.2, 0.9, 0.6);                 // grooming box
    for (let k = 0; k < 4; k++) add(G.box, k % 2 ? M.halter : M.leather, 10.1 + k * 0.25, 0.97, 6.4, 0.18, 0.1, 0.08);
    add(G.bucket, M.bucketBlack, 10.6, 0.15, -5.4, 1, 1, 1); add(G.bucket, M.bucketBlue, 2.2, 0.15, 5.4, 1, 1, 1);
    add(G.cyl, M.steelLight, 1.5, 2.4, 6.75, 0.03, 0.03, 0.4).rotation.x = Math.PI / 2; // hose bracket
    const hose = add(G.torus, M.bucketBlack, 1.5, 2.1, 6.75, 2.2, 2.2, 2.2); hose.rotation.y = 0;
    // back (north) wall of the bay: saddle on its stand, rugs over a rail, hay net, notice board, clock, windows
    const z = BZ - 0.15;
    add(G.box, M.timberDark, 3.0, 0.5, z - 0.35, 0.5, 1.0, 0.08); add(G.box, M.timberDark, 3.0, 1.0, z - 0.6, 0.12, 0.08, 0.6);
    const sd = add(G.cyl, M.leather, 3.0, 1.12, z - 0.6, 1, 1, 1); sd.rotation.x = Math.PI / 2; sd.scale.set(0.42, 0.62, 0.3);
    add(G.box, M.steel, 5.6, 1.6, z - 0.12, 2.6, 0.05, 0.05);
    add(G.box, M.halter, 5.0, 1.15, z - 0.16, 1.1, 0.9, 0.05); add(G.box, M.green, 6.25, 1.2, z - 0.16, 1.0, 0.8, 0.05);
    add(G.box, M.hay, 8.6, 1.5, z - 0.3, 0.55, 0.65, 0.45);
    const nb = add(G.box, M.timberDark, 10.2, 1.9, z - 0.05, 1.3, 0.9, 0.04); nb.castShadow = false;
    add(G.plane, M.window, 10.2, 1.9, z - 0.08, 1.15, 0.75, 1, Math.PI, { noShadow: true });
    const clock = add(G.cyl, M.window, 7.4, 3.3, z - 0.04, 0.42, 0.04, 0.42, 0, { noShadow: true }); clock.rotation.x = Math.PI / 2;
    for (let x = 2; x < 12; x += 3.4) { add(G.plane, M.window, x, 2.95, z - 0.02, 1.8, 0.8, 1, Math.PI, { noShadow: true }); }
  }
  function buildTrophyCorner() {
    // south-east of the stalls: a felt-backed trophy wall with shelves and a spotlight
    const x0 = -7.2, x1 = -2.0, z = -BZ + 0.16;
    worldBox(M.felt, x0, 0.9, z - 0.04, x1, 3.2, z + 0.02, { noShadow: true });
    for (const y of [1.05, 1.85, 2.6]) worldBox(M.timberDark, x0, y - 0.04, z, x1, y, z + 0.42);
    worldBox(M.timberDark, x0, 0, z, x1, 0.9, z + 0.5);
    const tp = new THREE.Mesh(G.plane, textPlaque(["TROPHY ROOM"], 2.4, 0.4, "#11241a", "#e8c35a")); tp.position.set((x0 + x1) / 2, 3.42, z + 0.03); tp.scale.set(2.4, 0.4, 1); scene.add(tp);
    const spot = new THREE.SpotLight(0xfff1d6, 0.9, 9, 0.75, 0.6, 1.5); spot.position.set(-4.6, 3.9, -3.6); spot.target.position.set(-4.6, 1.6, z); scene.add(spot); scene.add(spot.target);
    trophyGroup = new THREE.Group(); scene.add(trophyGroup);
  }

  // ---------- horses ----------
  function disposePreview(g) {
    if (!g) return;
    const u = g.userData;
    (g.parent || scene).remove(g);
    try { disposeHorse(g); } catch (e) {}
    if (u && u._preview) { try { u.hg.geo.dispose(); u.jg.geo.dispose(); if (u.mc) { u.mc.silks.dispose(); u.mc.cap.dispose(); } } catch (e) {} }
  }
  function makeHorse(def, preview) {
    const d = Object.assign({}, def, { _preview: !!preview });
    const g = buildHorse(d, 0); g.userData._preview = !!preview;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  function riderVisible(g, on) {
    const u = g.userData; u.jk.mesh.visible = on; u.jk.whip.visible = on; u.jk.irons.forEach(i => i.m.visible = on); u.jk.reins.forEach(r => r.m ? r.m.visible = on : r.visible = on);
    (u.tack || []).forEach(t => t.visible = on);
  }
  // the horse being created / inspected, standing in the grooming bay. Rebuilt on every appearance change.
  function setBayHorse(def, opts) {
    build(); opts = opts || {};
    if (bayHorse) { disposePreview(bayHorse); bayHorse = null; }
    bayDef = def; if (!def) return;
    bayHorse = makeHorse(def, true);
    bayHorse.position.copy(BAY); bayHorse.rotation.y = 0;
    scene.add(bayHorse);
    bayShowRider = opts.rider != null ? !!opts.rider : bayShowRider;
    riderVisible(bayHorse, bayShowRider);
  }
  function setRider(on) { bayShowRider = !!on; if (bayHorse) riderVisible(bayHorse, bayShowRider); }
  // the five stalls: each owned horse stands in its own box looking out over the aisle; empty boxes say "Vacant"
  let stallSig = "";
  function setStalls(list) {
    build();
    const sig = JSON.stringify((list || []).map(x => x ? [x.def.name, x.def.coat, x.def.look, x.def.silk, x.def.silk2, x.def.silkPat, x.sub] : null));
    if (sig === stallSig) return; stallSig = sig;
    for (let i = 0; i < 5; i++) {
      if (stallHorses[i]) { disposePreview(stallHorses[i]); stallHorses[i] = null; }
      const it = list[i]; stallDefs[i] = it || null;
      plaques[i].material.map.dispose(); plaques[i].material.dispose();
      plaques[i].material = textPlaque(it ? [it.def.name, it.sub || ""] : ["Vacant", i < (list.slots || 5) ? "Create a horse" : "Locked"], 1.4, 0.36, it ? "#1f2a24" : "#2b2b2b", it ? "#f2efe6" : "#9aa29c");
      if (!it) continue;
      const g = makeHorse(it.def, false);           // cached by appearance: no duplicate geometry for an unchanged horse
      g.position.set(STALL_X[i] + (i % 2 ? 0.08 : -0.08), 0, STALL_Z0 + 1.55); g.rotation.y = Math.PI / 2 + (i % 2 ? 0.12 : -0.12);   // head out over the door
      riderVisible(g, false); scene.add(g); stallHorses[i] = g;
      g.userData.idleT = i * 1.7;
    }
  }
  // trophies: real career records only
  function setTrophies(list) {
    build();
    trophyGroup.children.slice().forEach(c => { trophyGroup.remove(c); if (c.userData.plaque) { c.userData.plaque.material.map.dispose(); c.userData.plaque.material.dispose(); } });
    trophyItems = [];
    const x0 = -6.8, perRow = 6;
    (list || []).slice(0, 18).forEach((t, i) => {
      const row = Math.floor(i / perRow), col = i % perRow, y = [1.05, 1.85, 2.6][row] || 2.6;
      const grp = new THREE.Group(); grp.position.set(x0 + col * 0.85, y, -BZ + 0.42);
      const k = t.big ? 1.15 : 0.85;
      const cup = new THREE.Mesh(G.cup, t.gold ? M.gold : M.silver); cup.scale.setScalar(k); cup.castShadow = true; grp.add(cup);
      for (const s of [-1, 1]) { const h = new THREE.Mesh(G.handle, t.gold ? M.gold : M.silver); h.position.set(s * 0.15 * k, 0.33 * k, 0); h.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2; h.scale.setScalar(k); grp.add(h); }
      const base = new THREE.Mesh(G.box, M.plinth); base.scale.set(0.3, 0.08, 0.22); base.position.y = -0.04; grp.add(base);
      const pl = new THREE.Mesh(G.plane, textPlaque([t.title.slice(0, 22), t.sub.slice(0, 30)], 1.2, 0.36, "#141a16", "#e8c35a")); pl.scale.set(0.42, 0.12, 1); pl.position.set(0, -0.04, 0.115); grp.add(pl); grp.userData.plaque = pl;
      grp.userData.trophy = t; cup.userData.trophy = t; trophyGroup.add(grp); trophyItems.push(cup);
    });
  }

  // ---------- camera ----------
  function preset(name, instant) {
    const p = PRESETS[name] || PRESETS.full; mode = name;
    orbit.fov = p.fov || 40;
    orbit.gtx = p.t[0]; orbit.gty = p.t[1]; orbit.gtz = p.t[2]; orbit.gyaw = p.yaw; orbit.gpitch = p.pitch; orbit.gdist = p.dist; orbit.lock = !!p.lock;
    if (instant) Object.assign(orbit, { tx: orbit.gtx, ty: orbit.gty, tz: orbit.gtz, yaw: orbit.gyaw, pitch: orbit.gpitch, dist: orbit.gdist });
  }
  function zoom(f) { orbit.gdist = THREE.MathUtils.clamp(orbit.gdist * f, orbit.min, orbit.lock ? 14 : orbit.max); }
  function updateCam(dt) {
    const k = 1 - Math.exp(-dt * 7);
    for (const a of ["tx", "ty", "tz", "pitch", "dist"]) orbit[a] += (orbit["g" + a] - orbit[a]) * k;
    let dy = orbit.gyaw - orbit.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); orbit.yaw += dy * k;
    const cp = Math.cos(orbit.pitch), af = cam.aspect < 1 ? Math.min(2.1, 0.9 / cam.aspect) : 1, dd = orbit.dist * af;   // portrait screens: step back so the whole horse fits
    let x = orbit.tx + Math.cos(orbit.yaw) * cp * dd, y = orbit.ty + Math.sin(orbit.pitch) * dd, z = orbit.tz + Math.sin(orbit.yaw) * cp * dd;
    // keep the camera inside the building and above the floor
    x = THREE.MathUtils.clamp(x, BX0 + 0.4, BX1 + 6); z = THREE.MathUtils.clamp(z, -BZ + 0.35, BZ - 0.35); y = THREE.MathUtils.clamp(y, 0.18, WALL_H + 1.2);
    cam.position.set(x, y, z); cam.lookAt(orbit.tx, orbit.ty, orbit.tz);
    const f = orbit.fov || 40; if (Math.abs(cam.fov - f) > 0.05) { cam.fov += (f - cam.fov) * k; cam.updateProjectionMatrix(); }
  }
  function resize3d() { if (!cam) return; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
  // the 3D view is the area not covered by the side panel: shift the projection so the subject sits in that area
  let viewShift = 0, viewShiftY = 0;
  function setViewShift(px, py) { viewShift = px || 0; viewShiftY = py || 0; }
  function applyShift() {
    if (!cam) return;
    if (viewShift || viewShiftY) { cam.setViewOffset(innerWidth, innerHeight, viewShift / 2, viewShiftY / 2, innerWidth, innerHeight); } else cam.clearViewOffset();
  }

  // ---------- input ----------
  function pick(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    v2.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, cam);
    const hits = ray.intersectObjects(scene.children.concat(trophyItems), true);
    for (const h of hits) { let o = h.object; while (o) { if (o.userData && (o.userData.stall != null || o.userData.trophy)) return o.userData; o = o.parent; } }
    return null;
  }
  function bindInput() {
    const el = renderer.domElement;
    el.addEventListener("pointerdown", e => { if (!active) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); drag = { x: e.clientX, y: e.clientY, moved: 0 }; if (pts.size === 2) { const a = [...pts.values()]; pinch0 = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), dist: orbit.gdist }; } try { el.setPointerCapture(e.pointerId); } catch (er) {} });
    el.addEventListener("pointermove", e => {
      if (!active) return;
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch0) { const a = [...pts.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); orbit.gdist = THREE.MathUtils.clamp(pinch0.dist * pinch0.d / Math.max(20, d), orbit.min, orbit.max); return; }
      if (drag && pts.size === 1) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        const lim = orbit.lock ? 0.5 : 9;
        orbit.gyaw += dx * 0.008 * (orbit.lock ? 0.4 : 1); orbit.gpitch = THREE.MathUtils.clamp(orbit.gpitch + dy * 0.005, orbit.pmin, orbit.pmax);
        if (orbit.lock) { const p = PRESETS[mode]; if (p) orbit.gyaw = THREE.MathUtils.clamp(orbit.gyaw, p.yaw - lim, p.yaw + lim); }
      } else if (!drag) {
        const u = pick(e.clientX, e.clientY); const hov = u && (u.stall != null ? "s" + u.stall : u.trophy ? u.trophy.id : null);
        el.style.cursor = hov ? "pointer" : orbit.lock ? "default" : "grab"; hoverObj = hov;
      }
    });
    const up = e => { if (!active) return; const wasClick = drag && drag.moved < 6 && pts.size <= 1; pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null;
      if (wasClick && onPick) { const u = pick(e.clientX, e.clientY); if (u) onPick(u.stall != null ? { stall: u.stall, def: stallDefs[u.stall] } : { trophy: u.trophy }); }
      if (!pts.size) drag = null; };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", e => { if (!active) return; e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    addEventListener("resize", resize3d);
  }
  let inputBound = false;

  // ---------- per-frame ----------
  let t = 0;
  function frame(dt) {
    t += dt;
    if (bayHorse) animateHorse(bayHorse, 0, 0, 0, 0, 0, 0, dt, null);
    for (const g of stallHorses) if (g) animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
    updateCam(dt); applyShift();
    const ex = renderer.toneMappingExposure; renderer.toneMappingExposure = 0.74;     // indoor exposure: light coats keep their detail
    renderer.render(scene, cam); renderer.toneMappingExposure = ex;
  }
  return {
    enter(m, opts) { build(); if (!inputBound) { bindInput(); inputBound = true; } active = true; if (m) preset(m, opts && opts.instant); },
    leave() { active = false; renderer.domElement.style.cursor = ""; },
    get active() { return active; }, get mode() { return mode; },
    setBayHorse, setRider, setStalls, setTrophies, preset, zoom, setViewShift,
    onPick(fn) { onPick = fn; },
    frame,
    // for tests / diagnostics
    info() { return { built, active, mode, bay: !!bayHorse, bayName: bayDef && bayDef.name, stalls: stallHorses.map(g => !!g), trophies: trophyItems.length, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, cam: cam && [cam.position.x, cam.position.y, cam.position.z].map(v => +v.toFixed(2)), orbit: { yaw: +orbit.gyaw.toFixed(2), dist: +orbit.gdist.toFixed(2), pitch: +orbit.gpitch.toFixed(2) } }; },
    bayMesh: () => bayHorse,
  };
})();
