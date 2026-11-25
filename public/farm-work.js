// Phase 18: the morning's work. A horse with a training session today (CORE.farmDay) is ridden out to the exercise oval by a work rider, does its lap,
// is walked back and cooled out (on the horse walker when the Recovery facility is built), washed by a stable hand and put back in its box.
// Nothing here changes the career: the session's gains were already applied by CORE.autoDay when the day began; this only plays it out.
//  - one stage machine per working horse; the hands are borrowed from FARMACTORS (the same two stable hands that do turn-out)
//  - entering the farm or skipping into the work window puts a horse straight onto the oval; skipping past it puts it back in its box
const FARMWORK = (() => {
  let F = null, jobs = [], walker = null, steamTex = null, lastWork = {};
  const clamp01 = u => Math.max(0, Math.min(1, u)), ease = u => u * u * (3 - 2 * u), K = () => FARMACTORS.kit;
  const WASH = { x: -12.4, z: -20.7 }, ENTRY = { x: -6.6, z: 21.0 }, COOL = { x: 2, z: -6, r: 5 }, WALK = { x: 11, z: -7.5, r: 4.2 };
  // intensity 1..3 -> one lap at a light canter, a steady canter, a steady canter with a faster last 120 m
  const INT = [{ v: 5.6, fast: 0 }, { v: 7.4, fast: 0 }, { v: 7.4, fast: 120, vf: 10.5 }];
  const trk = () => FARMWORLD.L.track, R = () => (trk().r0 + trk().r1) / 2, PER = () => 240 + 2 * Math.PI * R();
  function ovalAt(d) {                                                      // x, z and heading at distance d along the centre line (north straight heading east, as the oval's rails are built)
    const c = trk(), r = R(), st = 120, arc = Math.PI * r, per = 2 * st + 2 * arc; d = ((d % per) + per) % per;
    if (d < st) return [-60 + d, c.cz - r, 1, 0];
    if (d < st + arc) { const a = (d - st) / r; return [60 + Math.sin(a) * r, c.cz - Math.cos(a) * r, Math.cos(a), Math.sin(a)]; }
    if (d < 2 * st + arc) return [60 - (d - st - arc), c.cz + r, -1, 0];
    const a = (d - 2 * st - arc) / r; return [-60 - Math.sin(a) * r, c.cz + Math.cos(a) * r, -Math.cos(a), -Math.sin(a)];
  }
  let D0 = null; function startD() { if (D0 != null) return D0; let best = 1e9; for (let d = 0; d < PER(); d += 0.5) { const p = ovalAt(d), q = Math.hypot(p[0] - ENTRY.x, p[1] - ENTRY.z); if (q < best) { best = q; D0 = d; } } return D0; }

  // ---------------------------------------------------------------- the rider and the sweat
  function rider(g, on) {
    const u = g.userData, j = u.jk; if (!j) return; j.mesh.visible = !!on; if (j.whip) j.whip.visible = !!on; (j.irons || []).forEach(i => { i.m.visible = !!on; }); (j.reins || []).forEach(r => { if (r.m) r.m.visible = !!on; else r.visible = !!on; });
    (u.tack || []).forEach(x => { x.visible = !!on; });
    if (!on) { try { FARMCARE.tackFor(g); } catch (e) {} }
  }
  function steamOn(j, on) {
    if (!on) { if (j.steam) { F.scene.remove(j.steam); j.steam.geometry.dispose(); j.steam.material.dispose(); j.steam = null; } return; }
    if (j.steam) return; if (!steamTex) { const c = document.createElement("canvas"); c.width = c.height = 32; const x = c.getContext("2d"), gr = x.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); steamTex = new THREE.CanvasTexture(c); }
    const geo = new THREE.BufferGeometry(), N = 10; geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3)); j.steamSeed = Array.from({ length: N }, (_, i) => i / N);
    j.steam = new THREE.Points(geo, new THREE.PointsMaterial({ map: steamTex, size: 0.9, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true })); j.steam.frustumCulled = false; F.scene.add(j.steam);
  }
  function steamStep(j, dt, fade) {
    if (!j.steam) return; const p = j.steam.geometry.attributes.position, g = j.g, t = performance.now() / 1000;
    for (let i = 0; i < j.steamSeed.length; i++) { j.steamSeed[i] = (j.steamSeed[i] + dt * 0.35) % 1; const u = j.steamSeed[i], sd = i * 2.4 + 1; p.setXYZ(i, g.position.x + Math.cos(g.rotation.y) * (i % 5 - 2) * 0.18 + Math.sin(t + sd) * 0.2 * u, g.position.y + 1.6 + u * 1.1, g.position.z - Math.sin(g.rotation.y) * (i % 5 - 2) * 0.18 + Math.cos(t * 0.8 + sd) * 0.2 * u); }
    p.needsUpdate = true; j.steam.material.opacity = 0.5 * (1 - fade);
  }

  // ---------------------------------------------------------------- the horse walker (built once Recovery level 1 is reached)
  function buildWalker() {
    disposeWalker(); let lv = 0; try { lv = (CAREER.data.fac && CAREER.data.fac.recovery) | 0; } catch (e) {} if (lv < 1) return;
    const grp = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0x8a6a46 }), mat2 = new THREE.MeshLambertMaterial({ color: 0x3b3f42 }), geos = [];
    const add = (geo, m, x, y, z, ry) => { geos.push(geo); const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); if (ry) me.rotation.y = ry; me.castShadow = true; return me; };
    grp.add(add(new THREE.CylinderGeometry(0.28, 0.34, 2.6, 10), mat2, 0, 1.3, 0)); const arms = new THREE.Group(); arms.position.y = 2.35; grp.add(arms);
    const n = lv >= 3 ? 4 : lv >= 2 ? 3 : 2; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, m = add(new THREE.BoxGeometry(WALK.r + 0.5, 0.08, 0.1), mat, Math.cos(a) * (WALK.r + 0.5) / 2, 0, Math.sin(a) * (WALK.r + 0.5) / 2); m.rotation.y = -a; arms.add(m); }
    grp.position.set(WALK.x, F.heightAt(WALK.x, WALK.z), WALK.z); F.scene.add(grp); walker = { grp, arms, geos, mats: [mat, mat2], n, ang: 0, spin: 0 };
  }
  function disposeWalker() { if (!walker) return; F.scene.remove(walker.grp); walker.geos.forEach(g => g.dispose()); walker.mats.forEach(m => m.dispose()); walker = null; }

  // ---------------------------------------------------------------- jobs
  const find = hid => jobs.find(j => j.hid === hid) || null;
  function startWork(hid, e, opt) {
    const g = K().horseOf(hid); if (!g || g.userData.stallI == null || find(hid)) return false; if (FARMLIFE.isOut(hid)) return false; if (FARMCARE.led && FARMCARE.led.hid === hid) return false;
    const int = e && e.session ? e.session.int : 1, I = INT[Math.max(0, Math.min(2, int - 1))];
    const j = { hid, g, i: g.userData.stallI, int, I, stage: 0, t: 0, w: null, path: null, pi: 0, hsp: 0, gait: 0, sp: 0, ph: 0, d: 0, ran: 0, lapT: 0, name: e ? e.name : "" };
    g.userData.out = true; jobs.push(j);
    if (opt && opt.snap) { j.stage = 3; j.ran = Math.max(0, Math.min(0.9, opt.frac || 0.3)) * PER(); j.d = startD() + j.ran; rider(g, true); posOval(j); } else { j.stage = 0; }
    return true;
  }
  function posOval(j) { const p = ovalAt(j.d), g = j.g; g.position.set(p[0], F.heightAt(p[0], p[1]), p[1]); g.rotation.y = Math.atan2(-p[3], p[2]); }
  // ride the horse along j.path at speed v (the horse itself walks the path; the rider is on it)
  function ride(j, dt, v) {
    const P = j.path, g = j.g; if (!P || j.pi >= P.length) return true; let tg = P[j.pi], dx = tg[0] - g.position.x, dz = tg[1] - g.position.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { j.pi++; if (j.pi >= P.length) return true; tg = P[j.pi]; dx = tg[0] - g.position.x; dz = tg[1] - g.position.z; d = Math.hypot(dx, dz); }
    const s = Math.min(d, v * dt); g.position.x += dx / d * s; g.position.z += dz / d * s; g.position.y = Math.max(F.heightAt(g.position.x, g.position.z), 0);
    const want = Math.atan2(-dz, dx); let e = want - g.rotation.y; e = Math.atan2(Math.sin(e), Math.cos(e)); g.rotation.y += e * Math.min(1, dt * 5); j.hsp = v; if (v >= 2.8) { j.gait += v * dt / 3.6; PRESENT.animateTrot(g, j.gait % 1, dt, { rest: 0.4 }); } else { j.gait += v * dt / 1.75; PRESENT.animateWalk(g, j.gait % 1, dt, { rest: 0.4, look: 0 }); } return false;
  }
  function stepJob(j, dt) {
    const g = j.g, i = j.i, k = K(); j.t += dt;
    if (FARMCARE.led && FARMCARE.led.hid === j.hid) { end(j, false); return; }
    if (j.stage === 0) {                                                                       // the door opens, the work rider is up
      k.doorOf(i, true); animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null); if (j.t > 0.6) { rider(g, true); const f = k.frontOf(i), n = k.inside(i); j.from = n; j.to = f; g.position.set(n[0], 0.15, n[1]); g.rotation.y = -Math.PI / 2; j.stage = 1; j.t = 0; }
    } else if (j.stage === 1) {                                                                // out of the box
      const u = clamp01(j.t / 2.0), e = ease(u); g.position.set(j.from[0] + (j.to[0] - j.from[0]) * e, u > 0.5 ? Math.max(0.13, F.heightAt(g.position.x, g.position.z)) : 0.15, j.from[1] + (j.to[1] - j.from[1]) * e); j.gait += 1.4 * dt / 1.75; PRESENT.animateWalk(g, j.gait % 1, dt, { rest: 0.4, look: 0 });
      if (u >= 1) { k.doorOf(i, false); const o = ovalAt(startD()), pth = k.route([g.position.x, g.position.z], [ENTRY.x, ENTRY.z]); pth.push([o[0], o[1]]); j.path = pth; j.pi = 0; j.stage = 2; j.t = 0; }
    } else if (j.stage === 2) {                                                                // ridden to the oval
      if (ride(j, dt, 3.2) || j.t > 80) { j.stage = 3; j.t = 0; j.d = startD(); j.ran = 0; j.lapT = 0; }
    } else if (j.stage === 3) {                                                                // the work: one lap
      const per = PER(), I = j.I, left = per - j.ran, v = I.fast && left <= I.fast ? I.vf : I.v, ramp = Math.min(1, 0.25 + j.ran / 40), vv = v * ramp * (left < 25 ? Math.max(0.4, left / 25) : 1);
      j.ran += vv * dt; j.d = startD() + j.ran; j.lapT += dt; posOval(j); j.ph += dt * vv / (1.6 + 0.65 * vv);
      animateHorse(g, j.ph, Math.min(1, vv / 16), vv > 9 ? 0.75 : 0.45, 0.2, 0.5, 0, dt, null);
      if (j.ran >= per - 0.5) { j.sec = j.lapT; j.stage = 4; j.t = 0; const o = g.position, pth = k.route([o.x, o.z], [ENTRY.x, ENTRY.z]); pth.push([COOL.x, COOL.z + COOL.r]); j.path = pth; j.pi = 0; steamOn(j, true); }
    } else if (j.stage === 4) {                                                                // walked back, rider hands the horse over
      const done = ride(j, dt, 1.9); steamStep(j, dt, 0); if (done || j.t > 90) { rider(g, false); j.stage = 5; j.t = 0; }
    } else if (j.stage === 5) {                                                                // wait for a hand
      animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null); steamStep(j, dt, 0); const w = k.freeWorker();
      if (w || j.t > 40) { if (w) { w.job = j; w.mode = "job"; FARMPEOPLE.act(w.fig, null); j.w = w; } j.stage = 6; j.t = 0; j.hsp = 0; if (j.w) { const hp = [g.position.x, g.position.z], first = k.route([j.w.x, j.w.z], hp); if (walker) { j.wk = true; j.path = first.concat(k.route(hp, [WALK.x - WALK.r - 1.2, WALK.z]).slice(1)); } else { const c = []; for (let a = Math.PI / 8; a <= 2 * Math.PI + 0.01; a += Math.PI / 8) c.push([COOL.x + Math.sin(a) * COOL.r, COOL.z + COOL.r - Math.cos(a) * COOL.r]); j.path = first.concat(c); } j.lf = first.length; j.pi = 0; FARMPEOPLE.act(j.w.fig, "lead"); } }
    } else if (j.stage === 6) {                                                                // cooling out: led round the courtyard, or on the horse walker
      if (!j.w) { j.stage = 8; j.t = 0; return; }
      if (j.wk) { walkerStep(j, dt); } else { const done = k.walk(j, dt, 1.4); k.placeWorker(j, dt); if (j.pi >= (j.lf || 0)) k.trail(j, dt); else animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null); steamStep(j, dt, clamp01(j.t / 30) * 0.7); if (done || j.t > 70) { j.stage = 7; j.t = 0; j.path = k.route([j.w.x, j.w.z], [WASH.x + 0.6, WASH.z + 1.6]); j.pi = 0; j.lf = 0; } }
    } else if (j.stage === 7) {                                                                // led to the wash bay
      const done = k.walk(j, dt, 1.6); k.placeWorker(j, dt); k.trail(j, dt); steamStep(j, dt, 0.7); if (done || j.t > 40) { j.stage = 8; j.t = 0; }
    } else if (j.stage === 8) {                                                                // washed by the hand
      const w = j.w; g.position.x += (WASH.x - g.position.x) * Math.min(1, dt * 2); g.position.z += (WASH.z - 0.2 - g.position.z) * Math.min(1, dt * 2); g.rotation.y += (-Math.PI / 2 - g.rotation.y) * Math.min(1, dt * 2); animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
      if (w) { w.x += (WASH.x + 1.3 - w.x) * Math.min(1, dt * 3); w.z += (WASH.z + 1.4 - w.z) * Math.min(1, dt * 3); w.face += (0.6 - w.face) * Math.min(1, dt * 4); FARMPEOPLE.act(w.fig, "brush"); k.placeWorker(j, dt); k.dropRope(j); }
      steamStep(j, dt, clamp01(j.t / 9) * 0.9); if (j.t > 9) { steamOn(j, false); j.stage = 9; j.t = 0; if (w) { FARMPEOPLE.act(w.fig, "lead"); j.path = k.route([w.x, w.z], k.frontOf(i)); j.pi = 0; } }
    } else if (j.stage === 9) {                                                                // back to the box
      if (j.w) { const done = k.walk(j, dt, 1.6); k.placeWorker(j, dt); k.trail(j, dt); if (done || j.t > 40) { j.stage = 10; j.t = 0; j.from = [g.position.x, g.position.z]; k.doorOf(i, true); } } else { j.stage = 10; j.t = 0; j.from = [g.position.x, g.position.z]; k.doorOf(i, true); }
    } else if (j.stage === 10) {
      const f = k.frontOf(i), n = k.inside(i); if (j.w) { j.w.face += (0 - j.w.face) * Math.min(1, dt * 6); k.placeWorker(j, dt); }
      if (j.t > 0.8) { if (!j.at) { j.at = true; g.position.set(f[0], F.heightAt(f[0], f[1]), f[1]); } const u = clamp01((j.t - 0.8) / 2.0), e = ease(u); g.position.set(f[0] + (n[0] - f[0]) * e, u < 0.5 ? Math.max(0.13, F.heightAt(f[0], f[1])) : 0.15, f[1] + (n[1] - f[1]) * e); g.rotation.y = -Math.PI / 2; j.gait += 1.25 * dt / 1.75; PRESENT.animateWalk(g, j.gait % 1, dt, { rest: 1, look: 0 }); k.ropeUpdate(j); if (u >= 1) end(j, true); }
    }
  }
  // the horse walker: the hand leads the horse to the arm, the arm turns, then the hand takes it on to the wash bay
  function walkerStep(j, dt) {
    const k = K(), w = j.w, g = j.g;
    if (!j.wst) { const done = k.walk(j, dt, 1.5); k.placeWorker(j, dt); if (j.pi >= (j.lf || 0)) k.trail(j, dt); else animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null); steamStep(j, dt, 0.1); if (done || j.t > 40) { j.wst = 1; j.wt = 0; k.dropRope(j); FARMPEOPLE.act(w.fig, "inspect"); } return; }
    j.wt += dt; w.sp = 0; k.placeWorker(j, dt); const spin = 0.55 * Math.min(1, j.wt / 2) * (j.wt > 22 ? Math.max(0, 1 - (j.wt - 22) / 2) : 1); walker.spin = spin; walker.ang += spin * dt; walker.arms.rotation.y = -walker.ang;
    const a = walker.ang, x = WALK.x + Math.cos(a) * (WALK.r - 0.4), z = WALK.z + Math.sin(a) * (WALK.r - 0.4); g.position.set(x, F.heightAt(x, z), z); g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); j.gait += spin * (WALK.r - 0.4) * dt / 1.75 * 1.1; PRESENT.animateWalk(g, j.gait % 1, dt, { rest: 1, look: 0 }); steamStep(j, dt, clamp01(j.wt / 22) * 0.8);
    if (j.wt > 24) { walker.spin = 0; j.stage = 7; j.t = 0; j.wk = false; j.wst = 0; FARMPEOPLE.act(w.fig, "lead"); j.path = k.route([w.x, w.z], [g.position.x, g.position.z]); j.path = j.path.concat(k.route([g.position.x, g.position.z], [WASH.x + 0.6, WASH.z + 1.6]).slice(1)); j.pi = 0; j.hsp = 0; j.lf = 0; }
  }
  function end(j, ok) {
    jobs = jobs.filter(x => x !== j); steamOn(j, false); const g = j.g; K().doorOf(j.i, false); K().dropRope(j); rider(g, false);
    if (j.w) { const w = j.w; w.job = null; w.mode = "walk"; w.t = 2; w.ri = (w.ri || 0) + 1; FARMPEOPLE.act(w.fig, null); w.sp = 0; j.w = null; }
    if (ok) { try { FARMCARE.untake(g); } catch (e) {} g.userData.out = false; if (j.sec) lastWork[j.hid] = { day: CAREER.data.day, sec: j.sec, int: j.int }; FARMACTORS.noteBox(j.hid); }
  }
  // snapping (entering, skipping): drop the job and put the horse in its box
  function clear() { for (const j of jobs.slice()) { steamOn(j, false); K().dropRope(j); K().doorOf(j.i, false); rider(j.g, false); if (j.w) { const w = j.w; w.job = null; w.mode = "walk"; w.t = 2; FARMPEOPLE.act(w.fig, null); } try { FARMCARE.untake(j.g); } catch (e) {} j.g.userData.out = false; } jobs = []; }
  function stop(hid) { const j = find(hid); if (!j) return; jobs = jobs.filter(x => x !== j); steamOn(j, false); K().dropRope(j); K().doorOf(j.i, false); rider(j.g, false); if (j.w) { const w = j.w; w.job = null; w.mode = "walk"; w.t = 2; FARMPEOPLE.act(w.fig, null); } try { FARMCARE.untake(j.g); } catch (e) {} j.g.userData.out = false; }

  function init(ctx) { F = ctx; }
  function enter() { jobs = []; D0 = null; try { buildWalker(); } catch (e) { console.error(e); } }
  function leave() { clear(); disposeWalker(); if (steamTex) { steamTex.dispose(); steamTex = null; } }
  function dispose() { leave(); F = null; }
  function frame(dt) { if (!F) return; for (const j of jobs.slice()) { try { stepJob(j, dt); } catch (e) { console.error(e); end(j, true); } } }
  const lastFor = hid => { const l = lastWork[hid]; try { return l && l.day === CAREER.data.day ? l : null; } catch (e) { return null; } };
  return { init, enter, leave, dispose, frame, startWork, stop, clear, find, lastFor, ovalAt, startD, buildWalker, get jobs() { return jobs; }, get walker() { return walker; }, POINTS: { WASH, ENTRY, COOL, WALK }, per: PER };
})();
if (typeof module !== "undefined" && module.exports) module.exports = FARMWORK;
