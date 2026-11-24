'use strict';
/* =====================================================================
   FINAL FURLONG — CAREER DATA ARCHITECTURE (pure logic, no DOM)
   Save schema v4, migration v1/v2/v3 → v4, the career calendar (dates, seasons, ageing), the money ledger (every
   change of cash is one idempotent transaction), the prize schedule, horse fitness / age / growth data and the dated
   race programme (time of day + forecast stored per event).

   Loads as a classic browser script (global CORE, after season.js and before career.js) and as a Node module (tests).
   Everything is deterministic from the career seed, so a reload never changes a date, a forecast or a field.

   Phase 2 only introduces the data and the rules. The gameplay effects of fitness, age and growth are switched on in
   a later phase (CAREER_PLAN.md phase 9); the only things the player sees now are the date, cash and the Office.
   Nothing here removes or rewrites an existing field: a migrated save is a strict superset of the old one.
   ===================================================================== */
const CORE = (() => {
  const SX = (typeof SEASON !== "undefined") ? SEASON : require("./season.js");
  const { hashStr, rngOf } = SX;
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const isObj = o => !!o && typeof o === "object" && !Array.isArray(o);
  const finite = v => typeof v === "number" && isFinite(v);

  const V = 4;                                           // current save schema
  const SAVE_KEY = "ff_career";
  const EPOCH_YEAR = 2026, MS = 86400000, T0 = Date.UTC(EPOCH_YEAR, 7, 1);   // day 0 = 1 August 2026 = the start of season 1
  const START_CASH = 150000;                             // the new-career package
  const LEGACY_PCT = 0.10, LEGACY_CAP = 250000;          // an existing career: 10% of its recorded prize money, capped (no retroactive costs)
  const MAX_TXN = 1e9, MAX_CASH = 1e12;
  const LEDGER_KEEP = 300, TXN_KEEP = 4000, NOTICE_KEEP = 40;
  const MAX_SAVE_BYTES = 6 * 1024 * 1024;                // an imported file larger than this is refused
  const FAC_KEYS = ["training", "track", "recovery", "comfort", "feed", "gates", "vet"];
  const STAFF_KEYS = ["trainer", "groom", "vet"];
  const OUTFITS = ["stable", "training", "raceday"];

  // ---------- the calendar ----------
  // Day numbers count from 1 August 2026. A racing season runs 1 August – 31 July and is numbered like SEASON's `n`
  // (season n starts on 1 August of 2026 + n − 1). Horses age on 1 August, as in real Australian racing.
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayInt = d => Math.max(0, Math.floor(+d) || 0);
  const parts = day => { const d = new Date(T0 + dayInt(day) * MS); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() }; };
  const fmtDate = (day, o) => { const p = parts(day); return (o && o.short ? "" : DOWS[p.dow] + " ") + p.d + " " + MONTHS[p.m] + (o && o.noYear ? "" : " " + p.y); };
  const seasonYear = n => EPOCH_YEAR + Math.max(1, n | 0) - 1;
  const seasonLabel = n => seasonYear(n) + "–" + String(seasonYear(n) + 1).slice(2);
  const seasonOfDay = day => { const p = parts(day); return (p.m >= 7 ? p.y : p.y - 1) - EPOCH_YEAR + 1; };
  const seasonStartDay = n => Math.round((Date.UTC(seasonYear(n), 7, 1) - T0) / MS);
  const seasonEndDay = n => seasonStartDay(n + 1) - 1;
  const dowOf = day => parts(day).dow;
  const satOnOrBefore = day => day - ((dowOf(day) + 1) % 7);   // racing is on Saturdays (Sat = 6 → 0 days back)
  const daysUntil = (C, day) => day - C.day;

  // ---------- default blocks (every new field has a safe default) ----------
  const defFac = () => { const o = {}; FAC_KEYS.forEach(k => o[k] = 0); return o; };
  const defStaff = () => { const o = {}; STAFF_KEYS.forEach(k => o[k] = null); return o; };
  const defPlayer = () => ({ look: { head: 0, hair: 0, hairCol: "#2a1c10", skin: "#c68e6b", build: 0 }, outfit: "stable", colours: { shirt: "#2e5e8a", trousers: "#3a3a40", boots: "#4a2e1a" } });
  const hexc = (v, d) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  function cleanPlayer(p) {
    const d = defPlayer(); if (!isObj(p)) return d;
    const L = isObj(p.look) ? p.look : {}, K = isObj(p.colours) ? p.colours : {};
    return { look: { head: clampN(L.head | 0, 0, 9), hair: clampN(L.hair | 0, 0, 9), hairCol: hexc(L.hairCol, d.look.hairCol), skin: hexc(L.skin, d.look.skin), build: clampN(+L.build || 0, -1, 1) },
      outfit: OUTFITS.includes(p.outfit) ? p.outfit : "stable", colours: { shirt: hexc(K.shirt, d.colours.shirt), trousers: hexc(K.trousers, d.colours.trousers), boots: hexc(K.boots, d.colours.boots) } };
  }
  function cleanStaff(s) {
    const out = defStaff(); if (!isObj(s)) return out;
    for (const k of STAFF_KEYS) { const m = s[k]; if (isObj(m)) out[k] = { tier: clampN(m.tier | 0, 1, 3), spec: String(m.spec || "").slice(0, 24), name: String(m.name || "").replace(/[<>]/g, "").slice(0, 24), wage: Math.max(0, Math.round(+m.wage) || 0), look: isObj(m.look) ? m.look : {} }; }
    return out;
  }

  // ---------- horse data: age, growth, fitness (data + rules; gameplay effects arrive in a later phase) ----------
  const GROWTH_BASE = { early: { peak: 4, from: 7 }, avg: { peak: 5, from: 8 }, late: { peak: 6, from: 9 } };
  // a per-horse development curve, seeded from the horse's id so it is identical on every device and reload
  function growthProfile(id) {
    const r = rngOf(hashStr("growth/" + id)), t = r(), type = t < 0.28 ? "early" : t < 0.78 ? "avg" : "late", b = GROWTH_BASE[type];
    const peak = b.peak + (r() < 0.2 ? 1 : r() < 0.3 ? -1 : 0), from = Math.max(peak + 2, b.from + Math.floor(r() * 3));   // some horses stay competitive to 9–10
    return { type, peak, from, rate: Math.round((0.6 + r() * 0.8) * 100) / 100 };
  }
  function cleanGrowth(g, id) {
    if (!isObj(g) || !GROWTH_BASE[g.type]) return growthProfile(id);
    const peak = clampN(g.peak | 0, 3, 9); return { type: g.type, peak, from: clampN(g.from | 0, peak + 1, 14), rate: clampN(+g.rate || 1, 0.2, 3) };
  }
  const ageOf = (h, day) => Math.max(2, seasonYear(seasonOfDay(day)) - (h.foaled | 0));
  const ageStage = age => age <= 3 ? "Young" : age <= 5 ? "Developing" : age <= 7 ? "Mature" : "Veteran";
  // how quickly a horse still builds ability at an age (1 = the baseline); steep for the young, easing to the peak
  function devRate(g, age) {
    if (age < g.peak) return Math.round((1.3 - 0.5 * ((age - 3) / Math.max(1, g.peak - 3))) * 1000) / 1000;
    return Math.round(Math.max(0.1, 0.8 - 0.25 * (age - g.peak)) * 1000) / 1000;
  }
  // gradual loss of physical ability once past the horse's decline age (0 before it)
  function declineRate(g, age) { return age < g.from ? 0 : Math.round(g.rate * (1 + 0.15 * (age - g.from)) * 1000) / 1000; }

  const raceFitnessCost = (h, o) => {            // the drop in fitness a race causes (distance, going, effort, endurance)
    let c = 7 + (clampN(o.dist || 1400, 1000, 3600) - 1000) / 220;
    c *= o.dnf ? 1.35 : 1;
    c *= ({ heavy: 1.25, soft: 1.1, good: 1, firm: 0.95 })[o.going] || 1;
    c *= clampN(1.3 - ((h.attrs && h.attrs.end) || 60) / 150, 0.65, 1.1);
    return Math.round(clampN(c, 3, 30));
  };
  const recoveryPerDay = (h, fac) => Math.round(clampN(3.2 + (((h.attrs && h.attrs.rec) || 60) - 50) / 14 + ((fac && fac.recovery) || 0) * 1.2, 2.5, 12) * 10) / 10;
  // the small, explained performance penalty an unfit horse will get once fitness is switched on (0 above 80)
  const fitnessPenalty = f => f >= 80 ? 0 : Math.round(clampN((80 - f) / 80, 0, 1) * 0.06 * 1000) / 1000;
  // recent-form index from the last runs (1 best … 0 worst); data only
  function formIdx(h) { const r = (h.history || []).slice(-5); if (!r.length) return 0.5; return Math.round(r.reduce((s, e) => s + (e.dnf || !e.place ? 0.1 : clampN(1 - (e.place - 1) / Math.max(4, (e.field || 10) - 1), 0, 1)), 0) / r.length * 100) / 100; }

  // the v4 fields of a horse. keepHorse returns the valid ones already present (used by the sanitiser, so a stored value
  // is never overwritten); fillHorse adds whatever is missing. Neither touches attributes, potential, look or records.
  function keepHorse(h) {
    const o = {};
    if (finite(h.foaled)) o.foaled = clampN(Math.round(h.foaled), 1990, 2200);
    if (finite(h.age)) o.age = clampN(Math.round(h.age), 2, 30);
    if (isObj(h.growth)) o.growth = h.growth;
    if (finite(h.fitness)) o.fitness = clampN(Math.round(h.fitness), 0, 100);
    if (finite(h.composure)) o.composure = clampN(Math.round(h.composure), 0, 100);
    if (finite(h.lastRaceDay)) o.lastRaceDay = dayInt(h.lastRaceDay);
    if (finite(h.trainDay)) o.trainDay = dayInt(h.trainDay);
    if (finite(h.trainedToday)) o.trainedToday = clampN(h.trainedToday | 0, 0, 99);
    if (typeof h.plan === "string") o.plan = h.plan.slice(0, 24);
    if (isObj(h.acquired)) o.acquired = { how: ["created", "migrated", "auction", "private", "gift"].includes(h.acquired.how) ? h.acquired.how : "migrated", price: Math.max(0, Math.round(+h.acquired.price) || 0), day: dayInt(h.acquired.day) };
    if (typeof h.retired === "boolean") o.retired = h.retired;
    if (finite(h.value)) o.value = Math.max(0, Math.round(h.value));
    return o;
  }
  // `info`: { age, how, price, fitness } for a newly arrived horse; otherwise the defaults of an existing one
  function fillHorse(h, C, info) {
    info = info || {};
    const k = keepHorse(h);
    h.growth = cleanGrowth(h.growth, h.id);
    if (k.foaled == null) { const age = info.age != null ? info.age : (finite(h.age) ? h.age : 3); h.foaled = seasonYear(seasonOfDay(C.day)) - clampN(age | 0, 2, 20); }
    h.age = ageOf(h, C.day);
    if (k.fitness == null) h.fitness = info.fitness != null ? info.fitness : 90;
    if (k.composure == null) h.composure = 70;
    if (k.lastRaceDay == null) h.lastRaceDay = null;
    if (k.trainDay == null) h.trainDay = null;
    if (k.trainedToday == null) h.trainedToday = 0;
    if (k.plan == null) h.plan = null;
    if (k.acquired == null) h.acquired = { how: info.how || "migrated", price: info.price || 0, day: dayInt(C.day) };
    if (k.retired == null) h.retired = false;
    if (k.value == null) h.value = 0;
    Object.assign(h, keepHorse(h));
    return h;
  }

  // ---------- the money ledger ----------
  // Every change of cash goes through apply(). A transaction key can be used once, ever: a second call with the same key
  // changes nothing (so a race result replayed, a save reloaded or a button pressed twice cannot pay out or charge twice).
  const KEY_RE = /^[A-Za-z0-9:_.\-]{1,96}$/;
  function ledgerInit(C) {
    if (!finite(C.cash)) C.cash = 0;
    C.cash = clampN(Math.round(C.cash), -MAX_CASH, MAX_CASH);
    if (!Array.isArray(C.ledger)) C.ledger = [];
    C.ledger = C.ledger.filter(e => isObj(e) && finite(e.amount) && typeof e.key === "string").slice(-LEDGER_KEEP);
    C.ledgerSeq = Math.max(C.ledgerSeq | 0, C.ledger.reduce((m, e) => Math.max(m, e.n | 0), 0));
    if (!isObj(C.txn)) C.txn = {};
    for (const k of Object.keys(C.txn)) if (!KEY_RE.test(k)) delete C.txn[k];
    if (!isObj(C.fin)) C.fin = {};
  }
  function apply(C, key, amount, kind, note, opt) {
    opt = opt || {};
    if (typeof key !== "string" || !KEY_RE.test(key) || key === "__proto__") return { ok: false, reason: "bad-key" };
    if (!finite(amount) || Math.abs(amount) > MAX_TXN) return { ok: false, reason: "bad-amount" };
    amount = Math.round(amount); if (!amount) return { ok: false, reason: "zero" };
    if (!isObj(C.txn)) C.txn = {};
    if (Object.prototype.hasOwnProperty.call(C.txn, key)) return { ok: false, dup: true, reason: "duplicate" };
    const cash = finite(C.cash) ? C.cash : 0;
    if (amount < 0 && cash + amount < 0 && !opt.allowDebt) return { ok: false, reason: "insufficient", short: -(cash + amount) };
    if (cash + amount > MAX_CASH) return { ok: false, reason: "overflow" };
    C.cash = cash + amount;                                  // all checks passed: nothing below can fail halfway
    C.txn[key] = dayInt(C.day);
    C.ledgerSeq = (C.ledgerSeq | 0) + 1;
    const e = { n: C.ledgerSeq, key, day: dayInt(C.day), kind: String(kind || "other").slice(0, 16), amount, bal: C.cash, note: String(note || "").replace(/[<>]/g, "").slice(0, 120) };
    if (!Array.isArray(C.ledger)) C.ledger = [];
    C.ledger.push(e); if (C.ledger.length > LEDGER_KEEP) C.ledger.splice(0, C.ledger.length - LEDGER_KEEP);
    if (!isObj(C.fin)) C.fin = {};
    const sn = seasonOfDay(C.day), f = C.fin[sn] || (C.fin[sn] = { in: 0, out: 0, by: {} });
    if (amount > 0) f.in += amount; else f.out -= amount;
    f.by[e.kind] = (f.by[e.kind] || 0) + amount;
    const keys = Object.keys(C.txn);
    if (keys.length > TXN_KEEP) for (const k of keys.slice(0, keys.length - Math.floor(TXN_KEEP * 0.9))) delete C.txn[k];
    return { ok: true, entry: e, balance: C.cash };
  }
  const applied = (C, key) => !!C.txn && Object.prototype.hasOwnProperty.call(C.txn, key);
  // consistency check of the money data: returns a list of problems (empty = healthy)
  function audit(C) {
    const bad = [];
    if (!finite(C.cash) || Math.round(C.cash) !== C.cash) bad.push("cash is not a whole number");
    else if (C.cash < 0) bad.push("cash is negative");
    const L = Array.isArray(C.ledger) ? C.ledger : [];
    for (let i = 1; i < L.length; i++) if (L[i].bal !== L[i - 1].bal + L[i].amount) { bad.push("ledger entry " + L[i].n + " does not follow the previous balance"); break; }
    if (L.length && L[L.length - 1].bal !== C.cash) bad.push("the last ledger balance does not match cash");
    const seen = new Set(); for (const e of L) { if (seen.has(e.key)) { bad.push("duplicate ledger key " + e.key); break; } seen.add(e.key); }
    for (const e of L) if (!applied(C, e.key)) { bad.push("ledger key missing from the applied set: " + e.key); break; }
    return bad;
  }

  // ---------- prizes ----------
  // Purse per race comes from the race data (season.js `prize`, e.g. "$40,000"); the split by finishing place depends on the grade.
  // Replaces the old record-only 60/20/10 string parsing: places 1–5 are paid and the amount is credited once through the ledger.
  const SPLIT_STD = [0.60, 0.20, 0.10, 0.06, 0.04], SPLIT_TOP = [0.58, 0.19, 0.10, 0.07, 0.06];
  // Races without a purse in the data (the optional races) pay nothing, exactly as before. Real purse balancing is the economy phase.
  // the game's purse = the race's face-value prize × a per-tier scale (Phase 7 rebalance; see ECON.PURSE_SCALE), rounded to $50
  function purseOf(meta) { const f = purseFace(meta); return f > 0 ? Math.max(50, Math.round(f * purseScale(meta) / 50) * 50) : 0; }
  const splitFor = meta => ((meta && meta.tier) | 0) >= 3 ? SPLIT_TOP : SPLIT_STD;
  function prizeFor(meta, place) { place = place | 0; if (place < 1 || place > 5) return 0; return Math.round(purseOf(meta) * splitFor(meta)[place - 1]); }
  // credit a prize once. The key names the race instance + horse, so replays and reloads cannot pay it twice.
  function awardPrize(C, key, meta, place, horseName) {
    const amt = prizeFor(meta, place); if (!amt) return { ok: false, reason: "no-prize", amount: 0 };
    const r = apply(C, key, amt, "prize", ordinal(place) + " · " + meta.name + (horseName ? " · " + horseName : ""));
    return Object.assign(r, { amount: r.ok ? amt : 0 });
  }
  const ordinal = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  // ---------- the dated race programme ----------
  // Each event of the current season: a championship round (in round order, on Saturdays across the season) or a meeting of
  // an optional race. Time of day and a weather/going forecast are chosen once, deterministically, and stored on the event
  // — so viewing a race and entering it later shows the same conditions. (Rendered in a later phase.)
  const TODS = ["early_morning", "mid_morning", "midday", "afternoon", "late_afternoon", "golden_hour", "dusk", "evening"];
  const TOD_LABEL = { early_morning: "Early morning", mid_morning: "Mid-morning", midday: "Midday", afternoon: "Afternoon", late_afternoon: "Late afternoon", golden_hour: "Golden hour", dusk: "Dusk", evening: "Evening (lights)" };
  const TOD_W = [0.04, 0.14, 0.18, 0.38, 0.16, 0.07, 0.03];
  const WX_LABEL = { clear: "Clear", partly_cloudy: "Partly cloudy", overcast: "Overcast", light_rain: "Light rain", rain: "Rain" };
  const WX_SEASON = [   // by calendar month (southern hemisphere): clear, partly cloudy, overcast, light rain, rain
    [.55, .30, .10, .04, .01], [.55, .30, .10, .04, .01], [.40, .30, .17, .09, .04], [.40, .30, .17, .09, .04], [.40, .30, .17, .09, .04],
    [.25, .25, .25, .15, .10], [.25, .25, .25, .15, .10], [.25, .25, .25, .15, .10], [.38, .30, .17, .10, .05], [.38, .30, .17, .10, .05], [.38, .30, .17, .10, .05], [.55, .30, .10, .04, .01]];
  const WX_KEYS = ["clear", "partly_cloudy", "overcast", "light_rain", "rain"];
  const WX_OK = { heavy: ["light_rain", "rain"], soft: ["light_rain", "overcast", "partly_cloudy"], good: ["clear", "partly_cloudy", "overcast"], firm: ["clear", "partly_cloudy"] };
  const lit = venue => /randwick|flemington/i.test(venue || "");   // only the two flagship courses have lights
  function pickW(r, keys, w) { let t = 0; w.forEach(x => t += x); let x = r() * t; for (let i = 0; i < keys.length; i++) { x -= w[i]; if (x <= 0) return keys[i]; } return keys[keys.length - 1]; }
  function conditions(seed, id, day, meta, goingKey) {
    const r = rngOf(hashStr(seed + "/ev/" + id));
    const tw = TOD_W.slice(), tk = TODS.slice(0, 7);
    if (lit(meta.venue) && (meta.tier | 0) >= 3) { tw.push(0.05); tk.push("evening"); }   // evening racing only where the course has lights
    const tod = pickW(r, tk, tw);
    const ok = WX_OK[goingKey] || WX_OK.good, mw = WX_SEASON[parts(day).m];
    const keys = [], w = []; WX_KEYS.forEach((k, i) => { if (ok.includes(k)) { keys.push(k); w.push(mw[i]); } });
    return { tod, forecast: { weather: pickW(r, keys, w), going: goingKey } };
  }
  const OPT_PER_SEASON = 3;
  function placeSeason(C) {
    const s = C.season;
    if (!s) return (C.cal = { v: 1, season: 0, div: -1, events: [] });
    const n = s.n, start = seasonStartDay(n), end = seasonEndDay(n), rounds = SX.DIVS[s.div].rounds, K = rounds.length;
    const rng = rngOf(hashStr(C.seed + "/cal/" + n + "/" + s.div)), events = [];
    const first = start + 13, last = end - 28, span = last - first;
    let prev = -1;
    for (let i = 0; i < K; i++) {
      let d = satOnOrBefore(first + Math.round(span * i / Math.max(1, K - 1)) + Math.round((rng() - 0.5) * 8));
      if (d <= prev) d = prev + 7;
      prev = d;
      const meta = rounds[i], id = "r" + n + "-" + (i + 1), g = (s.rounds[i] && s.rounds[i].going) || "good";
      events.push(Object.assign({ id, kind: "round", ref: meta.id, season: n, round: i, day: d, venue: meta.venue }, conditions(C.seed, id, d, meta, g)));
    }
    // the open races are spread evenly through the season (a golden-ratio sequence, so no Saturday is crowded and no month is empty); a race's own meetings are months apart
    const phase = (hashStr(C.seed + "/optphase/" + n) % 1000) / 1000, PHI = 0.6180339887498949;
    SX.OPTIONAL.forEach((meta, oi) => {
      for (let k = 0; k < OPT_PER_SEASON; k++) {
        const j = oi * OPT_PER_SEASON + k, frac = (j * PHI + phase) % 1, d = satOnOrBefore(start + 14 + Math.floor(frac * 335) + Math.round((rng() - 0.5) * 2)), id = "o" + n + "-" + meta.id + "-" + (k + 1);
        events.push(Object.assign({ id, kind: "optional", ref: meta.id, season: n, round: -1, day: d, venue: meta.venue }, conditions(C.seed, id, d, meta, "good")));
      }
    });
    events.sort((a, b) => a.day - b.day || (a.kind === b.kind ? (a.id < b.id ? -1 : 1) : a.kind === "round" ? -1 : 1));
    return (C.cal = { v: 1, season: n, div: s.div, events });
  }
  // keep the stored programme in step with the current season (after a migration, a new season, or an import)
  function syncCalendar(C) {
    const s = C.season;
    const ok = isObj(C.cal) && Array.isArray(C.cal.events) && s && C.cal.season === s.n && C.cal.div === s.div && C.cal.events.filter(e => e.kind === "round").length === SX.DIVS[s.div].rounds.length;
    if (ok) return false;
    placeSeason(C); return true;
  }
  const roundEvent = (C, idx) => (C.cal && C.cal.events || []).find(e => e.kind === "round" && e.round === idx) || null;
  const roundStatus = (C, e) => { const r = C.season && C.season.rounds[e.round]; return r ? r.st : "open"; };
  function upcoming(C, n, o) {   // events from today on (rounds that are already done or skipped are left out)
    return (C.cal && C.cal.events || []).filter(e => e.day >= C.day && (e.kind !== "round" || roundStatus(C, e) === "open") && (!o || !o.kind || e.kind === o.kind)).slice(0, n || 10);
  }
  const nextMeeting = (C, refId) => (C.cal && C.cal.events || []).find(e => e.ref === refId && e.day >= C.day) || null;
  const nextOpenRoundDay = C => { const e = C.season && !SX.done(C.season) ? roundEvent(C, C.season.cur) : null; return e ? e.day : null; };

  // ---------- time ----------
  // advance(C, days): moves the date forward (never back), recovers fitness, and ages horses on 1 August. If the jump would
  // pass the date of a round that is still open, it is refused with `needsConfirm` and the list of events that would be missed,
  // unless {force:true}. {cap:true} stops at the next open round's date instead of passing it.
  function skipsBetween(C, from, to) {
    return (C.cal && C.cal.events || []).filter(e => e.kind === "round" && roundStatus(C, e) === "open" && e.day >= from && e.day < to);
  }
  function advance(C, days, o) {
    o = o || {}; days = Math.floor(+days);
    const from = dayInt(C.day);
    if (!(days > 0)) return { ok: true, from, to: from, days: 0, skips: [], rolled: false, aged: [] };
    let to = from + days;
    if (o.cap) { const nr = nextOpenRoundDay(C); if (nr != null && nr >= from) to = Math.min(to, nr); }
    if (to <= from) return { ok: true, from, to: from, days: 0, skips: [], rolled: false, aged: [] };
    const skips = skipsBetween(C, from, to);
    if (skips.length && !o.force) return { ok: false, needsConfirm: true, from, to, days: to - from, skips };
    const fac = C.fac || {};
    C.day = to;
    const bills = chargeWeeks(C, from, to), nd = to - from, fx = facEffects(C), keepDay = C.day;
    // day by day: horses recover (recovery attribute + facilities + vet), boxes settle them, a groom does the care, and each horse's weekly plan runs one session
    const span = Math.min(nd, 150);
    for (let d = 1; d <= span; d++) {
      C.day = from + d;
      for (const h of C.horses || []) { if (finite(h.fitness)) h.fitness = Math.min(100, h.fitness + recoveryPerDay(h, fac) + fx.recover); if (fx.calm && finite(h.composure) && h.composure < 90) h.composure = Math.min(90, h.composure + fx.calm); }
      if (fx.groom) staffDaily(C);
      autoDay(C, C.day);
    }
    if (nd > span) for (const h of C.horses || []) if (finite(h.fitness)) h.fitness = Math.min(100, h.fitness + (recoveryPerDay(h, fac) + fx.recover) * (nd - span));
    C.day = keepDay; for (const h of C.horses || []) if (finite(h.fitness)) h.fitness = Math.round(h.fitness);
    const rolled = seasonOfDay(to) !== seasonOfDay(from), aged = [];
    for (const h of C.horses || []) { const a = ageOf(h, to); if (a !== h.age) { if (rolled) aged.push({ name: h.name, age: a }); h.age = a; } }
    if (rolled) for (const h of C.horses || []) { const g = h.growth, dr = g ? declineRate(g, h.age) : 0; if (dr > 0) for (const k of ["top", "acc", "spr", "end"]) if (hashStr(h.id + "/decl/" + h.age + k) % 100 < dr * 30 && h.attrs[k] > 40) h.attrs[k]--; }
    for (const h of C.horses || []) { if (h.trainDay != null && h.trainDay < to) h.trainedToday = 0; }
    try { marketSync(C); } catch (e) { /* the market never blocks the calendar */ }
    return { ok: true, from, to, days: to - from, skips, rolled, aged, bills };
  }
  // entering (or skipping) a championship round: the date becomes the round's scheduled day (never earlier than today)
  function enterRound(C, idx) {
    const e = roundEvent(C, idx); if (!e) return { ok: false, reason: "no-event" };
    return e.day > C.day ? advance(C, e.day - C.day, { force: true }) : { ok: true, from: C.day, to: C.day, days: 0, skips: [], rolled: false, aged: [] };
  }
  // an optional race takes a day of calendar time, but never carries the date past the next open round
  const afterOptional = C => advance(C, 1, { cap: true, force: true });
  // a new season has begun (closeSeason): lay out its programme and move the date to its first day (horses age on 1 August)
  function startSeason(C) {
    syncCalendar(C);
    return C.season ? (seasonStartDay(C.season.n) > C.day ? advance(C, seasonStartDay(C.season.n) - C.day, { force: true }) : { ok: true, days: 0 }) : { ok: true, days: 0 };
  }
  // after a race: record the date and the fitness cost (fitness has no effect on racing yet)
  function afterRace(C, h, meta, o) {
    o = o || {};
    const cost = raceFitnessCost(h, { dist: meta.dist, going: o.going, dnf: !!o.dnf });
    h.fitness = clampN((finite(h.fitness) ? h.fitness : 90) - cost, 0, 100); h.lastRaceDay = dayInt(C.day);
    return { cost, fitness: h.fitness };
  }

  // ---------- schema v4: fresh career + migration ----------
  function fresh(seed) {
    const C = { v: V, seed: finite(seed) ? seed >>> 0 : (Math.random() * 2 ** 31) >>> 0, stable: "Southern Cross Stable", horses: [], active: 0, trophies: [], wins: 0, history: [], season: null, created: Date.now() };
    return C;
  }
  // Brings any career object up to v4 in place. Idempotent: running it again changes nothing. Never removes a field, never touches
  // attributes, potential, appearance, records, trophies or championship data. `from` is the version found in storage.
  function migrate(C, o) {
    o = o || {};
    const from = o.from != null ? o.from | 0 : (C.v | 0);
    if (!Array.isArray(C.horses)) C.horses = [];
    if (!finite(C.seed)) C.seed = (Math.random() * 2 ** 31) >>> 0;
    if (!C.world || !C.rivals || !C.season) SX.migrate(C);        // v1/v2 (or damaged) → the championship + rivals first
    const hadDay = finite(C.day);
    C.day = hadDay ? dayInt(C.day) : 0;
    if (!hadDay) {                                                // dates for an existing career: the day after the last completed round
      const s = C.season, done = s ? s.rounds.map((r, i) => r.st !== "open" ? i : -1).filter(i => i >= 0) : [];
      const probe = Object.assign({}, C, { cal: null }); placeSeason(probe);
      const last = done.length ? roundEvent(probe, done[done.length - 1]) : null;
      C.day = last ? last.day + 1 : (s ? seasonStartDay(s.n) : 0);
    }
    ledgerInit(C);
    // money: an existing career gets the new-career package plus a modest credit for past success; no retroactive expenses
    if (!applied(C, "start:package") && !C.ledger.length && C.cash === 0) {
      apply(C, "start:package", START_CASH, "start", "Starting funds");
      if (from < V) {
        const past = C.horses.reduce((s, h) => s + Math.max(0, +h.prize || 0), 0), credit = Math.min(LEGACY_CAP, Math.floor(past * LEGACY_PCT / 100) * 100);
        if (credit > 0) apply(C, "start:legacy", credit, "start", "Credit for past success (10% of recorded prize money)");
      }
    }
    C.fac = Object.assign(defFac(), isObj(C.fac) ? Object.fromEntries(FAC_KEYS.filter(k => finite(C.fac[k])).map(k => [k, clampN(C.fac[k] | 0, 0, 3)])) : {});
    C.staff = cleanStaff(C.staff);
    C.player = cleanPlayer(C.player);
    const M = isObj(C.market) ? C.market : {};
    C.market = { seed: finite(M.seed) ? M.seed >>> 0 : hashStr(C.seed + "/market"), listings: Array.isArray(M.listings) ? M.listings.filter(isObj).slice(0, 30) : [], refreshDay: dayInt(M.refreshDay), wk: finite(M.wk) ? M.wk | 0 : undefined };
    C.hof = Array.isArray(C.hof) ? C.hof.filter(isObj) : [];
    C.rep = finite(C.rep) ? clampN(Math.round(C.rep), 0, 100000) : 0;
    C.entries = Array.isArray(C.entries) ? C.entries.filter(isObj).slice(0, 20) : [];
    C.notices = Array.isArray(C.notices) ? C.notices.filter(isObj).slice(-NOTICE_KEEP) : [];
    C.farm = isObj(C.farm) ? C.farm : { state: "default" };
    econOf(C);
    for (const h of C.horses) fillHorse(h, C, { how: from < V ? "migrated" : "created", age: from < V ? migratedAge(h, C) : 3 });
    syncCalendar(C);
    if (from < V) C.migrated = { from, at: Date.now() };
    C.v = V;
    return C;
  }
  // Age of an existing horse: 3 + seasons since it was created, kept between 3 and 6 (a gentle start; no decline is applied yet)
  function migratedAge(h, C) { const n = C.season ? C.season.n : 1, born = finite(h.born) ? h.born : n; return clampN(3 + Math.max(0, n - born), 3, 6); }

  // ---------- backups (storage = anything with getItem / setItem, e.g. window.localStorage) ----------
  // Writes the raw text of a save before it is changed and reads it back to prove it was stored. Never overwrites an
  // existing backup of that version (it adds a timestamp instead), so the oldest copy always survives.
  function backup(storage, raw, label, now) {
    if (typeof raw !== "string" || !raw) return { ok: false, reason: "nothing-to-back-up" };
    let key = SAVE_KEY + "_" + label + "_backup";
    try {
      const have = storage.getItem(key);
      if (have === raw) return { ok: true, key, reused: true };
      if (have != null) key += "_" + (now || Date.now());
      storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) return { ok: false, reason: "verify-failed", key };
      return { ok: true, key };
    } catch (e) { return { ok: false, reason: "storage-error", error: String(e && e.message || e) }; }
  }
  const listBackups = storage => { const out = []; try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.indexOf(SAVE_KEY + "_") === 0 && /backup/.test(k)) out.push({ key: k, bytes: (storage.getItem(k) || "").length }); } } catch (e) {} return out; };

  // ---------- export / import ----------
  // The exported file wraps the save with a version and a checksum, so a damaged or cut-off file is caught before it can
  // replace a working save. A bare save object (an older export or a pasted ff_career value) is accepted too.
  const checksum = text => hashStr(text).toString(16);
  function exportSave(C, now) {
    const body = JSON.stringify(C);
    return JSON.stringify({ app: "final-furlong-career", format: 1, v: C.v | 0, exported: now || Date.now(), sum: checksum(body), career: C });
  }
  // validates text from a file or the clipboard; returns { ok, career, from } or { ok:false, error }. Nothing is stored here.
  function parseImport(text) {
    if (typeof text !== "string" || !text.trim()) return { ok: false, error: "The file is empty." };
    if (text.length > MAX_SAVE_BYTES) return { ok: false, error: "The file is too large to be a career save." };
    let j; try { j = JSON.parse(text); } catch (e) { return { ok: false, error: "That isn't a readable career file (the JSON is damaged or cut off)." }; }
    let career = j;
    if (isObj(j) && j.app === "final-furlong-career") {
      if (!isObj(j.career)) return { ok: false, error: "The file has no career inside it." };
      if (j.sum != null && j.sum !== checksum(JSON.stringify(j.career))) return { ok: false, error: "The file's checksum doesn't match — it has been changed or damaged." };
      career = j.career;
    }
    if (!isObj(career) || !Array.isArray(career.horses)) return { ok: false, error: "That doesn't look like a Final Furlong career save." };
    if ((career.v | 0) > V) return { ok: false, error: "This save was made by a newer version of the game (v" + (career.v | 0) + "). Update the game first." };
    if (career.horses.length > 12) return { ok: false, error: "The save has too many horses to be valid." };
    return { ok: true, career, from: career.v | 0 };
  }

  // ---------------------------------------------------------------- stable care and hands-on training (Phase 6)
  // Modest, non-race benefits only: nothing here touches a horse's attributes' effect on racing (toDef is unchanged). Every reward is DATED, so it
  // can only be earned once per horse per calendar day, and drill points are also capped per week — you cannot farm it by re-entering a screen
  // or by advancing days. State lives in C.farm.care[horseId].
  const CARE = { FEED_COST: 250, GROOM_COMPOSURE: 4, FEED_COMPOSURE: [1, 3], FEED_FITNESS: [0, 2], DRILL_MIN_FITNESS: 55, DRILL_FITNESS_COST: 3, DRILL_PTS_MIN: 0.15, DRILL_PTS_MAX: 0.5, DRILL_WEEK_CAP: 1.0 };
  function careRec(C, h) {
    if (!isObj(C.farm)) C.farm = { state: "default" }; if (!isObj(C.farm.care)) C.farm.care = {};
    let r = C.farm.care[h.id]; if (!isObj(r)) r = C.farm.care[h.id] = {};
    for (const k of ["groomDay", "fedDay", "prepDay", "drillDay", "washDay"]) if (!finite(r[k])) r[k] = -1;
    if (!finite(r.fedTier)) r.fedTier = 0; if (!finite(r.wk)) r.wk = -1; if (!finite(r.wkPts)) r.wkPts = 0; if (!isObj(r.best)) r.best = {};
    return r;
  }
  const horseOf = (C, id) => (C.horses || []).find(h => h && h.id === id);
  function careStatus(C, h) { const r = careRec(C, h), d = dayInt(C.day); return { groomed: r.groomDay === d, fed: r.fedDay === d, tier: r.fedDay === d ? r.fedTier : 0, prepared: r.prepDay === d, drilled: r.drillDay === d, best: Object.assign({}, r.best) }; }
  // readiness 0–100 (shown on the plaque / inspect card; it has no effect on racing in Phase 6)
  function readiness(C, h) { const s = careStatus(C, h); return clampN(Math.round(0.6 * (finite(h.fitness) ? h.fitness : 80) + 0.3 * (finite(h.composure) ? h.composure : 70) + (s.groomed ? 4 : 0) + (s.fed ? 3 : 0) + (s.prepared ? 3 : 0)), 0, 100); }
  function groom(C, id) {
    const h = horseOf(C, id); if (!h) return { ok: false, reason: "no-horse" }; const r = careRec(C, h), d = dayInt(C.day);
    if (r.groomDay === d) return { ok: true, already: true, gain: 0, composure: h.composure };
    const before = finite(h.composure) ? h.composure : 70; h.composure = clampN(before + CARE.GROOM_COMPOSURE, 0, 100); r.groomDay = d; return { ok: true, already: false, gain: h.composure - before, composure: h.composure };
  }

  function wash(C, id) {
    const h = horseOf(C, id); if (!h) return { ok: false, reason: "no-horse" }; const r = careRec(C, h), d = dayInt(C.day);
    if (r.washDay === d) return { ok: true, already: true, gain: 0 };
    const c0 = finite(h.composure) ? h.composure : 70; h.composure = clampN(c0 + 3, 0, 100); h.fitness = clampN((finite(h.fitness) ? h.fitness : 80) + 1, 0, 100); r.washDay = d; return { ok: true, already: false, gain: h.composure - c0 };
  }
  // tier 0 = the stable's feed (free); tier 1 = quality feed (a ledger expense, once per horse per day)
  function feed(C, id, tier) {
    const h = horseOf(C, id); if (!h) return { ok: false, reason: "no-horse" }; const r = careRec(C, h), d = dayInt(C.day); tier = tier === 1 ? 1 : 0;
    if (r.fedDay === d) return { ok: true, already: true, tier: r.fedTier, gain: 0 };
    if (tier === 1) { const t = apply(C, "feed:d" + d + ":" + h.id, -CARE.FEED_COST, "care", "Quality feed for " + h.name); if (!t.ok) return { ok: false, reason: t.reason === "insufficient" ? "cash" : "ledger", short: t.short || 0 }; }
    const c0 = finite(h.composure) ? h.composure : 70, f0 = finite(h.fitness) ? h.fitness : 80;
    h.composure = clampN(c0 + CARE.FEED_COMPOSURE[tier], 0, 100); h.fitness = clampN(f0 + CARE.FEED_FITNESS[tier], 0, 100); r.fedDay = d; r.fedTier = tier;
    return { ok: true, already: false, tier, composure: h.composure - c0, fitness: h.fitness - f0 };
  }
  function prepare(C, id) { const h = horseOf(C, id); if (!h) return { ok: false, reason: "no-horse" }; const r = careRec(C, h); r.prepDay = dayInt(C.day); return { ok: true }; }
  function unprepare(C, id) { const h = horseOf(C, id); if (!h) return { ok: false }; careRec(C, h).prepDay = -1; return { ok: true }; }
  // a finished hands-on drill; grade 0..1. Returns what was earned (nothing when the daily/weekly cap or tiredness applies — the drill still counted as practice).
  function drillReward(C, id, drill, grade) {
    const h = horseOf(C, id); if (!h) return { ok: false, reason: "no-horse" }; const r = careRec(C, h), d = dayInt(C.day), wk = Math.floor(d / 7);
    grade = clampN(+grade || 0, 0, 1); if (typeof drill === "string" && drill.length < 24) r.best[drill] = Math.max(r.best[drill] || 0, Math.round(grade * 100));
    if ((finite(h.fitness) ? h.fitness : 80) < CARE.DRILL_MIN_FITNESS) return { ok: true, pts: 0, reason: "tired" };
    if (r.drillDay === d) return { ok: true, pts: 0, reason: "today" };
    if (r.wk !== wk) { r.wk = wk; r.wkPts = 0; }
    if (r.wkPts >= DEV.HANDS_WEEK) return { ok: true, pts: 0, reason: "week" };
    const before = devReport(C, h), out = trainSession(C, h, DRILL_ATTR[drill] || {}, { source: "hands", grade, int: 2 });
    if (!out.ok) return { ok: true, pts: 0, reason: out.reason };
    r.drillDay = d; r.wkPts += 1;
    return { ok: true, pts: out.total, gains: out.gains, before, after: devReport(C, h), setback: out.setback, reason: "" };
  }
  // "Rest a day": one calendar day (through advance, so horses recover and the clock stays consistent). Never skips a race that is today.
  function restDay(C) {
    if (C.booking && dayInt(C.booking.day) <= dayInt(C.day)) return { ok: false, reason: "booked-today" };
    const res = advance(C, 1, {}); if (res.ok) return { ok: true, from: res.from, to: res.to, bills: res.bills || [] };
    if (res.needsConfirm) return { ok: false, reason: "round-today", skips: res.skips };
    return { ok: false, reason: "error" };
  }

  // ---------------------------------------------------------------- the stable economy (Phase 7)
  // Fictional, gameplay-balanced Australian dollars (not real racing prices). Prize money is the main income; the stable pays an entry fee per race, a weekly bill (feed & care
  // per horse, property upkeep, facility upkeep, wages once staff exist) that is charged automatically as the calendar moves on and shown as ONE line, and earns a little sponsorship once its
  // reputation grows. Nothing can leave the account below zero: an unpayable bill becomes money owed to the stable club (repaid from half of each prize), and once a season the club
  // advances emergency funds when cash is low — so there is always a way back (a cheap race, a prize, an advance) and never an unrecoverable bankruptcy.
  const ECON = {
    PURSE_SCALE: { 1: 0.30, 2: 0.18, 3: 0.06, 4: 0.05 },       // × the race's face-value purse (Provincial … Group 1 … Everest)
    ENTRY_PCT: 0.04, ENTRY_MIN: 400,                           // entry fee: 4 % of the purse, never under $400 (optional races have no purse and no fee)
    HORSE_WEEK: 600, PROPERTY_WEEK: 400, FAC_WEEK: 150,        // per horse per week; the property; per facility upgrade level per week
    SPONSOR: [[100, 2500], [60, 1200], [30, 600], [10, 250]],  // weekly sponsorship by reputation (rep ≥ first, pays second)
    CLUB: { AMOUNT: 8000, TRIGGER: 3000, REPAY: 0.5 },        // one emergency advance per season, only when cash is under the trigger; half of each prize repays it
    MILESTONES: [["win1", "First win", 2000], ["win5", "5 career wins", 5000], ["win10", "10 career wins", 10000], ["win25", "25 career wins", 25000], ["stakes", "First stakes win", 10000], ["g1", "First Group 1 win", 50000]],
  };
  const weekOf = d => Math.floor(dayInt(d) / 7);
  const fmtMoney = n => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-AU");
  const round50 = n => Math.max(0, Math.round(n / 50) * 50);
  const purseFace = meta => { const n = meta && typeof meta.prize === "string" ? +meta.prize.replace(/[^0-9]/g, "") : +(meta && meta.prize); return finite(n) && n > 0 ? Math.round(n) : 0; };
  const purseScale = meta => ECON.PURSE_SCALE[Math.max(1, Math.min(4, ((meta && meta.tier) | 0) || 1))];
  const entryFee = meta => { const p = purseOf(meta); return p > 0 ? Math.max(ECON.ENTRY_MIN, round50(p * ECON.ENTRY_PCT)) : 0; };
  const purseLabel = meta => { const p = purseOf(meta); return p > 0 ? fmtMoney(p) : "—"; };
  function econOf(C) {
    if (!isObj(C.econ)) C.econ = {}; const e = C.econ;
    if (!finite(e.debt) || e.debt < 0) e.debt = 0; e.debt = Math.round(e.debt); if (!finite(e.clubSeason)) e.clubSeason = 0; if (!finite(e.paidWeek)) e.paidWeek = weekOf(C.day); if (!isObj(e.last)) e.last = null;
    return e;
  }
  const sponsorWeekly = rep => { for (const [r, v] of ECON.SPONSOR) if ((+rep || 0) >= r) return v; return 0; };
  // what one week costs and earns right now (shown in the Office as "upcoming expenses")
  function weeklyBill(C) {
    const n = (C.horses || []).length, fac = C.fac || {}, lv = Object.values(fac).reduce((a, v) => a + (finite(v) ? v : 0), 0), staff = C.staff || {};
    const wages = Object.values(staff).reduce((a, s) => a + (s && finite(s.wage) ? s.wage : 0), 0);
    const items = [{ k: "feed", label: `Feed & care · ${n} horse${n === 1 ? "" : "s"}`, amount: n * ECON.HORSE_WEEK }, { k: "property", label: "Property upkeep", amount: ECON.PROPERTY_WEEK + lv * ECON.FAC_WEEK }];
    if (wages) items.push({ k: "wages", label: "Staff wages", amount: wages });
    const cost = items.reduce((a, x) => a + x.amount, 0), income = sponsorWeekly(C.rep);
    return { items, cost, sponsor: income, net: income - cost };
  }
  // pay `amount` as far as the cash allows; any unpaid remainder is owed to the club (never a negative balance)
  function payBill(C, key, amount, kind, note) {
    const e = econOf(C); amount = Math.round(amount); if (amount <= 0) return { ok: true, paid: 0, owed: 0 };
    if (Object.prototype.hasOwnProperty.call(C.txn || {}, key)) return { ok: false, dup: true, paid: 0, owed: 0 };
    const cash = Math.max(0, finite(C.cash) ? C.cash : 0), pay = Math.min(amount, cash), owe = amount - pay;
    if (pay > 0) { const r = apply(C, key, -pay, kind, note + (owe ? " (part-paid)" : "")); if (!r.ok) return { ok: false, paid: 0, owed: 0, reason: r.reason }; }
    else { if (!isObj(C.txn)) C.txn = {}; C.txn[key] = dayInt(C.day); }
    if (owe > 0) e.debt = Math.min(e.debt + owe, 5e6);
    return { ok: true, paid: pay, owed: owe };
  }
  // called by advance(): every week boundary crossed charges one bill (and pays any sponsorship), exactly once per week (txn keys)
  function chargeWeeks(C, from, to) {
    const e = econOf(C), w0 = Math.max(e.paidWeek, weekOf(from)) + 1, w1 = weekOf(to), bills = []; if (w1 < w0) return bills;
    for (let w = w0; w <= Math.min(w1, w0 + 60); w++) {
      const b = weeklyBill(C), wd = w * 7, label = fmtDate(wd, { short: true });
      const spon = b.sponsor > 0 ? apply(C, "spons:w" + w, b.sponsor, "sponsor", "Sponsorship · week of " + label) : { ok: false };
      const r = payBill(C, "week:w" + w, b.cost, "upkeep", "Weekly bill · " + label + " · " + b.items.map(x => x.label + " " + fmtMoney(x.amount)).join(" · "));
      bills.push({ week: w, day: wd, cost: b.cost, paid: r.paid, owed: r.owed, sponsor: spon.ok ? b.sponsor : 0 }); e.paidWeek = w;
    }
    e.last = { from: dayInt(from), to: dayInt(to), cost: bills.reduce((a, x) => a + x.cost, 0), sponsor: bills.reduce((a, x) => a + x.sponsor, 0), owed: bills.reduce((a, x) => a + x.owed, 0), weeks: bills.length };
    return bills;
  }
  // an entry fee for a race (key names the race instance + horse: re-entering the same instance never charges twice)
  function payEntry(C, key, meta, horseName) {
    const fee = entryFee(meta); if (!fee) return { ok: true, fee: 0 };
    if (Object.prototype.hasOwnProperty.call(C.txn || {}, key)) return { ok: true, fee, already: true };
    const r = apply(C, key, -fee, "entry", "Entry fee · " + meta.name + (horseName ? " · " + horseName : ""));
    return r.ok ? { ok: true, fee } : { ok: false, fee, reason: r.reason === "insufficient" ? "cash" : r.reason, short: r.short || 0 };
  }
  const clubOffer = C => { const e = econOf(C), sn = seasonOfDay(C.day); if (e.clubSeason === sn) return { ok: false, reason: "used" }; if ((C.cash | 0) >= ECON.CLUB.TRIGGER) return { ok: false, reason: "not-needed", trigger: ECON.CLUB.TRIGGER }; return { ok: true, amount: ECON.CLUB.AMOUNT }; };
  function clubAdvance(C) {
    const o = clubOffer(C); if (!o.ok) return o; const e = econOf(C), sn = seasonOfDay(C.day);
    const r = apply(C, "club:s" + sn, ECON.CLUB.AMOUNT, "advance", "Stable club emergency advance (repaid from prize money)"); if (!r.ok) return { ok: false, reason: r.dup ? "used" : r.reason };
    e.debt += ECON.CLUB.AMOUNT; e.clubSeason = sn; return { ok: true, amount: ECON.CLUB.AMOUNT, debt: e.debt };
  }
  // half of every prize repays what the stable owes the club
  function repayFromPrize(C, prizeKey, amount) {
    const e = econOf(C); if (e.debt <= 0 || !(amount > 0)) return { ok: true, paid: 0 };
    const r = Math.min(e.debt, Math.floor(amount * ECON.CLUB.REPAY)); if (r <= 0) return { ok: true, paid: 0 };
    const t = apply(C, "repay:" + prizeKey, -r, "repay", "Stable club repayment (half of the prize)"); if (!t.ok) return { ok: true, paid: 0 };
    e.debt -= r; return { ok: true, paid: r, debt: e.debt };
  }
  // reputation grows with results; milestones pay once, ever
  function addRep(C, place, meta, official) {
    const t = (meta && meta.tier) | 0; let g = 0; if (place === 1) g = t >= 3 ? 15 : t >= 2 ? 8 : official ? 4 : 1; else if (place >= 2 && place <= 3) g = official ? 1 : 0;
    C.rep = clampN((C.rep | 0) + g, 0, 100000); return g;
  }
  function milestones(C, place, meta) {
    const got = [], t = (meta && meta.tier) | 0, wins = C.wins | 0, ok = id => ({ win1: wins >= 1, win5: wins >= 5, win10: wins >= 10, win25: wins >= 25, stakes: place === 1 && t >= 2, g1: place === 1 && t >= 3 })[id];
    for (const [id, label, amt] of ECON.MILESTONES) if (ok(id)) { const r = apply(C, "ms:" + id, amt, "bonus", "Milestone · " + label); if (r.ok) got.push({ id, label, amount: amt }); }
    return got;
  }

  // ---------------------------------------------------------------- facilities and staff (Phase 8)
  // Facilities (levels 0–3: Basic → Elite) and three staff roles. Every effect is a small, explicit, CAPPED multiplier — better facilities and staff make training more efficient and recovery
  // faster, but nothing here can lift an attribute past its potential, and the total training boost is capped (FAC_CAP), so performance can never be bought without limit.
  const FACILITIES = {
    training: { name: "Training equipment", cost: [25000, 80000, 220000], blurb: "treadmill, weights and tack: training gains +4% / +8% / +12%" },
    track: { name: "Exercise track surface", cost: [20000, 70000, 200000], blurb: "a better surface: speed and agility drills +3% / +6% / +9%, fewer jarring sessions" },
    recovery: { name: "Recovery area (walker and wash bay)", cost: [20000, 65000, 180000], blurb: "horses recover +1 / +2 / +3 fitness a day" },
    comfort: { name: "Stable comfort", cost: [15000, 50000, 150000], blurb: "calmer boxes: composure settles back +1 / +2 / +3 a day" },
    feed: { name: "Feed and tack room", cost: [15000, 45000, 120000], blurb: "quality feed costs 15% / 30% / 45% less and works slightly better" },
    gates: { name: "Starting-gate practice unit", cost: [20000, 60000, 160000], blurb: "gate training gains +10% / +20% / +30%" },
    vet: { name: "Vet bay", cost: [25000, 75000, 200000], blurb: "overtraining setbacks are rarer and shorter; recovery +0 / +1 / +1" },
  };
  const STAFFROLES = {
    trainer: { name: "Trainer", wage: [500, 1100, 2400], blurb: "runs your scheduled training: efficiency +8% / +16% / +24% on their speciality, +4% / +8% / +12% elsewhere", specs: ["speed", "stamina", "starts", "all-rounder"] },
    groom: { name: "Groom", wage: [300, 650, 1300], blurb: "brushes and feeds every horse each day for you (the small composure lift, automatically)", specs: ["calm horses", "keen horses", "all-rounder"] },
    vet: { name: "Vet", wage: [400, 900, 1800], blurb: "recovery +1 / +2 / +3 fitness a day and fewer overtraining setbacks", specs: ["general"] },
  };
  const FAC_CAP = 1.25, STAFF_NAMES = ["Sam Ridley", "Jo Marshall", "Kerry Dunn", "Mick O'Neill", "Priya Nair", "Tom Hargreaves", "Lena Cho", "Bec Walker", "Dan Pereira", "Mel Fraser", "Aroha Tane", "Hugh Barlow"];
  const facLevel = (C, k) => clampN((C.fac && C.fac[k]) | 0, 0, 3);
  const staffOf = (C, r) => (C.staff && isObj(C.staff[r])) ? C.staff[r] : null;
  // what the stable's facilities and staff give right now (all capped)
  function facEffects(C, focus) {
    const tr = staffOf(C, "trainer"), t = tr ? clampN(tr.tier | 0, 1, 3) : 0, match = tr && (tr.spec === "all-rounder" || tr.spec === focus || (tr.spec === "speed" && /^(top|acc|spr)$/.test(focus || "")) || (tr.spec === "stamina" && /^(end|rec)$/.test(focus || "")) || (tr.spec === "starts" && /^(sta|tem)$/.test(focus || "")));
    const trainer = t ? 1 + (match ? 0.08 : 0.04) * t : 1, equip = 1 + 0.04 * facLevel(C, "training") + (/^(top|acc|spr|agi)$/.test(focus || "") ? 0.03 * facLevel(C, "track") : 0) + (focus === "sta" ? 0.1 * facLevel(C, "gates") : 0);
    const vet = staffOf(C, "vet"), v = vet ? clampN(vet.tier | 0, 1, 3) : 0;
    return { train: Math.min(FAC_CAP, trainer * equip), recover: v + (facLevel(C, "vet") >= 2 ? 1 : 0), calm: facLevel(C, "comfort"), feedDiscount: 0.15 * facLevel(C, "feed"), setback: Math.max(0.2, 1 - 0.2 * v - 0.12 * facLevel(C, "vet")), groom: !!staffOf(C, "groom") };
  }
  function buyFacility(C, key) {
    if (!FACILITIES[key]) return { ok: false, reason: "unknown" }; if (!isObj(C.fac)) C.fac = {}; const lv = facLevel(C, key);
    if (lv >= 3) return { ok: false, reason: "max" }; const cost = FACILITIES[key].cost[lv];
    const r = apply(C, "fac:" + key + ":" + (lv + 1), -cost, "facility", FACILITIES[key].name + " → level " + (lv + 1));
    if (!r.ok) return { ok: false, reason: r.dup ? "owned" : r.reason === "insufficient" ? "cash" : r.reason, cost, short: r.short || 0 };
    C.fac[key] = lv + 1; return { ok: true, level: lv + 1, cost };
  }
  function hireStaff(C, role, tier, spec) {
    const R = STAFFROLES[role]; if (!R) return { ok: false, reason: "unknown" }; tier = clampN(tier | 0, 1, 3); if (!isObj(C.staff)) C.staff = {};
    if (staffOf(C, role)) return { ok: false, reason: "filled" }; if (!R.specs.includes(spec)) spec = R.specs[0];
    const n = (C.econ && C.econ.hires | 0) + 1, wage = R.wage[tier - 1], fee = wage * 2;
    const r = apply(C, "hire:" + role + ":" + n, -fee, "staff", "Hired " + R.name + " (tier " + tier + ") — recruitment fee");
    if (!r.ok) return { ok: false, reason: r.reason === "insufficient" ? "cash" : r.reason, fee, short: r.short || 0 };
    const e = econOf(C); e.hires = n; const name = STAFF_NAMES[(hashStr(C.seed + "/staff/" + role + n)) % STAFF_NAMES.length];
    C.staff[role] = { tier, spec, name, wage, hired: dayInt(C.day), look: { skin: ["#f1d2b6", "#e0b48c", "#c68e6b", "#a06a48"][hashStr(name) % 4], hair: hashStr(name + "h") % 6, hairCol: ["#15110d", "#3a2616", "#6b4423", "#a9743a", "#8d8a85"][hashStr(name + "c") % 5], shirt: ["#2e5e8a", "#8a2e2e", "#2e8a4f", "#7a5a2e"][hashStr(name + "s") % 4] } };
    return { ok: true, staff: C.staff[role], fee };
  }
  function fireStaff(C, role) { if (!staffOf(C, role)) return { ok: false, reason: "none" }; C.staff[role] = null; return { ok: true }; }
  // a groom does the daily brushing and feeding for every horse (the same once-a-day rules, so a horse that was done by hand is not done twice)
  function staffDaily(C) { if (!staffOf(C, "groom")) return 0; let n = 0; for (const h of C.horses || []) { const g = groom(C, h.id), f = feed(C, h.id, 0); if ((g.ok && !g.already) || (f.ok && !f.already)) n++; } return n; }

  // ---------------------------------------------------------------- long-term development (Phase 9)
  // Attributes grow slowly and individually: scheduled training (a weekly plan, run automatically as days pass), hands-on drills ridden on the farm (a modest extra, scaled by how well they
  // were ridden) and racing experience all feed FRACTIONAL progress; every whole point of progress becomes +1 on the attribute (never past its potential). Gains are scaled by the horse's age curve,
  // by how close it already is to its potential (diminishing returns), by its current training load, and by capped facility / staff boosts. Hard training raises LOAD and costs fitness: pushed
  // too far the horse gets sore and must rest; a tapered week before a race lets it peak. Tuned (tests/development.js) so consistent good training takes about 3–4 racing seasons to approach potential.
  const AK = ["top", "acc", "end", "spr", "rec", "tem", "agi", "sta"];
  const DEV = { BASE: 0.009, INT: [0.6, 1, 1.4], INT_FIT: [1.5, 3, 4.5], INT_LOAD: [4, 8, 13], HANDS: [0.5, 1.4], HANDS_FIT: 3, FIT_MIN: 45, LOAD_DECAY: 9, LOAD_HIGH: 60, LOAD_SORE: 80, AUTO_NOTRAINER: 0.7, RACE_XP_SCALE: 0.15, HANDS_WEEK: 4 };
  const PLANS = {
    balanced: { label: "All-round", w: { top: 1, acc: 1, end: 1, spr: 1, rec: 0.6, tem: 0.6, agi: 0.6, sta: 0.8 } }, speed: { label: "Speed", w: { top: 1.6, acc: 1.3, spr: 1.2 } }, stamina: { label: "Stamina", w: { end: 1.8, rec: 1, top: 0.4 } },
    starts: { label: "Starts and temperament", w: { sta: 1.8, tem: 1.2, acc: 0.5 } }, acc: { label: "Acceleration", w: { acc: 2, top: 0.4 } }, sprint: { label: "Sprint", w: { spr: 2, top: 0.6 } }, agility: { label: "Agility", w: { agi: 2, tem: 0.5 } }, rest: { label: "Rest", w: {} },
  };
  const DRILL_ATTR = { gate: { sta: 1, tem: 0.4 }, accel: { acc: 1, top: 0.25 }, sprint: { spr: 1, top: 0.4 }, endurance: { end: 1, rec: 0.4 }, settle: { tem: 1 }, agility: { agi: 1 } };
  function devRec(C, h) {
    if (!isObj(C.farm)) C.farm = { state: "default" }; if (!isObj(C.farm.dev)) C.farm.dev = {}; let r = C.farm.dev[h.id]; if (!isObj(r)) r = C.farm.dev[h.id] = {};
    if (!isObj(r.prog)) r.prog = {}; for (const k of AK) if (!finite(r.prog[k]) || r.prog[k] < 0 || r.prog[k] >= 1) r.prog[k] = clampN(+r.prog[k] || 0, 0, 0.999);
    if (!finite(r.load)) r.load = 0; if (!finite(r.sore)) r.sore = 0; if (!finite(r.sessDay)) r.sessDay = -1; if (!finite(r.handsDay)) r.handsDay = -1; if (!finite(r.handsWk)) r.handsWk = -1; if (!finite(r.handsN)) r.handsN = 0;
    if (typeof r.plan !== "string" || !PLANS[r.plan]) r.plan = "balanced"; if (!finite(r.int) || r.int < 1 || r.int > 3) r.int = 1; if (!Array.isArray(r.log)) r.log = []; if (!finite(r.total)) r.total = 0; if (!finite(r.sessions)) r.sessions = 0;
    return r;
  }
  const potOfH = (h, k) => (h.pot && finite(h.pot[k])) ? h.pot[k] : h.attrs[k];
  // add progress to one attribute (whole points become +1, never past the potential); returns what happened
  function addProg(C, h, k, add) {
    const r = devRec(C, h), rem = Math.max(0, potOfH(h, k) - h.attrs[k]); if (rem <= 0 || add <= 0) return { k, add: 0, points: 0 };
    let p = r.prog[k] + add, pts = 0; while (p >= 1 && h.attrs[k] < potOfH(h, k)) { p -= 1; h.attrs[k]++; pts++; } if (h.attrs[k] >= potOfH(h, k)) p = 0;
    r.prog[k] = Math.round(p * 1000) / 1000; r.total = Math.round((r.total + add) * 1000) / 1000; return { k, add: Math.round(add * 1000) / 1000, points: pts };
  }
  // one training session: `weights` {attr: w}; o = { source: "auto" | "hands", grade, int }. Returns the gains and the cost, or why nothing happened.
  function trainSession(C, h, weights, o) {
    o = o || {}; const r = devRec(C, h), d = dayInt(C.day), hands = o.source === "hands", int = clampN((o.int | 0) || r.int, 1, 3);
    if (r.sore > 0) return { ok: false, reason: "sore", days: r.sore };
    const fit = finite(h.fitness) ? h.fitness : 80; if (fit < DEV.FIT_MIN) return { ok: false, reason: "tired" };
    if (!hands && r.sessDay === d) return { ok: false, reason: "done" };
    const g = h.growth || growthProfile(h.id), age = finite(h.age) ? h.age : 4, ageF = devRate(g, age), loadF = r.load > DEV.LOAD_HIGH ? 0.55 : r.load > 40 ? 0.85 : 1;
    const srcF = hands ? DEV.HANDS[0] + (DEV.HANDS[1] - DEV.HANDS[0]) * clampN(+o.grade || 0, 0, 1) : 1, trainer = staffOf(C, "trainer"), autoF = !hands && !trainer ? DEV.AUTO_NOTRAINER : 1;
    const gains = []; let any = 0;
    for (const k of AK) { const w = weights[k]; if (!w) continue; const rem = Math.max(0, potOfH(h, k) - h.attrs[k]), headF = rem >= 10 ? 1 : Math.max(0.12, rem / 10) * (rem > 0 ? 1 : 0), fx = facEffects(C, k).train;
      const add = DEV.BASE * w * DEV.INT[int - 1] * ageF * headF * loadF * fx * srcF * autoF; const res = addProg(C, h, k, add); gains.push(res); any += res.add; }
    const cost = hands ? DEV.HANDS_FIT : DEV.INT_FIT[int - 1]; h.fitness = clampN(Math.round((fit - cost) * 10) / 10, 0, 100);
    r.load = Math.min(120, r.load + DEV.INT_LOAD[int - 1] * (hands ? 0.6 : 1)); r.sessions++; if (hands) { r.handsDay = d; r.handsN++; } else r.sessDay = d;
    let setback = false;
    if (r.load > DEV.LOAD_SORE) { const roll = hashStr(h.id + "/sore/" + d) % 100; if (roll < 35 * facEffects(C).setback) { setback = true; r.sore = 2 + (hashStr(h.id + "/s2/" + d) % 3); h.fitness = clampN(h.fitness - 4, 0, 100); } }
    r.log.push({ day: d, src: hands ? "hands" : "auto", gains: gains.filter(x => x.add > 0).map(x => [x.k, x.add]) }); if (r.log.length > 14) r.log.shift();
    return { ok: true, gains, total: Math.round(any * 1000) / 1000, cost, setback, load: r.load };
  }
  // a weekly plan runs by itself as the calendar advances (one session a day, a rest day each week, a taper before a booked race, none when sore or tired)
  function autoDay(C, day) {
    for (const h of C.horses || []) {
      const r = devRec(C, h); r.load = Math.max(0, r.load - DEV.LOAD_DECAY); if (r.sore > 0) r.sore--;
      if (r.plan === "rest" || dowOf(day) === 0 || r.sore > 0) continue; const b = C.booking; if (b && b.hid === h.id && b.day - day <= 2 && b.day >= day) continue;
      trainSession(C, h, PLANS[r.plan].w, { source: "auto", int: r.int });
    }
  }
  function setPlan(C, id, plan, int) { const h = horseOf(C, id); if (!h || !PLANS[plan]) return { ok: false }; const r = devRec(C, h); r.plan = plan; r.int = clampN(int | 0 || r.int, 1, 3); return { ok: true, plan: r.plan, int: r.int }; }
  // the state of development for the results screen / care card: per attribute progress to the next point, remaining potential, and how far along the horse is
  function devReport(C, h) {
    const r = devRec(C, h); const rows = AK.map(k => ({ k, v: h.attrs[k], pot: potOfH(h, k), prog: r.prog[k], rem: Math.max(0, potOfH(h, k) - h.attrs[k]) }));
    const start = AK.reduce((a, k) => a + (h.pot ? h.pot[k] : h.attrs[k]), 0), cur = AK.reduce((a, k) => a + h.attrs[k], 0), head = rows.reduce((a, x) => a + x.rem, 0);
    return { rows, load: Math.round(r.load), sore: r.sore, plan: r.plan, int: r.int, sessions: r.sessions, total: r.total, remaining: head, pctOfPotential: Math.round(100 * cur / Math.max(1, start)), log: r.log.slice(-7), form: peaking(C, h) ? "peaking" : r.load > DEV.LOAD_HIGH ? "overworked" : r.sore > 0 ? "sore" : "steady" };
  }
  const peaking = (C, h) => { const r = devRec(C, h); return (finite(h.fitness) ? h.fitness : 80) >= 95 && r.load <= 25 && r.sore === 0; };
  // what the horse races with today: an unfit horse loses a little speed and stamina (explained, ≤ 6 %), a well-managed one that is peaking gains a little
  function raceAttrs(C, h) {
    const a = Object.assign({}, h.attrs), pen = fitnessPenalty(finite(h.fitness) ? h.fitness : 100), pk = peaking(C, h) ? 1.02 : 1;
    for (const k of ["top", "acc", "end", "spr"]) a[k] = Math.round(a[k] * (1 - pen) * (k === "end" ? 1 : pk));
    return { attrs: a, pen, peak: pk > 1 };
  }

  // ---------- the horse market (Phase 10): rotating seeded listings, a capped bidding model, selling at a valuation, a paid custom-horse fee ----------
  // Everything here is deterministic from the career seed and the week, so the same listings appear after a reload; money moves only through apply() (idempotent keys),
  // cash can never go negative, and the five-horse maximum is enforced by every way a horse can arrive.
  const MKT = { MAX_HORSES: 5, LISTINGS: 6, ROUNDS: 3, COMMISSION: 0.10, CREATE_FEE: [0, 14000, 26000, 42000, 64000] };
  const MCATS = {
    prospect:    { label: "Young prospect", age: [2, 3], start: [0.50, 0.78], pot: [0.88, 1.0], cap: 90, starts: [0, 1], growth: "early" },
    developing:  { label: "Developing", age: [3, 4], start: [0.78, 1.0], pot: [0.78, 0.95], cap: 92, starts: [2, 8] },
    raceready:   { label: "Race-ready", age: [4, 6], start: [1.08, 1.32], pot: [0.18, 0.40], cap: 94, starts: [8, 26] },
    late:        { label: "Late bloomer", age: [3, 5], start: [0.58, 0.84], pot: [0.90, 1.0], cap: 90, starts: [1, 9], growth: "late" },
    established: { label: "Established", age: [5, 8], start: [1.45, 1.8], pot: [0.06, 0.20], cap: 96, starts: [20, 52] },
  };
  const MCAT_ORDER = ["prospect", "developing", "raceready", "late", "established"];
  const MCOATS = [["bay", "#7a4a28"], ["bay", "#4a2c1a"], ["chestnut", "#93502a"], ["chestnut", "#5e3220"], ["black", "#211915"], ["grey", "#b7b2a9"], ["brown", "#5b3a24"], ["flaxen", "#c99a52"]];
  const MFACES = ["none", "star", "stripe", "blaze", "snip", "starsnip"];
  const rateOf = a => Math.round(AK.reduce((s, k) => s + a[k], 0) / AK.length);
  const rateF = a => AK.reduce((s, k) => s + a[k], 0) / AK.length;
  const AGE_VAL = age => age <= 4 ? 1 : age === 5 ? 0.97 : age === 6 ? 0.9 : age === 7 ? 0.8 : 0.65;
  const YOUTH = age => age <= 3 ? 1 : age === 4 ? 0.6 : age === 5 ? 0.35 : 0.15;
  // what a horse is worth: ability (steeply), potential (for the young), age, record and condition
  function valueOf(h) {
    if (!h || !h.attrs) return 0;
    const r = rateF(h.attrs), pa = rateF(h.pot || h.attrs), age = finite(h.age) ? h.age : 4, H = Math.max(0, pa - r);
    let v = 3000 * Math.exp((r - 60) / 5.2) * AGE_VAL(age) + 250 * Math.pow(H, 1.3) * YOUTH(age);
    v += Math.min(30, h.wins | 0) * 700 + Math.min(40, h.places | 0) * 120;
    const fit = finite(h.fitness) ? h.fitness : 90; v *= fit >= 70 ? 1 : 0.92;
    return Math.max(1500, Math.round(v / 50) * 50);
  }
  function marketName(C, rng) {
    const taken = new Set((C.horses || []).map(h => h.name)); for (const l of (C.market && C.market.listings) || []) taken.add(l.name); for (const r of Object.values(C.rivals || {})) if (r && r.name) taken.add(r.name);
    for (const pool of [SX.PLAYER_NAMES || [], SX.HORSE_NAMES || []]) { const free = pool.filter(n => !taken.has(n)); if (free.length) return free[(rng() * free.length) | 0]; }
    for (let i = 0; i < 100; i++) { const n = "Runner " + (100 + ((rng() * 900) | 0)); if (!taken.has(n)) return n; } return "Runner " + Date.now() % 1000;
  }
  // a listing: the true horse (hidden fields stay in the save but the view hides them), priced from its value
  function marketGen(C, week, idx, cat) {
    const K = MCATS[cat], id = "m" + week + "-" + idx + cat[0], rng = rngOf(hashStr(C.seed + "/market/" + id)), pick = (a, b) => a + (b - a) * rng();
    const age = Math.round(pick(K.age[0], K.age[1])), startPts = Math.round(136 * pick(K.start[0], K.start[1])), potPts = Math.round(168 * pick(K.pot[0], K.pot[1]));
    const arche = rng(), W = {}; for (const k of AK) W[k] = 0.5 + rng();
    if (arche < 0.3) { W.top *= 1.5; W.acc *= 1.5; W.spr *= 1.5; W.end *= 0.7; } else if (arche < 0.55) { W.end *= 1.6; W.rec *= 1.5; W.tem *= 1.2; W.spr *= 0.7; } else if (arche < 0.7) { W.sta *= 1.5; W.acc *= 1.4; W.agi *= 1.3; }
    const a = {}, pot = {}; let left = startPts; const sw = AK.reduce((s, k) => s + W[k], 0);
    for (const k of AK) { const v = Math.min(K.cap - 54, Math.floor(startPts * W[k] / sw)); a[k] = 54 + v; left -= v; }
    for (let g = 0; left > 0 && g < 400; g++) { const k = AK[g % 8]; if (a[k] < K.cap) { a[k]++; left--; } }
    let pl = potPts; const pw = AK.reduce((s, k) => s + (W[k] + 0.3), 0); for (const k of AK) { const hr = Math.min(98 - a[k], Math.floor(potPts * (W[k] + 0.3) / pw)); pot[k] = a[k] + hr; pl -= hr; }
    for (let g = 0; pl > 0 && g < 400; g++) { const k = AK[(g * 3) % 8]; if (pot[k] < 98) { pot[k]++; pl--; } }
    const coat = MCOATS[(rng() * MCOATS.length) | 0], look = { type: coat[0], coat: coat[1], face: MFACES[(rng() * MFACES.length) | 0], socks: [0, 1, 2, 3].map(() => (rng() < 0.35 ? 1 + ((rng() * 3) | 0) : 0)) };
    const name = marketName(C, rng), gp = growthProfile(id);
    if (K.growth) { const b = GROWTH_BASE[K.growth]; gp.type = K.growth; gp.peak = b.peak; gp.from = Math.max(b.peak + 2, b.from); }
    const starts = Math.round(pick(K.starts[0], K.starts[1])), wr = clampN(0.04 + (rateF(a) - 60) * 0.012 + rng() * 0.06, 0, 0.5), wins = Math.round(starts * wr), places = Math.min(starts - wins, Math.round(starts * (0.12 + rng() * 0.2)));
    const h = { attrs: a, pot, age, wins, places, fitness: 74 + Math.round(rng() * 24) }, value = valueOf(h), health = rng() < 0.12 ? "tender" : "sound";
    const ask = Math.max(2000, Math.round(value * (1.08 + rng() * 0.14) / 50) * 50), reserve = Math.round(value * (0.90 + rng() * 0.10) / 50) * 50, heat = Math.round(rng() * 100) / 100;
    return { id, cat, name, age, look, attrs: a, pot, growth: gp, fitness: h.fitness, health, starts, wins, places, value, ask, reserve, heat, week, exp: week * 7 + 14 + Math.floor(rng() * 14), seen: 0,
      scout: Math.round((rng() - 0.5) * 100) / 100, bid: { round: 0, hist: [], closed: false } };
  }
  function marketSync(C) {
    if (!isObj(C.market)) C.market = { seed: hashStr(C.seed + "/market"), listings: [], refreshDay: 0 };
    const M = C.market, wk = weekOf(C.day); if (!Array.isArray(M.listings)) M.listings = [];
    if (!finite(M.wk)) { M.wk = wk - 1; }
    let guard = 0; const first = Math.max(M.wk + 1, wk - 5);
    for (let w = first; w <= wk && guard < 8; w++, guard++) {
      M.listings = M.listings.filter(l => isObj(l) && l.exp > w * 7 && !(l.bid && l.bid.closed && l.bid.closedWeek != null && w - l.bid.closedWeek >= 1) && hashStr(l.id + "/sold/" + w) % 100 >= (w === (l.week | 0) ? 0 : 14));
      const have = new Set(M.listings.map(l => l.cat));
      const want = []; for (let i = 0; i < MCAT_ORDER.length; i++) { const c = MCAT_ORDER[(i + w) % MCAT_ORDER.length]; if (!have.has(c)) { want.push(c); have.add(c); } }
      for (let i = 0; M.listings.length + want.length < MKT.LISTINGS && i < 6; i++) want.push(MCAT_ORDER[(hashStr(C.seed + "/mix/" + w + "/" + i) % MCAT_ORDER.length)]);
      let idx = 0; for (const c of want) { if (M.listings.length >= MKT.LISTINGS) break; M.listings.push(marketGen(C, w, idx++, c)); }
    }
    M.wk = wk; M.refreshDay = wk * 7; return M;
  }
  // the player's view of a listing: current ability and potential only as bands (narrower with a better trainer), the trip it suits, its temperament, record and price
  function marketView(C, L) {
    const tr = staffOf(C, "trainer"), tier = tr ? tr.tier : 0, vet = !!staffOf(C, "vet"), hw = Math.max(1, 4 - tier), ph = Math.max(2, 9 - tier * 2.2);
    const r = rateF(L.attrs), pr = rateF(L.pot), off = (L.scout || 0) * hw * 0.8, poff = (L.scout || 0) * ph * 0.7;
    const lvl = v => v >= 90 ? "Elite" : v >= 80 ? "Strong" : v >= 70 ? "Good" : v >= 60 ? "Fair" : "Raw", t = L.attrs.tem + ((hashStr(L.id + "t") % 7) - 3);
    return { id: L.id, cat: L.cat, catLabel: MCATS[L.cat].label, name: L.name, age: L.age, look: L.look, ability: [Math.round(r + off - hw), Math.round(r + off + hw)], potential: [Math.round(pr + poff - ph), Math.min(98, Math.round(pr + poff + ph))],
      bands: AK.reduce((o, k) => (o[k] = lvl(L.attrs[k] + (((hashStr(L.id + k) % 7) - 3))), o), {}), temperament: t >= 80 ? "Placid" : t >= 66 ? "Even-tempered" : t >= 52 ? "Keen" : "Fiery",
      growth: L.growth.type, record: L.starts ? L.starts + (L.starts === 1 ? " start · " : " starts · ") + L.wins + (L.wins === 1 ? " win · " : " wins · ") + L.places + (L.places === 1 ? " placing" : " placings") : "Unraced", health: vet ? (L.health === "sound" ? "Vet check: sound" : "Vet check: a tender leg — needs a few quiet days") : "Not vet-checked (hire a vet to see)",
      fitness: L.fitness, ask: L.ask, daysLeft: Math.max(0, L.exp - dayInt(C.day)), round: L.bid.round, roundsLeft: Math.max(0, MKT.ROUNDS - L.bid.round), closed: !!L.bid.closed, hist: L.bid.hist.slice(), counter: L.bid.counter || 0, scouted: tier };
  }
  const maxBoxes = o => Math.min(MKT.MAX_HORSES, o && finite(o.slots) ? o.slots : MKT.MAX_HORSES);
  // an offer: accepted at once when it clears the seller's price-to-win; a counter (the seller's real number plus a margin that shrinks each round) when it is close; rejected when it is far; three rounds, then the seller walks away
  function marketOffer(C, id, price, o) {
    marketSync(C); const L = C.market.listings.find(l => l.id === id); if (!L) return { ok: false, reason: "gone" };
    if (L.bid.closed) return { ok: false, reason: "closed" };
    if (C.horses.length >= maxBoxes(o)) return { ok: false, reason: "box" };
    price = Math.round(+price / 50) * 50; if (!finite(price) || price <= 0) return { ok: false, reason: "bad" };
    if (price > C.cash) return { ok: false, reason: "cash", price };
    const T = Math.round(L.reserve * (1 + 0.05 * L.heat) / 50) * 50; let out;
    if (price >= L.ask || price >= T) out = { outcome: "accepted", price };
    else {
      L.bid.round++; const r = L.bid.round;
      if (price >= 0.82 * T) { const c = Math.min(L.ask, Math.round(T * (1 + 0.06 * (MKT.ROUNDS - r) / 2) / 50) * 50); L.bid.counter = c; out = { outcome: "counter", counter: c, price }; L.bid.hist.push({ r, offer: price, res: "counter", counter: c }); }
      else { L.bid.counter = 0; out = { outcome: "rejected", price }; L.bid.hist.push({ r, offer: price, res: "rejected" }); }
      if (r >= MKT.ROUNDS) { L.bid.closed = true; L.bid.closedWeek = weekOf(C.day); out.walked = true; out.counter = out.outcome === "counter" ? out.counter : 0; if (out.outcome === "counter") { out.outcome = "walked"; out.finalCounter = L.bid.counter; } else out.outcome = "walked"; L.bid.counter = 0; }
    }
    out.ok = true; out.roundsLeft = Math.max(0, MKT.ROUNDS - L.bid.round); out.id = id; return out;
  }
  // buying: validated, paid through the ledger with a key unique to the listing (a double click can never charge twice), the horse arrives fit and with its record
  function marketBuy(C, id, price, o) {
    marketSync(C); const i = C.market.listings.findIndex(l => l.id === id); if (i < 0) return { ok: false, reason: "gone" };
    const L = C.market.listings[i]; price = Math.round(+price); if (!finite(price) || price <= 0) return { ok: false, reason: "bad" };
    if (C.horses.length >= maxBoxes(o)) return { ok: false, reason: "box" };
    if (applied(C, "buy:" + id)) return { ok: false, reason: "owned" };
    if (price > C.cash) return { ok: false, reason: "cash", price };
    const T = Math.round(L.reserve * (1 + 0.05 * L.heat) / 50) * 50, counterOK = L.bid.counter && price >= L.bid.counter;
    if (price < L.ask && price < T && !counterOK) return { ok: false, reason: "price" };
    if (L.bid.closed && !counterOK && price < L.ask) return { ok: false, reason: "closed" };
    const r = apply(C, "buy:" + id, -price, "horse", "Bought " + L.name); if (!r.ok) return { ok: false, reason: r.dup ? "owned" : r.reason === "insufficient" ? "cash" : (r.reason || "cash") };
    const used = new Set(C.horses.map(h => h.id)); let hid = "b" + id.replace(/[^a-z0-9]/gi, ""); while (used.has(hid)) hid += "x";
    const first = C.horses[0] || {}, h = { id: hid, name: L.name, say: "", look: Object.assign({ maneCol: "#2a1c10", tailCol: "#2a1c10", build: 0, muscle: 0, neck: 1, neckG: 1, head: 1, maneLen: 0.85, tailLen: 1 }, L.look), silk: first.silk || "#d62828", silk2: first.silk2 || "#f4f1ea", silkPat: first.silkPat || "hoops",
      attrs: Object.assign({}, L.attrs), pot: Object.assign({}, L.pot), potSet: true, born: C.season ? C.season.n : 1, xp: 0, trainPts: 0, lvl: 1, xpFrac: 0, races: L.starts, wins: L.wins, places: L.places, podiums: L.places, offRaces: 0, offWins: 0, champPts: 0, majors: 0, prize: 0, trained: 0,
      history: [], growth: Object.assign({}, L.growth), bought: { from: L.cat, price, day: dayInt(C.day) } };
    h.foaled = seasonYear(seasonOfDay(C.day)) - L.age; fillHorse(h, C, { how: "auction", price, fitness: L.health === "tender" ? 62 : Math.max(70, L.fitness) });
    C.horses.push(h); C.market.listings.splice(i, 1); if (L.health === "tender") devRec(C, h).sore = 4;
    return { ok: true, horse: h, price, cash: C.cash };
  }
  // selling: a valuation less the agent's commission, nudged ±5% by the week's market; never your last horse, never one booked into a race
  const marketMood = C => 0.95 + (hashStr(C.seed + "/mood/" + weekOf(C.day)) % 11) / 100;
  function sellQuote(C, hid) {
    const h = (C.horses || []).find(x => x.id === hid); if (!h) return { ok: false, reason: "none" };
    const value = valueOf(h), mood = marketMood(C), price = Math.max(500, Math.round(value * mood * (1 - MKT.COMMISSION) / 50) * 50);
    const why = C.horses.length <= 1 ? "last" : C.booking && C.booking.hid === hid ? "booked" : "";
    return { ok: true, value, price, commission: Math.round(value * mood * MKT.COMMISSION), mood: Math.round(mood * 100), blocked: why, rating: rateOf(h.attrs), age: h.age };
  }
  function sellHorse(C, hid) {
    const q = sellQuote(C, hid); if (!q.ok) return q; if (q.blocked) return { ok: false, reason: q.blocked };
    const i = C.horses.findIndex(x => x.id === hid), h = C.horses[i], key = "sell:" + hid + ":" + dayInt(C.day);
    if (applied(C, key)) return { ok: false, reason: "done" };
    const r = apply(C, key, q.price, "horse", "Sold " + h.name); if (!r.ok) return { ok: false, reason: r.reason || "ledger" };
    C.horses.splice(i, 1); if (C.active >= C.horses.length) C.active = C.horses.length - 1; if (C.active > i) C.active--; if (C.active < 0) C.active = 0;
    if (isObj(C.farm)) { for (const k of ["care", "dev", "turnout"]) if (isObj(C.farm[k])) delete C.farm[k][hid]; }
    C.entries = (C.entries || []).filter(e => !(e && e.hid === hid));
    return { ok: true, price: q.price, name: h.name, cash: C.cash };
  }
  // a custom horse from the creator now costs a fee that grows with the stable (the first horse of a career is free)
  const createFee = C => MKT.CREATE_FEE[Math.min(MKT.CREATE_FEE.length - 1, (C.horses || []).length)];

  return { MKT, MCATS, MCAT_ORDER, valueOf, marketSync, marketView, marketOffer, marketBuy, marketGen, sellQuote, sellHorse, createFee, ratingOf: rateOf, DEV, PLANS, DRILL_ATTR, devRec, addProg, trainSession, autoDay, setPlan, devReport, peaking, raceAttrs, FACILITIES, STAFFROLES, FAC_CAP, facLevel, staffOf, facEffects, buyFacility, hireStaff, fireStaff, staffDaily, wash, ECON, weekOf, fmtMoney, purseFace, purseLabel, entryFee, econOf, sponsorWeekly, weeklyBill, payBill, chargeWeeks, payEntry, clubOffer, clubAdvance, repayFromPrize, addRep, milestones, CARE, careRec, careStatus, readiness, groom, feed, prepare, unprepare, drillReward, restDay, V, SAVE_KEY, EPOCH_YEAR, START_CASH, LEGACY_CAP, FAC_KEYS, STAFF_KEYS, TODS, TOD_LABEL, WX_LABEL, OPT_PER_SEASON,
    cleanPlayer, parts, dateOf: day => new Date(T0 + dayInt(day) * MS), fmtDate, seasonYear, seasonLabel, seasonOfDay, seasonStartDay, seasonEndDay, dowOf, daysUntil,
    growthProfile, ageOf, ageStage, devRate, declineRate, raceFitnessCost, recoveryPerDay, fitnessPenalty, formIdx, keepHorse, fillHorse, migratedAge,
    apply, applied, audit, ledgerInit, purseOf, prizeFor, awardPrize, ordinal,
    conditions, placeSeason, syncCalendar, roundEvent, roundStatus, upcoming, nextMeeting, nextOpenRoundDay, skipsBetween,
    advance, enterRound, afterOptional, startSeason, afterRace, fresh, migrate, backup, listBackups, exportSave, parseImport, checksum };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CORE;
