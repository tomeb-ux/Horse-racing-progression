// Phase 25: a lived-in farm. Things that are not your horses and not your staff's chores, going on around you, and that you can walk up to:
//  - resident horses in the paddocks (boarders, a mare with her foal) that graze, doze, wander, and come over to the fence when you walk past: E to pat one
//  - Biscuit the farm dog, who trots out to meet you, follows you about and sits when you stop: E to pat him
//  - hens scratching about the yard that scatter when you run at them
//  - visitors on a schedule driven by the farm clock: a hay delivery truck (Mon and Thu mornings: E to help unload) and a neighbour riding past (Tue, Fri and Sat afternoons: E to say g'day)
//  - the people who work here will chat (E): they talk about today's real situation (what is on, who is out, the weather, the next race)
// Nothing here touches the career or the sim: no rewards, no costs. Everything is derived from the farm clock and the date (positions of the visitors are a pure function of the clock, so
// skipping time or re-entering the farm puts them in the right place), and it is all built in one group that is removed on leaving the farm.
const FARMAMBIENT = (() => {
  let F = null, G = null, residents = [], dog = null, hens = null, truck = null, rider = null, hay = null, busy = null, sayT = 0, nearCache = [], lastDay = -1, paths = null, dogSeed = 7;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = (a, b) => a + Math.random() * (b - a), hash = (a, b) => { let h = 2166136261; const s = a + "|" + b; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const L = () => FARMWORLD.L, pick = a => a[(Math.random() * a.length) | 0];
  const dayOf = () => { try { return CAREER.data.day | 0; } catch (e) { return 0; } }, dow = () => { try { return CORE.dowOf(dayOf()); } catch (e) { return 0; } };
  const hourNow = () => { try { return FARMACTORS.live() ? FARMACTORS.hour() : -1; } catch (e) { return -1; } };
  const say = (who, text, secs) => { try { F.toast(who + ": “" + text + "”", "info", secs || 5.5); } catch (e) {} };
  const mat = hex => new THREE.MeshLambertMaterial({ color: hex }), mats = [];
  const M = hex => { const m = mat(hex); mats.push(m); return m; };
  const geos = [];
  const box = (w, h, d, hex, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); geos.push(g); const m = new THREE.Mesh(g, M(hex)); m.position.set(x, y, z); m.castShadow = true; return m; };

  // ---------------------------------------------------------------- the residents
  const RES = [
    { name: "Dolly", k: 2, roster: 3, line: ["Dolly is a retired barrier-trial mare. She leans into a scratch behind the ears.", "Dolly nickers and shoves her nose into your jacket, looking for a treat.", "Dolly blows a long breath out and closes her eyes while you pat her neck."] },
    { name: "Jasper", k: 1, roster: 5, line: ["Jasper is a neighbour's hack, boarding here while their yard is re-fenced. He sniffs your hand politely.", "Jasper stretches his neck over the rail and lets you rub his forehead.", "Jasper swishes his tail and gives you a long, sleepy look."] },
    { name: "Duke", k: 1, roster: 8, line: ["Duke is the old stock horse nobody has the heart to sell. He's heard it all before.", "Duke rests his chin on the fence rail and sighs.", "Duke tolerates a pat, then goes back to the grass as if nothing happened."] },
    { name: "Clover", k: 0, roster: 10, line: ["Clover is a bay mare with a foal at foot. She keeps one eye on Pip while you pat her.", "Clover blows softly at you, then glances back to check on her foal.", "Clover lets you stroke her cheek, ears flicking toward Pip."] },
    { name: "Pip", k: 0, roster: 11, foal: true, line: ["Pip is only a few months old. He's all legs, and he's very curious about you.", "Pip nibbles at your sleeve and then skips back to his mother.", "Pip snorts, spins in a circle, and trots off, delighted with himself."] },
  ];
  function buildResidents() {
    residents = []; const R = typeof ROSTER !== "undefined" ? ROSTER : null; if (!R) return;
    for (const r of RES) {
      const d = Object.assign({}, R[r.roster % R.length], { name: r.name }); let g; try { g = F.mkHorse(d); } catch (e) { continue; }
      if (r.foal) g.scale.setScalar(0.55); G.add(g); const P = padRect(r.k), x = P.x0 + (P.x1 - P.x0) * (0.2 + 0.6 * hash(r.name, "x")), z = P.z0 + (P.z1 - P.z0) * (0.2 + 0.6 * hash(r.name, "z"));
      g.position.set(x, F.heightAt(x, z), z); g.rotation.y = hash(r.name, "r") * 6.28; g.userData.amb = true;
      residents.push({ r, g, k: r.k, mode: "graze", t: rnd(3, 9), gx: x, gz: z, gait: 0, cool: 0, st: { t: rnd(2, 8), ev: null, et: 0, dur: 1, nerv: hash(r.name, "n") * 0.7 }, dz: 0 });
    }
    // the foal stays near its mother
    const m = residents.find(o => o.r.name === "Clover"), f = residents.find(o => o.r.name === "Pip"); if (m && f) f.mother = m;
  }
  const padRect = k => { const p = L().paddocks[k]; return { x0: p.x0 + 3, x1: p.x1 - 3, z0: p.z0 + 3, z1: p.z1 - 4 }; };
  function otherHorses() { const a = residents.map(o => o.g.position); try { for (const hid in FARMLIFE.out) a.push(FARMLIFE.out[hid].g.position); } catch (e) {} return a; }
  function pickTarget(o) { const P = padRect(o.k); for (let i = 0; i < 6; i++) { const x = P.x0 + (P.x1 - P.x0) * Math.random(), z = P.z0 + (P.z1 - P.z0) * Math.random(); if (otherHorses().every(p => p === o.g.position || Math.hypot(p.x - x, p.z - z) > 4)) return [x, z]; } return [o.g.position.x, o.g.position.z]; }
  // the nearest point of the paddock to the player (where a curious horse would come to the fence)
  function fencePoint(o) { const R = L().paddocks[o.k], x = clamp(F.P.x, R.x0 + 1.4, R.x1 - 1.4), z = clamp(F.P.z, R.z0 + 1.4, R.z1 - 1.4); return [x, z]; }
  function stepResident(o, dt) {
    const g = o.g, cam = F.cam, dd = Math.hypot(g.position.x - cam.position.x, g.position.z - cam.position.z); g.visible = dd < 85; if (dd > 75) return;
    o.t -= dt; o.cool = Math.max(0, o.cool - dt); const B = g.userData.B;
    const dxp = F.P.x - g.position.x, dzp = F.P.z - g.position.z, dp = Math.hypot(dxp, dzp);
    // curiosity: you are close to the paddock, so the nearest horse comes over to the fence
    if (o.mode !== "visit" && !o.mother && o.cool <= 0 && dp < 16 && dp > 3 && F.place() === "out" && !(o.r.foal)) { const fp = fencePoint(o), fd = Math.hypot(fp[0] - F.P.x, fp[1] - F.P.z); if (fd < 5.5) { o.mode = "visit"; o.gx = fp[0]; o.gz = fp[1]; o.t = 40; } }
    if (o.mode === "visit" && (dp > 22 || o.t <= 0)) { o.mode = "graze"; o.t = rnd(3, 6); o.cool = 25; }
    if (o.mother) {                                                   // the foal skips about near its mother
      const m = o.mother, d = Math.hypot(m.g.position.x - g.position.x, m.g.position.z - g.position.z);
      if (d > 4.5 && o.mode !== "walk") { o.mode = "walk"; o.gx = m.g.position.x + rnd(-2, 2); o.gz = m.g.position.z + rnd(-2, 2); }
    }
    if (o.mode === "walk" || (o.mode === "visit" && Math.hypot(o.gx - g.position.x, o.gz - g.position.z) > 0.5)) {
      const dx = o.gx - g.position.x, dz = o.gz - g.position.z, dist = Math.hypot(dx, dz);
      if (dist < 0.5) { o.mode = o.mode === "visit" ? "visit" : "graze"; o.t = rnd(5, 12); }
      else { const v = o.r.foal ? 1.8 : 1.15, step = Math.min(dist, v * dt), want = Math.atan2(-dz, dx); let e = want - g.rotation.y; e = Math.atan2(Math.sin(e), Math.cos(e)); g.rotation.y += e * Math.min(1, dt * 2.5);
        g.position.x += dx / dist * step; g.position.z += dz / dist * step; g.position.y = F.heightAt(g.position.x, g.position.z); o.gait += step / (o.r.foal ? 1.1 : 1.75); if (o.r.foal && v > 1.5) PRESENT.animateTrot(g, o.gait % 1, dt, { rest: 1 }); else PRESENT.animateWalk(g, o.gait % 1, dt, { rest: 1, look: 0 }); }
      return;
    }
    animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
    if (o.mode === "visit") {                                         // at the fence: head up, turned to you, ears forward
      let e = Math.atan2(-dzp, dxp) - g.rotation.y; e = Math.atan2(Math.sin(e), Math.cos(e)); g.rotation.y += e * Math.min(1, dt * 2);
      if (B) { B.neck1.rotation.z -= 0.12; B.head.rotation.z += 0.05; B.head.rotation.y = clamp(Math.sin(performance.now() / 900) * 0.08, -0.2, 0.2); }
      if (o.patT > 0) { o.patT -= dt; if (B) { B.neck1.rotation.z += 0.3 * Math.sin(Math.PI * Math.min(1, o.patT / 2.4)); B.head.rotation.z += 0.2 * Math.sin(Math.PI * Math.min(1, o.patT / 2.4)); } }
      return;
    }
    if (o.mode === "doze") { FARMIDLE.doze(g, dt, o); if (o.t <= 0) { o.dz = 0; o.mode = "graze"; o.t = rnd(4, 9); } return; }
    if (o.mode === "graze" && B) { const nod = Math.sin(performance.now() / 1000 * 0.9 + o.k) * 0.05; B.neck1.rotation.z += 0.78; B.neck2.rotation.z += 0.26; B.head.rotation.z += 0.34 + nod; B.head.rotation.y = Math.sin(performance.now() / 1000 * 0.4) * 0.1; }
    try { FARMIDLE.events(g, dt, o.st); } catch (e) {}
    if (o.t <= 0) { const r = Math.random(); if (r < 0.2 && !o.r.foal) { o.mode = "doze"; o.t = rnd(10, 18); o.dz = 0; } else { const t = pickTarget(o); o.gx = t[0]; o.gz = t[1]; o.mode = "walk"; } }
  }

  // ---------------------------------------------------------------- Biscuit the dog
  function buildDog() {
    const grp = new THREE.Group(), tan = 0xb98a52, white = 0xf1ece0, dark = 0x3a2a1c, body = box(0.34, 0.3, 0.7, tan, 0, 0.5, 0), head = new THREE.Group(), tail = new THREE.Group(), legs = [];
    head.position.set(0, 0.7, 0.42); head.add(box(0.26, 0.24, 0.3, tan, 0, 0, 0), box(0.14, 0.1, 0.16, white, 0, -0.06, 0.18), box(0.04, 0.04, 0.04, dark, 0, -0.03, 0.27), box(0.07, 0.18, 0.05, dark, 0.12, 0.16, -0.02), box(0.07, 0.18, 0.05, dark, -0.12, 0.16, -0.02));
    tail.position.set(0, 0.62, -0.36); tail.add(box(0.06, 0.06, 0.34, white, 0, 0.1, -0.14));
    for (const [x, z] of [[0.12, 0.24], [-0.12, 0.24], [0.12, -0.24], [-0.12, -0.24]]) { const l = new THREE.Group(); l.position.set(x, 0.38, z); l.add(box(0.08, 0.38, 0.08, i2(x, z) ? tan : white, 0, -0.19, 0)); grp.add(l); legs.push(l); }
    grp.add(body, head, tail); grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { grp, head, tail, legs, body, x: 0, z: 0, face: 0, mode: "idle", t: 2, tx: 0, tz: 0, sp: 0, ph: 0, sit: 0, wag: 0, patT: 0, cool: 0 };
  }
  const i2 = (x, z) => x > 0 === z > 0;
  function dogHome() { const c = L().court; return { x: (c.x0 + c.x1) / 2 + 6, z: c.z0 + 6 }; }
  function stepDog(dt) {
    const d = dog; if (!d) return; const cam = F.cam, dd = Math.hypot(d.x - cam.position.x, d.z - cam.position.z); d.grp.visible = dd < 55 && F.place() === "out"; if (!d.grp.visible) return;
    d.t -= dt; d.cool = Math.max(0, d.cool - dt); const dp = Math.hypot(F.P.x - d.x, F.P.z - d.z);
    let want = null, speed = 0;
    if (d.patT > 0) { d.patT -= dt; d.wag = 1; want = null; }
    else if (dp < 18 && dp > 3.2) { want = [F.P.x, F.P.z]; speed = dp > 9 ? 4.2 : 2.3; d.mode = "follow"; }
    else if (dp <= 3.2) { d.mode = "sit"; }
    else { if (d.mode === "follow" || d.mode === "sit") { d.mode = "idle"; d.t = rnd(2, 5); }
      if (d.mode === "idle" && d.t <= 0) { const h = dogHome(); d.tx = h.x + rnd(-14, 14); d.tz = h.z + rnd(-4, 16); d.mode = "wander"; }
      if (d.mode === "wander") { want = [d.tx, d.tz]; speed = 1.8; if (Math.hypot(d.tx - d.x, d.tz - d.z) < 0.7) { d.mode = "idle"; d.t = rnd(3, 8); } } }
    let moving = false;
    if (want) { const dx = want[0] - d.x, dz = want[1] - d.z, dist = Math.hypot(dx, dz); if (dist > 0.1) { const s = Math.min(dist, speed * dt), q = { x: d.x + dx / dist * s, z: d.z + dz / dist * s }; try { F.resolve(q, 0.3); } catch (e) {} d.x = q.x; d.z = q.z; const w = Math.atan2(dx, dz); let e = w - d.face; e = Math.atan2(Math.sin(e), Math.cos(e)); d.face += e * Math.min(1, dt * 9); moving = true; d.ph += speed * dt * 2.4; } }
    d.sp += ((moving ? speed : 0) - d.sp) * Math.min(1, dt * 6);
    const sitT = (d.mode === "sit" || d.patT > 0 || (!moving && d.mode === "idle" && d.t > 1.5)) ? 1 : 0; d.sit += (sitT - d.sit) * Math.min(1, dt * 5);
    d.wag += ((d.patT > 0 ? 1 : d.mode === "follow" || d.mode === "sit" ? 0.55 : 0.15) - d.wag) * Math.min(1, dt * 4);
    d.grp.position.set(d.x, F.heightAt(d.x, d.z), d.z); d.grp.rotation.y = d.face;
    const sw = Math.sin(d.ph) * 0.7 * Math.min(1, d.sp / 1.5) * (1 - d.sit);
    d.legs.forEach((l, i) => { const hind = i >= 2; l.rotation.x = (i % 2 ? -sw : sw) * (hind ? 1 : -1) * (hind && d.sit > 0.2 ? 0.2 : 1); if (hind) { l.position.y = 0.38 - 0.16 * d.sit; l.rotation.x = d.sit * -1.2 + (1 - d.sit) * l.rotation.x; } });
    d.body.rotation.x = -d.sit * 0.55; d.body.position.y = 0.5 - 0.13 * d.sit; d.head.position.y = 0.7 - 0.02 * d.sit; d.head.rotation.x = d.sit * 0.45 + Math.sin(d.ph * 2) * 0.05 * (1 - d.sit);
    d.tail.rotation.y = Math.sin(performance.now() / 1000 * (6 + 12 * d.wag)) * (0.25 + 0.7 * d.wag); d.tail.rotation.x = -0.4 * d.sit;
  }

  // ---------------------------------------------------------------- hens (one instanced mesh)
  function buildHens() {
    const parts = [[0.26, 0.24, 0.34, 0xd9a05a, 0, 0.28, 0], [0.14, 0.2, 0.14, 0xd9a05a, 0, 0.5, 0.2], [0.06, 0.06, 0.1, 0xe8a23a, 0, 0.5, 0.31], [0.04, 0.1, 0.1, 0xc83a2a, 0, 0.63, 0.2], [0.12, 0.2, 0.08, 0x8a5a2a, 0, 0.38, -0.2]], pos = [], nor = [], col = [], idx = []; let base = 0;
    for (const [w, h, d, hex, x, y, z] of parts) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); const c = new THREE.Color(hex).convertSRGBToLinear(), p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); } for (let i = 0; i < g.index.count; i++) idx.push(g.index.array[i] + base); base += p.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geos.push(geo);
    const m = new THREE.MeshLambertMaterial({ vertexColors: true }); mats.push(m); const im = new THREE.InstancedMesh(geo, m, 7); im.frustumCulled = false; im.castShadow = true; G.add(im);
    const c = L().court, list = []; for (let i = 0; i < 7; i++) list.push({ x: 24 + hash("hen", i) * 12, z: -16 + hash("hen", "z" + i) * 8, face: hash("hen", "f" + i) * 6.28, t: rnd(0.5, 3), tx: 0, tz: 0, mode: "peck", peck: 0 });
    hens = { im, list, dummy: new THREE.Object3D() }; void c;
  }
  function stepHens(dt) {
    if (!hens) return; const cam = F.cam, near = Math.hypot(30 - cam.position.x, -12 - cam.position.z) < 55; hens.im.visible = near && F.place() === "out"; if (!hens.im.visible) return;
    const D = hens.dummy; hens.list.forEach((h, i) => {
      h.t -= dt; const dp = Math.hypot(F.P.x - h.x, F.P.z - h.z);
      if (dp < 3.2 && h.mode !== "flee") { h.mode = "flee"; h.t = rnd(1.2, 2.2); const a = Math.atan2(h.x - F.P.x, h.z - F.P.z) + rnd(-0.6, 0.6); h.tx = h.x + Math.sin(a) * 6; h.tz = h.z + Math.cos(a) * 6; }
      if (h.mode === "flee") { moveTo(h, h.tx, h.tz, 4.2, dt); if (h.t <= 0) { h.mode = "peck"; h.t = rnd(1, 3); } }
      else if (h.mode === "walk") { moveTo(h, h.tx, h.tz, 0.9, dt); if (h.t <= 0 || Math.hypot(h.tx - h.x, h.tz - h.z) < 0.3) { h.mode = "peck"; h.t = rnd(1.5, 5); } }
      else { h.peck += dt * 9; if (h.t <= 0) { h.mode = "walk"; h.t = rnd(2, 5); h.tx = clamp(h.x + rnd(-3, 3), 20, 38); h.tz = clamp(h.z + rnd(-3, 3), -19, -6); } }
      const bob = h.mode === "peck" ? Math.max(0, Math.sin(h.peck)) * 0.5 : h.mode === "flee" ? 0.15 : 0;
      D.position.set(h.x, F.heightAt(h.x, h.z), h.z); D.rotation.set(bob, h.face, 0); D.scale.setScalar(h.mode === "flee" ? 1 : 1); D.updateMatrix(); hens.im.setMatrixAt(i, D.matrix);
    }); hens.im.instanceMatrix.needsUpdate = true;
  }
  function moveTo(h, tx, tz, v, dt) { const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz); if (d < 0.05) return; const s = Math.min(d, v * dt), q = { x: h.x + dx / d * s, z: h.z + dz / d * s }; try { F.resolve(q, 0.2); } catch (e) {} h.x = q.x; h.z = q.z; const w = Math.atan2(dx, dz); let e = w - h.face; e = Math.atan2(Math.sin(e), Math.cos(e)); h.face += e * Math.min(1, dt * 10); }

  // ---------------------------------------------------------------- visitors (pure functions of the farm clock)
  const DELIVERY = { days: [1, 4], from: 7.5, arrive: 7.8, leave: 8.4, gone: 8.7 }, RIDER = { days: [2, 5, 6], from: 15.5, to: 16.3 };
  function route(a, b) { try { const r = FARMNAV.find(F.world, a, b); if (r && r.pts && r.pts.length > 1) return r.pts.map(p => [p[0], p[1]]); } catch (e) {} return [a, b]; }
  function plen(P) { let n = 0; const c = [0]; for (let i = 1; i < P.length; i++) { n += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); c.push(n); } return { P, c, len: n }; }
  function along(R, s) { s = clamp(s, 0, R.len); let i = 1; while (i < R.c.length - 1 && R.c[i] < s) i++; const a = R.P[i - 1], b = R.P[i], u = (s - R.c[i - 1]) / Math.max(1e-6, R.c[i] - R.c[i - 1]); return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, hx: b[0] - a[0], hz: b[1] - a[1] }; }
  function buildPaths() {
    const gate = L().gate, park = parkSpot(); paths = { park, truckIn: plen(route([gate.x, gate.z], [park.x, park.z])), rideIn: plen(route([gate.x, gate.z - 1], [-6.6, 21])) };
  }
  function parkSpot() { const f = L().feed, cands = [[f.x0 + 6, f.z1 + 5], [f.x0 + 8, f.z1 + 6], [(f.x0 + f.x1) / 2, f.z1 + 7], [f.x1 + 6, f.z1 + 3]]; for (const c of cands) if (!FARMNAV.blockedAt(c[0], c[1]) && !FARMNAV.blockedAt(c[0] + 3, c[1]) && !FARMNAV.blockedAt(c[0] - 3, c[1])) return { x: c[0], z: c[1] }; return { x: cands[0][0], z: cands[0][1] }; }
  function buildTruck() {
    const g = new THREE.Group(); g.add(box(2.3, 0.35, 6.2, 0x3a3f44, 0, 0.55, 0), box(2.3, 1.7, 1.7, 0xd9d4c8, 0, 1.5, 2.2), box(2.1, 0.5, 0.08, 0x9fc4d8, 0, 1.9, 3.07), box(2.4, 2.0, 4.2, 0x6b7a4a, 0, 1.75, -1.1), box(2.45, 0.12, 4.3, 0x4a5636, 0, 2.8, -1.1));
    for (const [x, z] of [[1.15, 2.2], [-1.15, 2.2], [1.15, -2.2], [-1.15, -2.2]]) g.add(box(0.3, 0.9, 0.9, 0x151515, x, 0.45, z));
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.visible = false; G.add(g);
    const bales = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.45, 0.5), M(0xcdb15a), 40); geos.push(bales.geometry); bales.frustumCulled = false; bales.castShadow = true; G.add(bales);
    truck = { g, bales, driver: null, state: "gone" }; hay = { bales };
  }
  function stackBales(n) {
    const f = L().feed, d = new THREE.Object3D(); let i = 0;
    for (let k = 0; k < 40; k++) { if (k < n) { const col = k % 8, row = Math.floor(k / 8); d.position.set(f.x1 - 3 - (col % 4) * 1.0, F.heightAt(f.x1 - 3, f.z1 + 1) + 0.23 + Math.floor(col / 4) * 0.46 + row * 0.92 * 0 + (row ? 0 : 0), f.z1 + 1.6 + row * 0.55); d.rotation.set(0, (col % 2) * 0.06, 0); d.scale.set(1, 1, 1); }
      else { d.position.set(0, -100, 0); d.scale.setScalar(0.001); } d.updateMatrix(); hay.bales.setMatrixAt(i++, d.matrix); }
    hay.bales.instanceMatrix.needsUpdate = true;
  }
  const deliveryToday = () => DELIVERY.days.includes(dow());
  function stepTruck() {
    if (!truck || !paths) return; const h = hourNow(), t = truck, D = DELIVERY, R = paths.truckIn;
    // the hay in the shed: a bigger stack for the three days after a delivery
    const since = (() => { let d = 0; for (; d < 7; d++) if (DELIVERY.days.includes(((dow() - d) % 7 + 7) % 7)) return d; return 7; })(); stackBales(since === 0 && h >= 0 && h < D.arrive ? 12 : 12 + Math.max(0, 6 - since * 2) + (since === 0 ? 8 : 0));
    let state = "gone", pos = null;
    if (h >= 0 && deliveryToday() && h >= D.from && h < D.gone) {
      if (h < D.arrive) { state = "arriving"; pos = along(R, R.len * (h - D.from) / (D.arrive - D.from)); }
      else if (h < D.leave) { state = "parked"; pos = along(R, R.len); }
      else { state = "leaving"; pos = along(R, R.len * (1 - (h - D.leave) / (D.gone - D.leave))); }
    }
    t.state = state; t.g.visible = !!pos && F.place() === "out";
    if (pos) { t.g.position.set(pos.x, F.heightAt(pos.x, pos.z), pos.z); const hd = state === "leaving" ? [-pos.hx, -pos.hz] : [pos.hx, pos.hz]; if (Math.hypot(hd[0], hd[1]) > 1e-3) t.g.rotation.y = Math.atan2(hd[0], hd[1]); }
    if (state === "parked" && !t.driver) { try { t.driver = FARMPEOPLE.make({ look: { head: 1, hair: 1, hairCol: "#2a1a10", skin: "#d9a577", build: 1 }, outfit: "stable", colours: { shirt: "#c9a227", trousers: "#2e3a4a", boots: "#3a2a1a" } }); G.add(t.driver.root); } catch (e) {} }
    if (t.driver) { const on = state === "parked" && F.place() === "out"; t.driver.root.visible = on; if (on) { const sx = Math.sin(t.g.rotation.y), cx = Math.cos(t.g.rotation.y); t.driver.root.position.set(t.g.position.x + cx * 2.2 - sx * 3.4, t.g.position.y, t.g.position.z - sx * 2.2 - cx * 3.4); t.driver.root.rotation.y = t.g.rotation.y + Math.PI / 2; if (!t.driver.action) FARMPEOPLE.act(t.driver, "feed"); FARMPEOPLE.pose(t.driver, 0.016, 0, 0); } else if (t.driver.action) FARMPEOPLE.act(t.driver, null); }
  }
  function buildRider() {
    const R = typeof ROSTER !== "undefined" ? ROSTER : null; if (!R) return; const d = Object.assign({}, R[7 % R.length], { name: "Banjo" }); let g; try { g = F.mkHorse(d); } catch (e) { return; } try { FARMWORK.rider(g, true); } catch (e) {} g.visible = false; G.add(g); rider = { g, gait: 0, at: null }; }
  function stepRider(dt) {
    if (!rider || !paths) return; const h = hourNow(), g = rider.g, D = RIDER, R = paths.rideIn;
    if (!(h >= 0 && D.days.includes(dow()) && h >= D.from && h < D.to && F.place() === "out")) { g.visible = false; rider.at = null; return; }
    const u = (h - D.from) / (D.to - D.from), s = u < 0.5 ? R.len * u * 2 : R.len * (2 - u * 2), pos = along(R, s), rev = u >= 0.5, hx = rev ? -pos.hx : pos.hx, hz = rev ? -pos.hz : pos.hz;
    const cam = F.cam, dd = Math.hypot(pos.x - cam.position.x, pos.z - cam.position.z); g.visible = dd < 85; rider.at = pos;
    g.position.set(pos.x, F.heightAt(pos.x, pos.z), pos.z); if (Math.hypot(hx, hz) > 1e-3) { const want = Math.atan2(-hz, hx); let e = want - g.rotation.y; e = Math.atan2(Math.sin(e), Math.cos(e)); g.rotation.y += e * Math.min(1, dt * 4); }
    if (dd < 75) { const sp = R.len * 2 / ((D.to - D.from) * 44), trot = sp > 2.6; rider.gait += sp * dt / (trot ? 3.6 : 1.75); if (trot) PRESENT.animateTrot(g, rider.gait % 1, dt, { rest: 0.4 }); else PRESENT.animateWalk(g, rider.gait % 1, dt, { rest: 0.4, look: 0 }); }
  }

  // ---------------------------------------------------------------- talk (staff)
  const WX = { clear: "a clear one", partly_cloudy: "a bit cloudy", overcast: "overcast", light_rain: "drizzling", rain: "properly wet" };
  function wxWords() { try { return WX[ATMO.dayWeather(CAREER.data.seed, CAREER.data.day, CORE.parts(CAREER.data.day).m)] || "a fine day"; } catch (e) { return "a fine day"; } }
  function horsesInfo() { try { return CAREER.data.horses.filter(h => h && !h.retired); } catch (e) { return []; } }
  function talkLine(n) {
    const hs = horsesInfo(), h = hs.length ? pick(hs) : null, hr = (() => { try { return FARMACTORS.live() ? CORE.fmtClock(FARMACTORS.hour()) : ""; } catch (e) { return ""; } })(), role = n.d.role, name = h ? h.name : "the horse";
    const e = h && FARMACTORS.entry ? FARMACTORS.entry(h.id) : null, bk = (() => { try { return CAREER.booking(); } catch (e2) { return null; } })();
    const L1 = [];
    if (role === "hand") {
      L1.push(`It's ${wxWords()} today. ${e && e.turnout ? name + " goes out around " + CORE.fmtClock(e.turnout.from) + "." : "Not much on for " + name + "."}`, "Dolly's been at the fence all morning. I think she's after the carrots.", "Hay truck comes Mondays and Thursdays. You can set your watch by him.", `Keep an eye on ${name}: ${h && h.fitness < 70 ? "looks a bit flat to me" : "he's looking good"}.`, "Biscuit's been into the feed shed again. Don't tell him I told you.");
      if (e && e.work) L1.push(`${name} has trackwork at ${CORE.fmtClock(e.work.from)}, ${["light", "steady", "hard"][(e.session && e.session.int || 1) - 1]} today.`);
    } else if (role === "groom") {
      L1.push(`${name}'s coat is coming up nicely.`, h && h.composure < 65 ? `${name} is a bit on edge. A wash and a groom would settle ${h.name === name ? "him" : "them"}.` : `${name} is calm as anything today.`, "A good brush does more than any supplement, I reckon.");
    } else if (role === "trainer") {
      L1.push(bk ? `We have a race booked. Make sure ${name} is fit and fed before we go.` : "Nothing booked yet. Have a look at the calendar when you're ready.", `Watch the training load on ${name}. Hard days need an easy one after.`, `${wxWords()[0].toUpperCase() + wxWords().slice(1)} today. Good enough for work.`);
    } else if (role === "vet") {
      L1.push("Nothing wrong with any of them today. Long may it last.", h && h.fitness < 60 ? `${name} is tired. I'd rest ${name} a day or two.` : "Fit horses heal fast. Keep them moving.");
    } else L1.push("G'day.");
    if (hr && Math.random() < 0.3) L1.push(`It's ${hr} already?`);
    return pick(L1);
  }

  // ---------------------------------------------------------------- the interface the farm uses
  function init(ctx) { F = ctx; }
  function enter() {
    leave(); G = new THREE.Group(); G.name = "ambient"; F.scene.add(G); lastDay = -1; busy = null;
    try { buildResidents(); dog = buildDog(); const h = dogHome(); dog.x = h.x; dog.z = h.z; G.add(dog.grp); buildHens(); paths = null; buildTruck(); buildRider(); } catch (e) { console.error(e); }
  }
  function leave() { if (!G) return; try { for (const o of residents) { try { disposeHorse(o.g); } catch (e) {} } if (truck && truck.driver) FARMPEOPLE.dispose(truck.driver); F.scene.remove(G); geos.splice(0).forEach(g => g.dispose()); mats.splice(0).forEach(m => m.dispose()); } catch (e) { console.error(e); } G = null; residents = []; dog = null; hens = null; truck = null; rider = null; hay = null; paths = null; busy = null; }
  function dispose() { leave(); F = null; }
  function frame(dt) {
    if (!F || !G) return; if (!paths) { try { FARMNAV.prepare && FARMNAV.prepare(F.world); buildPaths(); } catch (e) { console.error(e); paths = null; } }
    sayT = Math.max(0, sayT - dt);
    for (const o of residents) { try { stepResident(o, dt); } catch (e) { console.error(e); } }
    try { stepDog(dt); stepHens(dt); stepTruck(); stepRider(dt); } catch (e) { console.error(e); }
    if (busy) { busy.t -= dt; if (busy.t <= 0) { const b = busy; busy = null; FARMPEOPLE.act(F.fig, null); F.setBusy(false); if (b.done) b.done(); } else { F.P.face += (busy.face - F.P.face) * Math.min(1, dt * 8); FARMPEOPLE.pose(F.fig, dt, 0, 0); } }
  }
  const faceTo = (x, z) => Math.atan2(x - F.P.x, -(z - F.P.z));
  function points() {
    const pts = []; if (!F || !G || F.place() !== "out") return pts;
    for (const o of residents) { if (!o.g.visible) continue; const d = Math.hypot(o.g.position.x - F.P.x, o.g.position.z - F.P.z); if (d < 4.8) pts.push({ id: "amb:horse", name: o.r.name, x: o.g.position.x, z: o.g.position.z, r: 4.8, text: "E — Pat " + o.r.name + (o.r.foal ? " (the foal)" : "") }); }
    if (dog && dog.grp.visible) pts.push({ id: "amb:dog", x: dog.x, z: dog.z, r: 2.8, text: "E — Pat Biscuit" });
    try { for (const n of FARMLIFE.npcs) { if (n.job || !n.fig.root.visible) continue; if (Math.hypot(n.x - F.P.x, n.z - F.P.z) < 3.0) pts.push({ id: "amb:talk", who: n, x: n.x, z: n.z, r: 3.0, text: "E — Chat to " + n.d.name + (n.d.role === "hand" ? " (stable hand)" : n.d.role === "groom" ? " (groom)" : n.d.role === "trainer" ? " (trainer)" : n.d.role === "vet" ? " (vet)" : "") }); } } catch (e) {}
    if (truck && truck.state === "parked" && Math.hypot(truck.g.position.x - F.P.x, truck.g.position.z - F.P.z) < 6) pts.push({ id: "amb:hay", x: truck.g.position.x, z: truck.g.position.z, r: 6, text: "E — Help unload the hay truck" });
    if (rider && rider.g.visible && rider.at && Math.hypot(rider.at.x - F.P.x, rider.at.z - F.P.z) < 5) pts.push({ id: "amb:rider", x: rider.at.x, z: rider.at.z, r: 5, text: "E — Say g'day to the rider" });
    return pts;
  }
  function interact(p) {
    if (!p || !String(p.id).startsWith("amb:") || busy) return false;
    if (p.id === "amb:horse") { const o = residents.find(q => q.r.name === p.name); if (!o) return false; busy = { t: 2.4, face: faceTo(o.g.position.x, o.g.position.z) }; o.patT = 2.4; F.setBusy(true); FARMPEOPLE.act(F.fig, "pat"); try { F.toast(pick(o.r.line), "info", 5.5); } catch (e) {} return true; }
    if (p.id === "amb:dog") { if (!dog) return false; dog.patT = 3; busy = { t: 2.2, face: faceTo(dog.x, dog.z) }; F.setBusy(true); FARMPEOPLE.act(F.fig, "pat"); try { F.toast(pick(["Biscuit rolls over for a belly rub.", "Biscuit leans his whole weight against your leg.", "Biscuit wags so hard his back end wobbles.", "Biscuit drops a very wet stick at your feet and looks hopeful."]), "good", 4); } catch (e) {} return true; }
    if (p.id === "amb:talk") { const n = p.who; if (!n) return false; n.face = faceTo2(n, F.P); busy = { t: 1.4, face: faceTo(n.x, n.z) }; F.setBusy(true); FARMPEOPLE.act(F.fig, null); say(n.d.name, talkLine(n), 6); return true; }
    if (p.id === "amb:hay") { busy = { t: 4.2, face: faceTo(truck.g.position.x, truck.g.position.z), done: () => { try { F.toast("You and the driver stack the last of the hay. “Cheers, mate. Same time Thursday.”", "good", 4.5); } catch (e) {} } }; F.setBusy(true); FARMPEOPLE.act(F.fig, "feed"); return true; }
    if (p.id === "amb:rider") { busy = { t: 1.4, face: faceTo(rider.at.x, rider.at.z) }; F.setBusy(true); FARMPEOPLE.act(F.fig, null); say("Kath", pick(["Lovely day for it. Banjo's been pulling my arm off all the way from town.", "Heard your horses are going well. Good luck at the next meeting!", "Don't mind us, just having a trot round the boundary.", "Mind that mare of yours at the fence. She's a flirt."]), 5.5); return true; }
    return false;
  }
  const faceTo2 = (n, P) => Math.atan2(P.x - n.x, -(P.z - n.z));
  return { init, enter, leave, dispose, frame, points, interact, get residents() { return residents; }, get dog() { return dog; }, get hens() { return hens; }, get truck() { return truck; }, get rider() { return rider; }, get busy() { return !!busy; }, DELIVERY, RIDER };
})();
if (typeof module !== "undefined" && module.exports) module.exports = FARMAMBIENT;
