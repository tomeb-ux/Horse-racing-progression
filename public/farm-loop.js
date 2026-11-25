// Phase 19: the hands-on care loop. The wash and the groom become something you do (rinse / brush the horse region by region) instead of a timer.
// It is OPTIONAL at every step: Enter hands it to a stable hand (same reward, done at once), Esc leaves it for later (no reward, nothing lost).
// The rewards are exactly CORE.wash / CORE.groom (once per horse per day, unchanged), so doing it by hand, handing it over or letting the groom do it is worth the same.
// After a wash or groom a short post-work summary (CORE.postWork, read-only) says what is done and what is still on offer.
const FARMLOOP = (() => {
  let F = null, A = null, pend = null, hud = null, sum = null, sumT = 0, spray = null, held = false, sprayT = 0, parts = [];
  const REG = { wash: ["Neck", "Shoulder", "Barrel", "Hindquarters", "Legs"], groom: ["Neck", "Back", "Belly", "Rump", "Legs"] };
  const AT = [[0.95, 1.75], [0.55, 1.5], [0.0, 1.4], [-0.85, 1.5], [0.3, 0.55]];          // forward offset and height of each region on the horse
  const RATE = 1 / 1.1;                                                                       // seconds of holding per region ≈ 1.1
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const CSS = "position:absolute;left:50%;transform:translateX(-50%);bottom:18px;max-width:min(560px,94vw);background:rgba(10,18,14,.88);border:1px solid #2a3a30;border-radius:14px;padding:12px 14px;color:#f2efe6;font:600 13px system-ui,sans-serif;pointer-events:auto;z-index:6";

  function init(ctx) { F = ctx; }
  function ensureHud() {
    if (hud) return; hud = document.createElement("div"); hud.hidden = true; hud.style.cssText = CSS; F.hud.appendChild(hud);
    sum = document.createElement("div"); sum.hidden = true; sum.style.cssText = CSS.replace("bottom:18px", "top:70px"); F.hud.appendChild(sum);
  }
  function begin(o) {
    if (A || !F) return false; ensureHud(); const names = REG[o.kind]; if (!names) return false;
    A = { kind: o.kind, g: o.g, hid: o.hid, name: o.name || "the horse", onEnd: o.onEnd, sel: 0, prog: names.map(() => 0), t: 0 }; held = false; sprayT = 0;
    if (sum) sum.hidden = true; render(); hud.hidden = false; return true;
  }
  function render() {
    if (!A || !hud) return; const wash = A.kind === "wash", names = REG[A.kind], done = A.prog.filter(p => p >= 1).length;
    hud.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline"><b style="font-size:15px">${wash ? "Rinse" : "Brush"} ${esc(A.name)}</b><span style="color:#c8d2c8;font-weight:500">${done}/${names.length} done</span></div>
      <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">${names.map((n, i) => `<button data-r="${i}" style="pointer-events:auto;cursor:pointer;flex:1;min-width:84px;padding:6px 6px;border-radius:9px;border:1px solid ${i === A.sel ? "#e8c35a" : "rgba(255,255,255,.2)"};background:${i === A.sel ? "rgba(232,195,90,.16)" : "rgba(255,255,255,.05)"};color:#f2efe6;font:600 12px system-ui"><div>${n}</div><div style="height:5px;border-radius:3px;background:rgba(255,255,255,.15);margin-top:5px"><div data-b="${i}" style="height:100%;width:${Math.round(A.prog[i] * 100)}%;border-radius:3px;background:${wash ? "#7cc6e8" : "#e8c35a"}"></div></div></button>`).join("")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button data-a="hold" style="pointer-events:auto;cursor:pointer;padding:8px 14px;border-radius:9px;border:1px solid #e8c35a;background:rgba(232,195,90,.2);color:#f2efe6;font:700 13px system-ui">Hold ${wash ? "to rinse" : "to brush"} (Space)</button>
      <button data-a="hand" style="pointer-events:auto;cursor:pointer;padding:8px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#f2efe6;font:600 12.5px system-ui">Enter: hand it to the stable hand</button>
      <button data-a="skip" style="pointer-events:auto;cursor:pointer;padding:8px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#f2efe6;font:600 12.5px system-ui">Esc: leave it for now</button></div>
      <div style="margin-top:6px;font-size:11.5px;color:#a9b4a9;font-weight:500">A / D or 1–5 choose a region. The reward is the same whoever does it; leaving it costs only the small edge for today.</div>`;
    hud.querySelectorAll("[data-r]").forEach(b => { b.onclick = () => { A.sel = +b.dataset.r; render(); }; });
    const h = hud.querySelector("[data-a=hold]"); if (h) { h.onpointerdown = () => { held = true; }; h.onpointerup = h.onpointerleave = () => { held = false; }; }
    const hd = hud.querySelector("[data-a=hand]"); if (hd) hd.onclick = () => end("hand"); const sk = hud.querySelector("[data-a=skip]"); if (sk) sk.onclick = () => end("cancel");
  }
  function onKey(e) {
    if (!A) return; const k = e.key.toLowerCase(), n = REG[A.kind].length; let used = true;
    if (k === " " || k === "e") held = true;
    else if (k === "a" || k === "arrowleft") { A.sel = (A.sel + n - 1) % n; render(); }
    else if (k === "d" || k === "arrowright") { A.sel = (A.sel + 1) % n; render(); }
    else if (k >= "1" && k <= String(n)) { A.sel = +k - 1; render(); }
    else if (k === "enter") end("hand");
    else if (k === "escape" || k === "backspace") end("cancel");
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  function onKeyUp(e) { if (!A) return; const k = e.key.toLowerCase(); if (k === " " || k === "e") { held = false; e.stopImmediatePropagation(); } }
  function onBlur() { held = false; }
  function end(res) {
    if (!A) return; const a = A; A = null; held = false; 
    if (hud) hud.hidden = true; clearSpray();
    if (res !== "cancel") { try { a.onEnd && a.onEnd(res); } catch (e) { console.error(e); } pend = { hid: a.hid, t: 0.5 }; }      // the summary is shown after the reward has been applied
    else { try { a.onEnd && a.onEnd("cancel"); } catch (e) { console.error(e); } }
  }
  function showSummary(hid) {
    try { ensureHud(); const s = CORE.postWork(CAREER.data, hid); if (!s) return; sum.innerHTML = `<div style="font-weight:800;font-size:14px;margin-bottom:4px">Post-work: ${esc(s.name)}</div>` + s.lines.map(l => `<div style="font-weight:500;color:#dfe6dc">${esc(l)}</div>`).join("") + `<div style="margin-top:4px;font-size:11.5px;color:#a9b4a9;font-weight:500">Next: turn it out at a paddock gate, or put it back in its box.</div>`; sum.hidden = false; sumT = 12; }
    catch (e) { console.error(e); }
  }
  // spray: droplets from the hand to the region being rinsed
  function sprayOn() {
    if (spray) return; const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(30 * 3), 3)); parts = Array.from({ length: 30 }, () => ({ u: Math.random(), jx: 0, jz: 0 }));
    spray = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false })); spray.frustumCulled = false; F.scene.add(spray);
  }
  function clearSpray() { if (spray) { F.scene.remove(spray); spray.geometry.dispose(); spray.material.dispose(); spray = null; } }
  const _h = new THREE.Vector3();
  function regionPt(a, i) { const g = a.g, ry = g.rotation.y, f = AT[i], fx = Math.cos(ry), fz = -Math.sin(ry); return [g.position.x + fx * f[0], g.position.y + f[1], g.position.z + fz * f[0]]; }
  function frame(dt) {
    if (pend) { pend.t -= dt; if (pend.t <= 0) { const h = pend.hid; pend = null; showSummary(h); } }
    if (sum && !sum.hidden) { sumT -= dt; if (sumT <= 0) sum.hidden = true; }
    if (!A) return; A.t += dt; const i = A.sel;
    if (held && A.prog[i] < 1) {
      A.prog[i] = Math.min(1, A.prog[i] + RATE * dt); const bar = hud.querySelector(`[data-b="${i}"]`); if (bar) bar.style.width = Math.round(A.prog[i] * 100) + "%";
      if (A.prog[i] >= 1) { const next = A.prog.findIndex(p => p < 1); if (next >= 0) A.sel = next; render(); if (next < 0) { end("done"); return; } }
    }
    if (A.kind === "wash") {
      if (held && A.prog[i] < 1) { sprayOn(); sprayT += dt; } if (spray) {
        const p = spray.geometry.attributes.position, hand = F.fig.handPos("R", _h), t = regionPt(A, i), on = held && A.prog[i] < 1;
        for (let k = 0; k < parts.length; k++) { const q = parts[k]; q.u = (q.u + dt * 2.2) % 1; const u = q.u, arc = Math.sin(u * Math.PI) * 0.25; p.setXYZ(k, hand.x + (t[0] - hand.x) * u + (k % 3 - 1) * 0.02, hand.y + (t[1] - hand.y) * u + arc, hand.z + (t[2] - hand.z) * u + (k % 5 - 2) * 0.015); }
        p.needsUpdate = true; spray.visible = on;
      }
    }
  }
  function dispose() { if (A) end("cancel"); clearSpray(); if (hud) { hud.remove(); hud = null; } if (sum) { sum.remove(); sum = null; } F = null; }
  return { init, begin, frame, end, showSummary, dispose, key: onKey, keyup: onKeyUp, blur: onBlur, get active() { return !!A; }, get held() { return held; }, get state() { return A; }, hold(v) { held = !!v; }, select(i) { if (A) { A.sel = i; render(); } } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = FARMLOOP;
