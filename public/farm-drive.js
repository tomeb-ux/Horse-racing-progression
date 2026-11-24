'use strict';
/* =====================================================================
   FINAL FURLONG — DRIVING THE UTE AND FLOAT (Phase 6)
   A short, friendly drive from the hardstand down the farm driveway to the road gate. W accelerates, S brakes and then reverses, A / D steer, Space is the handbrake,
   R puts the rig back on the hardstand if you are ever stuck. The rig is one body steered like a car (a kinematic bicycle model: the rear axle sits at the float's wheels,
   the front wheels are the ute's, wheelbase 8.45 m), so it swings through corners the way a rig does: acceleration eases off with speed, steering tightens up at speed,
   the body pitches and rolls a little. Six circles along its length collide with every building, rail and gate the player collides with (it scrapes and slows; it
   cannot go through anything) and the boundary fence is solid except for the gate. Crossing the gate line calls onExit() once. A smooth chase camera follows with
   a speed-based pull-back and field of view. Nothing is created per frame; the HUD is two text elements.
   ===================================================================== */
const FARMDRIVE = (() => {
  const WB = 8.45, VMAX = 9.5, VREV = 3.2, CIRC = [[-2.2, 1.2], [0.2, 1.25], [2.6, 0.95], [5.4, 1.1], [7.0, 1.1], [8.7, 1.05]];
  let F = null, S = null, hud = null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), L = () => FARMWORLD.L, FL = () => FARMWORLD.L.float;
  const fwd = a => [Math.cos(a), -Math.sin(a)];

  function start(ctx, o) {
    stop(true); F = ctx; const rig = F.world.structures.rig, f = FL();
    rig.position.set(f.x, 0, f.z); rig.rotation.set(0, 0, 0); rig.rotation.order = "YZX"; if (rig.userData.ramp) rig.userData.ramp.rotation.z = -Math.PI / 2;
    S = { rig, x: f.x, z: f.z, ang: 0, v: 0, steer: 0, pitch: 0, roll: 0, camAng: 0, camD: 15, camOn: false, t: 0, over: false, o: o || {}, hit: 0, ax: 0, stuck: 0, maxV: 0, dist: 0, camPos: new THREE.Vector3(), camLook: new THREE.Vector3() };
    F.fig.root.visible = false; makeHud(); F.hud.querySelector("#farmInfo").style.visibility = ""; F.setPrompt(""); F.sunFollow(f.x, f.z);
    F.setBusy(true);
  }
  function makeHud() {
    if (hud) hud.remove(); hud = document.createElement("div"); hud.id = "farmDrive";
    hud.style.cssText = "position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));background:rgba(9,14,11,.78);border:1px solid rgba(232,195,90,.6);border-radius:12px;padding:10px 16px;color:#f2efe6;font:600 13px var(--font-b,system-ui);text-align:right;pointer-events:none";
    hud.innerHTML = `<div style="font:800 30px var(--font-d,system-ui);letter-spacing:.02em"><span id="fdSpd">0</span> <small style="font:600 13px var(--font-b,system-ui);opacity:.75">km/h</small></div><div style="opacity:.8;margin-top:2px">W go · S brake / reverse · A D steer · Space handbrake · R reset</div>`; F.hud.appendChild(hud);
  }
  function stop(quiet) {
    if (hud) { hud.remove(); hud = null; }
    if (S) { S.rig.rotation.order = "XYZ"; S.rig.rotation.set(0, 0, 0); S = null; }
    if (!quiet) F && F.setBusy(false);
  }
  // push one circle out of every collider; returns the push that was applied
  function collideCircles(st) {
    const f = fwd(st.ang); let px = 0, pz = 0, n = 0;
    for (const [lx, r] of CIRC) {
      const q = { x: st.x + f[0] * lx, z: st.z + f[1] * lx }, x0 = q.x, z0 = q.z;
      F.resolve(q, r, { noBounds: true });
      // the boundary fence: solid except across the gate opening
      const g = L().gate, lim = L().fence.x - r - 0.3, zl = L().fence.z - r - 0.4;
      if (q.z > zl) q.z = zl; if (q.z < -zl) q.z = -zl; if (q.x < -lim) q.x = -lim;
      const inGate = Math.abs(q.z - (g.z + 0.1)) < 2.8 - r + 0.9; if (q.x > lim && !inGate) q.x = lim;
      const dx = q.x - x0, dz = q.z - z0; if (dx * dx + dz * dz > 1e-6) { px += dx; pz += dz; n++; }
    }
    return n ? [px / n, pz / n, n] : null;
  }
  function frame(dt) {
    if (!S || !F) return; const K = F.keys; dt = Math.min(dt, 0.05); S.t += dt;
    const w = !!(K.w || K.arrowup), sB = !!(K.s || K.arrowdown), left = !!(K.a || K.arrowleft), right = !!(K.d || K.arrowright), hb = !!K[" "];
    if (K.r) { K.r = false; reset(); }
    let a = 0, v = S.v;
    if (w) a = v < -0.2 ? 6.5 : 3.4 * (1 - clamp(v / VMAX, 0, 1) * 0.85) + 0.5;
    else if (sB) a = v > 0.35 ? -8.0 : -2.4 * (1 - clamp(-v / VREV, 0, 1));
    else a = -Math.sign(v) * (1.1 + 0.03 * v * v) * (Math.abs(v) < 0.15 ? 0 : 1);
    if (hb) a -= Math.sign(v) * 9;
    const nv = v + a * dt; v = (v !== 0 && Math.sign(nv) !== Math.sign(v) && !w && !sB) ? 0 : nv; v = clamp(v, -VREV, VMAX); if (Math.abs(v) < 0.04 && !w && !sB) v = 0; S.v = v;
    const sMax = 0.64 - 0.38 * clamp(Math.abs(v) / VMAX, 0, 1), tgt = ((left ? 1 : 0) - (right ? 1 : 0)) * sMax;
    S.steer += clamp(tgt - S.steer, -2.4 * dt, 2.4 * dt) * (tgt === 0 ? 1.6 : 1);
    const dAng = v * Math.tan(S.steer) / WB * dt; S.ang += dAng; const f = fwd(S.ang); S.x += f[0] * v * dt; S.z += f[1] * v * dt;
    // collision: the circles are pushed out, the rig scrapes and loses speed
    const push = collideCircles(S);
    if (push) { S.x += push[0]; S.z += push[1]; const closing = Math.abs(v); S.v *= 0.55; S.hit = Math.min(1, S.hit + 0.35); if (closing > 3) F.toast && S.hitT === undefined && (S.hitT = 1.5); S.stuck += dt; } else S.stuck = Math.max(0, S.stuck - dt);
    S.hit = Math.max(0, S.hit - dt * 2); if (S.hitT !== undefined) { S.hitT -= dt; if (S.hitT <= 0) S.hitT = undefined; }
    if (S.stuck > 4 && !S.hintShown) { S.hintShown = true; F.toast("Stuck? Press R to put the rig back on the hardstand", "info", 3); }
    // the body: sits on the land (pitch from the slope), pitches with acceleration, rolls in a corner
    const hF = F.heightAt(S.x + f[0] * 8.4, S.z + f[1] * 8.4), hR = F.heightAt(S.x, S.z), pitch = Math.atan2(hF - hR, WB), acc = (v - (S.vPrev || 0)) / Math.max(dt, 1e-3); S.vPrev = v;
    S.pitch += (pitch - 0.006 * clamp(acc, -6, 6) - S.pitch) * Math.min(1, dt * 6); const lat = v * Math.tan(S.steer) / WB * v; S.roll += (clamp(-lat * 0.006, -0.05, 0.05) - S.roll) * Math.min(1, dt * 5);
    S.rig.position.set(S.x, hR, S.z); S.rig.rotation.set(S.roll, S.ang, S.pitch);
    F.sunFollow(S.x + f[0] * 6, S.z + f[1] * 6); S.maxV = Math.max(S.maxV, v);
    if (hud) { const e = hud.querySelector("#fdSpd"); const sp = Math.round(Math.abs(v) * 3.6); if (e.textContent !== String(sp)) e.textContent = sp; }
    camera(dt);
    // the gate: the front of the rig crossing the line between the pillars ends the drive (once)
    const g = L().gate, front = [S.x + f[0] * 9.5, S.z + f[1] * 9.5];
    if (!S.over && front[0] > L().fence.x + 0.4 && Math.abs(front[1] - (g.z + 0.1)) < 3.0) { S.over = true; const cb = S.o.onExit; F.fade(1); if (cb) cb(); }
  }
  function camera(dt) {
    const f = fwd(S.ang), c = F.cam, mid = [S.x + f[0] * 3.2, S.z + f[1] * 3.2];
    // the camera swings behind the heading with a lag (so a corner shows its inside), and pulls back with speed
    let da = S.ang - S.camAng; da = Math.atan2(Math.sin(da), Math.cos(da)); if (!S.camOn) { S.camAng = S.ang - 0.25; S.camOn = true; da = 0.25; S.camPos.set(S.x - f[0] * 16, 6, S.z - f[1] * 16 + 6); S.camLook.set(mid[0], 1.5, mid[1]); }
    S.camAng += da * Math.min(1, dt * 2.6); const sp = Math.abs(S.v), want = 15 + sp * 0.7, kd = Math.min(1, dt * 2); S.camD += (want - S.camD) * kd;
    const cf = fwd(S.camAng); let px = mid[0] - cf[0] * S.camD, pz = mid[1] - cf[1] * S.camD, py = F.heightAt(px, pz) + 5.2 + sp * 0.12;
    for (let i = 0; i < 8 && F.blockedAt(px, py, pz); i++) { px = mid[0] + (px - mid[0]) * 0.8; pz = mid[1] + (pz - mid[1]) * 0.8; py = F.heightAt(px, pz) + 5.2 + 0.4 * i; }
    const k = Math.min(1, dt * 7); S.camPos.x += (px - S.camPos.x) * k; S.camPos.y += (py - S.camPos.y) * k; S.camPos.z += (pz - S.camPos.z) * k;
    S.camLook.x += (mid[0] + f[0] * (2 + sp * 0.5) - S.camLook.x) * Math.min(1, dt * 6); S.camLook.y = 1.5; S.camLook.z += (mid[1] + f[1] * (2 + sp * 0.5) - S.camLook.z) * Math.min(1, dt * 6);
    const gy = F.heightAt(S.camPos.x, S.camPos.z) + 1.2; if (S.camPos.y < gy) S.camPos.y = gy;
    c.position.copy(S.camPos); c.lookAt(S.camLook); const fov = 56 + clamp(sp / VMAX, 0, 1) * 9; if (Math.abs(c.fov - fov) > 0.05) { c.fov = fov; c.updateProjectionMatrix(); }
  }
  function reset() { if (!S) return; const f = FL(); S.x = f.x; S.z = f.z; S.ang = 0; S.v = 0; S.steer = 0; S.stuck = 0; S.hintShown = false; S.camOn = false; }
  // the line the glowing guide follows: from the front of the rig along the driveway to the gate
  function route() {
    if (!S) return null; const f = fwd(S.ang), g = L().gate, pts = [[S.x + f[0] * 9, S.z + f[1] * 9]];
    const wp = [[52, 12.5], [62, 8.5], [75, 5.2], [92, 4.2], [111, g.z + 0.1], [124, g.z + 0.1]].filter(p => p[0] > pts[0][0] + 6 || p[0] > 108);
    for (const p of wp) pts.push(p); let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { pts, len };
  }
  return { start, frame, stop, reset, route, get on() { return !!S; }, get state() { return S; }, WB, CIRC };
})();
