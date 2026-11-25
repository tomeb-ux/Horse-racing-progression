'use strict';
/* =====================================================================
   FINAL FURLONG — THE FARM (scene lifecycle, walking, cameras, interaction)
   The world is built by farm-ground.js / farm-build.js / farm-world.js (an Australian thoroughbred training property); the farmhouse
   interior by farm-house.js; the character by farm-people.js; the calendar / wardrobe screens by farm-ui.js; the float departure by
   farm-trip.js. This file is what makes it a scene of the game:
   • Its own THREE.Scene and camera drawn by the shared renderer (the STABLE3D pattern). The race scene is not drawn or updated while
     the farm is shown, and the farm is not touched during a race.
   • Two uses of the same property. MENU SHOWCASE: it is the background of the main menu (a slow camera drift over the courtyard, your real
     horses in their boxes, the Quick Race horse on show); no input is taken. WALKING: Career Mode lands you here — walk the property,
     go inside the farmhouse, use the race-calendar board, book a race, load the horse and drive off to it.
   • Input (walking only): W A S D / arrows move, Shift runs, the mouse (drag, or click to capture it) or ← → looks, V swaps between first
     and third person, E interacts, Esc pauses. The listeners run in the capture phase and swallow every plain key while the farm is active,
     so no farm key can reach the riding controls.
   • enter(): builds the static world once (kept afterwards), stands your horses in their boxes, attaches the listeners. leave(): removes
     them and disposes everything per-visit; dispose() frees the whole property (low-memory mode, a rename).
   ===================================================================== */
const FARM = (() => {
  let built = false, active = false, showcase = false, hud = null, prompt = null, title = null, wxEl = null, objEl = null, cross = null, fadeEl = null, pauseEl = null, panelEl = null, skipEl = null, hintEl = null;
  let fscene = null, fcam = null, world = null, sunLight = null, hemi = null, builtName = "";
  let iscene = null, iworld = null;                                  // the farmhouse interior (built the first time you go in)
  const own = { geo: [], mat: [], tex: [] };
  let horses = [], plaques = [], fig = null, showHorse = null, showDef = null;
  const P = { x: 0, y: 0, z: 4.5, face: Math.PI, speed: 0, moving: false };
  const CAM = { yaw: 0, pitch: -0.22, dist: 4.6, cur: 4.6 };
  const VIEW = { on: false };
  let resume = null, place = "out", person = 3, paused = false, panel = null, trans = null, trip = null, wantLock = false, ownUnlock = false;
  const fk = {};                                                     // the farm's own key map — never shared with the riding controls
  let listeners = [], dragging = null, near = null, t = 0, shadowOn = false, camReady = false;
  let busy = false, guide = null, guideKey = "", guideT = 0, guideFrom = null, hideFigure = false, departT = 0, departB = null, lastStage = "", syncT = 0, stageT = 0, turnRate = 0, lastFace = 0;
  const CINE = { on: false, init: false, tp: new THREE.Vector3(), tl: new THREE.Vector3(), cp: new THREE.Vector3(), cl: new THREE.Vector3(), fov: 56, k: 6 };
  const WALK = { x: 110, z: 80 }, PR = 0.45;                         // walkable half-extents, the walker's radius
  const EYE = 1.62, FOV = { 1: 72, 3: 58 }, clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const hasCareer = () => { try { return typeof CAREER !== "undefined" && CAREER.data && CAREER.data.horses && CAREER.data.horses.length > 0; } catch (e) { return false; } };
  function stableName() { try { return (CAREER.data && CAREER.data.stable) || "Southern Cross Stable"; } catch (e) { return "Southern Cross Stable"; } }
  function appearance() { try { const d = CAREER.data; if (d && d.player) return d.player; } catch (e) {} return FARMPEOPLE.DEFAULT(); }
  const cur = () => (place === "in" ? iworld : world);

  // ---------------------------------------------------------------- building (once)
  function build() {
    if (built) return; built = true; builtName = stableName();
    fscene = new THREE.Scene(); fscene.background = new THREE.Color(0xcfdce6);
    fcam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.12, 900);
    world = FARMGROUND.assemble(fscene, { stableName: builtName });
    fscene.environment = GFX.envMap || null;
    hemi = new THREE.HemisphereLight(0xdde8f4, 0x726a4a, 0.34); fscene.add(hemi);
    sunLight = new THREE.DirectionalLight(0xfff1dc, 1.75); sunLight.castShadow = true; sunLight.shadow.mapSize.set(2048, 2048); sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.04;
    Object.assign(sunLight.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 260 }); fscene.add(sunLight, sunLight.target);
    applyAtmosphere(true);
    fig = FARMPEOPLE.make(appearance()); fig.root.visible = false; fscene.add(fig.root); fig.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    buildHud();
    FARMCARE.init(ctx); FARMLOOP.init(ctx); FARMACTORS.init(ctx); FARMDAY.init(ctx); FARMTRAIN.init(ctx); FARMLIFE.init(ctx); guide = FARMNAV.guide(fscene, world.heightAt);
  }
  function ensureHouse() {
    if (iworld) return;
    iworld = FARMHOUSE.build(); iscene = iworld.scene;
    iworld.points.push({ id: "door", x: iworld.bounds.x1 - 0.2, z: 0, r: 1.3, text: "E — Go outside" });
    iworld.points.push({ id: "rest", x: 1.3, z: 2.5, r: 2.1, text: "E — Rest until tomorrow (advance one day)" });
  }

  const BTN = "pointer-events:auto;cursor:pointer;font:700 14px var(--font-d,system-ui);letter-spacing:.06em;text-transform:uppercase;padding:12px 18px;border-radius:10px;border:1px solid rgba(232,195,90,.6);background:rgba(18,28,22,.92);color:#f2efe6";
  function buildHud() {
    hud = document.createElement("div"); hud.id = "farmScreen"; hud.className = "screen"; hud.hidden = true; hud.style.cssText = "pointer-events:none;background:none;padding:0";
    hud.innerHTML = `<div id="farmInfo" style="position:absolute;left:max(14px,env(safe-area-inset-left,0px));top:max(14px,env(safe-area-inset-top,0px));background:rgba(9,14,11,.7);border:1px solid var(--panel-line,#2a3a30);border-radius:10px;padding:10px 14px;font-size:12.5px;line-height:1.5;color:#f2efe6;max-width:min(440px,calc(100vw - 28px))">
        <b id="farmTitle" style="font-family:var(--font-d,system-ui);font-size:15px;letter-spacing:.05em"></b>
        <div id="farmWx" style="color:#aebdb1;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase"></div>
        <div id="farmObj" style="color:#e8c35a;font-weight:600;margin-top:2px"></div>
        <div id="farmHint" style="color:#c8d2c8;margin-top:2px">W A S D walk · Shift run · mouse look · V first / third person · E interact · M map · Esc pause</div></div>
      <div id="farmCross" hidden style="position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:rgba(255,255,255,.75);box-shadow:0 0 0 1px rgba(0,0,0,.45)"></div>
      <div id="farmPrompt" hidden style="position:absolute;left:50%;bottom:13%;transform:translateX(-50%);background:rgba(9,14,11,.86);border:1px solid rgba(232,195,90,.7);border-radius:12px;padding:12px 20px;font:700 18px var(--font-d,system-ui);color:#f2efe6;letter-spacing:.04em;text-align:center;max-width:90vw"></div>
      <div id="farmSkip" hidden style="position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));background:rgba(9,14,11,.75);border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:8px 14px;font:600 13px var(--font-b,system-ui);color:#f2efe6">Space — skip</div>
      <div id="farmPanel" hidden style="position:absolute;inset:0;pointer-events:auto;overflow:auto;background:rgba(5,9,7,.55);padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) 16px max(16px,env(safe-area-inset-left,0px))"></div>
      <div id="farmPause" hidden style="position:absolute;inset:0;pointer-events:auto;background:rgba(5,9,7,.62);display:flex;align-items:center;justify-content:center">
        <div style="background:rgba(14,22,18,.96);border:1px solid var(--panel-line,#2a3a30);border-radius:16px;padding:26px 30px;min-width:min(340px,86vw);display:flex;flex-direction:column;gap:10px;text-align:center">
          <div style="font:800 20px var(--font-d,system-ui);letter-spacing:.1em;color:#f2efe6;margin-bottom:4px">PAUSED</div>
          <button id="fpResume" style="${BTN};background:linear-gradient(90deg,#e8c35a,#d9a93a);color:#1a1405">Resume</button>
          <div id="fpClockBox" hidden style="display:flex;flex-direction:column;gap:8px">
            <button id="fpClock" style="${BTN}">Farm clock: Normal</button>
            <button id="fpSkipNext" style="${BTN}">Skip to the next activity</button>
            <button id="fpSkipEve" style="${BTN}">Skip to the evening</button></div>
          <button id="fpHub" style="${BTN}">Career: stable, training &amp; records</button>
          <button id="fpMenu" style="${BTN}">Main menu</button>
          <div style="font-size:11.5px;color:#a9b4a9;margin-top:4px">Your career saves automatically.</div></div></div>
      <div id="farmFade" style="position:absolute;inset:0;background:#000;opacity:0;pointer-events:none"></div>`;
    document.body.appendChild(hud); screens.farm = hud;
    const q = id => hud.querySelector(id);
    prompt = q("#farmPrompt"); title = q("#farmTitle"); wxEl = q("#farmWx"); objEl = q("#farmObj"); cross = q("#farmCross"); fadeEl = q("#farmFade"); pauseEl = q("#farmPause"); panelEl = q("#farmPanel"); skipEl = q("#farmSkip"); hintEl = q("#farmHint");
    q("#fpResume").onclick = () => setPaused(false);
    q("#fpClock").onclick = () => { const o = ["normal", "slow", "paused"], k = o[(o.indexOf(FARMACTORS.speed) + 1) % 3]; FARMACTORS.setSpeed(k); refreshClockBox(); };
    q("#fpSkipNext").onclick = () => { const w = FARMACTORS.skipNext(); setPaused(false); toast("Skipped ahead to " + CORE.fmtClock(FARMACTORS.hour()) + (w ? " · " + w : ""), "info", 2.2); };
    q("#fpSkipEve").onclick = () => { FARMACTORS.skipEvening(); setPaused(false); toast("It's evening: " + CORE.fmtClock(FARMACTORS.hour()), "info", 2.2); }; q("#fpHub").onclick = () => { setPaused(false); leaveToCareer(); }; q("#fpMenu").onclick = () => { setPaused(false); SCENES.enter("menu"); };
  }

  // ---------------------------------------------------------------- the horses: stalls and plaques, and the horse on show
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
  function hideRider(g) { const u = g.userData; if (!u.jk) return; u.jk.mesh.visible = false; u.jk.whip.visible = false; u.jk.irons.forEach(i => i.m.visible = false); u.jk.reins.forEach(r => r.m ? r.m.visible = false : r.visible = false); (u.tack || []).forEach(x => x.visible = false); }
  function mkHorse(def) { const g = buildHorse(def, 0); hideRider(g); g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; }
  // what stands in the boxes: your career horses; before you have a career, a few of the game's own horses (the main menu)
  function stallList() {
    let list = [];
    try { if (hasCareer() || (typeof CAREER !== "undefined" && CAREER.hasSave && CAREER.hasSave())) list = CAREER.farmStalls(); } catch (e) { list = []; }
    if (list.length) return list;
    if (showcase) list = ROSTER.slice(0, 5).map(d => ({ def: d, name: d.name, line2: d.role, line3: "Quick Race", line4: "" }));
    list.slots = 5; return list;
  }
  function stand() {
    const list = stallList();
    world.stalls.forEach((spot, i) => {
      const it = list[i] || null; plaque(it, spot, [it ? "" : "Vacant", list.slots != null && i >= list.slots ? "Win more races to unlock" : "Empty box — horse market"]);
      if (!it) return;
      const g = mkHorse(it.def); g.position.set(spot.x + (i % 2 ? 0.1 : -0.1), 0.15, spot.z + 0.55); g.rotation.y = -Math.PI / 2 + (i % 2 ? 0.1 : -0.08); g.userData.idleT = i * 1.7; g.userData.stallI = i; g.userData.hid = it.def && it.def._hid; fscene.add(g); horses.push(g);
    });
  }
  function unstand() {
    for (const g of horses) { fscene.remove(g); try { disposeHorse(g); } catch (e) {} }
    for (const m of plaques) { fscene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    horses = []; plaques = [];
  }
  const SHOW = { x: 4.4, z: -3.6 };
  // the Quick Race horse, turning slowly in the courtyard (main menu)
  function setShowHorse(def) {
    showDef = def; if (!built || !showcase) return;
    if (showHorse) { fscene.remove(showHorse); try { disposeHorse(showHorse); } catch (e) {} showHorse = null; }
    if (!def) return;
    showHorse = mkHorse(def); showHorse.position.set(SHOW.x, world.heightAt(SHOW.x, SHOW.z), SHOW.z); showHorse.rotation.y = 0.6; fscene.add(showHorse);
  }

  // ---------------------------------------------------------------- input (the farm's own; attached on enter, removed on leave)
  const MOVE = { w: 1, a: 1, s: 1, d: 1, shift: 1, arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1, e: 1, v: 1, k: 1, r: 1, m: 1 };
  const blocked = () => paused || !!panel || !!trans || !!trip || busy || FARMDRIVE.on || FARMTRAIN.on;
  function onKeyDown(e) {
    if (!active) return;
    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key)) return;            // browser shortcuts and the F-key diagnostics stay available
    const k = e.key.toLowerCase();
    if (e.target && /^(input|textarea|select)$/i.test(e.target.tagName)) { if (k === "escape") { e.stopImmediatePropagation(); e.preventDefault(); if (!e.repeat) escape(); } return; }
    e.stopImmediatePropagation(); if (k === " " || k in MOVE || k === "tab" || k === "escape") e.preventDefault();   // nothing reaches the riding controls
    if (FARMLOOP.active) { FARMLOOP.key(e); return; }                                                               // the wash / groom loop owns the keys
    if (k === "escape") { if (!e.repeat) escape(); return; }
    if (trip) { if (!e.repeat && (k === " " || k === "enter" || k === "e")) FARMTRIP.skip(); return; }
    if (FARMDRIVE.on) { fk[k] = true; if (k === "r" && !e.repeat) FARMDRIVE.reset(); return; }                                  // driving: the keys go to the vehicle
    if (FARMTRAIN.on || FARMTRAIN.menuOpen) { if (!e.repeat) FARMTRAIN.key(k, true, e); return; }   // a drill or its menu
    if (FARMCARE.menuOpen) { if (!e.repeat) FARMCARE.key(k); return; }
    if (k === "m" && !e.repeat) { if (panel === "map") closePanel(); else if (!blocked()) openPanel("map"); return; }
    if (blocked()) return;
    if (k === "k" && !e.repeat) { skipPrep(); return; }
    if (k === "e" && !e.repeat && fk.e !== true) { fk.e = true; interact(); return; }
    if (k === "v" && !e.repeat) { setPerson(person === 1 ? 3 : 1); return; }
    fk[k] = true;
  }
  function onKeyUp(e) { if (!active) return; const k = e.key.toLowerCase(); fk[k] = false; if (FARMLOOP.active) { FARMLOOP.keyup(e); return; } if (FARMTRAIN.on) FARMTRAIN.key(k, false, e); if (!(e.ctrlKey || e.metaKey) && !(e.target && /^(input|textarea|select)$/i.test(e.target.tagName))) e.stopImmediatePropagation(); }
  function onBlur() { for (const k in fk) fk[k] = false; dragging = null; try { FARMLOOP.blur(); } catch (e) {} }
  function look(dx, dy, k) { const s = (settings.lookSens || 1) * k; CAM.yaw += dx * s; CAM.pitch = clampN(CAM.pitch - dy * s, person === 1 ? -1.35 : -1.1, person === 1 ? 1.35 : 0.5); VIEW.on = false; }
  function onPointerDown(e) { if (!active || e.button !== 0 || blocked()) return; dragging = { x: e.clientX, y: e.clientY, moved: 0 }; }
  function onPointerMove(e) {
    if (!active || blocked()) return;
    if (document.pointerLockElement === renderer.domElement) { look(e.movementX || 0, e.movementY || 0, 0.0028); return; }
    if (dragging) { const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y; dragging.x = e.clientX; dragging.y = e.clientY; dragging.moved += Math.abs(dx) + Math.abs(dy); look(dx, dy, 0.0055); }
  }
  function onPointerUp() { if (dragging && dragging.moved < 4 && active && !blocked() && settings.lockMouse !== false) tryLock(); dragging = null; }
  function onWheel(e) { if (!active || blocked() || person === 1 || place === "in" && false) return; CAM.dist = clampN(CAM.dist + Math.sign(e.deltaY) * 0.5, 2.4, 9); }
  function onLockChange() {
    const locked = document.pointerLockElement === renderer.domElement;
    if (!locked && wantLock) { wantLock = false; if (!ownUnlock && active && !blocked()) setPaused(true); }     // Esc released the mouse: it opens the pause menu
    ownUnlock = false; if (locked) wantLock = true;
  }
  function tryLock() { try { const r = renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  function unlock() { if (document.pointerLockElement === renderer.domElement) { ownUnlock = true; try { document.exitPointerLock(); } catch (e) {} } wantLock = false; }
  function onResize() { if (fcam) { fcam.aspect = innerWidth / innerHeight; fcam.updateProjectionMatrix(); } }
  function bind() {
    const c = renderer.domElement;
    listeners = [[window, "keydown", onKeyDown, true], [window, "keyup", onKeyUp, true], [window, "blur", onBlur], [c, "pointerdown", onPointerDown], [window, "pointermove", onPointerMove], [window, "pointerup", onPointerUp], [window, "resize", onResize], [c, "wheel", onWheel], [document, "pointerlockchange", onLockChange]];
    for (const [t2, ev, fn, cap] of listeners) t2.addEventListener(ev, fn, !!cap);
  }
  function unbind() { for (const [t2, ev, fn, cap] of listeners) t2.removeEventListener(ev, fn, !!cap); listeners = []; for (const k in fk) delete fk[k]; dragging = null; unlock(); }
  function escape() {
    if (trip) return FARMTRIP.skip();
    if (FARMTRAIN.on || FARMTRAIN.menuOpen) return FARMTRAIN.key("escape", true);
    if (FARMCARE.menuOpen && !FARMCARE.busy) return FARMCARE.key("escape");
    if (panel) return closePanel();
    setPaused(!paused);
  }
  function refreshClockBox() { try { const box = hud.querySelector("#fpClockBox"), on = FARMACTORS.live(); if (box) box.hidden = !on; const b = hud.querySelector("#fpClock"); if (b) b.textContent = "Farm clock: " + FARMACTORS.LABEL[FARMACTORS.speed] + (on ? " · " + CORE.fmtClock(FARMACTORS.hour()) : ""); } catch (e) {} }
  function setPaused(v) { paused = !!v; if (pauseEl) pauseEl.hidden = !paused; if (paused) refreshClockBox(); if (paused) { unlock(); for (const k in fk) fk[k] = false; } }
  function setPerson(n) {
    if ((n === 1 ? 1 : 3) === person) return;
    person = n === 1 ? 1 : 3; settings.person = person; store.set("person", person); CAM.pitch = person === 1 ? Math.max(-0.4, CAM.pitch + 0.22) : Math.min(0.2, CAM.pitch - 0.22);   // eye level straight ahead / a little above the shoulder looking down
    if (cross) cross.hidden = person !== 1 || !active || blocked(); camReady = false; VIEW.on = false;
  }

  // ---------------------------------------------------------------- panels (calendar / wardrobe, drawn by farm-ui.js), fade and transitions
  const ctx = {                                                      // what farm-ui.js and farm-trip.js are given
    get panelEl() { return panelEl; }, get hud() { return hud; }, get scene() { return fscene; }, get world() { return world; }, get cam() { return fcam; }, get fig() { return fig; }, get P() { return P; }, get CAM() { return CAM; },
    get horses() { return horses; }, get sunLight() { return sunLight; }, sunFollow: (x, z) => sunFollow(x, z), departGate: go => departGate(go), mkHorse, fade: a => { if (fadeEl) fadeEl.style.opacity = a; },
    closePanel: () => closePanel(), refreshBoard: () => refreshBoard(), refreshFigure: () => refreshFigure(), setPrompt: txt => { prompt.hidden = !txt; prompt.textContent = txt || ""; }, skipHint: on => { skipEl.hidden = !on; },
    endTrip: () => { trip = null; if (hud) hud.querySelector("#farmInfo").style.visibility = ""; }, setPlace: v => { place = v; }, objective: () => objective(), heightAt: (x, z) => world.heightAt(x, z),
    keys: fk, resolve: (q, r, o) => resolve(q, r, o), toast: (m, k, d) => { try { toast(m, k, d); } catch (e) {} }, setBusy: v => { busy = !!v; if (v) { for (const k in fk) if (!(FARMDRIVE.on)) fk[k] = false; prompt.hidden = true; near = null; } }, faceCam: yaw => { CAM.yaw = yaw; camReady = false; },
    cineCam: { set(pos, look, fov, k) { CINE.tp.set(pos[0], pos[1], pos[2]); CINE.tl.set(look[0], look[1], look[2]); CINE.fov = fov || 56; CINE.k = k || 6; CINE.on = true; if (!CINE.init) { CINE.init = true; CINE.cp.copy(fcam.position); const d = new THREE.Vector3(); fcam.getWorldDirection(d); CINE.cl.copy(fcam.position).addScaledVector(d, 10); } }, clear() { CINE.on = false; CINE.init = false; camReady = false; } },
    blockedAt: (x, y, z) => blockedAt(x, y, z), blocked: () => blocked(), applyAtmosphere: f => applyAtmosphere(f), updateWx: () => updateWx(), resolveFn: null, place: () => place, quickGo: () => { if (place === "in") exitHouse(() => FARMDAY.quickLeave()); else FARMDAY.quickLeave(); }, refreshObjective: () => { try { FARMDAY.changedQuiet(); } catch (e) {} objective(); }, hideFig: v => { hideFigure = !!v; if (v && fig) fig.root.visible = false; }, depart: b => depart(b), quickTrip: b => startTrip(b), get settings() { return settings; },
  };
  let openArg = null;
  function openPanel(name, arg) {
    if (panel || trip) return; openArg = arg || null; unlock(); panel = name; panelEl.hidden = false; panelEl.innerHTML = ""; for (const k in fk) fk[k] = false; if (cross) cross.hidden = true; prompt.hidden = true; near = null;
    hud.querySelector("#farmInfo").style.visibility = "hidden";
    if (name === "calendar") FARMUI.openCalendar(ctx); else if (name === "wardrobe") FARMUI.openWardrobe(ctx); else if (name === "depart") FARMUI.openDeparture(ctx, openArg.sum, openArg.go); else if (name === "map") FARMUI.openMap(ctx);
  }
  function closePanel() { if (!panel) return; panel = null; hud.querySelector("#farmInfo").style.visibility = ""; panelEl.hidden = true; panelEl.innerHTML = ""; if (typeof FARMUI !== "undefined" && FARMUI.onClose) FARMUI.onClose(); refreshBoard(); objective(); if (cross) cross.hidden = person !== 1; }
  function refreshBoard() { if (iworld) { try { iworld.refresh(CAREER.boardInfo(), (CAREER.data && CAREER.data.trophies || []).length); } catch (e) {} } }
  function refreshFigure() { if (fig) fig.apply(appearance()); }
  function objective() {
    if (!objEl) return; let txt = "", sub = ""; try { FARMDAY.changedQuiet(); } catch (e) {}
    try {
      if (hasCareer()) {
        const b = CAREER.booking();
        if (b) { const o = FARMDAY.objective(); txt = o.main || `Booked: ${b.name} — take ${b.horse} to the horse float`; sub = o.step ? `Race day · step ${o.step} of ${o.of} · ${b.name}` : `Booked: ${b.name}`; if (o.skippable) sub += " · K to skip the routine and go now"; }
        else txt = "Check the race calendar in the farmhouse to book your next race";
      } else txt = "Create your first horse from the Career hub";
    } catch (e) { console.error(e); }
    objEl.innerHTML = (sub ? `<div style="font-weight:600;font-size:11.5px;color:#c8d2c8;letter-spacing:.03em">${sub}</div>` : "") + `<div>${txt.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`;
  }
  // a fade to black and back, with `mid` run when it is fully dark (swapping the place); progress is driven by frame time
  function startTrans(dur, mid, done) { if (trans || trip) return false; trans = { t: 0, dur: dur || 0.4, mid, done, swapped: false }; return true; }
  function stepTrans(dt) {
    if (!trans) return; trans.t += dt; const h = trans.dur / 2;
    if (trans.t < h) fadeEl.style.opacity = String(trans.t / h);
    else { if (!trans.swapped) { trans.swapped = true; fadeEl.style.opacity = "1"; if (trans.mid) trans.mid(); }
      const u = (trans.t - h) / h; fadeEl.style.opacity = String(Math.max(0, 1 - u)); if (u >= 1) { const d = trans.done; trans = null; fadeEl.style.opacity = "0"; if (d) d(); } }
  }

  // ---------------------------------------------------------------- interaction points
  function pointText(p) {
    if (p.id === "travel") {
      try { const b = hasCareer() ? CAREER.booking() : null; if (b) return `E — Quick departure for ${b.name} (skips the preparation; or lead ${b.horse} here)`; } catch (e) {}
      return "E — Horse float (book a race on the farmhouse calendar first)";
    }
    return p.text;
  }
  function allPoints() { const w = cur(); if (!w) return []; if (place === "in") return w.points; return w.points.concat(FARMCARE.points(), FARMDAY.points(), FARMLIFE.points(), typeof FARMTRAIN !== "undefined" ? FARMTRAIN.points() : []); }
  function nearest() { const w = cur(); if (!w) return null; let best = null, bd = 1e9; for (const p of allPoints()) { if (!p.text && p.id !== "stall" && p.id !== "vacant") continue; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d <= p.r && d < bd) { best = p; bd = d; } } return best; }
  function interact() {
    const p = nearest(); if (!p) return false;
    if (p.id === "office") { enterHouse(); return true; }
    if (p.id === "door") { exitHouse(); return true; }
    if (p.id === "board") { openPanel("calendar"); return true; }
    if (p.id === "mirror") { openPanel("wardrobe"); return true; }
    if (p.id === "rest") return restDay();
    if (p.id === "ledger" || p.id === "cabinet") {                     // career screens: you come back to exactly where you stood
      if (typeof CAREER === "undefined" || !CAREER.openScreen) return false;
      resume = { place, x: P.x, z: P.z, face: P.face, yaw: CAM.yaw, pitch: CAM.pitch }; CAREER.openScreen(p.id === "ledger" ? "office" : "trophies"); return true;
    }
    if (p.id === "travel") return floatInteract();
    if (p.id === "stall") return FARMCARE.openMenu(p.i);
    if (FARMLIFE.interact(p)) return true;
    if (p.id === "vacant") { try { return CAREER.createForFarm(); } catch (e) { console.error(e); return false; } }
    if (p.id === "ramp" || p.id === "cab") return FARMDAY.interact(p);
    if (typeof FARMTRAIN !== "undefined" && FARMTRAIN.interact(p)) return true;
    return false;
  }
  function floatInteract() {
    let b = null; try { b = hasCareer() ? CAREER.booking() : null; } catch (e) {}
    if (!b) { try { toast("Book a race on the farmhouse calendar first", "info", 2.6); } catch (e) {} return true; }
    return FARMDAY.quickLeave();
  }
  // the quick departure: the Phase 5 load-up and drive-off cutscene (the owner's shortcut around the routine)
  function startTrip(b) {
    trip = true; hud.querySelector("#farmInfo").style.visibility = "hidden"; unlock(); prompt.hidden = true; near = null; if (cross) cross.hidden = true;
    FARMTRIP.start(ctx, b, () => {
      let r; try { r = CAREER.startBooked(); } catch (e) { console.error(e); r = { ok: false }; }
      if (!r || !r.ok) { FARMTRIP.abort(); try { toast("That race couldn't be started — check the calendar", "warn", 3); } catch (e) {} }
    });
    return true;
  }
  // leaving for the races: the preparation summary, then the atomic save, then the horse travels (Phase 13). `go` runs only after the save is confirmed.
  function departGate(go) {
    let sum = null; try { sum = hasCareer() ? CAREER.travel.summary() : null; } catch (e) { console.error(e); }
    if (!sum) { go(); return true; } openPanel("depart", { sum, go }); return true;
  }
  function skipPrep() { let b = null; try { b = hasCareer() ? CAREER.booking() : null; } catch (e) {} if (!b || place !== "out" || busy) return false; return FARMDAY.quickLeave(); }
  // the drive ended at the gate: the booking is consumed once and the race starts through the normal entry
  function depart(b) {
    hud.querySelector("#farmInfo").style.visibility = "hidden"; prompt.hidden = false; prompt.textContent = "Travelling to " + (b.venue || "the races") + "…"; fadeEl.style.opacity = "1"; departB = b; departT = 0.12;
  }
  function runDepart() {
    const b = departB; departB = null; let r; try { r = CAREER.startBooked(); } catch (e) { console.error(e); r = { ok: false }; }
    if (!r || !r.ok) { FARMDRIVE.stop(); fadeEl.style.opacity = "0"; prompt.hidden = true; hud.querySelector("#farmInfo").style.visibility = ""; FARMDAY.reset(); try { toast("That race couldn't be started — check the calendar", "warn", 3); } catch (e) {} }
  }
  // "Rest a day": one calendar day through the career core (horses recover; daily care and drills reset; never past a race that is today)
  function restDay() {
    let r; try { r = CAREER.care.rest(); } catch (e) { console.error(e); r = { ok: false }; }
    if (!r.ok) { const m = r.reason === "booked-today" ? "Your race is today — head out to the float" : r.reason === "round-today" ? "A championship round is on today — enter it or skip it from the calendar first" : "Can't rest right now"; try { toast(m, "info", 3); } catch (e) {} return true; }
    const bl = r.bills || [], paid = bl.reduce((t, x) => t + x.paid, 0), spon = bl.reduce((t, x) => t + x.sponsor, 0), owed = bl.reduce((t, x) => t + x.owed, 0);
    startTrans(1.1, () => { refreshBoard(); if (fadeEl) fadeEl.style.opacity = "1"; }, () => { try { toast("A good night's rest — it is now " + CAREER.care.today + (bl.length ? " · weekly bill −$" + paid.toLocaleString() + (spon ? ", sponsor +$" + spon.toLocaleString() : "") + (owed ? " ($" + owed.toLocaleString() + " owed to the club)" : "") : ""), "good", 4); } catch (e) {} objective(); });
    return true;
  }
  function enterHouse() {
    if (FARMCARE.led) { const g = FARMCARE.ledMesh(); FARMCARE.release(); try { toast("The horse was put back in its box before you went inside", "info", 2.6); } catch (e) {} FARMDAY.changed(); }
    ensureHouse();
    startTrans(0.5, () => {
      place = "in"; iscene.add(fig.root); const s = iworld.spawn; P.x = s.x; P.z = s.z; P.y = 0; P.face = s.yaw; CAM.yaw = s.yaw; CAM.pitch = person === 1 ? 0 : -0.18; camReady = false; refreshBoard(); sunFollow(0, 0);
      title.textContent = (builtName + " · farmhouse").toUpperCase(); prompt.hidden = true; near = null;
    });
    return true;
  }
  function exitHouse(then) {
    startTrans(0.5, () => {
      place = "out"; fscene.add(fig.root); const o = world.points.find(p => p.id === "office"); P.x = o.x + 0.4; P.z = o.z; P.y = world.heightAt(P.x, P.z); P.face = Math.PI / 2; CAM.yaw = Math.PI / 2; CAM.pitch = person === 1 ? 0 : -0.2; camReady = false;
      title.textContent = builtName.toUpperCase(); prompt.hidden = true; near = null; sunFollow(P.x, P.z);
    }, then);
    return true;
  }
  function leaveToCareer() { SCENES.enter("career"); }

  // ---------------------------------------------------------------- walking: circle against boxes and fence capsules, boundary
  // push a circle {x, z} of radius R out of every building, prop, rail and gate (and keep it in the room / on the property unless o.noBounds)
  function resolve(q, R, o) {
    const w = cur(), inside = place === "in";
    for (let pass = 0; pass < 2; pass++) {
      for (const c of w.colliders) {
        if (o && o.skip && o.skip.has(c)) continue;
        if (q.x < c.x0 - R || q.x > c.x1 + R || q.z < c.z0 - R || q.z > c.z1 + R) continue;
        const cx = Math.max(c.x0, Math.min(q.x, c.x1)), cz = Math.max(c.z0, Math.min(q.z, c.z1)), dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
        if (d < R) { if (d > 1e-4) { q.x = cx + dx / d * R; q.z = cz + dz / d * R; } else { const l = q.x - c.x0, r = c.x1 - q.x, u = q.z - c.z0, dn = c.z1 - q.z, m = Math.min(l, r, u, dn); if (m === l) q.x = c.x0 - R; else if (m === r) q.x = c.x1 + R; else if (m === u) q.z = c.z0 - R; else q.z = c.z1 + R; } }
      }
      if (!inside) for (const s of w.segs) {
        const lo = Math.min(s.x0, s.x1) - s.r - R, hi = Math.max(s.x0, s.x1) + s.r + R, zl = Math.min(s.z0, s.z1) - s.r - R, zh = Math.max(s.z0, s.z1) + s.r + R; if (q.x < lo || q.x > hi || q.z < zl || q.z > zh) continue;
        const dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz || 1e-6, tt = Math.max(0, Math.min(1, ((q.x - s.x0) * dx + (q.z - s.z0) * dz) / l2)), qx = s.x0 + dx * tt, qz = s.z0 + dz * tt, ex = q.x - qx, ez = q.z - qz, d = Math.hypot(ex, ez), RR = s.r + R;
        if (d < RR) { if (d > 1e-4) { q.x = qx + ex / d * RR; q.z = qz + ez / d * RR; } else { q.x += -dz / Math.sqrt(l2) * RR; q.z += dx / Math.sqrt(l2) * RR; } }
      }
    }
    if (o && o.noBounds) return q;
    if (inside) { const b = iworld.bounds; q.x = Math.max(b.x0, Math.min(b.x1, q.x)); q.z = Math.max(b.z0, Math.min(b.z1, q.z)); }
    else { q.x = Math.max(-WALK.x, Math.min(WALK.x, q.x)); q.z = Math.max(-WALK.z, Math.min(WALK.z, q.z)); }
    return q;
  }
  function collide() { resolve(P, PR); }

  // ---------------------------------------------------------------- the sun and its shadow follow the walker (snapped to texels: no shimmer)
  // ---------------------------------------------------------------- time of day and weather (Phase 12)
  // The farm's own look is "a bright late morning" (mid-morning, clear); every other time of day and kind of weather is that look scaled by the ratio of the atmosphere's numbers
  // (ATMO), so the original is exactly preserved and the farm shares one description of the day with the race. Which day-part and weather it is: the booked race's own, on race day;
  // otherwise a seeded draw for the date (the same every time you look).
  const FARM_BASE = { hor: [0.74, 0.83, 0.90], mid: [0.50, 0.69, 0.89], top: [0.25, 0.46, 0.79], expo: 0.82, fogNear: 80, fogFar: 300 };
  let farmP = null, farmDay = -1, farmRain = null, REF = null;
  let atmoOverride = null;
  function farmAtmo() {
    if (atmoOverride) return atmoOverride;
    try {
      const C = CAREER && CAREER.data; if (!C || typeof ATMO === "undefined") return null;
      const bk = C.booking && C.cal && C.cal.events.find(x => x.id === C.booking.eid);
      const wxk = ATMO.dayWeather(C.seed, C.day, CORE.parts(C.day).m);
      if (!(bk && bk.day === C.day) && typeof FARMACTORS !== "undefined" && FARMACTORS.live()) return ATMO.blend(FARMACTORS.hour(), wxk);          // Phase 17: the light follows the farm clock
      if (bk && bk.day === C.day && bk.tod) return ATMO.params(bk.tod, bk.forecast && bk.forecast.weather);
      return ATMO.params(ATMO.dayPart(C.seed, C.day), ATMO.dayWeather(C.seed, C.day, CORE.parts(C.day).m));
    } catch (e) { return null; }
  }
  function applyAtmosphere(force) {
    if (!world || !world.skyU || typeof ATMO === "undefined") return;
    REF = REF || ATMO.params("mid_morning", "clear"); const p = farmAtmo() || REF; if (!force && farmP && !p.live && farmP.tod === p.tod && farmP.wx === p.wx) return; farmP = p;
    const r3 = (base, a, b) => base.map((v, i) => Math.max(0, Math.min(1.6, v * (a[i] / Math.max(0.001, b[i]))))), U = world.skyU;
    U.uHor.value.fromArray(r3(FARM_BASE.hor, p.sky.hor, REF.sky.hor)); U.uMid.value.fromArray(r3(FARM_BASE.mid, p.sky.mid, REF.sky.mid)); U.uTop.value.fromArray(r3(FARM_BASE.top, p.sky.zen, REF.sky.zen));
    U.sunCol.value.fromArray(p.tod === "evening" ? [0.05, 0.06, 0.1] : p.sunColor); U.uGlow.value = p.glow; U.uStars.value = p.tod === "evening" ? 1 : p.tod === "dusk" ? 0.35 * (1 - p.cloud) : 0;
    const dl = -45.5 * Math.PI / 180, c = Math.cos(dl), s = Math.sin(dl), d = p.lightDir; world.sunDir.set(d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c).normalize();
    const ri = Math.max(0.05, REF.sunI); sunLight.color.setRGB(p.sunLight[0], p.sunLight[1], p.sunLight[2]); sunLight.intensity = 1.75 * p.lightI / ri;
    hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGround); hemi.intensity = 0.34 * p.hemiI / REF.hemiI;
    fscene.fog.color.setRGB(0.74 * p.fogColor[0] / REF.fogColor[0], 0.83 * p.fogColor[1] / REF.fogColor[1], 0.90 * p.fogColor[2] / REF.fogColor[2]).convertSRGBToLinear(); fscene.fog.near = FARM_BASE.fogNear * p.fogMul; fscene.fog.far = FARM_BASE.fogFar * p.fogMul;
    renderer.toneMappingExposure = FARM_BASE.expo * p.expo / REF.expo;
    try { fscene.environment = GFX.envFor(p); } catch (e) {}
    try { WEATHERFX.farmPuddles(fscene, world.heightAt, (p.wet || 0) > 0.3 || p.rain > 0.01); } catch (e) {}                          // Phase 22: puddles after rain
    if (!farmRain && p.rain > 0.01) { farmRain = GFX.createRain(); fscene.add(farmRain); } if (farmRain) farmRain.userData.set(p.rain);
    updateWx();
    if (sunLight && world) sunFollow(P.x, P.z);
  }
  function updateWx() {
    if (!wxEl || !farmP) return; const clk = typeof FARMACTORS !== "undefined" && farmP.live ? CORE.fmtClock(FARMACTORS.hour()) + " · " : "";
    wxEl.textContent = clk + (farmP.live ? "" : (CORE.TOD_LABEL[farmP.tod] || "") + " · ") + (CORE.WX_LABEL[farmP.wx] || "");
  }
  function sunFollow(cx, cz) {
    const d = world.sunDir, tx = Math.round(cx / 0.04) * 0.04, tz = Math.round(cz / 0.04) * 0.04;
    sunLight.target.position.set(tx, 0, tz); sunLight.position.set(tx + d.x * 120, Math.max(d.y, 0.14) * 120, tz + d.z * 120);
    const want = renderer.shadowMap.enabled && settings.shadows !== false; if (want !== shadowOn) { shadowOn = want; sunLight.castShadow = want; fscene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); }
  }
  const PRESETS = {
    courtyard: { pos: [6, 1.85, -1.5], look: [-1, 1.9, -22], fov: 62 }, stalls: { pos: [-3.5, 1.65, -15.5], look: [0, 1.35, -23.5], fov: 62 }, stalls2: { pos: [5, 1.7, -17.2], look: [3, 1.4, -24], fov: 55 }, verandah: { pos: [-2, 1.6, -20.2], look: [3, 1.3, -23.8], fov: 62 },
    farmhouse: { pos: [-24, 2.3, 12], look: [-47, 3.0, -1], fov: 55 }, house2: { pos: [-33, 1.8, -8], look: [-47, 2.2, 0], fov: 60 }, paddock: { pos: [47, 2.0, -15], look: [72, 1.0, -40], fov: 58 }, paddock2: { pos: [-10, 2.2, -36], look: [4, 1.0, -58], fov: 58 },
    training: { pos: [-72, 2.8, 24], look: [8, 1.0, 50], fov: 58 }, training2: { pos: [-30, 2.0, 18], look: [-40, 1.4, 30], fov: 62 }, overview: { pos: [38, 30, 56], look: [-6, 0, -12], fov: 60 }, float: { pos: [28, 2.4, 25], look: [40, 1.3, 14], fov: 58 },
    shed: { pos: [16, 2.2, -4], look: [32, 2, -24], fov: 58 }, gate: { pos: [86, 2.2, 14], look: [112, 1.6, 4], fov: 58 }, trough: { pos: [3, 1.6, 7.5], look: [10.5, 0.6, 4], fov: 60 },
    // the farmhouse interior (a view inside switches the walker's place to the room)
    room: { in: true, pos: [4.4, 1.75, 3.4], look: [-2.5, 1.2, -1.5], fov: 68 }, room2: { in: true, pos: [-4.4, 1.7, -3.4], look: [2.5, 1.2, 2.0], fov: 66 }, board: { in: true, pos: [0.6, 1.65, -1.2], look: [0, 1.7, -4], fov: 52 },
    desk: { in: true, pos: [-1.0, 1.6, -0.2], look: [-3.9, 0.9, -3.0], fov: 58 }, cabinet: { in: true, pos: [-1.6, 1.6, 2.2], look: [-4.7, 1.1, 0.8], fov: 56 }, sofa: { in: true, pos: [3.2, 1.6, -1.2], look: [-0.6, 0.7, 3.2], fov: 62 },
  };
  function view(name) {
    if (!built || !active) return false;
    if (!name) { VIEW.on = false; return true; }
    const v = typeof name === "string" ? PRESETS[name] : name; if (!v) return false;
    if (v.in && place !== "in") { ensureHouse(); place = "in"; iscene.add(fig.root); refreshBoard(); } else if (!v.in && place === "in") { place = "out"; fscene.add(fig.root); }
    VIEW.on = true; fcam.position.set(v.pos[0], v.pos[1], v.pos[2]); fcam.fov = v.fov || 55; fcam.updateProjectionMatrix(); fcam.lookAt(v.look[0], v.look[1], v.look[2]);
    if (!v.in) sunFollow(v.pos[0] * 0.5 + v.look[0] * 0.5, v.pos[2] * 0.5 + v.look[2] * 0.5); return true;
  }

  // ---------------------------------------------------------------- the camera: first person (eye height) or third person (orbit with pull-in)
  const _f = new THREE.Vector3();
  function blockedAt(x, y, z) {                                      // is this camera position inside something solid (or under the floor)?
    if (place === "in") { const b = iworld.bounds; if (x < b.x0 - 0.35 || x > b.x1 + 0.35 || z < b.z0 - 0.35 || z > b.z1 + 0.35 || y > b.h - 0.12 || y < 0.12) return true; }
    else if (y < world.heightAt(x, z) + 0.28) return true;
    if (y < 3.4) for (const c of cur().colliders) if (x > c.x0 - 0.22 && x < c.x1 + 0.22 && z > c.z0 - 0.22 && z < c.z1 + 0.22) { if (place === "in" && c.z1 - c.z0 < 0.2) continue; return true; }
    return false;
  }
  function placeCamera(dt) {
    const cy = Math.cos(CAM.pitch), fx = Math.sin(CAM.yaw) * cy, fy = Math.sin(CAM.pitch), fz = -Math.cos(CAM.yaw) * cy, gy = place === "in" ? 0 : P.y;
    if (person === 1) {
      fcam.position.set(P.x + Math.sin(CAM.yaw) * 0.08, gy + EYE, P.z - Math.cos(CAM.yaw) * 0.08); camReady = true;
      if (Math.abs(fcam.fov - FOV[1]) > 0.01) { fcam.fov = FOV[1]; fcam.updateProjectionMatrix(); }
      fcam.lookAt(fcam.position.x + fx, fcam.position.y + fy, fcam.position.z + fz); return;
    }
    const tx = P.x, ty = gy + 1.45, tz = P.z; let want = place === "in" ? Math.min(CAM.dist, 3.4) : CAM.dist, hit = 1;
    for (let i = 14; i >= 0; i--) { const k = i / 14, d = want * k; if (!blockedAt(tx - fx * d, ty - fy * d, tz - fz * d)) { hit = k; break; } hit = 0.05; }   // march from the full distance inwards: the first free spot
    want *= hit;
    if (!camReady || want < CAM.cur) CAM.cur = want; else CAM.cur += (want - CAM.cur) * Math.min(1, dt * 4);                  // pull in at once, ease back out
    fcam.position.set(tx - fx * CAM.cur, ty - fy * CAM.cur, tz - fz * CAM.cur); camReady = true;
    if (Math.abs(fcam.fov - FOV[3]) > 0.01) { fcam.fov = FOV[3]; fcam.updateProjectionMatrix(); }
    fcam.lookAt(tx + fx * 0.6, ty + fy * 0.6 - 0.1, tz + fz * 0.6);
  }

  // ---------------------------------------------------------------- per frame
  function animateNearHorses(dt) { FARMCARE.animateHorses(dt); }   // idle animation only for horses near the camera (and the ones being worked with)
  // the glowing ground line: recomputed when the objective changes or you stray from it, drawn by FARMNAV
  function stepGuide(dt, px, pz, driving) {
    if (!guide) return; const mode = settings.guide || "full";
    let want = null, key = "";
    if (mode !== "off" && place === "out") {
      if (driving) { want = FARMDRIVE.route(); key = "drive"; }
      else { const tg = FARMDAY.target(); if (tg) { want = tg; key = FARMDAY.stage() + ":" + Math.round(tg.x) + ":" + Math.round(tg.z); } }
    }
    if (!want) { if (guideKey) { guide.setPath(null); guideKey = ""; } guide.update(dt, px, pz, "off"); return; }
    guideT -= dt; const strayed = guideFrom && !driving && Math.hypot(px - guideFrom[0], pz - guideFrom[1]) > 3.2;
    if (key !== guideKey || strayed || (driving && guideT <= 0)) {
      guideKey = key; guideFrom = [px, pz]; guideT = 0.6;
      if (driving) guide.setPath(want, { width: 1.1, lift: 0.1 }); else guide.setPath(FARMNAV.find(world, [px, pz], [want.x, want.z]), { width: 0.34 });
    }
    guide.update(dt, px, pz, mode);
  }
  function frame(dt) {
    if (!built) return;
    if (showcase && !active) return menuFrame(dt);
    if (!active) return;
    t += dt; dt = Math.min(dt, 0.1);
    try { const dd = CAREER.data && CAREER.data.day; if (dd !== farmDay) { farmDay = dd; applyAtmosphere(); } } catch (e) {} if (farmRain && farmRain.visible) farmRain.userData.tick(dt);
    stepTrans(dt);
    if (trip) { FARMTRIP.frame(dt); animateNearHorses(dt); renderer.render(fscene, fcam); return; }
    if (FARMDRIVE.on) {                                                // driving the rig: its own camera; the world still updates round the camera
      if (!paused) FARMDRIVE.frame(dt); const st = FARMDRIVE.state; if (st) stepGuide(dt, st.x + Math.cos(st.ang) * 9, st.z - Math.sin(st.ang) * 9, true);
      world.update(dt, fcam); animateNearHorses(dt); renderer.render(fscene, fcam); if (departT > 0) { departT -= dt; if (departT <= 0) runDepart(); } return;
    }
    if (FARMTRAIN.on) { if (!paused) FARMTRAIN.frame(dt); world.update(dt, fcam); animateNearHorses(dt); renderer.render(fscene, fcam); return; }
    syncT -= dt; stageT -= dt; if (syncT <= 0) { syncT = 0.5; FARMDAY.sync(); }
    if (stageT <= 0) { stageT = 0.1; const stg = FARMDAY.stage(); if (stg !== lastStage) { lastStage = stg; objective(); } }
    const frozen = blocked();
    if (!frozen) {
      if (fk.arrowleft) CAM.yaw -= 1.8 * dt; if (fk.arrowright) CAM.yaw += 1.8 * dt;
      let fx = (fk.w || fk.arrowup ? 1 : 0) - (fk.s || fk.arrowdown ? 1 : 0), sx = (fk.d ? 1 : 0) - (fk.a ? 1 : 0);
      const mag = Math.hypot(fx, sx), target = mag > 0 ? (fk.shift ? (FARMCARE.led ? 3.1 : 5.2) : 2.4) : 0;
      if (mag > 0 && VIEW.on) VIEW.on = false;
      P.speed += (target - P.speed) * Math.min(1, dt * 9); P.moving = P.speed > 0.15;
      if (mag > 0) {
        fx /= mag; sx /= mag; const s = Math.sin(CAM.yaw), c = Math.cos(CAM.yaw);                       // forward = (sin, -cos), right = (cos, sin) for a camera yaw
        const dx = fx * s + sx * c, dz = -fx * c + sx * s;
        P.x += dx * P.speed * dt; P.z += dz * P.speed * dt;
        if (person === 1) P.face = CAM.yaw; else { const want = Math.atan2(dx, -dz); let d = want - P.face; d = Math.atan2(Math.sin(d), Math.cos(d)); P.face += d * Math.min(1, dt * 10); }
      } else if (person === 1) P.face = CAM.yaw;
    } else { P.speed += (0 - P.speed) * Math.min(1, dt * 9); P.moving = false; }
    collide(); const gy = place === "in" ? 0 : world.heightAt(P.x, P.z); P.y += (gy - P.y) * Math.min(1, dt * 14); if (Math.abs(gy - P.y) > 1) P.y = gy;
    if (!paused) { FARMCARE.frame(dt); FARMLOOP.frame(dt); FARMDAY.frame(dt); FARMLIFE.frame(dt); try { FARMACTORS.frame(dt); } catch (e) { console.error(e); } }
    { let df = P.face - lastFace; df = Math.atan2(Math.sin(df), Math.cos(df)); lastFace = P.face; turnRate += (df / Math.max(dt, 1e-3) - turnRate) * Math.min(1, dt * 10); }
    const wantAct = FARMCARE.led && !busy ? "lead" : null; if (!busy && (fig.action ? fig.action.name : null) !== wantAct && !FARMCARE.busy) FARMPEOPLE.act(fig, wantAct);
    if (!FARMCARE.busy && !FARMDAY.active) FARMPEOPLE.pose(fig, dt, P.speed, turnRate);
    fig.root.visible = !hideFigure && (CINE.on || (!VIEW.on && person === 3 && !(CAM.cur < 1.0 && camReady))); fig.root.position.set(P.x, P.y, P.z); fig.root.rotation.y = Math.PI - P.face;
    if (cross) cross.hidden = !(person === 1 && !frozen && !VIEW.on);
    if (panel === "wardrobe" && place === "in") {                      // the wardrobe: the camera swings round to show the character
      const fx = Math.sin(P.face), fz = -Math.cos(P.face), cx = P.x - fx * 2.5 + fz * 0.7, cz = P.z - fz * 2.5 - fx * 0.7, k = Math.min(1, dt * 5);
      fig.root.visible = true; fig.root.rotation.y = Math.PI - Math.atan2(cx - P.x, -(cz - P.z)); camReady = false;
      if (!ctx._pv) { ctx._pv = new THREE.Vector3(cx, 1.5, cz); } ctx._pv.x += (cx - ctx._pv.x) * k; ctx._pv.z += (cz - ctx._pv.z) * k;
      fcam.position.set(ctx._pv.x, P.y + 1.45, ctx._pv.z); fcam.lookAt(P.x, P.y + 1.12, P.z); if (Math.abs(fcam.fov - 46) > 0.01) { fcam.fov = 46; fcam.updateProjectionMatrix(); }
    } else if (CINE.on) {
      const k = Math.min(1, dt * CINE.k); CINE.cp.lerp(CINE.tp, k); CINE.cl.lerp(CINE.tl, k); fcam.position.copy(CINE.cp); fcam.lookAt(CINE.cl); if (Math.abs(fcam.fov - CINE.fov) > 0.05) { fcam.fov += (CINE.fov - fcam.fov) * Math.min(1, dt * 4); fcam.updateProjectionMatrix(); }
      if (place === "out") sunFollow(P.x, P.z); camReady = false;
    } else if (!VIEW.on) {
      ctx._pv = null; placeCamera(dt);
      if (place === "out") sunFollow(P.x, P.z);
    }
    if (place === "out") stepGuide(dt, P.x, P.z, false);
    const n = frozen || FARMCARE.menuOpen || FARMTRAIN.menuOpen ? null : nearest(); if (n !== near || (n && prompt.hidden)) { near = n; prompt.hidden = !n; } if (n) { const tx = pointText(n); if (prompt.textContent !== tx) prompt.textContent = tx; }
    if (place === "out") { world.update(dt, fcam); animateNearHorses(dt); }
    renderer.render(place === "in" ? iscene : fscene, fcam);
  }

  // the main-menu background: a slow drift over the courtyard, the Quick Race horse on show, your horses in their boxes
  function menuFrame(dt) {
    t += dt; dt = Math.min(dt, 0.1);
    const a = 0.42 * Math.sin(t * 0.055) - 0.1, r = 15.5, cx = 1.5, cz = -9.0;
    fcam.position.set(cx + Math.sin(a) * r, 1.85 + 0.3 * Math.sin(t * 0.07), cz + Math.cos(a) * r);
    const lx = Math.cos(a) * 3.4, lz = -Math.sin(a) * 3.4;                 // aim a little to the side so the horse sits right of the menu
    fcam.lookAt(cx - lx * 1.0, 1.75, cz - lz * 1.0 - 4); if (Math.abs(fcam.fov - 46) > 0.01) { fcam.fov = 46; fcam.updateProjectionMatrix(); }
    sunFollow(cx, cz);
    world.update(dt, fcam); animateNearHorses(dt);
    if (showHorse) { showHorse.rotation.y += dt * 0.12; animateHorse(showHorse, 0, 0, 0, 0, 0, 0, dt, null); }
    renderer.render(fscene, fcam);
  }

  // ---------------------------------------------------------------- scene lifecycle (registered with SCENES)
  function enter() {
    unpark(); stopShowcase();
    if (built && builtName !== stableName()) dispose(true);             // the stable was renamed: the signs are rebuilt
    build(); active = true; VIEW.on = false; paused = false; panel = null; trans = null; trip = null; place = "out"; fscene.add(fig.root); refreshFigure();
    person = settings.person === 1 ? 1 : 3; camReady = false; applyAtmosphere(true);
    const a = P.arrive || [1, -0.5, 0]; P.arrive = null;
    const home = !!P.arriveHome; P.arriveHome = false;
    P.x = a[0]; P.z = a[1]; P.y = world.heightAt(P.x, P.z); P.face = a[2]; P.speed = 0; CAM.yaw = a[2]; CAM.pitch = person === 1 ? 0 : -0.22; CAM.dist = 4.6; CAM.cur = 4.6; near = null;
    prompt.hidden = true; title.textContent = builtName.toUpperCase(); pauseEl.hidden = true; panelEl.hidden = true; fadeEl.style.opacity = "0"; skipEl.hidden = true;
    if (home) { fadeEl.style.transition = "none"; fadeEl.style.opacity = "1"; requestAnimationFrame(() => { fadeEl.style.transition = "opacity .9s ease"; fadeEl.style.opacity = "0"; setTimeout(() => { if (fadeEl) fadeEl.style.transition = ""; }, 1000); }); try { setTimeout(() => toast("Welcome home — your horse is back in its box", "good", 3.2), 600); } catch (e) {} }
    fcam.aspect = innerWidth / innerHeight; fcam.fov = FOV[person]; fcam.updateProjectionMatrix(); shadowOn = !(renderer.shadowMap.enabled && settings.shadows !== false);
    if (resume) {                                                       // back from the ledger or the trophy cabinet: inside the farmhouse, where you stood
      const r = resume; resume = null;
      if (r.place === "in") { ensureHouse(); place = "in"; iscene.add(fig.root); refreshBoard(); title.textContent = (builtName + " · farmhouse").toUpperCase(); }
      P.x = r.x; P.z = r.z; P.y = r.place === "in" ? 0 : world.heightAt(r.x, r.z); P.face = r.face; CAM.yaw = r.yaw; CAM.pitch = r.pitch;
    }
    resetRig(); stand(); FARMCARE.enter(); FARMLIFE.enter(); try { FARMACTORS.enter(); } catch (e) { console.error(e); } FARMDAY.enter(); FARMTRAIN.enter(); busy = false; hideFigure = false; CINE.on = CINE.init = false; guideKey = ""; lastStage = ""; departT = 0; departB = null; bind(); sunFollow(P.x, P.z); objective(); hintEl.hidden = false; camReady = false; placeCamera(0.1);
  }
  function leave() { try { FARMLOOP.end("cancel"); FARMACTORS.leave(); FARMLIFE.leave(); FARMTRAIN.leave(); FARMDAY.leave(); FARMCARE.leave(); FARMDRIVE.stop(true); } catch (e) { console.error(e); } busy = false; hideFigure = false; CINE.on = false; if (guide) { guide.setPath(null); guideKey = ""; } active = false; unbind(); unstand(); if (prompt) prompt.hidden = true; if (pauseEl) pauseEl.hidden = true; if (panelEl) { panelEl.hidden = true; panelEl.innerHTML = ""; } if (fadeEl) fadeEl.style.opacity = "0"; paused = false; panel = null; trans = null; if (trip) { try { FARMTRIP.abort(); } catch (e) {} } trip = null; near = null; if (fig) fig.root.visible = false; try { renderer.toneMappingExposure = GFX.atmo ? GFX.atmo.expo : 0.82; } catch (e) {} }
  // where you appear next time: the hardstand by the float, after a race
  function arrive(where) { resume = null; P.arrive = where === "hardstand" ? [31.5, 10.5, Math.PI / 2] : null; P.arriveHome = where === "hardstand"; }
  function resetRig() { const g = world && world.structures && world.structures.rig; if (g) { g.position.set(FARMWORLD.L.float.x, 0, FARMWORLD.L.float.z); g.rotation.set(0, 0, 0); if (g.userData.ramp) g.userData.ramp.rotation.z = 0.296; } }

  // ---------------------------------------------------------------- the main-menu background
  function startShowcase() {
    if (showcase || active) return; if (typeof SCENES !== "undefined" && SCENES.scene !== "menu") return;
    if (built && builtName !== stableName()) dispose(true);
    unpark(); resume = null; build(); showcase = true; place = "out"; if (!showDef && typeof ROSTER !== "undefined" && typeof settings !== "undefined") showDef = ROSTER[settings.playerHorse]; fig.root.visible = false; fcam.aspect = innerWidth / innerHeight; fcam.updateProjectionMatrix(); shadowOn = !(renderer.shadowMap.enabled && settings.shadows !== false);
    resetRig(); stand(); sunFollow(0, -9); if (showDef) setShowHorse(showDef); window.addEventListener("resize", onResize);
  }
  function stopShowcase() { if (!showcase) return; showcase = false; window.removeEventListener("resize", onResize); unstand(); if (showHorse) { fscene.remove(showHorse); try { disposeHorse(showHorse); } catch (e) {} showHorse = null; } }
  // Phase 15A (hidden performance lab, ff_lab "park"): park the property's GPU resources while a race runs. Only the GPU copies of the world's geometry,
  // textures, instance buffers and the sun's shadow map are freed; every JS object, material (shader program), horse, the character and all career data stay,
  // and three.js simply re-uploads whatever the next farm frame needs. `protect` (a Set of geometries / textures) is what the race also uses: left alone.
  let parked = false;
  function park(protect) {
    if (!built || active || parked || !fscene) return null;
    const prot = protect || new Set(), seen = new Set(), n = { geo: 0, tex: 0, instanced: 0, shadow: 0 };
    const tex = t => { if (t && t.isTexture && !seen.has(t) && !prot.has(t) && t !== fscene.environment && t !== fscene.background) { seen.add(t); t.dispose(); n.tex++; } };
    const visit = o => {
      const g = o.geometry; if (g && !seen.has(g) && !prot.has(g)) { seen.add(g); g.dispose(); n.geo++; }
      if (o.isInstancedMesh && typeof o.dispose === "function") { o.dispose(); n.instanced++; }
      for (const m of [].concat(o.material || [])) { if (!m) continue; for (const k in m) if (k !== "envMap") tex(m[k]); if (m.uniforms) for (const k in m.uniforms) tex(m.uniforms[k] && m.uniforms[k].value); }
      if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; n.shadow++; }
    };
    fscene.traverse(visit); if (iscene) iscene.traverse(visit);
    parked = true; return n;
  }
  function unpark() { if (!parked) return; parked = false; if (typeof PERFLAB !== "undefined") PERFLAB.ev("farm", "back on the farm: GPU resources re-upload over the next frames"); }
  // frees the whole property (low-memory mode, a rename, tests); the next enter() rebuilds it
  function dispose(force) {
    if (active && !force) return false;
    if (!built) return true;
    stopShowcase(); active = false; try { FARMCARE.leave(); } catch (e) {} unstand();
    if (farmRain) { try { farmRain.geometry.dispose(); farmRain.material.dispose(); } catch (e) {} farmRain = null; } farmP = null; farmDay = -1;
    if (guide) { guide.dispose(); guide = null; } try { WEATHERFX.farmDispose(); FARMLOOP.dispose(); FARMACTORS.dispose(); FARMLIFE.dispose(); FARMCARE.dispose(); FARMTRAIN.dispose(); } catch (e) {}
    if (iworld) { iworld.dispose(); iworld = null; iscene = null; }
    world.dispose(); for (const g of own.geo) g.dispose(); for (const m of own.mat) m.dispose(); own.geo = []; own.mat = [];
    if (fig) { FARMPEOPLE.dispose(fig); fig = null; }
    sunLight.shadow.map && sunLight.shadow.map.dispose(); if (hud) { hud.remove(); delete screens.farm; hud = null; }
    fscene = null; fcam = null; world = null; built = false; parked = false; return true;
  }
  SCENES.register("farm", { enter, leave });
  SCENES.register("menu", { enter() { startShowcase(); }, leave() { stopShowcase(); } });
  // the game boots into the menu before this file has loaded, so the first showcase is started here (after everything has loaded)
  function boot() { setTimeout(() => { try { if (!built && SCENES.scene === "menu" && !(window.FF_NO_SHOWCASE)) startShowcase(); } catch (e) { console.error("farm showcase", e); } }, 60); }
  if (document.readyState === "complete") boot(); else window.addEventListener("load", boot);

  return { frame, dispose, enter, leave, view, arrive, setShowHorse, startShowcase, stopShowcase, setPerson, get person() { return person; }, get active() { return active; }, get showcase() { return showcase; }, get live() { return active || showcase; }, get built() { return built; }, get parked() { return parked; }, park, get place() { return place; }, get paused() { return paused; }, get panel() { return panel; }, get tripOn() { return !!trip; },
    stats() { const i = renderer.info; return Object.assign({ calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }, world ? world.stats() : {}); },
    // the main pass is what renderer.info counts; the sun's shadow pass draws again (casters inside its frustum) and is NOT in those numbers: this counts it, for budgets and for the F8 / tests
    shadowStats() { if (!fscene || !fcam) return null; let n = 0, tris = 0; const o = renderer.renderBufferDirect; renderer.renderBufferDirect = function (cam, sc, geo, mat, obj) { if (mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial) { n++; tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * (obj.count || 1); } return o.apply(this, arguments); }; try { renderer.render(place === "in" ? iscene : fscene, fcam); } finally { renderer.renderBufferDirect = o; } return { calls: n, tris: Math.round(tris) }; },
    info() { return { built, active, showcase, place, person, paused, panel, trip: !!trip, horses: horses.length, plaques: plaques.length, objects: fscene ? fscene.children.length : 0, x: P.x, z: P.z, y: P.y, face: P.face, speed: P.speed, yaw: CAM.yaw, pitch: CAM.pitch, camDist: CAM.cur, cam: fcam ? [fcam.position.x, fcam.position.y, fcam.position.z] : null, figure: fig ? fig.root.visible : false, near: near ? near.id : null, prompt: prompt && !prompt.hidden ? prompt.textContent : "", objective: objEl ? objEl.textContent : "", listeners: listeners.length, buildMs: world ? world.ms : 0, showHorse: !!showHorse }; },
    _test: { step(dt, n) { for (let i = 0; i < (n || 1); i++) frame(dt); }, ctx, setPos(x, z) { P.x = x; P.z = z; P.y = place === "in" ? 0 : (world ? world.heightAt(x, z) : 0); }, settle(x, z) { P.x = x; P.z = z; collide(); return { x: P.x, z: P.z }; }, interact, enterHouse, exitHouse, setPaused, openPanel, closePanel, startTrans, skipFade() { if (trans) { stepTrans(10); stepTrans(10); } }, look, get points() { return cur() ? cur().points : []; }, get TRAVEL() { return world ? world.points.find(p => p.id === "travel") : null; }, get colliders() { return world ? world.colliders : []; }, get segs() { return world ? world.segs : []; }, get stalls() { return world ? world.stalls : []; },
      atmo: (tod, wx) => { atmoOverride = tod ? ATMO.params(tod, wx) : null; applyAtmosphere(true); return farmP; }, get atmoNow() { return farmP; }, keys: fk, presets: Object.keys(PRESETS), world: () => world, house: () => iworld, get horses() { return horses; }, get plaques() { return plaques; }, get figure() { return fig; }, get showHorse() { return showHorse; }, get rig() { return world && world.structures.rig; }, ctx, pointText, blockedAt, placeCamera } };
})();
