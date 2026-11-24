'use strict';
/* =====================================================================
   FINAL FURLONG — LOADING UP AND DRIVING OFF (Phase 5)
   Press E at the horse float with a race booked and a short, skippable sequence plays on the property:
     1. fade to the hardstand — you lead the booked horse up the ramp (the real horse model, walking)
     2. the ramp is raised and you walk round to the ute
     3. the ute and float drive off down the farm drive to the road gate, a chase camera following
     4. fade to black, "Travelling to <venue>" — and the race starts (CAREER.startBooked)
   Space / Enter / E / Esc skips straight to the last step. It is a cutscene in this phase; leading the horse yourself comes later.
   Nothing here touches the race: the only call out is `done()` at the very end.
   ===================================================================== */
const FARMTRIP = (() => {
  let S = null;
  const L = () => FARMWORLD.L;
  const ease = u => u * u * (3 - 2 * u), clamp01 = u => Math.max(0, Math.min(1, u));
  const DUR = { fadeIn: 0.7, lead: 4.6, shut: 1.9, walk: 3.6, drive: 9.5, out: 1.2 };
  const ORDER = ["fadeIn", "lead", "shut", "walk", "drive", "out"];

  function start(F, booking, done) {
    abort();
    const rig = F.world.structures.rig, fl = L().float, hinge = rig.userData.ramp;
    const hs = F.mkHorse(booking.def); hs.userData.idleT = 0; F.scene.add(hs);
    for (const g of F.horses) if (g.userData.hid && g.userData.hid === booking.hid) { g.visible = false; S0hidden = g; }
    S = { F, b: booking, done, rig, hinge, hs, t: 0, ph: "fadeIn", pt: 0, started: false, gait: 0, fp: 0, over: false, skipped: false, curve: null, camPos: new THREE.Vector3(), camSet: false };
    // the drive: from the hardstand east along the farm drive to the road gate and out
    const pts = [[0, 0], [11, 0], [21, -5], [33, -10], [60, -10], [74, -10], [96, -10], [112, -10]].map(p => new THREE.Vector3(fl.x + p[0], 0, fl.z + p[1]));
    S.curve = new THREE.CatmullRomCurve3(pts, false, "centripetal"); S.curveLen = S.curve.getLength();
    F.skipHint(true); F.setPrompt("");
    // the stage: the rig at the hardstand, ramp down, the horse and handler by the rear of the float
    rig.position.set(fl.x, 0, fl.z); rig.rotation.set(0, 0, 0); hinge.rotation.z = 0.296;
    place(hs, fl.x - 8.6, fl.z + 0.0, 0); F.fig.root.visible = true; F.fig.root.rotation.y = Math.PI / 2; F.P.x = fl.x - 8.6; F.P.z = fl.z + 1.3; F.P.y = F.heightAt(F.P.x, F.P.z); F.P.face = Math.PI / 2;
    F.fig.root.position.set(F.P.x, F.P.y, F.P.z); F.sunFollow(fl.x - 4, fl.z); camera(0); F.fade(1);
  }
  let S0hidden = null;
  function place(g, x, z, rotY) { g.position.set(x, S.F.heightAt(x, z) + 0.0, z); g.rotation.y = rotY; }
  function walkHorse(dt, speed) { S.fp += speed * dt / 1.75; PRESENT.animateWalk(S.hs, S.fp % 1, dt, { rest: 1 }); }

  // the camera for each beat
  function camera(dt) {
    const F = S.F, c = F.cam, fl = L().float; let px, py, pz, lx, ly, lz;
    if (S.ph === "fadeIn" || S.ph === "lead") { const u = clamp01((S.ph === "lead" ? S.pt : 0) / DUR.lead); px = fl.x - 8.4 + u * 2.4; py = 1.7; pz = fl.z + 7.6; lx = fl.x - 5.2; ly = 1.05; lz = fl.z; }
    else if (S.ph === "shut" || S.ph === "walk") { const u = clamp01((S.ph === "walk" ? DUR.shut + S.pt : S.pt) / (DUR.shut + DUR.walk)); px = fl.x - 4 + u * 7; py = 2.3; pz = fl.z + 9.5; lx = fl.x - 2 + u * 9; ly = 1.2; lz = fl.z + 0.8; }
    else {
      const r = S.rig.position, ang = S.rig.rotation.y, hx = Math.cos(ang), hz = -Math.sin(ang), u = clamp01(S.ph === "drive" ? S.pt / DUR.drive : 1);
      const back = 9 + 4 * u, side = 6.5 - 2 * u;                                  // behind and to the south of the rig, swinging out as it picks up speed
      px = r.x - hx * back - hz * side; pz = r.z - hz * back + hx * side; py = F.heightAt(px, pz) + 3.0; lx = r.x + hx * 3; ly = 1.4; lz = r.z + hz * 3;
    }
    if (!S.camSet) { S.camPos.set(px, py, pz); S.camSet = true; } else { const k = Math.min(1, dt * (S.ph === "drive" ? 3.2 : 6)); S.camPos.x += (px - S.camPos.x) * k; S.camPos.y += (py - S.camPos.y) * k; S.camPos.z += (pz - S.camPos.z) * k; }
    const gy = F.heightAt(S.camPos.x, S.camPos.z) + 0.9; if (S.camPos.y < gy) S.camPos.y = gy;
    c.position.copy(S.camPos); c.lookAt(lx, ly, lz); if (Math.abs(c.fov - 56) > 0.01) { c.fov = 56; c.updateProjectionMatrix(); }
  }

  function frame(dt) {
    if (!S) return; const F = S.F, fl = L().float; dt = Math.min(dt, 0.1); S.t += dt; S.pt += dt;
    const ph = S.ph, d = DUR[ph];
    if (ph === "fadeIn") { F.fade(String(1 - ease(clamp01(S.pt / d)))); F.fig.root.rotation.y = Math.PI / 2; FARMPEOPLE.pose(F.fig, dt, 0); walkHorse(dt, 0); }
    else if (ph === "lead") {
      const u = clamp01(S.pt / d), x = fl.x - 8.6 + ease(u) * 6.4, sp = (u > 0.02 && u < 0.98) ? 1.55 : 0.3;
      const y = x < fl.x - 4.9 ? F.heightAt(x, fl.z) : x < fl.x - 2.8 ? 0.08 + (x - (fl.x - 4.9)) / 2.1 * 0.64 : 0.72;       // up the ramp onto the float floor
      S.hs.position.set(x, y + 0.0, fl.z); S.hs.rotation.y = 0; walkHorse(dt, sp * (u < 1 ? 1 : 0));
      const hx = Math.min(x - 1.5, fl.x - 5.7); F.P.x = hx; F.P.z = fl.z + 1.25; F.P.y = F.heightAt(F.P.x, F.P.z); F.P.face = Math.PI / 2; FARMPEOPLE.pose(F.fig, dt, u < 1 ? 1.6 : 0); F.fig.root.position.set(F.P.x, F.P.y, F.P.z); F.fig.root.rotation.y = Math.PI / 2;
      if (u >= 0.97) S.hs.visible = false;
    } else if (ph === "shut") {
      const u = clamp01(S.pt / d); S.hinge.rotation.z = 0.296 + (-Math.PI / 2 - 0.296) * ease(u); FARMPEOPLE.pose(F.fig, dt, 0);
    } else if (ph === "walk") {
      // round the south side of the float to the ute's driver door
      const u = clamp01(S.pt / d), path = [[fl.x - 5.7, fl.z + 1.25], [fl.x - 5.2, fl.z + 2.6], [fl.x + 7.6, fl.z + 2.6], [fl.x + 7.6, fl.z + 1.55]], seg = [1.4, 12.8, 1.05], total = seg[0] + seg[1] + seg[2];
      let s = ease(u) * total, i = 0; while (i < 2 && s > seg[i]) { s -= seg[i]; i++; }
      const k = clamp01(s / seg[i]), a = path[i], b = path[i + 1], x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k, face = Math.atan2(b[0] - a[0], -(b[1] - a[1]));
      F.P.x = x; F.P.z = z; F.P.y = F.heightAt(x, z); F.P.face = face; FARMPEOPLE.pose(F.fig, dt, u < 1 ? 3.6 : 0); F.fig.root.position.set(x, F.P.y, z); F.fig.root.rotation.y = Math.PI - face;
      if (u >= 0.97) F.fig.root.visible = false;
    } else if (ph === "drive") {
      const u = clamp01(S.pt / d), s2 = ease(u), p = S.curve.getPointAt(clamp01(s2)), tg = S.curve.getTangentAt(clamp01(Math.min(0.999, s2)));
      S.rig.position.set(p.x, F.heightAt(p.x, p.z), p.z); S.rig.rotation.y = Math.atan2(-tg.z, tg.x); F.sunFollow(p.x, p.z);
    } else if (ph === "out") { const u = clamp01(S.pt / d); F.fade(String(ease(u))); if (u >= 1 && !S.over) { S.over = true; finish(); return; } }
    if (!S) return; camera(dt);
    if (S.pt >= d && ph !== "out") { const n = ORDER[ORDER.indexOf(ph) + 1]; S.ph = n; S.pt = 0; if (n === "out") text(); }
    if (S.ph === "drive") { const u = S.pt / DUR.drive; if (u > 0.82) F.fade(String(ease(clamp01((u - 0.82) / 0.18)) * 0.85)); }       // the last second darkens
  }
  function text() { S.F.setPrompt("Travelling to " + (S.b.venue || "the races") + "…"); }
  function skip() { if (!S || S.skipped) return; S.skipped = true; if (S.ph !== "out") { S.ph = "out"; S.pt = DUR.out * 0.4; S.F.fig.root.visible = false; S.hs.visible = false; text(); } }
  function finish() { const done = S && S.done; if (done) done(); }
  // leave the farm tidy (a skipped trip, a failed start, leaving the scene)
  function abort() {
    if (!S) return; const F = S.F;
    try { F.scene.remove(S.hs); disposeHorse(S.hs); } catch (e) {}
    S.rig.position.set(L().float.x, 0, L().float.z); S.rig.rotation.set(0, 0, 0); S.hinge.rotation.z = 0.296;
    if (S0hidden) S0hidden.visible = true; S0hidden = null;
    F.fade(0); F.skipHint(false); F.setPrompt(""); F.endTrip(); S = null;
  }
  return { start, frame, skip, abort, get on() { return !!S; }, get phase() { return S ? S.ph : ""; }, DUR };
})();
