'use strict';
/* =====================================================================
   FINAL FURLONG — RACECOURSE VENUES (Royal Randwick, Flemington)
   Scenery for the two flagship courses, generated from the SAME geometry the simulation races on (sim.js TRACK_DEFS):
   turf, rails, chutes, the Straight Six, finish line, markers and gates all come from the track's arc-length tables,
   so what you see is exactly where the horses run. Other venues keep the original course ("Furlong Park").

   Royal Randwick (Sydney, right-handed) — reference checklist and what is modelled:
     ✓ course proper 2224 m / 410 m straight / sprint chute (geometry: sim.js)          [published figures]
     ✓ the redeveloped main grandstand: five levels of glass, aluminium and timber, a lower seating bowl, balconies,
       a lightweight cantilevered roof of semi-transparent fabric on steel masts, double-sided towards the parade ring
       [architecture described by the builders/architects; massing and proportions approximated]
     ✓ the Theatre of the Horse: a sunken amphitheatre parade ring with tiered decks behind the stand [approximation]
     ✓ the Owners' Pavilion with its separate floating roof [approximation]
     ✓ an older heritage members' stand further up the straight [style approximated]
     ✓ the inner Kensington track and a sand training track in the infield; infield big screen
     ✓ Sydney skyline to the north-west with a needle-and-turret tower; suburban terracotta roofs; Centennial Park figs
   Flemington (Melbourne, left-handed):
     ✓ circuit 2312 m / 450 m straight / the Straight Six (1200 m straight course) (geometry: sim.js)
     ✓ the Club Stand (2018): five levels whose floor edges are wrapped in white "petal" precast bands, glass behind,
       roof garden with canopies [described by the architects; geometry approximated]
     ✓ the Grandstand and the Hill Stand further up the straight: big curved metal roofs on arched trusses [approx.]
     ✓ the famous roses along the straight's outside fence and around the mounting yard
     ✓ the mounting yard / parade ring beside the Club Stand; the hill behind the stands
     ✓ the Maribyrnong River with river red gums beyond the back of the course; Melbourne skyline to the south-east
   Everything here is an original 3D approximation built from public descriptions; no photographs, logos or broadcast
   graphics are used. Performance: instancing for posts, trees, shrubs, people; shared PBR materials; built lazily the
   first time a race is held there and hidden (not rebuilt) when you race elsewhere.
   ===================================================================== */
const VENUES = (() => {
  let generic = null, current = null, currentId = null, FOG0 = null;
  const built = {};
  const Q = {};
  const M = () => GFX.mats();
  let BOX = null;
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const std = (c, r, m, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r == null ? 0.85 : r, metalness: m || 0 }, extra || {}));

  // ---------- frames and basic shapes ----------
  // a ribbon along a function s → point(s, off): u along the course (metres / 12), v across (0..vScale)
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
  // a local frame beside the course whose -z axis always points AWAY from the track (outward) whichever way the course
  // runs; dir = +1 when local +x is the direction of racing, -1 when it is against it (left-handed courses)
  function frameAt(trk, s, off) { const p = trk.point(s, off, {}); const rot = Math.atan2(-p.nx, -p.nz); const lx = Math.cos(rot), lz = -Math.sin(rot); return { x: p.x, z: p.z, rot, dir: lx * p.hx + lz * p.hz > 0 ? 1 : -1, hx: p.hx, hz: p.hz, nx: p.nx, nz: p.nz }; }
  function place(g, f) { g.position.set(f.x, 0, f.z); g.rotation.y = f.rot; g.userData.dir = f.dir; return g; }
  function box(g, mat, x, y, z, sx, sy, sz, cast) { const m = new THREE.Mesh(BOX, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = cast !== false; m.receiveShadow = true; g.add(m); return m; }
  function tbox(g, mat, x, y, z, sx, sy, sz, tile, cast) { const m = new THREE.Mesh(GFX.wallBox(sx, sy, sz, tile), mat); m.position.set(x, y, z); m.castShadow = cast !== false; m.receiveShadow = true; g.add(m); return m; }
  function cyl(g, mat, x, y, z, r0, r1, h, seg, cast) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, seg || 10), mat); m.position.set(x, y + h / 2, z); m.castShadow = cast !== false; m.receiveShadow = true; g.add(m); return m; }
  function beam(g, mat, a, b, r) { const d = new THREE.Vector3().subVectors(b, a), L = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 6), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; g.add(m); return m; }
  // world position of a point given in a stand group's local frame
  const _v = new THREE.Vector3();
  function toWorld(S, x, y, z) { S.updateMatrixWorld(true); return _v.set(x, y, z).applyMatrix4(S.matrixWorld).clone(); }

  // ---------- grandstand kit ----------
  const SEATTEX = {};
  function seatMat(hex) {
    if (SEATTEX[hex]) return SEATTEX[hex];
    const c = new THREE.Color(hex), t = GFX.dataTex(64, 64, d => { for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const gap = x < 6 || x > 58 || y < 4, sh = 0.75 + 0.25 * (y / 64), k = (y * 64 + x) * 4; d[k] = gap ? 40 : c.r * 255 * sh; d[k + 1] = gap ? 42 : c.g * 255 * sh; d[k + 2] = gap ? 46 : c.b * 255 * sh; d[k + 3] = 255; } }, { srgb: true });
    return SEATTEX[hex] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  }
  // stepped seating: rows rising away from the track; returns crowd spots (local coords)
  function tiers(S, o) {
    const { x0 = 0, len, z0, y0, rows, tread = 0.85, rise = 0.42, seat = 0x1f5a3c, occ = 0.8, curve = 0, mat } = o;
    const pos = [], idx = [], nor = [], uv = [], segs = Math.max(1, Math.round(len / 6));
    const bend = x => curve ? curve * (x / (len / 2)) * (x / (len / 2)) : 0;            // gentle curvature in plan
    const quad = (a, b, c, d, n) => { const k = pos.length / 3; pos.push(...a, ...b, ...c, ...d); for (let i = 0; i < 4; i++) nor.push(...n); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(k, k + 1, k + 2, k, k + 2, k + 3); };
    for (let sI = 0; sI < segs; sI++) {
      const xa = x0 - len / 2 + len * sI / segs, xb = x0 - len / 2 + len * (sI + 1) / segs, ba = bend(xa - x0), bb = bend(xb - x0);
      for (let r = 0; r < rows; r++) {
        const y = y0 + r * rise, za = z0 - r * tread, zb = za - tread;
        quad([xa, y, za + ba], [xb, y, za + bb], [xb, y, zb + bb], [xa, y, zb + ba], [0, 1, 0]);                     // tread
        quad([xa, y - rise, za + ba], [xb, y - rise, za + bb], [xb, y, za + bb], [xa, y, za + ba], [0, 0, 1]);        // riser
      }
      const yb = y0 + (rows - 1) * rise, zb = z0 - rows * tread;
      quad([xa, yb, zb + ba], [xb, yb, zb + bb], [xb, y0 - rise, zb + bb], [xa, y0 - rise, zb + ba], [0, 0, -1]);     // back wall
      quad([xa, y0 - rise, z0 + ba], [xa, y0 - rise, zb + ba], [xb, y0 - rise, zb + bb], [xb, y0 - rise, z0 + bb], [0, -1, 0]);   // underside (a raised tier is seen from below)
    }
    // end walls: the stepped profile closed at both ends (no looking into the seating volume from the side)
    for (const [xe, sg] of [[x0 - len / 2, -1], [x0 + len / 2, 1]]) { const be = bend(xe - x0);
      for (let r = 0; r < rows; r++) { const y = y0 + r * rise, za = z0 - r * tread + be, zr = z0 - rows * tread + be;
        if (sg > 0) quad([xe, y0 - rise, za], [xe, y0 - rise, zr], [xe, y, zr], [xe, y, za], [1, 0, 0]); else quad([xe, y0 - rise, zr], [xe, y0 - rise, za], [xe, y, za], [xe, y, zr], [-1, 0, 0]); } }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat || M().concrete); m.receiveShadow = true; m.castShadow = true; S.add(m);
    // seat rows (a strip of moulded seats per row)
    const sm = seatMat(seat), spots = [], r0 = GFX.rand((len * 7 + rows) | 0), strips = [];
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * rise, z = z0 - r * tread - tread * 0.62;
      for (let sI = 0; sI < segs; sI++) { const xa = x0 - len / 2 + len * sI / segs, xb = xa + len / segs, xm = (xa + xb) / 2; const sb = GFX.wallBox(xb - xa, 0.42, 0.42, 0.5); sb.translate(xm, y + 0.21, z + bend(xm - x0)); strips.push(sb); }
      for (let x = x0 - len / 2 + 0.4; x < x0 + len / 2 - 0.4; x += 0.56) if (r0() < occ) spots.push({ x: x + (r0() - 0.5) * 0.08, y, z: z + 0.25 + bend(x - x0), seated: r0() < 0.82, keen: r0() });
    }
    const sm2 = new THREE.Mesh(GFX.merge(strips), sm); sm2.receiveShadow = true; S.add(sm2);
    return spots;
  }
  // a glazed level: floor slab with a fascia, a recessed curtain wall, a glass balustrade at the slab edge
  function glassLevel(S, o) {
    const { x0 = 0, len, y, h = 4, zFront, zGlass, depth = 12, glass, fascia, soffit, bal = true } = o;
    tbox(S, fascia || M().whiteConc, x0, y - 0.35, (zFront + zGlass - depth) / 2, len, 0.7, zFront - (zGlass - depth), 4);       // slab
    if (soffit) tbox(S, soffit, x0, y - 0.72, (zFront + zGlass) / 2, len - 0.4, 0.04, Math.max(0.5, zFront - zGlass), 2, false);   // timber soffit
    tbox(S, glass || GFX.glassMat(0xb8c8d4, 3), x0, y + h / 2, zGlass, len - 0.6, h, 0.18, 10);
    box(S, M().whiteConc, x0, y + h / 2, zGlass - depth / 2, len - 1, h, depth - 0.5, false);                                       // the floor behind the glass
    if (bal) { const b = tbox(S, GFX.glassMat(0xd8e4ea, 9), x0, y + 0.55, zFront - 0.05, len, 1.1, 0.06, 2, false); b.material = b.material.clone(); b.material.transparent = true; b.material.opacity = 0.45; box(S, M().steel, x0, y + 1.12, zFront - 0.05, len, 0.06, 0.08, false); }
  }
  // a thin roof surface given as a grid of heights; f(u, v) → [x, y, z] (local)
  const DS = new Map();
  function sheet(S, mat, f, nu, nv) {
    if (mat.side !== THREE.DoubleSide) { if (!DS.has(mat)) { const c = mat.clone(); c.side = THREE.DoubleSide; DS.set(mat, c); } mat = DS.get(mat); }   // thin surfaces are seen from both sides
    const pos = [], idx = []; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...f(i / nu, j / nv));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; S.add(m); return m;
  }
  /* static batching: once a building is complete its meshes are merged per material (one draw call per material rather
     than one per box, slab, column and pane). Opaque and transparent surfaces never share a batch (each material is its
     own batch), animated materials (flags) and instanced/skinned meshes are left alone, and shadow flags are kept. */
  const NOOP_COMPILE = THREE.Material.prototype.onBeforeCompile;
  function batchStatic(S) {
    S.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(S.matrixWorld).invert(), groups = new Map();
    S.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.noBatch || !o.geometry || !o.geometry.attributes.normal || Array.isArray(o.material)) return;
      if (o.material.onBeforeCompile !== NOOP_COMPILE) return;
      const key = o.material.uuid + "|" + (o.geometry.attributes.uv ? 1 : 0) + "|" + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
      if (!groups.has(key)) groups.set(key, { mat: o.material, list: [], cast: o.castShadow, recv: o.receiveShadow });
      groups.get(key).list.push({ o, m: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
    });
    let before = 0, after = 0;
    for (const g of groups.values()) {
      before += g.list.length; if (g.list.length < 2) { after++; continue; }
      const geos = g.list.map(({ o, m }) => { const c = o.geometry.clone(); c.applyMatrix4(m); return c; });
      const mesh = new THREE.Mesh(GFX.merge(geos), g.mat); mesh.castShadow = g.cast; mesh.receiveShadow = g.recv; mesh.name = S.name + " (batched)";
      for (const { o } of g.list) o.parent.remove(o);
      S.add(mesh); after++;
    }
    S.userData.batch = { before, after };
  }
  // animated flags (cloth wave in the vertex shader)
  let FLAGMAT = {};
  function flag(S, x, y, z, hex, rotY) {
    const key = hex; if (!FLAGMAT[key]) { const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, side: THREE.DoubleSide }); m.onBeforeCompile = sh => { sh.uniforms.uTime = GFX.uTime; sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat fx = position.x + 1.2; transformed.z += sin(uTime * 5.5 - fx * 2.2 + position.y) * 0.18 * fx; transformed.y -= fx * 0.05;"); }; m.customProgramCacheKey = () => "ffflag"; FLAGMAT[key] = m; }
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 6, 6), M().steelWhite); p.position.set(x, y + 3, z); S.add(p);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 8, 2), FLAGMAT[key]); f.position.set(x + 1.2, y + 5.1, z); f.rotation.y = rotY || 0; S.add(f);
  }
  function boardMat(text, bg, fg, w, h, size) { return new THREE.MeshStandardMaterial({ map: boardTex(text, bg, fg, w || 512, h || 128, size || 56), roughness: 0.6 }); }

  // ---------- course surfaces common to both venues ----------
  function course(G, trk, o) {
    const pt = trk.point, W = trk.W, lap = trk.lap;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), GFX.turfMaterial("ground", o.groundTint || 0xa9b78e)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; G.add(ground);
    let cx = 0, cz = 0; const poly = []; for (let s = 0; s < lap; s += 6) { const p = pt(s, -0.5, {}); poly.push([p.x, p.z]); cx += p.x; cz += p.z; } cx /= poly.length; cz /= poly.length;
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const inf = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), GFX.turfMaterial("lawn", o.infieldTint || 0xb9c79f)); inf.rotation.x = -Math.PI / 2; inf.position.y = -0.03; inf.receiveShadow = true; G.add(inf);
    const inside = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const turf = GFX.turfMaterial("track", o.turfTint || 0xb4c7a0);
    const track = new THREE.Mesh(ribbon(pt, 0, lap, 0, W, 0.02, 0.02, Math.round(lap / 2.5), 1), turf); track.receiveShadow = true; G.add(track);
    // chutes (incl. the Straight Six): straight turf extensions joining the course tangentially
    const chutes = Object.values(trk.chutes).map(c => ({ c, len: c.len || 430, fn: (s, off, out) => { out.x = c.x - c.hx * s + c.nx * off; out.z = c.z - c.hz * s + c.nz * off; out.hx = c.hx; out.hz = c.hz; out.nx = c.nx; out.nz = c.nz; return out; } }));
    for (const ch of chutes) { const m = new THREE.Mesh(ribbon(ch.fn, 0, ch.len, 0, W, 0.019, 0.019, Math.round(ch.len / 4), 1), turf); m.receiveShadow = true; G.add(m); }
    // where does the course proper (curving away inside) clear a chute (running straight on behind the join)? Neither the
    // course's outside rail nor the chute's inside rail may stand across the other's racing surface before that point.
    for (const ch of chutes) { const c = ch.c; let b = 0; for (; b < ch.len; b += 1) { const p = pt(c.joinS - b, 0, Q), dx = p.x - (c.x - c.hx * b), dz = p.z - (c.z - c.hz * b); if (-(dx * c.nx + dz * c.nz) > W + 1.5) break; } ch.sep = b; }
    // rails: the inside rail all the way round; the outside rail broken where each chute joins
    GFX.rail(G, pt, 0, lap, -0.05, true, false);
    const gaps = chutes.slice().sort((a, b) => a.c.joinS - b.c.joinS);
    if (!gaps.length) GFX.rail(G, pt, 0, lap, W + 0.05, true, true);
    else for (let i = 0; i < gaps.length; i++) { const a = gaps[i].c.joinS + 6, nx = gaps[(i + 1) % gaps.length], b = (i + 1 < gaps.length ? nx.c.joinS : nx.c.joinS + lap) - nx.sep; if (b > a) GFX.rail(G, pt, a, b, W + 0.05, false, true); }
    for (const ch of chutes) { GFX.rail(G, ch.fn, 0, ch.len, W + 0.05, false, true); if (ch.len > ch.sep + 4) GFX.rail(G, ch.fn, ch.sep + 2, ch.len, -0.05, false, false); }
    // finish line paint
    { const pc = pt(0, W / 2, {}), line = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.35), std(0xffffff, 0.6)); line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(pc.hz, pc.hx) + Math.PI / 2; line.position.set(pc.x, 0.035, pc.z); G.add(line); }
    return { cx, cz, inside, poly, chutes };
  }
  // the winning post (inside rail), the judge's box and photo-finish tower (outside), a finish banner
  function finish(G, trk, name, colors) {
    const W = trk.W, p1 = trk.point(0, -0.9, {}), p2 = trk.point(0, W + 1.1, {});
    const postM = std(0xfafaf7, 0.4), disc = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); g.fillStyle = "#c81e1e"; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = "#ffffff"; g.beginPath(); g.arc(64, 64, 34, 0, 7); g.fill(); g.fillStyle = "#c81e1e"; g.beginPath(); g.arc(64, 64, 14, 0, 7); g.fill(); }), roughness: 0.5 });
    const near = [];
    [p1, p2].forEach((p, i) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5.6, 12), postM); post.position.set(p.x, 2.8, p.z); post.castShadow = true; G.add(post);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 24), disc); d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(p.nx, 0, p.nz)); d.position.set(p.x, 6.2, p.z); d.castShadow = true; G.add(d);
      if (i === 0) near.push(post, d);
    });
    // judge's box + photo-finish camera tower on the outside, square to the line
    const f = frameAt(trk, 0, W + 4.5), J = place(new THREE.Group(), f);
    box(J, M().whiteConc, 0, 4.5, -1.5, 3.2, 9, 3.2); tbox(J, GFX.glassMat(0xc8d8e0, 4), 0, 8.2, 0.12, 3.0, 1.6, 0.1, 2); box(J, M().dark, 0, 9.2, -1.5, 3.6, 0.3, 3.6);
    box(J, M().steelWhite, 0, 10.5, -1.5, 0.4, 2.4, 0.4); box(J, M().dark, 0, 11.8, -1.2, 0.8, 0.6, 1.0);
    G.add(J);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(W + 2.2, 1.2, 0.12), boardMat(name, colors[0], colors[1], 1024, 128, 70));
    const pm = trk.point(0, W / 2, {}); banner.position.set(pm.x, 7.6, pm.z); banner.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z) + Math.PI / 2;
    const gp = [p1, p2].map(p => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8.2, 8), M().steelWhite); m.position.set(p.x, 4.1, p.z); G.add(m); return m; });
    G.add(banner); near.push(gp[0]);
    G.userData.finishNear = near;
  }
  // rail-side advertising boards (venue names only — no sponsors' marks)
  function railBoards(G, trk, from, to, text, bg, fg, step) {
    const mat = boardMat(text, bg, fg, 512, 96, 46);
    for (let s = from; s < to; s += step || 28) { const p = trk.point(s, trk.W + 1.6, {}); const m = new THREE.Mesh(BOX, mat); m.scale.set(5.6, 0.85, 0.08); m.position.set(p.x, 0.62, p.z); m.rotation.y = Math.atan2(p.hx, p.hz) + Math.PI / 2; m.castShadow = true; G.add(m); }
  }
  function sign(G, trk, s, text, bg, fg, off, h) {
    const p = trk.point(s, off, {}), m = new THREE.Mesh(new THREE.BoxGeometry(7, 1.8, 0.15), boardMat(text, bg, fg, 512, 128, 56));
    m.position.set(p.x, h || 3.2, p.z); m.rotation.y = Math.atan2(p.hx, p.hz) + Math.PI / 2; G.add(m);
    const pole = new THREE.Mesh(BOX, M().steel); pole.scale.set(0.15, (h || 3.2), 0.15); pole.position.set(p.x, (h || 3.2) / 2, p.z); G.add(pole);
  }
  // big screen (shows the live order) — facing the grandstand from the infield
  const SCREENS = [];
  function bigScreen(G, trk, s, off, w, title) {
    const c = document.createElement("canvas"); c.width = 640; c.height = 256; const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const f = frameAt(trk, s, off), S = place(new THREE.Group(), f), h = w * 0.4;
    // the screen faces outward (towards the stands across the track): local -z
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); scr.position.set(0, 4 + h / 2 + 2, -0.75); scr.rotation.y = Math.PI; S.add(scr);
    box(S, M().dark, 0, 4 + h / 2 + 2, 0, w + 1, h + 1, 1.2); box(S, M().steel, -w / 3, 3, 0.5, 0.8, 6 + 2, 0.8); box(S, M().steel, w / 3, 3, 0.5, 0.8, 6 + 2, 0.8);
    G.add(S); SCREENS.push({ ctx: c.getContext("2d"), tex, title, group: G });
  }

  // ---------- spectators ----------
  function lawnSpots(trk, s0, s1, off0, off1, density, rng, keen) {
    const out = []; const n = Math.round(Math.abs(s1 - s0) * Math.abs(off1 - off0) * density);
    for (let i = 0; i < n; i++) { const s = s0 + (s1 - s0) * rng(), off = off0 + (off1 - off0) * Math.pow(rng(), 1.6), p = trk.point(s, off, Q); out.push({ x: p.x + (rng() - 0.5) * 0.4, z: p.z + (rng() - 0.5) * 0.4, y: 0, rot: Math.atan2(-p.nx, -p.nz) + (rng() - 0.5) * 0.9, keen: keen != null ? keen * rng() : rng() }); }
    return out;
  }
  function standSpotsToWorld(S, spots) { S.updateMatrixWorld(true); const out = []; for (const sp of spots) { const w = _v.set(sp.x, sp.y, sp.z).applyMatrix4(S.matrixWorld); out.push({ x: w.x, y: w.y, z: w.z, rot: S.rotation.y + (sp.rot != null ? sp.rot : sp.seated ? 0 : (Math.random() - 0.5) * 0.4), seated: sp.seated, keen: sp.keen }); } return out; }

  /* =====================================================================
     ROYAL RANDWICK
     ===================================================================== */
  function buildRandwick(trk) {
    const G = new THREE.Group(); G.name = "venue-randwick";
    const W = trk.W, lap = trk.lap, pt = trk.point, rng = GFX.rand(2224);
    const C = course(G, trk, { turfTint: 0xa6bf9c, infieldTint: 0xb3c49c, groundTint: 0xb4b88e, chuteGapBefore: 60 });
    // ---- infield: the Kensington track (inner turf course) and a sand training track, service road, big screen
    { const inner = (s, off, o) => pt(s, -14 - off, o);
      const k = new THREE.Mesh(ribbon(inner, 0, lap, 0, 18, 0.015, 0.015, Math.round(lap / 4), 1), GFX.turfMaterial("track", 0xaec29a)); k.receiveShadow = true; G.add(k);
      GFX.rail(G, (s, off, o) => { const p = pt(s, -14 - off, o); p.nx = -p.nx; p.nz = -p.nz; return p; }, 0, lap, 18.1, true, false);
      const sand = new THREE.Mesh(ribbon(pt, 0, lap, -40, -48, 0.01, 0.01, Math.round(lap / 5), 1), M().sand); sand.receiveShadow = true; G.add(sand);
      const road = new THREE.Mesh(ribbon(pt, 0, lap, -52, -57, 0.0, 0.0, Math.round(lap / 6), 1), M().asphalt); road.receiveShadow = true; G.add(road); }
    bigScreen(G, trk, lap - 150, -70, 26, "ROYAL RANDWICK");
    // ---- the grandstand precinct (outside the straight)
    const spots = [];
    const S = place(new THREE.Group(), frameAt(trk, lap - 95, W + 3)); S.name = "Randwick grandstand"; const d = S.userData.dir;
    const L = 228, mm = M(), glassA = GFX.glassMat(0xa9bccb, 3), glassB = GFX.glassMat(0xbfd0dc, 7);
    // apron (concrete) and the lawn in front of the stand
    box(S, mm.concrete, 0, 0.05, -6.5, L + 140, 0.1, 12, false);
    spots.push(...standSpotsToWorld(S, (() => { const a = []; for (let i = 0; i < 1400; i++) a.push({ x: (rng() - 0.5) * (L + 120), y: 0.1, z: -1.2 - Math.pow(rng(), 1.5) * 10.5, seated: false, keen: rng() }); return a; })()));
    // lower seating bowl
    spots.push(...standSpotsToWorld(S, tiers(S, { len: L, z0: -14, y0: 0.6, rows: 18, seat: 0x1f5a3c, occ: 0.82, curve: 4 })));
    box(S, mm.whiteConc, 0, 0.3, -13.6, L, 0.6, 0.8);
    // level 2: corporate glass level with balcony and warm timber soffit; level 3 above, set back
    tbox(S, mm.whiteConc, 0, 4.1, -37.6, L - 4, 8.2, 15.8, 4);                                  // concourse block under level 2, behind the bowl
    glassLevel(S, { len: L - 4, y: 8.6, h: 4.0, zFront: -26, zGlass: -30, depth: 14, glass: glassA, soffit: mm.timber });
    glassLevel(S, { len: L - 10, y: 12.9, h: 3.9, zFront: -28.5, zGlass: -32, depth: 12, glass: glassB, soffit: mm.timber });
    // upper tier above the glass levels
    spots.push(...standSpotsToWorld(S, tiers(S, { len: L - 24, z0: -30, y0: 17.6, rows: 11, tread: 0.9, rise: 0.5, seat: 0x23472f, occ: 0.7, curve: 3 })));
    box(S, mm.whiteConc, 0, 17.0, -29.4, L - 24, 1.0, 1.2);
    // level 5: the top glass level behind the upper tier
    glassLevel(S, { len: L - 30, y: 23.2, h: 4.2, zFront: -40.5, zGlass: -41.5, depth: 9, glass: glassA, bal: false });
    // back of house (timber-clad, glazed) and the double-sided stand facing the parade ring
    tbox(S, mm.timber, 0, 10.5, -50, L - 8, 21, 9, 3);
    tbox(S, GFX.glassMat(0xb0c4d2, 11), 0, 12, -54.6, L - 20, 14, 0.2, 4);
    spots.push(...standSpotsToWorld(S, (() => { const g2 = new THREE.Group(); g2.rotation.y = Math.PI; g2.position.set(0, 0, -112); S.add(g2); const sp = tiers(g2, { len: 120, z0: -2, y0: 0.6, rows: 8, seat: 0x2d5b46, occ: 0.4 }); g2.updateMatrix(); return sp.map(p => { const v = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(g2.matrix); return { x: v.x, y: v.y, z: v.z, seated: p.seated, keen: p.keen }; }); })()).map(p => (p.rot += Math.PI, p)));
    // the roof: a lightweight cantilevered steel structure with a semi-transparent fabric skin, in floating segments
    const roofY = 31, nSeg = 5, gap = 3, segL = (L - gap * (nSeg - 1)) / nSeg;
    for (let k = 0; k < nSeg; k++) {
      const xa = -L / 2 + k * (segL + gap), xb = xa + segL;
      sheet(S, mm.membrane, (u, v) => { const x = xa + (xb - xa) * u, z = -52 + 40 * v, sag = Math.sin(u * Math.PI) * 0.7, y = roofY + 3.2 * v - 1.6 * v * v - sag * (1 - v * 0.6); return [x, y, z]; }, 8, 10);
      const ye = roofY + 1.6; box(S, mm.steelWhite, (xa + xb) / 2, ye, -12.1, segL, 0.45, 0.5);                       // leading edge
      for (const x of [xa + 3, xb - 3]) {                                                                         // a mast + ties per side
        const mast = cyl(S, mm.steelWhite, x, 21, -53, 0.55, 0.35, 21, 10);
        beam(S, mm.steel, new THREE.Vector3(x, 41.6, -53), new THREE.Vector3(x, ye, -12.4), 0.06);
        beam(S, mm.steel, new THREE.Vector3(x, 41.6, -53), new THREE.Vector3(x, roofY + 2.2, -30), 0.06);
        beam(S, mm.steelWhite, new THREE.Vector3(x, roofY - 0.4, -52), new THREE.Vector3(x, ye - 0.2, -12.4), 0.22);   // rafter under the fabric
      }
    }
    // stair cores at the ends (glass + timber)
    for (const x of [-L / 2 - 6, L / 2 + 6]) { tbox(S, mm.timber, x, 14, -34, 10, 28, 18, 3); tbox(S, glassB, x + Math.sign(x) * -0.2, 14, -24.8, 9, 24, 0.2, 4); }
    batchStatic(S); G.add(S);
    // ---- Theatre of the Horse: a sunken amphitheatre parade ring behind the stand, tiered decks around it
    const ringF = frameAt(trk, lap - 60, W + 3 + 128), R = place(new THREE.Group(), ringF); R.name = "Theatre of the Horse";
    buildParadeRing(R, { rx: 30, ry: 19, sunk: 0, tiers: 9, style: "randwick" })   // at ground level: the course lawn covers any sunken floor;
    spots.push(...standSpotsToWorld(R, R.userData.spots));
    G.add(R);
    G.userData.parade = R;
    // Owners' Pavilion: two storeys of glass behind vertical aluminium fins with curved corners, under a floating roof
    { const O = place(new THREE.Group(), frameAt(trk, lap - 230, W + 3 + 90));
      { const fins = new THREE.InstancedMesh(BOX, M().steelWhite, 72), dm = new THREE.Object3D(); for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, sx = Math.cos(a), sz = Math.sin(a), k = Math.pow(Math.pow(Math.abs(sx), 4) + Math.pow(Math.abs(sz), 4), -0.25); dm.position.set(sx * k * 18, 4, sz * k * 8.6); dm.rotation.set(0, -a, 0); dm.scale.set(0.5, 8, 0.18); dm.updateMatrix(); fins.setMatrixAt(i, dm.matrix); } fins.castShadow = true; O.add(fins); }
      tbox(O, GFX.glassMat(0xb6c8d4, 13), 0, 4, 0, 34, 7.6, 16, 4);
      sheet(O, M().whiteConc, (u, v) => [-24 + 48 * u, 9.6 + Math.sin(u * Math.PI) * 0.8, -13 + 26 * v], 8, 4);
      for (const x of [-15, 15]) for (const z of [-8, 8]) cyl(O, M().steelWhite, x, 0, z, 0.2, 0.2, 9.6, 8);
      batchStatic(O); G.add(O); }
    // ---- the heritage members' stand further up the straight (brick base, cream, cast-iron columns, pitched roof)
    { const H = place(new THREE.Group(), frameAt(trk, lap - 300, W + 10));
      box(H, M().concrete, 0, 0.05, -4, 96, 0.1, 9, false);
      spots.push(...standSpotsToWorld(H, tiers(H, { len: 84, z0: -8.5, y0: 0.6, rows: 12, tread: 0.8, rise: 0.45, seat: 0x2f5d3a, occ: 0.75, mat: M().brick })));
      const cream = std(0xe9dfc6, 0.8), green = std(0x2e5640, 0.6, 0.2);
      tbox(H, M().brick, 0, 3, -20.5, 88, 6, 4, 3); tbox(H, cream, 0, 9, -21, 88, 6, 3, 3);
      for (let x = -40; x <= 40; x += 8) { cyl(H, std(0x234a36, 0.5, 0.4), x, 0.6, -7.8, 0.14, 0.12, 9.6, 8); }
      sheet(H, green, (u, v) => [-45 + 90 * u, 10.2 + 3.8 * (1 - Math.abs(v - 0.65) / 0.65), -24 + 18 * v], 4, 8);
      for (let x = -36; x <= 36; x += 18) { const g = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 4), green); g.position.set(x, 14.6, -20); g.rotation.y = Math.PI / 4; H.add(g); }
      flag(H, -42, 14, -21, 0x0f3b2a); flag(H, 42, 14, -21, 0xc9a646);
      batchStatic(H); G.add(H); }
    // the lawn stand past the post and marquees on the lawns
    { const O = place(new THREE.Group(), frameAt(trk, 55, W + 8));
      spots.push(...standSpotsToWorld(O, tiers(O, { len: 64, z0: -6, y0: 0.6, rows: 8, seat: 0x1f5a3c, occ: 0.6 })));
      sheet(O, M().roofMetal, (u, v) => [-34 + 68 * u, 8.5 + 1.5 * v, -15 + 10 * v], 4, 3); for (let x = -30; x <= 30; x += 12) cyl(O, M().steelWhite, x, 0, -14, 0.2, 0.2, 8.5, 8);
      G.add(O); }
    marquees(G, trk, lap - 420, lap - 330, W + 14, 6, rng);
    // ---- finish, rail boards, landmarks
    finish(G, trk, "ROYAL RANDWICK", ["#0f3b2a", "#e8c35a"]);
    railBoards(G, trk, lap - 400, lap - 15, "ROYAL RANDWICK", "#0f3b2a", "#f2efe6");
    sign(G, trk, lap - 400, "THE RISE", "#7a1d1d", "#ffffff", W + 4);
    sign(G, trk, trk.marks.homeTurn + 40, "HOME TURN", "#0f3b2a", "#e8c35a", W + 6);
    sign(G, trk, trk.marks.topTurn + 60, "KENSINGTON END", "#163a63", "#ffffff", W + 6);
    { const cj = Object.values(trk.chutes)[0]; if (cj) { const m = new THREE.Mesh(new THREE.BoxGeometry(7, 1.8, 0.15), boardMat("SPRINT CHUTE", "#0f3b2a", "#ffffff", 512, 128, 52)); m.position.set(cj.x - cj.hx * 120 + cj.nx * (W + 5), 3, cj.z - cj.hz * 120 + cj.nz * (W + 5)); m.rotation.y = Math.atan2(cj.hx, cj.hz) + Math.PI / 2; G.add(m); } }
    // ---- landscaping: infield trees in clusters, Centennial Park figs beyond the top end, street trees, hedges
    const trees = [];
    for (let k = 0; k < 2600 && trees.length < 170; k++) {
      const x = C.cx + (rng() - 0.5) * 1000, z = C.cz + (rng() - 0.5) * 520;
      if (!C.inside(x, z)) continue;
      let ok = true; for (let s = 0; s < lap; s += 15) { const p = pt(s, -30, Q); if ((p.x - x) ** 2 + (p.z - z) ** 2 < 42 * 42) { ok = false; break; } } if (!ok) continue;
      const clump = rng() < 0.6; trees.push({ x, z, s: 0.8 + rng() * 0.6, sp: clump ? "gum" : rng() < 0.5 ? "fig" : "plane" });
    }
    for (let s = 0; s < lap; s += 11) {
      if (s > lap - 540 || s < 170) continue;                                                   // keep the grandstand side open
      const p = pt(s, W + 45 + rng() * 30, {}); trees.push({ x: p.x, z: p.z, s: 0.9 + rng() * 0.6, sp: s > trk.marks.topTurn && s < trk.marks.topTurn_end + 100 ? "fig" : rng() < 0.55 ? "gum" : "plane" });
      if (rng() < 0.6) { const q = pt(s + 5, W + 85 + rng() * 60, {}); trees.push({ x: q.x, z: q.z, s: 0.9 + rng() * 0.7, sp: rng() < 0.4 ? "fig" : "gum" }); }
    }
    for (let s = lap - 520; s < lap + 160; s += 22) { const p = pt(s, W + 190 + rng() * 20, {}); trees.push({ x: p.x, z: p.z, s: 0.9 + rng() * 0.4, sp: rng() < 0.3 ? "palm" : "plane" }); }
    GFX.plantTrees(G, trees);
    // suburban Sydney: terracotta-roofed houses behind the back straight, the city skyline to the north-west
    suburbs(G, trk, trk.marks.back - 250, trk.marks.back_end + 350, W + 150, W + 420, 260, rng, 0xa85a3c);
    skyline(G, C.cx, C.cz, -2.35, 0.65, 3900, 4600, 60, rng, { needle: true });
    // ---- crowd
    G.userData.crowdSpots = spots;
    G.userData.crowd = buildCrowd(G, spots, trk, rng, 0, 0.3);
    return G;
  }

  /* =====================================================================
     FLEMINGTON
     ===================================================================== */
  function buildFlemington(trk) {
    const G = new THREE.Group(); G.name = "venue-flemington";
    const W = trk.W, lap = trk.lap, pt = trk.point, rng = GFX.rand(2312);
    const C = course(G, trk, { turfTint: 0xa2bc98, infieldTint: 0xafc298, groundTint: 0xb2b68a, chuteGapBefore: 40 });
    const spots = [], mm = M();
    // ---- the Club Stand (nearest the post): five glazed levels whose floor edges are wrapped in white "petal" bands,
    //      standing on a solid two-storey podium (concourse, bars, lifts) behind the lower seating bowl, with stair/lift
    //      cores at both ends and a line of columns carrying the floors down to the podium.
    //      (Before this was repaired the levels floated: nothing filled the space under the first floor behind the
    //      seating, the slabs were one-sided sheets — invisible from below — and a 0.5 m slit between every floor's glass
    //      and the next slab looked straight through the building at the trees.)
    { const S = place(new THREE.Group(), frameAt(trk, lap - 40, W + 3)); S.name = "Club Stand";
      const L = 150, glassC = GFX.glassMat(0xa8bccb, 21), slab = mm.whiteConcDS, FL = 4.6, Y0 = 7.2, NL = 5;
      const zBack = -34;                                                  // the rear face of the building
      box(S, mm.concrete, 0, 0.05, -6, L + 60, 0.1, 12, false);
      spots.push(...standSpotsToWorld(S, (() => { const a = []; for (let i = 0; i < 900; i++) a.push({ x: (rng() - 0.5) * (L + 50), y: 0.1, z: -1.2 - Math.pow(rng(), 1.4) * 10, seated: false, keen: rng() }); return a; })()));
      spots.push(...standSpotsToWorld(S, tiers(S, { len: L - 10, z0: -13, y0: 0.6, rows: 10, seat: 0x7a1f2b, occ: 0.8 })));
      // podium: from the ground to the first floor, filling the whole footprint behind the seating bowl
      const tierTop = 0.6 + 9 * 0.42, zPod = -13 - 10 * 0.85 - 0.1, podTop = Y0 - 0.9;
      tbox(S, mm.whiteConc, 0, podTop / 2, (zPod + zBack) / 2, L - 2, podTop, zPod - zBack, 4);
      // the concourse above the back row: a glazed shopfront between the top of the seating and the first-floor slab
      tbox(S, glassC, 0, (tierTop + podTop) / 2 + 0.1, zPod + 0.12, L - 12, podTop - tierTop - 0.2, 0.12, 10, false);
      tbox(S, mm.timber, 0, podTop - 0.06, zPod + 1.2, L - 10, 0.12, 2.6, 2, false);                         // timber soffit over the concourse
      // stair and lift cores at both ends, full height (they close the building's ends and carry the roof)
      const roofY = Y0 + NL * FL - 0.9;
      for (const sx of [-1, 1]) { tbox(S, mm.whiteConc, sx * (L / 2 - 3.5), roofY / 2, (-18.5 + zBack) / 2, 7, roofY, -18.5 - zBack, 4); excludeLocal(S, sx * (L / 2 - 3.5) - 3.6, sx * (L / 2 - 3.5) + 3.6, zBack, -18.4); }
      for (let lv = 0; lv < NL; lv++) {
        const y = Y0 + lv * FL, zf = -18 - lv * 0.6;
        // the petal band and the floor slab (double-sided: the underside of each cantilever is seen from the lawn)
        sheet(S, slab, (u, v) => { const x = -L / 2 + L * u, sc = Math.abs(Math.sin(u * Math.PI * 14)) * 1.4; return [x, y - 0.9 + 1.4 * v, zf + sc + 0.4 * (1 - v)]; }, 140, 2);
        sheet(S, slab, (u, v) => { const x = -L / 2 + L * u, sc = Math.abs(Math.sin(u * Math.PI * 14)) * 1.4; return [x, y - 0.9, zf + sc - 14 * v]; }, 140, 1);
        tbox(S, slab, 0, y - 0.9 - 0.25, (zf - 2.6 + zBack) / 2, L - 7, 0.5, zf - 2.6 - zBack, 4, false);   // structural slab back to the rear wall
        // the glazed wall: full storey height (no slit under the next floor), with an opaque spandrel at the top
        tbox(S, glassC, 0, y + 1.6, zf - 2.5, L - 7, 3.2, 0.18, 10);
        tbox(S, mm.dark, 0, y + 3.2 + 0.25, zf - 2.45, L - 7, 0.5, 0.2, 4, false);
        // the floor behind the glass: lit interior volume from slab to slab
        box(S, mm.whiteConc, 0, y + 1.4, (zf - 3 + zBack) / 2, L - 8, FL, zf - 3 - zBack, false);
      }
      // columns: a line along the back of the seating carrying each floor down to the podium (one merged mesh)
      { const cols = []; for (let x = -L / 2 + 12.5; x < L / 2 - 8; x += 12.5) { const c = new THREE.CylinderGeometry(0.42, 0.48, roofY - tierTop, 10); c.translate(x, tierTop + (roofY - tierTop) / 2, zPod + 1.7); cols.push(c); }
        const m = new THREE.Mesh(GFX.merge(cols), mm.whiteConc); m.castShadow = true; m.receiveShadow = true; S.add(m); }
      // rooftop garden: canopies, planters and small trees
      const ry = roofY; box(S, mm.concrete, 0, ry, -26, L - 6, 0.3, 16);
      for (let x = -L / 2 + 14; x < L / 2 - 10; x += 22) { sheet(S, mm.membrane, (u, v) => { const a = u * Math.PI * 2, r = 5 * v; return [x + Math.cos(a) * r, ry + 4.2 - 0.9 * v * v, -24 + Math.sin(a) * r * 0.7]; }, 16, 3); cyl(S, mm.steelWhite, x, ry, -24, 0.12, 0.12, 4.2, 8); }
      excludeLocal(S, -L / 2, L / 2, zBack, zPod);                          // nobody stands inside the building
      batchStatic(S); G.add(S);
      G.userData.clubStand = S; }
    // ---- the Grandstand and the Hill Stand: big curved metal roofs on arched trusses
    for (const [s, Lg, name, rows] of [[lap - 205, 175, "Grandstand", 22], [lap - 380, 120, "Hill Stand", 16]]) {
      const S = place(new THREE.Group(), frameAt(trk, s, W + 4)); S.name = name;
      box(S, mm.concrete, 0, 0.05, -5, Lg + 20, 0.1, 10, false);
      spots.push(...standSpotsToWorld(S, tiers(S, { len: Lg, z0: -10, y0: 0.6, rows, tread: 0.85, rise: 0.48, seat: name === "Grandstand" ? 0x6b1b25 : 0x2a4a6b, occ: 0.78, curve: 3 })));
      const top = 0.6 + rows * 0.48, back = -10 - rows * 0.85;
      glassLevel(S, { len: Lg - 6, y: top + 0.6, h: 3.6, zFront: back + 1, zGlass: back - 0.5, depth: 10, glass: GFX.glassMat(0xb2c4d0, 17), bal: false });
      tbox(S, mm.concrete, 0, top / 2, back - 6, Lg, top, 12, 4);
      const ry = top + 9;
      sheet(S, mm.roofMetal, (u, v) => { const x = -Lg / 2 - 4 + (Lg + 8) * u, z = back - 8 + (Math.abs(back) + 4) * v; return [x, ry + 6 * Math.sin(v * Math.PI * 0.85) - 2 * v, z]; }, 12, 14);
      for (let x = -Lg / 2; x <= Lg / 2 + 0.1; x += Lg / 6) {
        for (let k = 0; k < 10; k++) { const v0 = k / 10, v1 = (k + 1) / 10, za = back - 8 + (Math.abs(back) + 4) * v0, zb = back - 8 + (Math.abs(back) + 4) * v1;
          beam(S, mm.steelWhite, new THREE.Vector3(x, ry - 0.3 + 6 * Math.sin(v0 * Math.PI * 0.85) - 2 * v0, za), new THREE.Vector3(x, ry - 0.3 + 6 * Math.sin(v1 * Math.PI * 0.85) - 2 * v1, zb), 0.16); }
        cyl(S, mm.steelWhite, x, 0, back - 7, 0.45, 0.3, ry, 10);
      }
      flag(S, -Lg / 2, ry + 4, back - 8, 0xc8102e); flag(S, Lg / 2, ry + 4, back - 8, 0x0b2a4a);
      excludeLocal(S, -Lg / 2, Lg / 2, back - 12, back);                                  // the concrete block behind the seating
      batchStatic(S); G.add(S);
    }
    // ---- the hill behind the stands (a terraced lawn), the mounting yard / parade ring next to the Club Stand
    { const f = frameAt(trk, lap - 390, W + 70), Hh = place(new THREE.Group(), f);
      const hill = sheet(Hh, GFX.turfMaterial("lawn", 0xb2c497), (u, v) => [-250 + 500 * u, Math.max(0, Math.sin(v * Math.PI * 0.5)) * 14 * Math.sin(u * Math.PI), -10 - 90 * v], 24, 8); hill.castShadow = false;
      G.add(Hh); }
    { const R = place(new THREE.Group(), frameAt(trk, lap - 20, W + 3 + 92)); R.name = "Mounting yard";
      buildParadeRing(R, { rx: 26, ry: 16, sunk: 0, tiers: 4, style: "flemington" });
      spots.push(...standSpotsToWorld(R, R.userData.spots)); G.add(R); G.userData.parade = R; }
    // ---- roses: the outside fence of the straight lined with rose bushes, more around the lawns
    { const roses = [], cols = [0xc8102e, 0xe63950, 0xf28bb0, 0xfff1e6, 0xf6c445, 0xd94f8a];
      for (let s = lap - 470; s < lap + 140; s += 1.4) { const p = pt(s, W + 2.6, {}); roses.push({ x: p.x, z: p.z, s: 0.8 + rng() * 0.25, rot: Math.atan2(-p.hz, p.hx), flower: cols[(s / 9 | 0) % cols.length] }); }
      for (let i = 0; i < 260; i++) { const s = lap - 200 + rng() * 400, p = pt(s, W + 14 + rng() * 2.5 + (rng() < 0.5 ? 0 : 90), {}); roses.push({ x: p.x, z: p.z, s: 0.7 + rng() * 0.3, flower: cols[(rng() * cols.length) | 0] }); }
      GFX.shrubs(G, roses, 0x34552a, cols); }
    // ---- the Straight Six landmarks and course boards
    finish(G, trk, "FLEMINGTON", ["#7a1020", "#f2efe6"]);
    railBoards(G, trk, lap - 440, lap - 15, "FLEMINGTON", "#0b2a4a", "#f2efe6");
    { const ch = trk.chutes.straight; if (ch) { const at = d => ({ x: ch.x - ch.hx * d + ch.nx * (W + 6), z: ch.z - ch.hz * d + ch.nz * (W + 6) });
      [["STRAIGHT SIX", 740], ["1000 m", 550]].forEach(([t, d]) => { const p = at(d), m = new THREE.Mesh(new THREE.BoxGeometry(7.5, 1.8, 0.15), boardMat(t, "#7a1020", "#ffffff", 512, 128, 56)); m.position.set(p.x, 3, p.z); m.rotation.y = Math.atan2(ch.hx, ch.hz) + Math.PI / 2; G.add(m); }); } }
    sign(G, trk, trk.marks.homeTurn + 60, "HOME TURN", "#7a1020", "#ffffff", W + 6);
    sign(G, trk, trk.marks.topTurn + 50, "RIVER END", "#0b2a4a", "#ffffff", W + 6);
    bigScreen(G, trk, lap - 160, -60, 28, "FLEMINGTON");
    marquees(G, trk, lap - 120, lap + 40, -40, 8, rng, true);
    const lake = flemingtonInfield(G, trk, C, rng, spots);
    // ---- the Maribyrnong River beyond the back of the course, lined with river red gums; Melbourne to the south-east
    { const riv = new THREE.Mesh(ribbon(pt, trk.marks.topTurn - 200, trk.marks.back_end + 200, W + 150, W + 182, -0.02, -0.02, 160, 1), mm.water); riv.receiveShadow = true; G.add(riv);
      const bank = new THREE.Mesh(ribbon(pt, trk.marks.topTurn - 200, trk.marks.back_end + 200, W + 140, W + 150, 0, -0.01, 160, 1), mm.gravel); G.add(bank); }
    const trees = [];
    for (let s = trk.marks.topTurn - 200; s < trk.marks.back_end + 200; s += 9) { for (const off of [W + 120 + rng() * 22, W + 195 + rng() * 40]) { const p = pt(s, off, {}); trees.push({ x: p.x, z: p.z, s: 0.95 + rng() * 0.6, sp: "gum" }); } }
    for (let k = 0; k < 2400 && trees.length < 260; k++) { const x = C.cx + (rng() - 0.5) * 1100, z = C.cz + (rng() - 0.5) * 520; if (!C.inside(x, z) || lake.keepOut(x, z)) continue; let ok = true; for (let s = 0; s < lap; s += 15) { const p = pt(s, -20, Q); if ((p.x - x) ** 2 + (p.z - z) ** 2 < 38 * 38) { ok = false; break; } } if (!ok) continue; trees.push({ x, z, s: 0.8 + rng() * 0.6, sp: rng() < 0.55 ? "plane" : rng() < 0.6 ? "gum" : "cypress" }); }
    for (let s = lap - 520; s < lap + 200; s += 16) { const p = pt(s, W + 250 + rng() * 30, {}); trees.push({ x: p.x, z: p.z, s: 1 + rng() * 0.4, sp: rng() < 0.25 ? "palm" : "plane" }); }
    trees.push(...lake.trees);
    GFX.plantTrees(G, trees);
    suburbs(G, trk, trk.marks.homeTurn - 200, trk.marks.homeTurn_end + 100, W + 260, W + 480, 160, rng, 0x8e6a5a);
    skyline(G, C.cx, C.cz, 0.35, 0.7, 4000, 4700, 70, rng, { crown: true });
    G.userData.crowdSpots = spots;
    G.userData.crowd = buildCrowd(G, spots, trk, rng, 1, 0.6);
    return G;
  }

  /* ---------- Flemington's infield: an inner training track, an ornamental lake with a fountain and rose gardens,
     gravel promenades, white-fenced infield enclosures with picnic crowds, flag lines, a giant mown "FLEMINGTON" in the
     lawn (read from the broadcast towers) and light towers — so the middle of the course is part of race day ---------- */
  function flemingtonInfield(G, trk, C, rng, spots) {
    const pt = trk.point, lap = trk.lap, mm = M();
    // inner training track (cushion sand) with its own white rails
    const tr = new THREE.Mesh(ribbon(pt, 0, lap, -31, -23, -0.012, -0.012, Math.round(lap / 3), 1), mm.sand); tr.receiveShadow = true; G.add(tr);
    GFX.rail(G, (s0, off, o) => { const p = pt(s0, -22.6 - off, o); p.nx = -p.nx; p.nz = -p.nz; return p; }, 0, lap, 0, true, false, { r: 0.06 });
    GFX.rail(G, pt, 0, lap, -31.4, true, false, { r: 0.06 });
    // the lake: an ellipse in the wide part of the infield, a stone edge, a fountain, rose beds round it
    const lx = C.cx + 40, lz = C.cz, ax = 70, az = 34;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x3f6b78, roughness: 0.06, metalness: 0.3, envMapIntensity: 1.3 }));
    water.rotation.x = -Math.PI / 2; water.scale.set(ax, az, 1); water.position.set(lx, 0.02, lz); water.receiveShadow = true; G.add(water);
    const edge = new THREE.Mesh(new THREE.RingGeometry(1, 1.05, 64), mm.concrete); edge.rotation.x = -Math.PI / 2; edge.scale.set(ax, az, 1); edge.position.set(lx, 0.03, lz); G.add(edge);
    { const fm = new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 0.2, transparent: true, opacity: 0.75, emissive: 0x334455 });
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.6, 24), mm.whiteConc); basin.position.set(lx, 0.3, lz); G.add(basin);
      const jet = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 16, 1, true), fm); jet.position.set(lx, 4, lz); jet.rotation.x = Math.PI; G.add(jet);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), fm); crown.position.set(lx, 7.2, lz); crown.scale.set(1, 0.6, 1); G.add(crown); }
    const roses = [], cols = [0xc8102e, 0xe63950, 0xf28bb0, 0xfff1e6, 0xf6c445];
    for (let i = 0; i < 150; i++) { const a = i / 150 * Math.PI * 2; roses.push({ x: lx + Math.cos(a) * (ax + 3.5), z: lz + Math.sin(a) * (az + 3.5), s: 0.85, flower: cols[(i >> 2) % cols.length] }); }
    // formal rose beds and gravel promenades from the course side to the lake
    const beds = [[lx - ax - 40, lz - 20], [lx - ax - 40, lz + 20], [lx + ax + 35, lz - 22], [lx + ax + 35, lz + 22]];
    for (const [bx, bz] of beds) for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) roses.push({ x: bx - 12 + c * 3, z: bz - 4.5 + r * 3, s: 0.8, flower: cols[(r + c) % cols.length] });
    GFX.shrubs(G, roses, 0x34552a, cols);
    const walk = (x0, z0, x1, z1, w) => { const L = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.PlaneGeometry(L, w), mm.gravel); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z1 - z0, x1 - x0); m.position.set((x0 + x1) / 2, 0.015, (z0 + z1) / 2); m.receiveShadow = true; G.add(m); };
    walk(lx - ax - 70, lz, lx - ax - 6, lz, 6); walk(lx + ax + 6, lz, lx + ax + 70, lz, 6); walk(lx, lz - az - 40, lx, lz - az - 6, 5); walk(lx, lz + az + 6, lx, lz + az + 40, 5);
    // the mown "FLEMINGTON" in the lawn (lighter stripes), readable from the stands and the broadcast towers
    { const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 160; const g = cv.getContext("2d"); g.clearRect(0, 0, 1024, 160); g.fillStyle = "rgba(235,255,215,0.32)"; g.font = "900 128px Archivo, Arial Black, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("FLEMINGTON", 512, 84);
      const tx = new THREE.CanvasTexture(cv); tx.encoding = THREE.sRGBEncoding; tx.anisotropy = 8;
      const p0 = pt(lap - 120, -95, {}), m = new THREE.Mesh(new THREE.PlaneGeometry(150, 23), new THREE.MeshStandardMaterial({ map: tx, transparent: true, depthWrite: false, roughness: 1 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-p0.hz, p0.hx); m.position.set(p0.x, 0.02, p0.z); m.renderOrder = 1; G.add(m); }
    // white-fenced infield enclosures beside the marquees, with a picnic crowd (filled on feature days)
    const encl = [];
    for (let s0 = lap - 150; s0 < lap + 60; s0 += 1.2) { const off = -44 - rng() * 26, p = pt(s0, off, Q); if (rng() < 0.5) encl.push({ x: p.x, y: 0, z: p.z, rot: Math.atan2(p.nx, p.nz) + (rng() - 0.5) * 1.2, seated: rng() < 0.3, keen: rng() }); }
    spots.push(...encl);
    GFX.rail(G, pt, lap - 160, lap + 70, -40, false, false, { r: 0.05 });
    // flag line along the infield side of the straight + light towers
    for (let s0 = lap - 420; s0 < lap - 20; s0 += 40) { const p = pt(s0, -14, {}); const c = cyl(G, mm.steelWhite, p.x, 0, p.z, 0.08, 0.06, 10, 6); c.castShadow = false; flag(G, p.x, 9.4, p.z, [0xc8102e, 0x0b2a4a, 0xf6c445][(s0 / 40 | 0) % 3], Math.atan2(p.hx, p.hz)); }
    for (const s0 of [lap - 330, lap - 60, 300, 900]) { const p = pt(s0, -60, {}); cyl(G, mm.steel, p.x, 0, p.z, 0.5, 0.35, 28, 8); box(G, mm.dark, p.x, 29, p.z, 6, 2.4, 1.2); }
    const keepOut = (x, z) => ((x - lx) / (ax + 14)) ** 2 + ((z - lz) / (az + 14)) ** 2 < 1 || beds.some(([bx, bz]) => Math.abs(x - bx) < 22 && Math.abs(z - bz) < 12);
    // distance to the inner rail, from a coarse list of rail points (cheap enough to test thousands of positions)
    const railPts = []; for (let s = 0; s < lap; s += 10) { const p = pt(s, -20, {}); railPts.push(p.x, p.z); }
    const near = (x, z, d) => { const d2 = d * d; for (let i = 0; i < railPts.length; i += 2) { const dx = railPts[i] - x, dz = railPts[i + 1] - z; if (dx * dx + dz * dz < d2) return true; } return false; };
    const straightZone = (x, z) => { for (let s = lap - 180; s < lap + 80; s += 12) { const p = pt(s, -55, Q); if ((p.x - x) ** 2 + (p.z - z) ** 2 < 42 * 42) return true; } return false; };
    // ---- mown stripes across the whole infield: alternate lighter bands, parallel to the home straight
    { const h0 = pt(lap - 200, 0, {}), ux = h0.hx, uz = h0.hz, vx = -uz, vz = ux, step = 5, bw = 9, pos = [], idx = [];
      const quad = (t0, t1, d) => { const n = pos.length / 3; for (const [t, e] of [[t0, -bw / 2], [t1, -bw / 2], [t0, bw / 2], [t1, bw / 2]]) pos.push(C.cx + ux * t + vx * (d + e), 0.014, C.cz + uz * t + vz * (d + e)); idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); };
      for (let d = -420; d <= 420; d += bw * 2) { let run = null;
        for (let t = -800; t <= 800; t += step) { const x = C.cx + ux * t + vx * d, z = C.cz + uz * t + vz * d, ok = C.inside(x, z) && !near(x, z, 33) && !keepOut(x, z);
          if (ok && run == null) run = t; if ((!ok || t + step > 800) && run != null) { if (t - run > step) quad(run, t, d); run = null; } } }
      if (idx.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf2ffd8, transparent: true, opacity: 0.13, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
        m.receiveShadow = true; m.renderOrder = 0; m.name = "mown stripes"; G.add(m); } }
    // ---- tree groves: plane-tree copses, gum stands and cypress rows scattered over the infield (sight lines to the
    // far side of the course kept clear near the rail)
    const trees = [], groves = [];
    for (let k = 0; k < 900 && groves.length < 18; k++) {
      const x = C.cx + (rng() - 0.5) * 1100, z = C.cz + (rng() - 0.5) * 560;
      if (!C.inside(x, z) || near(x, z, 62) || keepOut(x, z) || straightZone(x, z) || groves.some(g => (g.x - x) ** 2 + (g.z - z) ** 2 < 85 * 85)) continue;
      const sp = ["plane", "gum", "plane", "fig", "cypress", "gum"][groves.length % 6], n = sp === "cypress" ? 10 : 6 + (rng() * 9 | 0), R = sp === "cypress" ? 0 : 10 + rng() * 16;
      groves.push({ x, z, sp });
      for (let i = 0; i < n; i++) { let tx, tz;
        if (sp === "cypress") { const a = (x * 0.013) % Math.PI; tx = x + (i - n / 2) * 7 * Math.cos(a); tz = z + (i - n / 2) * 7 * Math.sin(a); }   // a windbreak row
        else { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * R; tx = x + Math.cos(a) * r; tz = z + Math.sin(a) * r; }
        if (C.inside(tx, tz) && !near(tx, tz, 48) && !keepOut(tx, tz)) trees.push({ x: tx, z: tz, s: 0.85 + rng() * 0.6, sp }); }
    }
    // ---- an avenue of plane trees and clipped hedges along the promenades to the lake
    { const hedge = [], H = new THREE.Object3D();
      for (const [x0, z0, x1, z1] of [[lx - ax - 70, lz, lx - ax - 8, lz], [lx + ax + 8, lz, lx + ax + 70, lz], [lx, lz - az - 40, lx, lz - az - 8], [lx, lz + az + 8, lx, lz + az + 40]]) {
        const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
        for (const sd of [-1, 1]) { for (let t = 4; t < L - 2; t += 12) trees.push({ x: x0 + dx * t - dz * sd * 7, z: z0 + dz * t + dx * sd * 7, s: 0.75, sp: "plane", keep: true });
          hedge.push({ x: (x0 + x1) / 2 - dz * sd * 3.8, z: (z0 + z1) / 2 + dx * sd * 3.8, L, rot: Math.atan2(-dz, dx) }); } }
      const hm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0x2f4f26, 0.9), hedge.length);
      hedge.forEach((h, i) => { H.position.set(h.x, 0.55, h.z); H.rotation.set(0, h.rot, 0); H.scale.set(h.L - 4, 1.1, 1.1); H.updateMatrix(); hm.setMatrixAt(i, H.matrix); });
      hm.castShadow = true; hm.receiveShadow = true; G.add(hm); }
    // ---- training centre at the far end of the infield: stable barns, a horse walker, a sand round yard
    { let f = null; for (const s0 of [trk.marks.topTurn - 60, trk.marks.topTurn - 160, trk.marks.topTurn + 60, trk.marks.back + 100]) for (const off of [-120, -95, -150]) { if (f) break; const p = pt(s0, off, {}); if (C.inside(p.x, p.z) && !near(p.x, p.z, 70) && !keepOut(p.x, p.z)) f = frameAt(trk, s0, off); }
      if (f) { const T = place(new THREE.Group(), f), wall = std(0xe9e2d2, 0.85), roofM = std(0x6b2a24, 0.7), doorM = std(0x2b4a35, 0.7);
        for (let b = 0; b < 3; b++) { const z0 = -b * 16;
          box(T, wall, 0, 1.8, z0, 46, 3.6, 9);
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.6, 3, 4, 1), roofM); r.rotation.set(0, Math.PI / 4, 0); r.scale.set(1, 1, 1); r.position.set(0, 5.1, z0); r.scale.set(46 / 9.3, 1, 1.03); r.castShadow = true; r.receiveShadow = true; T.add(r);
          for (let d = 0; d < 10; d++) box(T, doorM, -20.7 + d * 4.6, 1.4, z0 + 4.52, 2.2, 2.6, 0.08, false); }
        excludeLocal(T, -24, 24, -38, 6);
        // horse walker: central post, four arms, a fenced circular lane
        const wx = 36, wz = -10; cyl(T, mm.steel, wx, 0, wz, 0.35, 0.3, 4.2, 8);
        for (let a = 0; a < 4; a++) { const arm = box(T, mm.steel, wx, 4, wz, 18, 0.18, 0.18, false); arm.rotation.y = a * Math.PI / 4; }
        const lane = new THREE.Mesh(new THREE.RingGeometry(6.5, 10, 40), mm.sand); lane.rotation.x = -Math.PI / 2; lane.position.set(wx, 0.02, wz); lane.receiveShadow = true; T.add(lane);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(10.2, 0.07, 6, 48), mm.steelWhite); ring.rotation.x = Math.PI / 2; ring.position.set(wx, 1.2, wz); T.add(ring);
        const yard = new THREE.Mesh(new THREE.CircleGeometry(12, 40), mm.sand); yard.rotation.x = -Math.PI / 2; yard.position.set(-40, 0.02, -12); yard.receiveShadow = true; T.add(yard);
        const yr = new THREE.Mesh(new THREE.TorusGeometry(12.1, 0.08, 6, 56), mm.steelWhite); yr.rotation.x = Math.PI / 2; yr.position.set(-40, 1.3, -12); T.add(yr);
        G.add(T); T.updateMatrixWorld(true); const c = new THREE.Vector3(0, 0, -16).applyMatrix4(T.matrixWorld); groves.push({ x: c.x, z: c.z, sp: "stables" }); } }
    // ---- the picnic lawns behind the infield enclosures: café umbrellas in the club colours
    { const cols = [0xc8102e, 0x0b2a4a, 0xf6c445, 0xfbfbf8, 0x2a7a4b], n = 54, can = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 0.7, 8), std(0xffffff, 0.75), n), pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 5), mm.steelWhite, n), O = new THREE.Object3D(), c = new THREE.Color();
      for (let i = 0; i < n; i++) { const p = pt(lap - 150 + rng() * 210, -74 - rng() * 22, {});
        O.position.set(p.x, 2.55, p.z); O.rotation.set(0, rng() * 3, 0); O.scale.set(1, 1, 1); O.updateMatrix(); can.setMatrixAt(i, O.matrix); can.setColorAt(i, c.setHex(cols[i % cols.length]));
        O.position.y = 1.25; O.updateMatrix(); pole.setMatrixAt(i, O.matrix);
        if (rng() < 0.8) spots.push({ x: p.x + 1.1, y: 0, z: p.z, rot: rng() * 6.28, seated: rng() < 0.6, keen: rng() * 0.4 }); }
      if (can.instanceColor) can.instanceColor.needsUpdate = true; can.castShadow = true; G.add(can); G.add(pole); }
    return { keepOut: (x, z) => keepOut(x, z) || groves.some(g => (g.x - x) ** 2 + (g.z - z) ** 2 < (g.sp === "stables" ? 60 * 60 : 30 * 30)), trees };
  }

  /* ---------- shared pieces: parade ring, marquees, suburbs, skyline, crowd ---------- */
  // an oval parade ring: walking track (rubber/sand), lawn centre, white rails, tiered decks (local frame: -z away from the course)
  function buildParadeRing(R, o) {
    const { rx, ry, sunk, tiers: nT, style } = o, mm = M(), spots = [], rr = GFX.rand(rx * 13 | 0);
    const oval = (a, k) => [Math.cos(a) * (rx + k), Math.sin(a) * (ry + k)];
    const ringMesh = (k0, k1, y, mat) => { const pos = [], idx = [], N = 72; for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2, [x0, z0] = oval(a, k0), [x1, z1] = oval(a, k1); pos.push(x0, y, z0, x1, y, z1); } for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; R.add(m); return m; };
    const y0 = -sunk;
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(1, 48), GFX.turfMaterial("lawn", 0xb8cc9e)); lawn.rotation.x = -Math.PI / 2; lawn.scale.set(rx - 4.5, ry - 4.5, 1); lawn.position.y = y0 + 0.03; lawn.receiveShadow = true; R.add(lawn);
    ringMesh(-4.5, 0, y0 + 0.02, style === "randwick" ? std(0x5b524a, 0.95) : M().gravel);             // the walking track
    // inner and outer white rails
    for (const k of [-4.6, 0.2]) { const pts = []; for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2, [x, z] = oval(a, k); pts.push(new THREE.Vector3(x, y0 + 1.05, z)); }
      const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, 0.06, 6, true), std(0xf6f6f2, 0.35)); t.castShadow = true; R.add(t);
      const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6), std(0xf6f6f2, 0.35), 48), dm = new THREE.Object3D(); for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, [x, z] = oval(a, k); dm.position.set(x, y0 + 0.525, z); dm.updateMatrix(); posts.setMatrixAt(i, dm.matrix); } R.add(posts); }
    // terraces rising from the ring (sunken bowl at Randwick, low steps at Flemington), leaving an entry gap toward the course
    const gapA = Math.PI / 2 - 0.35, gapB = Math.PI / 2 + 0.35;                // +z side = towards the course
    for (let t = 0; t < nT; t++) {
      const k0 = 2 + t * 1.3, k1 = k0 + 1.3, y = y0 + 0.45 * (t + 1);
      const pos = [], idx = [], N = 84; for (let i = 0; i <= N; i++) { const a = gapB + (Math.PI * 2 - (gapB - gapA)) * i / N, [x0, z0] = oval(a, k0), [x1, z1] = oval(a, k1); pos.push(x0, y, z0, x1, y, z1, x0, y - 0.45, z0); }
      for (let i = 0; i < N; i++) { const a = i * 3, b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b, a + 2, a, b + 2, a, b, b + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, style === "randwick" ? M().timber : M().concrete); m.receiveShadow = true; m.castShadow = true; R.add(m);
      for (let i = 0; i < 140; i++) { const a = gapB + (Math.PI * 2 - (gapB - gapA)) * rr(), [x, z] = oval(a, k0 + 0.65); if (rr() < 0.55) spots.push({ x, y: y, z, rot: Math.atan2(-x, -z), seated: style === "randwick" && rr() < 0.6, keen: rr() * 0.6 }); }
    }
    // retaining wall of the sunken bowl
    if (sunk > 0) { const pos = [], idx = [], N = 96; for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2, [x, z] = oval(a, 1.2); pos.push(x, y0, z, x, 0.05, z); } for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const w = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: M().concreteTex, color: 0xd8d2c4, roughness: 0.9, side: THREE.DoubleSide })); w.receiveShadow = true; R.add(w); }
    // Flemington: roses round the yard; Randwick: a timber pergola walk on the course side
    if (style === "flemington") { const roses = []; for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2, [x, z] = oval(a, 2.2 + nT * 1.3 + 1.6); roses.push({ x, z, s: 0.8, flower: [0xc8102e, 0xf28bb0, 0xfff1e6, 0xf6c445][i % 4] }); }
      const g2 = new THREE.Group(); GFX.shrubs(g2, roses, 0x34552a, [0xc8102e]); R.add(g2); }
    else { for (let i = -4; i <= 4; i++) cyl(R, M().timber, i * 4.5, 0, ry + 16, 0.18, 0.18, 4, 6); box(R, M().timber, 0, 4.1, ry + 16, 40, 0.3, 4); }
    // mounting points are used by the parade-ring presentation: the walking path (in this group's frame)
    R.userData.path = (u, out) => { const a = u * Math.PI * 2, [x, z] = oval(a, -2.25); out.set(x, y0, z); return out; };
    R.userData.spots = spots; R.userData.y0 = y0; R.userData.rx = rx; R.userData.ry = ry;
    return R;
  }
  function marquees(G, trk, s0, s1, off, n, rng, infield) {
    const white = std(0xfbfbf8, 0.7), trim = std(0x1d3557, 0.6);
    for (let i = 0; i < n; i++) { const s = s0 + (s1 - s0) * (i + 0.5) / n, f = frameAt(trk, s, off), T = place(new THREE.Group(), f);
      const w = 14 + rng() * 6; box(T, white, 0, 1.6, infield ? 4 : -4, w, 3.2, 9, true);
      const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, 3, 4), white); r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 9 / w * 1.2); r.position.set(0, 4.7, infield ? 4 : -4); r.castShadow = true; T.add(r);
      box(T, trim, 0, 3.25, infield ? 4 : -4, w + 0.1, 0.3, 9.1, false); G.add(T); }
  }
  // low-rise suburbs: houses with pitched roofs (instanced walls + roofs)
  function suburbs(G, trk, s0, s1, off0, off1, n, rng, roofHex) {
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: houseTex(), roughness: 0.85 }), n), roofG = new THREE.ConeGeometry(0.75, 1, 4); roofG.rotateY(Math.PI / 4);
    const roofs = new THREE.InstancedMesh(roofG, std(roofHex, 0.75), n), dm = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const s = s0 + (s1 - s0) * rng(), p = trk.point(s, off0 + (off1 - off0) * rng(), {}); const w = 9 + rng() * 6, d = 11 + rng() * 6, h = 3.2 + rng() * 2.8, rot = Math.atan2(-p.hz, p.hx);
      dm.position.set(p.x, h / 2, p.z); dm.rotation.set(0, rot, 0); dm.scale.set(w, h, d); dm.updateMatrix(); walls.setMatrixAt(i, dm.matrix); walls.setColorAt(i, rng() < 0.45 ? c.setHSL(0.03, 0.45, 0.42 + rng() * 0.1) : c.setHSL(0.09, 0.15 + rng() * 0.2, 0.62 + rng() * 0.2));
      dm.position.set(p.x, h + 1.4, p.z); dm.scale.set(w * 1.05, 2.8, d * 1.05); dm.updateMatrix(); roofs.setMatrixAt(i, dm.matrix); roofs.setColorAt(i, c.setHSL(0.04, 0.4 + rng() * 0.2, 0.32 + rng() * 0.12)); }
    [walls, roofs].forEach(m => { m.castShadow = false; m.receiveShadow = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; G.add(m); });
  }
  // house walls: rendered/brick wall with windows and a door (tinted per instance)
  let HOUSE = null;
  function houseTex() { if (HOUSE) return HOUSE; HOUSE = canvasTex(128, 64, (g, w, h) => { g.fillStyle = "#e6dfd2"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(0,0,0,0.06)"; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
      g.fillStyle = "#3b4652"; for (const x of [14, 50, 92]) g.fillRect(x, 18, 18, 20); g.fillStyle = "#f4f1ea"; for (const x of [14, 50, 92]) { g.fillRect(x + 8, 18, 2, 20); g.fillRect(x, 27, 18, 2); } g.fillStyle = "#5a3a2a"; g.fillRect(72, 30, 12, 34); });
    HOUSE.wrapS = HOUSE.wrapT = THREE.ClampToEdgeWrapping; return HOUSE; }
  // distant city skyline (towers with a glass-and-mullion texture), optionally a needle tower or a gold-crowned tower
  function skyline(G, cx, cz, a0, span, r0, r1, n, rng, o) {
    const tex = GFX.glassMat(0x9fb2c2, 31), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tex, n), dm = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const a = a0 + span * (i / n - 0.5) + (rng() - 0.5) * 0.05, r = r0 + rng() * (r1 - r0), h = 40 + rng() * (i % 5 === 0 ? 210 : 110);
      dm.position.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r); dm.scale.set(28 + rng() * 40, h, 28 + rng() * 40); dm.rotation.set(0, rng() * 3, 0); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); inst.setColorAt(i, c.setRGB(0.75 + rng() * 0.3, 0.78 + rng() * 0.3, 0.8 + rng() * 0.3)); }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true; G.add(inst);
    const hx = cx + Math.cos(a0) * (r0 + 150), hz = cz + Math.sin(a0) * (r0 + 150);
    if (o && o.needle) {          // a needle tower with a turret near the top (a famous harbour-city silhouette)
      const T = new THREE.Group(); T.position.set(hx, 0, hz);
      cyl(T, M().steel, 0, 0, 0, 7, 5.5, 230, 16, false); const tur = new THREE.Mesh(new THREE.CylinderGeometry(18, 13, 26, 20), std(0xd9b866, 0.35, 0.8)); tur.position.set(0, 245, 0); T.add(tur);
      cyl(T, M().steel, 0, 258, 0, 3, 1, 50, 8, false); G.add(T);
    }
    if (o && o.crown) {           // a very tall slender tower with a gold crown
      const T = new THREE.Group(); T.position.set(hx, 0, hz);
      const b = new THREE.Mesh(new THREE.BoxGeometry(40, 290, 34), GFX.glassMat(0x8094a8, 33)); b.position.y = 145; T.add(b);
      const crn = new THREE.Mesh(new THREE.BoxGeometry(40.5, 34, 34.5), std(0xd4af37, 0.3, 0.9)); crn.position.y = 290 - 17; T.add(crn); G.add(T);
    }
  }
  /* ---------- where spectators may stand ----------
     Crowd spots come from the stands (seat rows, terraces), lawns and aprons. Before a crowd is built every spot is
     checked against (1) the racing surface — the course and every chute, rail to rail plus a metre — and (2) the
     no-crowd zones the buildings register (building interiors, lift cores). Anything on the track or inside a structure
     is dropped. (Barrier staff are not part of the crowd: the gate builder places them on the ground beside the unit.) */
  let EXCL = [];
  function excludeLocal(S, x0, x1, z0, z1) {
    S.updateMatrixWorld(true); const c = _v.set((x0 + x1) / 2, 0, (z0 + z1) / 2).applyMatrix4(S.matrixWorld), r = S.rotation.y;
    EXCL.push({ x: c.x, z: c.z, ux: Math.cos(r), uz: -Math.sin(r), vx: Math.sin(r), vz: Math.cos(r), hx: Math.abs(x1 - x0) / 2, hz: Math.abs(z1 - z0) / 2 });
  }
  function surfaceGrid(trk) {
    const cell = 2, set = new Set(), W = trk.W, mark = p => set.add(Math.floor(p.x / cell) + "," + Math.floor(p.z / cell));
    for (let s = 0; s < trk.lap; s += 1) for (let off = -1; off <= W + 1; off += 1) mark(trk.point(s, off, Q));
    for (const c of Object.values(trk.chutes || {})) { const len = c.len || 430; for (let d = 0; d < len; d += 1) for (let off = -1; off <= W + 1; off += 1) mark({ x: c.x - c.hx * d + c.nx * off, z: c.z - c.hz * d + c.nz * off }); }
    return (x, z) => set.has(Math.floor(x / cell) + "," + Math.floor(z / cell));
  }
  function validSpots(spots, trk) {
    const onTrack = surfaceGrid(trk); let track = 0, bld = 0;
    const out = spots.filter(sp => {
      if (onTrack(sp.x, sp.z)) { track++; return false; }
      for (const e of EXCL) { const dx = sp.x - e.x, dz = sp.z - e.z; if (Math.abs(dx * e.ux + dz * e.uz) < e.hx && Math.abs(dx * e.vx + dz * e.vz) < e.hz) { bld++; return false; } }
      return true; });
    VENUES.lastPlacement = { total: spots.length, kept: out.length, onTrack: track, inBuildings: bld };
    return out;
  }
  function buildCrowd(G, spots, trk, rng, seed, fancy) {
    const Qf = GFX.q().crowd, setting = settings.crowd === "off" ? 0 : settings.crowd === "light" ? 0.45 : 1;
    const keepFrac = Qf * setting; spots = validSpots(spots, trk); EXCL = []; G.userData.placement = VENUES.lastPlacement;
    if (!keepFrac || !spots.length) return null;
    // keep the most visible spectators first (apron + lower bowl were added first), drop a uniform share of the rest
    const out = []; spots.forEach((s, i) => { if (i < 600 || GFX.hash(i, seed, 5) < keepFrac) out.push(s); });
    const cr = GFX.crowd(G, out, { seed: 31 + seed, fancy: fancy || 0 });
    return cr;
  }

  // ---------- switching venue ----------
  function use(trk, cfg) {
    if (!BOX) BOX = new THREE.BoxGeometry(1, 1, 1);
    if (!generic) { generic = typeof VENUE_GENERIC !== "undefined" ? VENUE_GENERIC : null; }
    trk = trk || TRACKS.generic;
    if (!FOG0) FOG0 = [scene.fog.near, scene.fog.far];
    if (trk.analytic) { if (generic) generic.visible = true; for (const k in built) built[k].visible = false; current = null; currentId = null; restoreFinishNear(); scene.fog.near = FOG0[0]; scene.fog.far = FOG0[1]; return; }
    scene.fog.near = 650; scene.fog.far = 5600;                                   // a clear day: the city skyline shows through the haze
    if (!built[trk.id]) { built[trk.id] = trk.id === "flemington" ? buildFlemington(trk) : buildRandwick(trk); world.add(built[trk.id]); }
    for (const k in built) built[k].visible = k === trk.id;
    if (generic) generic.visible = false;
    current = built[trk.id]; currentId = trk.id;
    // a major meeting fills the stands; an ordinary one is a decent midweek crowd
    const c = cfg && cfg.career, cr = current.userData.crowd;
    if (cr) cr.set(c && (c.crown || c.major) ? 1 : c && c.official ? 0.6 : 0.48);
    swapFinishNear(current.userData.finishNear || []);
  }
  // the photo-finish view hides the inner finish post (it stands between the camera and the noses)
  let savedNear = null;
  function swapFinishNear(arr) { if (typeof finishNear === "undefined") return; if (!savedNear) savedNear = finishNear.slice(); finishNear.length = 0; arr.forEach(o => finishNear.push(o)); }
  function restoreFinishNear() { if (savedNear && typeof finishNear !== "undefined") { finishNear.length = 0; savedNear.forEach(o => finishNear.push(o)); } }
  let screenT = 0;
  function update(dt) {
    if (!current) return;
    screenT -= dt; if (screenT > 0) return; screenT = 0.25;
    for (const sc of SCREENS) {
      if (!sc.group.visible) continue;
      const g = sc.ctx, W2 = 640, H2 = 256;
      g.fillStyle = "#06120b"; g.fillRect(0, 0, W2, H2); g.fillStyle = "#e8c35a"; g.fillRect(0, 0, W2, 38);
      g.fillStyle = "#06120b"; g.font = "900 24px Archivo, sans-serif"; g.textBaseline = "middle"; g.textAlign = "left";
      if (race && race.state !== "load" && race.state !== "count") {
        const L = race.order[0], rem = Math.max(0, Math.round(race.dist - (L ? L.progress : 0)));
        g.fillText((race.cfg.career ? race.cfg.career.name.toUpperCase() : "RACE " + race.dist + "m"), 12, 20); g.textAlign = "right"; g.fillText(race.state === "done" ? "RESULT" : rem + " m", W2 - 12, 20); g.textAlign = "left";
        const list = race.state === "done" ? race.finishOrder : race.order;
        for (let i = 0; i < Math.min(6, list.length); i++) { const h = list[i], y = 62 + i * 32; g.fillStyle = h.isPlayer ? "#ffd54a" : "#ffffff"; g.font = "800 26px Archivo, sans-serif"; g.fillText((i + 1) + "  " + h.def.name.toUpperCase(), 16, y); g.fillStyle = h.def.silk || "#ccc"; g.fillRect(W2 - 50, y - 12, 30, 24); }
      } else { g.fillText(sc.title, 12, 20); g.fillStyle = "#ffffff"; g.font = "800 38px Archivo, sans-serif"; g.fillText(race && race.cfg.career ? race.cfg.career.name.toUpperCase() : "RACE DAY", 16, 110); g.font = "600 24px Archivo, sans-serif"; g.fillStyle = "#9fd6ae"; g.fillText(race ? race.dist + " m · " + race.horses.length + " runners" : "", 16, 165); }
      sc.tex.needsUpdate = true;
    }
  }
  return { use, update, get current() { return current; }, get id() { return currentId; }, parade: () => current && current.userData.parade, info: () => ({ built: Object.keys(built), current: current && current.name }) };
})();
