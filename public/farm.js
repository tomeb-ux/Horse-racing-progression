'use strict';
/* =====================================================================
   FINAL FURLONG — THE FARM (Phase 3: a labelled PLACEHOLDER scene)
   A walkable test scene whose job is to prove the scene boundaries before any real art exists: flat ground, a stable block with
   five boxes (your real horses stand in them), a horse float, a walkable marker and one interaction point — "travel to race".
   The real Australian property replaces this in the farm-environment phase; the lifecycle below stays.

   • Its own THREE.Scene and camera, drawn by the game's shared renderer (the same pattern as stable3d.js). The race scene is not
     drawn or updated while the farm is active, and the farm is neither drawn nor updated during a race.
   • enter(): builds the static geometry once (kept in memory afterwards), stands the career's horses in their boxes, attaches
     the farm's own keyboard / pointer listeners. leave(): removes the listeners and disposes everything that is per-visit
     (horses, name plaques); the cached static geometry stays so coming back is instant. dispose() frees the static part too.
   • Input: W A S D (+ Shift to run), ← → or drag to turn the camera, E to interact, Esc back to the Career hub. The listeners
     run in the capture phase and swallow every plain key while the farm is active, so no farm key can reach the riding controls.
   ===================================================================== */
const FARM = (() => {
  let built = false, active = false, hud = null, prompt = null, tag = null;
  let fscene = null, fcam = null;
  const statics = { geos: [], mats: [], tex: [] };         // owned by build(): freed only by dispose()
  let horses = [], plaques = [];                           // per visit
  const P = { x: 0, z: 7, face: 0, speed: 0, moving: false }, CAM = { yaw: 0, dist: 7.2, h: 3.4 };
  const fk = {};                                           // the farm's own key map — never shared with the riding controls
  let listeners = [], dragging = null, near = false, t = 0;
  const R_GROUND = 52, TRAVEL = { x: 20, z: 10, r: 3.2 };
  const STALL_X = [-7.2, -3.6, 0, 3.6, 7.2], BLOCK = { x0: -9.2, x1: 9.2, z0: -14, z1: -8 };
  const COLLIDERS = [BLOCK, { x0: 16.6, x1: 23.4, z0: 2, z1: 5.4 }];   // the stable block and the float: [x0,x1] × [z0,z1]

  const geo = g => { statics.geos.push(g); return g; }, mat = m => { statics.mats.push(m); return m; };
  function box(w, h, d, m, x, y, z) { const o = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), m); o.position.set(x, y, z); fscene.add(o); return o; }

  function build() {
    if (built) return; built = true;
    fscene = new THREE.Scene(); fscene.background = new THREE.Color(0xb9d4e8); fscene.fog = new THREE.Fog(0xb9d4e8, 45, 120);
    fcam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
    fscene.add(new THREE.HemisphereLight(0xe6f0ff, 0x5c6a40, 0.75));
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.85); sun.position.set(-18, 30, 14); fscene.add(sun);
    const grass = mat(new THREE.MeshLambertMaterial({ color: 0x78a24e })), timber = mat(new THREE.MeshLambertMaterial({ color: 0x8a6a45 })),
      dark = mat(new THREE.MeshLambertMaterial({ color: 0x3a2f27 })), roof = mat(new THREE.MeshLambertMaterial({ color: 0x8e9aa3 })),
      gravel = mat(new THREE.MeshLambertMaterial({ color: 0xb9ae98 })), white = mat(new THREE.MeshLambertMaterial({ color: 0xe9e6dc }));
    const ground = new THREE.Mesh(geo(new THREE.CircleGeometry(R_GROUND, 40)), grass); ground.rotation.x = -Math.PI / 2; fscene.add(ground);
    const yard = new THREE.Mesh(geo(new THREE.PlaneGeometry(40, 16)), gravel); yard.rotation.x = -Math.PI / 2; yard.position.set(6, 0.02, 0); fscene.add(yard);
    // stable block: back/side walls, roof, door posts between the five boxes
    box(18.4, 3, 0.4, timber, 0, 1.5, BLOCK.z0 + 0.2); box(0.4, 3, 6, timber, BLOCK.x0 + 0.2, 1.5, -11); box(0.4, 3, 6, timber, BLOCK.x1 - 0.2, 1.5, -11);
    box(19.6, 0.25, 7.4, roof, 0, 3.2, -10.6);
    for (let i = 0; i <= 5; i++) box(0.22, 2.4, 0.22, dark, STALL_X[0] - 1.8 + i * 3.6, 1.2, BLOCK.z1 - 0.1);
    for (let i = 0; i < 5; i++) box(3.0, 0.9, 0.12, dark, STALL_X[i], 0.5, BLOCK.z1 - 0.1);
    // the horse float (placeholder) and its marker
    box(6, 2.4, 2.8, white, 20, 1.5, 3.7); box(6.2, 0.3, 3, dark, 20, 0.15, 3.7);
    const ring = new THREE.Mesh(geo(new THREE.RingGeometry(TRAVEL.r - 0.35, TRAVEL.r, 40)), mat(new THREE.MeshBasicMaterial({ color: 0xe8c35a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })));
    ring.rotation.x = -Math.PI / 2; ring.position.set(TRAVEL.x, 0.05, TRAVEL.z); fscene.add(ring); statics.ring = ring;
    // a few trees (simple cones on trunks) so there is something to walk past
    const leaf = mat(new THREE.MeshLambertMaterial({ color: 0x4d7a3a })), trunk = mat(new THREE.MeshLambertMaterial({ color: 0x5b4632 })), tg = geo(new THREE.ConeGeometry(2.2, 6, 7)), trg = geo(new THREE.CylinderGeometry(0.25, 0.35, 2, 6));
    for (const [x, z] of [[-24, 4], [-28, -8], [-20, 18], [30, -10], [34, 6], [26, 24], [-10, 30], [8, 34], [-34, 22], [38, 22]]) {
      const tr = new THREE.Mesh(trg, trunk); tr.position.set(x, 1, z); fscene.add(tr); const cn = new THREE.Mesh(tg, leaf); cn.position.set(x, 5, z); fscene.add(cn);
    }
    // the player marker: a simple figure (replaced by a real character in a later phase)
    const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.28, 0.34, 1.2, 10)), mat(new THREE.MeshLambertMaterial({ color: 0x2e5e8a }))); body.position.y = 0.8;
    const head = new THREE.Mesh(geo(new THREE.SphereGeometry(0.22, 10, 8)), mat(new THREE.MeshLambertMaterial({ color: 0xc68e6b }))); head.position.y = 1.68;
    const nose = new THREE.Mesh(geo(new THREE.BoxGeometry(0.1, 0.1, 0.3)), mat(new THREE.MeshLambertMaterial({ color: 0xe8c35a }))); nose.position.set(0, 1.0, -0.35);   // shows which way the figure faces
    statics.player = new THREE.Group(); statics.player.add(body, head, nose); fscene.add(statics.player);
    buildHud();
  }

  function buildHud() {
    hud = document.createElement("div"); hud.id = "farmScreen"; hud.className = "screen"; hud.hidden = true; hud.style.cssText = "pointer-events:none;background:none;padding:0";
    hud.innerHTML = `<div style="position:absolute;left:max(14px,env(safe-area-inset-left,0px));top:max(14px,env(safe-area-inset-top,0px));background:rgba(9,14,11,.72);border:1px solid var(--panel-line,#2a3a30);border-radius:10px;padding:10px 14px;font-size:12.5px;line-height:1.5;color:#f2efe6">
        <b style="font-family:var(--font-d,system-ui);font-size:14px;letter-spacing:.06em">THE FARM · PLACEHOLDER</b><br>
        <span style="color:#c8d2c8">W A S D move · Shift run · ← → or drag to look · E interact · Esc back to Career</span><br>
        <span style="color:#9fb0a4">A test scene for the scene separation — the real property comes in a later update.</span></div>
      <div id="farmPrompt" hidden style="position:absolute;left:50%;bottom:14%;transform:translateX(-50%);background:rgba(9,14,11,.85);border:1px solid rgba(232,195,90,.7);border-radius:12px;padding:12px 20px;font:700 18px var(--font-d,system-ui);color:#f2efe6;letter-spacing:.04em"></div>`;
    document.body.appendChild(hud); prompt = hud.querySelector("#farmPrompt"); screens.farm = hud;
  }

  // ---------- per-visit: the career's horses and their plaques ----------
  function hideRider(g) { const u = g.userData; if (!u.jk) return; u.jk.mesh.visible = false; u.jk.whip.visible = false; u.jk.irons.forEach(i => i.m.visible = false); u.jk.reins.forEach(r => r.m ? r.m.visible = false : r.visible = false); (u.tack || []).forEach(x => x.visible = false); }
  function plaque(name, sub, x) {
    const tex = canvasTex(256, 64, (g, W, H) => { g.fillStyle = name ? "#1f2a24" : "#2b2b2b"; g.fillRect(0, 0, W, H); g.strokeStyle = "#c8a24a"; g.lineWidth = 4; g.strokeRect(3, 3, W - 6, H - 6);
      g.fillStyle = name ? "#f2efe6" : "#9aa59a"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "700 22px Archivo, Inter, sans-serif"; g.fillText(name || "Vacant", W / 2, H * 0.36, W - 16);
      g.font = "500 15px Archivo, Inter, sans-serif"; g.fillText(sub || "", W / 2, H * 0.72, W - 16); });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, 2.5, BLOCK.z1 - 0.12); fscene.add(m); plaques.push(m); return m;
  }
  function stand() {
    const list = typeof CAREER !== "undefined" && CAREER.farmStalls ? CAREER.farmStalls() : [];
    for (let i = 0; i < 5; i++) {
      const it = list[i] || null; plaque(it && it.name, it ? it.sub : (list.slots != null && i >= list.slots ? "Locked" : "Empty box"), STALL_X[i]);
      if (!it) continue;
      const g = buildHorse(it.def, 0); hideRider(g); g.position.set(STALL_X[i], 0, BLOCK.z1 - 1.5); g.rotation.y = Math.PI / 2; g.userData.idleT = i * 1.7; fscene.add(g); horses.push(g);
    }
  }
  function unstand() {
    for (const g of horses) { fscene.remove(g); try { disposeHorse(g); } catch (e) {} }
    for (const m of plaques) { fscene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    horses = []; plaques = [];
  }

  // ---------- input (the farm's own; attached on enter, removed on leave) ----------
  const MOVE = { w: 1, a: 1, s: 1, d: 1, shift: 1, arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1, e: 1 };
  function onKeyDown(e) {
    if (!active) return;
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;            // browser shortcuts and the F-key diagnostics stay available
    const k = e.key.toLowerCase();
    e.stopImmediatePropagation(); if (k === " " || k in MOVE || k === "tab" || k === "escape") e.preventDefault();   // nothing reaches the riding controls
    if (k === "escape") { if (!e.repeat) leaveToCareer(); return; }
    if (k === "e" && !e.repeat && fk.e !== true) { fk.e = true; interact(); return; }
    fk[k] = true;
  }
  function onKeyUp(e) { if (!active) return; const k = e.key.toLowerCase(); fk[k] = false; if (!(e.ctrlKey || e.metaKey)) e.stopImmediatePropagation(); }
  function onBlur() { for (const k in fk) fk[k] = false; dragging = null; }
  function onPointerDown(e) { if (active && e.button === 0) dragging = { x: e.clientX, yaw: CAM.yaw }; }
  function onPointerMove(e) { if (active && dragging) CAM.yaw = dragging.yaw - (e.clientX - dragging.x) * 0.006; }
  function onPointerUp() { dragging = null; }
  function onResize() { if (fcam) { fcam.aspect = innerWidth / innerHeight; fcam.updateProjectionMatrix(); } }
  function bind() {
    const c = renderer.domElement;
    listeners = [[window, "keydown", onKeyDown, true], [window, "keyup", onKeyUp, true], [window, "blur", onBlur], [c, "pointerdown", onPointerDown], [window, "pointermove", onPointerMove], [window, "pointerup", onPointerUp], [window, "resize", onResize]];
    for (const [t2, ev, fn, cap] of listeners) t2.addEventListener(ev, fn, !!cap);
  }
  function unbind() { for (const [t2, ev, fn, cap] of listeners) t2.removeEventListener(ev, fn, !!cap); listeners = []; for (const k in fk) delete fk[k]; dragging = null; }

  // ---------- interaction ----------
  const dist2 = (x, z, p) => Math.hypot(x - p.x, z - p.z);
  function interact() {
    if (dist2(P.x, P.z, TRAVEL) > TRAVEL.r) return false;
    if (typeof CAREER !== "undefined" && CAREER.travelToNextRace) { CAREER.travelToNextRace(); return true; }
    return false;
  }
  function leaveToCareer() { SCENES.enter("career"); }

  // ---------- per frame ----------
  function collide() {
    for (const c of COLLIDERS) {
      const cx = Math.max(c.x0, Math.min(P.x, c.x1)), cz = Math.max(c.z0, Math.min(P.z, c.z1)), dx = P.x - cx, dz = P.z - cz, d = Math.hypot(dx, dz), r = 0.45;
      if (d < r) { if (d > 1e-4) { P.x = cx + dx / d * r; P.z = cz + dz / d * r; } else P.z = c.z1 + r; }      // pushed out of the building
    }
    const rr = Math.hypot(P.x, P.z); if (rr > R_GROUND - 2) { P.x *= (R_GROUND - 2) / rr; P.z *= (R_GROUND - 2) / rr; }
  }
  function frame(dt) {
    if (!built || !active) return;
    t += dt; dt = Math.min(dt, 0.1);
    if (fk.arrowleft) CAM.yaw -= 1.8 * dt; if (fk.arrowright) CAM.yaw += 1.8 * dt;
    let fx = (fk.w || fk.arrowup ? 1 : 0) - (fk.s || fk.arrowdown ? 1 : 0), sx = (fk.d ? 1 : 0) - (fk.a ? 1 : 0);
    const mag = Math.hypot(fx, sx);
    const target = mag > 0 ? (fk.shift ? 5.2 : 2.4) : 0;
    P.speed += (target - P.speed) * Math.min(1, dt * 9); P.moving = P.speed > 0.15;
    if (mag > 0) {
      fx /= mag; sx /= mag;
      const s = Math.sin(CAM.yaw), c = Math.cos(CAM.yaw);                      // forward = (sin, -cos), right = (cos, sin) for a camera yaw
      const dx = fx * s + sx * c, dz = -fx * c + sx * s;
      P.x += dx * P.speed * dt; P.z += dz * P.speed * dt; const want = Math.atan2(dx, -dz); let d = want - P.face; d = Math.atan2(Math.sin(d), Math.cos(d)); P.face += d * Math.min(1, dt * 10);
    }
    collide();
    const pl = statics.player; pl.position.set(P.x, P.moving ? Math.abs(Math.sin(t * (fk.shift ? 11 : 7))) * 0.05 : 0, P.z); pl.rotation.y = -P.face;
    // third-person camera: behind and above, easing into place
    const cx = P.x - Math.sin(CAM.yaw) * CAM.dist, cz = P.z + Math.cos(CAM.yaw) * CAM.dist;
    fcam.position.x += (cx - fcam.position.x) * Math.min(1, dt * 8); fcam.position.y += (CAM.h - fcam.position.y) * Math.min(1, dt * 8); fcam.position.z += (cz - fcam.position.z) * Math.min(1, dt * 8);
    fcam.lookAt(P.x, 1.3, P.z);
    // the interaction prompt
    const n = dist2(P.x, P.z, TRAVEL) <= TRAVEL.r;
    if (n !== near) { near = n; prompt.hidden = !n; if (n) prompt.textContent = "E — Travel to next race"; }
    statics.ring.material.opacity = n ? 1 : 0.55 + 0.25 * Math.sin(t * 3);
    // idle animation only for horses near the player (nothing is updated for what can't be seen)
    for (const g of horses) { const d = Math.hypot(g.position.x - P.x, g.position.z - P.z); if (d < 34) animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null); }
    renderer.render(fscene, fcam);
  }

  // ---------- scene lifecycle (registered with SCENES) ----------
  function enter() {
    build(); active = true;
    P.x = 0; P.z = 7; P.face = 0; P.speed = 0; CAM.yaw = 0; near = false; prompt.hidden = true;
    fcam.position.set(P.x, CAM.h, P.z + CAM.dist); fcam.aspect = innerWidth / innerHeight; fcam.updateProjectionMatrix();
    stand(); bind();
  }
  function leave() { active = false; unbind(); unstand(); if (prompt) prompt.hidden = true; }
  // frees the static geometry too (low-memory mode, tests); the next enter() rebuilds it
  function dispose() {
    if (active) return false;
    if (!built) return true;
    unstand(); for (const g of statics.geos) g.dispose(); for (const m of statics.mats) { if (m.map) m.map.dispose(); m.dispose(); }
    if (hud) { hud.remove(); delete screens.farm; hud = null; }
    statics.geos = []; statics.mats = []; fscene = null; fcam = null; built = false; return true;
  }
  SCENES.register("farm", { enter, leave });

  return { frame, dispose, enter, leave, get active() { return active; }, get built() { return built; },
    info() { return { built, active, horses: horses.length, plaques: plaques.length, objects: fscene ? fscene.children.length : 0, geos: statics.geos.length, x: P.x, z: P.z, face: P.face, speed: P.speed, yaw: CAM.yaw, near, prompt: prompt && !prompt.hidden ? prompt.textContent : "", listeners: listeners.length }; },
    _test: { setPos(x, z) { P.x = x; P.z = z; }, interact, TRAVEL, COLLIDERS, STALL_X, keys: fk } };
})();
