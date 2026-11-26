// Phase 27: what to do on the farm. A banner across the top of the screen says what the next task is (and how many of today's jobs are done), the guide line points to where it is,
// and a RACE BOARD stands beside the stables: E there books a race (the calendar) or, with a race booked, starts the trip to the races.
// The tasks themselves are derived from the career (CORE.farmTasks: feed, groom, spend training points, tack up, wash after work, book a race, rest); nothing here changes the career.
const FARMTASKS = (() => {
  let F = null, el = null, board = null, list = null, lastKey = "", acc = 0, spot = null, boardKey = "";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const has = () => { try { return !!(CAREER && CAREER.data && CAREER.data.horses && CAREER.data.horses.length); } catch (e) { return false; } };

  // ---------------------------------------------------------------- the list
  function compute() {
    if (!has()) return null;
    const ctx = { points: hid => { try { return CAREER.training.points(hid); } catch (e) { return 0; } }, canSpend: hid => { try { const v = CAREER.training.view(hid); return !!(v && v.rows.some(r => r.can)); } catch (e) { return false; } },
      worked: hid => { try { const l = FARMWORK.lastFor(hid); return !!l; } catch (e) { return false; } } };
    let r; try { r = CORE.farmTasks(CAREER.data, ctx); } catch (e) { console.error(e); return null; }
    // an optional job that is only on while the hay truck is here
    try { if (FARMAMBIENT.truck && FARMAMBIENT.truck.state === "parked") r.pending.splice(Math.min(r.pending.length, 1), 0, { id: "hay", kind: "hay", label: "Give the driver a hand unloading the hay truck (optional)", done: false, optional: true }); } catch (e) {}
    return r;
  }
  const stallFront = hid => { const g = F.horses.find(h => h.userData.hid === hid); if (!g || g.userData.stallI == null) return null; const s = F.world.stalls[g.userData.stallI]; return { x: s.x + 0.72, z: -21.5, i: g.userData.stallI, s }; };
  // where a task is (for the guide line)
  function whereOf(t) {
    if (!t) return null;
    try {
      if (t.kind === "feed" || t.kind === "groom" || t.kind === "prepare") return stallFront(t.hid);
      if (t.kind === "train") { const f = stallFront(t.hid); return f ? { x: f.s.x - 1.5, z: -21.3 } : null; }
      if (t.kind === "wash") return { x: -11.2, z: -19.2 };
      if (t.kind === "drill") return { x: -6.6, z: 20.2 };
      if (t.kind === "book" || t.kind === "race") return spot ? { x: spot.x, z: spot.z + 1.8 } : null;
      if (t.kind === "rest") { const v = FARMWORLD.L.house; return { x: v.x1 + 1.6, z: (v.z0 + v.z1) / 2 }; }
      if (t.kind === "hay" && FARMAMBIENT.truck) { const g = FARMAMBIENT.truck.g.position; return { x: g.x + 4, z: g.z }; }
    } catch (e) {}
    return null;
  }

  // ---------------------------------------------------------------- the banner
  function ensureBanner() {
    if (el) return; el = document.createElement("div"); el.id = "farmTask"; el.hidden = true;
    el.style.cssText = "position:absolute;left:50%;top:max(12px,env(safe-area-inset-top,0px));transform:translateX(-50%);max-width:min(620px,92vw);min-width:min(340px,88vw);background:rgba(9,14,11,.82);border:1px solid #3a4b3f;border-top:3px solid #e8c35a;border-radius:12px;padding:8px 16px 9px;color:#f2efe6;font-family:var(--font-b,system-ui);pointer-events:none;text-align:center;z-index:5";
    if (window.innerWidth < 900) el.style.top = "124px";
    F.hud.appendChild(el);
  }
  function render() {
    if (!el || !list) return; const n = list.next, done = list.done, total = list.total;
    const key = JSON.stringify([n && n.id, n && n.label, done, total, list.pending.slice(1, 3).map(t => t.id)]); if (key === lastKey) return; lastKey = key;
    const more = list.pending.filter(t => t !== n && !t.optional).slice(0, 2);
    el.innerHTML = n ? `<div style="font:800 10.5px var(--font-d,system-ui);letter-spacing:.2em;color:#e8c35a">NEXT TASK · ${done} OF ${total} DONE TODAY</div><div style="font:800 17px var(--font-d,system-ui);letter-spacing:.02em;margin-top:2px">${esc(n.label)}</div>${more.length ? `<div style="font-size:11.5px;color:#a9b4a9;margin-top:2px">Then: ${more.map(t => esc(t.label)).join(" · ")}</div>` : ""}`
      : `<div style="font:800 10.5px var(--font-d,system-ui);letter-spacing:.2em;color:#7bd88f">ALL DONE</div><div style="font:700 15px var(--font-d,system-ui);margin-top:2px">Nothing left to do today</div>`;
  }

  // ---------------------------------------------------------------- the race board by the stables
  function findSpot() {
    const c = [[19.2, -20.2], [20.6, -20.2], [17.8, -19.6], [-18.6, -20.2], [-19.8, -20.2], [-17.4, -19.6]];
    for (const p of c) { try { if (!FARMNAV.blockedAt(p[0], p[1]) && !FARMNAV.blockedAt(p[0], p[1] + 1.6) && !FARMNAV.blockedAt(p[0] - 1.2, p[1]) && !FARMNAV.blockedAt(p[0] + 1.2, p[1])) return { x: p[0], z: p[1] }; } catch (e) {} } return { x: c[0][0], z: c[0][1] };
  }
  function buildBoard() {
    disposeBoard(); try { FARMNAV.prepare && FARMNAV.prepare(F.world); } catch (e) {} spot = findSpot(); const g = new THREE.Group(), geos = [], mats = [];
    const y = F.heightAt(spot.x, spot.z);
    // posts and frame: one merged geometry with vertex colours (1 draw)
    const pos = [], nor = [], col = [], idx = []; let base = 0; const box = (x0, y0, z0, x1, y1, z1, hex) => { const b = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); b.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); const c = new THREE.Color(hex).convertSRGBToLinear(), p = b.attributes.position, n = b.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); } for (let i = 0; i < b.index.count; i++) idx.push(b.index.array[i] + base); base += p.count; b.dispose(); };
    box(-1.55, 0, -0.06, -1.42, 2.7, 0.06, 0x5a4330); box(1.42, 0, -0.06, 1.55, 2.7, 0.06, 0x5a4330); box(-1.6, 1.0, -0.1, 1.6, 1.08, 0.04, 0x6b5238); box(-1.6, 2.5, -0.1, 1.6, 2.62, 0.04, 0x6b5238); box(-1.6, 1.0, -0.1, -1.5, 2.62, 0.04, 0x6b5238); box(1.5, 1.0, -0.1, 1.6, 2.62, 0.04, 0x6b5238); box(-1.7, 2.62, -0.14, 1.7, 2.8, 0.1, 0x3b4a3f);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geos.push(geo);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true }); mats.push(mat); const frame = new THREE.Mesh(geo, mat); frame.castShadow = true; g.add(frame);
    // the face: a canvas redrawn from the career
    const cv = document.createElement("canvas"); cv.width = 768; cv.height = 360; const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4; const fm = new THREE.MeshBasicMaterial({ map: tex }); mats.push(fm);
    const pg = new THREE.PlaneGeometry(3.0, 1.46); geos.push(pg); const face = new THREE.Mesh(pg, fm); face.position.set(0, 1.78, 0.045); g.add(face);
    g.position.set(spot.x, y, spot.z); g.rotation.y = 0; g.name = "raceBoard"; F.scene.add(g); board = { g, geos, mats, tex, cv, ctx2: cv.getContext("2d") }; boardKey = ""; drawBoard();
  }
  function drawBoard() {
    if (!board) return; let info = null; try { info = CAREER.boardInfo(); } catch (e) {} const bk = (() => { try { return CAREER.booking(); } catch (e) { return null; } })();
    const key = JSON.stringify([bk && bk.eid, bk && bk.day, info && info.next && info.next.name, info && info.today]); if (key === boardKey) return; boardKey = key;
    const g = board.ctx2, W = 768, H = 360; g.fillStyle = "#c9a56a"; g.fillRect(0, 0, W, H); g.fillStyle = "rgba(90,60,30,.18)"; for (let i = 0; i < 90; i++) g.fillRect((i * 97) % W, (i * 53) % H, 14, 3);
    g.fillStyle = "#1f3a2a"; g.fillRect(0, 0, W, 64); g.fillStyle = "#e8c35a"; g.font = "900 38px Archivo, Inter, Arial, sans-serif"; g.textAlign = "center"; g.fillText("RACE BOARD", W / 2, 46);
    g.fillStyle = "#2b2116"; if (bk) {
      g.font = "800 26px Archivo, Inter, Arial, sans-serif"; g.fillText("BOOKED", W / 2, 110); g.font = "900 34px Archivo, Inter, Arial, sans-serif"; g.fillText(String(bk.name || "").slice(0, 26), W / 2, 156);
      g.font = "700 24px Archivo, Inter, Arial, sans-serif"; let h = ""; try { h = CAREER.data.horses.find(x => x.id === bk.hid).name; } catch (e) {} g.fillText(`${h} · ${bk.venue || ""}`.slice(0, 40), W / 2, 196); try { g.fillText(CORE.fmtDate(bk.day, { short: true }), W / 2, 230); } catch (e) {}
      g.fillStyle = "#7a1a1a"; g.font = "800 24px Archivo, Inter, Arial, sans-serif"; g.fillText("Press E to leave for the races", W / 2, 300);
    } else {
      const n = info && info.next; g.font = "800 24px Archivo, Inter, Arial, sans-serif"; g.fillText("NEXT RACE", W / 2, 106);
      if (n) { g.font = "900 34px Archivo, Inter, Arial, sans-serif"; g.fillText(String(n.name || "").slice(0, 26), W / 2, 154); g.font = "700 24px Archivo, Inter, Arial, sans-serif"; g.fillText(`${n.venue} · ${n.dist}`.slice(0, 40), W / 2, 194); g.fillText(`${n.date}${n.prize ? " · " + n.prize : ""}`.slice(0, 44), W / 2, 228); }
      g.fillStyle = "#1f3a2a"; g.font = "800 24px Archivo, Inter, Arial, sans-serif"; g.fillText("Press E to choose and book a race", W / 2, 300);
    }
    board.tex.needsUpdate = true;
  }
  function disposeBoard() { if (!board) return; try { F.scene.remove(board.g); board.geos.forEach(g => g.dispose()); board.mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } catch (e) {} board = null; }

  // ---------------------------------------------------------------- the interface the farm uses
  function init(ctx) { F = ctx; }
  function enter() { ensureBanner(); try { buildBoard(); } catch (e) { console.error(e); } lastKey = ""; boardKey = ""; acc = 99; }
  function leave() { disposeBoard(); if (el) el.hidden = true; list = null; }
  function dispose() { leave(); if (el) { el.remove(); el = null; } F = null; }
  function frame(dt) {
    if (!F || !el) return; acc += dt; if (acc < 0.4) return; acc = 0;
    const show = has() && F.place() === "out" && !F.uiHidden(); el.hidden = !show; if (!show) return;
    list = compute(); render(); drawBoard();
  }
  function points() {
    if (!F || !board || F.place() !== "out") return [];
    let bk = null; try { bk = CAREER.booking(); } catch (e) {}
    return [{ id: "raceboard", x: spot.x, z: spot.z + 1.5, r: 2.6, text: bk ? `E — Race board: leave for the races (${bk.name})` : "E — Race board: choose and book a race" }];
  }
  function interact(p) {
    if (!p || p.id !== "raceboard") return false; let bk = null; try { bk = CAREER.booking(); } catch (e) {}
    if (bk) { try { return FARMDAY.quickLeave() || true; } catch (e) { return true; } }
    F.openPanel("calendar"); return true;
  }
  const target = () => { if (!list) return null; const w = whereOf(list.next); return w ? { x: w.x, z: w.z } : null; };
  return { init, enter, leave, dispose, frame, points, interact, target, compute, whereOf, get list() { return list; }, get board() { return board; }, get spot() { return spot; }, get el() { return el; } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = FARMTASKS;
