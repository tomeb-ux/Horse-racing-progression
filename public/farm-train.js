'use strict';
/* =====================================================================
   FINAL FURLONG — HANDS-ON TRAINING (Phase 6): the farm's training facilities, usable with E
   Four short, genuinely playable drills. Each one runs the REAL race simulation (sim.js `Race`, one horse, no field, no commentary, nothing drawn from the race
   scene) so the horse accelerates, tires, settles and starts exactly as it does in a race, with the real controls: W / S set the effort, E settles, Space is the
   push into the stride / the tap on the final-drive beat / the lunge, Shift drives. The horse (with its jockey) is drawn on the farm's exercise oval; the farm and
   race scenes stay separate.
     • STARTING-GATE PRACTICE at the gate unit — the actual three-stage start: balance the horse in the stall with W / S, press Space when the gates open, push with the stride.
     • ACCELERATION (250 m, rolling start) — get the horse up to speed; scored against an ideal run of the same horse.
     • SETTLING (600 m) — keep the horse "travelling well" (effort matched to its comfort) instead of fighting it.
     • SPRINT RHYTHM (650 m) — the final-drive beat: tap Space on the beat and lunge on the line.
   Rewards come from CORE.drillReward: small, once per horse per day, capped per week, none when the horse is tired; practice is always free to repeat for the score.
   ===================================================================== */
const FARMTRAIN = (() => {
  let F = null, menuEl = null, hudEl = null, R = null, M = null;
  const TR = () => FARMWORLD.L.track, ease = u => u * u * (3 - 2 * u), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DRILLS = {
    gate: { name: "Starting-gate practice", dist: 420, where: "gate", tip: "Balance the horse in the stall with W / S, press SPACE the moment the gates open, then tap SPACE as the pin crosses the green." },
    accel: { name: "Acceleration", dist: 250, where: "oval", tip: "Smooth, quick acceleration: bring the effort up with W, push into the stride with SPACE, then ease off with S through the line." },
    settle: { name: "Settling", dist: 600, where: "oval", tip: "Travel the horse well: keep the effort near the comfort zone (hold E to settle a keen horse) — not fighting it, not dawdling." },
    sprint: { name: "Sprint rhythm", dist: 650, where: "oval", tip: "Final drive: tap SPACE as the pin crosses the green to build rhythm, and lunge once on the line." },
  };
  const ORDER = { gate: ["gate"], oval: ["accel", "settle", "sprint"] };
  const POINTS = [{ id: "drill:gate", where: "gate", x: -34.6, z: 27.5, r: 3.4, text: "E — Starting-gate practice (the real start)" }, { id: "drill:oval", where: "oval", x: -6.6, z: 21.0, r: 3.6, text: "E — Exercise oval: acceleration · settling · sprint rhythm" }];
  const cx = () => TR().cx, cz = () => TR().cz, rc = () => (TR().r0 + TR().r1) / 2, per = () => 240 + Math.PI * 2 * rc();
  // a point d metres along the oval's centreline, from the west end of the north straight (heading east)
  function ovalAt(d, out) {
    const r = rc(), st = 120, arc = Math.PI * r, p = per(); d = ((d % p) + p) % p;
    if (d < st) { out.x = -60 + d; out.z = cz() - r; out.hx = 1; out.hz = 0; }
    else if (d < st + arc) { const a = (d - st) / r; out.x = 60 + Math.sin(a) * r; out.z = cz() - Math.cos(a) * r; out.hx = Math.cos(a); out.hz = Math.sin(a); }
    else if (d < 2 * st + arc) { out.x = 60 - (d - st - arc); out.z = cz() + r; out.hx = -1; out.hz = 0; }
    else { const a = (d - 2 * st - arc) / r; out.x = -60 - Math.sin(a) * r; out.z = cz() + Math.cos(a) * r; out.hx = -Math.cos(a); out.hz = -Math.sin(a); }
    return out;
  }
  function init(ctx) { F = ctx; menuEl = document.createElement("div"); menuEl.id = "farmTrainMenu"; menuEl.hidden = true; menuEl.style.cssText = "position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));pointer-events:auto;background:rgba(9,14,11,.92);border:1px solid rgba(232,195,90,.7);border-radius:14px;padding:12px 14px;color:#f2efe6;font:600 14px var(--font-b,system-ui);width:min(400px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.5)"; F.hud.appendChild(menuEl);
    hudEl = document.createElement("div"); hudEl.id = "farmTrainHud"; hudEl.hidden = true; hudEl.style.cssText = "position:absolute;inset:0;pointer-events:none;color:#f2efe6;font:600 14px var(--font-b,system-ui)"; F.hud.appendChild(hudEl); }
  function enter() { M = null; R = null; if (menuEl) menuEl.hidden = true; if (hudEl) hudEl.hidden = true; }
  function leave() { if (R) abort(true); M = null; if (menuEl) menuEl.hidden = true; if (hudEl) hudEl.hidden = true; }
  function dispose() { if (menuEl) menuEl.remove(); if (hudEl) hudEl.remove(); menuEl = hudEl = null; F = null; }
  const hasCareer = () => { try { return CAREER.data && CAREER.data.horses.length > 0; } catch (e) { return false; } };
  function points() { return hasCareer() && !R ? POINTS : []; }
  function interact(p) { if (!p.id || p.id.indexOf("drill:") !== 0) return false; if (R || M) return true; openMenu(p.id === "drill:gate" ? "gate" : "oval"); return true; }

  // ---------------------------------------------------------------- the menu: pick the horse and the drill
  function horseList() { return CAREER.data.horses.slice(0, 5).map(h => ({ id: h.id, name: h.name, fit: h.fitness, st: CAREER.care.status(h.id) })); }
  function openMenu(where) {
    const hs = horseList(); if (!hs.length) return; const led = FARMCARE.ledHid(), b = (() => { try { return CAREER.booking(); } catch (e) { return null; } })();
    M = { where, sel: Math.max(0, hs.findIndex(h => h.id === led)), drill: ORDER[where][0] }; if (M.sel < 0) M.sel = Math.max(0, hs.findIndex(h => b && h.id === b.hid)); if (M.sel < 0) M.sel = 0;
    render(); menuEl.hidden = false; F.setBusy(true); F.fig.root.visible = true;
  }
  function render() {
    const hs = horseList(), h = hs[M.sel], d = DRILLS[M.drill], st = h.st, best = st.best[M.drill];
    const reward = st.fitness < 55 ? `<span style="color:#e8a35a">${h.name} is tired — practice only (rest or feed first)</span>` : st.drilled ? `<span style="color:#c8d2c8">Already rewarded today — practice only</span>` : `<span style="color:#8fd18f">Reward available today (small, once a day)</span>`;
    let t = `<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font:800 17px var(--font-d,system-ui);letter-spacing:.04em">${M.where === "gate" ? "Starting gate" : "Exercise oval"}</b><span style="font-size:12px;color:#c8d2c8">${CAREER.care.today}</span></div>`;
    t += `<div style="margin:6px 0 2px;font-size:12px;color:#c8d2c8">Horse (1–${hs.length})</div>` + hs.map((x, i) => `<button data-h="${i}" style="${btnCss(i === M.sel)}"><span><kbd style="opacity:.7;margin-right:8px">${i + 1}</kbd>${x.name}</span><span style="opacity:.8">fitness ${Math.round(x.fit)}</span></button>`).join("");
    if (ORDER[M.where].length > 1) t += `<div style="margin:8px 0 2px;font-size:12px;color:#c8d2c8">Drill</div>` + ORDER[M.where].map((k, i) => `<button data-d="${k}" style="${btnCss(k === M.drill)}"><span><kbd style="opacity:.7;margin-right:8px">${"ABC"[i]}</kbd>${DRILLS[k].name}</span><span style="opacity:.8">${DRILLS[k].dist} m${st.best[k] != null ? " · best " + st.best[k] : ""}</span></button>`).join("");
    t += `<div style="margin:8px 0 4px;font-size:12.5px;line-height:1.45">${d.tip}</div><div style="margin:2px 0 8px;font-size:12px">${reward}${best != null ? " · best " + best + "%" : ""}</div>`;
    t += `<button data-go="1" style="${btnCss(true)};justify-content:center;font-weight:800"><span>Start ${d.name} <kbd style="opacity:.7;margin-left:6px">Enter</kbd></span></button><button data-x="1" style="${btnCss(false)};justify-content:center"><span>Close <kbd style="opacity:.7;margin-left:6px">Esc</kbd></span></button>`;
    menuEl.innerHTML = t;
    menuEl.querySelectorAll("button[data-h]").forEach(b => b.onclick = () => { M.sel = +b.dataset.h; render(); }); menuEl.querySelectorAll("button[data-d]").forEach(b => b.onclick = () => { M.drill = b.dataset.d; render(); });
    menuEl.querySelector("[data-go]").onclick = () => go(); menuEl.querySelector("[data-x]").onclick = () => closeMenu();
  }
  const btnCss = on => `pointer-events:auto;cursor:pointer;display:flex;justify-content:space-between;gap:12px;width:100%;margin:3px 0;padding:8px 12px;border-radius:9px;border:1px solid ${on ? "rgba(232,195,90,.95)" : "rgba(255,255,255,.2)"};background:${on ? "rgba(232,195,90,.16)" : "rgba(255,255,255,.06)"};color:#f2efe6;font:600 13.5px var(--font-b,system-ui);text-align:left`;
  function closeMenu() { M = null; if (menuEl) menuEl.hidden = true; F.setBusy(false); }
  function go() { if (!M) return; const hs = horseList(), h = hs[M.sel]; if (!h) return; const drill = M.drill; closeMenu(); start(h.id, drill); }
  function menuKey(k) {
    if (k === "escape") { closeMenu(); return true; }
    if (k === "enter") { go(); return true; }
    const n = parseInt(k, 10); if (n >= 1 && n <= 5 && n <= horseList().length) { M.sel = n - 1; render(); return true; }
    const li = ORDER[M.where], di = "abc".indexOf(k); if (di >= 0 && di < li.length) { M.drill = li[di]; render(); return true; }
    return true;
  }

  // ---------------------------------------------------------------- an ideal run of the same horse (the benchmark for the acceleration score)
  function refTime(def, dist) {
    try {
      const r = new Race({ distance: dist, field: 1, playerDef: def, diff: "medium", going: "good", seed: 4242, incidents: "off", track: "generic" }), p = r.player; let t0 = null, n = 0;
      while (r.state !== "running" && n++ < 4000) r.step(SIM_DT); if (!p.st.launched) r.launch(true, p);
      let guard = 0; const inp = { effort: 1, poise: 0, steer: 0 };
      for (let i = 0; i < 120 * 60 && guard++ < 1e6; i++) { applyRiderInput(r, p, inp, SIM_DT); if (p.strideWin && p.strideWin() && p.strideAcc() >= STRIDE_OK && p.kicks < 4) riderPress(r, p); if (t0 == null) t0 = r.clock; r.step(SIM_DT); if (p.progress >= dist) return r.clock - t0; }
    } catch (e) { console.error("refTime", e); }
    return null;
  }

  // ---------------------------------------------------------------- the run
  function start(hid, drill) {
    const D = DRILLS[drill], def = CAREER.defOf(hid); if (!def || R) return;
    const info = CAREER.horseInfo(hid); const fromGate = drill === "gate";
    const g = F.horses.find(h => h.userData.hid === hid); const led = FARMCARE.ledHid() === hid;
    let mesh; try { mesh = buildHorse(def, 0); } catch (e) { console.error(e); return; }
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); F.scene.add(mesh); mesh.userData.idleT = 0;
    const seed = (Math.random() * 1e9) | 0, race = new Race({ distance: D.dist, field: 1, playerDef: def, diff: "medium", going: "good", seed, incidents: "off", track: "generic" }), p = race.player;
    R = { drill, D, hid, def, mesh, g, ledWas: led, race, p, acc: 0, t: 0, keys: {}, kdt: {}, inp: { effort: 0.55, steer: 0, settle: false, check: false, drive: false, hold: false, adv: false, poise: 0 }, ph: "ride", over: false, overT: 0, start: fromGate ? 22 : 52,
      fb: "", fbT: 0, zoneT: 0, zoneIn: 0, rhythmN: 0, momSum: 0, maxStreak: 0, kicks: [], tRef: null, t0: null, camP: new THREE.Vector3(), camL: new THREE.Vector3(), camInit: false, result: null, vis: { x: 0, z: 0, hx: 1, hz: 0 } };
    if (g) g.visible = false; if (led) FARMCARE.freeze(true);
    F.hideFig(true); F.setBusy(true); F.setPrompt(""); F.hud.querySelector("#farmInfo").style.visibility = "hidden"; hudEl.hidden = false; hudEl.innerHTML = hudHtml(); R.el = {};
    if (!fromGate) { let n = 0; while (race.state !== "running" && n++ < 5000) race.step(SIM_DT); if (!p.st.launched) race.launch(true, p); R.t0 = race.clock; if (drill === "accel") R.tRef = refTime(def, D.dist); }
    R.inp.effort = p.effort; place(0); F.cineCam.clear();
  }
  const hudHtml = () => `<div id="ftTop" style="position:absolute;left:max(16px,env(safe-area-inset-left,0px));top:max(16px,env(safe-area-inset-top,0px));background:rgba(9,14,11,.78);border:1px solid rgba(232,195,90,.6);border-radius:12px;padding:10px 14px;max-width:min(460px,calc(100vw - 32px))"><b id="ftName" style="font:800 15px var(--font-d,system-ui);letter-spacing:.05em"></b><div id="ftTip" style="margin-top:3px;font-size:12.5px;color:#d8dccf;line-height:1.4"></div></div>
    <div id="ftMsg" style="position:absolute;left:50%;top:26%;transform:translateX(-50%);font:900 clamp(18px,3.4vw,30px) var(--font-d,system-ui);letter-spacing:.05em;text-shadow:0 2px 14px rgba(0,0,0,.8);text-align:center;white-space:nowrap"></div>
    <div id="ftBars" style="position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(560px,calc(100vw - 32px));background:rgba(9,14,11,.8);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:10px 14px">
      <div style="display:flex;gap:10px;align-items:center;font-size:12px"><span style="width:62px">Effort</span><span style="flex:1;height:9px;background:rgba(255,255,255,.14);border-radius:5px;position:relative;overflow:hidden"><i id="ftEff" style="position:absolute;left:0;top:0;bottom:0;background:#e8c35a"></i><i id="ftAct" style="position:absolute;left:0;top:3px;bottom:3px;background:#fff;opacity:.55"></i></span><b id="ftEffT" style="width:36px;text-align:right"></b></div>
      <div id="ftMeter" style="display:flex;gap:10px;align-items:center;font-size:12px;margin-top:6px"><span id="ftMLab" style="width:62px"></span><span style="flex:1;height:14px;background:rgba(255,255,255,.14);border-radius:7px;position:relative;overflow:hidden"><i id="ftZone" style="position:absolute;top:0;bottom:0;background:rgba(95,224,138,.55)"></i><i id="ftPin" style="position:absolute;top:-1px;bottom:-1px;width:5px;margin-left:-2px;background:#fff;border-radius:3px"></i></span><b id="ftMT" style="width:84px;text-align:right"></b></div>
      <div style="display:flex;gap:10px;align-items:center;font-size:12px;margin-top:6px"><span style="width:62px">Stamina</span><span style="flex:1;height:7px;background:rgba(255,255,255,.14);border-radius:5px;overflow:hidden"><i id="ftSta" style="display:block;height:100%;background:#7cc6e8"></i></span><b id="ftDist" style="width:84px;text-align:right"></b></div>
      <div style="margin-top:5px;font-size:11.5px;color:#aeb8aa">W / S effort · E settle · SPACE push / tap / lunge · Shift drive · Esc ends the drill</div></div>
    <div id="ftRes" hidden style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,9,7,.55);pointer-events:auto"></div>`;
  function place(dt) {                                                          // the horse mesh on the oval, by the sim's progress
    const p = R.p, v = R.vis, d = R.start + clamp(p.progress, 0, 1e9) - (R.drill === "gate" && !p.started ? 1.0 : 0);
    ovalAt(d, v); const hx = v.hx, hz = v.hz, off = R.drill === "gate" ? -1.0 * Math.max(0, 1 - p.progress / 25) : 0; R.mesh.position.set(v.x - hz * off, F.heightAt(v.x, v.z), v.z + hx * off); R.mesh.rotation.y = Math.atan2(-hz, hx);
    // the horse's own animation, driven by the simulation exactly as in a race
    try { animateHorse(R.mesh, p.phase, Math.min(1, p.v / p.vmax), p.eAct, p.F / 100, p.rideN, 0, dt || 0.016, p, 0, p.accel, R.race.dist - p.progress < RHYTHM_AT ? p.mom : 0, p.restrainLvl, p.relax); } catch (e) { console.error(e); }
  }
  // ---- input (called from farm.js while a drill runs)
  function key(k, down, e) {
    if (!R) { if (M && down) return menuKey(k); return false; }
    if (down) {
      if (k === "escape") { abort(false); return true; }
      if (R.result) { if (k === "enter" || k === " ") { finishRun(); return true; } return true; }
      if (R.keys[k]) return true; R.keys[k] = true; R.kdt[k] = performance.now();
      if ((k === "w" || k === "s") && R.race.state === "running") R.inp.effort = clamp(R.inp.effort + (k === "w" ? 0.05 : -0.05), 0, 1);
      if (k === " ") press();
    } else { R.keys[k] = false; }
    return true;
  }
  function press() {
    const { race, p } = R; if (!R || R.over) return; let res = null; try { res = riderPress(race, p, {}); } catch (e) { console.error(e); }
    if (!res) return; const rr = res.res || res.kind;
    if (res.kind === "launch") { R.fb = res.cat === "PERFECT" ? "PERFECT BREAK" : res.cat === "GOOD" ? "GOOD BREAK" : res.cat === "SLOW" ? "SLOW AWAY" : res.cat === "MISSED" ? "MISSED THE START" : "AWAY"; R.fbT = 1.6; R.t0 = race.clock; }
    else if (res.kind === "stride") { R.kicks.push(res.res); R.fb = res.res === "perfect" ? "PERFECT PUSH" : res.res === "good" ? "good push" : res.res === "rushed" ? "rushed!" : "off the beat"; R.fbT = 0.8; }
    else if (res.kind === "tap") { R.fb = res.res === "good" || res.res === "perfect" ? "×" + res.streak : "off the beat"; R.fbT = 0.5; }
    else if (res.kind === "lunge") { R.fb = "LUNGE!"; R.fbT = 1.2; }
  }
  function frame(dt) {
    if (!R) return; dt = Math.min(dt, 0.05); const { race, p } = R, now = performance.now(), K = R.keys, inp = R.inp; R.t += dt;
    const held = k => K[k] && now - (R.kdt[k] || now) > 220, inStalls = race.state === "load" || race.state === "count";
    if (!R.result) {
      R.acc += dt; let n = 0;
      while (R.acc >= SIM_DT && n++ < 20) {
        inp.poise = inStalls ? (K.w ? 1 : 0) - (K.s ? 1 : 0) : 0;
        if (!inStalls) { if (held("w")) inp.effort = Math.min(1, inp.effort + 0.45 * SIM_DT); if (held("s")) inp.effort = Math.max(0, inp.effort - 0.55 * SIM_DT); }
        inp.settle = !!K.e; inp.drive = !!K.shift; inp.hold = !!K[" "]; inp.steer = 0;
        applyRiderInput(race, p, inp, SIM_DT); race.step(SIM_DT); R.acc -= SIM_DT; sample();
        if (!R.over && judgeEnd()) { R.over = true; break; }
      }
      if (n >= 20) R.acc = 0;
    } else { R.overT += dt; }
    if (R.over && !R.result && (p.finished || R.drill === "gate" || R.overT > 0)) { R.overT += dt; if (R.overT > 0.9) endRun(); }
    place(dt); hud(); camera(dt); R.fbT -= dt;
  }
  function sample() {
    const { race, p } = R; if (race.state !== "running" || !p.started) return;
    if (R.drill === "settle" && p.progress > 60) { R.zoneT += SIM_DT; const e = p.eAct, cf = p.comfort(); if (e <= cf + 0.07 && e >= cf - 0.25 && p.v >= 0.72 * p.vmax) R.zoneIn += SIM_DT; }
    if (R.drill === "sprint" && race.dist - p.progress <= RHYTHM_AT) { R.rhythmN++; R.momSum += p.mom; R.maxStreak = Math.max(R.maxStreak, p.streak | 0); }
  }
  function judgeEnd() {
    const { race, p } = R;
    if (R.drill === "gate") return p.started && p.progress > 70;
    return p.progress >= R.D.dist - 0.5 || p.finished;
  }
  function endRun() {
    const { race, p } = R; let grade = 0, label = "", detail = "";
    if (R.drill === "gate") { const cat = p.startCat || "MISSED", cs = { PERFECT: 1, GOOD: 0.72, SLOW: 0.4, MISSED: 0.12 }[cat] || 0.1; grade = 0.72 * cs + 0.28 * clamp(p.jumpPush || 0, 0, 1); label = (START_CATS[cat] || {}).label || cat; detail = `${label} · push ${Math.round((p.jumpPush || 0) * 100)}% · ${R.kicks.filter(k => k === "perfect" || k === "good").length} good pushes`; }
    else if (R.drill === "accel") { const t = race.clock - (R.t0 || 0), tr = R.tRef || t; grade = clamp(1 - (t - tr * 0.98) / (tr * 0.1), 0, 1); detail = `${t.toFixed(2)} s for ${R.D.dist} m (an ideal run: ${tr.toFixed(2)} s)`; }
    else if (R.drill === "settle") { grade = R.zoneT > 0 ? R.zoneIn / R.zoneT : 0; detail = `${Math.round(grade * 100)}% of the run travelling well · stamina left ${Math.round(p.S)}%`; }
    else { const avg = R.rhythmN ? R.momSum / R.rhythmN : 0; grade = clamp(0.6 * avg + 0.4 * Math.min(1, R.maxStreak / 10), 0, 1); detail = `rhythm ${Math.round(avg * 100)}% · best run of ${R.maxStreak} on the beat`; }
    grade = clamp(grade, 0, 1); let rw = null; try { rw = CAREER.care.drill(R.hid, R.drill, grade); } catch (e) { console.error(e); }
    const word = grade >= 0.85 ? "Excellent" : grade >= 0.65 ? "Good" : grade >= 0.4 ? "Fair" : "Keep practising";
    const rtext = !rw || !rw.ok ? "" : rw.pts > 0 ? `<span style="color:#8fd18f">+${rw.pts} training points</span> (fitness −3)` : rw.reason === "tired" ? "The horse was too tired to gain from it — practice only" : rw.reason === "today" ? "Already rewarded today — practice only" : rw.reason === "week" ? "This week's drill points are used up — practice only" : "";
    R.result = { grade, word, detail, rw }; const el = hudEl.querySelector("#ftRes"); el.hidden = false;
    el.innerHTML = `<div style="background:rgba(14,22,18,.96);border:1px solid rgba(232,195,90,.7);border-radius:16px;padding:22px 28px;min-width:min(380px,88vw);text-align:center"><div style="font:800 13px var(--font-d,system-ui);letter-spacing:.12em;color:#e8c35a">${R.D.name.toUpperCase()}</div><div style="font:900 44px var(--font-d,system-ui);margin:6px 0">${Math.round(grade * 100)}%</div><div style="font:700 17px var(--font-d,system-ui)">${word}</div><div style="margin:8px 0;font-size:13px;color:#c8d2c8">${detail}</div><div style="font-size:13px;min-height:18px">${rtext}</div><button id="ftDone" style="margin-top:14px;pointer-events:auto;cursor:pointer;font:800 14px var(--font-d,system-ui);letter-spacing:.06em;text-transform:uppercase;padding:11px 20px;border-radius:10px;border:1px solid rgba(232,195,90,.7);background:linear-gradient(90deg,#e8c35a,#d9a93a);color:#1a1405">Back to the farm <kbd style="opacity:.6">Enter</kbd></button></div>`;
    el.querySelector("#ftDone").onclick = () => finishRun();
  }
  function finishRun() { if (!R || !R.result) return; stop(); }
  function abort(quiet) { if (!R) return; stop(quiet); if (!quiet) F.toast("Drill ended — nothing gained", "info", 2); }
  function stop() {
    if (!R) return; const r = R; R = null; try { F.scene.remove(r.mesh); disposeHorse(r.mesh); } catch (e) {}
    if (r.g) r.g.visible = true; if (r.ledWas) FARMCARE.freeze(false);
    if (hudEl) { hudEl.hidden = true; hudEl.innerHTML = ""; } F.hud.querySelector("#farmInfo").style.visibility = ""; F.hideFig(false); F.cineCam.clear(); F.setBusy(false);
    try { for (const k in F.keys) F.keys[k] = false; } catch (e) {}
    if (r.drill === "gate") { F.P.x = POINTS[0].x; F.P.z = POINTS[0].z; } else { F.P.x = POINTS[1].x; F.P.z = POINTS[1].z; }
    F.P.y = F.heightAt(F.P.x, F.P.z); if (r.ledWas && r.g) { const g = r.g; g.position.set(F.P.x + 1.2, F.heightAt(F.P.x + 1.2, F.P.z), F.P.z); }
    F.refreshObjective();
  }
  function hud() {
    const { race, p, D } = R, q = id => hudEl.querySelector(id); if (!R.el.ok) { R.el.ok = true; q("#ftName").textContent = D.name.toUpperCase(); q("#ftTip").textContent = D.tip; }
    q("#ftEff").style.width = (R.inp.effort * 100).toFixed(0) + "%"; q("#ftAct").style.width = (p.eAct * 100).toFixed(0) + "%"; q("#ftEffT").textContent = Math.round(R.inp.effort * 100) + "%"; q("#ftSta").style.width = clamp(p.S, 0, 100) + "%";
    q("#ftDist").textContent = Math.max(0, Math.round(race.dist - p.progress)) + " m to go";
    const S = race.st, inSt = race.state === "load" || race.state === "count" || (race.state === "running" && !S.launched), stride = race.state === "running" && S.launched && p.strideWin && p.strideWin(), rhy = race.state === "running" && p.started && race.dist - p.progress <= RHYTHM_AT, pin = q("#ftPin").style, zn = q("#ftZone").style, lab = q("#ftMLab"), mt = q("#ftMT"), msg = q("#ftMsg");
    let m = "";
    if (R.drill === "gate" && inSt) { const go = S.open && !S.launched; pin.left = ((0.5 + S.poise / 2) * 100).toFixed(1) + "%"; zn.left = ((0.5 - S.zone / 2) * 100).toFixed(1) + "%"; zn.width = (S.zone * 100).toFixed(1) + "%"; lab.textContent = "Balance"; mt.textContent = "ready " + Math.round(S.R * 100) + "%"; m = go ? "GO!  SPACE" : race.state === "count" ? "Wait for the gates…" : "Balance your horse  W / S"; msg.style.color = go ? "#ffd54a" : "#f2efe6"; }
    else if (stride) { const ph = ((p.phase % 1) + 1) % 1, u = (ph + 0.5) % 1, half = STRIDE_W * (1 - STRIDE_OK); pin.left = (u * 100).toFixed(1) + "%"; zn.left = ((0.6 - half) * 100).toFixed(1) + "%"; zn.width = (2 * half * 100).toFixed(1) + "%"; lab.textContent = "Stride"; mt.textContent = "push " + Math.min(4, R.kicks.length) + "/4"; m = "PUSH — SPACE in the green"; msg.style.color = "#5fe08a"; }
    else if (rhy) { pin.left = (p.rhythmPin() * 100).toFixed(1) + "%"; zn.left = "35%"; zn.width = "30%"; lab.textContent = "Rhythm"; mt.textContent = (p.streak > 1 ? "×" + p.streak + "  " : "") + Math.round(p.mom * 100) + "%"; m = p.lungeT != null ? "LUNGE!" : p.ttl() <= LUNGE_TTL ? "LUNGE — SPACE!" : ""; msg.style.color = "#ffd54a"; }
    else if (R.drill === "settle") { const e = p.eAct, cf = p.comfort(), good = e <= cf + 0.07 && e >= cf - 0.25; pin.left = clamp(e * 100, 0, 100) + "%"; zn.left = clamp((cf - 0.25) * 100, 0, 100) + "%"; zn.width = clamp(0.32 * 100, 0, 100) + "%"; lab.textContent = "Comfort"; mt.textContent = good ? "travelling well" : e > cf + 0.07 ? "too hard" : "too easy"; m = ""; }
    else { pin.left = "0%"; zn.width = "0%"; lab.textContent = ""; mt.textContent = ""; }
    if (R.fbT > 0) m = R.fb; msg.textContent = R.result ? "" : m;
  }
  function camera(dt) {
    const v = R.vis, c = F.cam, sp = R.p.v || 0; const bx = R.mesh.position.x - v.hx * (7.5 + sp * 0.12) - v.hz * 0.0, bz = R.mesh.position.z - v.hz * (7.5 + sp * 0.12);
    const pre = R.drill === "gate" && !R.p.started, side = 1.4; let px = bx + v.hz * side * -1, pz = bz + v.hx * side, py = F.heightAt(px, pz) + 2.5 + sp * 0.03;
    if (pre) { px = R.mesh.position.x + 2.6; pz = R.mesh.position.z - 7.0; py = F.heightAt(px, pz) + 2.2; }
    if (!R.camInit) { R.camInit = true; R.camP.set(px, py, pz); R.camL.set(R.mesh.position.x, 1.5, R.mesh.position.z); }
    const k = Math.min(1, dt * 5); R.camP.x += (px - R.camP.x) * k; R.camP.y += (py - R.camP.y) * k; R.camP.z += (pz - R.camP.z) * k;
    R.camL.x += (R.mesh.position.x + v.hx * 3.5 - R.camL.x) * Math.min(1, dt * 6); R.camL.y = 1.5; R.camL.z += (R.mesh.position.z + v.hz * 3.5 - R.camL.z) * Math.min(1, dt * 6);
    c.position.copy(R.camP); c.lookAt(R.camL); const fov = 54 + clamp(sp / 20, 0, 1) * 8; if (Math.abs(c.fov - fov) > 0.05) { c.fov = fov; c.updateProjectionMatrix(); }
    F.sunFollow(R.mesh.position.x, R.mesh.position.z);
  }
  return { init, enter, leave, dispose, points, interact, key, frame, abort, DRILLS, POINTS, ovalAt, refTime, get on() { return !!R; }, get menuOpen() { return !!M; }, get state() { return R; }, get menu() { return M; } };
})();
