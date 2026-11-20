'use strict';
/* =====================================================================
   FINAL FURLONG — RACECOURSE VENUES
   The original course ("Furlong Park") is built once by index.html and kept in its own group. Real courses built on the
   track engine (sim.js TRACKS / TRACK_DEFS) get their own scenery here, generated from the SAME geometry the simulation
   races on: the turf ribbon, rails, chutes, finish line, markers and gates all come from the track's arc-length tables,
   so what you see is exactly where the horses run.
     • Royal Randwick: the course proper with its sprint chute, a modern multi-tier glass grandstand with a sweeping
       cantilevered canopy, the older stands down the straight, finish post + judge's box + gantry, the infield (trees,
       service roads, maintenance sheds, big screen), boundary trees and a distant city skyline, landmark boards
       ("THE RISE", the top turn, the home turn), and a crowd sized to the meeting (fuller for The Everest and majors).
   Performance: instancing for posts, trees, spectators and seats; one shared material per surface; built lazily the
   first time a race is held there.
   ===================================================================== */
const VENUES = (() => {
  let generic = null, current = null;
  const built = {};
  const P = {}, Q = {};
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const std = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.85 : r, metalness: m || 0 });

  // a ribbon along a function s → point(s, off): u along the course (metres / 12), v across
  function ribbon(fn, s0, s1, off0, off1, y0, y1, steps, vScale) {
    const pos = [], uv = [], idx = [], p = {};
    for (let i = 0; i <= steps; i++) {
      const s = s0 + (s1 - s0) * i / steps;
      fn(s, off0, p); pos.push(p.x, y0, p.z); uv.push(s / 12, 0);
      fn(s, off1, p); pos.push(p.x, y1, p.z); uv.push(s / 12, vScale || 1);
    }
    for (let i = 0; i < steps; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function railLine(group, fn, s0, s1, off, closed, mat, outward) {
    const n = Math.max(4, Math.round(Math.abs(s1 - s0) / 3.2)), inst = new THREE.InstancedMesh(P.postGeo, mat, n), dm = new THREE.Object3D(), p = {};
    for (let i = 0; i < n; i++) { fn(s0 + (s1 - s0) * i / n, off, p); const ax = outward ? p.nx : -p.nx, az = outward ? p.nz : -p.nz; dm.position.set(p.x, 0, p.z); dm.rotation.set(0, Math.atan2(-az, ax), 0); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); }
    group.add(inst);
    const pts = []; const m = Math.max(8, Math.round(Math.abs(s1 - s0) / 4));
    for (let i = 0; i <= m; i++) { fn(s0 + (s1 - s0) * i / m, off, p); pts.push(new THREE.Vector3(p.x, 0, p.z)); }
    if (closed) pts.pop();
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), m, 0.06, 6, closed), mat); tube.position.y = 1.1; group.add(tube);
  }
  // a local frame on the course: lx along the direction of racing, lz towards the infield (outside = negative lz)
  function frameAt(trk, s, off) { const p = trk.point(s, off, {}); return { x: p.x, z: p.z, rot: Math.atan2(-p.hz, p.hx), hx: p.hx, hz: p.hz, nx: p.nx, nz: p.nz }; }
  function placeGroup(g, f) { g.position.set(f.x, 0, f.z); g.rotation.y = f.rot; return g; }
  const box = (g, mat, x, y, z, sx, sy, sz, cast) => { const m = new THREE.Mesh(P.box, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = cast !== false; m.receiveShadow = true; g.add(m); return m; };

  function shared() {
    if (P.box) return;
    P.box = new THREE.BoxGeometry(1, 1, 1);
    const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(0.55, 0, 0), new THREE.Vector3(0.55, 0.7, 0), new THREE.Vector3(0.47, 0.98, 0), new THREE.Vector3(0.24, 1.1, 0), new THREE.Vector3(0, 1.1, 0)]);
    P.postGeo = new THREE.TubeGeometry(neck, 8, 0.038, 5, false);
    P.rail = lam(0xf7f7f2);
    P.turf = new THREE.MeshStandardMaterial({ map: turfTex, color: 0xb5c8a6, roughness: 0.93 });
    P.wear = new THREE.MeshLambertMaterial({ color: 0x3b6b2c, transparent: true, opacity: 0.32, depthWrite: false });
    P.ground = new THREE.MeshStandardMaterial({ map: infieldTex, color: 0xb9c8a8, roughness: 1 });
    P.infield = new THREE.MeshStandardMaterial({ map: infieldTex, color: 0xc9d8b4, roughness: 1 });
    P.road = std(0x7d7f80, 0.95); P.path = std(0xc9bfa6, 0.95);
    P.concrete = std(0xc9ccce, 0.8); P.white = std(0xf4f4f0, 0.6); P.steel = std(0x8a949b, 0.45, 0.5); P.dark = std(0x2b3036, 0.7);
    P.glass = new THREE.MeshStandardMaterial({ map: glassTex, roughness: 0.15, metalness: 0.3 });
    P.facade = new THREE.MeshLambertMaterial({ map: facadeTex });
    P.members = new THREE.MeshLambertMaterial({ map: membersTex });
    P.seatGreen = std(0x1f5a3c, 0.6); P.roofGreen = std(0x2d5b46, 0.7); P.roofTerra = std(0x8e4a34, 0.8);
    P.trunk = lam(0x5a4430); P.leaf = [lam(0x3d6b35), lam(0x4b7a3a), lam(0x2f5a30), lam(0x5d8a45)];
    P.city = new THREE.MeshLambertMaterial({ map: cityTex });
  }

  // ---------- Royal Randwick ----------
  function buildRandwick(trk) {
    shared();
    const G = new THREE.Group(); G.name = "venue-randwick";
    const pt = trk.point, W = trk.W, lap = trk.lap;
    // ground and the infield (a slightly brighter lawn inside the course)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400), P.ground); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; G.add(ground);
    let cx = 0, cz = 0; const poly = []; for (let s = 0; s < lap; s += 8) { const p = pt(s, -1, {}); poly.push([p.x, p.z]); cx += p.x; cz += p.z; } cx /= poly.length; cz /= poly.length;
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const inf = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), P.infield); inf.rotation.x = -Math.PI / 2; inf.position.y = -0.03; inf.receiveShadow = true; G.add(inf);
    const inside = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    // racing surface (course proper) + the worn running line, then the sprint chute
    const track = new THREE.Mesh(ribbon(pt, 0, lap, 0, W, 0.02, 0.02, 900, 3), P.turf); track.receiveShadow = true; G.add(track);
    G.add(new THREE.Mesh(ribbon(pt, 0, lap, 0.3, 4.2, 0.03, 0.03, 600, 1), P.wear));
    const chuteFns = Object.values(trk.chutes).map(c => (s, off, o) => { o.x = c.x - c.hx * s + c.nx * off; o.z = c.z - c.hz * s + c.nz * off; o.hx = c.hx; o.hz = c.hz; o.nx = c.nx; o.nz = c.nz; return o; });
    for (const f of chuteFns) { const m = new THREE.Mesh(ribbon(f, 0, 430, 0, W, 0.019, 0.019, 60, 3), P.turf); m.receiveShadow = true; G.add(m); }
    // running rails: inside and outside of the course proper; the chute has its own outside rail and a short inside one
    railLine(G, pt, 0, lap, -0.05, true, P.rail, false);
    // the outside rail is broken where the chute joins the course
    const cj = Object.values(trk.chutes)[0], cjs = cj ? cj.joinS : -1;
    if (cj) { railLine(G, pt, cjs + 8, cjs - 340 + lap, W + 0.05, false, P.rail, true); }
    else railLine(G, pt, 0, lap, W + 0.05, true, P.rail, true);
    for (const f of chuteFns) { railLine(G, f, 0, 430, W + 0.05, false, P.rail, true); railLine(G, f, 120, 430, -0.05, false, P.rail, false); }
    // service road just inside the course, a cross path, maintenance sheds at the top end
    G.add(new THREE.Mesh(ribbon(pt, 0, lap, -16, -10, 0.0, 0.0, 500, 1), P.road));
    { const a = pt(trk.marks.back + 120, -16, {}), b = pt(lap - 260, -16, {}); const len = Math.hypot(a.x - b.x, a.z - b.z); const m = new THREE.Mesh(P.box, P.path); m.scale.set(len, 0.04, 6); m.position.set((a.x + b.x) / 2, 0.0, (a.z + b.z) / 2); m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); G.add(m); }
    { const f = frameAt(trk, trk.marks.topTurn + 230, -70); const sh = placeGroup(new THREE.Group(), f); box(sh, P.facade, 0, 3, 0, 26, 6, 12); box(sh, P.roofGreen, 0, 6.3, 0, 27, 0.6, 13); box(sh, P.concrete, 34, 2, 6, 14, 4, 9); G.add(sh); }
    // infield trees (instanced), kept away from the course and the camera lines
    const trees = [], rng = mulberry32(2224);
    for (let k = 0; k < 900 && trees.length < 150; k++) {
      const x = cx + (rng() - 0.5) * 900, z = cz + (rng() - 0.5) * 420;
      if (!inside(x, z)) continue;
      let ok = true; for (let s = 0; s < lap; s += 20) { const p = pt(s, 0, Q); if ((p.x - x) ** 2 + (p.z - z) ** 2 < 46 * 46) { ok = false; break; } } if (!ok) continue;
      trees.push([x, z, 0.8 + rng() * 0.7]);
    }
    // boundary trees and an urban edge outside the course (not in front of the grandstand)
    const homeA = lap - 520, homeB = 160;
    for (let s = 0; s < lap; s += 14) {
      if (s > homeA || s < homeB) continue;
      const p = pt(s, W + 60 + rng() * 40, {}); trees.push([p.x, p.z, 0.9 + rng() * 0.8]);
      if (rng() < 0.5) { const q = pt(s + 7, W + 95 + rng() * 30, {}); trees.push([q.x, q.z, 0.9 + rng() * 0.7]); }
    }
    { const trunk = new THREE.CylinderGeometry(0.35, 0.5, 6, 6), crown = new THREE.SphereGeometry(4.2, 9, 7), tI = new THREE.InstancedMesh(trunk, P.trunk, trees.length), dm = new THREE.Object3D();
      const cI = P.leaf.map(m => new THREE.InstancedMesh(crown, m, trees.length)); const cnt = [0, 0, 0, 0];
      trees.forEach(([x, z, s], i) => { dm.position.set(x, 3 * s, z); dm.scale.set(s, s, s); dm.rotation.set(0, i, 0); dm.updateMatrix(); tI.setMatrixAt(i, dm.matrix);
        const k = i % 4; dm.position.set(x, (7 + (i % 3)) * s, z); dm.scale.set(s * (1 + (i % 5) * 0.08), s * (0.85 + (i % 4) * 0.08), s); dm.updateMatrix(); cI[k].setMatrixAt(cnt[k]++, dm.matrix); });
      cI.forEach((m, k) => { m.count = cnt[k]; m.castShadow = true; G.add(m); }); tI.castShadow = true; G.add(tI); }
    // distant city skyline (Sydney to the north-west) and suburban blocks behind the back straight
    { const n = 46, inst = new THREE.InstancedMesh(P.box, P.city, n), dm = new THREE.Object3D();
      for (let i = 0; i < n; i++) { const a = -2.3 + i / n * 1.6 + (rng() - 0.5) * 0.04, r = 1050 + rng() * 260, h = 40 + rng() * (i % 7 === 0 ? 190 : 90);
        dm.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r); dm.scale.set(30 + rng() * 40, h, 30 + rng() * 40); dm.rotation.set(0, rng() * 3, 0); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); }
      G.add(inst); }
    { const n = 60, inst = new THREE.InstancedMesh(P.box, P.facade, n), dm = new THREE.Object3D();
      for (let i = 0; i < n; i++) { const s = trk.marks.back + i / n * (trk.marks.back_end - trk.marks.back + 400) - 200, p = pt(s, W + 170 + rng() * 60, {}); const h = 6 + rng() * 10;
        dm.position.set(p.x, h / 2, p.z); dm.scale.set(14 + rng() * 10, h, 12 + rng() * 6); dm.rotation.set(0, Math.atan2(-p.hz, p.hx), 0); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); }
      G.add(inst); }
    buildStands(G, trk);
    buildFinish(G, trk);
    buildLandmarks(G, trk);
    buildCrowd(G, trk);
    return G;
  }
  // the grandstand precinct down the outside of the home straight
  function buildStands(G, trk) {
    const W = trk.W;
    // the modern main stand: centred just before the post, ~180 m long, four levels, glass, a sweeping canopy
    const f = frameAt(trk, trk.lap - 70, W + 12), S = placeGroup(new THREE.Group(), f); S.name = "QE II stand";
    const L = 180;
    // apron / betting ring between the rail and the stand
    const apron = new THREE.Mesh(P.box, P.concrete); apron.scale.set(L + 120, 0.15, 14); apron.position.set(0, 0.07, -7); apron.receiveShadow = true; S.add(apron);
    // lower terrace: stepped seating rising away from the track
    const rows = 14;
    for (let r = 0; r < rows; r++) box(S, r % 2 ? P.seatGreen : P.concrete, 0, 0.6 + r * 0.42, -15 - r * 0.85, L, 0.42, 0.85, false);
    P.terraceRows = { rows, y0: 0.6, z0: -15 };
    // glass-fronted levels (corporate boxes / members' dining) set back above the terrace
    box(S, P.steel, 0, 7.6, -29, L, 1.0, 10);                       // concourse roof
    for (const [y, z, h] of [[10.6, -30, 4.6], [15.8, -33, 4.6], [21.0, -36, 4.4]]) { const gl = box(S, P.glass, 0, y, z, L - 6, h, 0.4); gl.material = P.glass; box(S, P.concrete, 0, y + h / 2 + 0.3, z + 1.2, L, 0.6, 3.4); box(S, P.facade, 0, y, z - 6, L - 2, h + 0.6, 11); }
    // upper tier of seats on the top level
    for (let r = 0; r < 8; r++) box(S, r % 2 ? P.seatGreen : P.concrete, 0, 24.5 + r * 0.55, -26 - r * 0.9, L - 20, 0.55, 0.9, false);
    // the canopy: a long, thin, gently curved roof cantilevered out over the seats on a row of masts
    // a thin canopy that sweeps up and out over the seats: highest at the front edge, curving down to the back
    const cg = new THREE.PlaneGeometry(L + 10, 44, 1, 22); cg.rotateX(-Math.PI / 2);
    const cp = cg.attributes.position; for (let i = 0; i < cp.count; i++) { const zz = cp.getZ(i), t = (zz + 22) / 44; cp.setY(i, 31 + 6 * t - 3.5 * t * t); }   // t = 1 at the front (track side)
    cg.computeVertexNormals();
    const roof = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.5, side: THREE.DoubleSide })); roof.position.set(0, 0, -34); roof.castShadow = true; S.add(roof);
    const edge = box(S, P.steel, 0, 33.6, -12.2, L + 10, 0.6, 0.6);             // the leading edge beam
    for (let x = -L / 2; x <= L / 2; x += 30) { box(S, P.steel, x, 18, -50, 1.2, 36, 1.2); const tie = box(S, P.steel, x, 34.5, -33, 0.3, 0.3, 36); tie.rotation.x = 0.12; }
    box(S, P.facade, 0, 12, -52, L + 6, 24, 14);                         // back-of-house block
    // the big screen on the top end of the stand, facing the straight
    venueScreen(S, L / 2 + 26, 13, -24);
    G.add(S);
    // the older stands further down the straight: a heritage members' stand with a pitched roof, then a plain stand
    const f2 = frameAt(trk, trk.lap - 250, W + 14), H = placeGroup(new THREE.Group(), f2); H.name = "heritage stand";
    for (let r = 0; r < 9; r++) box(H, r % 2 ? P.seatGreen : P.concrete, 0, 0.6 + r * 0.45, -14 - r * 0.8, 70, 0.45, 0.8, false);
    box(H, P.members, 0, 9, -26, 72, 10, 9);
    const rf = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 74, 3, 1), P.roofTerra); rf.rotation.z = Math.PI / 2; rf.scale.set(1, 1, 1); rf.position.set(0, 15.5, -24); rf.scale.set(1, 6, 9); H.add(rf);
    for (let x = -33; x <= 33; x += 11) box(H, P.white, x, 6, -11.8, 0.5, 12, 0.5);
    box(H, P.roofGreen, 0, 12.4, -15, 74, 0.4, 9);
    G.add(H);
    const f3 = frameAt(trk, 40, W + 14), O = placeGroup(new THREE.Group(), f3); O.name = "lawn stand";
    for (let r = 0; r < 7; r++) box(O, P.concrete, 0, 0.6 + r * 0.45, -13 - r * 0.8, 60, 0.45, 0.8, false);
    box(O, P.facade, 0, 6, -22, 62, 8, 8); box(O, P.white, 0, 10.6, -16, 64, 0.4, 13);
    G.add(O);
  }
  let screenCtx = null, screenTex = null, screenT = 0;
  function venueScreen(S, x, y, z) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 192; screenCtx = c.getContext("2d"); screenTex = new THREE.CanvasTexture(c); screenTex.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 8.25), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })); m.position.set(x, y, z + 0.8); m.rotation.y = 0.35; S.add(m);
    box(S, P.dark, x, y, z, 23, 9.2, 1.4); box(S, P.steel, x, y / 2 - 4.6, z, 1.4, y - 4.6, 1.4);
  }
  function buildFinish(G, trk) {
    const W = trk.W, p1 = trk.point(0, -0.9, {}), p2 = trk.point(0, W + 0.9, {});
    const stripe = canvasTex(32, 128, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#c81e1e"; g.fillRect(0, i * h / 8, w, h / 8); } }, 1, 2);
    const postMat = new THREE.MeshLambertMaterial({ map: stripe });
    [p1, p2].forEach((p, i) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 7.5, 10), postMat); post.position.set(p.x, 3.75, p.z); post.castShadow = true; G.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lam(0xe8c35a)); cap.position.set(p.x, 7.6, p.z); G.add(cap);
      if (i === 0) { G.userData.finishNear = [post, cap]; }
      if (i === 1) { const bx = new THREE.Mesh(P.box, lam(0xe9e4d6)); bx.scale.set(2.6, 2.4, 2.6); bx.position.set(p.x + p.nx * 2.2, 5.2, p.z + p.nz * 2.2); G.add(bx);
        const gl = new THREE.Mesh(P.box, P.glass); gl.scale.set(2.65, 0.9, 2.65); gl.position.copy(bx.position); gl.position.y += 0.3; G.add(gl); }
    });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(W + 2.2, 1.2, 0.12), new THREE.MeshLambertMaterial({ map: boardTex("ROYAL RANDWICK", "#0f3b2a", "#e8c35a") }));
    banner.position.set((p1.x + p2.x) / 2, 6.9, (p1.z + p2.z) / 2); banner.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z) + Math.PI / 2; G.add(banner);
    const pc = trk.point(0, W / 2, {}), line = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.4), lam(0xffffff));
    line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(pc.hz, pc.hx) + Math.PI / 2; line.position.set(pc.x, 0.035, pc.z); G.add(line);
  }
  // landmark boards so each part of the course is recognisable: the top turn, the back, the rise, the home turn
  function buildLandmarks(G, trk) {
    const W = trk.W, lap = trk.lap;
    const sign = (s, text, bg, fg, off, h) => { const p = trk.point(s, off, {}); const m = new THREE.Mesh(new THREE.BoxGeometry(7, 1.8, 0.15), new THREE.MeshLambertMaterial({ map: boardTex(text, bg, fg, 512, 128, 56) }));
      m.position.set(p.x, h || 3.2, p.z); m.rotation.y = Math.atan2(p.hx, p.hz) + Math.PI / 2; G.add(m);
      const pole = new THREE.Mesh(P.box, P.steel); pole.scale.set(0.15, (h || 3.2), 0.15); pole.position.set(p.x, (h || 3.2) / 2, p.z); G.add(pole); };
    sign(lap - 400, "THE RISE", "#7a1d1d", "#ffffff", W + 4);
    sign(trk.marks.homeTurn + 40, "HOME TURN", "#0f3b2a", "#e8c35a", W + 6);
    sign(trk.marks.topTurn + 60, "KENSINGTON END", "#163a63", "#ffffff", W + 6);
    sign(trk.marks.back + 150, "BACK STRAIGHT", "#163a63", "#ffffff", W + 6);
    const cj = Object.values(trk.chutes)[0]; if (cj) { const p = { x: cj.x - cj.hx * 120 + cj.nx * (W + 5), z: cj.z - cj.hz * 120 + cj.nz * (W + 5) }; const m = new THREE.Mesh(new THREE.BoxGeometry(7, 1.8, 0.15), new THREE.MeshLambertMaterial({ map: boardTex("SPRINT CHUTE", "#0f3b2a", "#ffffff", 512, 128, 52) })); m.position.set(p.x, 3, p.z); m.rotation.y = Math.atan2(cj.hx, cj.hz) + Math.PI / 2; G.add(m); }
    // sponsor-free rail boards along the outside of the straight
    for (let s = lap - 390; s < lap - 20; s += 45) { const p = trk.point(s, W + 1.4, {}); const m = new THREE.Mesh(P.box, new THREE.MeshLambertMaterial({ map: boardTex("RANDWICK", "#0f3b2a", "#f2efe6", 256, 64, 34) })); m.scale.set(6, 0.9, 0.08); m.position.set(p.x, 0.6, p.z); m.rotation.y = Math.atan2(p.hx, p.hz) + Math.PI / 2; G.add(m); }
  }
  // spectators: seated on the terraces and upper tier, standing on the apron along the rail and on the lawns
  let crowd = null;
  function buildCrowd(G, trk) {
    const max = settings.crowd === "off" ? 0 : settings.crowd === "light" ? 1800 : 4200; if (!max) return;
    const body = new THREE.CylinderGeometry(0.17, 0.21, 0.95, 6, 1, true), head = new THREE.SphereGeometry(0.13, 6, 4); head.translate(0, 0.62, 0);
    const bI = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0xffffff }), max), hI = new THREE.InstancedMesh(head, new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    const palette = [0x23262b, 0x2f3d55, 0xd23a5a, 0x3fae8f, 0xe8c35a, 0xf2f2ee, 0x7c5a8a, 0xc96f3b, 0x2c6e8a, 0xf2a7b8, 0x1d3557], skins = [0xf1c8a8, 0xd9a582, 0xb07a52, 0x8a5a3a, 0x5e3c28];
    const rng = mulberry32(410), dm = new THREE.Object3D(), col = new THREE.Color(), base = new Float32Array(max * 4), W = trk.W;
    // priority order: rail + lower terrace first (so a moderate crowd still lines the finish), then upper levels and lawns
    for (let i = 0; i < max; i++) {
      const zone = i < max * 0.3 ? 0 : i < max * 0.75 ? 1 : i < max * 0.88 ? 2 : 3;
      let s, off, y;
      if (zone === 0) { s = trk.lap - 260 + rng() * 300; off = W + 1.8 + rng() * 6; y = 1.15; }                       // apron along the rail
      else if (zone === 1) { const r = (rng() * P.terraceRows.rows) | 0; s = trk.lap - 70 + (rng() - 0.5) * 176; off = W + 12 + 15 + r * 0.85; y = P.terraceRows.y0 + r * 0.42 + 0.7; }
      else if (zone === 2) { const r = (rng() * 8) | 0; s = trk.lap - 70 + (rng() - 0.5) * 156; off = W + 12 + 26 + r * 0.9; y = 24.5 + r * 0.55 + 0.7; }
      else { s = trk.lap - 285 + (rng() - 0.5) * 68; const r = (rng() * 9) | 0; off = W + 14 + 14 + r * 0.8; y = 0.6 + r * 0.45 + 0.7; }
      const p = trk.point(s, off, Q), sc = 0.88 + rng() * 0.2;
      base[i * 4] = p.x; base[i * 4 + 1] = y; base[i * 4 + 2] = p.z; base[i * 4 + 3] = sc;
      dm.position.set(p.x, y, p.z); dm.rotation.set(0, Math.atan2(p.nx, p.nz) + Math.PI + (rng() - 0.5) * 0.6, 0); dm.scale.set(sc, sc, sc); dm.updateMatrix();
      bI.setMatrixAt(i, dm.matrix); hI.setMatrixAt(i, dm.matrix);
      bI.setColorAt(i, col.setHex(palette[(rng() * palette.length) | 0]).offsetHSL(0, 0, (rng() - 0.5) * 0.1)); hI.setColorAt(i, col.setHex(skins[(rng() * skins.length) | 0]));
    }
    [bI, hI].forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); if (m.instanceColor) m.instanceColor.needsUpdate = true; G.add(m); });
    crowd = { bI, hI, base, max, count: max, dm, level: 0 };
  }
  function setCrowd(frac) { if (!crowd) return; crowd.count = Math.max(0, Math.min(crowd.max, Math.round(crowd.max * frac))); crowd.bI.count = crowd.hI.count = crowd.count; }

  // ---------- switching venue ----------
  function use(trk, cfg) {
    if (!generic) { generic = typeof VENUE_GENERIC !== "undefined" ? VENUE_GENERIC : null; }
    trk = trk || TRACKS.generic;
    if (trk.analytic) { if (generic) generic.visible = true; for (const k in built) built[k].visible = false; current = null; restoreFinishNear(); return; }
    if (!built[trk.id]) { built[trk.id] = trk.id === "randwick" ? buildRandwick(trk) : buildRandwick(trk); world.add(built[trk.id]); }
    for (const k in built) built[k].visible = k === trk.id;
    if (generic) generic.visible = false;
    current = built[trk.id];
    // a major meeting fills the stands; an ordinary one is a decent midweek crowd
    const c = cfg && cfg.career;
    setCrowd(c && (c.crown || c.major) ? 1 : c && c.official ? 0.62 : 0.5);
    swapFinishNear(current.userData.finishNear || []);
  }
  // the photo-finish view hides the inner finish post (it stands between the camera and the noses)
  let savedNear = null;
  function swapFinishNear(arr) { if (typeof finishNear === "undefined") return; if (!savedNear) savedNear = finishNear.slice(); finishNear.length = 0; arr.forEach(o => finishNear.push(o)); }
  function restoreFinishNear() { if (savedNear && typeof finishNear !== "undefined") { finishNear.length = 0; savedNear.forEach(o => finishNear.push(o)); } }
  function update(dt, excite) {
    if (!current) return;
    // crowd: a slice of spectators bounces each frame, more as the race heats up
    if (crowd && crowd.count) {
      crowd.level += (excite - crowd.level) * Math.min(1, dt * 2);
      if (crowd.level > 0.03) {
        const t = performance.now() / 1000, n = crowd.count, slice = Math.ceil(n / 6), st = (Math.floor(t * 30) % 6) * slice, b = crowd.base, dm = crowd.dm;
        for (let i = st; i < Math.min(n, st + slice); i++) {
          const bounce = Math.max(0, Math.sin(t * 7 + i * 1.7)) * 0.22 * crowd.level * (0.4 + 0.6 * ((i * 7919) % 100) / 100), s = b[i * 4 + 3];
          crowd.bI.getMatrixAt(i, dm.matrix); dm.matrix.decompose(dm.position, dm.quaternion, dm.scale);
          dm.position.set(b[i * 4], b[i * 4 + 1] + bounce, b[i * 4 + 2]); dm.scale.set(s, s + bounce * 0.5, s); dm.updateMatrix(); crowd.bI.setMatrixAt(i, dm.matrix); crowd.hI.setMatrixAt(i, dm.matrix);
        }
        crowd.bI.instanceMatrix.needsUpdate = crowd.hI.instanceMatrix.needsUpdate = true;
      }
    }
    // the big screen: the live order
    screenT -= dt;
    if (screenCtx && screenT <= 0) {
      screenT = 0.25; const g = screenCtx, W2 = 512, H2 = 192;
      g.fillStyle = "#06120b"; g.fillRect(0, 0, W2, H2); g.fillStyle = "#e8c35a"; g.fillRect(0, 0, W2, 30);
      g.fillStyle = "#06120b"; g.font = "900 20px Archivo, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
      if (race && race.state !== "load" && race.state !== "count") {
        const L = race.order[0], rem = Math.max(0, Math.round(race.dist - (L ? L.progress : 0)));
        g.fillText((race.cfg.career ? race.cfg.career.name.toUpperCase() : "RACE " + race.dist + "m"), 10, 16); g.textAlign = "right"; g.fillText(race.state === "done" ? "RESULT" : rem + " m", W2 - 10, 16); g.textAlign = "left";
        const list = race.state === "done" ? race.finishOrder : race.order;
        for (let i = 0; i < Math.min(5, list.length); i++) { const h = list[i], y = 48 + i * 29; g.fillStyle = h.isPlayer ? "#ffd54a" : "#ffffff"; g.font = "800 22px Archivo, sans-serif"; g.fillText((i + 1) + "  " + h.def.name.toUpperCase(), 14, y); g.fillStyle = h.def.silk || "#ccc"; g.fillRect(W2 - 40, y - 10, 24, 20); }
      } else { g.fillText("ROYAL RANDWICK", 10, 16); g.fillStyle = "#ffffff"; g.font = "800 30px Archivo, sans-serif"; g.fillText(race && race.cfg.career ? race.cfg.career.name.toUpperCase() : "RACE DAY", 14, 84); g.font = "600 20px Archivo, sans-serif"; g.fillStyle = "#9fd6ae"; g.fillText(race ? race.dist + " m · " + race.horses.length + " runners" : "", 14, 128); }
      screenTex.needsUpdate = true;
    }
  }
  return { use, update, get current() { return current; }, buildRandwick, info: () => ({ built: Object.keys(built), current: current && current.name }) };
})();
