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
  function purseOf(meta) {
    const n = meta && typeof meta.prize === "string" ? +meta.prize.replace(/[^0-9]/g, "") : +(meta && meta.prize);
    return finite(n) && n > 0 ? Math.round(n) : 0;
  }
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
    const rolled = seasonOfDay(to) !== seasonOfDay(from), aged = [];
    for (const h of C.horses || []) { const a = ageOf(h, to); if (a !== h.age) { if (rolled) aged.push({ name: h.name, age: a }); h.age = a; } }
    for (const h of C.horses || []) { if (h.trainDay != null && h.trainDay < to) h.trainedToday = 0; }
    return { ok: true, from, to, days: to - from, skips, rolled, aged };
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

  return { V, SAVE_KEY, EPOCH_YEAR, START_CASH, LEGACY_CAP, FAC_KEYS, STAFF_KEYS, TODS, TOD_LABEL, WX_LABEL, OPT_PER_SEASON,
    parts, dateOf: day => new Date(T0 + dayInt(day) * MS), fmtDate, seasonYear, seasonLabel, seasonOfDay, seasonStartDay, seasonEndDay, dowOf, daysUntil,
    growthProfile, ageOf, ageStage, devRate, declineRate, raceFitnessCost, recoveryPerDay, fitnessPenalty, formIdx, keepHorse, fillHorse, migratedAge,
    apply, applied, audit, ledgerInit, purseOf, prizeFor, awardPrize, ordinal,
    conditions, placeSeason, syncCalendar, roundEvent, roundStatus, upcoming, nextMeeting, nextOpenRoundDay, skipsBetween,
    advance, enterRound, afterOptional, startSeason, afterRace, fresh, migrate, backup, listBackups, exportSave, parseImport, checksum };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CORE;
