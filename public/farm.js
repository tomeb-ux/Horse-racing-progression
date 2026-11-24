'use strict';
/* =====================================================================
   FINAL FURLONG — THE FARM (scene lifecycle, walking, camera, interaction)
   The world itself is built by farm-ground.js / farm-build.js / farm-world.js (an Australian thoroughbred training property).
   This file is what makes it a scene of the game:
   • Its own THREE.Scene and camera drawn by the shared renderer (the STABLE3D pattern). The race scene is not drawn or updated
     while the farm is active, and the farm is not touched during a race.
   • enter(): builds the static world once (kept afterwards), stands the career's real horses in their five boxes with name
     plaques, attaches the farm's own keyboard / pointer listeners. leave(): removes the listeners and disposes everything per-visit
     (horses, plaques); dispose() frees the whole property (low-memory mode).
   • Input: W A S D (+ Shift to run), ← → or drag to turn the camera, E to interact, Esc back to the Career hub. The listeners run in
     the capture phase and swallow every plain key while the farm is active, so no farm key can reach the riding controls.
   • The walking figure is still a simple stand-in (a real character, outfits and a better camera come in the next phase).
   ===================================================================== */
const FARM = (() => {
  let built = false, active = false, hud = null, prompt = null, title = null;
  let fscene = null, fcam = null, world = null, sunLight = null, hemi = null, builtName = "";
  const own = { geo: [], mat: [], tex: [] };
  let horses = [], plaques = [], figure = null;
  const P = { x: 0, y: 0, z: 4.5, face: Math.PI, speed: 0, moving: false }, CAM = { yaw: 0, dist: 7.0, h: 3.3 }, VIEW = { on: false };
  const fk = {};                                           // the farm's own key map — never shared with the riding controls
  let listeners = [], dragging = null, near = null, t = 0, shadowOn = false;
  const WALK = { x: 110, z: 80 }, PR = 0.45;               // walkable half-extents, the walker's radius

  function stableName() { try { return (CAREER.data && CAREER.data.stable) || "Southern Cross Stable"; } catch (e) { return "Southern Cross Stable"; } }
  function build() {
    if (built) return; built = true; builtName = stableName();
    fscene = new THREE.Scene(); fscene.background = new THREE.Color(0xcfdce6);
    fcam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 900);
    world = FARMGROUND.assemble(fscene, { stableName: builtName });
    fscene.environment = GFX.envMap || null;
    hemi = new THREE.HemisphereLight(0xdde8f4, 0x726a4a, 0.34); fscene.add(hemi);
    sunLight = new THREE.DirectionalLight(0xfff1dc, 1.75); sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048); sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.04;
    Object.assign(sunLight.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 260 }); fscene.add(sunLight, sunLight.target);
    // the walker: a simple figure (stand-in)
    figure = new THREE.Group(); const mk = (g, c) => { own.geo.push(g); const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }); own.mat.push(m); const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
    const body = mk(new THREE.CylinderGeometry(0.26, 0.32, 1.15, 10), 0x2e5e8a); body.position.y = 0.78; const head = mk(new THREE.SphereGeometry(0.21, 10, 8), 0xc68e6b); head.position.y = 1.66;
    const hat = mk(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 12), 0x5b4632); hat.position.y = 1.8; const crown = mk(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 10), 0x5b4632); crown.position.y = 1.88;
    const legs = mk(new THREE.BoxGeometry(0.4, 0.24, 0.26), 0x3a3a40); legs.position.y = 0.12; const nose = mk(new THREE.BoxGeometry(0.09, 0.09, 0.28), 0xe8c35a); nose.position.set(0, 1.0, -0.34);
    figure.add(body, head, hat, crown, legs, nose); fscene.add(figure);
    buildHud();
  }

  function buildHud() {
    hud = document.createElement("div"); hud.id = "farmScreen"; hud.className = "screen"; hud.hidden = true; hud.style.cssText = "pointer-events:none;background:none;padding:0";
    hud.innerHTML = `<div style="position:absolute;left:max(14px,env(safe-area-inset-left,0px));top:max(14px,env(safe-area-inset-top,0px));background:rgba(9,14,11,.7);border:1px solid var(--panel-line,#2a3a30);border-radius:10px;padding:10px 14px;font-size:12.5px;line-height:1.5;color:#f2efe6;max-width:min(430px,calc(100vw - 28px))">
        <b id="farmTitle" style="font-family:var(--font-d,system-ui);font-size:15px;letter-spacing:.05em"></b><br>
        <span style="color:#c8d2c8">W A S D walk · Shift run · ← → or drag to look · E interact · Esc back to Career</span></div>
      <div id="farmPrompt" hidden style="position:absolute;left:50%;bottom:13%;transform:translateX(-50%);background:rgba(9,14,11,.86);border:1px solid rgba(232,195,90,.7);border-radius:12px;padding:12px 20px;font:700 18px var(--font-d,system-ui);color:#f2efe6;letter-spacing:.04em;text-align:center"></div>`;
    document.body.appendChild(hud); prompt = hud.querySelector("#farmPrompt"); title = hud.querySelector("#farmTitle"); screens.farm = hud;
  }

  // ---------------------------------------------------------------- per visit: the career's real horses in their boxes, with plaques
  function hideRider(g) { const u = g.userData; if (!u.jk) return; u.jk.mesh.visible = false; u.jk.whip.visible = false; u.jk.irons.forEach(i => i.m.visible = false); u.jk.reins.forEach(r => r.m ? r.m.visible = false : r.visible = false); (u.tack || []).forEach(x => x.visible = false); }
  function plaque(it, spot, vacantText) {
    const lines = it ? [it.name, it.line2, it.line3, it.line4] : [vacantText[0], vacantText[1], "", ""];
    const tex = canvasTex(512, 256, (g, W, H) => {
      g.fillStyle = it ? "#1f2d25" : "#2b2b28"; g.fillRect(0, 0, W, H); g.strokeStyle = "#c8a24a"; g.lineWidth = 8; g.strokeRect(7, 7, W - 14, H - 14); g.strokeStyle = "rgba(200,162,74,.35)"; g.lineWidth = 2; g.strokeRect(20, 20, W - 40, H - 40);
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = it ? "#f4efe2" : "#a9ad9e";
      g.font = "800 58px Archivo, Inter, Arial, sans-serif"; g.fillText(lines[0], W / 2, H * 0.24, W - 50);
      g.font = "600 34px Archivo, Inter, Arial, sans-serif"; g.fillStyle = it ? "#d8cfae" : "#8c9084"; g.fillText(lines[1], W / 2, H * 0.47, W - 50);
      if (lines[2]) { g.font = "600 32px Archivo, Inter, Arial, sans-serif"; g.fillStyle = "#c9d6c2"; g.fillText(lines[2], W / 2, H * 0.66, W - 50); }
      if (lines[3]) { g.font = "500 28px Archivo, Inter, Arial, sans-serif"; g.fillStyle = "#e8c35a"; g.fillText(lines[3], W / 2, H * 0.84, W - 50); } });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.575), new THREE.MeshBasicMaterial({ map: tex })); m.position.set(spot.plaque[0], spot.plaque[1], spot.plaque[2] + 0.01); fscene.add(m); plaques.push(m); return m;
  }
  function stand() {
    const list = typeof CAREER !== "undefined" && CAREER.farmStalls ? CAREER.farmStalls() : [];
    world.stalls.forEach((spot, i) => {
      const it = list[i] || null; plaque(it, spot, [it ? "" : "Vacant", list.slots != null && i >= list.slots ? "Win more races to unlock" : "Empty box — create a horse"]);
      if (!it) return;
      const g = buildHorse(it.def, 0); hideRider(g); g.position.set(spot.x + (i % 2 ? 0.1 : -0.1), 0.15, spot.z + 0.55); g.rotation.y = -Math.PI / 2 + (i % 2 ? 0.1 : -0.08); g.userData.idleT = i * 1.7; g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); fscene.add(g); horses.push(g);
    });
  }
  function unstand() {
    for (const g of horses) { fscene.remove(g); try { disposeHorse(g); } catch (e) {} }
    for (const m of plaques) { fscene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    horses = []; plaques = [];
  }

  // ---------------------------------------------------------------- input (the farm's own; attached on enter, removed on leave)
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
  function onPointerDown(e) { if (active && e.button === 0) { dragging = { x: e.clientX, yaw: CAM.yaw }; VIEW.on = false; } }
  function onPointerMove(e) { if (active && dragging) CAM.yaw = dragging.yaw - (e.clientX - dragging.x) * 0.006; }
  function onPointerUp() { dragging = null; }
  function onResize() { if (fcam) { fcam.aspect = innerWidth / innerHeight; fcam.updateProjectionMatrix(); } }
  function bind() {
    const c = renderer.domElement;
    listeners = [[window, "keydown", onKeyDown, true], [window, "keyup", onKeyUp, true], [window, "blur", onBlur], [c, "pointerdown", onPointerDown], [window, "pointermove", onPointerMove], [window, "pointerup", onPointerUp], [window, "resize", onResize]];
    for (const [t2, ev, fn, cap] of listeners) t2.addEventListener(ev, fn, !!cap);
  }
  function unbind() { for (const [t2, ev, fn, cap] of listeners) t2.removeEventListener(ev, fn, !!cap); listeners = []; for (const k in fk) delete fk[k]; dragging = null; }

  // ---------------------------------------------------------------- interaction points (from the world: the float, the farmhouse door)
  function nearest() { let best = null, bd = 1e9; for (const p of world.points) { const d = Math.hypot(p.x - P.x, p.z - P.z); if (d <= p.r && d < bd) { best = p; bd = d; } } return best; }
  function interact() {
    const p = nearest(); if (!p) return false;
    if (p.id === "travel" && typeof CAREER !== "undefined" && CAREER.travelToNextRace) { CAREER.travelToNextRace(); return true; }
    if (p.id === "office" && typeof CAREER !== "undefined" && CAREER.enterOffice) { CAREER.enterOffice(); return true; }
    return false;
  }
  function leaveToCareer() { SCENES.enter("career"); }

  // ---------------------------------------------------------------- walking: circle against boxes and fence capsules, boundary
  function collide() {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of world.colliders) {
        if (P.x < c.x0 - PR || P.x > c.x1 + PR || P.z < c.z0 - PR || P.z > c.z1 + PR) continue;
        const cx = Math.max(c.x0, Math.min(P.x, c.x1)), cz = Math.max(c.z0, Math.min(P.z, c.z1)), dx = P.x - cx, dz = P.z - cz, d = Math.hypot(dx, dz);
        if (d < PR) { if (d > 1e-4) { P.x = cx + dx / d * PR; P.z = cz + dz / d * PR; } else { const l = P.x - c.x0, r = c.x1 - P.x, u = P.z - c.z0, dn = c.z1 - P.z, m = Math.min(l, r, u, dn); if (m === l) P.x = c.x0 - PR; else if (m === r) P.x = c.x1 + PR; else if (m === u) P.z = c.z0 - PR; else P.z = c.z1 + PR; } }
      }
      for (const s of world.segs) {
        const lo = Math.min(s.x0, s.x1) - s.r - PR, hi = Math.max(s.x0, s.x1) + s.r + PR, zl = Math.min(s.z0, s.z1) - s.r - PR, zh = Math.max(s.z0, s.z1) + s.r + PR; if (P.x < lo || P.x > hi || P.z < zl || P.z > zh) continue;
        const dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz || 1e-6, tt = Math.max(0, Math.min(1, ((P.x - s.x0) * dx + (P.z - s.z0) * dz) / l2)), qx = s.x0 + dx * tt, qz = s.z0 + dz * tt, ex = P.x - qx, ez = P.z - qz, d = Math.hypot(ex, ez), R = s.r + PR;
        if (d < R) { if (d > 1e-4) { P.x = qx + ex / d * R; P.z = qz + ez / d * R; } else { P.x += -dz / Math.sqrt(l2) * R; P.z += dx / Math.sqrt(l2) * R; } }
      }
    }
    P.x = Math.max(-WALK.x, Math.min(WALK.x, P.x)); P.z = Math.max(-WALK.z, Math.min(WALK.z, P.z));
  }

  // ---------------------------------------------------------------- the sun and its shadow follow the walker (snapped to texels: no shimmer)
  function sunFollow(cx, cz) {
    const d = world.sunDir, tx = Math.round(cx / 0.04) * 0.04, tz = Math.round(cz / 0.04) * 0.04;
    sunLight.target.position.set(tx, 0, tz); sunLight.position.set(tx + d.x * 120, d.y * 120, tz + d.z * 120);
    const want = renderer.shadowMap.enabled && settings.shadows !== false; if (want !== shadowOn) { shadowOn = want; sunLight.castShadow = want; fscene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); }
  }
  const PRESETS = {
    courtyard: { pos: [6, 1.85, -1.5], look: [-1, 1.9, -22], fov: 62 }, stalls: { pos: [-3.5, 1.65, -15.5], look: [0, 1.35, -23.5], fov: 62 }, stalls2: { pos: [5, 1.7, -17.2], look: [3, 1.4, -24], fov: 55 }, verandah: { pos: [-2, 1.6, -20.2], look: [3, 1.3, -23.8], fov: 62 },
    farmhouse: { pos: [-24, 2.3, 12], look: [-47, 3.0, -1], fov: 55 }, house2: { pos: [-33, 1.8, -8], look: [-47, 2.2, 0], fov: 60 }, paddock: { pos: [47, 2.0, -15], look: [72, 1.0, -40], fov: 58 }, paddock2: { pos: [-10, 2.2, -36], look: [4, 1.0, -58], fov: 58 },
    training: { pos: [-72, 2.8, 24], look: [8, 1.0, 50], fov: 58 }, training2: { pos: [-30, 2.0, 18], look: [-40, 1.4, 30], fov: 62 }, overview: { pos: [38, 30, 56], look: [-6, 0, -12], fov: 60 }, float: { pos: [28, 2.4, 25], look: [40, 1.3, 14], fov: 58 },
    shed: { pos: [16, 2.2, -4], look: [32, 2, -24], fov: 58 }, gate: { pos: [86, 2.2, 14], look: [112, 1.6, 4], fov: 58 }, trough: { pos: [3, 1.6, 7.5], look: [10.5, 0.6, 4], fov: 60 },
  };
  function view(name) {
    if (!built || !active) return false;
    if (!name) { VIEW.on = false; return true; }
    const v = typeof name === "string" ? PRESETS[name] : name; if (!v) return false;
    VIEW.on = true; fcam.position.set(v.pos[0], v.pos[1], v.pos[2]); fcam.fov = v.fov || 55; fcam.updateProjectionMatrix(); fcam.lookAt(v.look[0], v.look[1], v.look[2]);
    sunFollow(v.pos[0] * 0.5 + v.look[0] * 0.5, v.pos[2] * 0.5 + v.look[2] * 0.5); return true;
  }

  // ---------------------------------------------------------------- per frame
  function frame(dt) {
    if (!built || !active) return;
    t += dt; dt = Math.min(dt, 0.1);
    if (fk.arrowleft) CAM.yaw -= 1.8 * dt; if (fk.arrowright) CAM.yaw += 1.8 * dt;
    let fx = (fk.w || fk.arrowup ? 1 : 0) - (fk.s || fk.arrowdown ? 1 : 0), sx = (fk.d ? 1 : 0) - (fk.a ? 1 : 0);
    const mag = Math.hypot(fx, sx), target = mag > 0 ? (fk.shift ? 5.2 : 2.4) : 0;
    if (mag > 0 && VIEW.on) VIEW.on = false;
    P.speed += (target - P.speed) * Math.min(1, dt * 9); P.moving = P.speed > 0.15;
    if (mag > 0) {
      fx /= mag; sx /= mag; const s = Math.sin(CAM.yaw), c = Math.cos(CAM.yaw);                       // forward = (sin, -cos), right = (cos, sin) for a camera yaw
      const dx = fx * s + sx * c, dz = -fx * c + sx * s;
      P.x += dx * P.speed * dt; P.z += dz * P.speed * dt; const want = Math.atan2(dx, -dz); let d = want - P.face; d = Math.atan2(Math.sin(d), Math.cos(d)); P.face += d * Math.min(1, dt * 10);
    }
    collide(); const gy = world.heightAt(P.x, P.z); P.y += (gy - P.y) * Math.min(1, dt * 14); if (Math.abs(gy - P.y) > 1) P.y = gy;
    figure.visible = !VIEW.on; figure.position.set(P.x, P.y + (P.moving ? Math.abs(Math.sin(t * (fk.shift ? 11 : 7))) * 0.05 : 0), P.z); figure.rotation.y = -P.face;
    if (!VIEW.on) {                                                   // third-person camera: behind and above, easing into place, never under the ground
      const cx = P.x - Math.sin(CAM.yaw) * CAM.dist, cz = P.z + Math.cos(CAM.yaw) * CAM.dist, cy = Math.max(P.y + CAM.h, world.heightAt(cx, cz) + 1.1), k = Math.min(1, dt * 8);
      fcam.position.x += (cx - fcam.position.x) * k; fcam.position.y += (cy - fcam.position.y) * k; fcam.position.z += (cz - fcam.position.z) * k; fcam.lookAt(P.x, P.y + 1.3, P.z);
      if (Math.abs(fcam.fov - 55) > 0.01) { fcam.fov = 55; fcam.updateProjectionMatrix(); }
      sunFollow(P.x, P.z);
    }
    const n = nearest(); if (n !== near) { near = n; prompt.hidden = !n; if (n) prompt.textContent = n.text; }
    world.update(dt, fcam);
    for (const g of horses) { const d = Math.hypot(g.position.x - fcam.position.x, g.position.z - fcam.position.z); if (d < 38) animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null); }     // idle animation only for horses near the camera
    renderer.render(fscene, fcam);
  }

  // ---------------------------------------------------------------- scene lifecycle (registered with SCENES)
  function enter() {
    if (built && builtName !== stableName()) dispose(true);             // the stable was renamed: the signs are rebuilt
    build(); active = true; VIEW.on = false;
    P.x = 0; P.z = 4.5; P.y = world.heightAt(0, 4.5); P.face = Math.PI * 0 ; P.speed = 0; CAM.yaw = 0; near = null; prompt.hidden = true; title.textContent = builtName.toUpperCase();
    fcam.position.set(P.x, P.y + CAM.h, P.z + CAM.dist); fcam.fov = 55; fcam.aspect = innerWidth / innerHeight; fcam.updateProjectionMatrix(); shadowOn = !(renderer.shadowMap.enabled && settings.shadows !== false);
    stand(); bind(); sunFollow(P.x, P.z);
  }
  function leave() { active = false; unbind(); unstand(); if (prompt) prompt.hidden = true; near = null; }
  // frees the whole property (low-memory mode, a rename, tests); the next enter() rebuilds it
  function dispose(force) {
    if (active && !force) return false;
    if (!built) return true;
    unstand(); world.dispose(); for (const g of own.geo) g.dispose(); for (const m of own.mat) m.dispose(); own.geo = []; own.mat = [];
    sunLight.shadow.map && sunLight.shadow.map.dispose(); if (hud) { hud.remove(); delete screens.farm; hud = null; }
    fscene = null; fcam = null; world = null; built = false; return true;
  }
  SCENES.register("farm", { enter, leave });

  return { frame, dispose, enter, leave, view, get active() { return active; }, get built() { return built; },
    stats() { const i = renderer.info; return Object.assign({ calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }, world ? world.stats() : {}); },
    info() { return { built, active, horses: horses.length, plaques: plaques.length, objects: fscene ? fscene.children.length : 0, x: P.x, z: P.z, y: P.y, face: P.face, speed: P.speed, yaw: CAM.yaw, near: near ? near.id : null, prompt: prompt && !prompt.hidden ? prompt.textContent : "", listeners: listeners.length, buildMs: world ? world.ms : 0 }; },
    _test: { setPos(x, z) { P.x = x; P.z = z; P.y = world ? world.heightAt(x, z) : 0; }, settle(x, z) { P.x = x; P.z = z; collide(); return { x: P.x, z: P.z }; }, interact, get points() { return world ? world.points : []; }, get TRAVEL() { return world ? world.points.find(p => p.id === "travel") : null; }, get colliders() { return world ? world.colliders : []; }, get segs() { return world ? world.segs : []; }, get stalls() { return world ? world.stalls : []; }, keys: fk, presets: Object.keys(PRESETS), world: () => world, get horses() { return horses; }, get plaques() { return plaques; } } };
})();
