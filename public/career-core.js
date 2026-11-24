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
    SX.OPTIONAL.forEach((meta, oi) => {
      for (let k = 0; k < OPT_PER_SEASON; k++) {
        const d = satOnOrBefore(start + 20 + Math.floor((k + 0.5) * 330 / OPT_PER_SEASON) + ((oi * 11) % 21) + Math.round((rng() - 0.5) * 10)), id = "o" + n + "-" + meta.id + "-" + (k + 1);
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
    for (const h of C.horses || []) { if (finite(h.fitness)) h.fitness = Math.min(100, Math.round(h.fitness + recoveryPerDay(h, fac) * (to - from))); }
    C.day = to;
    const bills = chargeWeeks(C, from, to), nd = to - from, fx = facEffects(C);
    if (fx.recover || fx.calm) for (const h of C.horses || []) { if (fx.recover && finite(h.fitness)) h.fitness = Math.min(100, h.fitness + fx.recover * nd); if (fx.calm && finite(h.composure) && h.composure < 90) h.composure = Math.min(90, h.composure + fx.calm * nd); }
    if (fx.groom) { const keep = C.day; for (let d = 1; d <= Math.min(nd, 60); d++) { C.day = from + d; staffDaily(C); } C.day = keep; }
    const rolled = seasonOfDay(to) !== seasonOfDay(from), aged = [];
    for (const h of C.horses || []) { const a = ageOf(h, to); if (a !== h.age) { if (rolled) aged.push({ name: h.name, age: a }); h.age = a; } }
    for (const h of C.horses || []) { if (h.trainDay != null && h.trainDay < to) h.trainedToday = 0; }
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
    C.market = { seed: finite(M.seed) ? M.seed >>> 0 : hashStr(C.seed + "/market"), listings: Array.isArray(M.listings) ? M.listings.filter(isObj).slice(0, 30) : [], refreshDay: dayInt(M.refreshDay) };
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
    const room = Math.max(0, CARE.DRILL_WEEK_CAP - r.wkPts); if (room < 0.05) return { ok: true, pts: 0, reason: "week" };
    const pts = Math.round(Math.min(room, CARE.DRILL_PTS_MIN + (CARE.DRILL_PTS_MAX - CARE.DRILL_PTS_MIN) * grade) * 100) / 100;
    r.drillDay = d; r.wkPts = Math.round((r.wkPts + pts) * 100) / 100;
    h.xpFrac = (+h.xpFrac || 0) + pts; const tp = Math.floor(h.xpFrac + 1e-9); h.xpFrac = Math.round((h.xpFrac - tp) * 1000) / 1000; h.trainPts = (h.trainPts | 0) + tp;
    h.fitness = clampN((finite(h.fitness) ? h.fitness : 80) - CARE.DRILL_FITNESS_COST, 0, 100);
    return { ok: true, pts, trainPts: tp, reason: "" };
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

  return { FACILITIES, STAFFROLES, FAC_CAP, facLevel, staffOf, facEffects, buyFacility, hireStaff, fireStaff, staffDaily, wash, ECON, weekOf, fmtMoney, purseFace, purseLabel, entryFee, econOf, sponsorWeekly, weeklyBill, payBill, chargeWeeks, payEntry, clubOffer, clubAdvance, repayFromPrize, addRep, milestones, CARE, careRec, careStatus, readiness, groom, feed, prepare, unprepare, drillReward, restDay, V, SAVE_KEY, EPOCH_YEAR, START_CASH, LEGACY_CAP, FAC_KEYS, STAFF_KEYS, TODS, TOD_LABEL, WX_LABEL, OPT_PER_SEASON,
    cleanPlayer, parts, dateOf: day => new Date(T0 + dayInt(day) * MS), fmtDate, seasonYear, seasonLabel, seasonOfDay, seasonStartDay, seasonEndDay, dowOf, daysUntil,
    growthProfile, ageOf, ageStage, devRate, declineRate, raceFitnessCost, recoveryPerDay, fitnessPenalty, formIdx, keepHorse, fillHorse, migratedAge,
    apply, applied, audit, ledgerInit, purseOf, prizeFor, awardPrize, ordinal,
    conditions, placeSeason, syncCalendar, roundEvent, roundStatus, upcoming, nextMeeting, nextOpenRoundDay, skipsBetween,
    advance, enterRound, afterOptional, startSeason, afterRace, fresh, migrate, backup, listBackups, exportSave, parseImport, checksum };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CORE;
