'use strict';
/* =====================================================================
   FINAL FURLONG — CAREER MODE
   Create your own horses, build a stable and race it through three tiered Australian-style championships
   (Provincial → Metropolitan → Group 1 Feature Series, with The Everest and the Melbourne Cup as the crown jewels).
   The championship logic (calendar, AI stables, points, standings, qualification, history) lives in season.js; this file
   is the career UI and the bridge to the race engine. A career horse becomes a full race `def` (custom look + silks +
   attributes) and runs through startRace() exactly like a Quick Race. Everything persists in localStorage ("ff_career").

   Official championship races are always normal races: Chaos Mode, the kick, stamina assist and every Quick Race
   experimental option are forced off in the race config itself.
   This is a fictional championship inspired by Australian racing — not the real calendar or eligibility rules.
   ===================================================================== */
const CAREER = (() => {
  const ATTRS = [
    ["top", "Top speed"], ["acc", "Acceleration"], ["end", "Endurance"], ["spr", "Sprint power"],
    ["rec", "Recovery"], ["tem", "Temperament"], ["agi", "Agility"], ["sta", "Starting"],
  ];
  const AKEYS = ATTRS.map(a => a[0]);
  // creation: all attrs start at FLOOR with POOL points to spend (max CREATE_CAP each) → a new horse rates about 70
  const FLOOR = 48, CREATE_CAP = 82, POOL = 176;
  const HEADROOM = 170;                                      // total lifetime growth headroom a horse is born with (fixed → no perfect horses)
  const XP_PER_PT = 6;                                       // every 6 XP earned in a race = 1 training point
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- coat / silk option tables ----------
  const COATS = [
    { id: "bay", name: "Bay", type: "bay", hex: "#7a4a28" }, { id: "darkbay", name: "Dark bay", type: "bay", hex: "#45291a" },
    { id: "chestnut", name: "Chestnut", type: "chestnut", hex: "#8f4a24" }, { id: "black", name: "Black", type: "black", hex: "#241a14" },
    { id: "grey", name: "Grey", type: "grey", hex: "#b9b3aa" }, { id: "brown", name: "Brown", type: "brown", hex: "#5d3a22" },
    { id: "palomino", name: "Palomino", type: "flaxen", hex: "#c99a52" },
  ];
  const FACES = ["none", "star", "stripe", "blaze", "snip"];
  const SOCKS = [
    { name: "None", v: [0, 0, 0, 0] }, { name: "Two front", v: [1, 1, 0, 0] }, { name: "Two hind", v: [0, 0, 2, 2] },
    { name: "All four", v: [2, 2, 2, 2] }, { name: "One hind", v: [0, 0, 0, 1] }, { name: "Odd front", v: [1, 0, 0, 0] },
  ];
  const HAIR = [
    { name: "Black", hex: "#0a0806" }, { name: "Dark brown", hex: "#2a1c10" }, { name: "Flaxen", hex: "#cbab70" },
    { name: "Grey", hex: "#8c8984" }, { name: "Chestnut", hex: "#6e3a1c" },
  ];
  const BUILDS = [{ name: "Light", v: -0.6 }, { name: "Medium", v: 0 }, { name: "Powerful", v: 0.85 }];
  const SILK_PAL = ["#d62828", "#1d3557", "#2e8b57", "#e8c35a", "#7a4fd1", "#e86a17", "#f4f1ea", "#15161a", "#5fb7e8", "#e75480", "#1f6b3a", "#d9a521"];
  const PATTERNS = ["plain", "hoops", "sash", "quartered", "stars", "chevrons", "braces", "diamond", "crossbelts"];
  const SLOT_AT = [[0, 1], [3, 2], [7, 3], [12, 5]];         // career wins → stable slots
  const DIVS = SEASON.DIVS, BY_ID = SEASON.BY_ID;

  // ---------- data model ----------
  let C = null;                                              // the loaded career
  function fresh() { return { v: 2, seed: (Math.random() * 2 ** 31) >>> 0, stable: "Southern Cross Stable", horses: [], active: 0, trophies: [], wins: 0, history: [], season: null, created: Date.now() }; }
  function load() {
    let d = store.get("career", null);
    if (!d || typeof d !== "object") d = fresh();
    d.horses = Array.isArray(d.horses) ? d.horses.map(sanHorse).filter(Boolean) : [];
    d.trophies = Array.isArray(d.trophies) ? d.trophies.filter(t => t && typeof t === "object") : [];
    d.wins = Math.max(0, d.wins | 0);
    d.active = clampN(d.active | 0, 0, Math.max(0, d.horses.length - 1));
    d.stable = cleanName(d.stable, "Southern Cross Stable");
    SEASON.migrate(d);                                       // v1 saves: horses, trophies and records are kept; the championship is added
    C = d; save(); return d;
  }
  function save() { try { store.set("career", C); } catch (e) {} }
  function cleanName(n, dflt) { n = (n == null ? "" : String(n)).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 22); return n || dflt; }
  // validate a stored horse (guards malformed save data)
  function sanHorse(h) {
    if (!h || typeof h !== "object") return null;
    const a = {}; for (const k of AKEYS) a[k] = clampN(Math.round(+(h.attrs && h.attrs[k]) || FLOOR), FLOOR, 99);
    const pot = {}; for (const k of AKEYS) pot[k] = clampN(Math.round(+(h.pot && h.pot[k]) || a[k]), a[k], 99);
    const L = h.look || {}, socks = Array.isArray(L.socks) && L.socks.length === 4 ? L.socks.map(x => clampN(x | 0, 0, 3)) : [0, 0, 0, 0];
    return {
      id: h.id || ("h" + Math.random().toString(36).slice(2, 8)),
      name: cleanName(h.name, "My Horse"),
      look: {
        type: L.type || "bay", coat: /^#[0-9a-f]{6}$/i.test(L.coat) ? L.coat : "#7a4a28",
        face: FACES.includes(L.face) ? L.face : "none", socks,
        maneCol: /^#[0-9a-f]{6}$/i.test(L.maneCol) ? L.maneCol : "#2a1c10",
        tailCol: /^#[0-9a-f]{6}$/i.test(L.tailCol) ? L.tailCol : "#2a1c10",
        build: clampN(+L.build || 0, -1, 1),
      },
      silk: /^#[0-9a-f]{6}$/i.test(h.silk) ? h.silk : "#d62828",
      silk2: /^#[0-9a-f]{6}$/i.test(h.silk2) ? h.silk2 : "#f4f1ea",
      silkPat: PATTERNS.includes(h.silkPat) ? h.silkPat : "hoops",
      attrs: a, pot,
      xp: Math.max(0, h.xp | 0), trainPts: Math.max(0, h.trainPts | 0), lvl: Math.max(1, h.lvl | 0 || 1), xpFrac: Math.max(0, +h.xpFrac || 0),
      races: Math.max(0, h.races | 0), wins: Math.max(0, h.wins | 0), places: Math.max(0, h.places | 0), podiums: Math.max(0, h.podiums | 0),
      offRaces: Math.max(0, h.offRaces | 0), offWins: Math.max(0, h.offWins | 0), champPts: Math.max(0, h.champPts | 0),
      history: Array.isArray(h.history) ? h.history.filter(e => e && typeof e === "object").slice(-40) : [],
    };
  }

  // ---------- derived helpers ----------
  const rating = h => Math.round(AKEYS.reduce((s, k) => s + h.attrs[k], 0) / AKEYS.length);
  const potRating = h => Math.round(AKEYS.reduce((s, k) => s + h.pot[k], 0) / AKEYS.length);
  function detectStyle(a) {
    const sprint = (a.top + a.acc + a.spr) / 3, stay = (a.end + a.rec) / 2;
    if (a.spr >= 85 && stay < sprint - 4) return { label: "Closer", code: "closer", dist: "1400–2000 m" };
    if (a.sta >= 82 && a.acc >= 78 && a.end < 80) return { label: "Front-runner", code: "front", dist: "1000–1600 m" };
    if (sprint >= 83 && a.end < 74) return { label: "Sprinter", code: "stalk", dist: "1000–1200 m" };
    if (stay >= 80 && a.end >= 82) return { label: "Stayer", code: "steady", dist: "2000–3200 m" };
    if (a.agi >= 82 && a.tem >= 78) return { label: "Tactical runner", code: "stalk", dist: "1400–2000 m" };
    return { label: "All-rounder", code: "mid", dist: "1400–2000 m" };
  }
  // a career horse → a full race def the engine renders and simulates
  function toDef(h) {
    const st = detectStyle(h.attrs);
    return {
      name: h.name, role: st.label, style: st.code,
      coat: parseInt(h.look.coat.slice(1), 16), silk: h.silk, silk2: h.silk2, silkPat: h.silkPat,
      look: { type: h.look.type, coat: h.look.coat, face: h.look.face, socks: h.look.socks, maneCol: h.look.maneCol, tailCol: h.look.tailCol, build: h.look.build },
      attrs: Object.assign({}, h.attrs), _sid: "player", _hid: h.id,
    };
  }
  const activeHorse = () => C.horses[C.active] || null;
  const slots = () => { let n = 1; for (const [w, s] of SLOT_AT) if (C.wins >= w) n = s; return n; };
  const upgCost = v => v < 70 ? 1 : v < 78 ? 2 : v < 85 ? 3 : v < 90 ? 4 : v < 94 ? 6 : 9;
  const xpForLevel = lvl => Math.min(260, 80 + (lvl - 1) * 20);
  const going = g => (typeof GOING !== "undefined" && GOING[g] ? GOING[g].label : g);
  const distLbl = d => (typeof DIST_LABEL !== "undefined" && DIST_LABEL[d]) || "";
  const fmtDist = d => d.toLocaleString("en-AU") + " m";
  const S = () => C.season;
  const div = () => DIVS[S().div];
  const myRow = () => SEASON.standings(C).find(r => r.you);

  // ---------- screens ----------
  const made = {};
  function screen(id) {
    if (made[id]) return made[id];
    const el = document.createElement("div"); el.className = "screen car-screen"; el.id = "car_" + id; el.hidden = true;
    document.body.appendChild(el); screens["c_" + id] = el; made[id] = el; return el;
  }
  function style() {
    if (document.getElementById("careerCss")) return;
    const st = document.createElement("style"); st.id = "careerCss";
    st.textContent = `
    .car-screen{background:linear-gradient(180deg,rgba(5,10,8,.42),rgba(5,10,8,.66))}
    .car-inner{max-width:960px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:12px;padding:4px 2px 28px}
    .car-inner h2{font-size:26px;margin:0}
    .car-sub{font-size:11px;color:var(--fg-dim);letter-spacing:.1em;text-transform:uppercase;margin:2px 0}
    .car-panel{background:rgba(10,16,13,.8);border:1px solid var(--panel-line);border-radius:12px;padding:14px 16px}
    .car-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .car-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
    .car-2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
    .car-card{background:rgba(14,20,16,.92);border:1px solid var(--panel-line);border-radius:10px;padding:12px;cursor:pointer}
    .car-card.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
    .car-card.nope{cursor:default;opacity:.85}
    .car-card b{font-family:var(--font-d);font-size:16px}
    .car-chip{font-size:12px;padding:6px 11px;border-radius:999px;border:1px solid var(--panel-line);background:rgba(255,255,255,.06);color:var(--fg);cursor:pointer}
    .car-chip.sel{background:var(--accent);color:#10140f;border-color:var(--accent);font-weight:700}
    .car-chip[disabled]{opacity:.4;cursor:not-allowed}
    .car-sw{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.25);cursor:pointer;padding:0}
    .car-sw.sel{border-color:#fff;box-shadow:0 0 0 2px var(--accent)}
    .car-arow{display:grid;grid-template-columns:120px 1fr auto;gap:8px;align-items:center;margin:4px 0}
    .car-bar{height:9px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden;position:relative}
    .car-bar i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#5fc97e,#e8c35a);border-radius:5px}
    .car-bar .pot{position:absolute;top:0;bottom:0;width:2px;background:#fff8}
    .car-btn{font-family:var(--font-d);font-weight:700;letter-spacing:.04em}
    .car-step{width:30px;height:30px;border-radius:7px;border:1px solid var(--panel-line);background:rgba(255,255,255,.08);color:var(--fg);font-size:17px;cursor:pointer}
    .car-step[disabled]{opacity:.35;cursor:not-allowed}
    .car-lab{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.07em}
    .car-lab input,.car-in{background:rgba(255,255,255,.08);border:1px solid var(--panel-line);color:var(--fg);border-radius:8px;padding:9px 11px;font-size:16px;font-family:var(--font-b)}
    .car-rz{font-family:var(--font-d);font-size:15px;color:var(--accent)}
    .car-big{font-family:var(--font-d);font-weight:900;font-size:22px;line-height:1.1}
    .car-tro{display:inline-flex;align-items:center;gap:6px;background:rgba(232,195,90,.12);border:1px solid rgba(232,195,90,.4);border-radius:8px;padding:6px 10px;font-size:13px;margin:3px}
    .car-race{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 13px;border:1px solid var(--panel-line);border-radius:10px;background:rgba(255,255,255,.04);margin-bottom:7px}
    .car-race.locked{opacity:.55}
    .car-race.cur{border-color:var(--accent);background:rgba(232,195,90,.08)}
    .car-race.past{opacity:.78}
    .car-race .meta{font-size:12px;color:var(--fg-dim)}
    .car-race .gr{font-family:var(--font-d);font-size:11px;letter-spacing:.08em;color:var(--accent)}
    .car-tag{font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:999px;border:1px solid var(--panel-line);color:var(--fg-dim);white-space:nowrap}
    .car-won{color:#e8c35a;border-color:rgba(232,195,90,.5)}
    .car-ok{color:var(--good);border-color:rgba(95,201,126,.5)}
    .car-bad{color:var(--bad);border-color:rgba(226,91,74,.5)}
    .car-next{border-color:rgba(232,195,90,.55);background:linear-gradient(135deg,rgba(40,34,12,.9),rgba(10,16,13,.85))}
    .car-next h3{font-size:clamp(20px,3.6vw,28px);margin:2px 0 6px}
    .car-kv{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--fg-dim)}
    .car-kv b{color:var(--fg);font-weight:600}
    .car-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
    .car-tbl th{color:var(--fg-dim);font-size:10px;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:4px 6px;border-bottom:1px solid var(--panel-line)}
    .car-tbl td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.06)}
    .car-tbl tr.me td{color:var(--accent);font-weight:700}
    .car-tbl tr.zone td:first-child{box-shadow:inset 3px 0 0 var(--good)}
    .car-req{display:flex;gap:8px;align-items:baseline;font-size:12.5px;margin:3px 0}
    .car-req i{font-style:normal;font-weight:800;width:14px;display:inline-block}
    .car-req.ok i{color:var(--good)} .car-req.no i{color:var(--bad)}
    .car-req span{color:var(--fg-dim)}
    .car-warn{border-color:rgba(226,91,74,.6);background:rgba(60,16,12,.7)}
    .car-tabs{display:flex;gap:6px;flex-wrap:wrap}
    .car-res{font-size:12.5px;color:var(--fg-dim);display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}
    .car-res b{color:var(--fg)}
    #resCareerPanel{width:min(680px,100%);padding:12px 16px;text-align:center}
    #resCareerPanel .cp-pos{font-family:var(--font-d);font-weight:900;font-size:clamp(18px,3.4vw,26px);letter-spacing:.04em}
    #resCareerPanel .cp-pts{font-family:var(--font-d);font-weight:800;font-size:18px;color:var(--accent);margin-top:2px}
    #resCareerPanel .cp-sub{font-size:13px;color:var(--fg-dim);margin-top:4px}
    @media (max-width:640px){.car-arow{grid-template-columns:90px 1fr auto}.car-tbl .hide-s{display:none}}
    `;
    document.head.appendChild(st);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const navBtn = (label, fn, cls) => { const b = document.createElement("button"); b.className = "btn " + (cls || ""); b.textContent = label; b.onclick = fn; return b; };
  const page = (el, html) => { el.innerHTML = `<div class="menu-inner" style="max-width:980px"><div class="car-inner">${html}</div></div>`; el.scrollTop = 0; };
  const posTxt = n => ordinal(n);
  function resLabel(e) { return !e ? "—" : e.place > 0 ? ordinal(e.place) : "DNF"; }

  // ---------- HUB / DASHBOARD ----------
  function openHub() {
    style();
    const el = screen("hub"), h = activeHorse(), s = S(), D = div(), list = SEASON.standings(C), me = list.find(r => r.you);
    const over = SEASON.done(s);
    const nextIdx = s.cur, nm = over ? null : SEASON.roundDef(s, nextIdx), rd = over ? null : s.rounds[nextIdx];
    const nextMajor = over ? null : D.rounds.find((r, i) => i >= nextIdx && r.major);
    const top = list.slice(0, 5); if (!top.includes(me)) top.push(me);
    const recent = [];
    C.horses.forEach(x => (x.history || []).forEach(e => recent.push(Object.assign({ horse: x.name }, e))));
    recent.sort((a, b) => (b.t || 0) - (a.t || 0));
    const nextHtml = !h ? `<div class="car-panel">No horses yet — create your first one to begin your career. Your stable starts in the <b>${D.name}</b>.</div>`
      : over ? `<div class="car-panel car-next"><div class="car-sub">Season ${s.n} · ${D.name}</div><h3>SEASON COMPLETE</h3>
          <div class="car-kv"><span>Your stable finished <b>${posTxt(me.rank)}</b> of ${list.length}</span><span><b>${me.pts}</b> points</span><span>Champion: <b>${esc(list[0].name)}</b></span></div>
          <div class="car-row" style="margin-top:10px"><button class="btn primary" id="hubFinish">View Final Standings</button></div></div>`
      : `<div class="car-panel car-next"><div class="car-sub">Next event · Round ${nextIdx + 1} of ${s.rounds.length}${nm.major ? " · ★ Feature race" : ""}</div>
          <h3>${esc(nm.name)}</h3>
          <div class="car-kv"><span><b>${esc(nm.venue)}</b></span><span><b>${fmtDist(nm.dist)}</b> ${distLbl(nm.dist)}</span><span><b>${going(rd.going)}</b> going</span><span>${esc(nm.grade)}</span><span>Prize <b>${nm.prize}</b></span><span>Field <b>${nm.field}</b></span><span>Stable standing <b>${posTxt(me.rank)}</b></span></div>
          <div class="car-row" style="margin-top:12px"><button class="btn primary" id="hubEnter">Select Horse &amp; Enter</button><button class="btn" id="hubView">View Event</button><button class="btn" id="hubSkip">Skip Round</button></div></div>`;
    page(el, `
      <div class="car-panel car-row" style="justify-content:space-between;align-items:flex-end">
        <div><div class="car-sub">Career Mode</div><h2 id="hubStable" title="Click to rename your stable" style="cursor:pointer">${esc(C.stable)} <span style="font-size:14px;color:var(--fg-dim)">✎</span></h2></div>
        <div class="car-row" style="gap:18px">
          <div><div class="car-sub">Season</div><div class="car-big">${s.n}</div></div>
          <div><div class="car-sub">Championship</div><div class="car-big" style="font-size:16px">${D.name}</div></div>
          <div><div class="car-sub">Round</div><div class="car-big">${Math.min(s.cur + 1, s.rounds.length)}<span style="font-size:13px;color:var(--fg-dim)">/${s.rounds.length}</span></div></div>
          <div><div class="car-sub">Position</div><div class="car-big" style="color:var(--accent)">${posTxt(me.rank)}</div></div>
          <div><div class="car-sub">Points</div><div class="car-big">${me.pts}</div></div>
        </div>
      </div>
      ${nextHtml}
      <div class="car-2col">
        <div class="car-panel"><div class="car-row" style="justify-content:space-between"><div class="car-sub">Championship standings</div><button class="car-chip" id="hubStand">Full table</button></div>
          <table class="car-tbl" style="margin-top:6px"><tr><th>#</th><th>Stable</th><th>Pts</th><th class="hide-s">Wins</th><th>Gap</th></tr>
          ${top.map(r => `<tr class="${r.you ? "me" : ""}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.pts}</td><td class="hide-s">${r.wins}</td><td>${r.behind ? "−" + r.behind : "—"}</td></tr>`).join("")}</table>
          ${D.promote ? `<div style="font-size:11.5px;color:var(--fg-dim);margin-top:6px">Top ${D.promote} at season's end are promoted to the ${DIVS[D.id + 1].name}.</div>` : `<div style="font-size:11.5px;color:var(--fg-dim);margin-top:6px">The top championship — win it outright.</div>`}
        </div>
        <div class="car-panel"><div class="car-sub">Recent results</div>
          ${recent.slice(0, 6).map(e => `<div class="car-res"><span><b>${esc(e.horse)}</b> · ${esc(e.name || "")}${e.off === false ? " <i>(optional)</i>" : ""}</span><span>${e.dnf ? "DNF" : ordinal(e.place)}${e.field ? "/" + e.field : ""}</span></div>`).join("") || `<div style="font-size:13px;color:var(--fg-dim)">No races yet.</div>`}
          ${nextMajor ? `<div class="car-sub" style="margin-top:10px">Upcoming feature</div><div style="font-size:13px"><b>${esc(nextMajor.name)}</b> · ${esc(nextMajor.venue)} · ${fmtDist(nextMajor.dist)} · round ${nextMajor.round + 1}</div>` : ""}
        </div>
      </div>
      ${h ? `<div class="car-panel"><div class="car-sub">Selected horse</div>${horseSummary(h)}</div>` : ""}
      <div class="car-row" id="hubBtns"></div>`);
    const row = el.querySelector("#hubBtns");
    if (h) {
      row.appendChild(navBtn("Optional Races", () => openOptional()));
      row.appendChild(navBtn("Season Calendar", () => openCalendar()));
      row.appendChild(navBtn("Training", () => openTraining()));
    }
    row.appendChild(navBtn("Stable", () => openStable()));
    row.appendChild(navBtn(h ? "Create Horse" : "Create Your Horse", () => openCreate(), h ? "" : "primary"));
    row.appendChild(navBtn("Trophy Cabinet", () => openTrophies()));
    row.appendChild(navBtn("Championship History", () => openHistory()));
    row.appendChild(navBtn("Main Menu", () => { race = null; show("menu"); }));
    const q = id => el.querySelector(id);
    if (q("#hubEnter")) q("#hubEnter").onclick = () => openEvent(nextIdx, false);
    if (q("#hubView")) q("#hubView").onclick = () => openEvent(nextIdx, false);
    if (q("#hubSkip")) q("#hubSkip").onclick = () => openEvent(nextIdx, true);
    if (q("#hubFinish")) q("#hubFinish").onclick = () => openSeasonEnd();
    q("#hubStand").onclick = () => openStandings();
    q("#hubStable").onclick = () => renameStable(q("#hubStable"));
    if (h) previewHorse(toDef(h));
    show("c_hub");
  }
  function renameStable(hEl) {
    const inp = document.createElement("input"); inp.className = "car-in"; inp.maxLength = 22; inp.value = C.stable;
    hEl.replaceWith(inp); inp.focus(); inp.select();
    const done = () => { C.stable = cleanName(inp.value, C.stable); save(); openHub(); };
    inp.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") done(); if (e.key === "Escape") openHub(); });
    inp.addEventListener("blur", done);
  }
  function horseSummary(h) {
    const st = detectStyle(h.attrs);
    return `<div class="car-row" style="justify-content:space-between;align-items:flex-start">
      <div><b style="font-family:var(--font-d);font-size:19px">${esc(h.name)}</b>
        <div style="font-size:13px;color:var(--fg-dim)">${st.label} · prefers ${st.dist}</div>
        <div style="font-size:12px;color:var(--fg-dim);margin-top:4px">Level ${h.lvl} · ${h.races} runs · ${h.wins} wins · ${h.podiums} placings · ${h.champPts} championship pts</div>
        <div style="font-size:12px;color:var(--fg-dim);margin-top:2px">Sprint ${SEASON.sprintIdx(h.attrs)} · Staying ${SEASON.stayIdx(h.attrs)}</div></div>
      <div style="text-align:right"><div class="car-sub">Rating</div><b class="car-rz" style="font-size:24px">${rating(h)}</b>
        <div class="car-sub" style="margin-top:4px">Potential ${potRating(h)}</div>
        <div style="font-size:12px;color:var(--accent)">${h.trainPts} training pts</div></div></div>`;
  }

  // ---------- EVENT VIEW + HORSE SELECTION (official round or optional race) ----------
  function openEvent(idxOrId, askSkip) {
    style();
    const el = screen("event"), s = S();
    const optional = typeof idxOrId === "string";
    const meta = optional ? BY_ID[idxOrId] : SEASON.roundDef(s, idxOrId);
    const idx = optional ? null : idxOrId;
    if (!optional && (idx !== s.cur || SEASON.done(s))) return openHub();
    const rd = optional ? null : s.rounds[idx];
    const g = optional ? "good" : rd.going;
    const reqHtml = (meta.req || []).length ? meta.req.map(rq => `<div class="car-req"><i>•</i>${esc(reqText(rq))}</div>`).join("") : `<div class="car-req"><i>•</i>Open to every horse in the stable</div>`;
    const cards = C.horses.map((h, i) => {
      const el2 = SEASON.eligibility(h, meta), st = detectStyle(h.attrs);
      return `<div class="car-card${el2.ok ? "" : " nope"}" data-h="${i}">
        <div class="car-row" style="justify-content:space-between"><b>${esc(h.name)}</b><span class="car-rz">${rating(h)}</span></div>
        <div style="font-size:12px;color:var(--fg-dim);margin:3px 0">${st.label} · prefers ${st.dist}</div>
        <div style="font-size:12px;margin-bottom:6px">Sprint ${SEASON.sprintIdx(h.attrs)} · Staying ${SEASON.stayIdx(h.attrs)} · ${h.wins}W / ${h.races}R</div>
        ${el2.reqs.map(r => `<div class="car-req ${r.ok ? "ok" : "no"}"><i>${r.ok ? "✓" : "✗"}</i><div>${esc(r.label)}: <span>${esc(r.detail)}</span></div></div>`).join("")}
        <div style="margin-top:8px">${el2.ok ? `<button class="btn primary small car-btn" data-go="${i}">Enter ${esc(h.name)}</button>` : `<span class="car-tag car-bad">Not qualified</span>`}</div>
      </div>`;
    }).join("");
    const me = myRow();
    page(el, `
      <div class="car-panel car-next">
        <div class="car-sub">${optional ? "Optional race · experience & records only — no championship points" : `Season ${s.n} · ${div().name} · Round ${idx + 1} of ${s.rounds.length}`}</div>
        <h3>${meta.crown ? "★ " : ""}${esc(meta.name)}</h3>
        <div class="car-kv"><span><b>${esc(meta.venue)}</b></span><span><b>${fmtDist(meta.dist)}</b> ${distLbl(meta.dist)}</span><span><b>${going(g)}</b> going</span><span>${esc(meta.grade)}</span><span>Field <b>${meta.field}</b></span>${meta.prize ? `<span>Prize <b>${meta.prize}</b></span>` : ""}${optional ? "" : `<span>Stable standing <b>${posTxt(me.rank)}</b> · ${me.pts} pts</span>`}</div>
        ${meta.note ? `<div style="font-size:12.5px;margin-top:6px;color:var(--accent)">${esc(meta.note)}</div>` : ""}
        <div class="car-sub" style="margin-top:10px">Entry requirements</div>${reqHtml}
        ${optional ? "" : `<div style="font-size:12px;color:var(--fg-dim);margin-top:6px">One horse represents ${esc(C.stable)} in this round. Points: 1st 15 · 2nd 12 · 3rd 10 · 4th 8 · 5th 6 · 6th 5 · 7th 4 · 8th 3 · 9th 2 · 10th 1. Chaos Mode is never used in championship racing.</div>`}
      </div>
      <div id="evSkip"></div>
      <div class="car-sub">Choose a horse${optional ? "" : " to represent the stable"}</div>
      <div class="car-grid">${cards || `<div class="car-panel">No horses in the stable yet.</div>`}</div>
      <div class="car-row" id="evBtns"></div>`);
    const b = el.querySelector("#evBtns");
    if (!optional) b.appendChild(navBtn("Skip This Round", () => drawSkip()));
    b.appendChild(navBtn("Back", () => optional ? openOptional() : openHub()));
    el.querySelectorAll("[data-go]").forEach(x => x.onclick = (e) => { e.stopPropagation(); const i = +x.getAttribute("data-go"); optional ? enterOptional(meta.id, i) : enterOfficial(idx, i); });
    el.querySelectorAll(".car-card[data-h]").forEach(c => c.onclick = () => { const i = +c.getAttribute("data-h"); C.active = i; save(); previewHorse(toDef(C.horses[i])); el.querySelectorAll(".car-card").forEach(x => x.classList.toggle("sel", x === c)); });
    function drawSkip() {
      const box = el.querySelector("#evSkip");
      box.innerHTML = `<div class="car-panel car-warn"><b style="font-family:var(--font-d)">Skip ${esc(meta.name)}?</b>
        <div style="font-size:13px;margin:6px 0 10px">The championship moves on to the next round. Your stable scores <b>no points</b> for this round, the other stables' results are decided without you and recorded, and you <b>cannot come back</b> to race it for points later this season. Optional races are unaffected.</div>
        <div class="car-row"><button class="btn primary" id="skYes">Skip Round ${idx + 1}</button><button class="btn" id="skNo">Cancel</button></div></div>`;
      box.querySelector("#skYes").onclick = () => doSkip(idx);
      box.querySelector("#skNo").onclick = () => { box.innerHTML = ""; };
      box.scrollIntoView({ block: "center" });
    }
    if (askSkip && !optional) drawSkip();
    const a = activeHorse(); if (a) previewHorse(toDef(a));
    show("c_event");
  }
  function reqText(rq) {
    if (rq.k === "rating") return "Horse rating " + rq.min + " or higher";
    if (rq.k === "sprint") return "Sprinting ability " + rq.min + " or higher (average of top speed, acceleration and sprint power)";
    if (rq.k === "stamina") return "Staying ability " + rq.min + " or higher (average of endurance and recovery)";
    if (rq.k === "result") return rq.label + ": " + rq.hint + " (within the horse's last " + rq.within + " runs)";
    if (rq.k === "form") return rq.label + ": " + rq.hint;
    return "";
  }
  function doSkip(idx) {
    const s = S(); if (idx !== s.cur) return openHub();
    const meta = SEASON.roundDef(s, idx);
    const r = SEASON.skipRound(C); save();
    if (r) { const w = r.res.find(e => e.place === 1); toast("Round skipped · " + meta.name + " won by " + (w ? w.name : "—"), "info", 2.4); }
    openHub();
  }

  // ---------- OPTIONAL RACES ----------
  function openOptional() {
    style(); const el = screen("opt"), h = activeHorse();
    const rows = SEASON.OPTIONAL.map(r => {
      const ok = h ? SEASON.eligibility(h, r).ok : false;
      return `<div class="car-race${ok ? "" : " locked"}">
        <div><div class="car-row" style="gap:8px"><span class="gr">${esc(r.grade)}</span></div>
          <b style="font-family:var(--font-d);font-size:16px">${esc(r.name)}</b>
          <div class="meta">${esc(r.venue)} · ${fmtDist(r.dist)} ${distLbl(r.dist)} · field of ${r.field}${r.note ? " · " + esc(r.note) : ""}</div></div>
        <div><button class="btn${ok ? " primary" : ""} small car-btn" data-o="${r.id}">${ok ? "Select" : "Details"}</button></div></div>`;
    }).join("");
    page(el, `<h2>Optional Races</h2>
      <div class="car-sub">Race whenever you like — develop horses, test distances, chase qualifications. These never award championship points, never advance the season and never count as championship titles.</div>
      <div style="font-size:12.5px;color:var(--fg-dim)">Experience is worth most against a field near your horse's own level: beating a much weaker field earns very little.</div>
      <div class="car-panel">${rows}</div>
      <div class="car-row"><button class="btn" id="optBack">Back</button></div>`);
    el.querySelectorAll("[data-o]").forEach(b => b.onclick = () => openEvent(b.getAttribute("data-o"), false));
    el.querySelector("#optBack").onclick = () => openHub();
    show("c_opt");
  }

  // ---------- CALENDAR ----------
  function openCalendar() {
    style(); const el = screen("cal"), s = S(), D = div();
    const rows = s.rounds.map((rd, i) => {
      const m = SEASON.roundDef(s, i), cur = i === s.cur, past = i < s.cur;
      let status = "";
      if (rd.st === "done") { const me = rd.res.find(e => e.sid === "player"), w = rd.res.find(e => e.place === 1);
        status = `<span class="car-tag ${me && me.place === 1 ? "car-won" : "car-ok"}">You: ${resLabel(me)} · ${me ? esc(me.name) : ""}</span><div class="meta" style="text-align:right;margin-top:3px">Won by ${w ? esc(w.name) : "—"}</div>`; }
      else if (rd.st === "skip") { const w = rd.res.find(e => e.place === 1); status = `<span class="car-tag">Not entered</span><div class="meta" style="text-align:right;margin-top:3px">Won by ${w ? esc(w.name) : "—"}</div>`; }
      else if (cur) status = `<span class="car-tag car-won">Current round</span>`;
      else { const any = C.horses.some(h => SEASON.eligibility(h, m).ok); status = any ? `<span class="car-tag">Upcoming</span>` : `<span class="car-tag car-bad">No horse qualified yet</span>`; }
      return `<div class="car-race${cur ? " cur" : ""}${past ? " past" : ""}">
        <div><div class="car-row" style="gap:8px"><span class="gr">R${i + 1} · ${esc(m.grade)}</span>${m.crown ? '<span class="car-tag car-won">★ Crown jewel</span>' : m.major ? '<span class="car-tag car-won">Feature</span>' : ""}</div>
          <b style="font-family:var(--font-d);font-size:16px">${esc(m.name)}</b>
          <div class="meta">${esc(m.venue)} · ${fmtDist(m.dist)} ${distLbl(m.dist)} · ${going(rd.going)} · ${m.prize}</div></div>
        <div style="text-align:right">${status}</div></div>`;
    }).join("");
    page(el, `<h2>Season ${s.n} Calendar</h2>
      <div class="car-sub">${D.name} · ${s.rounds.length} rounds · round ${Math.min(s.cur + 1, s.rounds.length)} next</div>
      <div class="car-panel">${rows}</div>
      <div class="car-row"><button class="btn" id="calOpt">Optional Races</button><button class="btn" id="calBack">Back</button></div>`);
    el.querySelector("#calBack").onclick = () => openHub();
    el.querySelector("#calOpt").onclick = () => openOptional();
    show("c_cal");
  }

  // ---------- STANDINGS ----------
  function standingsTable(list, promote) {
    return `<table class="car-tbl"><tr><th>#</th><th>Stable</th><th>Pts</th><th>Starts</th><th>Wins</th><th class="hide-s">2nds</th><th class="hide-s">Podiums</th><th>Behind</th></tr>
      ${list.map(r => `<tr class="${r.you ? "me" : ""}${promote && r.rank <= promote ? " zone" : ""}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.pts}</td><td>${r.starts}</td><td>${r.wins}</td><td class="hide-s">${r.seconds}</td><td class="hide-s">${r.podiums}</td><td>${r.behind ? "−" + r.behind : "—"}</td></tr>`).join("")}</table>`;
  }
  function openStandings() {
    style(); const el = screen("stand"), s = S(), D = div(), list = SEASON.standings(C);
    page(el, `<h2>Championship Standings</h2>
      <div class="car-sub">Season ${s.n} · ${D.name} · after ${s.cur} of ${s.rounds.length} rounds</div>
      <div class="car-panel">${standingsTable(list, D.promote)}
        <div style="font-size:11.5px;color:var(--fg-dim);margin-top:8px">Ties are split by wins, then second places, then the best feature-race result.${D.promote ? ` Green bar: promotion zone (top ${D.promote}).` : ""}</div></div>
      <div class="car-row"><button class="btn" id="stBack">Back</button></div>`);
    el.querySelector("#stBack").onclick = () => openHub();
    show("c_stand");
  }

  // ---------- SEASON END ----------
  function openSeasonEnd() {
    style(); const el = screen("send"), s = S(), D = div(), list = SEASON.standings(C), me = list.find(r => r.you);
    if (!SEASON.done(s)) return openHub();
    const champ = me.rank === 1, promo = D.promote && me.rank <= D.promote && D.id < DIVS.length - 1;
    page(el, `<h2>${champ ? "🏆 " + esc(C.stable) + " — Champions!" : "Season " + s.n + " Complete"}</h2>
      <div class="car-panel car-next"><div class="car-sub">${D.name}</div>
        <div class="car-kv" style="font-size:15px"><span>Final position <b>${posTxt(me.rank)}</b> of ${list.length}</span><span><b>${me.pts}</b> points</span><span><b>${me.wins}</b> wins from ${me.starts} starts</span></div>
        <div style="margin-top:8px;font-size:14px">${champ ? `You win the ${D.name}! ` : ""}${promo ? `Promoted to the <b>${DIVS[D.id + 1].name}</b> for next season.` : D.promote ? `Finish in the top ${D.promote} to earn promotion — you stay in the ${D.name}.` : `You stay in the ${D.name}, the top championship.`}</div></div>
      <div class="car-panel">${standingsTable(list, D.promote)}</div>
      <div class="car-row"><button class="btn primary" id="seGo">Finish Season &amp; Start Season ${s.n + 1}</button><button class="btn" id="seBack">Back</button></div>`);
    el.querySelector("#seGo").onclick = () => {
      const r = SEASON.closeSeason(C); save();
      if (r && r.trophy) setTimeout(() => toast("Championship trophy added to the cabinet", "gold", 2.4), 300);
      openHub();
    };
    el.querySelector("#seBack").onclick = () => openHub();
    show("c_send");
  }

  // ---------- HISTORY ----------
  function openHistory() {
    style(); const el = screen("hist");
    const H = (C.history || []).slice().reverse();
    const cards = H.map(e => `<div class="car-panel">
      <div class="car-row" style="justify-content:space-between"><div><div class="car-sub">Season ${e.n} · ${esc(e.divName)}</div>
        <b style="font-family:var(--font-d);font-size:18px">Champion: ${esc(e.champion.name)}${e.champion.you ? " (you)" : ""}</b> <span style="color:var(--fg-dim)">${e.champion.pts} pts</span></div>
        <div style="text-align:right"><div class="car-sub">Your stable</div><b class="car-rz" style="font-size:20px">${ordinal(e.playerPos)}</b><div style="font-size:12px;color:var(--fg-dim)">${e.playerPts} pts · ${e.playerWins} wins${e.promoted ? " · promoted" : ""}</div></div></div>
      ${e.majors.length ? `<div style="font-size:12.5px;margin-top:6px">${e.majors.map(m => `<span class="car-tag ${m.you ? "car-won" : ""}" style="display:inline-block;margin:2px">${esc(m.race)}: ${esc(m.horse)}</span>`).join("")}</div>` : ""}
      <div style="font-size:12px;color:var(--fg-dim);margin-top:4px">Horses used: ${e.horsesUsed.length ? e.horsesUsed.map(esc).join(", ") : "—"} · entered ${e.entered}, skipped ${e.skipped}</div>
      <details style="margin-top:6px"><summary style="cursor:pointer;font-size:12px;color:var(--fg-dim)">Final standings</summary>
        <table class="car-tbl">${e.standings.map((r, i) => `<tr class="${r.you ? "me" : ""}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.pts}</td><td>${r.wins}W</td></tr>`).join("")}</table></details>
    </div>`).join("");
    page(el, `<h2>Championship History</h2>
      <div class="car-sub">Every completed season, recorded permanently</div>
      ${cards || `<div class="car-panel">No completed seasons yet. Finish a season to record it here.</div>`}
      <div class="car-row"><button class="btn" id="hiBack">Back</button></div>`);
    el.querySelector("#hiBack").onclick = () => openHub();
    show("c_hist");
  }

  // ---------- CREATE ----------
  let draft = null;
  function newDraft() {
    const a = {}; for (const k of AKEYS) a[k] = FLOOR;
    return { name: "", coat: 0, face: "none", sock: 0, mane: 1, tail: 1, build: 1, silk: 0, silk2: 6, pat: 1, attrs: a };
  }
  function draftDef() {
    const coat = COATS[draft.coat], mane = HAIR[draft.mane], tail = HAIR[draft.tail];
    return {
      name: draft.name.trim() || "New Horse", role: detectStyle(draft.attrs).label, style: detectStyle(draft.attrs).code,
      coat: parseInt(coat.hex.slice(1), 16), silk: SILK_PAL[draft.silk], silk2: SILK_PAL[draft.silk2], silkPat: PATTERNS[draft.pat],
      look: { type: coat.type, coat: coat.hex, face: draft.face, socks: SOCKS[draft.sock].v, maneCol: mane.hex, tailCol: tail.hex, build: BUILDS[draft.build].v },
      attrs: Object.assign({}, draft.attrs),
    };
  }
  function openCreate() {
    style(); draft = newDraft();
    const el = screen("create");
    drawCreate(el);
    show("c_create");
    previewHorse(draftDef());
  }
  function spent() { return AKEYS.reduce((s, k) => s + (draft.attrs[k] - FLOOR), 0); }
  function drawCreate(el) {
    const remaining = POOL - spent();
    const chips = (arr, sel, onPick, fmt) => arr.map((o, i) => `<button class="car-chip${i === sel ? " sel" : ""}" data-i="${i}">${fmt(o, i)}</button>`).join("");
    const sw = (arr, sel) => arr.map((c, i) => `<button class="car-sw${i === sel ? " sel" : ""}" data-i="${i}" style="background:${c.hex || c}"></button>`).join("");
    const st = detectStyle(draft.attrs);
    page(el, `
      <h2>Create Your Horse</h2>
      <div class="car-panel">
        <div class="car-row"><label class="car-lab" style="flex:1">Horse name<input id="cName" maxlength="22" placeholder="Name your horse" value="${esc(draft.name)}"></label></div>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-top:4px">The race commentator will call this name.</div>
      </div>
      <div class="car-panel">
        <div class="car-sub">Appearance</div>
        <div class="car-sub" style="margin-top:8px">Coat</div><div class="car-row" data-g="coat">${chips(COATS, draft.coat, 0, o => o.name)}</div>
        <div class="car-sub" style="margin-top:8px">Face marking</div><div class="car-row" data-g="face">${chips(FACES, FACES.indexOf(draft.face), 0, o => o[0].toUpperCase() + o.slice(1))}</div>
        <div class="car-sub" style="margin-top:8px">Legs / socks</div><div class="car-row" data-g="sock">${chips(SOCKS, draft.sock, 0, o => o.name)}</div>
        <div class="car-sub" style="margin-top:8px">Build</div><div class="car-row" data-g="build">${chips(BUILDS, draft.build, 0, o => o.name)}</div>
        <div class="car-sub" style="margin-top:8px">Mane colour</div><div class="car-row" data-g="mane">${sw(HAIR, draft.mane)}</div>
        <div class="car-sub" style="margin-top:8px">Tail colour</div><div class="car-row" data-g="tail">${sw(HAIR, draft.tail)}</div>
      </div>
      <div class="car-panel">
        <div class="car-sub">Jockey silks</div>
        <div class="car-sub" style="margin-top:8px">Primary</div><div class="car-row" data-g="silk">${sw(SILK_PAL, draft.silk)}</div>
        <div class="car-sub" style="margin-top:8px">Secondary</div><div class="car-row" data-g="silk2">${sw(SILK_PAL, draft.silk2)}</div>
        <div class="car-sub" style="margin-top:8px">Pattern</div><div class="car-row" data-g="pat">${chips(PATTERNS, draft.pat, 0, o => o[0].toUpperCase() + o.slice(1))}</div>
      </div>
      <div class="car-panel">
        <div class="car-row" style="justify-content:space-between"><div class="car-sub">Attributes — spend your development points</div>
          <div>Remaining: <b class="car-rz" id="cPool">${remaining}</b> / ${POOL}</div></div>
        <div style="font-size:12px;color:var(--fg-dim);margin:4px 0 8px">Predicted style: <b style="color:var(--accent)" id="cStyle">${st.label}</b> · prefers ${st.dist}. Spend all your points for a rating of about ${Math.round(FLOOR + POOL / 8)}. Specialise: The Everest needs sprinting ability, the Melbourne Cup needs staying ability.</div>
        <div id="cAttrs"></div>
      </div>
      <div class="car-row" id="cBtns"></div>`);
    el.querySelectorAll("[data-g]").forEach(g => {
      const key = g.getAttribute("data-g");
      g.querySelectorAll("button").forEach(b => b.onclick = () => {
        const i = +b.getAttribute("data-i");
        if (key === "face") draft.face = FACES[i]; else draft[key] = i;
        previewHorse(draftDef());
        const y = el.scrollTop; drawCreate(el); el.scrollTop = y;
      });
    });
    const nameEl = el.querySelector("#cName");
    nameEl.addEventListener("input", e => { draft.name = e.target.value; });
    nameEl.addEventListener("keydown", e => e.stopPropagation());
    drawAttrRows(el.querySelector("#cAttrs"), draft.attrs, { create: true, remaining: () => POOL - spent(), onChange: () => { el.querySelector("#cPool").textContent = POOL - spent(); el.querySelector("#cStyle").textContent = detectStyle(draft.attrs).label; previewHorse(draftDef()); } });
    const btns = el.querySelector("#cBtns");
    btns.appendChild(navBtn("Reset points", () => { for (const k of AKEYS) draft.attrs[k] = FLOOR; drawCreate(el); }));
    btns.appendChild(navBtn("Confirm & Add to Stable", () => confirmCreate(), "primary"));
    btns.appendChild(navBtn("Cancel", () => openHub()));
  }
  // attribute rows (shared by create + training)
  function drawAttrRows(host, attrs, opt) {
    host.innerHTML = "";
    for (const [k, label] of ATTRS) {
      const row = document.createElement("div"); row.className = "car-arow";
      const pot = opt.pot ? opt.pot[k] : CREATE_CAP;
      row.innerHTML = `<div style="font-size:13px">${label}</div>
        <div class="car-bar"><i style="width:${attrs[k]}%"></i><div class="pot" style="left:${pot}%"></div></div>
        <div class="car-row" style="gap:6px"><button class="car-step" data-d="-1">−</button><b style="width:26px;text-align:center">${attrs[k]}</b><button class="car-step" data-d="1">+</button></div>`;
      const [minus, plus] = row.querySelectorAll(".car-step");
      const cap = opt.create ? CREATE_CAP : pot;
      if (opt.create) { minus.disabled = attrs[k] <= FLOOR; plus.disabled = attrs[k] >= cap || opt.remaining() <= 0; }
      else { const cost = upgCost(attrs[k]); plus.disabled = attrs[k] >= cap || opt.points() < cost; minus.disabled = true; plus.title = "Costs " + cost + " training pt" + (cost > 1 ? "s" : ""); }
      plus.onclick = () => {
        if (opt.create) { if (attrs[k] < cap && opt.remaining() > 0) attrs[k]++; }
        else { const cost = upgCost(attrs[k]); if (attrs[k] < cap && opt.points() >= cost) { opt.spend(cost); attrs[k]++; } }
        opt.onChange(); drawAttrRows(host, attrs, opt);
      };
      minus.onclick = () => { if (opt.create && attrs[k] > FLOOR) { attrs[k]--; opt.onChange(); drawAttrRows(host, attrs, opt); } };
      host.appendChild(row);
    }
  }
  function genPotential(attrs) {
    // a fixed lifetime growth headroom, distributed unevenly → each horse has real talents and real limits
    const w = AKEYS.map(() => 0.3 + Math.random()); const sum = w.reduce((a, b) => a + b, 0);
    const pot = {};
    AKEYS.forEach((k, i) => { const hr = Math.round(HEADROOM * w[i] / sum); pot[k] = clampN(attrs[k] + Math.max(4, hr), attrs[k], 99); });
    return pot;
  }
  function confirmCreate() {
    const name = cleanName(draft.name, "");
    if (!name) { toast("Give your horse a name first", "warn", 1.4); return; }
    if (C.horses.some(h => h.name.toLowerCase() === name.toLowerCase())) { toast("You already have a horse called " + esc(name), "warn", 1.8); return; }
    if (C.horses.length >= slots()) { toast("Stable is full — win more races to unlock slots", "warn", 2); return; }
    const d = draftDef();
    const h = sanHorse({
      name, look: d.look, silk: d.silk, silk2: d.silk2, silkPat: d.silkPat,
      attrs: Object.assign({}, draft.attrs), pot: genPotential(draft.attrs),
      xp: 0, trainPts: 0, lvl: 1, races: 0, wins: 0, places: 0, podiums: 0, history: [],
    });
    C.horses.push(h); C.active = C.horses.length - 1; save();
    toast(esc(h.name) + " joins the stable!", "good", 1.8);
    openHub();
  }

  // ---------- STABLE ----------
  function openStable() {
    style(); const el = screen("stable");
    const cards = C.horses.map((h, i) => {
      const st = detectStyle(h.attrs);
      return `<div class="car-card${i === C.active ? " sel" : ""}" data-i="${i}">
        <div class="car-row" style="justify-content:space-between"><b>${esc(h.name)}</b><span class="car-rz">${rating(h)}</span></div>
        <div style="font-size:12px;color:var(--fg-dim);margin:3px 0">${st.label} · ${st.dist}</div>
        <div style="font-size:12px">Lvl ${h.lvl} · ${h.wins}W / ${h.races}R · ${h.champPts} champ pts${h.trainPts ? ` · <span style="color:var(--accent)">${h.trainPts} pts</span>` : ""}</div>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-top:2px">Sprint ${SEASON.sprintIdx(h.attrs)} · Staying ${SEASON.stayIdx(h.attrs)} · potential ${potRating(h)}</div>
      </div>`;
    }).join("");
    const empty = C.horses.length < slots() ? `<div class="car-card" data-new="1" style="border-style:dashed;text-align:center;opacity:.8"><b>+ New horse</b><div style="font-size:12px;color:var(--fg-dim)">${C.horses.length}/${slots()} slots used</div></div>` : "";
    page(el, `<h2>Your Stable</h2>
      <div class="car-sub">${esc(C.stable)} · ${C.horses.length}/${slots()} horses · more slots at ${SLOT_AT.filter(x => x[0] > C.wins).map(x => x[0]).slice(0, 1).join("") || "—"} career wins (you have ${C.wins})</div>
      <div class="car-grid">${cards}${empty}</div>
      <div class="car-row" id="sBtns"></div>`);
    el.querySelectorAll(".car-card[data-i]").forEach(c => c.onclick = () => { C.active = +c.getAttribute("data-i"); save(); openStable(); });
    const nw = el.querySelector("[data-new]"); if (nw) nw.onclick = () => openCreate();
    const b = el.querySelector("#sBtns");
    if (activeHorse()) b.appendChild(navBtn("Train selected horse", () => openTraining()));
    b.appendChild(navBtn("Back", () => openHub()));
    if (activeHorse()) previewHorse(toDef(activeHorse()));
    show("c_stable");
  }

  // ---------- TRAINING ----------
  function openTraining() {
    style(); const h = activeHorse(); if (!h) return openHub();
    const el = screen("train");
    const spend = draftAttrsCopy(h.attrs);
    let pts = h.trainPts, used = 0;
    const st = () => detectStyle(spend);
    function redraw() {
      page(el, `
        <h2>Training — ${esc(h.name)}</h2>
        <div class="car-panel"><div class="car-row" style="justify-content:space-between">
          <div><div class="car-sub">Level ${h.lvl}</div><div style="font-size:12px;color:var(--fg-dim)">${h.races} runs · ${h.wins} wins</div></div>
          <div style="text-align:right"><div class="car-sub">Training points</div><b class="car-rz" style="font-size:22px" id="tPts">${pts - used}</b></div>
          <div style="text-align:right"><div class="car-sub">Style</div><b id="tStyle">${st().label}</b></div>
          <div style="text-align:right"><div class="car-sub">XP to next level</div><b>${Math.max(0, xpForLevel(h.lvl) - h.xp)}</b></div>
        </div>
        <div class="car-bar" style="margin-top:8px"><i style="width:${Math.min(100, 100 * h.xp / xpForLevel(h.lvl))}%"></i></div>
        <div style="font-size:12px;color:var(--fg-dim);margin-top:6px">Every race earns training points (about one per ${XP_PER_PT} experience). Races against stronger fields earn far more.</div></div>
        <div class="car-panel"><div class="car-sub">Spend training points (white mark = this horse's potential ceiling — upgrades cost more as a stat rises)</div><div id="tAttrs" style="margin-top:8px"></div></div>
        <div class="car-row" id="tBtns"></div>`);
      drawAttrRows(el.querySelector("#tAttrs"), spend, {
        create: false, pot: h.pot, points: () => pts - used, spend: n => used += n,
        onChange: () => { el.querySelector("#tPts").textContent = pts - used; el.querySelector("#tStyle").textContent = st().label; previewHorse(mergeDef(h, spend)); },
      });
      const b = el.querySelector("#tBtns");
      b.appendChild(navBtn("Apply training", () => { h.attrs = spend; h.trainPts = pts - used; save(); toast("Training applied — rating now " + rating(h), "good", 1.6); openHub(); }, "primary"));
      b.appendChild(navBtn("Cancel", () => openHub()));
    }
    redraw(); previewHorse(toDef(h)); show("c_train");
  }
  function draftAttrsCopy(a) { const o = {}; for (const k of AKEYS) o[k] = a[k]; return o; }
  function mergeDef(h, attrs) { const d = toDef(h); d.attrs = Object.assign({}, attrs); d.style = detectStyle(attrs).code; d.role = detectStyle(attrs).label; return d; }

  // ---------- running a career race ----------
  // Official and optional races both build their race config here. Competitive conditions are fixed:
  // chaos off (no kick, no chaos AI), no stamina assist, no experimental options — whatever Quick Race was set to.
  let pending = null;
  function competitiveCfg(meta, h, oppDefs, goingKey, extra) {
    return Object.assign({
      distance: meta.dist, field: meta.field, diff: meta.diff || "hard", playerDef: toDef(h), oppDefs,
      going: goingKey || "good", incidents: settings.incidents, chaos: false, assist: false, unlimited: false, topSpeed: null,
      champ: false, fixedOpponents: null,
    }, extra);
  }
  function launch(cfg) {
    try { audio.ensure(); } catch (e) {}
    try { if (typeof COMM !== "undefined") COMM.prime(); } catch (e) {}
    startRace(cfg);
  }
  function enterOfficial(idx, hi) {
    const s = S(), h = C.horses[hi], meta = SEASON.roundDef(s, idx);
    if (!h || idx !== s.cur || SEASON.done(s) || s.rounds[idx].st !== "open") return openHub();
    if (!SEASON.eligibility(h, meta).ok) { toast(h.name + " isn't qualified for the " + meta.name, "warn", 2); return; }
    C.active = hi; save();
    pending = { kind: "off", season: s.n, round: idx, hid: h.id };
    launch(competitiveCfg(meta, h, SEASON.runners(s, idx), s.rounds[idx].going, {
      career: { id: meta.id, name: meta.name, venue: meta.venue, grade: meta.grade, major: !!meta.major, crown: !!meta.crown, official: true, round: idx + 1, rounds: s.rounds.length, tier: meta.tier },
    }));
  }
  function enterOptional(id, hi) {
    const meta = BY_ID[id], h = C.horses[hi]; if (!meta || !h) return openOptional();
    if (!SEASON.eligibility(h, meta).ok) { toast(h.name + " isn't qualified for the " + meta.name, "warn", 2); return; }
    C.active = hi; save();
    // the field comes from the Metropolitan stables, rated for this race
    const stables = SEASON.makeStables(C.seed, 1);
    const opp = stables.slice(0, meta.field - 1).map(st => { let best = null, bp = -1; for (const x of st.horses) { const d = SEASON.rateDef(st, x, meta.str), p = SEASON.power(d.attrs, meta.dist); if (p > bp) { bp = p; best = d; } } return best; });
    pending = { kind: "opt", id, hid: h.id };
    launch(competitiveCfg(meta, h, opp, "good", { career: { id: meta.id, name: meta.name, venue: meta.venue, grade: meta.grade, major: false, crown: false, official: false, tier: meta.tier } }));
  }
  // experience for a run: race tier × field strength × finishing place, reduced when the field is far weaker than the horse
  function xpFor(meta, r, h, place, dnf) {
    const field = r.horses.length;
    const opps = r.horses.filter(x => !x.isPlayer);
    const oppAvg = opps.reduce((s, x) => s + AKEYS.reduce((t, k) => t + (x.def.attrs[k] || 0), 0) / 8, 0) / Math.max(1, opps.length);
    const oppF = clampN(oppAvg / 70, 0.5, 1.35);
    const gap = rating(h) - oppAvg, gapF = gap > 6 ? Math.max(0.2, 1 - (gap - 6) / 16) : 1;
    const placeMult = place === 1 ? 1 : Math.max(0.12, 1 - (place - 1) * 0.12);
    const tierF = 0.8 + (meta.tier || 0) * 0.28;
    let xp = 46 * tierF * oppF * placeMult;
    if (place === 1) xp += 18 * tierF;
    if (dnf) xp = xp * 0.25 + 4;
    if (meta.optional) xp *= 0.9;
    return Math.max(2, Math.round(xp * gapF * (field >= 10 ? 1 : 0.85)));
  }
  // called from finishRace / finishRaceDNF when cfg.career is set. Commits everything as one save.
  function onResult(r, place) {
    if (!pending || !r.cfg.career) return;
    const P = pending; pending = null;
    const meta = BY_ID[P.id || (S().rounds[P.round] || {}).id];
    const h = C.horses.find(x => x.id === P.hid);
    if (!meta || !h) return;
    const dnf = !!r.player.dnf, field = r.horses.length;
    if (dnf) place = 0;
    // 1. the official result (championship rounds only) — refused if this round was already committed
    let summary = null;
    if (P.kind === "off") {
      const s = S();
      if (s.n !== P.season || s.cur !== P.round) return;           // stale (e.g. a restarted page): nothing is awarded twice
      const res = [];
      r.finishOrder.forEach((x, i) => res.push({ sid: x.isPlayer ? "player" : x.def._sid, hid: x.isPlayer ? h.id : x.def._hid, name: x.def.name, place: i + 1 }));
      r.dnfs.forEach(x => { if (!res.some(e => e.name === x.def.name)) res.push({ sid: x.isPlayer ? "player" : x.def._sid, hid: x.isPlayer ? h.id : x.def._hid, name: x.def.name, place: 0 }); });
      summary = SEASON.commitRound(C, P.round, res, h.id);
      if (!summary) return;
    }
    // 2. the horse's own record + experience
    const xp = xpFor(meta, r, h, place || field, dnf);
    h.xp += xp; h.races++; h.xpFrac += xp / XP_PER_PT;
    const tp = Math.floor(h.xpFrac); h.xpFrac -= tp; h.trainPts += tp;
    let lv = 0; while (h.xp >= xpForLevel(h.lvl)) { h.xp -= xpForLevel(h.lvl); h.lvl++; lv++; }
    if (!dnf) { if (place === 1) h.wins++; if (place <= 3) h.podiums++; if (place <= 4) h.places++; }
    if (P.kind === "off") { h.offRaces++; if (place === 1) h.offWins++; h.champPts += summary.pts; }
    h.history.push({ raceId: meta.id, name: meta.name, place: dnf ? 0 : place, field, dnf, t: Date.now(), dist: meta.dist, tier: meta.tier || 0, off: P.kind === "off", season: P.kind === "off" ? P.season : null });
    if (h.history.length > 40) h.history.shift();
    // 3. trophies + career wins (official feature wins only; optional races never award trophies)
    let trophy = false;
    if (!dnf && place === 1) {
      if (P.kind === "off" || (meta.tier || 0) >= 2) C.wins++;
      if (P.kind === "off" && meta.major && !C.trophies.some(t => t.raceId === meta.id && t.season === P.season)) { C.trophies.push({ raceId: meta.id, race: meta.name, horse: h.name, season: P.season, t: Date.now() }); trophy = true; }
    }
    save();
    // feedback on the results screen
    renderPanel({ P, meta, h, place, dnf, xp, tp, lv, summary, trophy });
    if (trophy) setTimeout(() => showMsg((meta.crown ? "★ " : "") + "YOU'VE WON THE " + meta.name.toUpperCase() + "!", 2.6), 900);
  }
  function renderPanel(o) {
    let el = document.getElementById("resCareerPanel");
    if (!el) { el = document.createElement("div"); el.id = "resCareerPanel"; el.className = "panel"; const row = document.getElementById("resAgain").parentElement; row.parentElement.insertBefore(el, row); }
    el.hidden = false;
    const gain = `XP +${o.xp} · Training +${o.tp}${o.lv ? " · Level " + o.h.lvl : ""}`;
    if (o.P.kind === "opt") { el.innerHTML = `<div class="cp-sub">${esc(o.meta.name)} · optional race</div><div class="cp-pts">${gain}</div><div class="cp-sub">No championship points — the season is unchanged.</div>`; return; }
    const s = o.summary, list = SEASON.standings(C), lead = list[0];
    const behind = s.behind ? `${s.behind} POINT${s.behind === 1 ? "" : "S"} BEHIND ${esc(lead.name).toUpperCase()}` : (list[1] ? `LEADING BY ${lead.pts - list[1].pts} POINT${lead.pts - list[1].pts === 1 ? "" : "S"}` : "LEADING");
    const seasonOver = !s.next;
    el.innerHTML = `<div class="cp-sub">Round ${s.round + 1} · ${esc(o.meta.name)} · ${esc(o.h.name)} ${o.dnf ? "did not finish" : "finished " + ordinal(o.place)}</div>
      <div class="cp-pos">CHAMPIONSHIP POSITION: ${ordinal(s.before).toUpperCase()} → ${ordinal(s.after).toUpperCase()}</div>
      <div class="cp-pts">+${s.pts} POINT${s.pts === 1 ? "" : "S"} · ${s.total} TOTAL · ${behind}</div>
      <div class="cp-sub">${seasonOver ? "That was the final round — the season is complete. Continue to see the final standings." : `Next: ${esc(s.next.name)} · ${esc(s.next.venue)} · ${fmtDist(s.next.dist)}`}</div>
      <div class="cp-sub">${gain}${o.trophy ? " · 🏆 Trophy won" : ""}</div>`;
  }
  function hidePanel() { const el = document.getElementById("resCareerPanel"); if (el) el.hidden = true; }

  // ---------- TROPHIES ----------
  function openTrophies() {
    style(); const el = screen("trophy");
    const champs = C.trophies.filter(t => t.kind === "champ");
    const feature = DIVS.flatMap(d => d.rounds).filter(r => r.major);
    const list = feature.map(r => {
      const w = C.trophies.filter(t => t.raceId === r.id && t.kind !== "champ");
      return `<div class="car-race${w.length ? "" : " locked"}"><div><span class="gr">${esc(r.grade)}</span>
        <b style="font-family:var(--font-d);font-size:16px">${esc(r.name)}</b>
        <div class="meta">${w.length ? "Won with " + w.map(t => esc(t.horse) + (t.season ? " (S" + t.season + ")" : "")).join(", ") : "Not yet won"}</div></div>
        <div>${w.length ? `<span class="car-tag car-won">★ ${w.length > 1 ? w.length + "× " : ""}WON</span>` : '<span class="car-tag">—</span>'}</div></div>`;
    }).join("");
    page(el, `<h2>Trophy Cabinet</h2>
      <div class="car-panel"><div class="car-sub">Championships</div>
        ${champs.length ? champs.map(t => `<span class="car-tro">🏆 ${esc(t.race)} · Season ${t.season}</span>`).join("") : `<div style="font-size:13px;color:var(--fg-dim)">No championships yet.</div>`}</div>
      <div class="car-sub">Feature races</div>
      <div class="car-panel">${list}</div>
      <div class="car-row"><button class="btn" id="trBack">Back</button></div>`);
    el.querySelector("#trBack").onclick = () => openHub();
    show("c_trophy");
  }

  // ---------- 3D preview (reuses the menu-horse orbit) ----------
  function previewHorse(def) { try { if (race) return; setMenuHorse(def); } catch (e) {} }

  // ---------- entry ----------
  function open() { load(); race = null; hidePanel(); openHub(); }
  return { open, onResult, load, hidePanel, get data() { return C; }, _test: { enterOfficial, enterOptional, doSkip, openSeasonEnd, openEvent, openStandings, openCalendar, openHistory, openOptional, toDef, xpFor } };
})();
