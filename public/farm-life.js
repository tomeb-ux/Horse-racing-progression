'use strict';
/* =====================================================================
   FINAL FURLONG — A LIVING PROPERTY (Phase 8)
   • PADDOCK TURNOUT: lead a horse to a paddock gate and turn it out; it wanders and grazes (head down, a few slow steps, a look round) and you can bring it in again.
   • STAFF AND HANDS AT WORK: a stable hand always carries buckets between the feed shed and the boxes; a hired groom brushes at the boxes and the wash bay, the trainer watches from the
     oval rail, the vet works at the vet bay — the same character model as yours, in their own colours, only drawn when you are near.
   • THE WASH BAY: lead a horse to the wash bay and hose it down (a small, once-a-day composure lift, like grooming).
   • FACILITY SIGNS: a small plaque with level pips at each facility, and a few painted props per level — two draw calls in all, rebuilt when a level changes.
   Everything is distance-gated and cheap; nothing here touches the race.
   ===================================================================== */
const FARMLIFE = (() => {
  let F = null, npcs = [], out = {}, upG = null, upMesh = null, upTex = null, washHorse = null, anim = null;
  const clamp01 = u => Math.max(0, Math.min(1, u)), L = () => FARMWORLD.L;
  // paddock k: the gate on its south side (the same gaps farm-build.js cuts), the way in, the grazing area
  const GATE = [{ x: 51.8, z: -22 }, { x: 0, z: -40 }, { x: -45.8, z: -26 }];
  const padInfo = k => { const p = L().paddocks[k], g = GATE[k]; return { name: p.name, gate: { x: g.x, z: g.z + 1.8 }, inside: { x: g.x, z: g.z - 3.5 }, x0: p.x0 + 3, x1: p.x1 - 3, z0: p.z0 + 3, z1: p.z1 - 4.5 }; };
  const WASH = { x: -12.4, z: -20.7 };
  const hash = (a, b) => { let h = 2166136261; const s = a + "|" + b; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const care = () => { try { return CAREER.data.farm && CAREER.data.farm.turnout || {}; } catch (e) { return {}; } };
  const setTurnout = (hid, k) => { try { const f = CAREER.data.farm; f.turnout = f.turnout || {}; if (k == null) delete f.turnout[hid]; else f.turnout[hid] = k; CAREER.care.save && CAREER.care.save(); } catch (e) {} };

  function init(ctx) { F = ctx; }
  function enter() {
    npcs = []; out = {}; anim = null; washHorse = null;
    // horses that were turned out last time are in their paddocks; a booked horse is always brought in
    let booked = null; try { const b = CAREER.booking(); booked = b && b.hid; } catch (e) {}
    const t = care();
    for (const g of F.horses) { const hid = g.userData.hid; if (hid in t && hid !== booked) place(g, t[hid]); else if (hid in t) setTurnout(hid, null); }
    buildStaff(); buildUpgrades();
  }
  function leave() { for (const n of npcs) { try { F.scene.remove(n.fig.root); FARMPEOPLE.dispose(n.fig); } catch (e) {} } npcs = []; out = {}; anim = null; disposeUpgrades(); }
  function dispose() { leave(); F = null; }

  // ---------------------------------------------------------------- paddocks
  function place(g, k) {
    const P = padInfo(k), r = hash(g.userData.hid, "pad"), x = P.x0 + (P.x1 - P.x0) * (0.2 + 0.6 * r), z = P.z0 + (P.z1 - P.z0) * (0.2 + 0.6 * hash(g.userData.hid, "z"));
    g.position.set(x, F.heightAt(x, z), z); g.rotation.y = r * 6.28; g.userData.out = true; g.userData.padK = k;
    out[g.userData.hid] = { g, k, mode: "graze", t: 3 + r * 6, gx: x, gz: z, gait: 0, sp: 0 };
  }
  function stepOut(dt) {
    for (const hid in out) {
      const o = out[hid], g = o.g, cam = F.cam, d = Math.hypot(g.position.x - cam.position.x, g.position.z - cam.position.z); if (d > 70) continue;
      o.t -= dt;
      if (o.mode === "walk") {
        const dx = o.gx - g.position.x, dz = o.gz - g.position.z, dist = Math.hypot(dx, dz);
        if (dist < 0.4) { o.mode = "graze"; o.t = 6 + hash(hid, Math.floor(performance.now() / 4000)) * 8; o.sp = 0; }
        else { const v = 1.1, step = Math.min(dist, v * dt), want = Math.atan2(-dz, dx); let e = want - g.rotation.y; e = Math.atan2(Math.sin(e), Math.cos(e)); g.rotation.y += e * Math.min(1, dt * 2.5);
          g.position.x += dx / dist * step; g.position.z += dz / dist * step; g.position.y = F.heightAt(g.position.x, g.position.z); o.gait += step / 1.75; PRESENT.animateWalk(g, o.gait % 1, dt, { rest: 1, look: 0 }); }
      } else {
        animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
        const B = g.userData.B;
        if (o.mode === "graze" && B) { const k = Math.min(1, (6 - Math.max(0, o.t - 0)) > 0 ? 1 : 1), nod = Math.sin(performance.now() / 1000 * 0.9 + o.k) * 0.05; B.neck1.rotation.z += 0.78; B.neck2.rotation.z += 0.26; B.head.rotation.z += 0.34 + nod; B.head.rotation.y = Math.sin(performance.now() / 1000 * 0.4) * 0.1; }
        if (o.t <= 0) { const P = padInfo(o.k), r = hash(hid, Math.floor(performance.now() / 5000)); o.gx = P.x0 + (P.x1 - P.x0) * r; o.gz = P.z0 + (P.z1 - P.z0) * hash(hid, "n" + Math.floor(performance.now() / 5000)); o.mode = "walk"; }
      }
    }
  }
  const isOut = hid => !!out[hid];
  // points the walker can use: turn the led horse out at a gate, or fetch one that is out
  function points() {
    const pts = []; if (!F || !F.world) return pts; const led = FARMCARE.led;
    for (let k = 0; k < 3; k++) { const P = padInfo(k), here = Object.keys(out).filter(h => out[h].k === k);
      if (led && !isOut(led.hid)) pts.push({ id: "pad:out", k, x: P.gate.x, z: P.gate.z, r: 3.2, text: `E — Turn ${nm(led.hid)} out into the ${P.name.toLowerCase()}` });
      else if (!led && here.length) pts.push({ id: "pad:in", k, hid: here[0], x: P.gate.x, z: P.gate.z, r: 3.2, text: `E — Bring ${nm(here[0])} in from the ${P.name.toLowerCase()}` }); }
    if (led) pts.push({ id: "wash", x: WASH.x, z: WASH.z, r: 3.0, text: `E — Wash ${nm(led.hid)} in the wash bay` });
    return pts;
  }
  const nm = hid => { try { return CAREER.data.horses.find(h => h.id === hid).name; } catch (e) { return "the horse"; } };
  function interact(p) {
    if (p.id === "pad:out") { turnOut(p.k); return true; }
    if (p.id === "pad:in") { bringIn(p.hid); return true; }
    if (p.id === "wash") { wash(); return true; }
    return false;
  }
  function turnOut(k) {
    const L2 = FARMCARE.led; if (!L2) return; const g = FARMCARE.take(); if (!g) return; FARMCARE.ropeVisible(false); const P = padInfo(k);
    F.setBusy(true); anim = { kind: "out", g, k, t: 0, from: [g.position.x, g.position.z], P }; g.userData.out = true; g.userData.padK = k;
    FARMPEOPLE.act(F.fig, null);
  }
  function bringIn(hid) { const o = out[hid]; if (!o) return; try { FARMACTORS.noteManual(hid); } catch (e) {} const g = o.g, P = padInfo(o.k); delete out[hid]; g.userData.out = false; setTurnout(hid, null); g.position.set(P.gate.x, F.heightAt(P.gate.x, P.gate.z), P.gate.z); g.rotation.y = Math.PI / 2; FARMCARE.adopt(g, hid); F.toast(nm(hid) + " is on the lead", "info", 2); F.refreshObjective(); }
  function wash() {
    const L2 = FARMCARE.led; if (!L2 || anim) return; const g = L2.g; FARMCARE.freeze(true); F.setBusy(true); washHorse = g;
    anim = { kind: "wash", g, t: 0, hid: L2.hid, x0: g.position.x, z0: g.position.z, px0: F.P.x, pz0: F.P.z };
    FARMPEOPLE.act(F.fig, "brush"); F.fig.root.visible = true; F.cineCam.set([WASH.x + 3.6, 1.9, WASH.z + 2.2], [WASH.x, 1.3, WASH.z - 1.2], 54, 4);
  }
  function stepAnim(dt) {
    const A = anim; if (!A) return; A.t += dt;
    if (A.kind === "out") {
      const u = clamp01(A.t / 4.2), P = A.P, seg = u < 0.4 ? [A.from, [P.gate.x, P.gate.z], u / 0.4] : [[P.gate.x, P.gate.z], [P.inside.x, P.inside.z], (u - 0.4) / 0.6];
      const [a, b, k] = seg, x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k, g = A.g; g.position.set(x, F.heightAt(x, z), z); g.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0]); A.gait = (A.gait || 0) + 1.2 * dt / 1.75; PRESENT.animateWalk(g, A.gait % 1, dt, { rest: 1 });
      F.P.x += (P.gate.x - 1.6 - F.P.x) * Math.min(1, dt * 2); F.P.z += (P.gate.z + 1.2 - F.P.z) * Math.min(1, dt * 2); FARMPEOPLE.pose(F.fig, dt, 0.8, 0);
      if (u >= 1) { const hid = g.userData.hid; setTurnout(hid, A.k); out[hid] = { g, k: A.k, mode: "graze", t: 5, gx: P.inside.x, gz: P.inside.z, gait: 0, sp: 0 }; anim = null; try { FARMACTORS.noteManual(hid); } catch (e) {} F.setBusy(false); F.toast(nm(hid) + " is out in the " + P.name.toLowerCase(), "good", 2.4); F.refreshObjective(); }
    } else if (A.kind === "wash") {
      const g = A.g, u = clamp01(A.t / 6); g.position.x += (WASH.x - g.position.x) * Math.min(1, dt * 2); g.position.z += (WASH.z - 0.2 - g.position.z) * Math.min(1, dt * 2); g.rotation.y += (-Math.PI / 2 - g.rotation.y) * Math.min(1, dt * 2);
      animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null); const B = g.userData.B; if (B) { B.neck1.rotation.z += 0.2; B.head.rotation.z += 0.1; B.body.rotation.z += Math.sin(A.t * 9) * 0.008; }
      F.P.x += (WASH.x + 1.3 - F.P.x) * Math.min(1, dt * 3); F.P.z += (WASH.z + 1.4 - F.P.z) * Math.min(1, dt * 3); F.P.face = 0.6; FARMPEOPLE.pose(F.fig, dt, 0, 0);
      if (u >= 1) { let msg = ""; try { const r = CAREER.care.wash(A.hid); msg = r.already ? nm(A.hid) + " has already had a wash today" : nm(A.hid) + " is clean and relaxed (composure +" + r.gain + ")"; } catch (e) { console.error(e); } FARMPEOPLE.act(F.fig, null); F.cineCam.clear(); FARMCARE.freeze(false); anim = null; washHorse = null; F.setBusy(false); F.toast(msg, "good", 2.6); }
    }
  }

  // ---------------------------------------------------------------- the people who work here
  function buildStaff() {
    const defs = []; defs.push({ id: "hand", name: "Stable hand", look: { skin: "#c68e6b", hair: 0, hairCol: "#3a2616", shirt: "#8a5a2e" }, role: "hand" }); defs.push({ id: "hand2", name: "Stable hand", look: { skin: "#8d5a3b", hair: 1, hairCol: "#1f140c", shirt: "#4a6a4c" }, role: "hand" });
    try { const S = CAREER.data.staff || {}; for (const r of ["groom", "trainer", "vet"]) if (S[r]) defs.push({ id: r, name: S[r].name, look: S[r].look || {}, role: r }); } catch (e) {}
    for (const d of defs) {
      const look = d.look || {}, fig = FARMPEOPLE.make({ look: { head: 1, hair: look.hair | 0, hairCol: look.hairCol || "#3a2616", skin: look.skin || "#e0b48c", build: 0 }, outfit: d.role === "trainer" ? "training" : "stable", colours: { shirt: look.shirt || "#2e5e8a", trousers: d.role === "vet" ? "#e8e4d8" : "#3a3a40", boots: "#4a2e1a" } });
      fig.root.traverse(o => { if (o.isMesh) o.castShadow = false; }); F.scene.add(fig.root);
      const n = { d, fig, x: 0, z: 0, face: 0, sp: 0, mode: "idle", t: 1 + Math.random() * 3, route: [], ri: 0 }; npcs.push(n); const s = stationFor(d.role, d.id === "hand2" ? 3 : 0); if (d.id === "hand2") n.ri = 3; n.x = s.x; n.z = s.z; n.face = s.face || 0;
    }
  }
  const STN = {
    hand: [{ x: 27, z: -16.5, a: "idle" }, { x: 12, z: -20.8, a: "feed" }, { x: -4, z: -20.8, a: "feed" }, { x: 8, z: -20.8, a: "pat" }, { x: 20, z: -14.5, a: "idle" }],
    groom: [{ x: -11, z: -20.9, a: "brush", face: 0.4 }, { x: -6.3, z: -21.6, a: "brush", face: 0 }, { x: 1.7, z: -21.6, a: "brush", face: 0 }, { x: 9.8, z: -21.6, a: "pat", face: 0 }],
    trainer: [{ x: -5, z: 21.2, a: "inspect", face: 3.1 }, { x: 18, z: 21.4, a: "inspect", face: 3.1 }, { x: -28, z: 21.4, a: "idle", face: 3.1 }],
    vet: [{ x: 29.5, z: 3.1, a: "inspect", face: 3.14 }, { x: 33.5, z: 2.9, a: "idle", face: 3.14 }],
  };
  const stationFor = (role, i) => STN[role][i % STN[role].length];
  function stepNpcs(dt) {
    const cam = F.cam;
    for (const n of npcs) {
      if (n.job) continue;                                             // a stable hand leading a horse is driven by FARMACTORS
      const root = n.fig.root, dd = Math.hypot(n.x - cam.position.x, n.z - cam.position.z), near = dd < 48 && F.place() === "out"; root.visible = near;
      if (!near) continue; const st = STN[n.d.role];
      if (n.mode === "walk") {
        const tg = st[n.ri % st.length], dx = tg.x - n.x, dz = tg.z - n.z, d = Math.hypot(dx, dz);
        if (d < 0.25) { n.mode = "work"; n.t = 4 + Math.random() * 6; n.sp = 0; FARMPEOPLE.act(n.fig, tg.a === "idle" ? null : tg.a); n.face += (((tg.face != null ? tg.face : n.face) - n.face)); }
        else { const v = 1.7, s = Math.min(d, v * dt); n.x += dx / d * s; n.z += dz / d * s; const want = Math.atan2(dx, -dz); let e = want - n.face; e = Math.atan2(Math.sin(e), Math.cos(e)); n.face += e * Math.min(1, dt * 8); n.sp += (v - n.sp) * Math.min(1, dt * 6); }
      } else { n.sp += (0 - n.sp) * Math.min(1, dt * 8); n.t -= dt; if (n.t <= 0) { n.ri++; n.mode = "walk"; FARMPEOPLE.act(n.fig, n.d.role === "hand" && n.ri % 3 === 1 ? null : null); } }
      root.position.set(n.x, F.heightAt(n.x, n.z), n.z); root.rotation.y = Math.PI - n.face; FARMPEOPLE.pose(n.fig, dt, n.sp, 0);
    }
  }

  // ---------------------------------------------------------------- facility signs and a few props per level
  function disposeUpgrades() { if (upMesh) { F.scene.remove(upMesh); upMesh.geometry.dispose(); upMesh.material.dispose(); upMesh = null; } if (upTex) { upTex.dispose(); upTex = null; } }
  const SIGNS = [["training", "TRAINING", 12.6, -21.2, 0], ["track", "TRACK", -9.6, 21.6, Math.PI], ["recovery", "RECOVERY", -12.4, -21.4, 0], ["comfort", "COMFORT", 0.2, -21.6, 0], ["feed", "FEED ROOM", 27.4, -16.9, Math.PI], ["gates", "GATES", -35.4, 23.2, Math.PI / 2], ["vet", "VET", 29.5, 3.6, Math.PI]];
  function buildUpgrades() {
    disposeUpgrades(); let lv = {}; try { lv = CAREER.data.fac || {}; } catch (e) {}
    const W = 1024, H = 512, cvs = document.createElement("canvas"); cvs.width = W; cvs.height = H; const g = cvs.getContext("2d"); g.fillStyle = "#1f2d25"; g.fillRect(0, 0, W, H);
    SIGNS.forEach((s, i) => { const x = (i % 4) * 256, y = Math.floor(i / 4) * 256, l = lv[s[0]] | 0; g.fillStyle = "#223a2e"; g.fillRect(x + 6, y + 6, 244, 244); g.strokeStyle = "#c8a24a"; g.lineWidth = 6; g.strokeRect(x + 10, y + 10, 236, 236); g.fillStyle = "#f4efe2"; g.font = "800 40px Archivo, Inter, Arial, sans-serif"; g.textAlign = "center"; g.fillText(s[1], x + 128, y + 110, 216);
      for (let k = 0; k < 3; k++) { g.fillStyle = k < l ? "#e8c35a" : "rgba(255,255,255,.2)"; g.beginPath(); g.arc(x + 78 + k * 50, y + 175, 16, 0, 6.3); g.fill(); } });
    upTex = new THREE.CanvasTexture(cvs); upTex.encoding = THREE.sRGBEncoding; upTex.anisotropy = 4;
    const pos = [], uv = [], col = [], idx = []; let base = 0; const box = (cx, cy, cz, sx, sy, sz, hex, ry) => { const c = new THREE.Color(hex).convertSRGBToLinear(), co = Math.cos(ry || 0), si = Math.sin(ry || 0);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (const dy of [0, 1]) { const lx = dx * sx / 2, lz = dz * sz / 2; pos.push(cx + lx * co + lz * si, cy + dy * sy, cz - lx * si + lz * co); uv.push(0.001, 0.001); col.push(c.r, c.g, c.b); }
      const q = [[0, 2, 3, 1], [2, 4, 5, 3], [4, 6, 7, 5], [6, 0, 1, 7], [1, 3, 5, 7], [0, 6, 4, 2]]; for (const f of q) idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]); base += 8; };
    SIGNS.forEach((s, i) => { const [k, , x, z, ry] = s, y = F.heightAt(x, z); box(x, y, z, 0.12, 1.5, 0.12, 0x6b5238, 0);                                              // the post
      const bx0 = x, bz0 = z + 0.09 * Math.cos(ry), sx = 0.9; const c = new THREE.Color(0xffffff).convertSRGBToLinear(), co = Math.cos(ry), si = Math.sin(ry), u0 = (i % 4) / 4, u1 = u0 + 0.25, v0 = 1 - (Math.floor(i / 4) + 1) / 2, v1 = v0 + 0.5;
      const P = [[-0.45, 1.5], [0.45, 1.5], [0.45, 1.05], [-0.45, 1.05]]; for (const [lx, ly] of P) { pos.push(x + lx * co, y + ly, z - lx * si + 0.08); }
      uv.push(u0, v1, u1, v1, u1, v0, u0, v0); for (let q = 0; q < 4; q++) col.push(1, 1, 1); idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2); base += 4;
      // props by level: painted rail markers / cones / a flag, spread by the sign
      const l = lv[k] | 0; for (let n = 0; n < l; n++) box(x + 0.8 + n * 0.5, y, z + 0.3 * (n % 2), 0.22, 0.3 + 0.15 * n, 0.22, [0xe8c35a, 0xf2efe6, 0xb53a30][n], 0); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ map: upTex, vertexColors: true, side: THREE.DoubleSide }); upMesh = new THREE.Mesh(geo, mat); upMesh.frustumCulled = false; F.scene.add(upMesh);
  }
  function frame(dt) { if (!F) return; if (upMesh) upMesh.visible = F.cam.position.y < 16;      // the signs are small: not drawn from the high whole-property views
    stepAnim(dt); stepOut(dt); stepNpcs(dt); }
  // Phase 17: the staff-led turnout hands horses over / takes them back
  function placeOut(g, k) { place(g, k); setTurnout(g.userData.hid, k); }
  function adoptOut(g, k) { const P = padInfo(k), hid = g.userData.hid; setTurnout(hid, k); g.userData.out = true; g.userData.padK = k; out[hid] = { g, k, mode: "graze", t: 5, gx: P.inside.x, gz: P.inside.z, gait: 0, sp: 0 }; }
  function releaseOut(hid) { const o = out[hid]; if (!o) return null; delete out[hid]; setTurnout(hid, null); return o.g; }
  const stations = role => STN[role] || STN.hand;
  return { init, enter, leave, dispose, frame, points, interact, buildUpgrades, isOut, placeOut, adoptOut, releaseOut, stations, padInfo, get anim() { return anim; }, get out() { return out; }, get npcs() { return npcs; }, setTurnout, GATE, padInfo, WASH };
})();
