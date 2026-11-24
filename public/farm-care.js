'use strict';
/* =====================================================================
   FINAL FURLONG — HORSE CARE (Phase 6): walk up to a stall and look after the horse that lives there
   E at a stall opens a small menu: INSPECT (a condition card with the real saved data), GROOM (brush strokes on the neck and shoulder, the horse relaxes),
   FEED (stable feed free, or quality feed from the ledger), PREPARE (tack up — the horse really wears its saddle cloth and saddle afterwards) and
   LEAD OUT: the lower leaf of the Dutch door swings open on its hinges, the horse walks out and then follows you on a lead rope (it keeps beside you, walks
   when you walk, and is collided with the buildings and fences like you are). E at its box puts it back. Led horses are what you take to the float and
   to the training facilities.
   The rules (daily limits, small composure / recovery benefits, readiness) are in career-core.js (CORE.groom / feed / prepare …) — none of it changes
   how a horse races. Every animation is driven from here; the horse meshes themselves are the same ones the stalls and the races use.
   ===================================================================== */
const FARMCARE = (() => {
  let F = null, doors = null, menuEl = null, ropeLine = null, ropeGeo = null, ropeMat = null, doorGeo = null;
  const S = { led: null, act: null, menu: null, card: false, tackOn: {}, pending: null };
  const DW = 0.72, LEAF = 1.3, CLAMP = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = u => u * u * (3 - 2 * u), clamp01 = u => Math.max(0, Math.min(1, u));
  const hasCare = () => { try { return typeof CAREER !== "undefined" && CAREER.care && CAREER.data && CAREER.data.horses; } catch (e) { return false; } };
  const horseAt = i => F.horses.find(g => g.userData.stallI === i) || null;

  // ---------------------------------------------------------------- the five hinged door leaves (one instanced mesh: one draw call)
  function buildDoors(world) {
    const W = FARMWORLD, col = hex => new THREE.Color(hex).convertSRGBToLinear();
    const parts = [[0, 0.06, -0.035, LEAF, 1.19, 0.05, 0x8a6a46], [0.05, 0.5, 0.0, 0.95, 0.06, 0.012, 0x3b3f42], [0.05, 0.95, 0.0, 0.95, 0.06, 0.012, 0x3b3f42], [1.12, 1.07, 0.0, 0.1, 0.07, 0.03, 0x15171a], [0, 1.2, -0.035, LEAF, 0.05, 0.06, 0x6b5238]];
    const pos = [], nor = [], colr = [], uv = [], idx = []; let base = 0;
    for (const [x, y, z, w, h, d, hex] of parts) {
      const g = new THREE.BoxGeometry(w, h, d); g.translate(x + w / 2, y + h / 2, z + d / 2); const c = col(hex), p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); colr.push(c.r, c.g, c.b);
        const face = Math.floor(i / 4), uu = u.getX(i), vv = u.getY(i); uv.push(face < 2 ? uu * d / 1.2 : uu * w / 1.2, face < 2 ? vv * h / 1.2 : face < 4 ? vv * d / 1.2 : vv * h / 1.2); }
      for (let i = 0; i < g.index.count; i++) idx.push(g.index.array[i] + base); base += p.count; g.dispose();
    }
    doorGeo = new THREE.BufferGeometry(); doorGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); doorGeo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); doorGeo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3)); doorGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); doorGeo.setIndex(idx);
    const mesh = new THREE.InstancedMesh(doorGeo, W.M.timber, 5); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = "stallDoors";
    const d = world.stalls.map(s => ({ x: s.x - DW + 0.07, z: s.door - 0.01, a: 0, want: 0 }));
    const dummy = new THREE.Object3D();
    const set = () => { d.forEach((q, i) => { dummy.position.set(q.x, 0, q.z); dummy.rotation.set(0, q.a, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); }); mesh.instanceMatrix.needsUpdate = true; };
    set(); return { mesh, d, set };
  }
  function stepDoors(dt) { if (!doors) return; let ch = false; for (const q of doors.d) { if (Math.abs(q.a - q.want) > 1e-3) { const s = Math.sign(q.want - q.a) * 2.4 * dt; q.a = Math.abs(q.want - q.a) <= Math.abs(s) ? q.want : q.a + s; ch = true; } } if (ch) doors.set(); }
  const doorOpen = (i, on) => { if (doors) doors.d[i].want = on ? -1.85 : 0; };

  // ---------------------------------------------------------------- setup / teardown
  function init(ctx) {
    F = ctx; const w = F.world;
    doors = buildDoors(w); F.scene.add(doors.mesh);
    ropeGeo = new THREE.BufferGeometry(); ropeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    ropeMat = new THREE.LineBasicMaterial({ color: 0x9c6b3a }); ropeLine = new THREE.Line(ropeGeo, ropeMat); ropeLine.frustumCulled = false; ropeLine.visible = false; F.scene.add(ropeLine);
    buildMenu();
  }
  function buildMenu() {
    menuEl = document.createElement("div"); menuEl.id = "farmCare"; menuEl.hidden = true;
    menuEl.style.cssText = "position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));pointer-events:auto;background:rgba(9,14,11,.9);border:1px solid rgba(232,195,90,.7);border-radius:14px;padding:12px 14px;color:#f2efe6;font:600 14px var(--font-b,system-ui);width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.5)";
    F.hud.appendChild(menuEl);
  }
  // per visit: the horses are in their boxes (tack on those that were prepared today)
  function enter() {
    S.led = null; S.act = null; S.menu = null; S.card = false; S.pending = null; if (menuEl) menuEl.hidden = true; if (doors) { doors.d.forEach(q => { q.a = q.want = 0; }); doors.set(); } if (ropeLine) ropeLine.visible = false;
    for (const g of F.horses) tackFor(g);
  }
  function leave() { S.led = null; S.act = null; S.menu = null; if (menuEl) menuEl.hidden = true; if (ropeLine) ropeLine.visible = false; }
  function dispose() { if (doors) { F.scene && F.scene.remove(doors.mesh); doors.mesh.dispose(); doors = null; } if (doorGeo) { doorGeo.dispose(); doorGeo = null; } if (ropeGeo) { ropeGeo.dispose(); ropeMat.dispose(); ropeGeo = null; } if (menuEl) { menuEl.remove(); menuEl = null; } F = null; }

  // tack (saddle cloth, saddle, girth): visible while the horse is prepared today
  function tackFor(g) { const hid = g.userData.hid; let on = false; try { const st = hid && hasCare() ? CAREER.care.status(hid) : null; on = !!(st && st.prepared); } catch (e) {} setTack(g, on); }
  function setTack(g, on) { const t = g.userData.tack; if (t) t.forEach(x => { x.visible = !!on; }); g.userData.tackOn = !!on; }

  // ---------------------------------------------------------------- points the walker can use (stalls)
  const stallAnchor = i => { const s = F.world.stalls[i]; return { x: s.x + 0.72, z: -21.74 }; };
  function points() {
    const out = []; if (!F || !F.world) return out;
    for (const g of F.horses) { const i = g.userData.stallI; if (i == null) continue; const s = F.world.stalls[i], led = S.led && S.led.g === g, away = S.led && S.led.g === g;
      out.push({ id: "stall", i, hid: g.userData.hid, x: s.x + 0.35, z: -21.4, r: 2.0, text: away ? "E — Put " + nameOf(g) + " back in the box" : "E — " + nameOf(g) + ": inspect · groom · feed · prepare · lead out", led: !!led }); }
    return out;
  }
  const nameOf = g => { try { const h = CAREER.data.horses.find(x => x.id === g.userData.hid); return h ? h.name : "horse"; } catch (e) { return "horse"; } };
  const horseData = hid => { try { return CAREER.data.horses.find(x => x.id === hid) || null; } catch (e) { return null; } };

  // ---------------------------------------------------------------- the menu
  function openMenu(i) {
    if (S.act || !hasCare()) return false; const g = horseAt(i); if (!g) return false;
    if (S.led && S.led.g !== g) { F.toast("You are already leading " + nameOf(S.led.g) + " — put them back first", "info", 2.4); return false; }
    S.menu = { i, g, sub: null }; S.card = false; render(); menuEl.hidden = false; F.setBusy(true);
    const a = stallAnchor(i), P = F.P, sp = F.world.stalls[i]; P.x = a.x; P.z = a.z; P.face = 0; F.faceCam(0); F.cineCam.set([sp.x + 3.3, 1.85, -19.3], [sp.x + 0.1, 1.4, -22.7], 52, 5); F.fig.root.visible = true;
    return true;
  }
  function closeMenu() { S.menu = null; S.card = false; if (menuEl) menuEl.hidden = true; F.cineCam.clear(); F.setBusy(false); }
  const bookedHid = () => { try { const b = CAREER.booking(); return b ? b.hid : null; } catch (e) { return null; } };
  const bookedName = () => { try { const b = CAREER.booking(); return b ? b.name : ""; } catch (e) { return ""; } };
  function bar(label, v, max, col, extra) { return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;font-size:12.5px"><span style="width:96px;color:#c8d2c8">${label}</span><span style="flex:1;height:8px;background:rgba(255,255,255,.12);border-radius:5px;overflow:hidden"><i style="display:block;height:100%;width:${CLAMP(v / max * 100, 0, 100)}%;background:${col}"></i></span><b style="width:${extra ? 74 : 30}px;text-align:right">${extra || Math.round(v)}</b></div>`; }
  function render() {
    const m = S.menu; if (!m || !menuEl) return; const hid = m.g.userData.hid, info = CAREER.horseInfo(hid); if (!info) return closeMenu();
    const st = info.status, booked = bookedHid() === hid, led = S.led && S.led.g === m.g;
    const btn = (k, label, done, hot) => `<button data-k="${k}" style="pointer-events:auto;cursor:pointer;display:flex;justify-content:space-between;gap:14px;width:100%;margin:3px 0;padding:9px 12px;border-radius:9px;border:1px solid ${hot ? "rgba(232,195,90,.95)" : "rgba(255,255,255,.2)"};background:${hot ? "rgba(232,195,90,.16)" : "rgba(255,255,255,.06)"};color:#f2efe6;font:600 14px var(--font-b,system-ui);text-align:left"><span><kbd style="opacity:.7;margin-right:8px">${k}</kbd>${label}</span><span style="color:#8fd18f">${done || ""}</span></button>`;
    let h = `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><b style="font:800 17px var(--font-d,system-ui);letter-spacing:.04em">${esc2(info.name)}</b><span style="font-size:12px;color:#c8d2c8">${info.age}yo · ${info.cond} · Rtg ${info.rating}</span></div>`;
    if (m.sub === "feed") {
      h += `<div style="margin:6px 0 2px;font-size:12.5px;color:#c8d2c8">Today: ${CAREER.care.today} · cash $${CAREER.care.cash.toLocaleString()}</div>` + btn(1, "Stable feed — free", st.fed && st.tier === 0 ? "✓ fed" : "") + btn(2, "Quality feed — $250 (a little more recovery and calm)", st.fed && st.tier === 1 ? "✓ fed" : "") + btn("Esc", "Back", "");
    } else if (S.card) {
      h += `<div style="margin:8px 0 4px;font-size:12px;color:#c8d2c8">${esc2(info.style)} · best at ${esc2(info.pref)} · ${info.races} starts, ${info.wins} wins${info.form ? " · form " + info.form : ""} · ${info.trainPts} training points</div>`;
      h += bar("Fitness", info.fitness, 100, "#7bd88f") + bar("Composure", info.composure, 100, "#7cc6e8") + bar("Readiness", st.readiness, 100, "#e8c35a");
      h += `<div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;column-gap:14px">${info.attrs.map(a => bar(a.lab, a.v, 100, "#d8cfae", a.v + "/" + a.p)).join("")}</div>`;
      h += `<div style="margin-top:6px;font-size:11.5px;color:#a9b4a9">The bar shows today's value; the figure after the slash is this horse's potential. Care changes composure, recovery and readiness only — it never changes racing.</div>` + btn("Esc", "Close", "");
    } else {
      h += `<div style="margin:5px 0 3px;font-size:12px;color:#c8d2c8">Readiness ${st.readiness}${st.groomed ? " · groomed ✓" : ""}${st.fed ? " · fed ✓" : ""}${st.prepared ? " · tacked up ✓" : ""}</div>`;
      h += btn(1, "Inspect", "") + btn(2, "Groom", st.groomed ? "✓ today" : "") + btn(3, "Feed", st.fed ? "✓ today" : "") + btn(4, booked ? "Prepare for the " + esc2(bookedName()) : "Tack up (training / racing)", st.prepared ? "✓ ready" : "", booked && !st.prepared) + btn(5, led ? "Put back in the box" : "Lead out of the box", "", booked && st.prepared && !led) + btn("Esc", "Close", "");
    }
    menuEl.innerHTML = h; menuEl.querySelectorAll("button[data-k]").forEach(b => { b.onclick = () => key(b.dataset.k === "Esc" ? "escape" : b.dataset.k); });
  }
  const esc2 = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function key(k) {
    const m = S.menu; if (!m || S.act) return false;
    if (k === "escape") { if (m.sub || S.card) { m.sub = null; S.card = false; render(); } else closeMenu(); return true; }
    const hid = m.g.userData.hid;
    if (m.sub === "feed") { if (k === "1" || k === "2") { m.sub = null; start("feed", { tier: k === "2" ? 1 : 0 }); } return true; }
    if (S.card) return true;
    if (k === "1") { S.card = true; start("inspect"); render(); return true; }
    if (k === "2") { start("groom"); return true; }
    if (k === "3") { m.sub = "feed"; render(); return true; }
    if (k === "4") { start("prepare"); return true; }
    if (k === "5") { if (S.led && S.led.g === m.g) start("putback"); else start("lead"); return true; }
    return false;
  }

  // ---------------------------------------------------------------- the actions (timed, with the character and the horse animated)
  const DUR = { inspect: 2.0, groom: 5.2, feed: 3.8, prepare: 3.6, lead: 3.4, putback: 3.4 };
  function start(kind, o) {
    const m = S.menu; if (!m) return; const i = m.i, g = m.g, hid = g.userData.hid, a = stallAnchor(i), s = F.world.stalls[i];
    S.act = Object.assign({ kind, t: 0, dur: DUR[kind], i, g, hid, done: false, x0: F.P.x, z0: F.P.z, ax: kind === "lead" || kind === "putback" ? s.x + 1.2 : a.x, az: a.z, hx: g.position.x, hz: g.position.z }, o || {});
    if (kind === "inspect") { S.act.dur = 1.6; }
    menuEl.hidden = kind === "inspect" ? false : true; if (kind !== "inspect") F.setBusy(true);
    const cam = F.cineCam; if (kind !== "inspect") cam.set([s.x + 3.3, 1.85, -19.3], [s.x + 0.1, 1.4, -22.7], 52);
    const act = kind === "groom" ? "brush" : kind === "feed" ? "feed" : kind === "prepare" ? "tack" : kind === "inspect" ? "inspect" : "pat";
    FARMPEOPLE.act(F.fig, kind === "lead" || kind === "putback" ? null : act);
    if (kind === "lead" || kind === "putback") doorOpen(i, true);
    if (kind === "prepare" && !g.userData.tackOn) S.act.tackAt = 0.55;
    F.fig.root.visible = true;
  }
  function finish(A) {
    const hid = A.hid, g = A.g; let msg = "", kind = "info";
    try {
      if (A.kind === "groom") { const r = CAREER.care.groom(hid); msg = r.already ? nameOf(g) + " has already been groomed today" : nameOf(g) + " is glossy and relaxed (composure +" + r.gain + ")"; }
      else if (A.kind === "feed") { const r = CAREER.care.feed(hid, A.tier); if (r.ok) msg = r.already ? nameOf(g) + " has already been fed today" : (A.tier === 1 ? "Quality feed: " : "Fed: ") + nameOf(g) + " (composure +" + r.composure + (r.fitness ? ", fitness +" + r.fitness : "") + ")"; else { msg = r.reason === "cash" ? "Not enough cash for quality feed — the stable's feed is free" : "Couldn't feed " + nameOf(g); kind = "warn"; } }
      else if (A.kind === "prepare") { CAREER.care.prepare(hid); setTack(g, true); msg = nameOf(g) + " is saddled and ready"; kind = "good"; }
    } catch (e) { console.error(e); }
    if (msg) F.toast(msg, kind, 2.8);
    FARMPEOPLE.act(F.fig, null); S.act = null; F.setBusy(false);
    if (A.kind === "inspect") { S.card = true; F.setBusy(true); S.menu.sub = null; render(); menuEl.hidden = false; return; }
    if (A.kind === "lead" || A.kind === "putback") F.cineCam.clear();
    if (A.kind === "lead") { S.menu = null; if (menuEl) menuEl.hidden = true; F.setBusy(false); return; }
    if (A.kind === "putback") { S.menu = null; if (menuEl) menuEl.hidden = true; F.setBusy(false); return; }
    if (S.menu) { render(); menuEl.hidden = false; F.setBusy(true); const sp = F.world.stalls[S.menu.i]; F.cineCam.set([sp.x + 3.3, 1.85, -19.3], [sp.x + 0.1, 1.4, -22.7], 52, 5); }
    if (typeof FARMDAY !== "undefined") FARMDAY.changed();
  }

  // ---------------------------------------------------------------- the horse: standing, working with you, leaving the box, following on the lead
  const _v = new THREE.Vector3(), _h = new THREE.Vector3();
  function overlay(g, mode, k, dt) {                                                // bones the idle pose leaves alone: head and neck
    const B = g.userData.B; if (!B) return; const t = performance.now() / 1000;
    if (mode === "groom") { B.neck1.rotation.z += 0.22 * k; B.neck2.rotation.z += 0.1 * k; B.head.rotation.z += 0.12 * k; B.head.rotation.y = 0.4 * k * Math.sin(t * 0.7) - 0.15 * k; }
    else if (mode === "feed") { const eat = Math.sin(t * 7) * 0.05; B.neck1.rotation.z += 0.62 * k; B.neck2.rotation.z += 0.2 * k; B.head.rotation.z += 0.32 * k + eat * k; }
    else if (mode === "inspect") { B.neck1.rotation.z -= 0.12 * k; B.head.rotation.y = 0.35 * k; B.head.rotation.z -= 0.05 * k; }
    else if (mode === "tack") { B.neck1.rotation.z += 0.12 * k; B.head.rotation.y = -0.25 * k; }
  }
  function animateHorses(dt) {
    const L = S.led, A = S.act, cam = F.cam;
    for (const g of F.horses) {
      if (g.visible === false) continue;
      if (L && L.g === g && L.mode !== "stall") continue;                           // the led horse is animated in lead()
      const d = Math.hypot(g.position.x - cam.position.x, g.position.z - cam.position.z); if (d > 38 && !(A && A.g === g)) continue;
      animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
      if (A && A.g === g) { const k = Math.min(1, A.t / 0.7) * (A.kind === "inspect" ? 1 : 1); overlay(g, A.kind === "groom" ? "groom" : A.kind === "feed" ? "feed" : A.kind === "prepare" ? "tack" : A.kind === "inspect" ? "inspect" : "", k, dt); }
    }
  }
  const faceOf = (dx, dz) => Math.atan2(-dz, dx);                                    // the rotation.y that makes a horse (forward +x) face a world direction
  // horse leaves / returns: scripted along the line of the door
  function scripted(A, dt) {
    const g = A.g, s = F.world.stalls[A.i], out = A.kind === "lead", u = clamp01(A.t / A.dur), inX = s.x + (A.i % 2 ? 0.1 : -0.1), inZ = -23.8, frX = s.x, frZ = -20.7;
    let x, z, rot, moving;
    if (out) { const wk = clamp01((u - 0.2) / 0.6), e = ease(wk); x = inX + (frX - inX) * e; z = inZ + (frZ - inZ) * e; rot = -Math.PI / 2; moving = u > 0.2 && u < 0.8; }
    else if (u < 0.2) { const e = ease(u / 0.2); x = A.hx + (frX - A.hx) * e; z = A.hz + (frZ - A.hz) * e; const hd = faceOf(frX - A.hx, frZ - A.hz); rot = Math.hypot(frX - A.hx, frZ - A.hz) > 0.5 ? hd : g.rotation.y; moving = true; }
    else { const wk = clamp01((u - 0.2) / 0.6), e = ease(wk); x = frX + (inX - frX) * e; z = frZ + (inZ - frZ) * e; const turn = clamp01((wk - 0.8) / 0.2); rot = Math.PI / 2 + (-Math.PI / 2 - Math.PI / 2) * ease(turn); moving = wk < 0.9; }
    g.position.set(x, z < -22.3 ? 0.15 : Math.max(0.13, F.heightAt(x, z)), z); g.rotation.y = rot;
    A.gait = (A.gait || 0) + (moving ? 1.25 * dt / 1.75 : 0);
    if (moving) PRESENT.animateWalk(g, A.gait % 1, dt, { rest: 1, look: 0 }); else animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null);
    if (out ? u >= 0.82 : u >= 0.84) doorOpen(A.i, false);
    const k = Math.min(1, dt * 5); F.P.x += (A.ax - F.P.x) * k; F.P.z += (A.az - F.P.z) * k; F.P.face = 0;                            // the handler steps aside to the opening and watches
  }
  function lead(dt) {
    const L = S.led; if (!L || L.mode === "stall") return; const g = L.g, P = F.P, A = S.act;
    const f = { x: Math.sin(P.face), z: -Math.cos(P.face) }, r = { x: Math.cos(P.face), z: Math.sin(P.face) };
    let tx = P.x - f.x * 0.3 + r.x * 1.0, tz = P.z - f.z * 0.3 + r.z * 1.0;
    if (L.hold) { tx = L.hold.x; tz = L.hold.z; }
    const dx = tx - g.position.x, dz = tz - g.position.z, dist = Math.hypot(dx, dz);
    if (dist > 11) { g.position.x = tx; g.position.z = tz; }
    const k = Math.min(1, dt * 4.5), nx = g.position.x + dx * k, nz = g.position.z + dz * k, step = Math.hypot(nx - g.position.x, nz - g.position.z);
    const q = { x: nx, z: nz }; F.resolve(q, 0.62); const mx = q.x - g.position.x, mz = q.z - g.position.z;
    g.position.x = q.x; g.position.z = q.z; g.position.y += (Math.max(F.heightAt(q.x, q.z), 0.0) - g.position.y) * Math.min(1, dt * 10);
    const sp = Math.hypot(mx, mz) / Math.max(dt, 1e-4); L.sp += (sp - L.sp) * Math.min(1, dt * 6);
    // heading: along the motion when walking, otherwise parallel to the handler
    const want = L.sp > 0.35 ? faceOf(mx, mz) : faceOf(f.x, f.z); let d = want - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * (L.sp > 0.35 ? 5 : 2.5));
    L.gait += L.sp * dt / 1.75;
    if (L.sp > 0.3) PRESENT.animateWalk(g, L.gait % 1, dt, { rest: 1, look: (L.look || 0) }); else { animateHorse(g, 0, 0, 0, 0, 0, 0, dt, null); if (A && A.g === g) overlay(g, A.kind === "groom" ? "groom" : "", 1, dt); }
    ropeUpdate(g);
  }
  function ropeUpdate(g) {
    if (!ropeLine || !S.led) { if (ropeLine) ropeLine.visible = false; return; }
    const pa = ropeGeo.attributes.position, hand = F.fig.handPos("R", _v), u = g.userData, nose = u.bit; if (!nose) return; nose.getWorldPosition(_h);
    for (let i = 0; i < 8; i++) { const t = i / 7, sag = Math.sin(t * Math.PI) * 0.16; pa.setXYZ(i, hand.x + (_h.x - hand.x) * t, hand.y + (_h.y - hand.y) * t - sag, hand.z + (_h.z - hand.z) * t); }
    pa.needsUpdate = true; ropeLine.visible = true;
  }
  // called each frame by the farm
  function frame(dt) {
    if (!F) return; stepDoors(dt);
    const A = S.act;
    if (A) {
      A.t += dt; const u = clamp01(A.t / A.dur);
      if (A.kind === "lead" || A.kind === "putback") {
        scripted(A, dt);
        if (A.kind === "lead" && u >= 0.99 && !A.done) { A.done = true; S.led = { g: A.g, hid: A.hid, i: A.i, mode: "follow", sp: 0, gait: A.gait || 0, look: 0 }; A.g.position.y = F.heightAt(A.g.position.x, A.g.position.z); finish(A); }
        else if (A.kind === "putback" && u >= 0.99 && !A.done) { A.done = true; const s = F.world.stalls[A.i]; A.g.position.set(s.x + (A.i % 2 ? 0.1 : -0.1), 0.15, s.z + 0.55); A.g.rotation.y = -Math.PI / 2 + (A.i % 2 ? 0.1 : -0.08); S.led = null; if (ropeLine) ropeLine.visible = false; finish(A); }
        if (A.kind === "lead" || A.kind === "putback") { FARMPEOPLE.pose(F.fig, dt, 0, 0); }
        return;
      }
      // standing care: the character walks to the spot in front of the horse, then works
      const k = Math.min(1, dt * 6); F.P.x += (A.ax - F.P.x) * k; F.P.z += (A.az - F.P.z) * k; F.P.face = 0;
      FARMPEOPLE.pose(F.fig, dt, 0, 0);
      if (A.tackAt != null && A.t >= A.tackAt) { setTack(A.g, true); A.tackAt = null; }
      if (A.t >= A.dur && !A.done) { A.done = true; finish(A); }
    }
    if (S.led && !S.led.freeze) lead(dt);
  }

  // ---------------------------------------------------------------- queries and controls for the rest of the farm
  function startAction(i, kind, o) { if (!S.menu) { S.menu = { i, g: horseAt(i), sub: null }; } return start(kind, o); }
  // take a horse by id out of its box without the menu (used by the race-day guide's shortcut and by the training pick-up)
  function summon(hid, x, z) {
    const g = F.horses.find(h => h.userData.hid === hid); if (!g || S.led) return null;
    g.position.set(x, F.heightAt(x, z), z); g.rotation.y = 0; S.led = { g, hid, i: g.userData.stallI, mode: "follow", sp: 0, gait: 0, look: 0 }; return g;
  }
  function release() {                                                               // forget any lead (the horse goes back to its box)
    const L = S.led; if (!L) return; const s = F.world.stalls[L.i]; L.g.visible = true; L.g.position.set(s.x + (L.i % 2 ? 0.1 : -0.1), 0.15, s.z + 0.55); L.g.rotation.y = -Math.PI / 2 + (L.i % 2 ? 0.1 : -0.08); if (doors) { doors.d[L.i].a = doors.d[L.i].want = 0; doors.set(); } S.led = null; if (ropeLine) ropeLine.visible = false;
  }
  // the horse is loaded on the float: it leaves the lead (the caller hides it); untake puts it back in its box
  function take() { const L = S.led; if (!L) return null; S.led = null; if (ropeLine) ropeLine.visible = false; return L.g; }
  function untake(g) { const i = g.userData.stallI, s = F.world.stalls[i]; g.visible = true; g.position.set(s.x + (i % 2 ? 0.1 : -0.1), 0.15, s.z + 0.55); g.rotation.y = -Math.PI / 2 + (i % 2 ? 0.1 : -0.08); if (doors) { doors.d[i].a = doors.d[i].want = 0; doors.set(); } if (ropeLine) ropeLine.visible = false; return g; }
  function ropeVisible(v) { if (ropeLine) ropeLine.visible = !!v && !!S.led; }
  return { init, enter, leave, dispose, take, untake, ropeVisible, frame, animateHorses, points, openMenu, closeMenu, key, release, summon, setTack, tackFor, startAction,
    get led() { return S.led; }, get busy() { return !!S.act; }, get menuOpen() { return !!S.menu; }, get acting() { return S.act ? S.act.kind : ""; }, get doors() { return doors; }, rope() { return ropeLine; },
    ledHid() { return S.led ? S.led.hid : null; }, ledMesh() { return S.led ? S.led.g : null; }, setLeadLook(v) { if (S.led) S.led.look = v; }, hold(h) { if (S.led) S.led.hold = h; }, freeze(v) { if (S.led) S.led.freeze = !!v; }, ropeUpdate, DUR };
})();
