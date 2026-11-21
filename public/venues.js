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
    }
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
  function sheet(S, mat, f, nu, nv) {
    const pos = [], idx = []; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...f(i / nu, j / nv));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; S.add(m); return m;
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
    G.add(S);
    // ---- Theatre of the Horse: a sunken amphitheatre parade ring behind the stand, tiered decks around it
    const ringF = frameAt(trk, lap - 60, W + 3 + 128), R = place(new THREE.Group(), ringF); R.name = "Theatre of the Horse";
    buildParadeRing(R, { rx: 30, ry: 19, sunk: 2.2, tiers: 9, style: "randwick" });
    spots.push(...standSpotsToWorld(R, R.userData.spots));
    G.add(R);
    G.userData.parade = R;
    // Owners' Pavilion: two storeys of glass behind vertical aluminium fins with curved corners, under a floating roof
    { const O = place(new THREE.Group(), frameAt(trk, lap - 230, W + 3 + 90));
      { const fins = new THREE.InstancedMesh(BOX, M().steelWhite, 72), dm = new THREE.Object3D(); for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2, sx = Math.cos(a), sz = Math.sin(a), k = Math.pow(Math.pow(Math.abs(sx), 4) + Math.pow(Math.abs(sz), 4), -0.25); dm.position.set(sx * k * 18, 4, sz * k * 8.6); dm.rotation.set(0, -a, 0); dm.scale.set(0.5, 8, 0.18); dm.updateMatrix(); fins.setMatrixAt(i, dm.matrix); } fins.castShadow = true; O.add(fins); }
      tbox(O, GFX.glassMat(0xb6c8d4, 13), 0, 4, 0, 34, 7.6, 16, 4);
      sheet(O, M().whiteConc, (u, v) => [-24 + 48 * u, 9.6 + Math.sin(u * Math.PI) * 0.8, -13 + 26 * v], 8, 4);
      for (const x of [-15, 15]) for (const z of [-8, 8]) cyl(O, M().steelWhite, x, 0, z, 0.2, 0.2, 9.6, 8);
      G.add(O); }
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
      G.add(H); }
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
    // ---- the Club Stand (nearest the post): five levels whose floor edges are wrapped in white "petal" bands
    { const S = place(new THREE.Group(), frameAt(trk, lap - 40, W + 3)); S.name = "Club Stand";
      const L = 150, glassC = GFX.glassMat(0xa8bccb, 21);
      box(S, mm.concrete, 0, 0.05, -6, L + 60, 0.1, 12, false);
      spots.push(...standSpotsToWorld(S, (() => { const a = []; for (let i = 0; i < 900; i++) a.push({ x: (rng() - 0.5) * (L + 50), y: 0.1, z: -1.2 - Math.pow(rng(), 1.4) * 10, seated: false, keen: rng() }); return a; })()));
      spots.push(...standSpotsToWorld(S, tiers(S, { len: L - 10, z0: -13, y0: 0.6, rows: 10, seat: 0x7a1f2b, occ: 0.8 })));
      // floors: a wavy (petal-scalloped) white precast band at each slab edge, glass recessed behind
      for (let lv = 0; lv < 5; lv++) {
        const y = 7.2 + lv * 4.6, zf = -18 - lv * 0.6;
        sheet(S, mm.whiteConc, (u, v) => { const x = -L / 2 + L * u, sc = Math.abs(Math.sin(u * Math.PI * 14)) * 1.4; return [x, y - 0.9 + 1.4 * v, zf + sc + 0.4 * (1 - v)]; }, 140, 2);
        sheet(S, mm.whiteConc, (u, v) => { const x = -L / 2 + L * u, sc = Math.abs(Math.sin(u * Math.PI * 14)) * 1.4; return [x, y - 0.9, zf + sc - 14 * v]; }, 140, 1);
        tbox(S, glassC, 0, y + 1.6, zf - 2.5, L - 4, 3.2, 0.18, 10);
        box(S, mm.whiteConc, 0, y + 1.6, zf - 9, L - 6, 3.2, 12, false);
      }
      // rooftop garden: canopies, planters and small trees
      const ry = 7.2 + 5 * 4.6 - 0.9; box(S, mm.concrete, 0, ry, -26, L - 6, 0.3, 16);
      for (let x = -L / 2 + 14; x < L / 2 - 10; x += 22) { sheet(S, mm.membrane, (u, v) => { const a = u * Math.PI * 2, r = 5 * v; return [x + Math.cos(a) * r, ry + 4.2 - 0.9 * v * v, -24 + Math.sin(a) * r * 0.7]; }, 16, 3); cyl(S, mm.steelWhite, x, ry, -24, 0.12, 0.12, 4.2, 8); }
      G.add(S);
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
      G.add(S);
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
    // ---- the Maribyrnong River beyond the back of the course, lined with river red gums; Melbourne to the south-east
    { const riv = new THREE.Mesh(ribbon(pt, trk.marks.topTurn - 200, trk.marks.back_end + 200, W + 150, W + 182, -0.02, -0.02, 160, 1), mm.water); riv.receiveShadow = true; G.add(riv);
      const bank = new THREE.Mesh(ribbon(pt, trk.marks.topTurn - 200, trk.marks.back_end + 200, W + 140, W + 150, 0, -0.01, 160, 1), mm.gravel); G.add(bank); }
    const trees = [];
    for (let s = trk.marks.topTurn - 200; s < trk.marks.back_end + 200; s += 9) { for (const off of [W + 120 + rng() * 22, W + 195 + rng() * 40]) { const p = pt(s, off, {}); trees.push({ x: p.x, z: p.z, s: 0.95 + rng() * 0.6, sp: "gum" }); } }
    for (let k = 0; k < 2400 && trees.length < 260; k++) { const x = C.cx + (rng() - 0.5) * 1100, z = C.cz + (rng() - 0.5) * 520; if (!C.inside(x, z)) continue; let ok = true; for (let s = 0; s < lap; s += 15) { const p = pt(s, -20, Q); if ((p.x - x) ** 2 + (p.z - z) ** 2 < 38 * 38) { ok = false; break; } } if (!ok) continue; trees.push({ x, z, s: 0.8 + rng() * 0.6, sp: rng() < 0.55 ? "plane" : rng() < 0.6 ? "gum" : "cypress" }); }
    for (let s = lap - 520; s < lap + 200; s += 16) { const p = pt(s, W + 250 + rng() * 30, {}); trees.push({ x: p.x, z: p.z, s: 1 + rng() * 0.4, sp: rng() < 0.25 ? "palm" : "plane" }); }
    GFX.plantTrees(G, trees);
    suburbs(G, trk, trk.marks.homeTurn - 200, trk.marks.homeTurn_end + 100, W + 260, W + 480, 160, rng, 0x8e6a5a);
    skyline(G, C.cx, C.cz, 0.35, 0.7, 4000, 4700, 70, rng, { crown: true });
    G.userData.crowdSpots = spots;
    G.userData.crowd = buildCrowd(G, spots, trk, rng, 1, 0.6);
    return G;
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
  function buildCrowd(G, spots, trk, rng, seed, fancy) {
    const Qf = GFX.q().crowd, setting = settings.crowd === "off" ? 0 : settings.crowd === "light" ? 0.45 : 1;
    const keepFrac = Qf * setting; if (!keepFrac || !spots.length) return null;
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
