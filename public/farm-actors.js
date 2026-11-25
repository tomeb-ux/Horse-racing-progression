// Phase 17: the farm day. A clock that never rushes the player, the light that follows it, and the stable hands who move horses between their boxes and the paddocks.
// What happens when is NOT stored: CORE.farmDay(...) derives it from the real career data (training plan, soreness, booked race, age, weather). This file only plays it out.
//  - the clock runs 05:30 → 19:00 in about ten real minutes, only while the player is free outdoors (it holds during every panel, lead, drill, house visit, trip, pause)
//  - the clock never advances the calendar; the day only ends when the player ends it
//  - staff act at TRANSITIONS (a horse is due out / due in): a hand walks to the box, opens the door, leads the horse by a rope to the paddock gate and lets it go
//  - entering the farm or skipping time snaps every horse to what the schedule says; a horse the player is working with is never taken
const FARMACTORS = (() => {
  let F = null, plan = null, planAt = 0, planKey = "", last = {}, queue = [], jobs = [], ropes = [], hourShown = -1, lightHour = -9, lastDay = null, dusked = false, held = false, speedKey = "normal";
  const SPEEDS = { normal: 1, slow: 0.5, paused: 0 }, LABEL = { normal: "Normal", slow: "Slow", paused: "Paused" };
  const clamp01 = u => Math.max(0, Math.min(1, u)), ease = u => u * u * (3 - 2 * u);
  const C = () => { try { return CAREER.data; } catch (e) { return null; } };
  const wxKey = c => { try { return ATMO.dayWeather(c.seed, c.day, CORE.parts(c.day).m); } catch (e) { return "clear"; } };
  const raceDay = c => { try { const b = c.booking, ev = b && c.cal && c.cal.events.find(x => x.id === b.eid); return !!(ev && ev.day === c.day); } catch (e) { return false; } };
  const stall = i => F.world.stalls[i];
  const nameOf = hid => { try { return C().horses.find(h => h.id === hid).name; } catch (e) { return "the horse"; } };
  const horseOf = hid => F && F.horses.find(g => g.userData.hid === hid);

  // ---------------------------------------------------------------- the clock
  // The running clock lives here (not in the career data) so that merely walking about never changes the save; it is written back when you leave the farm or skip.
  let K = null;
  const clock = () => { const c = C(); if (!c) return null; if (!K || K.day !== c.day) K = Object.assign({}, CORE.clockOf(c)); return K; };
  function flush() { const c = C(); if (c && K && K.day === c.day) Object.assign(CORE.clockOf(c), K); }
  const hour = () => { const k = clock(); return k ? k.t : CORE.CLOCK.start; };
  // is the clock driving the light? Not on a race day (the farm keeps the race's own time of day) and not in the showcase / without a career
  const live = () => { const c = C(); return !!(F && c && c.farm && !raceDay(c) && F.place() === "out" && !(F.settings && F.settings.farmClock === "off")); };
  const speed = () => SPEEDS[speedKey] != null ? SPEEDS[speedKey] : 1;
  function setSpeed(k) { if (SPEEDS[k] == null) return; speedKey = k; try { if (F && F.settings) { F.settings.farmClockSpeed = k; } if (typeof store !== "undefined") store.set("farmClock", k); } catch (e) {} }
  function holdNow() {                                                 // everything that stops the clock
    if (!F) return true; let h = F.blocked() || F.place() !== "out" || FARMCARE.menuOpen || FARMCARE.busy || !!FARMCARE.led || !!FARMLIFE.anim || FARMDAY.active;
    try { if (typeof FARMHOUSE !== "undefined" && FARMHOUSE.on) h = true; } catch (e) {} return !!h;
  }
  const label = () => { const c = C(); if (!c) return ""; if (raceDay(c)) return ""; return CORE.fmtClock(hour()); };

  // ---------------------------------------------------------------- the schedule (derived)
  function schedule(force) {
    const c = C(); if (!c || !c.horses) return null; const now = performance.now();
    if (!force && plan && now - planAt < 1500) return plan; planAt = now;
    const wx = wxKey(c), key = c.day + "|" + wx + "|" + (c.booking ? c.booking.hid + ":" + c.booking.day : "-") + "|" + c.horses.map(h => h.id + (h.retired ? "r" : "")).join(",");
    plan = CORE.farmDay(c, c.day, wx); planKey = key; return plan;
  }
  // what the horse should be doing right now at the farm. "work" is the morning session (Phase 18 shows it; until then the horse waits in its box)
  function want(hid) { const p = schedule(); if (!p) return "box"; return CORE.placeAt(p, hid, hour()); }
  const noteBox = hid => { last[hid] = "box"; };
  // the player turned a horse out / brought it in by hand: the schedule leaves it be (until the day changes or the horse's own next transition)
  const manual = {};
  function noteManual(hid) { const c = C(); if (c) manual[hid] = c.day; }
  const isManual = hid => { const c = C(); return !!c && manual[hid] === c.day; };
  const entry = hid => { const p = schedule(); return p && p.horses.find(e => e.hid === hid) || null; };
  // lines for Inspect and the map: "Today: ..."
  function todayLines(hid) { const e = entry(hid); if (!e) return []; const t = hour(), w = CORE.placeAt(plan, hid, t), wk = typeof FARMWORK !== "undefined" && FARMWORK.find(hid), now = wk ? (wk.stage < 3 ? "going out to the oval" : wk.stage === 3 ? "working on the oval" : wk.stage < 8 ? "cooling out" : "being washed") : jobFor(hid) ? "with a stable hand" : w === "paddock" ? "in the paddock" : "in the box"; const lw = typeof FARMWORK !== "undefined" && FARMWORK.lastFor(hid); return [`Now: ${now}`].concat(e.lines, lw ? [`Work this morning: one lap in ${lw.sec.toFixed(1)} s`] : []); }
  function nextEvent(t0) {
    const p = schedule(); let best = null; if (!p) return null;
    const add = (at, what) => { if (at > t0 + 0.01 && (!best || at < best.at)) best = { at, what }; };
    for (const e of p.horses) { if (e.work) { add(e.work.from, "trackwork"); add(e.work.to, "back from trackwork"); } if (e.turnout) { add(e.turnout.from, "turn-out"); add(e.turnout.to, "bringing in"); } }
    return best;
  }

  // ---------------------------------------------------------------- jobs: a hand leads a horse between its box and a paddock
  const jobFor = hid => jobs.find(j => j.hid === hid) || queue.find(j => j.hid === hid) || null;
  const busyHid = hid => !!jobs.find(j => j.hid === hid) || !!(typeof FARMWORK !== "undefined" && FARMWORK.find(hid));
  function enqueue(hid, dir, k) { queue = queue.filter(j => j.hid !== hid); queue.push({ hid, dir, k, stage: -1, t: 0 }); }
  function freeWorker() { const ws = FARMLIFE.npcs.filter(n => n.d.role === "hand" && !n.job); return ws[0] || null; }
  function route(a, b) { try { const r = FARMNAV.find(F.world, a, b); if (r && r.pts && r.pts.length) return r.pts.map(p => [p[0], p[1]]); } catch (e) {} return [a, b]; }
  const frontOf = i => { const s = stall(i); return [s.x, -20.7]; };
  const inside = i => { const s = stall(i); return [s.x + (i % 2 ? 0.1 : -0.1), -23.8]; };
  function doorOf(i, open) { const d = FARMCARE.doors; if (d && d.d[i]) d.d[i].want = open ? -1.85 : 0; }
  function startJob(w, q) {
    const g = horseOf(q.hid); if (!g || g.userData.stallI == null) return false;
    const have = FARMLIFE.isOut(q.hid); if (q.dir === "out" && have) return false; if (q.dir === "in" && !have) return false;
    if (FARMCARE.led && FARMCARE.led.hid === q.hid) return false;
    const j = { hid: q.hid, dir: q.dir, k: q.k, g, w, i: g.userData.stallI, stage: 0, t: 0, path: null, pi: 0, gait: 0, sp: 0, hsp: 0, face: w.face };
    w.job = j; w.mode = "job"; FARMPEOPLE.act(w.fig, null);
    if (q.dir === "out") { g.userData.out = true; j.path = route([w.x, w.z], frontOf(j.i)); }
    else { const o = FARMLIFE.out[q.hid]; j.path = route([w.x, w.z], o ? [o.g.position.x, o.g.position.z] : frontOf(j.i)); }
    jobs.push(j); return true;
  }
  function ropeFor(j) {
    if (!j.rope) { const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(8 * 3), 3)); const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9c6b3a })); l.frustumCulled = false; F.scene.add(l); j.rope = l; ropes.push(l); }
    return j.rope;
  }
  const _v = new THREE.Vector3(), _h = new THREE.Vector3();
  function ropeUpdate(j) {
    const l = ropeFor(j), nose = j.g.userData.bit; if (!nose) { l.visible = false; return; }
    const pa = l.geometry.attributes.position, hand = j.w.fig.handPos("R", _v); nose.getWorldPosition(_h);
    for (let i = 0; i < 8; i++) { const t = i / 7, sag = Math.sin(t * Math.PI) * 0.16; pa.setXYZ(i, hand.x + (_h.x - hand.x) * t, hand.y + (_h.y - hand.y) * t - sag, hand.z + (_h.z - hand.z) * t); }
    pa.needsUpdate = true; l.visible = true;
  }
  function dropRope(j) { if (j.rope) { F.scene.remove(j.rope); j.rope.geometry.dispose(); j.rope.material.dispose(); ropes = ropes.filter(r => r !== j.rope); j.rope = null; } }
  // walk the worker along j.path; returns true on arrival
  function walk(j, dt, v) {
    const w = j.w, P = j.path; if (!P || j.pi >= P.length) return true;
    let tg = P[j.pi], dx = tg[0] - w.x, dz = tg[1] - w.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { j.pi++; if (j.pi >= P.length) { j.sp += (0 - j.sp) * Math.min(1, dt * 8); return true; } tg = P[j.pi]; dx = tg[0] - w.x; dz = tg[1] - w.z; d = Math.hypot(dx, dz); }
    const s = Math.min(d, v * dt); w.x += dx / d * s; w.z += dz / d * s; const want = Math.atan2(dx, -dz); let e = want - w.face; e = Math.atan2(Math.sin(e), Math.cos(e)); w.face += e * Math.min(1, dt * 8); j.sp += (v - j.sp) * Math.min(1, dt * 6);
    return false;
  }
  function placeWorker(j, dt) { const w = j.w; w.sp = j.sp; w.fig.root.visible = true; w.fig.root.position.set(w.x, F.heightAt(w.x, w.z), w.z); w.fig.root.rotation.y = Math.PI - w.face; FARMPEOPLE.pose(w.fig, dt, j.sp, 0); }
  // the horse trails 1.7 m behind the worker (the rope's length), and walks at the speed it needs to
  function trail(j, dt) {
    const g = j.g, w = j.w, fx = Math.sin(w.face), fz = -Math.cos(w.face), tx = w.x - fx * 1.7 + Math.cos(w.face) * 0.5, tz = w.z - fz * 1.7 + Math.sin(w.face) * 0.5;
    const dx = tx - g.position.x, dz = tz - g.position.z, k = Math.min(1, dt * 4.5), nx = g.position.x + dx * k, nz = g.position.z + dz * k, mv = Math.hypot(nx - g.position.x, nz - g.position.z);
    const q = { x: nx, z: nz }; try { F.resolve(q, 0.55); } catch (e) {} const mx = q.x - g.position.x, mz = q.z - g.position.z;
    g.position.x = q.x; g.position.z = q.z; g.position.y += (Math.max(F.heightAt(q.x, q.z), 0) - g.position.y) * Math.min(1, dt * 10);
    const sp = Math.hypot(mx, mz) / Math.max(dt, 1e-4); j.hsp += (sp - j.hsp) * Math.min(1, dt * 6);
    const wantY = j.hsp > 0.35 ? Math.atan2(-mz, mx) : Math.atan2(-fz, fx); let e = wantY - g.rotation.y; e = Math.atan2(Math.sin(e), Math.cos(e)); g.rotation.y += e * Math.min(1, dt * (j.hsp > 0.35 ? 5 : 2.5));
    j.gait += j.hsp * dt / 1.75; if (j.hsp > 0.3) PRESENT.animateWalk(g, j.gait % 1, dt, { rest: 1, look: 0 }); else animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
    void mv; ropeUpdate(j);
  }
  function finishJob(j, ok) {
    jobs = jobs.filter(x => x !== j); dropRope(j); const w = j.w; w.job = null; w.mode = "walk"; w.t = 2; w.ri = (w.ri || 0) + 1; FARMPEOPLE.act(w.fig, null); w.sp = 0;
    if (!ok) return; last[j.hid] = j.dir === "out" ? "paddock" : "box";
  }
  function stepJob(j, dt) {
    const w = j.w, g = j.g, i = j.i;
    if (FARMCARE.led && FARMCARE.led.hid === j.hid) { finishJob(j, false); return; }       // the player took the horse: the hand lets it be
    j.t += dt;
    if (j.dir === "out") {
      if (j.stage === 0) { if (walk(j, dt, 1.8)) { j.stage = 1; j.t = 0; } placeWorker(j, dt); }
      else if (j.stage === 1) {                                                  // at the box: face it, open the door
        w.face += (0 - w.face) * Math.min(1, dt * 6); doorOf(i, true); placeWorker(j, dt); if (j.t > 0.9) { j.stage = 2; j.t = 0; const f = frontOf(i), n = inside(i); j.from = n; j.to = f; g.position.set(n[0], 0.15, n[1]); g.rotation.y = -Math.PI / 2; }
      } else if (j.stage === 2) {                                                // the horse walks out onto the yard
        const u = clamp01(j.t / 2.1), e = ease(u); g.position.set(j.from[0] + (j.to[0] - j.from[0]) * e, Math.max(0.13, u > 0.5 ? F.heightAt(g.position.x, g.position.z) : 0.15), j.from[1] + (j.to[1] - j.from[1]) * e);
        j.gait += 1.25 * dt / 1.75; PRESENT.animateWalk(g, j.gait % 1, dt, { rest: 1, look: 0 }); FARMPEOPLE.act(w.fig, "lead"); ropeUpdate(j); placeWorker(j, dt);
        if (u >= 1) { doorOf(i, false); const P = FARMLIFE.padInfo(j.k); j.path = route([w.x, w.z], [P.gate.x, P.gate.z]); j.path = j.path.concat(route([P.gate.x, P.gate.z], [P.inside.x, P.inside.z]).slice(1)); j.pi = 0; j.stage = 3; j.t = 0; }
      } else if (j.stage === 3) {                                                // led to the paddock gate and in
        const done = walk(j, dt, 1.45); placeWorker(j, dt); trail(j, dt); if (done || j.t > 90) { j.stage = 4; j.t = 0; FARMLIFE.adoptOut(g, j.k); FARMPEOPLE.act(w.fig, null); dropRope(j); const P = FARMLIFE.padInfo(j.k); j.path = route([w.x, w.z], [P.gate.x, P.gate.z + 1.5]); j.pi = 0; }
      } else { const done = walk(j, dt, 1.8); placeWorker(j, dt); if (done || j.t > 60) finishJob(j, true); }
    } else {
      if (j.stage === 0) { if (walk(j, dt, 1.8) || j.t > 60) { j.stage = 1; j.t = 0; } placeWorker(j, dt); }
      else if (j.stage === 1) {                                                  // clip the rope on and turn back
        placeWorker(j, dt); const o = FARMLIFE.out[j.hid]; if (!o) { finishJob(j, false); return; } if (j.t > 0.8) { FARMLIFE.releaseOut(j.hid); g.userData.out = true; const P = FARMLIFE.padInfo(o.k); FARMPEOPLE.act(w.fig, "lead"); j.path = route([w.x, w.z], [P.gate.x, P.gate.z]); j.path = j.path.concat(route([P.gate.x, P.gate.z], frontOf(i)).slice(1)); j.pi = 0; j.stage = 2; j.t = 0; j.hsp = 0; }
      } else if (j.stage === 2) {
        const done = walk(j, dt, 1.45); placeWorker(j, dt); trail(j, dt); if (done || j.t > 90) { j.stage = 3; j.t = 0; j.from = [g.position.x, g.position.z]; doorOf(i, true); }
      } else if (j.stage === 3) {                                                // the door opens, the horse walks in
        const f = frontOf(i), n = inside(i); w.face += (0 - w.face) * Math.min(1, dt * 6); placeWorker(j, dt);
        if (j.t > 0.8) { if (!j.at) { j.at = true; g.position.set(f[0], F.heightAt(f[0], f[1]), f[1]); } const u = clamp01((j.t - 0.8) / 2.1), e = ease(u); g.position.set(f[0] + (n[0] - f[0]) * e, u < 0.5 ? Math.max(0.13, F.heightAt(f[0], f[1])) : 0.15, f[1] + (n[1] - f[1]) * e); g.rotation.y = -Math.PI / 2; j.gait += 1.25 * dt / 1.75; PRESENT.animateWalk(g, j.gait % 1, dt, { rest: 1, look: 0 }); ropeUpdate(j);
          if (u >= 1) { doorOf(i, false); FARMCARE.untake(g); g.userData.out = false; dropRope(j); FARMPEOPLE.act(w.fig, null); const s = stationFor(w); j.path = route([w.x, w.z], [s.x, s.z]); j.pi = 0; j.stage = 4; j.t = 0; } }
      } else { const done = walk(j, dt, 1.8); placeWorker(j, dt); if (done || j.t > 60) finishJob(j, true); }
    }
  }
  const stationFor = w => { const st = FARMLIFE.stations(w.d.role); return st[(w.ri || 0) % st.length]; };

  // ---------------------------------------------------------------- snapping: put every horse where the schedule says (entering the farm, skipping time)
  function cancelJobs() { try { FARMWORK.clear(); } catch (e) {} for (const j of jobs.slice()) { const w = j.w; w.job = null; w.mode = "walk"; w.t = 2; FARMPEOPLE.act(w.fig, null); dropRope(j); doorOf(j.i, false); const s = stationFor(w); w.x = s.x; w.z = s.z; } jobs = []; queue = []; }
  function snap() {
    if (!F) return; cancelJobs(); const p = schedule(true); if (!p) return;
    for (const g of F.horses) {
      const hid = g.userData.hid; if (!hid || g.userData.stallI == null) continue; if (FARMCARE.led && FARMCARE.led.hid === hid) continue;
      const e = p.horses.find(x => x.hid === hid), w = want(hid); last[hid] = w; if (isManual(hid)) continue;
      if (w === "work" && e && e.work) { if (FARMLIFE.isOut(hid)) { FARMLIFE.releaseOut(hid); FARMCARE.untake(g); } FARMWORK.startWork(hid, e, { snap: true, frac: (hour() - e.work.from) / Math.max(0.1, e.work.to - e.work.from) * 0.9 }); continue; }
      if (w === "paddock" && e && e.turnout) { if (!FARMLIFE.isOut(hid)) { FARMCARE.untake(g); FARMLIFE.placeOut(g, e.turnout.paddock); } else if (FARMLIFE.out[hid].k !== e.turnout.paddock) { FARMLIFE.releaseOut(hid); FARMLIFE.placeOut(g, e.turnout.paddock); } }
      else if (FARMLIFE.isOut(hid)) { FARMLIFE.releaseOut(hid); FARMCARE.untake(g); g.userData.out = false; }
    }
  }
  function reconcile() {
    const p = schedule(); if (!p) return;
    for (const e of p.horses) {
      const hid = e.hid, g = horseOf(hid); if (!g) continue; const w = want(hid), was = last[hid];
      if (was === undefined) { last[hid] = w; continue; }
      if (w !== was) { last[hid] = w; delete manual[hid]; if (FARMCARE.led && FARMCARE.led.hid === hid) continue; if (w === "work") { FARMWORK.startWork(hid, e, {}); } else if (w === "paddock" && e.turnout) enqueue(hid, "out", e.turnout.paddock); else if (w === "box" && FARMLIFE.isOut(hid)) enqueue(hid, "in", 0); }
    }
    while (queue.length) { const w = freeWorker(); if (!w) break; const qi = queue.findIndex(x => !FARMWORK.find(x.hid)); if (qi < 0) break; const q = queue.splice(qi, 1)[0]; startJob(w, q); }
  }

  // ---------------------------------------------------------------- skipping: the player chooses to jump to the next activity or to the evening
  function skipTo(t) { const k = clock(); if (!k) return; k.t = Math.max(k.t, Math.min(CORE.CLOCK.dusk, t)); flush(); snap(); applyLight(true); try { CAREER.care.save && CAREER.care.save(); } catch (e) {} }
  function skipNext() { const k = clock(), n = k && nextEvent(k.t); if (!n) { skipTo(18); return "evening"; } skipTo(n.at + 0.02); return n.what; }
  const skipEvening = () => skipTo(18);

  // ---------------------------------------------------------------- the light follows the clock
  function applyLight(force) { if (!F) return; const h = hour(); if (!force && Math.abs(h - lightHour) < 0.05) return; lightHour = h; try { F.applyAtmosphere(true); } catch (e) {} }
  function updateLabel() { try { F.updateWx(); } catch (e) {} }

  const kit = { horseOf, doorOf, frontOf, inside, route, freeWorker, walk, placeWorker, trail, dropRope, ropeUpdate };
  function init(ctx) { F = ctx; try { FARMWORK.init(ctx); } catch (e) {} }
  function enter() {
    queue = []; jobs = []; last = {}; plan = null; K = null; hourShown = -1; lightHour = -9; dusked = false; lastDay = null; const c = C(); if (c) { try { speedKey = (typeof store !== "undefined" && store.get("farmClock", "normal")) || "normal"; if (SPEEDS[speedKey] == null) speedKey = "normal"; } catch (e) {} lastDay = c.day; }
    try { FARMWORK.enter(); } catch (e) { console.error(e); } if (!live() && !(c && c.farm)) return; snap(); applyLight(true); updateLabel();
  }
  function leave() { try { flush(); } catch (e) {} try { FARMWORK.leave(); } catch (e) {} K = null; cancelJobsSafe(); for (const r of ropes.slice()) { try { F.scene.remove(r); r.geometry.dispose(); r.material.dispose(); } catch (e) {} } ropes = []; }
  function cancelJobsSafe() { try { jobs = []; queue = []; } catch (e) {} }
  function dispose() { leave(); try { FARMWORK.dispose(); } catch (e) {} F = null; }

  function frame(dt) {
    if (!F) return; const c = C(); if (!c || !c.farm) return;
    if (lastDay !== c.day) { lastDay = c.day; plan = null; last = {}; dusked = false; snap(); applyLight(true); updateLabel(); }
    if (raceDay(c) || F.place() !== "out") { if (jobs.length) for (const j of jobs) stepJob(j, dt); FARMWORK.frame(dt); return; }
    const k = clock(); held = holdNow();
    if (!held && speed() > 0 && k.t < CORE.CLOCK.dusk) { k.t = Math.min(CORE.CLOCK.dusk, k.t + dt * speed() * (CORE.CLOCK.dusk - CORE.CLOCK.start) / CORE.CLOCK.secPerDay); }
    if (k.t >= CORE.CLOCK.dusk && !dusked) { dusked = true; try { F.toast("It's getting dark. The yard is quiet: time to call it a day when you're ready.", "info", 4); } catch (e) {} }
    if (jobs.length) for (const j of jobs.slice()) stepJob(j, dt);
    FARMWORK.frame(dt);
    stepTimer -= dt; if (stepTimer <= 0) { stepTimer = 0.5; reconcile(); }
    applyLight(false); const m = Math.floor(k.t * 60); if (m !== hourShown) { hourShown = m; updateLabel(); }
  }
  let stepTimer = 0;

  return { init, enter, leave, dispose, frame, flush, kit, noteBox, noteManual, horseOf, hour, live, label, schedule, want, entry, todayLines, nextEvent, busyHid, snap, skipTo, skipNext, skipEvening, setSpeed, SPEEDS, LABEL,
    get speed() { return speedKey; }, get held() { return held; }, get jobs() { return jobs; }, get queue() { return queue; }, raceDay: () => { const c = C(); return !!c && raceDay(c); } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = FARMACTORS;
