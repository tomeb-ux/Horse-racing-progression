'use strict';
/* =====================================================================
   FINAL FURLONG — THE FARMHOUSE SCREENS (Phase 5)
   Two panels, both drawn over the farm (in the farm's own HUD layer) and closed with Esc or their button:
     • RACE CALENDAR — opened at the board in the farmhouse. A month grid with the race days marked, the upcoming races, the selected
       race's conditions, and your horses with who is qualified and why. "Book" books that horse for that race (CAREER.book); a booked race
       is run by loading the horse at the float. Only the current championship round (and optional races that fall before it) can be booked.
     • WARDROBE — opened at the mirror. Outfit (stable wear / riding gear / race day), skin, hair, face, build and clothing colours; every change
       is saved to the career (CAREER.setPlayer) and shown on the character at once.
   Pure UI: the data comes from, and goes back to, the career (career.js); nothing here touches the race.
   ===================================================================== */
const FARMUI = (() => {
  let css = false, F = null, st = null;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const money = n => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-AU");
  function style() {
    if (css) return; css = true; const el = document.createElement("style"); el.id = "farmUiCss";
    el.textContent = `
    .fu{max-width:1120px;margin:0 auto;color:#f2efe6;font-family:var(--font-b,system-ui)}
    .fu h2{font:800 24px var(--font-d,system-ui);letter-spacing:.07em;text-transform:uppercase;margin:0}
    .fu .top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
    .fu .sub{font-size:12.5px;color:#b9c4b9}
    .fu .grid{display:grid;grid-template-columns:minmax(0,370px) minmax(0,1fr);gap:14px}
    @media(max-width:860px){.fu .grid{grid-template-columns:minmax(0,1fr)}}
    .fu .card{background:rgba(14,22,18,.94);border:1px solid #2a3a30;border-radius:14px;padding:14px 16px}
    .fu .btn{pointer-events:auto;cursor:pointer;font:700 13px var(--font-d,system-ui);letter-spacing:.06em;text-transform:uppercase;padding:10px 15px;border-radius:10px;border:1px solid rgba(232,195,90,.55);background:rgba(18,28,22,.95);color:#f2efe6}
    .fu .btn:hover:not(:disabled){border-color:#e8c35a;background:rgba(32,46,36,.97)}
    .fu .btn.pri{background:linear-gradient(90deg,#e8c35a,#d9a93a);color:#1a1405;border-color:#f0d27c}
    .fu .btn:disabled{opacity:.45;cursor:default}
    .fu .nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .fu .nav b{font:800 16px var(--font-d,system-ui);letter-spacing:.06em;text-transform:uppercase}
    .fu .mg{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}
    .fu .mg .dw{font-size:11px;color:#8fa08f;padding:2px 0}
    .fu .day{aspect-ratio:1;display:grid;place-items:center;border-radius:9px;font-size:14px;position:relative;color:#d9e0d6;border:1px solid transparent;background:rgba(255,255,255,.03)}
    .fu .day.past{color:#6f7d70}
    .fu .day.race{cursor:pointer;background:rgba(232,195,90,.18);border-color:rgba(232,195,90,.5);color:#fff}
    .fu .day.race.opt{background:rgba(160,190,150,.14);border-color:rgba(160,190,150,.45)}
    .fu .day.race.locked{opacity:.55}
    .fu .day.on{outline:2px solid #fff;outline-offset:1px}
    .fu .day.today::after{content:"";position:absolute;inset:2px;border:2px dashed #5fe08a;border-radius:8px}
    .fu .day.booked::before{content:"";position:absolute;inset:-1px;border:3px solid #e0483a;border-radius:10px}
    .fu .legend{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:#a9b4a9;margin-top:10px}
    .fu .legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
    .fu .rl{display:flex;flex-direction:column;gap:6px;margin-top:10px;max-height:240px;overflow:auto}
    .fu .ri{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid transparent;cursor:pointer;font-size:13px}
    .fu .ri.on{border-color:#e8c35a;background:rgba(232,195,90,.12)}
    .fu .ri small{display:block;color:#9fae9f;font-size:11.5px}
    .fu .tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:6px;background:rgba(255,255,255,.1);color:#d9e0d6}
    .fu .tag.g{background:rgba(232,195,90,.25);color:#f0d27c}.fu .tag.r{background:rgba(224,72,58,.28);color:#ffb3aa}.fu .tag.ok{background:rgba(95,224,138,.2);color:#9af0b5}
    .fu .kv{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13.5px;margin:6px 0}
    .fu .hz{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-top:8px}
    .fu .hc{border:1px solid #2a3a30;border-radius:11px;padding:9px 11px;background:rgba(255,255,255,.04);cursor:pointer;font-size:12.5px}
    .fu .hc.on{border-color:#e8c35a;background:rgba(232,195,90,.12)}
    .fu .hc.no{opacity:.6;cursor:default}
    .fu .hc b{font:700 15px var(--font-d,system-ui)}
    .fu .rq{font-size:11.5px;color:#9fae9f;margin-top:3px}.fu .rq.no{color:#ff9d92}.fu .rq.ok{color:#9af0b5}
    .fu .bk{border:1px solid #e0483a;background:rgba(224,72,58,.12);border-radius:12px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .fw{display:flex;flex-direction:column;gap:12px;max-width:380px;margin-left:0}
    .fw .row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.fw .lab{font:700 11.5px var(--font-d,system-ui);letter-spacing:.08em;text-transform:uppercase;color:#b9c4b9;margin-bottom:5px}
    .fw .chip{pointer-events:auto;cursor:pointer;padding:7px 11px;border-radius:9px;border:1px solid #33463a;background:rgba(255,255,255,.05);font-size:12.5px;color:#f2efe6}
    .fw .chip.on{border-color:#e8c35a;background:rgba(232,195,90,.18)}
    .fw .sw{pointer-events:auto;cursor:pointer;width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.25)}
    .fw .sw.on{border-color:#fff;box-shadow:0 0 0 2px #e8c35a}`;
    document.head.appendChild(el);
  }
  const root = () => F.panelEl;
  function frame(inner, narrow) { root().innerHTML = `<div class="fu">${inner}</div>`; root().style.background = narrow ? "linear-gradient(90deg,rgba(5,9,7,.82),rgba(5,9,7,.05) 62%)" : "rgba(5,9,7,.62)"; }
  const q = sel => root().querySelector(sel), qa = sel => [...root().querySelectorAll(sel)];

  // ================================================================ the race calendar
  function openCalendar(ctx) {
    style(); F = ctx; const cd0 = CAREER.calendarData(0), bk = CAREER.booking();
    st = { off: 0, eid: bk ? bk.eid : ((cd0.list.find(x => x.open) || cd0.list[0] || {}).eid || null), hid: bk ? bk.hid : null, msg: "", kind: "cal" };
    drawCalendar();
  }
  function drawCalendar() {
    const cd = CAREER.calendarData(st.off), bk = CAREER.booking(), sel = cd.list.find(x => x.eid === st.eid) || null;
    if (!sel && cd.list.length) { st.eid = (cd.list.find(x => x.open) || cd.list[0]).eid; return drawCalendar(); }
    const horses = sel ? CAREER.horsesFor(sel.eid) : [];
    if (sel && (!st.hid || !horses.some(h => h.id === st.hid && h.ok))) { const f = horses.find(h => h.ok); st.hid = f ? f.id : null; }
    const dows = ["S", "M", "T", "W", "T", "F", "S"];
    let cells = dows.map(d => `<div class="dw">${d}</div>`).join("");
    for (let i = 0; i < cd.firstDow; i++) cells += `<div></div>`;
    for (let d = 1; d <= cd.daysInMonth; d++) {
      const c = cd.cells[d], day = cd.first + d - 1, cls = ["day"]; if (day < CAREER.data.day) cls.push("past"); if (c) { cls.push("race"); if (c.kind !== "round") cls.push("opt"); if (!c.open) cls.push("locked"); } if (d === cd.today) cls.push("today"); if (d === cd.booked) cls.push("booked"); if (c && c.eid === st.eid) cls.push("on");
      cells += `<div class="${cls.join(" ")}" ${c ? `data-eid="${c.eid}" title="${esc(c.name)}"` : ""}>${d}</div>`;
    }
    const list = cd.list.map(x => `<div class="ri${x.eid === st.eid ? " on" : ""}" data-eid="${x.eid}"><div><b>${esc(x.name)}</b><small>${esc(x.dateShort)} · ${esc(x.venue)} · ${x.dist.toLocaleString("en-AU")} m</small></div><div style="text-align:right">${x.kind === "round" ? `<span class="tag g">Championship</span>` : `<span class="tag">Optional</span>`}${x.open ? "" : `<small>${esc(x.why)}</small>`}</div></div>`).join("") || `<div class="sub">No more races this season.</div>`;
    const bkHtml = bk ? `<div class="bk"><div><b>Booked:</b> ${esc(bk.name)} — ${esc(bk.horse)} · ${esc(fmtDay(bk.day))}<div class="sub">Head out to ${esc(bk.horse)}'s box — the objective panel and the glowing line on the ground guide you through preparing, loading and driving to the races.</div></div><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="fuGo">Skip the routine · go now</button><button class="btn" id="fuCancel">Cancel booking</button></span></div>` : "";
    const hz = horses.map(h => `<div class="hc${h.ok ? "" : " no"}${h.id === st.hid ? " on" : ""}" data-hid="${h.id}"><div style="display:flex;justify-content:space-between"><b>${esc(h.name)}</b><span class="tag ${h.ok ? "ok" : "r"}">${h.ok ? "Qualified" : "Not qualified"}</span></div>
        <div class="rq">${esc(h.style)} · rating ${h.rating} · fitness ${h.fit == null ? "—" : h.fit}${h.form ? " · form " + esc(h.form) : ""}</div>${h.reqs.map(r => `<div class="rq ${r.ok ? "ok" : "no"}">${r.ok ? "✓" : "✗"} ${esc(r.label)}: ${esc(r.detail)}</div>`).join("")}</div>`).join("") || `<div class="sub">You have no horses yet — create one from the Career menu (Esc).</div>`;
    const cash = CAREER.data.cash | 0, afford = !sel || !sel.fee || cash >= sel.fee, canBook = sel && sel.open && st.hid && afford && !(bk && bk.eid === sel.eid && bk.hid === st.hid);
    const hname = (horses.find(h => h.id === st.hid) || {}).name || "";
    const detail = sel ? `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div class="sub">${sel.kind === "round" ? "Championship round" + (sel.round >= 0 ? " " + (sel.round + 1) : "") : "Optional race — experience and records only"} · ${esc(sel.grade)}</div><h2 style="font-size:21px;margin-top:2px">${sel.crown ? "★ " : ""}${esc(sel.name)}</h2></div>${sel.open ? `<span class="tag ok">Open for booking</span>` : `<span class="tag">${esc(sel.why)}</span>`}</div>
        <div class="kv"><span><b>${esc(sel.date)}</b></span>${sel.tod ? `<span>${esc(sel.tod)}</span>` : ""}<span><b>${esc(sel.venue)}</b></span><span>${sel.dist.toLocaleString("en-AU")} m</span>${sel.weather ? `<span>${esc(sel.weather)}</span>` : ""}<span>${esc(goingLabel(sel.going))} going forecast</span>${sel.prize ? `<span>Prize <b>${esc(sel.prize)}</b></span>` : ""}${sel.fee ? `<span>Entry fee <b>$${sel.fee.toLocaleString()}</b></span>` : ""}<span>Cash <b>$${cash.toLocaleString()}</b></span></div>${sel.fee && !afford ? `<div class="sub" style="color:#e8a35a;margin-top:6px">The entry fee is more than the stable's cash. Open the ledger at the desk to ask the stable club for an advance, or choose a cheaper race.</div>` : ""}
        <div class="lab" style="font:700 11.5px var(--font-d,system-ui);letter-spacing:.08em;text-transform:uppercase;color:#b9c4b9;margin-top:8px">Choose your runner</div><div class="hz">${hz}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><button class="btn pri" id="fuBook" ${canBook ? "" : "disabled"}>${canBook ? "Book " + esc(hname) : sel.open ? (st.hid ? "Already booked" : "No qualified horse") : "Not open yet"}</button><span class="sub" id="fuMsg">${esc(st.msg)}</span></div></div>` : `<div class="card"><div class="sub">Nothing on the calendar.</div></div>`;
    frame(`<div class="top"><div><h2>Race Calendar</h2><div class="sub">Today is ${esc(cd.todayLabel)} · ${esc(CAREER.data.stable)}</div></div><button class="btn" id="fuClose">Close (Esc)</button></div>${bkHtml}
      <div class="grid"><div class="card"><div class="nav"><button class="btn" id="fuPrev">‹</button><b>${esc(cd.monthLabel)}</b><button class="btn" id="fuNext">›</button></div><div class="mg">${cells}</div>
        <div class="legend"><span><i style="background:#e8c35a"></i>Championship round</span><span><i style="background:#9fbe96"></i>Optional race</span><span><i style="background:#e0483a"></i>Booked</span><span><i style="border:2px dashed #5fe08a;background:none"></i>Today</span></div>
        <div class="rl">${list}</div></div>${detail}</div>`);
    q("#fuClose").onclick = () => F.closePanel(); q("#fuPrev").onclick = () => { st.off--; drawCalendar(); }; q("#fuNext").onclick = () => { st.off++; drawCalendar(); };
    qa("[data-eid]").forEach(e => e.onclick = () => { st.eid = e.getAttribute("data-eid"); st.msg = ""; drawCalendar(); });
    qa(".hc[data-hid]").forEach(e => e.onclick = () => { const h = horses.find(x => x.id === e.getAttribute("data-hid")); if (h && h.ok) { st.hid = h.id; st.msg = ""; drawCalendar(); } });
    const b = q("#fuBook"); if (b) b.onclick = () => { const r = CAREER.book(sel.eid, st.hid); if (!r.ok) { st.msg = r.error; return drawCalendar(); } F.refreshBoard(); F.objective(); st.msg = ""; drawCalendar(); try { toast(esc(hname) + " is booked for the " + esc(sel.name), "good", 2.4); } catch (e) {} };
    const go = q("#fuGo"); if (go) go.onclick = () => { F.closePanel(); F.quickGo(); };
    const c = q("#fuCancel"); if (c) c.onclick = () => { CAREER.cancelBooking(); F.refreshBoard(); F.objective(); st.msg = ""; drawCalendar(); };
  }
  const goingLabel = g => (typeof GOING !== "undefined" && GOING[g] ? GOING[g].label : g);
  const fmtDay = d => { try { return CORE.fmtDate(d); } catch (e) { return ""; } };

  // ================================================================ the wardrobe
  const SHIRT = ["#2e5e8a", "#8a2f26", "#2f6b4a", "#c9a45c", "#5a3e7a", "#d9d4c5", "#1c1c1c", "#b5532f"], TROUSERS = ["#3a3a40", "#4a4a52", "#23382b", "#6b5238", "#2e3e5a", "#e8e4d8"], BOOTS = ["#4a2e1a", "#2a1c10", "#1d1d1d", "#6b4423"];
  function openWardrobe(ctx) {
    style(); F = ctx; st = { kind: "wardrobe" }; drawWardrobe();
  }
  function drawWardrobe() {
    const a = CAREER.data.player, k = FARMPEOPLE;
    const sw = (list, cur, attr) => list.map(c => `<div class="sw${c.toLowerCase() === String(cur).toLowerCase() ? " on" : ""}" style="background:${c}" data-${attr}="${c}"></div>`).join("");
    const chips = (list, cur, attr) => list.map((l, i) => `<div class="chip${i === cur ? " on" : ""}" data-${attr}="${i}">${esc(l)}</div>`).join("");
    frame(`<div class="fw"><div class="top" style="margin-bottom:0"><div><h2>Wardrobe</h2><div class="sub">Changes save as you make them.</div></div><button class="btn" id="fuClose">Done (Esc)</button></div>
      <div class="card"><div class="lab">Outfit</div><div class="row">${k.OUTFITS.map(o => `<div class="chip${a.outfit === o[0] ? " on" : ""}" data-outfit="${o[0]}">${esc(o[1])}</div>`).join("")}</div>
        <div class="sub" style="margin-top:6px">Stable wear for the property, riding gear for the track, race day for the parade ring.</div></div>
      <div class="card"><div class="lab">Skin</div><div class="row">${sw(k.SKINS, a.look.skin, "skin")}</div>
        <div class="lab" style="margin-top:10px">Hair</div><div class="row">${chips(k.HAIR_STYLES, a.look.hair, "hair")}</div><div class="row" style="margin-top:8px">${sw(k.HAIRS, a.look.hairCol, "haircol")}</div>
        <div class="lab" style="margin-top:10px">Face</div><div class="row">${chips(k.FACES, a.look.head, "head")}</div>
        <div class="lab" style="margin-top:10px">Build</div><div class="row">${["Slight", "Lean", "Medium", "Solid", "Broad"].map((l, i) => `<div class="chip${Math.abs(k.BUILDS[i] - a.look.build) < 0.01 ? " on" : ""}" data-build="${k.BUILDS[i]}">${l}</div>`).join("")}</div></div>
      <div class="card"><div class="lab">${a.outfit === "raceday" ? "Jacket (your silks)" : "Shirt"}</div><div class="row">${sw(SHIRT, a.colours.shirt, "shirt")}</div>
        <div class="lab" style="margin-top:10px">Trousers</div><div class="row">${sw(TROUSERS, a.colours.trousers, "trousers")}</div><div class="lab" style="margin-top:10px">Boots</div><div class="row">${sw(BOOTS, a.colours.boots, "boots")}</div></div></div>`, true);
    q("#fuClose").onclick = () => F.closePanel();
    const set = patch => { CAREER.setPlayer(patch); F.refreshFigure(); drawWardrobe(); };
    qa("[data-outfit]").forEach(e => e.onclick = () => set({ outfit: e.getAttribute("data-outfit") }));
    qa("[data-skin]").forEach(e => e.onclick = () => set({ look: { skin: e.getAttribute("data-skin") } }));
    qa("[data-haircol]").forEach(e => e.onclick = () => set({ look: { hairCol: e.getAttribute("data-haircol") } }));
    qa("[data-hair]").forEach(e => e.onclick = () => set({ look: { hair: +e.getAttribute("data-hair") } }));
    qa("[data-head]").forEach(e => e.onclick = () => set({ look: { head: +e.getAttribute("data-head") } }));
    qa("[data-build]").forEach(e => e.onclick = () => set({ look: { build: +e.getAttribute("data-build") } }));
    qa("[data-shirt]").forEach(e => e.onclick = () => set({ colours: { shirt: e.getAttribute("data-shirt") } }));
    qa("[data-trousers]").forEach(e => e.onclick = () => set({ colours: { trousers: e.getAttribute("data-trousers") } }));
    qa("[data-boots]").forEach(e => e.onclick = () => set({ colours: { boots: e.getAttribute("data-boots") } }));
  }
  // ================================================================ leaving for the races (Phase 13): the preparation summary
  function openDeparture(ctx, sum, go) {
    style(); F = ctx; st = { kind: "depart", sum, go, msg: "" }; drawDeparture();
  }
  function drawDeparture() {
    const s = st.sum, h = s.horse, bar = (v, c) => `<div style="height:7px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden"><i style="display:block;height:100%;width:${Math.max(2, Math.min(100, v))}%;background:${c}"></i></div>`;
    frame(`<div class="fu" style="max-width:640px"><div class="top"><div><h2>Ready to go?</h2><div class="sub">${esc(s.name)} · ${esc(s.venue)} · ${esc(s.date)}${s.daysAway ? ` (${s.daysAway} day${s.daysAway === 1 ? "" : "s"} away)` : " (today)"}</div></div></div>
      <div class="card"><div class="lab" style="font:700 11.5px var(--font-d,system-ui);letter-spacing:.08em;text-transform:uppercase;color:#b9c4b9">Your runner</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:19px">${esc(h.name)}</b><span class="sub">rating ${h.rating}${h.form && h.form !== "—" ? " · form " + esc(h.form) : ""}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px"><div><div class="sub">Fitness ${h.fitness}</div>${bar(h.fitness, h.fitness >= 85 ? "#7bd88f" : h.fitness >= 70 ? "#e8c35a" : "#e25b4a")}</div><div><div class="sub">Composure ${h.composure}</div>${bar(h.composure, "#7cc6e8")}</div><div><div class="sub">Readiness ${h.readiness}</div>${bar(h.readiness, "#e8c35a")}</div></div>
        <div class="sub" style="margin-top:6px">${h.peak ? `<span style="color:#8fd18f">Peaking — fresh and fit for a small lift on the day.</span>` : h.pen ? `<span style="color:#e8a35a">Tired: will race about ${Math.round(h.pen * 1000) / 10}% below his ratings.</span>` : "In good racing condition."}</div></div>
      <div class="card" style="margin-top:10px"><div class="lab" style="font:700 11.5px var(--font-d,system-ui);letter-spacing:.08em;text-transform:uppercase;color:#b9c4b9">The race</div>
        <div class="kv" style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:6px"><span><b>${s.dist.toLocaleString("en-AU")} m</b></span><span>${esc(s.grade)}</span>${s.tod ? `<span>${esc(s.tod)}</span>` : ""}${s.weather ? `<span>Forecast <b>${esc(s.weather)}</b></span>` : ""}${s.going ? `<span>Going <b>${esc(s.going)}</b></span>` : ""}${s.prize ? `<span>Prize ${esc(s.prize)}</span>` : ""}</div>
        <div class="sub" style="margin-top:6px">Entry fee <b>${money(s.fee)}</b> — charged on arrival · cash ${money(s.cash)}</div></div>
      ${s.warnings.length ? `<div class="card" style="margin-top:10px;border-color:rgba(226,91,74,.6)">${s.warnings.map(w => `<div style="color:#f1b3a8;font-size:13px">⚠ ${esc(w)}</div>`).join("")}</div>` : ""}
      ${st.msg ? `<div class="card" style="margin-top:10px;border-color:rgba(226,91,74,.7);color:#f1b3a8">${st.msg}</div>` : ""}
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn pri" id="fuLeave" ${s.afford ? "" : "disabled"}>${s.afford ? "Leave now (Enter)" : "Can't afford the entry"}</button><button class="btn" id="fuStay">Not yet (Esc)</button></div>
      <div class="sub" style="margin-top:8px">Your career is saved before you travel; if it can't be saved, you stay home.</div></div>`, true);
    const lv = q("#fuLeave"), stay = q("#fuStay");
    if (stay) stay.onclick = () => F.closePanel();
    if (lv) lv.onclick = () => { const r = CAREER.travel.commit(); if (!r.ok) { st.msg = r.reason === "save" ? "<b>Your career couldn't be saved</b> — browser storage is full or blocked, so the horse stays home rather than risk losing the result. Download a copy from the Office → Save &amp; backups, then try again." : "That booking is gone."; return drawDeparture(); } const go = st.go; F.closePanel(); if (go) go(); };
  }

  // ================================================================ the farm map (M)
  // A top-down plan of the property drawn from the same layout and colliders the world is built from: paddocks, the exercise oval, the courtyard and boxes, the farmhouse, sheds,
  // the float and the gate, the fences, the horses in their boxes, where you stand and where the booked horse is.
  function openMap(ctx) {
    style(); F = ctx; st = { kind: "map" };
    frame(`<div class="top"><div><h2>Farm map</h2><div class="sub">${esc(CAREER.data ? CAREER.data.stable : "")} · you are the gold arrow · M or Esc to close</div></div><button class="btn" id="fuClose">Close (Esc)</button></div>
      <div class="card" style="padding:10px"><canvas id="fuMap" width="1000" height="560" style="width:100%;display:block;border-radius:10px"></canvas></div>
      <div class="sub" style="margin-top:6px;display:flex;gap:16px;flex-wrap:wrap"><span><i style="display:inline-block;width:10px;height:10px;background:#c9a45c;border-radius:50%"></i> you</span><span><i style="display:inline-block;width:10px;height:10px;background:#e8c35a;transform:rotate(45deg)"></i> the booked horse's box</span><span><i style="display:inline-block;width:10px;height:10px;background:#8a5a32"></i> buildings</span><span><i style="display:inline-block;width:10px;height:10px;background:#c9b48a"></i> exercise oval</span></div>`);
    q("#fuClose").onclick = () => F.closePanel(); drawMap();
  }
  function drawMap() {
    const cv = q("#fuMap"); if (!cv) return; const g = cv.getContext("2d"), L = FARMWORLD.L, w = F.world, W = cv.width, H = cv.height;
    const x0 = -104, x1 = 152, z0 = -80, z1 = 90, sc = Math.min(W / (x1 - x0), H / (z1 - z0)), ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2, X = x => ox + (x - x0) * sc, Z = z => oz + (z - z0) * sc;
    g.fillStyle = "#587a45"; g.fillRect(0, 0, W, H); g.fillStyle = "#4c6c3b"; for (let i = 0; i < 40; i++) { g.fillRect((i * 97) % W, (i * 53) % H, 70, 3); }
    const rect = (a, b, c, d, fill, line) => { g.fillStyle = fill; g.fillRect(X(a), Z(b), (c - a) * sc, (d - b) * sc); if (line) { g.strokeStyle = line; g.lineWidth = 1.2; g.strokeRect(X(a), Z(b), (c - a) * sc, (d - b) * sc); } };
    const label = (t, x, z, col, size) => { g.font = "600 " + (size || 13) + "px system-ui,sans-serif"; g.textAlign = "center"; g.fillStyle = "rgba(0,0,0,.55)"; g.fillText(t, X(x) + 1, Z(z) + 1); g.fillStyle = col || "#f2efe6"; g.fillText(t, X(x), Z(z)); };
    for (const p of L.paddocks) { rect(p.x0, p.z0, p.x1, p.z1, "#6c9654", "#d8d1b3"); label(p.name, (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, "#e8f0d8"); }
    rect(L.court.x0, L.court.z0, L.court.x1, L.court.z1, "#b8aa88", "#d8d1b3"); label("Courtyard", (L.court.x0 + L.court.x1) / 2, L.court.z1 - 2, "#3a3222", 12);
    // the exercise oval: a stadium of two straights and two bends
    { const T = L.track, half = 60, ring = (r, fill) => { g.beginPath(); g.moveTo(X(- half), Z(T.cz - r)); g.lineTo(X(half), Z(T.cz - r)); g.arc(X(half), Z(T.cz), r * sc, -Math.PI / 2, Math.PI / 2); g.lineTo(X(- half), Z(T.cz + r)); g.arc(X(- half), Z(T.cz), r * sc, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fillStyle = fill; g.fill(); };
      ring(T.r1, "#c9b48a"); ring(T.r0, "#6c9654"); g.lineWidth = 1.5; g.strokeStyle = "#f2efe6"; label("Exercise oval", 0, T.cz + 1, "#e8f0d8"); }
    g.strokeStyle = "rgba(240,236,220,.7)"; g.lineWidth = 1.1; g.beginPath(); for (const s of w.segs) { g.moveTo(X(s.x0), Z(s.z0)); g.lineTo(X(s.x1), Z(s.z1)); } g.stroke();
    for (const c of w.colliders) { g.fillStyle = "#8a5a32"; g.fillRect(X(c.x0), Z(c.z0), Math.max(1.5, (c.x1 - c.x0) * sc), Math.max(1.5, (c.z1 - c.z0) * sc)); }
    label("Stables", (L.stable.x0 + L.stable.x1) / 2, L.stable.zBack - 2, "#f2efe6"); label("Farmhouse", (L.house.x0 + L.house.x1) / 2, L.house.z0 - 2); label("Feed shed", (L.feed.x0 + L.feed.x1) / 2, L.feed.z0 - 2); label("Vet", (L.vet.x0 + L.vet.x1) / 2, L.vet.z0 - 2);
    label("Float & ute", L.float.x, L.float.z + 7, "#f6e6b0"); label("Farm gate", L.gate.x, L.gate.z - 4, "#f6e6b0"); label("Wash bay", -12.4, -17.2, "#d7ecf5", 11);
    try { for (const p of FARMTRAIN.POINTS) label(p.where === "gate" ? "Starting-gate unit" : "Oval entrance", p.x, p.z - 3, "#f6e6b0", 11); } catch (e) {}
    // the horses in their boxes (the booked one marked)
    let bk = null; try { bk = CAREER.booking(); } catch (e) {}
    for (const gm of F.horses) { const i = gm.userData.stallI; if (i == null) continue; const s = w.stalls[i], x = X(s.x), z = Z(s.z + 4.2), booked = bk && bk.hid === gm.userData.hid;
      g.beginPath(); g.arc(x, z, booked ? 5.5 : 4, 0, Math.PI * 2); g.fillStyle = booked ? "#e8c35a" : "#f2efe6"; g.fill(); g.strokeStyle = "#3a2a18"; g.lineWidth = 1; g.stroke(); }
    // you
    const P = F.P, px = X(P.x), pz = Z(P.z), f = P.face || 0; g.save(); g.translate(px, pz); g.rotate(-f + Math.PI / 2 * 0 + Math.PI); g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fillStyle = "#e8c35a"; g.fill(); g.strokeStyle = "#1a1408"; g.lineWidth = 1.5; g.stroke(); g.restore();
    g.fillStyle = "#f2efe6"; g.font = "600 11px system-ui"; g.textAlign = "left"; g.fillRect(14, H - 22, 20 * sc, 3); g.fillText("20 m", 14 + 20 * sc + 6, H - 17);
  }
  function onClose() { st = null; if (root()) root().style.background = ""; }
  return { openCalendar, openWardrobe, openDeparture, openMap, onClose, get kind() { return st ? st.kind : null; }, _test: { get st() { return st; }, redraw() { if (st && st.kind === "cal") drawCalendar(); else if (st) drawWardrobe(); } } };
})();
