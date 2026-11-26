'use strict';
/* =====================================================================
   FINAL FURLONG — CAREER MODE
   Your own racing stable: create thoroughbreds in a 3D Australian racing yard (stable3d.js), develop them with
   training, and race them through three tiered championships (Provincial → Metropolitan → Group 1 Feature Series,
   with The Everest and the Melbourne Cup as the crown jewels) against persistent AI rivals.
   The championship logic (calendar, rivals, points, standings, qualification, history) lives in season.js; this file is
   the career UI and the bridge to the race engine. A career horse becomes a full race `def` (custom look + silks +
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
  const ALABEL = Object.fromEntries(ATTRS);
  // creation budgets (save v3): every attribute starts at BASE; START_POOL points take a new horse to about 71 with room
  // to specialise (max START_CAP in any one). POT_POOL is a separate budget for the horse's lifetime ceilings
  // (potential ≥ current, max POT_CAP): you choose what it can become, not just what it is.
  const BASE = 54, START_POOL = 136, START_CAP = 84, POT_POOL = 168, POT_CAP = 98;
  const FLOOR = 48;                                          // legacy minimum (older horses may have attributes below BASE)
  const XP_PER_PT = SEASON.XP_PER_PT;                        // experience → training points (shared with the progression tests)
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // what each attribute really does in the race engine (sim.js Horse), and the effect of one upgrade
  const EFFECT = {
    top: ["The fastest pace the horse can reach and sustain at full stretch.", d => `+${(d * 0.137).toFixed(2)} km/h top speed`],
    acc: ["How quickly it picks up speed — from the gates and whenever you ask for more effort.", (d, v) => `+${(100 * d * 0.02 / (2 + v * 0.02)).toFixed(1)}% acceleration`],
    end: ["How long it can run at pace before tiring. Raises the efficient cruising zone; vital beyond 1600 m.", (d, v) => `−${(100 * d * 0.006 / (1.3 - 0.006 * v)).toFixed(1)}% stamina used at pace`],
    spr: ["The strength of the finishing burst in the final 450 m rhythm drive.", (d, v) => `+${(100 * d / Math.max(1, v)).toFixed(1)}% finishing burst`],
    rec: ["How fast stamina and the sprint reserve come back when you ease off.", (d, v) => `+${(100 * d * 0.013 / (0.4 + 0.013 * v)).toFixed(1)}% recovery`],
    tem: ["Settles more quickly, pulls less and stays calmer in traffic and at the start.", (d, v) => `+${(100 * d * 0.0036 / (0.06 + 0.0036 * v)).toFixed(1)}% faster settling`],
    agi: ["Quicker, cleaner lane changes and more balance through the bends.", (d, v) => `+${(100 * d * 0.0045 / (0.5 + 0.0045 * v)).toFixed(1)}% lateral speed`],
    sta: ["Quicker, more reliable jumps from the starting gates.", d => `+${d} starting ability`],
  };

  // ---------- coat / silk / body option tables ----------
  const COATS = [
    { id: "bay", name: "Bay", type: "bay", hex: "#7a4a28" }, { id: "darkbay", name: "Dark bay", type: "bay", hex: "#4a2c1a" },
    { id: "chestnut", name: "Chestnut", type: "chestnut", hex: "#93502a" }, { id: "liver", name: "Liver chestnut", type: "chestnut", hex: "#5e3220" },
    { id: "black", name: "Black", type: "black", hex: "#211915" }, { id: "grey", name: "Grey", type: "grey", hex: "#b7b2a9" },
    { id: "brown", name: "Brown", type: "brown", hex: "#5b3a24" }, { id: "palomino", name: "Palomino", type: "flaxen", hex: "#c99a52" },
  ];
  const FACES = [["none", "None"], ["star", "Star"], ["stripe", "Stripe"], ["blaze", "Blaze"], ["snip", "Snip"], ["starsnip", "Star & snip"]];
  const SOCK_LV = [["None", 0], ["Coronet", 1], ["Sock", 2], ["Stocking", 3]];
  const LEGS = [["Near fore", 0], ["Off fore", 1], ["Near hind", 2], ["Off hind", 3]];
  const HAIR = [
    { name: "Black", hex: "#0a0806" }, { name: "Dark brown", hex: "#2a1c10" }, { name: "Chestnut", hex: "#6e3a1c" },
    { name: "Flaxen", hex: "#cbab70" }, { name: "Silver", hex: "#a8a5a0" }, { name: "Grey", hex: "#7c7973" },
  ];
  const SILK_PAL = ["#d62828", "#1d3557", "#2e8b57", "#e8c35a", "#7a4fd1", "#e86a17", "#f4f1ea", "#15161a", "#5fb7e8", "#e75480", "#1f6b3a", "#d9a521", "#7b1e3a", "#2b9aa0", "#9c6b30", "#4f5d75"];
  const PATTERNS = ["plain", "hoops", "sash", "quartered", "stars", "chevrons", "braces", "diamond", "crossbelts"];
  // body sliders: [key, label, min, max, step, default, low text, high text]
  const BODY = [
    ["build", "Body build", -0.6, 0.85, 0.05, 0, "Light", "Powerful"],
    ["muscle", "Muscularity", -1, 1, 0.1, 0, "Lean", "Heavily muscled"],
    ["neck", "Neck length", 0.95, 1.05, 0.01, 1, "Short", "Long"],
    ["neckG", "Neck thickness", 0.9, 1.1, 0.01, 1, "Fine", "Thick"],
    ["head", "Head size", 0.95, 1.05, 0.01, 1, "Refined", "Bold"],
    ["maneLen", "Mane length", 0.45, 1.3, 0.05, 0.85, "Pulled short", "Full"],
    ["tailLen", "Tail length", 0.8, 1.25, 0.05, 1, "Banged short", "Long"],
  ];
  const SLOT_AT = [[0, 1], [3, 2], [7, 3], [12, 5]];         // career wins → stable slots (five horses maximum)
  const DIVS = SEASON.DIVS, BY_ID = SEASON.BY_ID;

  // ---------- data model ----------
  let C = null;                                              // the loaded career
  function fresh() { return CORE.fresh(); }
  // Bring a parsed save up to date: validate every horse, run the championship migration (v1/v2 → v3), then the career data
  // architecture (v4: calendar, cash ledger, facilities, staff, horse age/fitness…). Nothing is removed; attributes, potential,
  // appearance, records and trophies are untouched. `from` is the schema version found in storage.
  function prepare(d, from) {
    d.horses = Array.isArray(d.horses) ? d.horses.map(sanHorse).filter(Boolean) : [];
    d.trophies = Array.isArray(d.trophies) ? d.trophies.filter(t => t && typeof t === "object") : [];
    d.wins = Math.max(0, d.wins | 0);
    d.active = clampN(d.active | 0, 0, Math.max(0, d.horses.length - 1));
    d.stable = cleanName(d.stable, "Southern Cross Stable");
    SEASON.migrate(d);                                       // v1/v2 saves: horses, trophies, records kept; championship + rivals added
    CORE.migrate(d, { from });                               // v3 → v4 (idempotent)
    return d;
  }
  let lastBackup = null;                                     // result of the most recent pre-migration backup (tests / Office)
  function load() {
    let raw = null;
    try { raw = localStorage.getItem("ff_career"); } catch (e) {}
    let d = store.get("career", null);
    if (raw && (!d || typeof d !== "object")) {                // unreadable save: keep a copy, never silently overwrite it
      try { localStorage.setItem("ff_career_backup_" + Date.now(), raw); } catch (e) {}
      toast && setTimeout(() => toast("Your previous career save couldn't be read — a backup copy was kept", "warn", 4), 500);
    }
    let from = CORE.V;
    if (!d || typeof d !== "object") d = fresh();
    else {
      from = d.v | 0;
      if (from !== CORE.V) {                                   // an older save is about to be upgraded (or a newer one opened by an older build): keep a copy of the exact stored text, read back to prove it was written
        lastBackup = CORE.backup(localStorage, raw, "v" + from);
        if (!lastBackup.ok) toast && setTimeout(() => toast("Couldn't make a backup copy of your older save — use Office → Export to keep one", "warn", 5), 600);
      }
    }
    prepare(d, from);
    C = d; save(); return d;
  }
  let saveWarned = false;
  function save() {
    try { localStorage.setItem("ff_career", JSON.stringify(C)); return true; }
    catch (e) { if (!saveWarned) { saveWarned = true; try { toast("Your career couldn't be saved — browser storage is full or blocked. Use Office → Export to keep a copy.", "warn", 6); } catch (e2) {} } return false; }
  }
  // career horse names: chosen from the list the commentator has recordings for (an older horse keeps its own name)
  const PLAYER_NAMES = (typeof SEASON !== "undefined" && SEASON.PLAYER_NAMES) || [];
  function nameChoices() { const cur = draft && draft.name; return cur && !PLAYER_NAMES.includes(cur) ? [cur].concat(PLAYER_NAMES) : PLAYER_NAMES; }
  function takenName(n) { try { return (C.horses || []).some(h => h.name === n && h.id !== (draft && draft.editId)); } catch (e) { return false; } }
  function cleanName(n, dflt) { n = (n == null ? "" : String(n)).replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 22); return n || dflt; }
  const hex = (v, d) => /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  const num = (v, lo, hi, d) => { v = +v; return isFinite(v) ? clampN(v, lo, hi) : d; };
  // validate a stored horse (guards malformed save data). Older horses keep every attribute and their potential.
  function sanHorse(h) {
    if (!h || typeof h !== "object") return null;
    const a = {}; for (const k of AKEYS) a[k] = clampN(Math.round(+(h.attrs && h.attrs[k]) || FLOOR), 30, 99);
    const pot = {}; for (const k of AKEYS) pot[k] = clampN(Math.round(+(h.pot && h.pot[k]) || a[k]), a[k], 99);
    const L = h.look || {}, socks = Array.isArray(L.socks) && L.socks.length === 4 ? L.socks.map(x => clampN(x | 0, 0, 3)) : [0, 0, 0, 0];
    return {
      id: h.id || ("h" + Math.random().toString(36).slice(2, 8)),
      name: cleanName(h.name, "My Horse"),
      say: h.say ? cleanName(h.say, "") : "",
      look: {
        type: ["bay", "brown", "black", "chestnut", "grey", "flaxen"].includes(L.type) ? L.type : "bay", coat: hex(L.coat, "#7a4a28"),
        face: FACES.some(f => f[0] === L.face) ? L.face : "none", socks,
        maneCol: hex(L.maneCol, "#2a1c10"), tailCol: hex(L.tailCol, "#2a1c10"),
        build: num(L.build, -1, 1, 0), muscle: num(L.muscle, -1, 1, 0), neck: num(L.neck, 0.94, 1.06, 1), neckG: num(L.neckG, 0.88, 1.12, 1),
        head: num(L.head, 0.94, 1.06, 1), maneLen: num(L.maneLen, 0.4, 1.35, 0.85), tailLen: num(L.tailLen, 0.75, 1.3, 1),
      },
      silk: hex(h.silk, "#d62828"), silk2: hex(h.silk2, "#f4f1ea"),
      silkPat: PATTERNS.includes(h.silkPat) ? h.silkPat : "hoops",
      attrs: a, pot,
      potSet: !!h.potSet, potRedist: !!h.potRedist, born: h.born || null,
      xp: Math.max(0, h.xp | 0), trainPts: Math.max(0, h.trainPts | 0), lvl: Math.max(1, h.lvl | 0 || 1), xpFrac: Math.max(0, +h.xpFrac || 0),
      races: Math.max(0, h.races | 0), wins: Math.max(0, h.wins | 0), places: Math.max(0, h.places | 0), podiums: Math.max(0, h.podiums | 0),
      offRaces: Math.max(0, h.offRaces | 0), offWins: Math.max(0, h.offWins | 0), champPts: Math.max(0, h.champPts | 0), majors: Math.max(0, h.majors | 0),
      prize: Math.max(0, +h.prize || 0), trained: Math.max(0, h.trained | 0),
      history: Array.isArray(h.history) ? h.history.filter(e => e && typeof e === "object").slice(-40) : [],
      ...CORE.keepHorse(h),                                  // v4 fields (age, fitness, growth…) are kept when present; migration fills the rest
      // online races (multiplayer): a record only — no experience, training points or championship points
      online: (() => { const o = h.online && typeof h.online === "object" ? h.online : {};
        return { runs: Math.max(0, o.runs | 0), wins: Math.max(0, o.wins | 0), places: Math.max(0, o.places | 0),
          last: Array.isArray(o.last) ? o.last.filter(e => e && typeof e === "object").slice(-10).map(e => ({ place: e.place | 0, field: e.field | 0, dist: e.dist | 0, dnf: !!e.dnf, vs: String(e.vs || "").slice(0, 80), d: e.d | 0 })) : [] }; })(),
    };
  }

  // ---------- derived helpers ----------
  const avgA = a => AKEYS.reduce((s, k) => s + a[k], 0) / AKEYS.length;
  const rating = h => Math.round(avgA(h.attrs));
  const potRating = h => Math.round(avgA(h.pot));
  function detectStyle(a) {
    const sprint = (a.top + a.acc + a.spr) / 3, stay = (a.end + a.rec) / 2;
    if (a.spr >= 85 && stay < sprint - 4) return { label: "Closer", code: "closer", dist: "1400–2000 m" };
    if (a.sta >= 82 && a.acc >= 78 && a.end < 80) return { label: "Front-runner", code: "front", dist: "1000–1600 m" };
    if (sprint >= 83 && a.end < 74) return { label: "Sprinter", code: "stalk", dist: "1000–1200 m" };
    if (stay >= 80 && a.end >= 82) return { label: "Stayer", code: "steady", dist: "2000–3200 m" };
    if (a.agi >= 82 && a.tem >= 78) return { label: "Tactical runner", code: "stalk", dist: "1400–2000 m" };
    return { label: "All-rounder", code: "mid", dist: "1400–2000 m" };
  }
  // the distances an attribute set suits best (from the same distance model the championship uses)
  const DISTS = [1000, 1200, 1400, 1600, 2000, 2400, 3200];
  function bestDistances(a) {
    const sc = DISTS.map(d => [d, SEASON.power(a, d)]), mx = Math.max(...sc.map(x => x[1]));
    const ok = sc.filter(x => x[1] >= mx - 1.2).map(x => x[0]);
    return { lo: Math.min(...ok), hi: Math.max(...ok), text: (Math.min(...ok) === Math.max(...ok) ? Math.min(...ok) : Math.min(...ok) + "–" + Math.max(...ok)).toLocaleString("en-AU") + " m" };
  }
  // projected racing profile from a set of attributes (used for starting ability and for potential)
  function profileLines(a) {
    const sp = SEASON.sprintIdx(a), st = SEASON.stayIdx(a), out = [];
    out.push(sp >= 92 ? "Elite sprint potential" : sp >= 86 ? "Strong sprinting ability" : sp >= 78 ? "Useful turn of foot" : "Limited sprinting speed");
    out.push(st >= 90 ? "Elite staying potential" : st >= 82 ? "Strong stamina" : st >= 74 ? "Moderate staying ability" : "Limited staying potential");
    if (a.acc >= 92) out.push("Explosive acceleration"); if (a.agi >= 90) out.push("Exceptionally nimble"); if (a.tem >= 90) out.push("Unflappable temperament"); if (a.sta >= 92) out.push("Brilliant gate speed");
    out.push("Suitable distance: " + bestDistances(a).text);
    return out;
  }
  // a career horse → a full race def the engine renders and simulates
  function toDef(h) {
    const st = detectStyle(h.attrs);
    return {
      name: h.name, say: h.say || "", role: st.label, style: st.code,
      coat: parseInt(h.look.coat.slice(1), 16), silk: h.silk, silk2: h.silk2, silkPat: h.silkPat,
      look: Object.assign({}, h.look, { socks: h.look.socks.slice() }),
      attrs: CORE.raceAttrs(C, h).attrs, _sid: "player", _hid: h.id,
    };
  }
  const activeHorse = () => C.horses[C.active] || null;
  const slots = () => { let n = 1; for (const [w, s] of SLOT_AT) if (C.wins >= w) n = s; return Math.min(5, n); };
  // training cost per point: cheap while a stat is modest, steep near the top (diminishing returns)
  const upgCost = SEASON.upgCost;
  const xpForLevel = lvl => Math.min(240, 70 + (lvl - 1) * 15);
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
    .car-screen{background:linear-gradient(180deg,rgba(5,10,8,.30),rgba(5,10,8,.55))}
    .car-screen.side{background:none;pointer-events:none;padding:0}
    .car-inner{max-width:960px;width:100%;margin:0 auto;display:flex;flex-direction:column;gap:12px;padding:4px 2px 28px}
    .car-inner h2{font-size:26px;margin:0}
    .car-sub{font-size:11px;color:var(--fg-dim);letter-spacing:.1em;text-transform:uppercase;margin:2px 0}
    .car-panel{background:rgba(10,16,13,.84);border:1px solid var(--panel-line);border-radius:12px;padding:14px 16px}
    .car-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .car-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
    .car-2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
    .car-card{background:rgba(14,20,16,.92);border:1px solid var(--panel-line);border-radius:10px;padding:12px;cursor:pointer;transition:border-color .15s,transform .15s}
    .car-card:hover{border-color:rgba(232,195,90,.6)}
    .car-card.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
    .car-card.nope{cursor:default;opacity:.85}
    .car-card b{font-family:var(--font-d);font-size:16px}
    .car-chip{font-size:13px;padding:7px 12px;border-radius:999px;border:1px solid var(--panel-line);background:rgba(255,255,255,.06);color:var(--fg);cursor:pointer;transition:background .12s,border-color .12s}
    .car-chip:hover{border-color:rgba(232,195,90,.6);background:rgba(255,255,255,.1)}
    .car-chip.sel{background:var(--accent);color:#10140f;border-color:var(--accent);font-weight:700}
    .car-chip[disabled]{opacity:.4;cursor:not-allowed}
    .car-sw{width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.25);cursor:pointer;padding:0;transition:transform .12s}
    .car-sw:hover{transform:scale(1.12)}
    .car-sw.sel{border-color:#fff;box-shadow:0 0 0 3px var(--accent)}
    .car-bar{height:10px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden;position:relative}
    .car-bar i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#5fc97e,#e8c35a);border-radius:5px;transition:width .45s cubic-bezier(.2,.8,.2,1)}
    .car-bar u{position:absolute;inset:0 auto 0 0;background:rgba(232,195,90,.22);border-radius:5px;text-decoration:none}
    .car-bar .pot{position:absolute;top:-2px;bottom:-2px;width:3px;background:#fff;border-radius:2px;box-shadow:0 0 4px rgba(0,0,0,.6)}
    .car-bar.flash i{animation:barflash .9s ease-out}
    @keyframes barflash{0%{filter:brightness(2.2)}100%{filter:none}}
    .car-btn{font-family:var(--font-d);font-weight:700;letter-spacing:.04em}
    .car-step{width:34px;height:34px;border-radius:8px;border:1px solid var(--panel-line);background:rgba(255,255,255,.08);color:var(--fg);font-size:18px;cursor:pointer}
    .car-step:hover:not([disabled]){border-color:var(--accent)}
    .car-step[disabled]{opacity:.35;cursor:not-allowed}
    .car-lab{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.07em}
    .car-lab input,.car-in{background:rgba(255,255,255,.08);border:1px solid var(--panel-line);color:var(--fg);border-radius:8px;padding:10px 12px;font-size:16px;font-family:var(--font-b)}
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
    .car-next{border-color:rgba(232,195,90,.55);background:linear-gradient(135deg,rgba(40,34,12,.92),rgba(10,16,13,.88))}
    .car-next h3{font-size:clamp(20px,3.6vw,28px);margin:2px 0 6px}
    .car-kv{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--fg-dim)}
    .car-kv b{color:var(--fg);font-weight:600}
    .car-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
    .car-tbl th{color:var(--fg-dim);font-size:10px;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:4px 6px;border-bottom:1px solid var(--panel-line)}
    .car-tbl td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.06)}
    .car-tbl tr.me td{color:var(--accent);font-weight:700}
    .car-tbl tr.zone td:first-child{box-shadow:inset 3px 0 0 var(--good)}
    .car-tbl tr.click{cursor:pointer} .car-tbl tr.click:hover td{background:rgba(255,255,255,.05)}
    .car-req{display:flex;gap:8px;align-items:baseline;font-size:12.5px;margin:3px 0}
    .car-req i{font-style:normal;font-weight:800;width:14px;display:inline-block}
    .car-req.ok i{color:var(--good)} .car-req.no i{color:var(--bad)}
    .car-req span{color:var(--fg-dim)}
    .car-warn{border-color:rgba(226,91,74,.6);background:rgba(60,16,12,.78)}
    .car-res{font-size:12.5px;color:var(--fg-dim);display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}
    .car-res b{color:var(--fg)}
    /* side-panel layout: the 3D stable fills the screen, controls sit in a panel on the right */
    .car-side{position:absolute;top:max(14px,env(safe-area-inset-top,0px));right:max(14px,env(safe-area-inset-right,0px));bottom:max(14px,env(safe-area-inset-bottom,0px));width:min(460px,calc(100vw - 28px));display:flex;flex-direction:column;pointer-events:auto;
      background:rgba(9,14,11,.88);border:1px solid var(--panel-line);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.35);backdrop-filter:blur(10px);overflow:hidden}
    .car-side.bottom{top:auto;left:max(14px,env(safe-area-inset-left,0px));width:auto;max-height:42vh}
    .car-side.bottom .sd-body{flex-direction:row;overflow-x:auto}
    .car-side.bottom .car-card{flex:1 0 170px;max-width:260px}
    .car-side .sd-head{padding:16px 18px 10px;border-bottom:1px solid var(--panel-line)}
    .car-side .sd-head h2{font-size:24px;margin:2px 0 0}
    .car-side .sd-body{flex:1;overflow:auto;padding:14px 18px;display:flex;flex-direction:column;gap:14px}
    .car-side .sd-foot{padding:12px 18px;border-top:1px solid var(--panel-line);display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center}
    .sd-sec{display:flex;flex-direction:column;gap:8px}
    .sd-sec > .car-sub{margin-bottom:0}
    .car-steps{display:flex;gap:4px;margin-top:10px}
    .car-steps button{flex:1;border:none;background:rgba(255,255,255,.08);color:var(--fg-dim);font-family:var(--font-d);font-size:11px;letter-spacing:.06em;padding:7px 2px;border-radius:7px;cursor:pointer;text-transform:uppercase}
    .car-steps button.on{background:var(--accent);color:#14110a;font-weight:800}
    .car-steps button.done{background:rgba(95,201,126,.18);color:#bfe8ca}
    .car-slider{display:grid;grid-template-columns:118px 1fr 44px;gap:10px;align-items:center;font-size:13px}
    .car-slider input[type=range]{width:100%;accent-color:var(--accent);height:24px}
    .car-slider .hint{grid-column:2/4;font-size:11px;color:var(--fg-dim);margin-top:-8px;display:flex;justify-content:space-between}
    .car-attr{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid transparent}
    .car-attr:hover{border-color:rgba(255,255,255,.12)}
    .car-attr .nm{font-weight:600;font-size:13.5px}
    .car-attr .vals{font-family:var(--font-d);font-size:14px;text-align:right;font-variant-numeric:tabular-nums}
    .car-attr .car-bar{grid-column:1/3}
    .car-attr .desc{grid-column:1/3;font-size:11.5px;color:var(--fg-dim);line-height:1.35}
    .car-attr input[type=range]{grid-column:1/3;width:100%;accent-color:var(--accent);margin:0}
    .car-attr .up{display:flex;gap:8px;align-items:center;justify-content:flex-end}
    .car-pool{display:flex;justify-content:space-between;align-items:baseline;padding:10px 12px;border-radius:10px;background:rgba(232,195,90,.1);border:1px solid rgba(232,195,90,.35)}
    .car-pool b{font-family:var(--font-d);font-size:22px;color:var(--accent)}
    .car-prof{display:flex;flex-wrap:wrap;gap:6px}
    .car-prof span{font-size:12px;padding:4px 9px;border-radius:999px;background:rgba(95,201,126,.12);border:1px solid rgba(95,201,126,.3);color:#cdeed6}
    .car-cam{position:absolute;left:max(14px,env(safe-area-inset-left,0px));bottom:max(14px,env(safe-area-inset-bottom,0px));display:flex;gap:6px;flex-wrap:wrap;pointer-events:auto;max-width:calc(100vw - 520px)}
    .car-cam button{background:rgba(9,14,11,.82);border:1px solid var(--panel-line);color:var(--fg);border-radius:9px;padding:8px 12px;font-family:var(--font-d);font-size:12px;letter-spacing:.05em;cursor:pointer;text-transform:uppercase}
    .car-cam button:hover{border-color:var(--accent)} .car-cam button.on{background:var(--accent);color:#14110a}
    .car-hint{position:absolute;left:max(14px,env(safe-area-inset-left,0px));top:max(14px,env(safe-area-inset-top,0px));pointer-events:none;font-size:12px;color:#f2f5f1;background:rgba(9,14,11,.6);border-radius:8px;padding:6px 10px;max-width:calc(100vw - 520px)}
    .car-hint b{font-family:var(--font-d);font-size:18px;display:block}
    .car-legs{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
    .car-legs > div{background:rgba(255,255,255,.04);border-radius:10px;padding:8px}
    .car-legs .car-row{gap:5px}
    .car-legs .car-chip{font-size:11.5px;padding:5px 8px}
    .car-stat{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .car-stat div{background:rgba(255,255,255,.05);border-radius:10px;padding:8px 10px}
    .car-stat b{display:block;font-family:var(--font-d);font-size:18px}
    .car-stat span{font-size:10.5px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.08em}
    #resCareerPanel{width:min(680px,100%);padding:12px 16px;text-align:center}
    #resCareerPanel .cp-pos{font-family:var(--font-d);font-weight:900;font-size:clamp(18px,3.4vw,26px);letter-spacing:.04em}
    #resCareerPanel .cp-pts{font-family:var(--font-d);font-weight:800;font-size:18px;color:var(--accent);margin-top:2px}
    #resCareerPanel .cp-sub{font-size:13px;color:var(--fg-dim);margin-top:4px}
    @media (max-width:760px){
      .car-side{top:auto;left:8px;right:8px;width:auto;height:58vh;bottom:max(8px,env(safe-area-inset-bottom,0px))}
      .car-cam{bottom:calc(58vh + 16px);max-width:calc(100vw - 16px);left:8px}
      .car-hint{max-width:calc(100vw - 16px)}
      .car-slider{grid-template-columns:96px 1fr 40px}
      .car-tbl .hide-s{display:none}
    }
    `;
    document.head.appendChild(st);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const navBtn = (label, fn, cls) => { const b = document.createElement("button"); b.className = "btn " + (cls || ""); b.textContent = label; b.onclick = fn; return b; };
  const page = (el, html) => { el.classList.remove("side"); if (typeof STABLE3D !== "undefined") STABLE3D.setViewShift(0); el.innerHTML = `<div class="menu-inner" style="max-width:980px"><div class="car-inner">${html}</div></div>`; el.scrollTop = 0; };
  // side-panel page over the live 3D stable: head / scrolling body / footer, plus optional camera bar and caption
  function sidePage(el, o) {
    el.classList.add("side");
    el.innerHTML = `${o.hint ? `<div class="car-hint">${o.hint}</div>` : ""}${o.cam ? `<div class="car-cam">${o.cam}</div>` : ""}
      <div class="car-side${o.bottom ? " bottom" : ""}"><div class="sd-head">${o.head}</div><div class="sd-body">${o.body}</div>${o.foot != null ? `<div class="sd-foot">${o.foot}</div>` : ""}</div>`;
    const narrow = innerWidth <= 760;
    if (typeof STABLE3D !== "undefined") STABLE3D.setViewShift(narrow || o.bottom ? 0 : Math.min(460, innerWidth - 28) + 14, narrow && !o.bottom ? innerHeight * 0.4 : 0);   // phones: the subject sits above the panel
    el.querySelectorAll(".car-cam [data-cam]").forEach(b => b.onclick = () => { const c = b.getAttribute("data-cam"); if (c === "in") STABLE3D.zoom(0.85); else if (c === "out") STABLE3D.zoom(1.18); else STABLE3D.preset(c); });
    el.querySelectorAll("input,textarea").forEach(i => i.addEventListener("keydown", e => e.stopPropagation()));
  }
  const camBar = (extra) => `<button data-cam="full">Full body</button><button data-cam="head">Head</button><button data-cam="legs">Legs</button>${extra || ""}<button data-cam="rear">Rear</button><button data-cam="out">−</button><button data-cam="in">+</button><button data-cam="full" title="Reset camera">⟲ Reset</button>`;
  const posTxt = n => ordinal(n);
  // the date / time of day / forecast of a championship round, as small facts for the event screens
  function evBits(idx) {
    const e = CORE.roundEvent(C, idx); if (!e) return "";
    return `<span>Scheduled <b>${CORE.fmtDate(e.day)}</b></span><span><b>${CORE.TOD_LABEL[e.tod] || ""}</b></span><span>Forecast <b>${CORE.WX_LABEL[e.forecast.weather] || ""}</b></span>`;
  }
  function optBits(id) {
    const e = CORE.nextMeeting(C, id); if (!e) return "";
    return `<span>Next meeting <b>${CORE.fmtDate(e.day, { short: true })}</b></span><span><b>${CORE.TOD_LABEL[e.tod] || ""}</b></span>`;
  }
  const money = n => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-AU");
  function resLabel(e) { return !e ? "—" : e.place > 0 ? ordinal(e.place) : "DNF"; }
  // ---------- the 3D stable stage ----------
  function stage(mode, opts) {
    if (typeof STABLE3D === "undefined") return;
    STABLE3D.enter(mode, opts);
    STABLE3D.setStalls(stallList());
    STABLE3D.onPick(onStablePick);
    if (opts && "bay" in opts) STABLE3D.setBayHorse(opts.bay, { rider: !!opts.rider });
    if (!(opts && "shift" in opts)) STABLE3D.setViewShift(0);
  }
  function stallList() {
    const L = C.horses.slice(0, 5).map(h => ({ def: toDef(h), sub: rating(h) + " · " + detectStyle(h.attrs).label, id: h.id }));
    while (L.length < 5) L.push(null); L.slots = slots(); return L;
  }
  function onStablePick(p) {
    if (p.stall != null) { const h = C.horses[p.stall]; if (h) { C.active = p.stall; save(); openProfile(p.stall); } else if (p.stall < slots()) openCreate(); else toast("Win more races to unlock this stall", "info", 1.6); }
    else if (p.trophy) showTrophy(p.trophy);
  }

  // ---------- HUB / DASHBOARD ----------
  // Phase 24: what a regional course is like, from its layout (empty for the original oval and the two city courses)
  function courseNote(venue) { try { const l = (SEASON.venueStyle(venue) || {}).layout; return l && typeof getTrack === "function" ? getTrack(l).character || "" : ""; } catch (e) { return ""; } }
  function openHub() {
    style(); CORE.syncCalendar(C);
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
          <div class="car-kv"><span><b>${esc(nm.venue)}</b></span><span><b>${fmtDist(nm.dist)}</b> ${distLbl(nm.dist)}</span><span><b>${going(rd.going)}</b> going</span><span>${esc(nm.grade)}</span><span>Prize <b>${CORE.purseLabel(nm)}</b></span><span>Field <b>${nm.field}</b></span>${evBits(nextIdx)}<span>Stable standing <b>${posTxt(me.rank)}</b></span></div>
          <div class="car-row" style="margin-top:12px"><button class="btn primary" id="hubEnter">Select Horse &amp; Enter</button><button class="btn" id="hubView">View Event</button><button class="btn" id="hubSkip">Skip Round</button></div></div>`;
    page(el, `
      <div class="car-panel car-row" style="justify-content:space-between;align-items:flex-end">
        <div><div class="car-sub">Career Mode</div><h2 id="hubStable" title="Click to rename your stable" style="cursor:pointer">${esc(C.stable)} <span style="font-size:14px;color:var(--fg-dim)">✎</span></h2></div>
        <div class="car-row" style="gap:18px">
          <div><div class="car-sub">Date</div><div class="car-big" id="hubDate" style="font-size:16px">${CORE.fmtDate(C.day)}</div></div>
          <div><div class="car-sub">Cash</div><div class="car-big" id="hubCash" style="font-size:16px;color:var(--good)">${money(C.cash)}</div></div>
          <div><div class="car-sub">Season</div><div class="car-big">${s.n}</div></div>
          <div><div class="car-sub">Championship</div><div class="car-big" style="font-size:16px">${D.name}</div></div>
          <div><div class="car-sub">Round</div><div class="car-big">${Math.min(s.cur + 1, s.rounds.length)}<span style="font-size:13px;color:var(--fg-dim)">/${s.rounds.length}</span></div></div>
          <div><div class="car-sub">Position</div><div class="car-big" style="color:var(--accent)">${posTxt(me.rank)}</div></div>
          <div><div class="car-sub">Points</div><div class="car-big">${me.pts}</div></div>
        </div>
      </div>
      ${nextHtml}
      ${(() => { try { const gv = CORE.goalsOf(C); return `<div class="car-panel"><div class="car-row" style="justify-content:space-between"><div class="car-sub">Season goals</div><div class="car-sub">${money(gv.earned)} of ${money(gv.total)} earned</div></div><div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px">${gv.goals.map(g => `<div style="font-size:12.5px;opacity:${g.paid ? 0.65 : 1}">${g.paid ? "✓" : "○"} ${esc(g.label)} <span style="color:var(--fg-dim)">${g.paid ? "+" + money(g.reward) : g.target > 999 ? money(g.value) + " / " + money(g.target) + " · " + money(g.reward) : g.value + "/" + g.target + " · " + money(g.reward)}</span></div>`).join("")}</div></div>`; } catch (e) { return ""; } })()}
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
    row.appendChild(navBtn("Office", () => openOffice()));
    if (typeof SCENES !== "undefined" && typeof FARM !== "undefined") row.appendChild(navBtn("Back to the Farm", () => SCENES.enter("farm"), h ? "primary" : ""));
    row.appendChild(navBtn("Rivals", () => openRivals()));
    row.appendChild(navBtn("Trophy Room", () => openTrophies()));
    row.appendChild(navBtn("Championship History", () => openHistory()));
    row.appendChild(navBtn("Main Menu", () => { race = null; show("menu"); }));
    const q = id => el.querySelector(id);
    if (q("#hubEnter")) q("#hubEnter").onclick = () => openEvent(nextIdx, false);
    if (q("#hubView")) q("#hubView").onclick = () => openEvent(nextIdx, false);
    if (q("#hubSkip")) q("#hubSkip").onclick = () => openEvent(nextIdx, true);
    if (q("#hubFinish")) q("#hubFinish").onclick = () => openSeasonEnd();
    q("#hubStand").onclick = () => openStandings();
    q("#hubStable").onclick = () => renameStable(q("#hubStable"));
    stage("stalls");
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
        <div class="car-kv"><span><b>${esc(meta.venue)}</b></span><span><b>${fmtDist(meta.dist)}</b> ${distLbl(meta.dist)}</span><span><b>${going(g)}</b> going</span><span>${esc(meta.grade)}</span><span>Field <b>${meta.field}</b></span>${optional ? optBits(meta.id) : evBits(idx)}${CORE.purseLabel(meta) !== "—" ? `<span>Prize <b>${CORE.purseLabel(meta)}</b></span><span>Entry <b>${money(CORE.entryFee(meta))}</b></span>` : ""}${optional ? "" : `<span>Stable standing <b>${posTxt(me.rank)}</b> · ${me.pts} pts</span>`}</div>
        ${meta.note ? `<div style="font-size:12.5px;margin-top:6px;color:var(--accent)">${esc(meta.note)}</div>` : ""}
        ${courseNote(meta.venue) ? `<div style="font-size:12.5px;margin-top:6px;color:var(--fg-dim)">Course: ${esc(courseNote(meta.venue))}</div>` : ""}
        <div class="car-sub" style="margin-top:10px">Entry requirements</div>${reqHtml}
        ${optional ? "" : `<div style="font-size:12px;color:var(--fg-dim);margin-top:6px">One horse represents ${esc(C.stable)} in this round. Points: 1st 15 · 2nd 12 · 3rd 10 · 4th 8 · 5th 6 · 6th 5 · 7th 4 · 8th 3 · 9th 2 · 10th 1. Chaos Mode is never used in championship racing.</div>`}
      </div>
      <div id="evSkip"></div>
      <div class="car-panel"><div class="car-row" style="justify-content:space-between"><div class="car-sub">Form guide — ${optional ? "the field you will meet" : "every stable's runner"}</div><span style="font-size:11.5px;color:var(--fg-dim)">★ likely contenders · click a rival for its profile</span></div><div id="evForm" style="overflow-x:auto"></div><div style="font-size:11.5px;color:var(--fg-dim);margin-top:6px">Race-day ratings: the rival stables bring their horses here primed for this race, so the competition rises with your horse. A new horse should expect to be fighting for a place; finals are as hard as Quick Race on Hard.</div></div>
      <div class="car-sub">Choose a horse${optional ? "" : " to represent the stable"}</div>
      <div class="car-grid">${cards || `<div class="car-panel">No horses in the stable yet.</div>`}</div>
      <div class="car-row" id="evBtns"></div>`);
    const b = el.querySelector("#evBtns");
    if (!optional) b.appendChild(navBtn("Skip This Round", () => drawSkip()));
    b.appendChild(navBtn("Back", () => optional ? openOptional() : openHub()));
    el.querySelectorAll("[data-go]").forEach(x => x.onclick = (e) => { e.stopPropagation(); const i = +x.getAttribute("data-go"); optional ? enterOptional(meta.id, i) : enterOfficial(idx, i); });
    const field0 = optional ? SEASON.optionalField(C, meta.id) : SEASON.runners(C, idx);
    const drawForm = () => { const ah = activeHorse(), field = raceDayField(field0, meta, ah, !optional && idx === S().rounds.length - 1);
      el.querySelector("#evForm").innerHTML = formGuideHtml(field, meta, ah); el.querySelectorAll("#evForm [data-rv]").forEach(t => t.onclick = () => openRival(t.getAttribute("data-rv"), () => openEvent(idxOrId, false))); };
    drawForm();
    el.querySelectorAll(".car-card[data-h]").forEach(c => c.onclick = () => { const i = +c.getAttribute("data-h"); C.active = i; save(); el.querySelectorAll(".car-card").forEach(x => x.classList.toggle("sel", x === c)); drawForm(); });
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
    stage("stalls");
    show("c_event");
  }
  // the pre-race form guide: real ratings, trip suitability, recent form and achievements (no favouritism)
  const SHORT = { top: "speed", acc: "acceleration", end: "endurance", spr: "finish", rec: "recovery", tem: "temperament", agi: "agility", sta: "gate speed" };
  function formGuideHtml(field, meta, h) {
    const entries = field.map(d => { const rv = SEASON.rival(C, d._hid) || {};
      return { name: d.name, hid: d._hid, stable: d._stable, attrs: d.attrs, form: rv.form || [], starts: rv.starts || 0, wins: rv.wins || 0, majors: (rv.majors || []).length, style: d.role, h2h: h ? SEASON.h2hFor(C, h.id, d._hid) : null }; });
    if (h) entries.push({ name: h.name, you: true, stable: C.stable, attrs: h.attrs, form: (h.history || []).map(e => e.dnf ? 0 : e.place), starts: h.races, wins: h.wins, majors: h.majors || 0, style: detectStyle(h.attrs).label });
    const rows = SEASON.formGuide(C, entries, meta);
    return `<table class="car-tbl"><tr><th></th><th>Horse</th><th>Rtg</th><th>Form</th><th class="hide-s">W/Starts</th><th>Trip</th><th class="hide-s">Best at</th><th class="hide-s">Strengths</th><th class="hide-s">vs you</th></tr>
      ${rows.map(r => `<tr class="${r.you ? "me" : "click"}" ${r.hid ? `data-rv="${r.hid}"` : ""}><td>${r.contender ? "★" : ""}</td><td><b>${esc(r.name)}</b>${r.you ? " (yours)" : ""}<div style="font-size:11px;color:var(--fg-dim)">${esc(r.stable || "")}${r.majors ? " · " + r.majors + " major" + (r.majors > 1 ? "s" : "") : ""}</div></td>
        <td>${r.rating}</td><td>${r.formTxt}</td><td class="hide-s">${r.wins}/${r.starts}</td><td style="color:${r.suit === "Excellent" ? "var(--good)" : r.suit === "Poor" ? "var(--bad)" : "inherit"}">${r.suit}</td>
        <td class="hide-s">${bestDistances(r.attrs).text}</td><td class="hide-s">${r.strengths.map(k => SHORT[k]).join(", ")}</td>
        <td class="hide-s">${r.h2h ? `${r.h2h.ahead}–${r.h2h.behind}` : ""}</td></tr>`).join("")}</table>`;
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
    const r = SEASON.skipRound(C); if (r) CORE.enterRound(C, idx); save();
    if (r) { const w = r.res.find(e => e.place === 1); toast("Round skipped · " + meta.name + " won by " + (w ? w.name : "—"), "info", 2.4); }
    openHub();
  }

  // ---------- OFFICE: cash and ledger, the dated calendar, horse condition, save export / import ----------
  // import: validate the file, upgrade it exactly as a stored save is upgraded, check its money record — and only then (after a
  // verified backup of the current career) replace the stored save. Nothing is touched if any step fails.
  function importPrepare(text) {
    const p = CORE.parseImport(text); if (!p.ok) return p;
    let d; try { d = prepare(JSON.parse(JSON.stringify(p.career)), p.from); } catch (e) { return { ok: false, error: "That save couldn't be upgraded safely: " + e.message }; }
    const bad = CORE.audit(d); if (bad.length) return { ok: false, error: "The save's money record is inconsistent (" + bad[0] + ")." };
    return { ok: true, career: d, from: p.from, summary: { stable: d.stable, horses: d.horses.length, names: d.horses.map(h => h.name), season: d.season && d.season.n, cash: d.cash, day: d.day } };
  }
  function importText(text) {
    const r = importPrepare(text); if (!r.ok) return r;
    let raw = null; try { raw = localStorage.getItem("ff_career"); } catch (e) {}
    if (raw) { const b = CORE.backup(localStorage, raw, "pre_import"); if (!b.ok) return { ok: false, error: "Couldn't back up your current career first, so nothing was changed." }; r.backup = b.key; }
    const out = JSON.stringify(r.career);
    try { localStorage.setItem("ff_career", out); } catch (e) { return { ok: false, error: "Browser storage refused the imported save; your current career is unchanged." }; }
    pending = null; load();
    return r;
  }
  const exportText = () => CORE.exportSave(C);
  const DEV_LABEL = { early: "Early developer", avg: "Average developer", late: "Late developer" };
  // facilities and staff (Phase 8): bought and hired from the Office; every effect is capped (see CORE.FAC_CAP)
  function facilitiesHtml() {
    const F = CORE.FACILITIES, R = CORE.STAFFROLES, pips = n => [0, 1, 2].map(i => `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px;background:${i < n ? "var(--accent)" : "rgba(255,255,255,.2)"}"></span>`).join("");
    const rows = Object.keys(F).map(k => { const lv = CORE.facLevel(C, k), nxt = lv < 3 ? F[k].cost[lv] : 0, can = lv < 3 && C.cash >= nxt;
      return `<tr><td><b>${esc(F[k].name)}</b><div style="font-size:11.5px;color:var(--fg-dim)">${esc(F[k].blurb)}</div></td><td>${pips(lv)}</td><td style="text-align:right">${lv < 3 ? `<button class="btn small" data-buy="${k}" ${can ? "" : "disabled"}>${lv ? "Upgrade" : "Build"} ${money(nxt)}</button>` : "<span style='color:var(--good)'>Elite</span>"}</td></tr>`; }).join("");
    const wk = CORE.weeklyBill(C);
    const staff = Object.keys(R).map(r => { const st = CORE.staffOf(C, r);
      if (st) return `<tr><td><b>${esc(R[r].name)}</b> — ${esc(st.name)} <span class="car-tag">tier ${st.tier}</span> <span class="car-tag">${esc(st.spec)}</span><div style="font-size:11.5px;color:var(--fg-dim)">${esc(R[r].blurb)}</div></td><td style="text-align:right">${money(st.wage)}/week</td><td style="text-align:right"><button class="btn small" data-fire="${r}">Let go</button></td></tr>`;
      return `<tr><td><b>${esc(R[r].name)}</b> — vacant<div style="font-size:11.5px;color:var(--fg-dim)">${esc(R[r].blurb)}</div></td><td colspan="2" style="text-align:right"><select data-spec="${r}" style="background:rgba(18,26,21,.9);color:var(--fg);border:1px solid var(--panel-line);border-radius:6px;padding:4px">${R[r].specs.map(x => `<option>${esc(x)}</option>`).join("")}</select> ${[1, 2, 3].map(t => `<button class="btn small" data-hire="${r}:${t}" ${C.cash >= R[r].wage[t - 1] * 2 ? "" : "disabled"}>Tier ${t} · ${money(R[r].wage[t - 1])}/wk</button>`).join(" ")}</td></tr>`; }).join("");
    return `<div class="car-panel"><div class="car-sub">Facilities</div><table class="car-tbl">${rows}</table>
      <div class="car-sub" style="margin-top:10px">Staff</div><table class="car-tbl">${staff}</table>
      <div style="font-size:11.5px;color:var(--fg-dim);margin-top:6px">A new hire costs two weeks' wages up front. Wages and facility upkeep are part of the one weekly bill (now ${money(wk.cost)}). The total training boost from staff and facilities is capped at +${Math.round((CORE.FAC_CAP - 1) * 100)}%, and nothing can raise a horse past its potential.</div></div>`;
  }
  // the Office's money report (Phase 7): cash, what is owed, the next weekly bill, sponsorship, the season by category, recent prize money
  function financeHtml(fin) {
    const b = CORE.weeklyBill(C), e = CORE.econOf(C), club = CORE.clubOffer(C), by = fin.by || {}, nextWk = (CORE.weekOf(C.day) + 1) * 7;
    const lab = { prize: "Prize money", sponsor: "Sponsorship", bonus: "Milestone bonuses", advance: "Club advance", entry: "Entry fees", upkeep: "Weekly bills (feed, care, property, wages)", repay: "Club repayments", care: "Quality feed", start: "Starting package" };
    const rows = Object.keys(by).filter(k => by[k]).sort((x, y) => by[y] - by[x]).map(k => `<tr><td>${esc(lab[k] || k)}</td><td style="text-align:right;color:${by[k] < 0 ? "var(--bad)" : "var(--good)"}">${by[k] < 0 ? "−" : "+"}${money(Math.abs(by[k]))}</td></tr>`).join("");
    const prizes = C.ledger.filter(x => x.kind === "prize").slice(-4).reverse();
    return `<div class="car-panel"><div class="car-sub">Finances</div>
      <div class="car-kv" style="margin:4px 0 8px"><span>Cash <b>${money(C.cash)}</b></span><span>Owed to the stable club <b style="color:${e.debt ? "var(--warn)" : "inherit"}">${money(e.debt)}</b></span><span>Reputation <b>${C.rep | 0}</b>${b.sponsor ? ` → sponsor <b>${money(b.sponsor)}</b>/week` : " (sponsors notice you from 10)"}</span></div>
      <div class="car-sub">Next weekly bill — due ${CORE.fmtDate(nextWk, { short: true })}</div>
      <table class="car-tbl">${b.items.map(x => `<tr><td>${esc(x.label)}</td><td style="text-align:right">${money(x.amount)}</td></tr>`).join("")}<tr><td><b>Total</b></td><td style="text-align:right"><b>${money(b.cost)}</b></td></tr>${b.sponsor ? `<tr><td>Sponsorship (income)</td><td style="text-align:right;color:var(--good)">+${money(b.sponsor)}</td></tr>` : ""}</table>
      <div style="font-size:11.5px;color:var(--fg-dim);margin:6px 0 8px">Bills are charged automatically as the calendar moves on, as one line a week. Entry fees (about 4% of the purse) are paid when a race is entered. If cash runs short a bill becomes money owed to the club — never a negative balance — and half of each prize repays it.</div>
      ${rows ? `<div class="car-sub">This season by category</div><table class="car-tbl">${rows}</table>` : ""}
      ${prizes.length ? `<div class="car-sub" style="margin-top:8px">Recent prize money</div><table class="car-tbl">${prizes.map(x => `<tr><td>${CORE.fmtDate(x.day, { short: true })}</td><td>${esc(x.note)}</td><td style="text-align:right;color:var(--good)">+${money(x.amount)}</td></tr>`).join("")}</table>` : ""}
      <div class="car-row" style="margin-top:8px"><button class="btn small" id="ofClub" ${club.ok ? "" : "disabled"}>Stable club advance ${money(CORE.ECON.CLUB.AMOUNT)}</button><span style="font-size:12px;color:var(--fg-dim)">${club.ok ? "Available now: your cash is under " + money(CORE.ECON.CLUB.TRIGGER) + " (once a season, repaid from prize money)." : club.reason === "used" ? "Already used this season." : "Available when cash falls under " + money(CORE.ECON.CLUB.TRIGGER) + " (once a season)."}</span></div></div>`;
  }

  // ---------- the Hall of Fame (Phase 14) ----------
  function openHallOfFame() {
    style(); const el = screen("hof"), L = (C.hof || []).slice().reverse();
    const card = e => `<div class="car-panel"><div class="car-row" style="justify-content:space-between;align-items:baseline"><div><span style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:-2px;margin-right:6px;background:${esc((e.look && e.look.coat) || "#7a4a28")};border:1px solid rgba(255,255,255,.35)"></span><b style="font-size:18px">${esc(e.name)}</b> <span class="car-tag">${e.why === "aged" ? "Retired at the end of its racing life" : "Retired"}</span></div><div style="font-size:12.5px;color:var(--fg-dim)">Season ${e.season} · age ${e.age}</div></div>
      <div class="car-kv" style="margin:6px 0"><span>Starts <b>${e.starts}</b></span><span>Wins <b>${e.wins}</b></span><span>Placings <b>${e.places}</b></span><span>Prize money <b>${money(e.prize)}</b></span><span>Rating at retirement <b>${e.rating}</b></span>${e.majors ? `<span>Feature wins <b>${e.majors}</b></span>` : ""}${e.bestPlace ? `<span>Best finish <b>${ordinal(e.bestPlace)}</b></span>` : ""}</div>
      ${e.trophies && e.trophies.length ? `<div style="font-size:12.5px;color:var(--fg-dim)">🏆 ${e.trophies.map(t => esc(t.race) + (t.season ? " (S" + t.season + ")" : "")).join(" · ")}</div>` : ""}
      ${e.last && e.last.length ? `<div style="font-size:12px;color:var(--fg-dim);margin-top:4px">Last runs: ${e.last.slice(-6).map(r => r.dnf || !r.place ? "F" : r.place).join("-")}</div>` : ""}</div>`;
    page(el, `<h2>Hall of Fame</h2><div class="car-sub">${esc(C.stable)} — every horse you have retired, with its record</div>
      ${L.length ? L.map(card).join("") : `<div class="car-panel">No horse has been retired yet. Retire a veteran from the Horse Market's Sell / Retire tab and its record is kept here for good.</div>`}
      <div class="car-row"><button class="btn" id="hofBack">Back</button></div>`);
    el.querySelector("#hofBack").onclick = () => (fromFarm ? home() : openOffice());
    show("c_hof");
  }

  // ---------- the horse market (Phase 10): buy (browse, bid, buy), sell, or pay for a custom horse ----------
  let mk = { tab: "buy", sel: null, msg: "", confirm: null, from: "office" };
  const mkSwatch = L => `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:-2px;margin-right:6px;background:${esc(L.coat)};border:1px solid rgba(255,255,255,.35)"></span>`;
  const faceName = f => (FACES.find(x => x[0] === f) || ["", "plain face"])[1].toLowerCase();
  const AT_LAB = { top: "Top speed", acc: "Acceleration", end: "Endurance", spr: "Sprint", rec: "Recovery", tem: "Temperament", agi: "Agility", sta: "Start" };
  function mkCard(V, Lraw) {
    const sel = mk.sel === V.id, free = C.horses.length < slots(), canAsk = free && !V.closed, pref = bestDistances(Lraw.attrs).text, rn = Math.round(avgA(Lraw.attrs));
    const hist = V.hist.map(h => `<div style="font-size:12px;color:var(--fg-dim)">Round ${h.r}: you offered ${money(h.offer)} — ${h.res === "counter" ? "they'd take " + money(h.counter) : "far too low"}</div>`).join("");
    const offer = sel ? `<div class="car-row" style="margin-top:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:12px">Your offer</span><input type="number" id="mkOffer" class="car-in" style="width:130px" step="50" min="500" value="${V.counter || Math.round(V.ask * 0.9 / 50) * 50}">
        <button class="btn small primary" data-mkoffer="${V.id}">Submit offer</button>${V.counter ? `<button class="btn small" data-mkbuy="${V.id}:${V.counter}">Accept their ${money(V.counter)}</button>` : ""}
        <span style="font-size:12px;color:var(--fg-dim)">${V.roundsLeft} round${V.roundsLeft === 1 ? "" : "s"} left</span></div>${hist}` : hist;
    return `<div class="car-panel" data-card="${V.id}">
      <div class="car-row" style="justify-content:space-between;align-items:baseline"><div><b style="font-size:17px">${esc(V.name)}</b> <span class="car-tag">${esc(V.catLabel)}</span>${V.closed ? ` <span class="car-tag car-bad">Seller walked away</span>` : ""}</div><div style="font-size:18px"><b>${money(V.ask)}</b></div></div>
      <div style="font-size:13px;margin:4px 0">${mkSwatch(V.look)}${V.age}yo · ${esc(V.look.type)}${V.look.face !== "none" ? " with a " + faceName(V.look.face) : ""} · ${esc(V.growth === "late" ? "late developer" : V.growth === "early" ? "early developer" : "average developer")}</div>
      <div class="car-kv" style="margin:6px 0"><span>Ability now <b>${V.ability[0]}–${V.ability[1]}</b></span><span>Potential <b>${V.potential[0]}–${V.potential[1]}</b></span><span>Suits <b>${pref}</b></span><span>Temperament <b>${V.temperament}</b></span></div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin:4px 0">${Object.keys(V.bands).map(k => `<span class="car-tag">${AT_LAB[k]}: ${V.bands[k]}</span>`).join("")}</div>
      <div style="font-size:12.5px;color:var(--fg-dim)">${esc(V.record)} · ${esc(V.health)} · closes in ${V.daysLeft} day${V.daysLeft === 1 ? "" : "s"}${V.scouted ? "" : " · a trainer would narrow the ranges"}</div>
      <div class="car-row" style="margin-top:8px"><button class="btn small" data-mkask="${V.id}" ${canAsk ? "" : "disabled"}>${sel ? "Hide offer" : "Make an offer"}</button><button class="btn small primary" data-mkbuy="${V.id}:${V.ask}" ${free && C.cash >= V.ask ? "" : "disabled"}>Buy at ${money(V.ask)}</button>${!free ? `<span style="font-size:12px;color:var(--warn)">No free box</span>` : C.cash < V.ask ? `<span style="font-size:12px;color:var(--fg-dim)">Short of cash</span>` : ""}</div>
      ${offer}</div>`;
  }
  function openMarket(tab, from) {
    style(); CORE.syncCalendar(C); CORE.marketSync(C); const prevTop = mk.keep ? screen("market").scrollTop : 0; mk.keep = false; if (from) mk.from = from; if (tab) mk.tab = tab; if (mk.tab !== "buy") mk.sel = null;
    const el = screen("market"), L = C.market.listings, free = C.horses.length < slots();
    const tabs = [["buy", "Buy"], ["sell", "Sell"], ["create", "Create your own"]].map(([k, n]) => `<button class="btn small ${mk.tab === k ? "primary" : ""}" data-mktab="${k}">${n}</button>`).join(" ");
    let body = "";
    if (mk.tab === "buy") body = `<div class="car-panel" style="font-size:12.5px;color:var(--fg-dim);margin:4px 0 8px">Horses change every week — some are sold to other buyers, others close. The ranges are a scout's estimate${CORE.staffOf(C, "trainer") ? " (your trainer narrows them)" : ""}; you only see the true figures after you own the horse. Make an offer (up to ${CORE.MKT.ROUNDS} rounds) or pay the asking price. ${free ? "" : "<b>You have no free box</b> — sell a horse or win more races to unlock one."}</div>
      <div class="car-grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">${L.length ? L.map(l => mkCard(CORE.marketView(C, l), l)).join("") : `<div class="car-panel">No horses are on offer this week.</div>`}</div>`;
    else if (mk.tab === "sell") body = `<div class="car-panel" style="font-size:12.5px;color:var(--fg-dim);margin:4px 0 8px">A sale is the horse's valuation (ability, potential, age, record, condition) less the agent's ${Math.round(CORE.MKT.COMMISSION * 100)}%, moved by this week's market. You can't sell your last horse or one that is booked into a race.</div>
      <div class="car-panel"><table class="car-tbl"><tr><th>Horse</th><th>Age</th><th>Rating</th><th class="hide-s">Record</th><th style="text-align:right">Offer</th><th></th></tr>
      ${C.horses.map(h => { const q = CORE.sellQuote(C, h.id), c = mk.confirm; return `<tr><td><b>${esc(h.name)}</b></td><td>${h.age}</td><td>${q.rating} → ${potRating(h)}</td><td class="hide-s">${h.races} start${h.races === 1 ? "" : "s"} · ${h.wins} win${h.wins === 1 ? "" : "s"}</td><td style="text-align:right"><b>${money(q.price)}</b></td>
        <td style="text-align:right">${q.blocked ? `<span style="font-size:12px;color:var(--fg-dim)">${q.blocked === "last" ? "your last horse" : "booked in a race"}</span>` : c === h.id ? `<button class="btn small primary" data-mksell="${h.id}">Confirm sale</button> <button class="btn small" data-mkcancel="1">Cancel</button>` : c === "r:" + h.id ? `<button class="btn small primary" data-mkretire="${h.id}">Confirm retirement</button> <button class="btn small" data-mkcancel="1">Cancel</button>` : `<button class="btn small" data-mkconfirm="${h.id}">Sell…</button> <button class="btn small" data-mkrconfirm="${h.id}">Retire…</button>`}${CORE.retirePrompt(h) ? `<div style="font-size:11.5px;color:var(--warn)">${esc(h.name)} ${esc(CORE.retirePrompt(h))}</div>` : ""}</td></tr>`; }).join("")}</table><div style="font-size:11.5px;color:var(--fg-dim);margin-top:6px">Retiring keeps the horse's whole record in the Hall of Fame and pays a small tribute (${Math.round(CORE.HOF.TRIBUTE * 100)}% of its value); horses past ${CORE.HOF.MAX_AGE} retire at the end of the season. <a href="#" id="mkHof" style="color:var(--accent)">Open the Hall of Fame (${(C.hof || []).length})</a></div></div>`;
    else body = `<div class="car-panel"><div class="car-sub">Create your own thoroughbred</div><div style="font-size:13px;margin:4px 0 8px">Design the look, silks, ability and potential yourself in the five-step creator. ${CORE.createFee(C) ? `A custom horse costs <b>${money(CORE.createFee(C))}</b>, and the fee grows with every horse in your stable.` : "Your first horse is free."}</div>
      <button class="btn primary" id="mkCreate" ${free && C.cash >= CORE.createFee(C) ? "" : "disabled"}>Open the creator (${CORE.createFee(C) ? money(CORE.createFee(C)) : "free"})</button> <span style="font-size:12px;color:var(--fg-dim)">${!free ? "No free box." : C.cash < CORE.createFee(C) ? "Short of cash." : ""}</span></div>`;
    page(el, `<h2>Horse Market</h2><div class="car-sub">${esc(C.stable)} · ${CORE.fmtDate(C.day)} · ${C.horses.length} of ${slots()} boxes in use</div>
      <div class="car-panel car-row" style="justify-content:space-between;align-items:center"><div><div class="car-sub">Cash</div><div class="car-big" style="font-size:28px;color:var(--good)">${money(C.cash)}</div></div><div class="car-row">${tabs}</div></div>
      ${mk.msg ? `<div class="car-panel" style="border-color:var(--accent)">${mk.msg}</div>` : ""}${body}
      <div class="car-row"><button class="btn" id="mkBack">Back</button></div>`);
    el.scrollTop = prevTop; const q = id => el.querySelector(id), again = () => { mk.keep = true; openMarket(); };
    q("#mkBack").onclick = () => { mk.msg = ""; mk.sel = null; mk.confirm = null; mk.from === "office" ? openOffice() : home(); };
    el.querySelectorAll("[data-mktab]").forEach(b => b.onclick = () => { mk.tab = b.dataset.mktab; mk.msg = ""; mk.sel = null; mk.confirm = null; again(); });
    el.querySelectorAll("[data-mkask]").forEach(b => b.onclick = () => { mk.sel = mk.sel === b.dataset.mkask ? null : b.dataset.mkask; again(); });
    el.querySelectorAll("[data-mkoffer]").forEach(b => b.onclick = () => {
      const price = +q("#mkOffer").value, r = CORE.marketOffer(C, b.dataset.mkoffer, price, { slots: slots() }), name = (C.market.listings.find(l => l.id === b.dataset.mkoffer) || {}).name || "the seller";
      if (!r.ok) { mk.msg = r.reason === "cash" ? "You don't have " + money(price) + "." : r.reason === "box" ? "You have no free box." : r.reason === "closed" ? "That seller has walked away." : "That offer isn't valid."; save(); return again(); }
      if (r.outcome === "accepted") { const bb = CORE.marketBuy(C, b.dataset.mkoffer, r.price, { slots: slots() }); if (bb.ok) { save(); mk.sel = null; mk.msg = `<b>Deal!</b> ${esc(bb.horse.name)} is yours for ${money(bb.price)} and goes to your box.`; toast(esc(bb.horse.name) + " has joined your stable (−" + money(bb.price) + ")", "good", 3); return again(); } }
      mk.msg = r.outcome === "counter" ? `${esc(name)}'s owner will take <b>${money(r.counter)}</b> — accept it, or make another offer (${r.roundsLeft} round${r.roundsLeft === 1 ? "" : "s"} left).` : r.outcome === "walked" ? `The owner of ${esc(name)} has had enough and walked away.` : `That is far below what they want${r.roundsLeft ? " — try higher (" + r.roundsLeft + " round" + (r.roundsLeft === 1 ? "" : "s") + " left)" : ""}.`;
      save(); again(); });
    el.querySelectorAll("[data-mkbuy]").forEach(b => b.onclick = () => { const [id, price] = b.dataset.mkbuy.split(":"), bb = CORE.marketBuy(C, id, +price, { slots: slots() });
      if (bb.ok) { save(); mk.sel = null; mk.msg = `<b>Bought!</b> ${esc(bb.horse.name)} is in your stable for ${money(bb.price)} — find it in its box on the farm.`; toast(esc(bb.horse.name) + " has joined your stable (−" + money(bb.price) + ")", "good", 3); }
      else mk.msg = bb.reason === "cash" ? "Not enough cash." : bb.reason === "box" ? "You have no free box." : bb.reason === "gone" ? "That horse has just been sold." : "That price isn't accepted.";
      again(); });
    el.querySelectorAll("[data-mkconfirm]").forEach(b => b.onclick = () => { mk.confirm = b.dataset.mkconfirm; again(); });
    el.querySelectorAll("[data-mkcancel]").forEach(b => b.onclick = () => { mk.confirm = null; again(); });
    el.querySelectorAll("[data-mkrconfirm]").forEach(b => b.onclick = () => { mk.confirm = "r:" + b.dataset.mkrconfirm; again(); });
    el.querySelectorAll("[data-mkretire]").forEach(b => b.onclick = () => { const r = CORE.retireHorse(C, b.dataset.mkretire, "chosen"); mk.confirm = null;
      if (r.ok) { save(); mk.msg = `<b>${esc(r.name)} is retired.</b> Its record is in the Hall of Fame${r.tribute ? " and the stable receives " + money(r.tribute) : ""}.`; toast(esc(r.name) + " has been retired to the Hall of Fame", "good", 3); } else mk.msg = r.reason === "last" ? "You can't retire your last horse." : r.reason === "booked" ? "That horse is booked into a race." : "It could not be retired.";
      again(); });
    const hofLink = q("#mkHof"); if (hofLink) hofLink.onclick = e => { e.preventDefault(); openHallOfFame(); };
    el.querySelectorAll("[data-mksell]").forEach(b => b.onclick = () => { const r = CORE.sellHorse(C, b.dataset.mksell); mk.confirm = null;
      if (r.ok) { save(); mk.msg = `<b>Sold.</b> ${esc(r.name)} went for ${money(r.price)}.`; toast(esc(r.name) + " sold for " + money(r.price), "good", 3); } else mk.msg = r.reason === "last" ? "You can't sell your last horse." : r.reason === "booked" ? "That horse is booked into a race." : "The sale could not be made.";
      again(); });
    const mc = q("#mkCreate"); if (mc) mc.onclick = () => { createFromFarm = mk.from === "farm"; fromFarm = mk.from === "farm"; hidePanel(); openCreate(); };
    show("c_market");
  }
  function openOffice() {
    style(); CORE.syncCalendar(C);
    const el = screen("office"), s = S();
    const sn = CORE.seasonOfDay(C.day), fin = C.fin[sn] || { in: 0, out: 0, by: {} };
    const ledger = C.ledger.slice(-25).reverse();
    const ups = CORE.upcoming(C, 14);
    const evRow = e => { const m = BY_ID[e.ref] || {};
      return `<tr><td>${CORE.fmtDate(e.day, { short: true })}</td><td><b>${esc(m.name || e.ref)}</b>${e.kind === "round" ? ` <span class="car-tag car-won">Round ${e.round + 1}</span>` : ` <span class="car-tag">Optional</span>`}</td><td class="hide-s">${esc(e.venue)}</td><td>${fmtDist(m.dist || 0)}</td><td class="hide-s">${esc(m.grade || "")}</td><td class="hide-s">${CORE.purseLabel(m)}</td><td>${CORE.TOD_LABEL[e.tod] || ""}</td><td>${CORE.WX_LABEL[e.forecast.weather] || ""} · ${going(e.forecast.going)}</td></tr>`; };
    const seasons = Object.keys(C.fin).map(Number).sort((a, b) => b - a).slice(0, 4);
    const bk = CORE.listBackups(localStorage);
    page(el, `<h2>Stable Office</h2>
      <div class="car-sub">${esc(C.stable)} · ${CORE.fmtDate(C.day)} · ${CORE.seasonLabel(sn)} season</div>
      <div class="car-panel car-row" style="justify-content:space-between;align-items:flex-end">
        <div><div class="car-sub">Cash</div><div class="car-big" id="ofCash" style="font-size:30px;color:var(--good)">${money(C.cash)}</div></div>
        <div class="car-kv"><span>This season: income <b>${money(fin.in)}</b></span><span>spending <b>${money(fin.out)}</b></span><span>net <b>${money(fin.in - fin.out)}</b></span></div>
      </div>
      ${financeHtml(fin)}
      <div class="car-panel car-row" style="justify-content:space-between;align-items:center"><div><div class="car-sub">Horse market</div><div style="font-size:13px">Buy a new horse, sell one, or pay for a custom one. ${C.horses.length} of ${slots()} boxes in use.</div></div><button class="btn primary" id="ofMarket">Open the horse market</button></div>
      ${facilitiesHtml()}
      <div class="car-panel"><div class="car-sub">Ledger — most recent first</div>
        ${ledger.length ? `<table class="car-tbl"><tr><th>Date</th><th>Item</th><th style="text-align:right">Amount</th><th style="text-align:right" class="hide-s">Balance</th></tr>
        ${ledger.map(e => `<tr><td>${CORE.fmtDate(e.day, { short: true })}</td><td>${esc(e.note || e.kind)}</td><td style="text-align:right;color:${e.amount < 0 ? "var(--bad)" : "var(--good)"}">${e.amount < 0 ? "−" : "+"}${money(Math.abs(e.amount))}</td><td style="text-align:right" class="hide-s">${money(e.bal)}</td></tr>`).join("")}</table>`
        : `<div style="font-size:13px;color:var(--fg-dim)">No transactions yet.</div>`}
        ${seasons.length ? `<div class="car-sub" style="margin-top:10px">Season summaries</div><table class="car-tbl"><tr><th>Season</th><th style="text-align:right">Income</th><th style="text-align:right">Spending</th><th style="text-align:right">Net</th></tr>
        ${seasons.map(n => { const f = C.fin[n]; return `<tr><td>${CORE.seasonLabel(n)}</td><td style="text-align:right">${money(f.in)}</td><td style="text-align:right">${money(f.out)}</td><td style="text-align:right">${money(f.in - f.out)}</td></tr>`; }).join("")}</table>` : ""}
        <div style="font-size:11.5px;color:var(--fg-dim);margin-top:8px">Prize money for places 1–5 in a championship round is paid once into the stable's cash. Horses, staff and facilities are bought in later updates.</div></div>
      <div class="car-panel"><div class="car-sub">Calendar — upcoming</div>
        <table class="car-tbl"><tr><th>Date</th><th>Race</th><th class="hide-s">Venue</th><th>Distance</th><th class="hide-s">Grade</th><th class="hide-s">Prize</th><th>Time</th><th>Forecast</th></tr>${ups.map(evRow).join("") || `<tr><td colspan="8">No events left this season.</td></tr>`}</table>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-top:8px">Championship rounds are run in order on their dates; optional races can be entered at any time and take a day of calendar time. Time of day and weather are fixed for each event now and shown on the race itself in a later update.</div></div>
      ${C.horses.length ? `<div class="car-panel"><div class="car-sub">Horse condition</div>
        <table class="car-tbl"><tr><th>Horse</th><th>Age</th><th class="hide-s">Stage</th><th>Fitness</th><th>Development</th><th class="hide-s">Last raced</th></tr>
        ${C.horses.map(h => `<tr><td><b>${esc(h.name)}</b></td><td>${h.age}</td><td class="hide-s">${CORE.ageStage(h.age)}</td><td>${h.fitness}</td><td>${DEV_LABEL[h.growth.type] || ""}</td><td class="hide-s">${h.lastRaceDay != null ? CORE.fmtDate(h.lastRaceDay, { short: true }) : "—"}</td></tr>`).join("")}</table>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-top:8px">Horses age on 1 August. Age, fitness and development are recorded from now on but do not change how a horse races yet — your horses' ratings are exactly as before.</div></div>` : ""}
      <div class="car-panel"><div class="car-sub">Save &amp; backups</div>
        <div style="font-size:12.5px;color:var(--fg-dim);margin:2px 0 8px">Your career is saved in this browser. Export a copy to keep it safe or move it to another device. Importing never overwrites your current career without making a backup first.</div>
        <div class="car-row"><button class="btn" id="ofExport">Download career file</button><button class="btn" id="ofCopy">Copy to clipboard</button><button class="btn" id="ofFileBtn">Import from file…</button><input type="file" id="ofFile" accept=".json,application/json" hidden></div>
        <textarea id="ofPaste" class="car-in" rows="3" placeholder="…or paste an exported career here" style="width:100%;margin-top:8px;font-size:12px"></textarea>
        <div class="car-row" style="margin-top:6px"><button class="btn" id="ofPasteGo">Check pasted career</button></div>
        <div id="ofMsg" style="margin-top:8px;font-size:13px"></div>
        ${bk.length ? `<div class="car-sub" style="margin-top:10px">Backup copies kept in this browser</div><div style="font-size:12px;color:var(--fg-dim)">${bk.map(b => `${esc(b.key.replace("ff_career_", ""))} (${Math.round(b.bytes / 1024)} KB)`).join(" · ")}</div>` : ""}
      </div>
      <div class="car-row"><button class="btn" id="ofBack">Back</button></div>`);
    const q = id => el.querySelector(id), msg = (t, bad) => { q("#ofMsg").innerHTML = t; q("#ofMsg").style.color = bad ? "var(--bad)" : "var(--fg)"; };
    q("#ofBack").onclick = () => home();
    q("#ofMarket").onclick = () => openMarket("buy", "office");
    el.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => { const r = CORE.buyFacility(C, b.dataset.buy); if (r.ok) { save(); toast(CORE.FACILITIES[b.dataset.buy].name + " is now level " + r.level + " (−" + money(r.cost) + ")", "good", 3); openOffice(); } else toast(r.reason === "cash" ? "Not enough cash — " + money(r.short) + " short" : "Can't buy that", "warn", 3); });
    el.querySelectorAll("[data-hire]").forEach(b => b.onclick = () => { const [role, tier] = b.dataset.hire.split(":"), sp = el.querySelector(`[data-spec="${role}"]`), r = CORE.hireStaff(C, role, +tier, sp && sp.value); if (r.ok) { save(); toast(r.staff.name + " joins as your " + CORE.STAFFROLES[role].name.toLowerCase() + " (−" + money(r.fee) + ")", "good", 3); openOffice(); } else toast(r.reason === "cash" ? "Not enough cash for the recruitment fee" : "That role is already filled", "warn", 3); });
    el.querySelectorAll("[data-fire]").forEach(b => b.onclick = () => { CORE.fireStaff(C, b.dataset.fire); save(); toast("They have left the stable", "info", 2.4); openOffice(); });
    const adv = q("#ofClub"); if (adv) adv.onclick = () => { const r = CORE.clubAdvance(C); if (r.ok) { save(); toast("The stable club advanced " + money(r.amount) + " — half of every prize repays it", "good", 3.4); openOffice(); } else toast(r.reason === "used" ? "You've already had this season's advance" : "Your cash is above the club's threshold (" + money(CORE.ECON.CLUB.TRIGGER) + ")", "info", 3); };
    q("#ofExport").onclick = () => {
      try { const text = exportText(), a = document.createElement("a"), d = new Date(), stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = "final-furlong-career-" + stamp + ".json"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        msg("Career file downloaded (" + Math.round(text.length / 1024) + " KB). If nothing downloaded, use “Copy to clipboard” instead."); } catch (e) { msg("Couldn't create the file: " + esc(e.message), true); } };
    q("#ofCopy").onclick = () => { const text = exportText();
      const fallback = () => { const ta = q("#ofPaste"); ta.value = text; ta.select(); try { document.execCommand("copy"); msg("Copied. (If it didn't copy, the text is in the box below — select it all and copy.)"); } catch (e) { msg("Select the text in the box below and copy it."); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => msg("Career copied to the clipboard (" + Math.round(text.length / 1024) + " KB)."), fallback); else fallback(); };
    const confirmImport = text => {
      const r = importPrepare(text); if (!r.ok) return msg("✗ " + esc(r.error), true);
      const sm = r.summary;
      msg(`<div><b>${esc(sm.stable)}</b> · ${sm.horses} horse${sm.horses === 1 ? "" : "s"}${sm.horses ? " (" + sm.names.map(esc).join(", ") + ")" : ""} · season ${sm.season} · ${money(sm.cash)} · ${CORE.fmtDate(sm.day)}${r.from < CORE.V ? ` · upgraded from v${r.from}` : ""}</div>
        <div style="margin:6px 0">Replace your current career with this one? A backup of your current career is made first.</div>
        <div class="car-row"><button class="btn primary" id="ofYes">Replace my career</button><button class="btn" id="ofNo">Cancel</button></div>`);
      q("#ofNo").onclick = () => msg("Import cancelled — nothing was changed.");
      q("#ofYes").onclick = () => { const res = importText(text); if (!res.ok) return msg("✗ " + esc(res.error), true); toast("Career imported" + (res.backup ? " — your previous career was backed up" : ""), "good", 2.4); openHub(); };
    };
    q("#ofPasteGo").onclick = () => confirmImport(q("#ofPaste").value);
    q("#ofFileBtn").onclick = () => q("#ofFile").click();
    q("#ofFile").onchange = e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (f.size > 6 * 1024 * 1024) return msg("✗ That file is too large to be a career save.", true); const rd = new FileReader(); rd.onload = () => confirmImport(String(rd.result || "")); rd.onerror = () => msg("✗ The file couldn't be read.", true); rd.readAsText(f); };
    el.querySelectorAll("textarea,input").forEach(i => i.addEventListener("keydown", e => e.stopPropagation()));
    show("c_office");
  }

  // ---------- RIVALS ----------
  function devLabel(rv) { const gap = Object.keys(rv.pot).reduce((s, k) => s + (rv.pot[k] - rv.attrs[k]), 0) / 8; return rv.retired ? "Retired" : gap < 1.2 ? "At its peak" : gap < 4 ? "Still improving" : "Rising prospect"; }
  function openRivals() {
    style(); const el = screen("rivals");
    stage("stalls");
    const met = {};
    for (const key in C.h2h) { const [hid, rid] = key.split("|"); const h = C.horses.find(x => x.id === hid); if (!h) continue; const m = met[rid] || (met[rid] = { n: 0, ahead: 0, behind: 0, closest: null, vs: [] }); const r = C.h2h[key]; m.n += r.n; m.ahead += r.ahead; m.behind += r.behind; if (r.closest != null && (m.closest == null || r.closest < m.closest)) m.closest = r.closest; m.vs.push(h.name); }
    const metList = Object.keys(met).map(id => ({ rv: SEASON.rival(C, id), m: met[id] })).filter(x => x.rv).sort((a, b) => b.m.n - a.m.n);
    const s = S(), divRivals = SEASON.stablesOf(C, s.div).flatMap(st => st.horses.map(id => SEASON.rival(C, id))).filter(Boolean).sort((a, b) => SEASON.rRating(b) - SEASON.rRating(a));
    const row = (rv, extra) => `<tr class="click" data-rv="${rv.id}"><td><b>${esc(rv.name)}</b><div style="font-size:11px;color:var(--fg-dim)">${esc(stableName(rv.sid))}${rv.star ? " · ★ star" : ""}</div></td><td>${SEASON.rRating(rv)}</td><td>${(rv.form || []).slice(-5).map(x => x === 0 ? "F" : x > 9 ? "0" : x).join("-") || "—"}</td><td>${rv.wins}/${rv.starts}</td><td class="hide-s">${bestDistances(rv.attrs).text}</td>${extra}</tr>`;
    page(el, `<h2>Rivals</h2>
      <div class="car-sub">Persistent AI horses — they develop through their own racing, never because of yours</div>
      <div class="car-panel"><div class="car-sub">Horses you have raced against</div>
        ${metList.length ? `<table class="car-tbl"><tr><th>Horse</th><th>Rtg</th><th>Form</th><th>W/Starts</th><th class="hide-s">Best at</th><th>Meetings</th><th>You ahead</th><th class="hide-s">Closest</th></tr>
        ${metList.slice(0, 24).map(x => row(x.rv, `<td>${x.m.n}</td><td>${x.m.ahead}–${x.m.behind}</td><td class="hide-s">${x.m.closest != null ? x.m.closest.toFixed(2) + " s" : "—"}</td>`)).join("")}</table>` : `<div style="font-size:13px;color:var(--fg-dim)">Race a few times and your rivals will appear here.</div>`}</div>
      <div class="car-panel"><div class="car-sub">${esc(DIVS[s.div].name)} — every stable's horses</div>
        <table class="car-tbl"><tr><th>Horse</th><th>Rtg</th><th>Form</th><th>W/Starts</th><th class="hide-s">Best at</th><th>Development</th></tr>${divRivals.map(rv => row(rv, `<td>${devLabel(rv)}</td>`)).join("")}</table></div>
      <div class="car-row"><button class="btn" id="rvBack">Back</button></div>`);
    el.querySelectorAll("[data-rv]").forEach(t => t.onclick = () => openRival(t.getAttribute("data-rv"), openRivals));
    el.querySelector("#rvBack").onclick = () => openHub();
    show("c_rivals");
  }
  function stableName(sid) { for (let d = 0; d < DIVS.length; d++) { const st = SEASON.stablesOf(C, d).find(x => x.sid === sid); if (st) return st.name; } return ""; }
  function openRival(id, back) {
    style(); const rv = SEASON.rival(C, id); if (!rv) return;
    const el = screen("rival"), def = SEASON.rivalDef(C, rv);
    stage("full", { bay: def, rider: false, shift: true });
    const h2h = C.horses.map(h => ({ h, r: SEASON.h2hFor(C, h.id, id) })).filter(x => x.r);
    const seasons = Object.keys(rv.seasons || {}).map(n => ({ n: +n, ...rv.seasons[n] })).sort((a, b) => a.n - b.n);
    sidePage(el, {
      hint: `<b>${esc(rv.name)}</b>${esc(stableName(rv.sid))}`, cam: camBar(),
      head: `<div class="car-row" style="justify-content:space-between"><div><div class="car-sub">${esc(stableName(rv.sid))} · ${esc(DIVS[rv.div].short)}${rv.star ? " · ★ star" : ""}</div><h2>${esc(rv.name)}</h2></div>
        <div style="text-align:right"><div class="car-sub">Rating</div><b class="car-big" style="color:var(--accent)">${SEASON.rRating(rv)}</b><div style="font-size:11px;color:var(--fg-dim)">${devLabel(rv)}</div></div></div>`,
      body: `<div class="car-stat"><div><b>${rv.starts}</b><span>Starts</span></div><div><b>${rv.wins}</b><span>Wins</span></div><div><b>${rv.wins + rv.seconds + rv.thirds}</b><span>Placings</span></div>
          <div><b>${rv.majors.length}</b><span>Major wins</span></div><div><b>${(rv.form || []).slice(-5).map(x => x === 0 ? "F" : x > 9 ? "0" : x).join("-") || "—"}</b><span>Recent form</span></div><div><b>${esc(rv.role)}</b><span>Style</span></div></div>
        <div class="sd-sec"><div class="car-sub">Profile</div><div style="font-size:13px">Best at <b>${bestDistances(rv.attrs).text}</b> · strengths: ${Object.keys(rv.attrs).sort((a, b) => rv.attrs[b] - rv.attrs[a]).slice(0, 3).map(k => ALABEL[k].toLowerCase()).join(", ")}</div></div>
        ${rv.majors.length ? `<div class="sd-sec"><div class="car-sub">Major victories</div>${rv.majors.map(m => `<div class="car-res"><b>${esc(m.race)}</b><span>Season ${m.season}</span></div>`).join("")}</div>` : ""}
        <div class="sd-sec"><div class="car-sub">Head-to-head with your horses</div>${h2h.length ? h2h.map(({ h, r }) => `<div class="car-panel" style="padding:10px 12px"><b>${esc(h.name)} vs ${esc(rv.name)}</b>
          <div class="car-kv" style="margin-top:4px"><span>Meetings <b>${r.n}</b></span><span>${esc(h.name)} ahead <b>${r.ahead}</b></span><span>${esc(rv.name)} ahead <b>${r.behind}</b></span><span>Closest finish <b>${r.closest != null ? r.closest.toFixed(2) + " s" : "—"}</b></span></div>
          ${r.last.slice().reverse().slice(0, 4).map(m => `<div class="car-res"><span>${esc(m.race)} · S${m.season}</span><span>${m.me ? ordinal(m.me) : "DNF"} vs ${m.them ? ordinal(m.them) : "DNF"}${m.gap != null ? " · " + (m.gap >= 0 ? "+" : "") + m.gap.toFixed(2) + " s" : ""}</span></div>`).join("")}</div>`).join("") : `<div style="font-size:13px;color:var(--fg-dim)">Your horses haven't met ${esc(rv.name)} yet.</div>`}</div>
        ${seasons.length ? `<div class="sd-sec"><div class="car-sub">Development by season</div>${seasons.map(x => `<div class="car-res"><span>Season ${x.n}: ${x.wins} win${x.wins === 1 ? "" : "s"} from ${x.starts}</span><span>rating ${x.rating} → ${x.ratingEnd || x.rating}</span></div>`).join("")}</div>` : ""}`,
      foot: `<span></span><button class="btn" id="rvBack2">Back</button>`,
    });
    el.querySelector("#rvBack2").onclick = () => (back || openRivals)();
    show("c_rival");
  }

  // ---------- OPTIONAL RACES ----------
  function openOptional() {
    style(); const el = screen("opt"), h = activeHorse();
    const row = r => {
      const ok = h ? SEASON.eligibility(h, r).ok : false, why = h && !ok ? SEASON.eligibility(h, r).reqs.filter(q => !q.ok).map(q => q.label).join(", ") : "";
      return `<div class="car-race${ok ? "" : " locked"}">
        <div><div class="car-row" style="gap:8px"><span class="gr">${esc(r.grade)}</span>${r.regional ? `<span class="car-tag">Regional</span>` : ""}</div>
          <b style="font-family:var(--font-d);font-size:16px">${esc(r.name)}</b>
          <div class="meta">${esc(r.venue)} · ${fmtDist(r.dist)} ${distLbl(r.dist)} · field of ${r.field}${r.prize ? " · " + esc(r.prize) : ""}${(() => { const e = CORE.nextMeeting(C, r.id); return e ? " · next meeting " + CORE.fmtDate(e.day, { short: true }) : ""; })()}${r.note ? " · " + esc(r.note) : ""}${why ? ` · <span style="color:var(--warn)">not eligible: ${esc(why)}</span>` : ""}</div></div>
        <div><button class="btn${ok ? " primary" : ""} small car-btn" data-o="${r.id}">${ok ? "Select" : "Details"}</button></div></div>`;
    };
    const country = SEASON.OPTIONAL.filter(r => r.tier <= 1), city = SEASON.OPTIONAL.filter(r => r.tier > 1);
    const rows = `<div class="car-sub">Country and regional meetings — where a young or modest horse learns its trade (maidens, age races and benchmark classes)</div>${country.map(row).join("")}<div class="car-sub" style="margin-top:10px">City races and stakes</div>${city.map(row).join("")}`;
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
          <div class="meta">${(() => { const e = CORE.roundEvent(C, i); return e ? CORE.fmtDate(e.day) + " · " + (CORE.TOD_LABEL[e.tod] || "") + " · " : ""; })()}${esc(m.venue)} · ${fmtDist(m.dist)} ${distLbl(m.dist)} · ${going(rd.going)} · ${m.prize}</div></div>
        <div style="text-align:right">${status}</div></div>`;
    }).join("");
    page(el, `<h2>Season ${s.n} Calendar</h2>
      <div class="car-sub">${D.name} · ${CORE.seasonLabel(s.n)} season · ${s.rounds.length} rounds · round ${Math.min(s.cur + 1, s.rounds.length)} next · today is ${CORE.fmtDate(C.day)}</div>
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
      const r = SEASON.closeSeason(C); if (r) CORE.startSeason(C); save();
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
      ${(e.others || []).filter(o => o.champion).map(o => `<div style="font-size:12px;color:var(--fg-dim)">${esc(o.divName)} champion: <b style="color:var(--fg)">${esc(o.champion.name)}</b> (${o.champion.pts} pts)${o.majors.length ? " · " + o.majors.map(m => esc(m.race) + ": " + esc(m.horse)).join(" · ") : ""}</div>`).join("")}
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


  // ---------- STABLE OVERVIEW (five boxes in the 3D yard) ----------
  function openStable() {
    style(); const el = screen("stable");
    stage("stalls", { shift: true });
    const nextSlot = SLOT_AT.find(x => x[0] > C.wins);
    const cards = [0, 1, 2, 3, 4].map(i => {
      const h = C.horses[i];
      if (h) { const st = detectStyle(h.attrs);
        return `<div class="car-card${i === C.active ? " sel" : ""}" data-i="${i}"><div class="car-sub">Box ${i + 1}</div>
          <div class="car-row" style="justify-content:space-between"><b>${esc(h.name)}</b><span class="car-rz">${rating(h)}</span></div>
          <div style="font-size:12px;color:var(--fg-dim);margin:3px 0">${st.label} · ${bestDistances(h.attrs).text}</div>
          <div style="font-size:12px">${h.races} starts · ${h.wins} wins${h.trainPts ? ` · <span style="color:var(--accent)">${h.trainPts} pts</span>` : ""}</div></div>`; }
      const open = i < slots();
      return `<div class="car-card" ${open ? 'data-new="1"' : ""} style="border-style:dashed;opacity:${open ? .9 : .5}"><div class="car-sub">Box ${i + 1}</div><b>${open ? "+ Create a horse" : "Locked"}</b>
        <div style="font-size:12px;color:var(--fg-dim);margin-top:4px">${open ? "This box is free" : "Unlocks at " + (SLOT_AT.find(x => x[1] > i) || [12])[0] + " career wins"}</div></div>`;
    }).join("");
    sidePage(el, {
      bottom: true,
      hint: `<b>${esc(C.stable)}</b>${C.horses.length} of 5 boxes filled · click a horse or its box${nextSlot && slots() < 5 ? ` · next box at ${nextSlot[0]} wins (you have ${C.wins})` : ""}`,
      head: `<div class="car-row" style="justify-content:space-between"><h2 style="font-size:20px">The Stable</h2><div class="car-row"><button class="btn small" id="stTro">Trophy Room</button><button class="btn small" id="stBack">Career Hub</button></div></div>`,
      body: cards,
    });
    el.querySelectorAll(".car-card[data-i]").forEach(c => c.onclick = () => { C.active = +c.getAttribute("data-i"); save(); openProfile(C.active); });
    el.querySelectorAll("[data-new]").forEach(c => c.onclick = () => openCreate());
    el.querySelector("#stTro").onclick = () => openTrophies();
    el.querySelector("#stBack").onclick = () => openHub();
    show("c_stable");
  }

  // ---------- HORSE PROFILE ----------
  function attrRowsHtml(h, opts) {
    return ATTRS.map(([k, lab]) => {
      const v = h.attrs[k], p = h.pot[k];
      return `<div class="car-attr"><div class="nm">${lab}</div><div class="vals">${v} <span style="color:var(--fg-dim);font-size:12px">/ ${p}</span></div>
        <div class="car-bar"><u style="width:${p}%"></u><i style="width:${v}%"></i><div class="pot" style="left:${p}%"></div></div></div>`;
    }).join("");
  }
  function formStr(h, n) { return (h.history || []).slice(-(n || 6)).map(e => e.dnf ? "F" : e.place > 9 ? "0" : e.place).join("-") || "—"; }
  function openProfile(i) {
    style(); const h = C.horses[i]; if (!h) return openStable();
    C.active = i; save();
    const el = screen("profile"), st = detectStyle(h.attrs), pst = detectStyle(h.pot);
    stage("full", { bay: toDef(h), rider: false, shift: true });
    const majors = C.trophies.filter(t => t.kind !== "champ" && t.horse === h.name);
    const recent = (h.history || []).slice(-6).reverse();
    sidePage(el, {
      hint: `<b>${esc(h.name)}</b>Drag to walk round · scroll to zoom`,
      cam: camBar(),
      head: `<div class="car-row" style="justify-content:space-between"><div><div class="car-sub">Box ${i + 1} of 5 · ${st.label}</div><h2>${esc(h.name)}</h2></div>
        <div style="text-align:right"><div class="car-sub">Rating</div><b class="car-big" style="color:var(--accent)">${rating(h)}</b><div style="font-size:11px;color:var(--fg-dim)">potential ${potRating(h)}</div></div></div>
        <div class="car-row" style="margin-top:8px;gap:6px">${C.horses.length > 1 ? `<button class="car-chip" id="pfPrev">◀ Prev</button><button class="car-chip" id="pfNext">Next ▶</button>` : ""}<span style="font-size:12px;color:var(--fg-dim)">Level ${h.lvl} · <span style="color:var(--accent)">${h.trainPts} training pts</span></span></div>`,
      body: `
        <div class="car-stat"><div><b>${h.races}</b><span>Starts</span></div><div><b>${h.wins}</b><span>Wins</span></div><div><b>${h.podiums}</b><span>Placings</span></div>
          <div><b>${majors.length}</b><span>Major wins</span></div><div><b>${h.champPts}</b><span>Champ pts</span></div><div><b>${formStr(h, 5)}</b><span>Recent form</span></div></div>
        ${h.online && h.online.runs ? `<div class="sd-sec"><div class="car-sub">Online races (record only)</div><div style="font-size:13px">${h.online.runs} run${h.online.runs === 1 ? "" : "s"} · ${h.online.wins} win${h.online.wins === 1 ? "" : "s"} · ${h.online.places} placing${h.online.places === 1 ? "" : "s"}</div>${h.online.last.slice().reverse().slice(0, 5).map(e => `<div class="car-res"><span>${e.dist ? fmtDist(e.dist) : ""} · vs ${esc(e.vs || "friends")}</span><span>${e.dnf ? "DNF" : ordinal(e.place) + " of " + e.field}</span></div>`).join("")}</div>` : ""}
        <div class="sd-sec"><div class="car-sub">Racing profile</div>
          <div style="font-size:13px">Now: <b>${st.label}</b> · best at ${bestDistances(h.attrs).text}<br>Potential: <b>${pst.label}</b> · ${bestDistances(h.pot).text}</div>
          <div class="car-prof">${profileLines(h.pot).map(t => `<span>${esc(t)}</span>`).join("")}</div></div>
        <div class="sd-sec"><div class="car-sub">Attributes (current / potential)</div>${attrRowsHtml(h)}</div>
        ${majors.length ? `<div class="sd-sec"><div class="car-sub">Major victories</div>${majors.map(t => `<div class="car-res"><b>${esc(t.race)}</b><span>Season ${t.season || "—"}</span></div>`).join("")}</div>` : ""}
        <div class="sd-sec"><div class="car-sub">Recent runs</div>${recent.map(e => `<div class="car-res"><span><b>${esc(e.name || "")}</b>${e.off === false ? " (optional)" : ""} · ${e.dist ? fmtDist(e.dist) : ""}</span><span>${e.dnf ? "DNF" : ordinal(e.place)}${e.field ? "/" + e.field : ""}</span></div>`).join("") || `<div style="font-size:13px;color:var(--fg-dim)">No races yet.</div>`}</div>`,
      foot: `<button class="btn primary" id="pfTrain">Training${h.trainPts ? " (" + h.trainPts + ")" : ""}</button><button class="btn" id="pfEdit">Edit appearance</button><button class="btn" id="pfBack">Stable</button>`,
    });
    const q = s => el.querySelector(s);
    if (q("#pfPrev")) { q("#pfPrev").onclick = () => openProfile((i + C.horses.length - 1) % C.horses.length); q("#pfNext").onclick = () => openProfile((i + 1) % C.horses.length); }
    q("#pfTrain").onclick = () => openTraining();
    q("#pfEdit").onclick = () => openCreate(h.id);
    q("#pfBack").onclick = () => openStable();
    show("c_profile");
  }

  // ---------- TRAINING (immediate upgrades, with an undo for this visit) ----------
  function openTraining(flashKey) {
    style(); const h = activeHorse(); if (!h) return openHub();
    const el = screen("train");
    if (!openTraining.session || openTraining.session.id !== h.id) openTraining.session = { id: h.id, start: Object.assign({}, h.attrs), undo: [] };
    const ses = openTraining.session;
    if (!flashKey) stage("full", { bay: toDef(h), rider: false, shift: true });
    else STABLE3D.setBayHorse(toDef(h), { rider: false });
    const xpNeed = xpForLevel(h.lvl);
    const rows = ATTRS.map(([k, lab]) => {
      const v = h.attrs[k], p = h.pot[k], cost = upgCost(v), maxed = v >= p, d0 = v - ses.start[k];
      return `<div class="car-attr" data-k="${k}"><div class="nm">${lab.toUpperCase()}</div>
        <div class="vals">${v}${d0 ? ` <span style="color:var(--good)">+${d0}</span>` : ""} <span style="color:var(--fg-dim);font-size:12px">potential ${p}</span></div>
        <div class="car-bar${flashKey === k ? " flash" : ""}"><u style="width:${p}%"></u><i style="width:${v}%"></i><div class="pot" style="left:${p}%"></div></div>
        <div class="desc">${EFFECT[k][0]}</div>
        <div class="desc" style="color:#cfe8d4">${maxed ? "At this horse's potential ceiling." : `Upgrade ${v} → ${v + 1} · <b>${cost} pt${cost > 1 ? "s" : ""}</b> · ${EFFECT[k][1](1, v)}`}</div>
        <div class="up" style="grid-column:1/3"><button class="btn small primary car-btn" data-up="${k}" ${maxed || h.trainPts < cost ? "disabled" : ""}>Train +1</button></div></div>`;
    }).join("");
    const canRedist = !h.potSet && !h.potRedist;
    sidePage(el, {
      hint: `<b>${esc(h.name)}</b>Training — upgrades apply immediately`,
      cam: camBar(),
      head: `<div class="car-sub">Training · ${detectStyle(h.attrs).label}</div><h2>${esc(h.name)}</h2>
        <div class="car-pool" style="margin-top:10px"><span>Training points</span><b>${h.trainPts}</b></div>
        <div style="font-size:12px;color:var(--fg-dim);margin-top:8px">Rating <b style="color:var(--fg)">${rating(h)}</b> of potential ${potRating(h)} · Level ${h.lvl} (${h.xp}/${xpNeed} XP)</div>
        <div class="car-bar" style="margin-top:6px"><i style="width:${Math.min(100, 100 * h.xp / xpNeed)}%"></i></div>`,
      body: `<div style="font-size:12px;color:var(--fg-dim)">Every race earns training points — far more against strong fields and for good finishes. Upgrades get dearer as a stat rises and stop at the horse's potential (white mark).</div>
        ${rows}
        ${canRedist ? `<div class="car-panel" style="border-color:rgba(232,195,90,.4)"><b>One-time potential redistribution</b><div style="font-size:12.5px;color:var(--fg-dim);margin:4px 0 8px">This horse was created before you could choose potential. You may move its existing potential between attributes once — the total stays exactly the same.</div><button class="btn small" id="trRedist">Redistribute potential</button></div>` : ""}`,
      foot: `<button class="btn" id="trUndo" ${ses.undo.length ? "" : "disabled"}>Undo last</button><span style="font-size:12px;color:var(--fg-dim)">${Object.keys(ses.start).filter(k => h.attrs[k] !== ses.start[k]).length ? "Rating " + Math.round(avgA(ses.start)) + " → " + rating(h) : ""}</span><button class="btn primary" id="trDone">Done</button>`,
    });
    el.querySelectorAll("[data-up]").forEach(b => b.onclick = () => {
      const k = b.getAttribute("data-up"), v = h.attrs[k], cost = upgCost(v);
      if (v >= h.pot[k] || h.trainPts < cost) return;
      h.attrs[k]++; h.trainPts -= cost; h.trained++; ses.undo.push([k, cost]); save();
      try { audio.tapGood(0.8, 1); } catch (e) {}
      const y = el.querySelector(".sd-body").scrollTop; openTraining(k); el.querySelector(".sd-body").scrollTop = y;
    });
    el.querySelector("#trUndo").onclick = () => { const u = ses.undo.pop(); if (!u) return; h.attrs[u[0]]--; h.trainPts += u[1]; h.trained = Math.max(0, h.trained - 1); save(); const y = el.querySelector(".sd-body").scrollTop; openTraining(u[0]); el.querySelector(".sd-body").scrollTop = y; };
    el.querySelector("#trDone").onclick = () => { openTraining.session = null; openProfile(C.active); };
    const rd = el.querySelector("#trRedist"); if (rd) rd.onclick = () => openRedistribute();
    show("c_train");
  }
  // Phase 26: the training board on the farm uses the SAME allocation rules as the Training screen (same costs, same potential ceilings, same undo), without leaving the farm
  const trainSes = h => { if (!openTraining.session || openTraining.session.id !== h.id) openTraining.session = { id: h.id, start: Object.assign({}, h.attrs), undo: [] }; return openTraining.session; };
  const trainingApi = {
    view(hid) {
      if (!C) load(); const h = (C.horses || []).find(x => x && x.id === hid); if (!h) return null; const ses = trainSes(h), need = xpForLevel(h.lvl);
      return { hid: h.id, name: h.name, style: detectStyle(h.attrs).label, pts: h.trainPts | 0, rating: rating(h), potRating: potRating(h), lvl: h.lvl, xp: h.xp, xpNeed: need, canUndo: ses.undo.length > 0,
        rows: ATTRS.map(([k, lab]) => { const v = h.attrs[k], p = h.pot[k], cost = upgCost(v), maxed = v >= p; return { k, lab, v, p, cost, maxed, gained: v - ses.start[k], can: !maxed && h.trainPts >= cost, effect: EFFECT[k][0], next: maxed ? "" : EFFECT[k][1](1, v) }; }) };
    },
    up(hid, k) { if (!C) load(); const h = (C.horses || []).find(x => x && x.id === hid); if (!h || !h.attrs || !(k in h.attrs)) return { ok: false }; const v = h.attrs[k], cost = upgCost(v); if (v >= h.pot[k] || h.trainPts < cost) return { ok: false, reason: v >= h.pot[k] ? "max" : "points" };
      const ses = trainSes(h); h.attrs[k]++; h.trainPts -= cost; h.trained++; ses.undo.push([k, cost]); save(); try { audio.tapGood(0.8, 1); } catch (e) {} return { ok: true, k, cost, value: h.attrs[k] }; },
    undo(hid) { if (!C) load(); const h = (C.horses || []).find(x => x && x.id === hid); if (!h) return { ok: false }; const ses = trainSes(h), u = ses.undo.pop(); if (!u) return { ok: false }; h.attrs[u[0]]--; h.trainPts += u[1]; h.trained = Math.max(0, h.trained - 1); save(); return { ok: true, k: u[0] }; },
    points(hid) { if (!C) load(); const h = (C.horses || []).find(x => x && x.id === hid); return h ? h.trainPts | 0 : 0; },
  };
  // older horses: move existing potential between attributes once; total headroom is preserved exactly
  function openRedistribute() {
    const h = activeHorse(), el = screen("train");
    const total = AKEYS.reduce((s, k) => s + (h.pot[k] - h.attrs[k]), 0);
    const hr = {}; AKEYS.forEach(k => hr[k] = h.pot[k] - h.attrs[k]);
    const used = () => AKEYS.reduce((s, k) => s + hr[k], 0);
    function draw() {
      sidePage(el, {
        hint: `<b>${esc(h.name)}</b>Redistributing potential`, cam: camBar(),
        head: `<div class="car-sub">One-time · total potential is fixed</div><h2>Redistribute potential</h2><div class="car-pool" style="margin-top:10px"><span>Unassigned</span><b id="rdLeft">${total - used()}</b></div>`,
        body: ATTRS.map(([k, lab]) => `<div class="car-attr"><div class="nm">${lab}</div><div class="vals"><span id="rv_${k}">${h.attrs[k] + hr[k]}</span></div>
          <input type="range" min="${h.attrs[k]}" max="99" value="${h.attrs[k] + hr[k]}" data-rk="${k}"></div>`).join("") + `<div class="car-prof" id="rdProf"></div>`,
        foot: `<button class="btn" id="rdCancel">Cancel</button><button class="btn primary" id="rdOk">Confirm (${total} total)</button>`,
      });
      const prof = () => { const p = {}; AKEYS.forEach(k => p[k] = h.attrs[k] + hr[k]); el.querySelector("#rdProf").innerHTML = profileLines(p).map(t => `<span>${esc(t)}</span>`).join(""); el.querySelector("#rdLeft").textContent = total - used(); };
      el.querySelectorAll("[data-rk]").forEach(r => r.oninput = () => { const k = r.getAttribute("data-rk"); let want = +r.value - h.attrs[k]; const room = total - (used() - hr[k]); want = Math.max(0, Math.min(want, room)); hr[k] = want; r.value = h.attrs[k] + want; el.querySelector("#rv_" + k).textContent = h.attrs[k] + want; prof(); });
      prof();
      el.querySelector("#rdCancel").onclick = () => openTraining();
      el.querySelector("#rdOk").onclick = () => { if (used() !== total) { toast("Assign all " + total + " potential points first", "warn", 1.8); return; } AKEYS.forEach(k => h.pot[k] = h.attrs[k] + hr[k]); h.potRedist = true; save(); toast("Potential redistributed", "good", 1.6); openTraining(); };
    }
    draw();
  }

  // ---------- TROPHY ROOM ----------
  function trophyList() {
    return C.trophies.map((t, i) => {
      const meta = BY_ID[t.raceId];
      if (t.kind === "champ") return { id: "t" + i, title: t.race, sub: "Season " + t.season, gold: true, big: true, rec: t };
      return { id: "t" + i, title: t.race, sub: (t.horse || "") + (t.season ? " · S" + t.season : ""), gold: !meta || meta.tier >= 3, big: !!(meta && meta.crown), rec: t };
    });
  }
  function showTrophy(t) {
    const el = screen("trophy"), box = el.querySelector("#troDetail"); if (!box) return;
    const r = t.rec, meta = BY_ID[r.raceId];
    box.innerHTML = `<div class="car-panel car-next"><div class="car-sub">${r.kind === "champ" ? "Championship" : meta ? esc(meta.grade) + " · " + esc(meta.venue) + " · " + fmtDist(meta.dist) : "Feature race"}</div>
      <h3>🏆 ${esc(r.race)}</h3><div class="car-kv">${r.kind === "champ" ? `<span>Season <b>${r.season}</b></span><span>Horses: <b>${esc(r.horse || "—")}</b></span>` : `<span>Won by <b>${esc(r.horse || "—")}</b></span>${r.season ? `<span>Season <b>${r.season}</b></span>` : ""}${meta && meta.prize ? `<span>Prize <b>${meta.prize}</b></span>` : ""}`}</div></div>`;
    box.scrollIntoView({ block: "nearest" });
  }
  function openTrophies() {
    style(); const el = screen("trophy");
    stage("trophy", { shift: true });
    const list = trophyList(); STABLE3D.setTrophies(list);
    const champs = C.trophies.filter(t => t.kind === "champ");
    const feature = DIVS.flatMap(d => d.rounds).filter(r => r.major);
    sidePage(el, {
      hint: `<b>Trophy Room</b>${list.length ? "Click a trophy to inspect it" : "Win feature races and championships to fill the shelves"}`,
      head: `<div class="car-sub">${esc(C.stable)}</div><h2>Trophy Room</h2><div style="font-size:12.5px;color:var(--fg-dim);margin-top:4px">${champs.length} championship${champs.length === 1 ? "" : "s"} · ${C.trophies.length - champs.length} feature-race trophies</div>`,
      body: `<div id="troDetail"></div>
        <div class="sd-sec"><div class="car-sub">Championships</div>${champs.length ? champs.map(t => `<div class="car-res"><b>🏆 ${esc(t.race)}</b><span>Season ${t.season}</span></div>`).join("") : `<div style="font-size:13px;color:var(--fg-dim)">None yet.</div>`}</div>
        <div class="sd-sec"><div class="car-sub">Feature races</div>${feature.map(r => { const w = C.trophies.filter(t => t.raceId === r.id && t.kind !== "champ");
          return `<div class="car-res" ${w.length ? "" : 'style="opacity:.55"'}><span><b>${esc(r.name)}</b> · ${esc(r.grade)}</span><span>${w.length ? w.map(t => esc(t.horse) + (t.season ? " S" + t.season : "")).join(", ") : "—"}</span></div>`; }).join("")}</div>`,
      foot: `<button class="btn" id="trStable">Stable</button><button class="btn" id="trBack">Career Hub</button>`,
    });
    el.querySelector("#trStable").onclick = () => openStable();
    el.querySelector("#trBack").onclick = () => home();
    show("c_trophy");
  }

  // ---------- CREATE (and edit appearance) — five steps in the grooming bay ----------
  let draft = null, prevT = 0;
  const STEP_NAMES = ["Appearance", "Silks", "Ability", "Potential", "Review"];
  function newDraft() {
    const a = {}, hr = {}; for (const k of AKEYS) { a[k] = BASE; hr[k] = Math.round(POT_POOL / 8); }
    return { editId: null, step: 1, name: "", say: "", coat: 0, face: "star", socks: [1, 0, 0, 2], body: Object.fromEntries(BODY.map(b => [b[0], b[5]])), mane: 0, tail: 0, silk: 0, silk2: 6, pat: 1, attrs: a, hr };
  }
  function draftFromHorse(h) {
    const d = newDraft(); d.editId = h.id; d.name = h.name; d.say = h.say || "";
    d.coat = Math.max(0, COATS.findIndex(c => c.hex.toLowerCase() === h.look.coat.toLowerCase())); if (COATS[d.coat].hex.toLowerCase() !== h.look.coat.toLowerCase()) d.customCoat = { hex: h.look.coat, type: h.look.type };
    d.face = h.look.face; d.socks = h.look.socks.slice();
    for (const b of BODY) d.body[b[0]] = h.look[b[0]] != null ? h.look[b[0]] : b[5];
    d.mane = HAIR.findIndex(x => x.hex === h.look.maneCol); if (d.mane < 0) { d.mane = 0; d.maneHex = h.look.maneCol; }
    d.tail = HAIR.findIndex(x => x.hex === h.look.tailCol); if (d.tail < 0) { d.tail = 0; d.tailHex = h.look.tailCol; }
    d.silk = SILK_PAL.indexOf(h.silk); if (d.silk < 0) { d.silk = 0; d.silkHex = h.silk; }
    d.silk2 = SILK_PAL.indexOf(h.silk2); if (d.silk2 < 0) { d.silk2 = 6; d.silk2Hex = h.silk2; }
    d.pat = Math.max(0, PATTERNS.indexOf(h.silkPat));
    return d;
  }
  const potOf = (d) => { const p = {}; for (const k of AKEYS) p[k] = Math.min(POT_CAP, d.attrs[k] + d.hr[k]); return p; };
  const startSpent = () => AKEYS.reduce((s, k) => s + (draft.attrs[k] - BASE), 0);
  const potSpent = () => AKEYS.reduce((s, k) => s + draft.hr[k], 0);
  function draftLook() {
    const coat = draft.customCoat || COATS[draft.coat];
    return Object.assign({ type: coat.type, coat: coat.hex, face: draft.face, socks: draft.socks.slice(), maneCol: draft.maneHex || HAIR[draft.mane].hex, tailCol: draft.tailHex || HAIR[draft.tail].hex }, draft.body);
  }
  function draftDef() {
    const look = draftLook();
    return { name: draft.name.trim() || "New Horse", role: detectStyle(draft.attrs).label, style: detectStyle(draft.attrs).code,
      coat: parseInt(look.coat.slice(1), 16), silk: draft.silkHex || SILK_PAL[draft.silk], silk2: draft.silk2Hex || SILK_PAL[draft.silk2], silkPat: PATTERNS[draft.pat],
      look, attrs: Object.assign({}, draft.attrs) };
  }
  function schedulePreview(now) {
    clearTimeout(prevT);
    const go = () => { if (typeof STABLE3D !== "undefined") STABLE3D.setBayHorse(draftDef(), { rider: draft.step === 2 || draft.step === 5 }); };
    if (now) go(); else prevT = setTimeout(go, 70);
  }
  function openCreate(editId) {
    style();
    if (!editId && C.horses.length >= slots()) { toast(C.horses.length >= 5 ? "All five boxes are full" : "Win more races to unlock another box", "warn", 2); return openStable(); }
    if (!editId && CORE.createFee(C) > C.cash) { toast("A custom horse costs " + money(CORE.createFee(C)) + " — you have " + money(C.cash), "warn", 2.6); createFromFarm = false; return fromFarm ? home() : openStable(); }
    draft = editId ? draftFromHorse(C.horses.find(h => h.id === editId)) : newDraft();
    stage("full", { shift: true });
    schedulePreview(true);
    drawCreate();
  }
  function drawCreate() {
    const el = screen("create"), edit = !!draft.editId, step = draft.step;
    const steps = edit ? STEP_NAMES.slice(0, 2) : STEP_NAMES;
    const head = `<div class="car-sub">${edit ? "Edit appearance — abilities are not changed" : "Step " + step + " of 5"}</div><h2>${edit ? esc(draft.name) : step === 5 ? "Review your horse" : "Create your thoroughbred"}</h2>
      <div class="car-steps">${steps.map((s, i) => `<button data-step="${i + 1}" class="${i + 1 === step ? "on" : i + 1 < step ? "done" : ""}">${i + 1}. ${s}</button>`).join("")}</div>`;
    let body = "";
    const chips = (arr, sel, key, fmt) => `<div class="car-row" data-g="${key}">${arr.map((o, i) => `<button class="car-chip${i === sel ? " sel" : ""}" data-i="${i}">${fmt(o, i)}</button>`).join("")}</div>`;
    const sws = (arr, sel, key) => `<div class="car-row" data-g="${key}">${arr.map((c, i) => `<button class="car-sw${i === sel ? " sel" : ""}" data-i="${i}" title="${esc(c.name || c)}" style="background:${c.hex || c}"></button>`).join("")}</div>`;
    if (step === 1) {
      body = `
        <div class="sd-sec"><div class="car-sub">Horse name — pick one (every name is recorded by the race caller)</div>
          <div class="car-row car-names">${nameChoices().map(n => `<button class="car-chip${n === draft.name ? " sel" : ""}" data-name="${esc(n)}"${takenName(n) ? " disabled title=\"Already in your stable\"" : ""}>${esc(n)}</button>`).join("")}</div></div>
        <div class="sd-sec"><div class="car-sub">Coat</div>${chips(COATS, draft.customCoat ? -1 : draft.coat, "coat", o => `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${o.hex};margin-right:6px;vertical-align:-1px;border:1px solid rgba(255,255,255,.3)"></span>${o.name}`)}</div>
        <div class="sd-sec"><div class="car-sub">Face marking</div>${chips(FACES, FACES.findIndex(f => f[0] === draft.face), "face", o => o[1])}</div>
        <div class="sd-sec"><div class="car-sub">White leg markings — choose each leg</div><div class="car-legs">${LEGS.map(([nm, li]) => `<div><div style="font-size:12px;margin-bottom:5px">${nm}</div><div class="car-row" data-leg="${li}">${SOCK_LV.map(([sn, sv]) => `<button class="car-chip${draft.socks[li] === sv ? " sel" : ""}" data-v="${sv}">${sn}</button>`).join("")}</div></div>`).join("")}</div></div>
        <div class="sd-sec"><div class="car-sub">Body</div>${BODY.map(([k, lab, mn, mx, st0, df, lo, hi]) => `<div class="car-slider"><span>${lab}</span><input type="range" min="${mn}" max="${mx}" step="${st0}" value="${draft.body[k]}" data-body="${k}"><span style="font-family:var(--font-d);text-align:right" id="bv_${k}">${bodyTxt(k)}</span><div class="hint"><span>${lo}</span><span>${hi}</span></div></div>`).join("")}</div>
        <div class="sd-sec"><div class="car-sub">Mane colour</div>${sws(HAIR, draft.maneHex ? -1 : draft.mane, "mane")}<div class="car-sub" style="margin-top:6px">Tail colour</div>${sws(HAIR, draft.tailHex ? -1 : draft.tail, "tail")}</div>`;
    } else if (step === 2) {
      body = `
        <div style="font-size:12.5px;color:var(--fg-dim)">Your jockey wears these silks in every race, and they appear on the race HUD and in replays.</div>
        <div class="sd-sec"><div class="car-sub">Primary colour</div>${sws(SILK_PAL, draft.silkHex ? -1 : draft.silk, "silk")}</div>
        <div class="sd-sec"><div class="car-sub">Secondary colour</div>${sws(SILK_PAL, draft.silk2Hex ? -1 : draft.silk2, "silk2")}</div>
        <div class="sd-sec"><div class="car-sub">Pattern</div>${chips(PATTERNS, draft.pat, "pat", o => o[0].toUpperCase() + o.slice(1))}</div>`;
    } else if (step === 3) {
      body = `
        <div class="car-pool"><span>Development points left</span><b id="cPool">${START_POOL - startSpent()}</b></div>
        <div style="font-size:12px;color:var(--fg-dim)">Every attribute starts at ${BASE}. Spend ${START_POOL} points (up to ${START_CAP} in any one): a fully spent horse rates about ${Math.round(BASE + START_POOL / 8)} — ready to compete in maiden and provincial races.</div>
        <div class="car-row" style="gap:6px">${[["Sprinter", "sprint"], ["Miler", "mile"], ["Stayer", "stay"], ["Balanced", "bal"]].map(([n, t]) => `<button class="car-chip" data-tpl="${t}">${n}</button>`).join("")}<button class="car-chip" data-tpl="reset">Reset</button></div>
        ${ATTRS.map(([k, lab]) => `<div class="car-attr"><div class="nm">${lab}</div><div class="vals" id="av_${k}">${draft.attrs[k]}</div>
          <input type="range" min="${BASE}" max="${START_CAP}" value="${draft.attrs[k]}" data-at="${k}"><div class="desc">${EFFECT[k][0]}</div></div>`).join("")}
        <div class="sd-sec"><div class="car-sub">Projected now</div><div class="car-prof" id="cProf"></div></div>`;
    } else if (step === 4) {
      body = `
        <div class="car-pool"><span>Potential points left</span><b id="cPool">${POT_POOL - potSpent()}</b></div>
        <div style="font-size:12px;color:var(--fg-dim)">Potential is the ceiling each attribute can be trained to — it never falls below current ability and can reach ${POT_CAP}. You have ${POT_POOL} points of growth: specialise, because no horse can be elite at everything.</div>
        <div class="car-row" style="gap:6px"><button class="car-chip" data-ptpl="match">Follow my build</button><button class="car-chip" data-ptpl="even">Spread evenly</button><button class="car-chip" data-ptpl="clear">Clear</button></div>
        ${ATTRS.map(([k, lab]) => { const p = potOf(draft)[k]; return `<div class="car-attr"><div class="nm">${lab}</div><div class="vals"><span style="color:var(--fg-dim);font-size:12px">${draft.attrs[k]} →</span> <span id="pv_${k}">${p}</span></div>
          <div class="car-bar"><u id="pu_${k}" style="width:${p}%"></u><i style="width:${draft.attrs[k]}%"></i></div>
          <input type="range" min="${draft.attrs[k]}" max="${POT_CAP}" value="${p}" data-pt="${k}"></div>`; }).join("")}
        <div class="sd-sec"><div class="car-sub">Projected at full potential</div><div class="car-prof" id="cProf"></div></div>`;
    } else {
      const d = draftDef(), p = potOf(draft), st = detectStyle(d.attrs), pst = detectStyle(p);
      body = `
        <div class="car-stat"><div><b>${Math.round(avgA(d.attrs))}</b><span>Rating now</span></div><div><b>${Math.round(avgA(p))}</b><span>Potential</span></div><div><b>${st.label}</b><span>Style</span></div></div>
        <div style="font-size:13px">${esc(d.name)} is a <b>${COATS[draft.coat] ? COATS[draft.coat].name.toLowerCase() : "custom"}</b>${draft.face !== "none" ? " with a " + FACES.find(f => f[0] === draft.face)[1].toLowerCase() : ""}, racing in ${PATTERNS[draft.pat]} silks.
          Best now at <b>${bestDistances(d.attrs).text}</b>; developing into a <b>${pst.label.toLowerCase()}</b> best at <b>${bestDistances(p).text}</b>.</div>
        <div class="car-prof">${profileLines(p).map(t => `<span>${esc(t)}</span>`).join("")}</div>
        <div class="sd-sec"><div class="car-sub">Attributes now → potential</div>${ATTRS.map(([k, lab]) => `<div class="car-attr"><div class="nm">${lab}</div><div class="vals">${d.attrs[k]} <span style="color:var(--fg-dim);font-size:12px">→ ${p[k]}</span></div><div class="car-bar"><u style="width:${p[k]}%"></u><i style="width:${d.attrs[k]}%"></i></div></div>`).join("")}</div>
        ${CORE.createFee(C) ? `<div class="car-panel">A custom horse costs <b>${money(CORE.createFee(C))}</b> (the fee grows with every horse in the stable). You have ${money(C.cash)}. Horses at the market cost less than a fully-tailored one.</div>` : ""}
        ${START_POOL - startSpent() > 0 ? `<div class="car-panel car-warn">You still have ${START_POOL - startSpent()} development points unspent (step 3).</div>` : ""}
        ${POT_POOL - potSpent() > 0 ? `<div class="car-panel car-warn">You still have ${POT_POOL - potSpent()} potential points unassigned (step 4).</div>` : ""}`;
    }
    const last = edit ? 2 : 5;
    const foot = `<button class="btn" id="cBack">${step === 1 ? "Cancel" : "◀ Back"}</button>${step < last ? `<button class="btn primary" id="cNext">Next: ${steps[step]} ▶</button>` : `<button class="btn primary" id="cDone">${edit ? "Save appearance" : CORE.createFee(C) ? "Confirm & pay " + money(CORE.createFee(C)) : "Confirm & add to stable"}</button>`}`;
    sidePage(el, { hint: `<b>${esc(draft.name || "New horse")}</b>${step === 2 ? "Your jockey shows off the silks" : "Drag to walk round your horse · scroll to zoom"}`, cam: camBar(step === 2 ? `<button data-cam="silks">Silks</button>` : ""), head, body, foot });
    const scrollY = drawCreate.keepScroll || 0; drawCreate.keepScroll = 0; el.querySelector(".sd-body").scrollTop = scrollY;
    const redraw = () => { drawCreate.keepScroll = el.querySelector(".sd-body").scrollTop; drawCreate(); };
    // step navigation (going back never loses anything)
    el.querySelectorAll("[data-step]").forEach(b => b.onclick = () => { draft.step = +b.getAttribute("data-step"); afterStep(); });
    const afterStep = () => { if (draft.step === 2) STABLE3D.preset("silks"); else if (draft.step === 1) STABLE3D.preset("full"); STABLE3D.setRider(draft.step === 2 || draft.step === 5); drawCreate(); };
    el.querySelector("#cBack").onclick = () => { if (draft.step === 1) { const id = draft.editId; draft = null; return id ? openProfile(C.horses.findIndex(h => h.id === id)) : createFromFarm ? (createFromFarm = false, hidePanel(), SCENES.enter("farm")) : (C.horses.length ? openStable() : firstRun ? (firstRun = false, show("menu")) : openHub()); } draft.step--; afterStep(); };
    const nx = el.querySelector("#cNext"); if (nx) nx.onclick = () => { if (draft.step === 1 && !cleanName(draft.name, "")) { toast("Give your horse a name first", "warn", 1.4); return; } draft.step++; afterStep(); };
    const dn = el.querySelector("#cDone"); if (dn) dn.onclick = () => edit ? saveAppearance() : confirmCreate();
    // inputs
    el.querySelectorAll("[data-name]").forEach(b => b.onclick = () => { if (b.disabled) return; draft.name = b.dataset.name; draft.say = ""; el.querySelectorAll("[data-name]").forEach(x => x.classList.toggle("sel", x === b)); const hb = el.querySelector(".car-hint b"); if (hb) hb.textContent = draft.name; });
    el.querySelectorAll("[data-g]").forEach(g => {
      const key = g.getAttribute("data-g");
      g.querySelectorAll("button").forEach(b => b.onclick = () => {
        const i = +b.getAttribute("data-i");
        if (key === "face") draft.face = FACES[i][0];
        else if (key === "coat") { draft.coat = i; draft.customCoat = null; }
        else { draft[key] = i; if (key === "mane") draft.maneHex = null; if (key === "tail") draft.tailHex = null; if (key === "silk") draft.silkHex = null; if (key === "silk2") draft.silk2Hex = null; }
        schedulePreview(true); redraw();
      });
    });
    el.querySelectorAll("[data-leg]").forEach(g => g.querySelectorAll("button").forEach(b => b.onclick = () => { draft.socks[+g.getAttribute("data-leg")] = +b.getAttribute("data-v"); schedulePreview(true); STABLE3D.preset("legs"); redraw(); }));
    el.querySelectorAll("[data-body]").forEach(r => r.oninput = () => { const k = r.getAttribute("data-body"); draft.body[k] = +r.value; el.querySelector("#bv_" + k).textContent = bodyTxt(k); schedulePreview(); });
    // starting ability
    const prof = (a) => { const pe = el.querySelector("#cProf"); if (pe) pe.innerHTML = profileLines(a).map(t => `<span>${esc(t)}</span>`).join(""); };
    if (step === 3) {
      prof(draft.attrs);
      el.querySelectorAll("[data-at]").forEach(r => r.oninput = () => {
        const k = r.getAttribute("data-at"), room = START_POOL - (startSpent() - (draft.attrs[k] - BASE));
        const v = Math.max(BASE, Math.min(+r.value, BASE + room, START_CAP)); draft.attrs[k] = v; r.value = v;
        el.querySelector("#av_" + k).textContent = v; el.querySelector("#cPool").textContent = START_POOL - startSpent(); prof(draft.attrs); clampPotential();
      });
      el.querySelectorAll("[data-tpl]").forEach(b => b.onclick = () => { applyTemplate(b.getAttribute("data-tpl")); redraw(); });
    }
    if (step === 4) {
      prof(potOf(draft));
      el.querySelectorAll("[data-pt]").forEach(r => r.oninput = () => {
        const k = r.getAttribute("data-pt"), room = POT_POOL - (potSpent() - draft.hr[k]);
        const want = Math.max(0, Math.min(+r.value - draft.attrs[k], room, POT_CAP - draft.attrs[k])); draft.hr[k] = want; r.value = draft.attrs[k] + want;
        el.querySelector("#pv_" + k).textContent = draft.attrs[k] + want; el.querySelector("#pu_" + k).style.width = (draft.attrs[k] + want) + "%";
        el.querySelector("#cPool").textContent = POT_POOL - potSpent(); prof(potOf(draft));
      });
      el.querySelectorAll("[data-ptpl]").forEach(b => b.onclick = () => { potTemplate(b.getAttribute("data-ptpl")); redraw(); });
    }
    show("c_create");
  }
  function bodyTxt(k) { const v = draft.body[k], b = BODY.find(x => x[0] === k); const t = (v - b[2]) / (b[3] - b[2]); return Math.round(t * 100) + "%"; }
  // potential headroom is kept when ability changes; it is trimmed only where it would pass the cap
  function clampPotential() { for (const k of AKEYS) draft.hr[k] = Math.max(0, Math.min(draft.hr[k], POT_CAP - draft.attrs[k])); }
  const TPL = { sprint: { top: 22, acc: 26, spr: 22, sta: 24, agi: 12, tem: 10, end: 10, rec: 10 }, mile: { top: 20, acc: 16, spr: 18, end: 18, rec: 14, tem: 16, agi: 18, sta: 16 },
    stay: { end: 30, rec: 26, top: 18, tem: 22, spr: 10, acc: 8, agi: 10, sta: 12 }, bal: Object.fromEntries(AKEYS.map(k => [k, 17])) };
  function applyTemplate(t) {
    if (t === "reset") { for (const k of AKEYS) draft.attrs[k] = BASE; clampPotential(); return; }
    const w = TPL[t], sum = AKEYS.reduce((s, k) => s + w[k], 0);
    let left = START_POOL; for (const k of AKEYS) { const v = Math.min(START_CAP - BASE, Math.floor(START_POOL * w[k] / sum)); draft.attrs[k] = BASE + v; left -= v; }
    for (const k of AKEYS.slice().sort((a, b) => w[b] - w[a])) { if (left <= 0) break; const add = Math.min(left, START_CAP - draft.attrs[k]); draft.attrs[k] += add; left -= add; }
    clampPotential();
  }
  function potTemplate(t) {
    if (t === "clear") { for (const k of AKEYS) draft.hr[k] = 0; return; }
    const w = {}; for (const k of AKEYS) w[k] = t === "even" ? 1 : Math.max(1, draft.attrs[k] - BASE + 4);
    const sum = AKEYS.reduce((s, k) => s + w[k], 0); let left = POT_POOL;
    for (const k of AKEYS) { draft.hr[k] = Math.min(POT_CAP - draft.attrs[k], Math.floor(POT_POOL * w[k] / sum)); left -= draft.hr[k]; }
    for (let guard = 0; left > 0 && guard < 400; guard++) { const k = AKEYS.filter(x => draft.attrs[x] + draft.hr[x] < POT_CAP).sort((a, b) => w[b] - w[a])[guard % 3] || AKEYS.find(x => draft.attrs[x] + draft.hr[x] < POT_CAP); if (!k) break; draft.hr[k]++; left--; }
  }
  function confirmCreate() {
    const name = cleanName(draft.name, "");
    if (!name) { toast("Give your horse a name first", "warn", 1.4); draft.step = 1; return drawCreate(); }
    if (C.horses.some(h => h.name.toLowerCase() === name.toLowerCase())) { toast("You already have a horse called " + esc(name), "warn", 1.8); draft.step = 1; return drawCreate(); }
    if (C.horses.length >= slots()) { toast("No free box — win more races to unlock one", "warn", 2); return; }
    if (startSpent() < START_POOL) { toast("Spend all your development points first (step 3)", "warn", 2); draft.step = 3; return drawCreate(); }
    if (potSpent() < POT_POOL) { toast("Assign all your potential points first (step 4)", "warn", 2); draft.step = 4; return drawCreate(); }
    const d = draftDef();
    const h = sanHorse({ name, say: draft.say, look: d.look, silk: d.silk, silk2: d.silk2, silkPat: d.silkPat, attrs: Object.assign({}, draft.attrs), pot: potOf(draft), potSet: true, born: S().n,
      xp: 0, trainPts: 0, lvl: 1, races: 0, wins: 0, places: 0, podiums: 0, history: [] });
    CORE.fillHorse(h, C, { how: "created", age: 3, fitness: 100 });
    const fee = CORE.createFee(C);
    if (fee) { if (fee > C.cash) { toast("A custom horse costs " + money(fee) + " — you have " + money(C.cash), "warn", 2.6); return; } const pr = CORE.apply(C, "create:" + h.id, -fee, "horse", "Custom horse: " + h.name); if (!pr.ok) { toast("The fee could not be paid", "warn", 2); return; } }
    C.horses.push(h); C.active = C.horses.length - 1; save(); draft = null;
    toast(esc(h.name) + " moves into box " + C.horses.length + (fee ? " (−" + money(fee) + ")" : "") + "!", "good", 2);
    if (firstRun || createFromFarm) { firstRun = false; createFromFarm = false; hidePanel(); SCENES.enter("farm"); return; }       // your first horse, or one made from an empty box on the farm: straight back out to the property
    openProfile(C.active);
  }
  function saveAppearance() {
    const h = C.horses.find(x => x.id === draft.editId); if (!h) return openStable();
    const d = draftDef(), name = cleanName(draft.name, h.name);
    if (name.toLowerCase() !== h.name.toLowerCase() && C.horses.some(x => x !== h && x.name.toLowerCase() === name.toLowerCase())) { toast("Another horse already has that name", "warn", 1.8); return; }
    // cosmetic only: look, silks and name — attributes, potential and records are untouched
    const fixed = sanHorse(Object.assign({}, h, { name, say: draft.say, look: d.look, silk: d.silk, silk2: d.silk2, silkPat: d.silkPat }));
    h.name = fixed.name; h.say = fixed.say; h.look = fixed.look; h.silk = fixed.silk; h.silk2 = fixed.silk2; h.silkPat = fixed.silkPat;
    save(); draft = null; toast("Appearance saved", "good", 1.4); openProfile(C.horses.indexOf(h));
  }

  // ---------- running a career race ----------
  // Official and optional races both build their race config here. Competitive conditions are fixed:
  // chaos off (no kick, no chaos AI), no stamina assist, no experimental options — whatever Quick Race was set to.
  let pending = null;
  function competitiveCfg(meta, h, oppDefs, goingKey, extra) {
    return Object.assign({
      distance: meta.dist, field: meta.field, diff: "hard", playerDef: toDef(h), oppDefs,   // every career rider is a Hard jockey
      going: goingKey || "good", incidents: settings.incidents, chaos: false, assist: false, unlimited: false, topSpeed: null,
      track: /randwick/i.test(meta.venue || "") ? "randwick" : /flemington/i.test(meta.venue || "") ? "flemington" : ((SEASON.venueStyle(meta.venue) || {}).layout || "generic"),   // the two modelled venues race on their real courses; other venues use the generic course
      champ: false, fixedOpponents: null,
    }, extra);
  }
  // the time of day and weather the calendar stored for the meeting you are running (the booked one if it is this race, else the round's date / the race's next meeting)
  function atmoOf(meta, kind, idx) {
    try { let e = null; if (C.booking && C.booking.ref === meta.id) e = ((C.cal && C.cal.events) || []).find(x => x.id === C.booking.eid);
      if (!e) e = kind === "off" ? CORE.roundEvent(C, idx) : CORE.nextMeeting(C, meta.id); return e ? { tod: e.tod, wx: e.forecast && e.forecast.weather } : {}; } catch (er) { return {}; }
  }
  function launch(cfg) {
    try { audio.ensure(); } catch (e) {}
    try { if (typeof COMM !== "undefined") COMM.prime(); } catch (e) {}
    startRace(cfg);
  }
  function enterOfficial(idx, hi) {
    const s = S(), h = C.horses[hi], meta = SEASON.roundDef(s, idx);
    if (!h || idx !== s.cur || SEASON.done(s) || s.rounds[idx].st !== "open") { openHub(); return false; }
    if (!SEASON.eligibility(h, meta).ok) { toast(h.name + " isn't qualified for the " + meta.name, "warn", 2); return false; }
    if (racedToday(h)) { toast(h.name + " has already raced today — give him a day", "warn", 2.6); return false; }
    const fee = payEntryFee(`entry:s${s.n}:${meta.id}:${h.id}`, meta, h); if (!fee.ok) return false;
    const at = atmoOf(meta, "off", idx);
    C.active = hi; CORE.enterRound(C, idx); save();           // the date becomes the round's scheduled day (the weekly bills fall due on the way)
    pending = { kind: "off", season: s.n, round: idx, hid: h.id, fee: fee.fee };
    const opp = raceDayField(SEASON.runners(C, idx), meta, h, idx === s.rounds.length - 1);
    launch(competitiveCfg(meta, h, opp, s.rounds[idx].going, {
      career: { id: meta.id, name: meta.name, venue: meta.venue, venueStyle: SEASON.venueStyle(meta.venue), tod: at.tod, wx: at.wx, grade: meta.grade, major: !!meta.major, crown: !!meta.crown, official: true, round: idx + 1, rounds: s.rounds.length, tier: meta.tier, rivalry: rivalryFor(h, opp) },
    }));
    return true;
  }
  // the entry fee (Phase 7): charged once per race instance + horse through the ledger; refused (with the way out explained) if the stable can't pay
  function payEntryFee(key, meta, h) {
    const r = CORE.payEntry(C, key, meta, h.name); if (r.ok) { if (r.fee && !r.already) save(); return r; }
    const off = CORE.clubOffer(C);
    toast(`Not enough cash for the ${money(r.fee)} entry fee (you have ${money(C.cash)}). ${off.ok ? "The stable club can advance " + money(off.amount) + " from the Office." : "Choose a cheaper race or wait for prize money."}`, "warn", 4.5);
    return { ok: false, fee: r.fee };
  }
  // a horse runs once a day; and a race with prize money is only run on one of its dated meetings (an open race entered from the hub moves the calendar to the next meeting, like booking it)
  const racedToday = h => h.lastRaceDay != null && (h.lastRaceDay | 0) === (C.day | 0);
  function enterOptional(id, hi, booked) {
    const meta = BY_ID[id], h = C.horses[hi]; if (!meta || !h) { openOptional(); return false; }
    if (!SEASON.eligibility(h, meta).ok) { toast(h.name + " isn't qualified for the " + meta.name, "warn", 2); return false; }
    if (racedToday(h)) { toast(h.name + " has already raced today — give him a day", "warn", 2.6); return false; }
    let snap = null;
    if (!booked && CORE.purseOf(meta) > 0) {
      const m = CORE.nextMeeting(C, id), nr = CORE.nextOpenRoundDay(C);
      if (!m || (nr != null && m.day >= nr)) { toast("The next meeting of the " + meta.name + " is after your next championship round — run or skip that round first", "warn", 3.4); return false; }
      if (m.day > C.day) { snap = JSON.stringify(C); CORE.advance(C, m.day - C.day, { cap: true, force: true }); }
    }
    const fee = payEntryFee(`entry:o${C.optN | 0}:${meta.id}:${h.id}`, meta, h); if (!fee.ok) { if (snap) restoreCareer(snap); return false; }
    const at = atmoOf(meta, "opt");
    C.active = hi; save();
    // the field: persistent rivals of the right grade for this race (the same field the form guide showed)
    const opp = raceDayField(SEASON.optionalField(C, id), meta, h, false);
    pending = { kind: "opt", id, hid: h.id, optN: C.optN | 0, fee: fee.fee };
    launch(competitiveCfg(meta, h, opp, "good", { career: { id: meta.id, name: meta.name, venue: meta.venue, venueStyle: SEASON.venueStyle(meta.venue), tod: at.tod, wx: at.wx, grade: meta.grade, major: false, crown: false, official: false, tier: meta.tier, rivalry: rivalryFor(h, opp) } }));
    return true;
  }
  // the race-day field: rivals primed to the player's horse (season.js raceField) — the same field the form guide shows
  function raceDayField(defs, meta, h, isFinal) { try { return SEASON.raceField(defs, meta, h, isFinal); } catch (e) { return defs; } }
  // real head-to-head history the commentator may mention (only pairs that have actually met before)
  function rivalryFor(h, opp) {
    const out = {};
    for (const d of opp) { const r = SEASON.h2hFor(C, h.id, d._hid); if (r && r.n >= 2) out[d.name] = { n: r.n, ahead: r.ahead, behind: r.behind }; }
    return out;
  }
  // experience for a run: race tier × field strength × finishing place, reduced when the field is far weaker than the horse
  function xpFor(meta, r, h, place, dnf) {
    const opps = r.horses.filter(x => !x.isPlayer);
    const oppAvg = opps.reduce((s, x) => s + AKEYS.reduce((t, k) => t + (x.def.attrs[k] || 0), 0) / 8, 0) / Math.max(1, opps.length);
    return SEASON.xpFor({ tier: meta.tier, oppAvg, rating: rating(h), place, field: r.horses.length, dnf, optional: !!meta.optional });
  }
  // the race's official finishing order as championship result entries (fallers last, as DNF)
  function resOf(r, h, withTimes) {
    const res = [];
    r.finishOrder.forEach((x, i) => res.push(Object.assign({ sid: x.isPlayer ? "player" : x.def._sid, hid: x.isPlayer ? h.id : x.def._hid, name: x.def.name, place: i + 1 }, withTimes ? { t: x.finishTime } : {})));
    r.dnfs.forEach(x => { if (!res.some(e => e.name === x.def.name)) res.push({ sid: x.isPlayer ? "player" : x.def._sid, hid: x.isPlayer ? h.id : x.def._hid, name: x.def.name, place: 0 }); });
    return res;
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
      summary = SEASON.commitRound(C, P.round, resOf(r, h), h.id);
      if (!summary) return;
    } else {
      if ((C.optN | 0) !== P.optN) return;                          // already recorded
      SEASON.recordResult(C, meta, resOf(r, h).filter(e => e.sid !== "player"), S().n);   // the rivals' runs count for them too
      C.optN = (C.optN | 0) + 1;                                   // a fresh field next time
    }
    SEASON.recordH2H(C, h, meta, resOf(r, h, true).map(e => ({ hid: e.hid, place: e.place, t: e.t, player: e.sid === "player" })), S().n);
    // 2. the horse's own record + experience
    const xp = xpFor(meta, r, h, place || field, dnf);
    h.xp += xp; h.races++; h.xpFrac += xp / XP_PER_PT * CORE.DEV.RACE_XP_SCALE;       // racing experience builds the horse more slowly now: training and age do the rest (Phase 9)
    const tp = Math.floor(h.xpFrac); h.xpFrac -= tp; h.trainPts += tp;
    let lv = 0; while (h.xp >= xpForLevel(h.lvl)) { h.xp -= xpForLevel(h.lvl); h.lvl++; lv++; }
    if (!dnf) { if (place === 1) h.wins++; if (place <= 3) h.podiums++; if (place <= 4) h.places++; }
    if (P.kind === "off") { h.offRaces++; if (place === 1) h.offWins++; h.champPts += summary.pts; }
    // prize money (places 1–5): credited once through the ledger. The key names this race instance + horse, so a replayed
    // result, a reload or a second call can never pay it twice. The horse's own prize record only grows by what was credited.
    let prize = 0, repaid = 0;
    if (!dnf && place >= 1 && place <= 5) {
      const pr = CORE.awardPrize(C, P.kind === "off" ? `prize:s${P.season}:${meta.id}:${h.id}` : `prize:o${P.optN}:${meta.id}:${h.id}`, meta, place, h.name);
      if (pr.ok) { prize = pr.amount; h.prize += prize; const rp = CORE.repayFromPrize(C, P.kind === "off" ? `prize:s${P.season}:${meta.id}:${h.id}` : `prize:o${P.optN}:${meta.id}:${h.id}`, prize); repaid = rp.paid || 0; }
    }
    h.history.push({ raceId: meta.id, name: meta.name, place: dnf ? 0 : place, field, dnf, t: Date.now(), dist: meta.dist, tier: meta.tier || 0, off: P.kind === "off", season: P.kind === "off" ? P.season : null, day: C.day, prize });
    if (h.history.length > 40) h.history.shift();
    // 3. trophies + career wins (official feature wins only; optional races never award trophies)
    let trophy = false;
    if (!dnf && place === 1) {
      if (P.kind === "off" || (meta.tier || 0) >= 2) C.wins++;
      if (P.kind === "off" && meta.major && !C.trophies.some(t => t.raceId === meta.id && t.season === P.season)) { C.trophies.push({ raceId: meta.id, race: meta.name, horse: h.name, season: P.season, t: Date.now() }); trophy = true; h.majors++; }
    }
    const repGain = dnf ? 0 : CORE.addRep(C, place, meta, P.kind === "off"), bonus = !dnf && place >= 1 ? CORE.milestones(C, place, meta) : [];
    let goalPaid = []; try { goalPaid = CORE.claimGoals(C); } catch (e) { console.error(e); }                  // Phase 23: season goals pay once each
    CORE.afterRace(C, h, meta, { going: r.cfg.going, dnf });         // post-race fitness + the date of the run (no effect on racing yet)
    if (P.kind === "opt") CORE.afterOptional(C);                      // an optional race takes a day (never past the next open round)
    save();
    // feedback on the results screen
    renderPanel({ P, meta, h, place, dnf, xp, tp, lv, summary, trophy, prize, repaid, bonus, repGain, goalPaid, fee: P.fee || 0 });
    if (trophy) setTimeout(() => showMsg((meta.crown ? "★ " : "") + "YOU'VE WON THE " + meta.name.toUpperCase() + "!", 2.6), 900);
  }
  function renderPanel(o) {
    let el = document.getElementById("resCareerPanel");
    if (!el) { el = document.createElement("div"); el.id = "resCareerPanel"; el.className = "panel"; const row = document.getElementById("resAgain").parentElement; row.parentElement.insertBefore(el, row); }
    el.hidden = false;
    const gain = `XP +${o.xp} · Training +${o.tp}${o.lv ? " · Level " + o.h.lvl : ""}${o.fee ? ` · Entry −${money(o.fee)}` : ""}${o.prize ? ` · Prize +${money(o.prize)}${o.repaid ? ` (−${money(o.repaid)} repaid to the club)` : ""}` : ""}${(o.bonus || []).map(b => ` · ★ ${b.label} +${money(b.amount)}`).join("")} · Cash ${money(C.cash)}`;
    if (o.P.kind === "opt") { el.innerHTML = `<div class="cp-sub">${esc(o.meta.name)} · optional race</div><div class="cp-pts">${gain}</div><div class="cp-sub">No championship points — the season is unchanged.</div>${(o.goalPaid || []).map(g => `<div class="cp-sub" style="color:var(--good)">🎯 Season goal: ${esc(g.label)} · +${money(g.reward)}</div>`).join("")}`; return; }
    const s = o.summary, list = SEASON.standings(C), lead = list[0];
    const behind = s.behind ? `${s.behind} POINT${s.behind === 1 ? "" : "S"} BEHIND ${esc(lead.name).toUpperCase()}` : (list[1] ? `LEADING BY ${lead.pts - list[1].pts} POINT${lead.pts - list[1].pts === 1 ? "" : "S"}` : "LEADING");
    const seasonOver = !s.next;
    el.innerHTML = `<div class="cp-sub">Round ${s.round + 1} · ${esc(o.meta.name)} · ${esc(o.h.name)} ${o.dnf ? "did not finish" : "finished " + ordinal(o.place)}</div>
      <div class="cp-pos">CHAMPIONSHIP POSITION: ${ordinal(s.before).toUpperCase()} → ${ordinal(s.after).toUpperCase()}</div>
      <div class="cp-pts">+${s.pts} POINT${s.pts === 1 ? "" : "S"} · ${s.total} TOTAL · ${behind}</div>
      <div class="cp-sub">${seasonOver ? "That was the final round — the season is complete. Continue to see the final standings." : `Next: ${esc(s.next.name)} · ${esc(s.next.venue)} · ${fmtDist(s.next.dist)}`}</div>
      <div class="cp-sub">${gain}${o.trophy ? " · 🏆 Trophy won" : ""}</div>${(o.goalPaid || []).map(g => `<div class="cp-sub" style="color:var(--good)">🎯 Season goal: ${esc(g.label)} · +${money(g.reward)}</div>`).join("")}`;
  }
  function hidePanel() { const el = document.getElementById("resCareerPanel"); if (el) el.hidden = true; }


  // ---------- 3D backdrop for the championship screens ----------
  function previewHorse() { try { if (race) return; stage("stalls"); } catch (e) {} }

  // ---------- the farm scene (farm.js): what it shows, and the way out to a race ----------
  function farmStalls() {
    if (!C) load();
    const act = activeHorse(), s = S(), ev = !SEASON.done(s) ? CORE.roundEvent(C, s.cur) : null, nxt = ev ? SEASON.roundDef(s, s.cur).name + " · " + CORE.fmtDate(ev.day, { short: true }) : "Season complete";
    const L = C.horses.slice(0, 5).map(h => {
      const cond = h.fitness >= 85 ? "Fit" : h.fitness >= 70 ? "Fresh" : h.fitness >= 50 ? "Tired" : "Needs a spell";
      const form = (h.history || []).slice(-5).map(e => e.dnf || !e.place ? "F" : e.place).join("-");
      return { def: toDef(h), name: h.name, sub: rating(h) + " · age " + h.age, line2: `${h.age}yo · ${cond} · Rtg ${rating(h)}`, line3: form ? "Form " + form : "Unraced", line4: h === act ? "Next: " + nxt : "" };
    });
    L.slots = slots(); return L;
  }
  // ---------- the farm as the home screen (Phase 5): the way in, the calendar board, booking, the way back ----------
  let firstRun = false, fromFarm = false, createFromFarm = false;
  // back out of a screen opened from inside the farmhouse (the ledger, the trophy cabinet): to the property, not the hub
  function home() { if (fromFarm && typeof SCENES !== "undefined") { fromFarm = false; hidePanel(); SCENES.enter("farm"); } else openHub(); }
  // the ledger (the Office screen) and the trophy cabinet, opened from the farmhouse; their Back button returns to the property
  function enterOffice() { if (!C) load(); race = null; hidePanel(); fromFarm = true; openOffice(); }
  function openScreen(name) {
    if (!C) load(); race = null; hidePanel(); fromFarm = true;
    if (name === "trophies") openTrophies(); else if (name === "office") openOffice(); else { fromFarm = false; openHub(); }
  }
  // Career Mode from the main menu: straight onto the property. A brand-new career makes its first horse first.
  function begin() {
    load(); race = null; hidePanel(); fromFarm = false;
    if (!C.horses.length) { firstRun = true; return openCreate(); }
    SCENES.enter("farm");
  }
  // E at an empty box on the farm opens the horse creator (the same 5-step creator as before); Back or Create returns you to the property
  function createForFarm() {
    if (!C) load(); if (C.horses.length >= slots()) { toast("Win more races to unlock another box", "info", 2.4); return false; }
    race = null; hidePanel(); fromFarm = true; openMarket("buy", "farm"); return true;
  }
  // the board's month (and the booking screen's): races on the calendar, today, what is booked
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MS_DAY = 86400000;
  function metaOf(e) { return e.kind === "round" ? SEASON.roundDef(S(), e.round) : BY_ID[e.ref]; }
  function eventInfo(e) {
    const s = S(), meta = metaOf(e); if (!meta) return null;
    const nr = CORE.nextOpenRoundDay(C);
    let open = false, why = "";
    if (e.day < C.day) why = "Already run";
    else if (e.kind === "round") { const st = s.rounds[e.round] && s.rounds[e.round].st; open = !SEASON.done(s) && e.round === s.cur && st === "open"; why = open ? "" : st === "done" ? "Completed" : st === "skip" ? "Skipped" : "Opens after the previous round"; }
    else { open = nr == null || e.day < nr; why = open ? "" : "Held after the next championship round"; }
    return { eid: e.id, kind: e.kind === "round" ? "round" : "optional", ref: e.ref, round: e.round, name: meta.name, venue: meta.venue, dist: meta.dist, grade: meta.grade, prize: CORE.purseLabel(meta) === "—" ? "" : CORE.purseLabel(meta), fee: CORE.entryFee(meta), crown: !!meta.crown, major: !!meta.major,
      day: e.day, date: CORE.fmtDate(e.day), dateShort: CORE.fmtDate(e.day, { short: true }), tod: CORE.TOD_LABEL[e.tod] || "", weather: (CORE.WX_LABEL[e.forecast && e.forecast.weather] || ""), going: e.forecast ? e.forecast.going : "good", open, why, meta };
  }
  function calendarData(off) {
    if (!C) load(); CORE.syncCalendar(C);
    const t0 = CORE.dateOf(0).getTime(), now = CORE.parts(C.day), base = now.y * 12 + now.m + (off | 0), y = Math.floor(base / 12), m = ((base % 12) + 12) % 12;
    const first = Math.round((Date.UTC(y, m, 1) - t0) / MS_DAY), dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), dow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const cells = {}, list = [], bk = C.booking || null;
    for (const e of (C.cal && C.cal.events) || []) {
      const info = eventInfo(e); if (!info) continue;
      if (e.day >= first && e.day < first + dim) cells[e.day - first + 1] = { kind: info.kind, eid: info.eid, name: info.name, open: info.open };
      if (e.day >= C.day && list.length < 14 && (info.kind === "round" ? !(S().rounds[e.round] && S().rounds[e.round].st !== "open") : true)) list.push(info);
    }
    list.sort((a, b) => a.day - b.day);
    const todayIn = C.day >= first && C.day < first + dim ? C.day - first + 1 : 0;
    return { monthLabel: MONTH_NAMES[m] + " " + y, firstDow: dow, daysInMonth: dim, first, today: todayIn, todayLabel: CORE.fmtDate(C.day), cells, list, booked: bk && bk.day >= first && bk.day < first + dim ? bk.day - first + 1 : 0, booking: bk ? Object.assign({}, bk) : null, off: off | 0 };
  }
  // the board on the farmhouse wall: this month, the next race, and what is booked
  function boardInfo() {
    if (!C) load(); const cd = calendarData(0), nx = cd.list.find(x => x.open) || cd.list[0] || null, races = {};
    for (const d in cd.cells) races[d] = cd.cells[d].kind;
    const bk = C.booking, h = bk && C.horses.find(x => x.id === bk.hid);
    return { monthLabel: cd.monthLabel, firstDow: cd.firstDow, daysInMonth: cd.daysInMonth, today: cd.today, races, booked: cd.booked,
      next: nx ? { name: nx.name, date: nx.date, venue: nx.venue, dist: fmtDist(nx.dist), grade: nx.grade, prize: nx.prize || "Prize money", cond: [nx.tod, nx.weather, going(nx.going) + " going"].filter(Boolean).join(" · ") } : null,
      bookedText: bk && h ? bk.name + "\n" + h.name + " · " + CORE.fmtDate(bk.day, { short: true }) + "\nTake " + h.name + " to the float." : "" };
  }
  // which of the stable's horses can run in an event (with the reasons), for the booking screen
  function horsesFor(eid) {
    if (!C) load(); const e = ((C.cal && C.cal.events) || []).find(x => x.id === eid), info = e && eventInfo(e); if (!info) return [];
    return C.horses.map((h, i) => { const el = SEASON.eligibility(h, info.meta), st = detectStyle(h.attrs); return { i, id: h.id, name: h.name, rating: rating(h), style: st.label, pref: st.dist, fit: h.fitness, form: (h.history || []).slice(-5).map(x => x.dnf || !x.place ? "F" : x.place).join("-"), ok: el.ok, reqs: el.reqs.map(r => ({ ok: r.ok, label: r.label, detail: r.detail })) }; });
  }
  function book(eid, hid) {
    if (!C) load(); const e = ((C.cal && C.cal.events) || []).find(x => x.id === eid), info = e && eventInfo(e), h = C.horses.find(x => x.id === hid);
    if (!info || !h) return { ok: false, error: "That race or horse isn't available." };
    if (!info.open) return { ok: false, error: info.why || "That race can't be booked yet." };
    if (!SEASON.eligibility(h, info.meta).ok) return { ok: false, error: h.name + " isn't qualified for the " + info.name + "." };
    const fee = CORE.entryFee(info.meta); if (C.cash < fee) return { ok: false, error: `The entry fee is ${money(fee)} and the stable has ${money(C.cash)}. Ask the stable club for an advance at the desk, or pick a cheaper race.`, fee };
    C.booking = { eid: info.eid, hid: h.id, kind: info.kind, ref: info.ref, round: info.round, name: info.name, venue: info.venue, day: info.day, at: C.day };
    C.active = C.horses.indexOf(h); save(); return { ok: true, booking: Object.assign({}, C.booking) };
  }
  function cancelBooking() { if (!C) load(); const had = !!C.booking; delete C.booking; save(); return had; }
  function booking() { if (!C) load(); const b = C.booking; if (!b) return null; const h = C.horses.find(x => x.id === b.hid), e = ((C.cal && C.cal.events) || []).find(x => x.id === b.eid); if (!h || !e || e.day < C.day) { delete C.booking; save(); return null; } return Object.assign({ horse: h.name, hi: C.horses.indexOf(h), def: toDef(h) }, b); }
  // the booked race starts (the float has left the property): the same entry the hub's buttons use
  function startBooked() {
    const b = booking(); if (!b) return { ok: false, error: "Nothing is booked." };
    hidePanel(); race = null; let ok = false;
    const snap = JSON.stringify(C);                           // all or nothing (Phase 13): if the entry can't be made, the calendar, cash and bills are put back exactly as they were
    try {
      if (b.kind === "round") ok = enterOfficial(b.round, b.hi);
      else { const e = ((C.cal && C.cal.events) || []).find(x => x.id === b.eid); if (e && e.day > C.day) CORE.advance(C, e.day - C.day, { cap: true, force: true }); ok = enterOptional(b.ref, b.hi, true); }
    } catch (err) { console.error(err); ok = false; }
    if (!ok) { restoreCareer(snap); return { ok: false, error: "The entry could not be made (entry fee or eligibility)." }; }
    delete C.booking; save();                                // consumed exactly once, only when the race really started
    return { ok: true };
  }
  // put the live career back to a snapshot without changing the object everyone else holds
  function restoreCareer(snap) { const o = JSON.parse(snap); for (const k of Object.keys(C)) delete C[k]; Object.assign(C, o); pending = null; save(); }
  // ---------- the departure (Phase 13): a preparation summary, then an atomic save before the horse travels ----------
  // saveVerified: write the career and read it straight back; true only if what is stored is exactly what is in memory
  function saveVerified() { if (!C) load(); const text = JSON.stringify(C); try { localStorage.setItem("ff_career", text); return localStorage.getItem("ff_career") === text; } catch (e) { return false; } }
  const travel = {
    summary() {
      if (!C) load(); const b = booking(); if (!b) return null; const h = C.horses.find(x => x.id === b.hid), e = ((C.cal && C.cal.events) || []).find(x => x.id === b.eid), meta = BY_ID[b.ref] || (b.kind === "round" ? SEASON.roundDef(S(), b.round) : null);
      if (!h || !e || !meta) return null;
      const ra = CORE.raceAttrs(C, h), dv = CORE.devRec(C, h), fee = CORE.entryFee(meta), going = (GOING[e.forecast && e.forecast.going] || {}).label || (e.forecast && e.forecast.going) || "", warn = [];
      if (h.fitness < 70) warn.push(h.name + " is only " + (h.fitness < 50 ? "half" : "partly") + " fit — he will race about " + Math.round(ra.pen * 1000) / 10 + "% below his ratings");
      if (dv.sore > 0) warn.push(h.name + " is sore — he should rest before racing");
      if (C.cash < fee) warn.push("The entry fee is " + money(fee) + " and the stable has " + money(C.cash));
      return { eid: b.eid, name: b.name, venue: b.venue, course: courseNote(b.venue), grade: meta.grade, dist: meta.dist, date: CORE.fmtDate(e.day), daysAway: Math.max(0, e.day - C.day), tod: CORE.TOD_LABEL[e.tod] || "", weather: CORE.WX_LABEL[e.forecast && e.forecast.weather] || "", going, prize: meta.prize || "", fee, cash: C.cash, afford: C.cash >= fee,
        horse: { name: h.name, fitness: h.fitness, composure: h.composure, readiness: CORE.readiness(C, h), pen: ra.pen, peak: !!ra.peak, sore: dv.sore, rating: rating(h), form: formStr(h, 5) }, warnings: warn };
    },
    // the save-then-travel gate: refuses (changing nothing) if the career can't be stored; the farm only lets the horse leave when this says ok
    commit() { const b = booking(); if (!b) return { ok: false, reason: "nobooking" }; if (!saveVerified()) return { ok: false, reason: "save" }; return { ok: true, booking: b }; },
    saveVerified,
  };
  // ---------- stable care and hands-on training (Phase 6): the rules live in career-core.js (CORE.groom / feed / prepare / drillReward / restDay) ----------
  const careSave = r => { if (r && r.ok) save(); return r; };
  const horseById = hid => { if (!C) load(); return C.horses.find(x => x.id === hid) || null; };
  const care = {
    status(hid) { const h = horseById(hid); return h ? Object.assign(CORE.careStatus(C, h), { readiness: CORE.readiness(C, h), fitness: h.fitness, composure: h.composure, cash: C.cash }) : null; },
    groom: hid => { horseById(hid); return careSave(CORE.groom(C, hid)); }, feed: (hid, tier) => { horseById(hid); return careSave(CORE.feed(C, hid, tier)); },
    prepare: hid => { horseById(hid); return careSave(CORE.prepare(C, hid)); }, unprepare: hid => { horseById(hid); return careSave(CORE.unprepare(C, hid)); },
    drill: (hid, id, grade) => { horseById(hid); return careSave(CORE.drillReward(C, hid, id, grade)); },
    wash: hid => { horseById(hid); return careSave(CORE.wash(C, hid)); }, save() { if (C) save(); },
    plan: (hid, plan, int) => { horseById(hid); return careSave(CORE.setPlan(C, hid, plan, int)); },
    rest() { if (!C) load(); const r = CORE.restDay(C); if (r.ok) { save(); } return r; },
    get cash() { if (!C) load(); return C.cash; }, get day() { if (!C) load(); return C.day; }, get today() { if (!C) load(); return CORE.fmtDate(C.day); },
  };
  // what the inspect card shows for a horse
  function horseInfo(hid) {
    const h = horseById(hid); if (!h) return null; const s = S(), st = detectStyle(h.attrs), form = (h.history || []).slice(-5).map(e => e.dnf || !e.place ? "F" : e.place).join("-");
    const pot = h.pot || null;
    return { id: h.id, name: h.name, age: h.age, rating: rating(h), style: st.label, pref: st.dist, fitness: h.fitness, composure: h.composure, cond: h.fitness >= 85 ? "Fit" : h.fitness >= 70 ? "Fresh" : h.fitness >= 50 ? "Tired" : "Needs a spell",
      attrs: ATTRS.map(([k, lab]) => ({ k, lab, v: h.attrs[k], p: pot ? pot[k] : h.attrs[k] })), races: h.races | 0, wins: h.wins | 0, places: h.places | 0, form, trainPts: h.trainPts | 0, prize: h.prize | 0, status: care.status(hid), dev: CORE.devReport(C, h), race: CORE.raceAttrs(C, h) };
  }
  // the player's character (Phase 5): saved as the changes are made in the wardrobe
  function setPlayer(p) { if (!C) load(); const cur = C.player || {}; C.player = CORE.cleanPlayer({ look: Object.assign({}, cur.look, p.look), colours: Object.assign({}, cur.colours, p.colours), outfit: p.outfit || cur.outfit }); save(); return C.player; }
  // is there a stored career? (the main-menu background shows your horses only if so; it never creates a save by itself)
  function hasSave() { try { return !!localStorage.getItem("ff_career"); } catch (e) { return false; } }
  // after a career race: back to the property (the results screen's button)
  function returnHome() { race = null; hidePanel(); fromFarm = false; if (typeof FARM !== "undefined") FARM.arrive("hardstand"); SCENES.enter("farm", { instant: true }); }
  // "travel to race": the usual event screen for the next championship round (choose the horse there)
  function travelToNextRace() {
    if (!C) load(); race = null; hidePanel();
    if (!activeHorse()) { openHub(); toast("Create your first horse to begin racing", "info", 2.4); return; }
    const s = S(); if (SEASON.done(s)) return openHub();
    openEvent(s.cur, false);
  }

  // ---------- entry ----------
  function open() { load(); race = null; hidePanel(); openHub(); }
  // multiplayer: your career horses (real ratings), and the online record (no experience, points or prize money)
  function onlineHorses() { load(); return C.horses.map((h, i) => ({ i, id: h.id, name: h.name, rating: rating(h), role: detectStyle(h.attrs).label, silk: h.silk, def: toDef(h) })); }
  function recordOnline(hid, e) {
    load(); const h = C.horses.find(x => x.id === hid); if (!h) return false;
    const o = h.online || (h.online = { runs: 0, wins: 0, places: 0, last: [] });
    o.runs++; if (!e.dnf && e.place === 1) o.wins++; if (!e.dnf && e.place >= 1 && e.place <= 3) o.places++;
    o.last.push({ place: e.place | 0, field: e.field | 0, dist: e.dist | 0, dnf: !!e.dnf, vs: String(e.vs || "").slice(0, 80), d: Date.now() / 1000 | 0 }); if (o.last.length > 10) o.last.shift();
    save(); return true;
  }
  // the market through the public API (used by the tests and the farm)
  const marketApi = {
    open: (tab) => { if (!C) load(); fromFarm = false; openMarket(tab || "buy", "office"); }, sync: () => { if (!C) load(); CORE.marketSync(C); return C.market.listings.map(l => CORE.marketView(C, l)); },
    offer: (id, price) => { const r = CORE.marketOffer(C, id, price, { slots: slots() }); save(); return r; }, buy: (id, price) => { const r = CORE.marketBuy(C, id, price, { slots: slots() }); if (r.ok) save(); return r; },
    quote: hid => CORE.sellQuote(C, hid), sell: hid => { const r = CORE.sellHorse(C, hid); if (r.ok) save(); return r; }, fee: () => CORE.createFee(C), slots: () => slots(),
  };
  return { open, begin, openScreen, onResult, market: marketApi, travel, training: trainingApi, load, hidePanel, get data() { return C; }, onlineHorses, recordOnline, farmStalls, travelToNextRace, enterOffice, calendarData, boardInfo, horsesFor, book, cancelBooking, booking, startBooked, returnHome, plans: CORE.PLANS, fac: { buy: k => { if (!C) load(); const r = CORE.buyFacility(C, k); if (r.ok) save(); return r; }, hire: (role, tier, spec) => { if (!C) load(); const r = CORE.hireStaff(C, role, tier, spec); if (r.ok) save(); return r; }, fire: role => { if (!C) load(); const r = CORE.fireStaff(C, role); save(); return r; }, effects: f => { if (!C) load(); return CORE.facEffects(C, f); } }, finance: { bill: () => { if (!C) load(); return CORE.weeklyBill(C); }, club: () => { if (!C) load(); return CORE.clubOffer(C); }, advance: () => { if (!C) load(); const r = CORE.clubAdvance(C); if (r.ok) save(); return r; }, owed: () => { if (!C) load(); return CORE.econOf(C).debt; }, fee: eid => { if (!C) load(); const e = ((C.cal && C.cal.events) || []).find(x => x.id === eid), m = e && metaOf(e); return m ? CORE.entryFee(m) : 0; } }, setPlayer, hasSave, createForFarm, slotsFree: () => { if (!C) load(); return slots() - C.horses.length; }, care, horseInfo, defOf: hid => { const h = horseById(hid); return h ? toDef(h) : null; },
    _test: { openOffice, importText, importPrepare, exportText, prepare, save, money, get lastBackup() { return lastBackup; }, enterOfficial, enterOptional, doSkip, openSeasonEnd, openEvent, openStandings, openCalendar, openHistory, openOptional, toDef, xpFor, openCreate, openStable, openProfile, openTraining, openTrophies, openRivals, openRival, formGuideHtml, get draft() { return draft; }, schedulePreview, BASE, START_POOL, START_CAP, POT_POOL, POT_CAP, upgCost } };
})();
