'use strict';
/* =====================================================================
   FINAL FURLONG — RACE-DAY PRESENTATION (presentation.js)
   • Parade ring: an optional, skippable pre-race presentation at Royal Randwick (the Theatre of the Horse) and Flemington
     (the mounting yard). The real race horses — the same meshes, coats, markings and silks used in the race — walk the
     ring led by strappers, the camera introduces your horse and the main danger(s) with a name card, then the field
     heads to the barriers. Default: only for feature races (setting: Feature races / Every race at Randwick & Flemington
     / Off). Space, Enter, Esc or the Skip button skip it.
   • Winner presentation: after a feature race (and any race you win) the winner walks back past the stands, the jockey
     salutes the crowd, the crowd roars, and a card shows the event, the winner and the OFFICIAL recorded time and
     margin straight from the race result. The Everest and the Melbourne Cup get their own styling and a trophy on a
     presentation dais. Always skippable; the photo-finish replay and the results follow as before.
   • A walking gait (four-beat lateral sequence) for both scenes.
   Purely presentational: the race result, timings and saves are never touched.
   ===================================================================== */
const PRESENT = (() => {
  const S = { mode: null, t: 0, shots: [], si: -1, horses: [], done: null, ui: null, group: null, ring: null, strap: null, walkT: 0, race: null, card: null, trophy: null, hidden: [] };
  const v3 = () => new THREE.Vector3();
  const P0 = v3(), P1 = v3(), CAM = { pos: v3(), look: v3(), fov: 35 };

  /* ---------- walking gait ---------- */
  // lateral-sequence walk: LH, LF, RH, RF a quarter-stride apart; each hoof is down ~62% of the stride
  const WALK_FOOT = [0.25, 0.75, 0.0, 0.5];          // FL, FR, HL, HR (legs order in buildHorse)
  const _w = [0, 0, 0, 0];
  function walkLeg(t, hind, A, out) {
    const st = 0.62;
    if (t < st) { const u = t / st; out[0] = Math.asin(Math.sin(A) * (1 - 2 * u)); out[1] = hind ? 0.04 : 0.0; out[2] = hind ? 0.08 : 0; out[3] = 0.12 * Math.sin(u * Math.PI) - (u > 0.8 ? (u - 0.8) * 1.6 : 0); }
    else { const u = (t - st) / (1 - st), k = Math.sin(u * Math.PI); out[0] = -A + 2 * A * (u * u * (3 - 2 * u));
      if (!hind) { out[1] = 0.12 * k; out[2] = -1.05 * k; out[3] = -0.85 * k; } else { out[1] = -0.3 * k; out[2] = 0.75 * k; out[3] = -0.85 * k; } }
    return out;
  }
  function animateWalk(g, phase, dt, opts) {
    const u = g.userData, B = u.B, L = u.look; if (!B) return;
    if (u.fallVis && typeof restoreFromFall === "function") restoreFromFall(u);
    const ph = ((phase % 1) + 1) % 1;
    u.legs.forEach((l, i) => { let t = ph - WALK_FOOT[i]; if (t < 0) t += 1; walkLeg(t, l.hind, l.hind ? 0.36 : 0.4, _w); for (let k = 0; k < 4; k++) l.b[k].rotation.z = _w[k]; });
    const nod = Math.sin(ph * Math.PI * 4);
    B.body.position.set(0, 1.30 + 0.012 * Math.cos(ph * Math.PI * 4), 0); B.body.rotation.set(Math.sin(ph * Math.PI * 2) * 0.012, 0, 0.004 * nod); B.pelvis.rotation.z = 0.01 * Math.sin(ph * Math.PI * 4 + 1);
    B.neck1.rotation.set(0, 0, 0.02 - L.carriage + 0.045 * nod); B.neck2.rotation.set(0, 0, 0.01 * nod);
    B.head.rotation.set(0, (opts && opts.look) || 0, -0.04 - 0.03 * nod);
    B.tail1.rotation.set(Math.sin(ph * Math.PI * 2) * 0.12, 0, -0.05); B.tail2.rotation.set(Math.sin(ph * Math.PI * 2 - 0.6) * 0.1, 0, 0); B.tail3.rotation.set(0, 0, 0); B.tail4.rotation.set(0, 0, 0);
    if (typeof earPose === "function") earPose(u, 0, 0, dt);
    u.bob = 0; u.blob.scale.set(1, 1, 1);
    _jkX.curv = 0; _jkX.acc = 0; _jkX.fat = 0; _jkX.cel = opts && opts.cel ? opts.cel : 0;
    poseJockey(u, 0, 0, ph, 0, 0, 0, opts && opts.rest != null ? opts.rest : 1, 0, dt);
    _jkX.cel = 0;
  }

  /* ---------- UI ---------- */
  function ensureUI() {
    if (S.ui) return S.ui;
    const st = document.createElement("style");
    st.textContent = `#prUI{position:absolute;inset:0;pointer-events:none;z-index:30;font-family:Archivo,system-ui,sans-serif;color:#fff}
      #prUI .pr-top{position:absolute;top:18px;left:50%;transform:translateX(-50%);text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.6)}
      #prUI .pr-top .k{font-size:12px;letter-spacing:.28em;font-weight:800;opacity:.85}
      #prUI .pr-top .t{font-size:30px;font-weight:900;letter-spacing:.02em;margin-top:2px}
      #prUI .pr-card{position:absolute;left:28px;bottom:34px;min-width:300px;max-width:min(460px,80vw);background:rgba(10,14,12,.78);border-left:5px solid var(--prc,#e8c35a);border-radius:10px;padding:14px 18px;backdrop-filter:blur(6px);transition:opacity .35s, transform .35s}
      #prUI .pr-card.off{opacity:0;transform:translateY(10px)}
      #prUI .pr-card .n{font-size:26px;font-weight:900;line-height:1.1}
      #prUI .pr-card .s{font-size:13px;opacity:.85;margin-top:6px;line-height:1.45}
      #prUI .pr-card .silk{display:inline-block;width:26px;height:18px;border-radius:3px;vertical-align:-3px;margin-right:8px;border:1px solid rgba(255,255,255,.35)}
      #prUI .pr-skip{position:absolute;right:22px;top:18px;pointer-events:auto;background:rgba(10,14,12,.7);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:9px 16px;font-weight:800;letter-spacing:.08em;font-size:12px;cursor:pointer}
      #prUI .pr-win{position:absolute;left:50%;bottom:9%;transform:translateX(-50%);text-align:center;min-width:min(560px,90vw);background:linear-gradient(180deg,rgba(8,10,9,.55),rgba(8,10,9,.85));border-top:3px solid var(--prc,#e8c35a);border-radius:12px;padding:16px 24px;transition:opacity .4s}
      #prUI .pr-win .e{font-size:13px;letter-spacing:.3em;font-weight:800;color:var(--prc,#e8c35a)}
      #prUI .pr-win .w{font-size:40px;font-weight:900;margin:4px 0 2px}
      #prUI .pr-win .d{font-size:15px;opacity:.9}
      @media (max-width:640px){#prUI .pr-top .t{font-size:20px}#prUI .pr-win .w{font-size:28px}#prUI .pr-card{left:12px;right:12px;bottom:16px}}`;
    document.head.appendChild(st);
    const d = document.createElement("div"); d.id = "prUI"; d.hidden = true;
    d.innerHTML = `<div class="pr-top"><div class="k" id="prKick"></div><div class="t" id="prTitle"></div></div><button class="pr-skip" id="prSkip">SKIP ▸</button><div class="pr-card off" id="prCard"></div><div class="pr-win" id="prWin" hidden></div>`;
    document.body.appendChild(d); S.ui = d;
    d.querySelector("#prSkip").onclick = () => finish();
    addEventListener("keydown", e => { if (!S.mode) return; if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(); } }, true);
    return d;
  }
  const esc = t => String(t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  function silk(def) { return `<span class="silk" style="background:linear-gradient(135deg, ${def.silk || "#888"} 0 50%, ${def.silk2 || "#fff"} 50% 100%)"></span>`; }
  function ratingOf(def) { const a = def.attrs || {}; const v = Object.values(a); return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null; }
  const ATTR_NAMES = { top: "top speed", acc: "acceleration", end: "endurance", spr: "sprint", rec: "recovery", tem: "temperament", agi: "agility", sta: "stamina" };
  function strengths(def) { const a = def.attrs || {}; return Object.keys(a).sort((x, y) => a[y] - a[x]).slice(0, 2).map(k => ATTR_NAMES[k] || k).join(" · "); }
  function setCard(h, label) {
    const c = S.ui.querySelector("#prCard");
    if (!h) { c.classList.add("off"); return; }
    const d = h.def, r = ratingOf(d), form = d.formLine || "";
    c.innerHTML = `<div style="font-size:11px;letter-spacing:.22em;font-weight:800;opacity:.75">${esc(label || "")}</div><div class="n">${silk(d)}${esc(d.name)}</div>
      <div class="s">Barrier ${h.cloth || "—"}${r ? " · Rating " + r : ""}${d.role ? " · " + esc(d.role) : ""}<br>Strengths: ${esc(strengths(d))}${form ? "<br>Form: " + esc(form) : ""}</div>`;
    c.classList.remove("off");
  }

  /* ---------- parade ring ---------- */
  function setting() { return settings.parade || "majors"; }
  function flagship(cfg) { return cfg && (cfg.track === "randwick" || cfg.track === "flemington"); }
  function wantParade(cfg) {
    if (!flagship(cfg) || (typeof MPC === "function" && MPC()) || setting() === "off" || window.__noPresent) return false;
    if (setting() === "always") return true;
    return !!(cfg.career && (cfg.career.major || cfg.career.crown));
  }
  function parade(r) {
    const ring = typeof VENUES !== "undefined" && VENUES.parade && VENUES.parade(); if (!ring) return false;
    ensureUI(); S.mode = "parade"; S.t = 0; S.race = r; S.ring = ring; S.walkT = 0;
    ring.updateMatrixWorld(true);
    const field = r.horses.slice();
    // the danger: the best-rated rivals
    const rivals = field.filter(h => h !== r.player).sort((a, b) => (ratingOf(b.def) || 0) - (ratingOf(a.def) || 0)).slice(0, 2);
    S.horses = field;
    // strappers leading each horse (one instanced crowd, moved every frame)
    S.group = new THREE.Group(); world.add(S.group);
    S.strap = GFX.crowd(S.group, field.map(() => ({ x: 0, y: 0, z: 0, rot: 0, keen: 0 })), { seed: 9, always: true });
    const meta = r.cfg.career || {}, venue = r.cfg.track === "flemington" ? "FLEMINGTON · MOUNTING YARD" : "ROYAL RANDWICK · THEATRE OF THE HORSE";
    S.ui.querySelector("#prKick").textContent = venue; S.ui.querySelector("#prTitle").textContent = (meta.name || (r.dist + " m race")).toUpperCase();
    S.ui.style.setProperty("--prc", meta.crown ? "#e8c35a" : "#9fd6ae"); S.ui.querySelector("#prWin").hidden = true;
    S.shots = [{ k: "wide", d: 3.2 }, { k: "horse", h: r.player, d: 4.2, label: "YOUR RUNNER" }];
    rivals.forEach((h, i) => S.shots.push({ k: "horse", h, d: 3.0, label: i === 0 ? "THE MAIN DANGER" : "ONE TO WATCH" }));
    S.shots.push({ k: "wide2", d: 2.6 });
    S.si = -1; S.ui.hidden = false;
    show("parade");
    S.done = () => { if (race !== r) return; show("racing"); if (typeof COMM !== "undefined") COMM.begin(r, r.cfg); };   // the parade silenced the caller: start the race call afresh
    return true;
  }
  const _q = new THREE.Vector3(), _q2 = new THREE.Vector3();
  function ringPoint(u, out) { S.ring.userData.path(((u % 1) + 1) % 1, out); return out.applyMatrix4(S.ring.matrixWorld); }
  function paradeFrame(dt) {
    S.t += dt; S.walkT += dt;
    const n = S.horses.length, per = 2 * Math.PI * Math.sqrt(((S.ring.userData.rx - 2.25) ** 2 + (S.ring.userData.ry - 2.25) ** 2) / 2), spd = 1.6;
    const dm = new THREE.Object3D();
    S.horses.forEach((h, i) => {
      const m = h.mesh; if (!m) return;
      const u = -(i / n + S.walkT * spd / per);                       // anticlockwise round the ring, evenly spaced
      ringPoint(u, P0); ringPoint(u - 0.002, P1);
      m.position.set(P0.x, P0.y, P0.z); const hx = P1.x - P0.x, hz = P1.z - P0.z; m.rotation.set(0, Math.atan2(hx, hz) - Math.PI / 2, 0);
      animateWalk(m, (S.walkT * 0.9 + i * 0.37) % 1, dt, { rest: 1 });
      // strapper at the horse's near-side shoulder, walking with it
      const len = Math.hypot(hx, hz) || 1, fx = hx / len, fz = hz / len, sx = -fz, sz = fx;
      dm.position.set(P0.x + fx * 0.9 + sx * 0.85, P0.y, P0.z + fz * 0.9 + sz * 0.85); dm.rotation.set(0, Math.atan2(fx, fz), 0); dm.updateMatrix(); S.strap.mesh.setMatrixAt(i, dm.matrix);
    });
    S.strap.mesh.instanceMatrix.needsUpdate = true;
    // shot list
    let acc = 0, si = 0; for (; si < S.shots.length; si++) { acc += S.shots[si].d; if (S.t < acc) break; }
    if (si >= S.shots.length) { finish(); return; }
    const sh = S.shots[si], cut = si !== S.si; if (cut) { S.si = si; setCard(sh.k === "horse" ? sh.h : null, sh.label); }
    const c = _q.set(0, 0, 0).applyMatrix4(S.ring.matrixWorld), y0 = S.ring.userData.y0;
    let tp, tl, fov;
    if (sh.k === "wide" || sh.k === "wide2") {
      const a = (sh.k === "wide" ? 0.6 : 2.4) + S.t * 0.05, R = S.ring.userData.rx + 22;
      tp = _q2.set(Math.cos(a) * R, 11 + y0, Math.sin(a) * R * 0.8).applyMatrix4(S.ring.matrixWorld); tl = c.clone().setY(y0 + 0.5); fov = 42;
    } else {
      const m = sh.h.mesh, yaw = m.rotation.y + Math.PI / 2, fx = Math.sin(yaw), fz = Math.cos(yaw), lt = S.t - (acc - sh.d), side = (si % 2 ? 1 : -1);
      const ang = 0.9 + lt * 0.09; const dx = Math.cos(ang) * fx * 6.2 - Math.sin(ang) * fz * side * 6.2, dz = Math.cos(ang) * fz * 6.2 + Math.sin(ang) * fx * side * 6.2;
      tp = _q2.set(m.position.x + dx, m.position.y + 1.9, m.position.z + dz); tl = new THREE.Vector3(m.position.x + fx * 0.3, m.position.y + 1.55, m.position.z + fz * 0.3); fov = 30;
    }
    if (cut) { CAM.pos.copy(tp); CAM.look.copy(tl); CAM.fov = fov; }
    CAM.pos.lerp(tp, Math.min(1, dt * 2.5)); CAM.look.lerp(tl, Math.min(1, dt * 4)); CAM.fov += (fov - CAM.fov) * Math.min(1, dt * 2);
    applyCam(c);
  }
  function applyCam(focus) {
    camera.position.copy(CAM.pos); camera.lookAt(CAM.look); camera.fov = CAM.fov; camera.updateProjectionMatrix();
    sun.position.set(focus.x + 120, 220, focus.z + 80); sun.target.position.set(focus.x, 0, focus.z); sun.target.updateMatrixWorld();
  }

  /* ---------- winner presentation ---------- */
  function wantCelebration(r) {
    if (!r || (typeof MPC === "function" && MPC()) || window.__noPresent) return false;
    const w = r.finishOrder[0]; if (!w || !w.mesh) return false;
    const meta = r.cfg.career;
    return !!((meta && (meta.major || meta.crown)) || (w === r.player && flagship(r.cfg)) || (w === r.player && meta));
  }
  function trophyMesh(kind) {
    const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: kind === "silver" ? 0xd9dde0 : 0xe3b54a, roughness: 0.18, metalness: 1 });
    const prof = [[0, 0], [0.16, 0], [0.16, 0.04], [0.06, 0.08], [0.04, 0.24], [0.05, 0.3], [0.17, 0.4], [0.2, 0.52], [0.19, 0.6], [0.21, 0.62], [0, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), gold); cup.castShadow = true; g.add(cup);
    const nH = kind === "three" ? 3 : 2;
    for (let i = 0; i < nH; i++) { const hd = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 8, 20, Math.PI * 1.1), gold); const a = i / nH * Math.PI * 2; hd.position.set(Math.cos(a) * 0.21, 0.49, Math.sin(a) * 0.21); hd.rotation.set(0, -a, Math.PI * 0.45); g.add(hd); }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.4 })); base.position.y = -0.08; g.add(base);
    g.scale.setScalar(1.25); return g;
  }
  function celebrate(r, done) {
    ensureUI(); S.mode = "celebrate"; S.t = 0; S.race = r; S.done = done; S.walkT = 0;
    const w = r.finishOrder[0], meta = r.cfg.career || {}, crown = !!meta.crown, isPlayer = w === r.player;
    S.winner = w; S.hidden = [];
    r.horses.forEach(h => { if (h !== w && h.mesh && h.mesh.visible) { h.mesh.visible = false; S.hidden.push(h.mesh); } });
    S.p0 = r.dist - 34; S.dur = crown || meta.major ? 10 : 6;
    // the trophy on a dais by the outside rail at the post (feature races)
    S.group = new THREE.Group(); world.add(S.group);
    if (crown || meta.major) {
      const f = r.route.point(r.dist + 4, r.trk.W + 7, {}), dais = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.5, 24), new THREE.MeshStandardMaterial({ color: meta.crown ? 0x7a1020 : 0x0f3b2a, roughness: 0.6 }));
      dais.position.set(f.x, 0.25, f.z); dais.receiveShadow = true; S.group.add(dais);
      const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 16), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 })); tbl.position.set(f.x, 0.95, f.z); S.group.add(tbl);
      S.trophy = trophyMesh(/melbourne cup/i.test(meta.name || "") ? "three" : /everest/i.test(meta.name || "") ? "silver" : "two"); S.trophy.position.set(f.x, 1.42, f.z); S.group.add(S.trophy);
      S.trophyAt = new THREE.Vector3(f.x, 1.8, f.z);
    } else S.trophy = null;
    const title = meta.name ? meta.name.toUpperCase() : (r.dist + " m " + (DIST_LABEL[r.dist] || "")).toUpperCase();
    const second = r.finishOrder[1], gap = second && typeof finishGap === "function" ? finishGap(w, second) : null;
    const winCol = /melbourne cup/i.test(meta.name || "") ? "#e8c35a" : /everest/i.test(meta.name || "") ? "#d9dde0" : "#9fd6ae";
    S.ui.style.setProperty("--prc", winCol);
    S.ui.querySelector("#prKick").textContent = r.cfg.track === "flemington" ? "FLEMINGTON" : r.cfg.track === "randwick" ? "ROYAL RANDWICK" : "";
    S.ui.querySelector("#prTitle").textContent = "";
    const pw = S.ui.querySelector("#prWin"); pw.hidden = false;
    pw.innerHTML = `<div class="e">${esc(title)} · WINNER</div><div class="w">${silk(w.def)}${esc(w.def.name)}</div>
      <div class="d">Official time ${fmtTime(w.finishTime)}${gap ? " · won by " + esc(gap.text) : ""}${meta.prize ? " · " + esc(meta.prize) : ""}${isPlayer ? " · <b>YOUR HORSE</b>" : ""}</div>`;
    setCard(null);
    S.ui.hidden = false;
    if (typeof audio !== "undefined" && audio.roar) audio.roar(1);
    show("celebrate");
    return true;
  }
  function celebrateFrame(dt) {
    S.t += dt; S.walkT += dt;
    if (S.t >= S.dur) { finish(); return; }
    const r = S.race, w = S.winner, m = w.mesh, prog = S.p0 + S.walkT * 1.7;
    const lane = r.trk.W * 0.55, q = r.route.point(prog - NOSE_OFF, lane, {});
    m.position.set(q.x, 0, q.z); m.rotation.set(0, Math.atan2(q.hx, q.hz) - Math.PI / 2, 0);
    const cel = Math.min(1, S.t / 1.2);
    animateWalk(m, (S.walkT * 0.95) % 1, dt, { rest: 0.55, cel, look: Math.sin(S.t * 0.6) * 0.15 });
    const yaw = m.rotation.y + Math.PI / 2, fx = Math.sin(yaw), fz = Math.cos(yaw);
    let tp, tl, fov = 34;
    const lastShot = S.trophy && S.t > S.dur - 3.4;
    if (lastShot) {
      const a = S.trophyAt; tp = _q2.set(a.x + q.nx * 4.2 + q.hx * -3, 2.3, a.z + q.nz * 4.2 + q.hz * -3); tl = a.clone(); fov = 30;
    } else {
      // from the infield side, slowly swinging round: the horse side-on with the grandstand and the crowd behind it
      const a = -0.75 + S.t * 0.13, R = 8.5, dx = -q.nx * Math.cos(a) + q.hx * Math.sin(a), dz = -q.nz * Math.cos(a) + q.hz * Math.sin(a);
      tp = _q2.set(m.position.x + dx * R, 2.0, m.position.z + dz * R);
      tl = new THREE.Vector3(m.position.x, 1.75, m.position.z);
    }
    const cut = lastShot !== S.lastShot; S.lastShot = lastShot;
    if (cut || S.t < 0.05) { CAM.pos.copy(tp); CAM.look.copy(tl); CAM.fov = fov; }
    CAM.pos.lerp(tp, Math.min(1, dt * 3)); CAM.look.lerp(tl, Math.min(1, dt * 5)); CAM.fov += (fov - CAM.fov) * Math.min(1, dt * 2);
    if (S.trophy) S.trophy.rotation.y += dt * 0.5;
    applyCam(m.position);
  }

  function finish() {
    if (!S.mode) return;
    const mode = S.mode, done = S.done; S.mode = null;
    if (S.group) { world.remove(S.group); disposeGroup(S.group); S.group = null; }
    S.hidden.forEach(m => m.visible = true); S.hidden = [];
    if (S.ui) { S.ui.hidden = true; S.ui.querySelector("#prWin").hidden = true; setCard(null); }
    if (typeof BC !== "undefined") BC.shot = null;
    if (mode === "parade" && S.race === race) { race.horses.forEach(h => h.mesh && (h.mesh.userData.cel = 0)); }
    if (done) done();
  }
  function frame(dt) {
    if (S.mode === "parade") paradeFrame(dt); else if (S.mode === "celebrate") celebrateFrame(dt);
  }
  return { wantParade, parade, wantCelebration, celebrate, frame, finish, animateWalk, get mode() { return S.mode; }, trophyMesh };
})();
