'use strict';
/* =====================================================================
   FINAL FURLONG — RACE DAY ON THE FARM (Phase 6)
   After a race is booked on the farmhouse calendar the farm walks you through getting the horse to the races, one visible step at a time:
     1 visit the booked horse's box → 2 prepare (tack up) → 3 lead it out → 4 walk it to the float → 5 load it (ramp, rope, ramp closes) →
     6 get in the ute → 7 drive down the driveway (FARMDRIVE) → the exit gate starts the booked race through the normal entry code (CAREER.startBooked).
   The objective panel, the glowing ground line (FARMNAV) and the prompts all come from stage(), which is DERIVED from the real state each time
   (the booking in the career save, whether the booked horse is tacked up, which horse is on the lead, whether it is loaded) — so there is no stored
   progress that can fall out of step: cancel or change the booking and the farm resets the horse to its box. Only the booked horse can be loaded; nothing departs without
   a valid booking (re-checked at the gate, and the booking is consumed once); "K" skips the routine and takes the quick departure.
   ===================================================================== */
const FARMDAY = (() => {
  let F = null;
  const D = { key: "", loaded: false, cine: null, inCab: false, driving: false, departed: false, loadedMesh: null, lastStage: "", note: "" };
  const ease = u => u * u * (3 - 2 * u), clamp01 = u => Math.max(0, Math.min(1, u));
  const FL = () => FARMWORLD.L.float;
  const ramp = () => { const f = FL(); return { x: f.x - 7.4, z: f.z + 0.0, foot: f.x - 4.9 }; };
  const cabDoor = () => { const f = FL(); return { x: f.x + 7.4, z: f.z + 1.95 }; };
  // the booking is read from the career save at most every 0.15 s of farm time (CAREER.booking() builds the horse's race definition each call — too much to do every frame)
  let bkC = null, bkAge = 99;
  const booking = () => { if (bkAge > 0.15) { try { bkC = typeof CAREER !== "undefined" && CAREER.data && CAREER.data.horses ? CAREER.booking() : null; } catch (e) { bkC = null; } bkAge = 0; } return bkC; };
  const invalidate = () => { bkAge = 99; };
  const status = hid => { try { return CAREER.care.status(hid); } catch (e) { return null; } };
  const stallOf = hid => { const g = F.horses.find(h => h.userData.hid === hid); return g ? g.userData.stallI : -1; };

  function init(ctx) { F = ctx; }
  function enter() { invalidate(); reset(true); D.departed = false; D.key = keyOf(booking()); }
  function leave() { reset(true); }
  const keyOf = b => b ? b.eid + ":" + b.hid : "";

  // ---------------------------------------------------------------- where you are in the sequence (derived)
  function stage() {
    const b = booking(); if (!b) return "none";
    if (D.departed) return "departed";
    if (D.driving) return "drive";
    if (D.inCab) return "drive";
    if (D.cine) return D.cine.kind === "load" ? "loading" : "boarding";
    if (D.loaded) return "vehicle";
    const led = FARMCARE.ledHid();
    if (led === b.hid) return nearRamp() ? "load" : "float";
    const st = status(b.hid); if (st && st.prepared) return "lead";
    const i = stallOf(b.hid), s = i >= 0 ? F.world.stalls[i] : null;
    return s && Math.hypot(F.P.x - (s.x + 0.7), F.P.z + 21.6) < 4.5 ? "prepare" : "visit";
  }
  const nearRamp = () => { const r = ramp(), g = FARMCARE.ledMesh(); return !!g && Math.hypot(g.position.x - r.x, g.position.z - r.z) < 4.2 && Math.hypot(F.P.x - r.x, F.P.z - r.z) < 5.5; };
  const STEPS = { visit: 1, prepare: 2, lead: 3, float: 4, load: 5, loading: 5, vehicle: 6, boarding: 6, drive: 7 };
  function objective() {
    const b = booking(); if (!b) return { main: "", step: 0 };
    const st = stage(), n = b.horse, i = stallOf(b.hid), box = i >= 0 ? "box " + (i + 1) : "its box", race = b.name;
    const M = {
      visit: `Go to ${n}'s ${box} in the stable block`, prepare: `Prepare ${n} for the ${race}: E at the box → Tack up`, lead: `Lead ${n} out of ${box}: E at the box → Lead out`,
      float: `Walk ${n} to the horse float`, load: `Load ${n}: press E at the ramp`, loading: `Loading ${n}…`, vehicle: `Get in the ute: press E at the driver's door`, boarding: `Getting in…`, drive: `Drive to the farm exit (W / S accelerate and brake, A / D steer)`, departed: `Travelling to ${b.venue || "the races"}…`,
    };
    return { main: M[st] || "", step: STEPS[st] || 0, of: 7, race, horse: n, skippable: !D.driving && st !== "departed" };
  }
  // where the glowing line should lead
  function target() {
    const b = booking(); if (!b) return null; const st = stage();
    if (st === "visit" || st === "prepare" || st === "lead") { const i = stallOf(b.hid); if (i < 0) return null; const s = F.world.stalls[i]; return { x: s.x + 0.72, z: -21.5 }; }
    if (st === "float" || st === "load") { const r = ramp(); return { x: r.x, z: r.z + 1.3 }; }
    if (st === "vehicle") { const d = cabDoor(); return { x: d.x, z: d.z + 0.2 }; }
    return null;
  }

  // ---------------------------------------------------------------- interaction points for the walker
  function points() {
    const out = [], b = booking(), st = b ? stage() : "none"; if (!b) return out;
    const r = ramp(), led = FARMCARE.ledMesh();
    if (led || st === "load" || st === "float") out.push({ id: "ramp", x: r.x, z: r.z + 1.0, r: 5.2, text: FARMCARE.ledHid() === b.hid ? (nearRamp() ? `E — Load ${b.horse} into the float` : `Bring ${b.horse} to the ramp`) : led ? `That isn't ${b.horse} — only the booked horse can be loaded` : "" });
    if (st === "vehicle") { const d = cabDoor(); out.push({ id: "cab", x: d.x, z: d.z, r: 2.4, text: "E — Get in the ute and drive to the races" }); }
    return out;
  }
  function interact(p) {
    invalidate(); const b = booking(); if (!b) return false;
    if (p.id === "ramp") {
      const led = FARMCARE.ledMesh(); if (!led) return false;
      if (FARMCARE.ledHid() !== b.hid) { F.toast("That's not " + b.horse + " — only the horse booked for the " + b.name + " can go in the float", "warn", 3); return true; }
      if (!nearRamp()) { F.toast("Bring " + b.horse + " right up to the ramp first", "info", 2.4); return true; }
      startLoad(b); return true;
    }
    if (p.id === "cab") { if (stage() === "vehicle") F.departGate(() => startBoard(b)); return true; }
    return false;
  }

  // ---------------------------------------------------------------- loading: the horse is led up the ramp, the ramp is raised
  function startLoad(b) {
    const g = FARMCARE.ledMesh(), f = FL(), r = ramp(), rig = F.world.structures.rig, hinge = rig.userData.ramp;
    FARMCARE.freeze(true); F.setBusy(true);
    D.cine = { kind: "load", t: 0, g, b, hinge, gait: 0, hx0: g.position.x, hz0: g.position.z, px0: F.P.x, pz0: F.P.z, gy0: g.position.y };
    FARMPEOPLE.act(F.fig, "lead"); F.fig.root.visible = true;
  }
  const DUR_LOAD = { walk: 1.8, up: 3.6, shut: 1.9, pat: 0.9 };
  function loadFrame(dt) {
    const C = D.cine, f = FL(), r = ramp(), g = C.g, P = F.P; C.t += dt; const t = C.t;
    const tw = DUR_LOAD.walk, tu = tw + DUR_LOAD.up, ts = tu + DUR_LOAD.shut, te = ts + DUR_LOAD.pat;
    if (t < tw) {                                                                        // both walk to the foot of the ramp
      const u = ease(clamp01(t / tw)); g.position.x = C.hx0 + (r.x - C.hx0) * u; g.position.z = C.hz0 + (r.z - C.hz0) * u; g.position.y = F.heightAt(g.position.x, g.position.z); g.rotation.y = 0;
      const sp = 1.6 * (u > 0.02 && u < 0.97 ? 1 : 0.2); C.gait += sp * dt / 1.75; if (sp > 0.4) PRESENT.animateWalk(g, C.gait % 1, dt, { rest: 1 }); else animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
      P.x += (r.x - 0.3 - P.x) * Math.min(1, dt * 3); P.z += (r.z + 1.35 - P.z) * Math.min(1, dt * 3); P.face += (Math.PI / 2 - P.face) * Math.min(1, dt * 5);
      FARMPEOPLE.pose(F.fig, dt, Math.hypot(r.x - P.x, r.z + 1.35 - P.z) > 0.5 ? 1.6 : 0, 0); FARMCARE.ropeUpdate(g);
    } else if (t < tu) {                                                                 // the horse walks up the ramp and into the float; the handler pays out the rope
      const u = ease(clamp01((t - tw) / DUR_LOAD.up)), x = r.x + u * (f.x - 1.6 - r.x), y = x < f.x - 4.9 ? F.heightAt(x, f.z) : x < f.x - 2.8 ? 0.08 + (x - (f.x - 4.9)) / 2.1 * 0.64 : 0.72;
      g.position.set(x, y, f.z); g.rotation.y = 0; C.gait += 1.4 * dt / 1.75; PRESENT.animateWalk(g, C.gait % 1, dt, { rest: 1, look: -0.12 });
      P.x += (f.x - 6.0 - P.x) * Math.min(1, dt * 2.5); P.z += (f.z + 1.45 - P.z) * Math.min(1, dt * 2.5); P.face += (Math.PI / 2 - P.face) * Math.min(1, dt * 5); FARMPEOPLE.pose(F.fig, dt, Math.hypot(f.x - 6.0 - P.x, f.z + 1.45 - P.z) > 0.4 ? 1.2 : 0, 0);
      if (u > 0.92) FARMCARE.ropeVisible(false); else FARMCARE.ropeUpdate(g);
    } else if (t < ts) {                                                                 // the ramp is raised
      FARMCARE.ropeVisible(false); const u = ease(clamp01((t - tu) / DUR_LOAD.shut)); C.hinge.rotation.z = 0.296 + (-Math.PI / 2 - 0.296) * u; FARMPEOPLE.act(F.fig, null); FARMPEOPLE.pose(F.fig, dt, 0, 0); P.face = Math.PI / 2;
      animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
    } else if (t < te) { FARMPEOPLE.act(F.fig, "pat"); FARMPEOPLE.pose(F.fig, dt, 0, 0); }
    else { endLoad(); return; }
    F.cineCam.set([f.x - 8.4 + clamp01(t / tu) * 2.4, 1.75, f.z + 7.2], [f.x - 5.0, 1.05, f.z], 56, 4);
  }
  function endLoad() {
    const C = D.cine; D.cine = null; FARMPEOPLE.act(F.fig, null); F.cineCam.clear(); F.setBusy(false);
    const g = FARMCARE.take(); if (g) { g.visible = false; D.loadedMesh = g; } D.loaded = true; FARMCARE.ropeVisible(false);
    F.toast(C.b.horse + " is loaded", "good", 2.4); F.refreshObjective();
  }

  // ---------------------------------------------------------------- getting in the ute
  function startBoard(b) { const d = cabDoor(); D.cine = { kind: "board", t: 0, b, x0: F.P.x, z0: F.P.z }; F.setBusy(true); FARMPEOPLE.act(F.fig, null); }
  function boardFrame(dt) {
    const C = D.cine, d = cabDoor(), f = FL(); C.t += dt; const u = clamp01(C.t / 1.1), P = F.P;
    P.x = C.x0 + (d.x - C.x0) * ease(clamp01(u * 2)); P.z = C.z0 + (d.z - 0.5 - C.z0) * ease(clamp01(u * 2)) - (u > 0.5 ? (u - 0.5) * 1.6 : 0); P.face += (0 - P.face) * Math.min(1, dt * 6);
    FARMPEOPLE.pose(F.fig, dt, u < 0.55 ? 1.5 : 0.8, 0); if (u > 0.78) F.hideFig(true);
    F.cineCam.set([d.x + 3.2, 2.0, d.z + 5.0], [d.x - 0.5, 1.3, d.z - 1.0], 56, 4);
    if (C.t >= 1.35) { D.cine = null; F.cineCam.clear(); beginDrive(); }
  }
  function beginDrive() {
    const b = booking(); if (!b) { reset(); return; }
    D.inCab = true; D.driving = true; F.setBusy(true); F.hideFig(true);
    FARMDRIVE.start(F, { onExit: onExit, onCancel: () => { D.driving = false; D.inCab = false; } });
    F.refreshObjective();
  }
  // the exit gate: the booking is checked again, consumed once, and the normal race entry runs
  function onExit() {
    if (D.departed) return; const b = booking();
    if (!b || !D.loaded || FARMDAY_okHorse(b) === false) { F.toast("The booking is no longer valid — heading back to the farm", "warn", 3); reset(); return; }
    D.departed = true; F.depart(b);
  }
  const FARMDAY_okHorse = b => !!D.loadedMesh && D.loadedMesh.userData.hid === b.hid;

  // ---------------------------------------------------------------- the quick departure (the owner's shortcut): put everything back and use the cutscene
  function quickLeave() {
    invalidate(); const b = booking(); if (!b || D.departed || D.driving || D.cine) return false;
    F.departGate(() => { invalidate(); if (!booking()) return; reset(true); F.quickTrip(b); }); return true;
  }

  // ---------------------------------------------------------------- reset: everything back to the start of the sequence, horse in its box
  function reset(silent) {
    if (!F) return; invalidate();
    if (D.driving) { try { FARMDRIVE.stop(true); } catch (e) {} }
    D.driving = false; D.inCab = false; D.cine = null; F.cineCam.clear(); FARMPEOPLE.act(F.fig, null); F.hideFig(false); if (F.fig) F.fig.root.visible = true;
    const rig = F.world && F.world.structures.rig; if (rig) { rig.position.set(FL().x, 0, FL().z); rig.rotation.set(0, 0, 0); if (rig.userData.ramp) rig.userData.ramp.rotation.z = 0.296; }
    if (D.loadedMesh) { D.loadedMesh.visible = true; const L = FARMCARE.untake(D.loadedMesh); }
    D.loaded = false; D.loadedMesh = null; FARMCARE.release(); F.setBusy(false);
    if (!silent) F.refreshObjective();
  }
  // called when the booking may have changed (calendar closed, a care action done, a second passed)
  function sync() {
    if (!F) return; invalidate(); const k = keyOf(booking());
    if (k !== D.key) { const had = D.key; D.key = k; if (had && (FARMCARE.led || D.loaded || D.cine || D.driving)) { reset(true); F.toast("Booking changed — the horse is back in its box", "info", 2.6); } D.departed = false; F.refreshObjective(); }
  }
  function changed() { invalidate(); if (F) F.refreshObjective(); }
  function frame(dt) {
    if (!F) return; bkAge += dt;
    if (D.cine) { if (D.cine.kind === "load") loadFrame(dt); else boardFrame(dt); }
  }
  return { changedQuiet: invalidate, init, enter, leave, stage, objective, target, points, interact, frame, sync, changed, reset, quickLeave, get state() { return D; }, ramp, cabDoor, get active() { return !!D.cine; }, get driving() { return D.driving; }, get loaded() { return D.loaded; } };
})();
