'use strict';
/* =====================================================================
   FINAL FURLONG — LIVE RACE COMMENTARY: THE DIRECTOR
   A race caller who watches the whole race and tells its story, instead of announcing the leader over and over.

   Everything here only READS the race (the simulation is never changed):
     1. Race view — every 0.25 s: running order, the margin to the leader and how it is trending, the groups the field
        has split into, the pace, which horses are improving or going backwards, who is boxed in or wide, battles
        anywhere in the field, and whether a breakaway leader is coming back.
     2. Observations — each possible call (a lead change, a breakaway, the chasers, a horse improving, a battle for
        second, the pace…) is scored by significance × freshness. Memory of what has already been said (per topic, per
        horse, per margin band) keeps the caller from repeating itself unless something meaningful has changed, and
        every phrase is used at most once per race while alternatives remain.
     3. Pacing — calm and conversational mid-race (with deliberate short silences when nothing is happening),
        anticipation before the home turn, rising urgency from the 600, rapid-fire calling in a close finish. The
        excitement comes from the race data: a ten-length winner gets an emphatic, celebratory call, a desperate
        three-way finish gets a frantic one, and nothing is announced before the official result.
     4. Lines are built at the moment they are spoken from the current race; an urgent event (a late lead change, a
        fall, the finish) cuts a stale line short.
   The words come from the phrase bank in calls.js — the same phrases the ElevenLabs commentator recorded, so captions
   and audio always match. Loads as a browser script (global COMM) and as a Node module (tests/commentary.js).
   ===================================================================== */
const COMM = (() => {
  const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  const SIMG = (typeof racePhase !== "undefined") ? { racePhase, isTurn, HOME_STRAIGHT, FINAL_BEND, LEN_M } : require("./sim.js");
  const BANK = (typeof CALLS !== "undefined") ? CALLS : require("./calls.js");
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const LEN = SIMG.LEN_M;

  // ---------- words ----------
  const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const numW = n => NUM[n] || String(n);
  const DISTW = { 1000: "one thousand", 1200: "twelve hundred", 1400: "fourteen hundred", 1600: "sixteen hundred", 2000: "two thousand", 2400: "twenty-four hundred", 3200: "thirty-two hundred" };
  const distW = d => DISTW[d] || String(d);
  function lengthsW(m) {
    const L = Math.abs(m) / LEN;
    if (L < 0.1) return "a nose"; if (L < 0.22) return "a head"; if (L < 0.38) return "a neck"; if (L < 0.7) return "half a length";
    if (L < 1.25) return "a length"; if (L < 1.75) return "a length and a half"; if (L < 2.5) return "two lengths";
    const n = Math.round(L); return n <= 12 ? numW(n) + " lengths" : "a long way";
  }
  // a horse's name as the caller says it (the pronunciation override when set; symbols a voice would stumble on removed)
  function nmFull(h) { const raw = (h && h.def && (h.def.say || h.def.name)) || ""; const s = String(raw).replace(/[^\p{L}\p{N}' .\-&]/gu, " ").replace(/\s+/g, " ").trim(); return s || "number " + ((h && h.cloth) || "?"); }
  function nmShort(h) { const f = nmFull(h), w = f.split(" "); if (w.length < 3 && f.length <= 16) return f; const core = w.filter(x => !/^(the|a|an|of|de|du|la|le)$/i.test(x)); return core.slice(0, 2).join(" ") || f; }
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const NAME_PUNCT = { c: ",", x: "!", s: "!" };
  // phrases that predict the result: only used when the race is effectively decided
  const PREDICT = /catch this one|all over bar the shouting|got them all off the bit|running for the places/;

  // ---------- phrase use across races in this session (the least-recently used phrase wins a tie) ----------
  const SESSION_USE = new Map();
  let sessionN = 0;

  // ---------- the director (pure; no DOM) ----------
  class Booth {
    constructor(race, meta, speaker, opts) {
      this.race = race; this.meta = meta || {}; this.sp = speaker; this.opts = opts || {};
      this.rng = this.opts.rng || Math.random; this.log = this.opts.log || null;
      this.q = []; this.cur = null; this.nextOK = 0; this.sampleT = -1; this.lastSpokeEnd = 0;
      this.mem = new Map();            // topic key → { t, v } : when it was last said, and the value it reported
      this.used = new Map();           // phrase id → time used this race
      this.mention = new Map();        // horse → last time named
      this.said = new Set();           // every sentence said this race (none is said twice)
      this.rankHist = new Map(); this.leadHist = []; this.blockSince = new Map(); this.wideSince = new Map(); this.railSince = new Map();
      this.leader = null; this.cand = null; this.candT = 0; this.lastLeadChangeAt = -1; this.lastCalledLeader = null; this.leadNews = null;
      this.flags = {}; this.falls = []; this.fallSeen = new Set(); this.I = 1; this.done = false; this.finalPending = false; this.winCalled = false;
      this.markers = {}; this.prestige = this.meta.crown ? 2 : this.meta.major ? 1.2 : this.meta.official ? 0.6 : 0.3;
      this.ledAll = null; this.at600 = null; this.at200 = null; this.paceS = []; this.quietSince = 0;
      this.rivalry = this.meta.rivalry || {}; this.venue = this.venueKey(); this.raceKey = this.raceKeyOf();
      sessionN++;
    }
    venueKey() { const v = (this.meta.venue || "").toLowerCase(), id = this.race && this.race.trk && this.race.trk.id; return /flemington/.test(v) || id === "flemington" ? "flemington" : /randwick/.test(v) || id === "randwick" ? "randwick" : "generic"; }
    raceKeyOf() { const n = (this.meta.name || "").toLowerCase(); return /melbourne cup/.test(n) ? "cup" : /everest/.test(n) ? "everest" : this.meta.major ? "major" : null; }
    player() { const p = this.race.player; return p && (p.isPlayer || this.opts.player === p) ? p : (this.opts.player || null); }
    route() { return this.race.route || this.race.trk || {}; }

    /* ===== 1. the race view ===== */
    snapshot() {
      const r = this.race, H = r.horses;
      // a horse counts as finished only once its official time is known
      const timed = h => h.finished && !h.dnf && typeof h.finishTime === "number" && h.finishTime > 0;
      const fin = H.filter(timed).sort((a, b) => a.finishTime - b.finishTime);
      const run = H.filter(h => !timed(h) && !h.dnf && !h.fallen).sort((a, b) => b.progress - a.progress);
      const ord = fin.concat(run), L = ord[0], L2 = ord[1], L3 = ord[2];
      const pos = h => h.finished ? r.dist : h.progress;
      const rem = L ? r.dist - pos(L) : r.dist;
      const gap12 = L && L2 ? Math.max(0, pos(L) - pos(L2)) : 99, gap23 = L2 && L3 ? Math.max(0, pos(L2) - pos(L3)) : 99;
      let near = 0; if (L) for (const h of run) if (h !== L && pos(L) - h.progress < 1.5 * LEN) near++;
      const ranks = new Map(); ord.forEach((h, i) => ranks.set(h, i + 1));
      // groups: a new group starts wherever the gap to the horse in front is ≥ 1.6 lengths
      const groups = []; let g = null;
      for (let i = 0; i < run.length; i++) { const h = run[i]; if (!g || run[i - 1].progress - h.progress >= 1.6 * LEN) { g = []; groups.push(g); } g.push(h); }
      const span = run.length > 1 ? (run[0].progress - run[run.length - 1].progress) / LEN : 0, pack = run.length > 1 ? (run[0].progress - run[Math.min(7, run.length - 1)].progress) / LEN : 0;
      return { ord, run, fin, L, L2, L3, rem, gap12, gap23, gL: gap12 / LEN, near, ranks, n: H.filter(h => !h.dnf).length, pos, groups, span, pack };
    }
    stage(s) {
      const R = this.route(), hs = R.homeStraight || SIMG.HOME_STRAIGHT, fb = R.finalBend || SIMG.FINAL_BEND, D = this.race.dist;
      if (s.fin.length) return "finish";
      if (this.now - this.awayT < 5 || s.L.progress < Math.min(240, D * 0.2)) return "early";
      if (s.rem <= 230) return "final";
      if (s.rem <= hs) return "straight";
      if (!R.straightRace && s.rem <= fb + 20) return "turn";
      if (!R.straightRace && s.rem <= fb + 260 && D - fb > 500) return "near";
      return "mid";
    }
    intensity(s, st) {
      const rem = s.rem, gL = s.gL;
      let I = st === "early" ? 1.7 : st === "mid" ? 1.1 : st === "near" ? 1.8 : st === "turn" ? 2.6 : st === "straight" ? (rem > 400 ? 3.1 : 3.6) : 4.1;
      if (rem < 520 && (gL < 1 || s.near >= 2)) I += 0.7;
      if (rem < 260 && gL < 0.6) I = 5;
      if (rem < 520 && gL > 4.5) I = Math.min(I, 3.7);                 // a runaway: emphatic, not a manufactured thriller
      if (rem < 700) I += 0.12 * this.prestige;
      return clampN(I, 1, 5);
    }
    gain(h, s, secs) { const a = this.rankHist.get(h); if (!a || !a.length) return 0; const old = a.find(x => this.now - x[0] <= secs) || a[0]; return old[1] - s.ranks.get(h); }
    leadTrend(secs) { const a = this.leadHist; if (a.length < 2) return 0; const old = a.find(x => this.now - x[0] <= secs) || a[0]; return a[a.length - 1][1] - old[1]; }

    /* ===== the loop ===== */
    update(now) {
      this.now = now;
      const r = this.race; if (!r || this.done) return;
      if (r.state === "load" || r.state === "count") { this.preRace(r); this.schedule(null); return; }
      if (r.state !== "running" && r.state !== "done") return;
      if (now - this.sampleT >= 0.25) { this.sampleT = now; this.observe(this.snapshot()); }
      this.schedule(this.lastSnap);
    }
    preRace(r) {
      if (!this.flags.intro && (r.state === "load" || (r.state === "count" && r.countT > 2))) {
        this.flags.intro = true;
        this.push("intro", 5, 5, () => {
          const u = (this.raceKey && this.pickUnit("intro", { race: this.raceKey })) || (this.venue !== "generic" || this.meta.venue ? this.pickUnit("intro", { venue: this.venue }) : null) || this.pickUnit("intro", {});
          return u ? { parts: [{ u }], cat: "intro" } : null;
        });
      }
      // nothing is said in the final moments before the gates open (the rider is listening for the start)
      if (r.state === "count" && r.countT <= 0.8) { this.q = []; if (this.cur) this.cancel(); this.nextOK = Infinity; }
    }
    observe(s) {
      this.lastSnap = s;
      const r = this.race, now = this.now, L = s.L; if (!L) return;
      if (!this.flags.away) { this.flags.away = true; this.awayT = now; this.nextOK = now + 0.25; this.push("away", 9, 2, () => this.lineAway(), {}); }
      const st = this.stage(s); this.st = st; this.I = this.intensity(s, st);
      if (!this.rankT || now - this.rankT >= 0.5) {
        this.rankT = now;
        for (const [h, k] of s.ranks) { let a = this.rankHist.get(h); if (!a) this.rankHist.set(h, a = []); a.push([now, k]); while (a.length && now - a[0][0] > 14) a.shift(); }
        this.leadHist.push([now, s.gL]); while (this.leadHist.length && now - this.leadHist[0][0] > 14) this.leadHist.shift();
        for (const h of s.run) {
          if (h.blocked) { if (!this.blockSince.has(h)) this.blockSince.set(h, now); } else if (this.blockSince.has(h)) { const t0 = this.blockSince.get(h); this.blockSince.delete(h); if (now - t0 > 1.8) this.gapFound = { h, t: now }; }
          const wide = h.laneF > 4.2; if (wide) { if (!this.wideSince.has(h)) this.wideSince.set(h, now); } else this.wideSince.delete(h);
          const rail = h.laneF < 0.8; if (rail) { if (!this.railSince.has(h)) this.railSince.set(h, now); } else this.railSince.delete(h);
        }
        if (s.gL >= 3.4 && (st === "mid" || st === "near" || st === "turn" || st === "straight")) this.bigLead = { h: L, gL: s.gL, t: now };
        if (st === "mid" || st === "early") { this.paceS.push(L.v / Math.max(1, L.vmax || 17)); if (this.paceS.length > 40) this.paceS.shift(); }
        // the story so far: did the winner lead all the way, who led at the 600 and the 200, and by how much
        if (L.progress > r.dist * 0.25) this.ledAll = this.ledAll === null ? L : this.ledAll === L ? L : false;
        if (!this.at600 && s.rem <= 600) this.at600 = { h: L, gL: s.gL };
        if (!this.at200 && s.rem <= 200) this.at200 = { h: L, gL: s.gL, ranks: new Map(s.ranks) };
      }
      for (const m of [1000, 800, 600, 400, 300, 200, 100, 50]) if (!this.markers[m] && s.rem <= m && r.dist > m + 200) this.markers[m] = { t: now, said: false };
      // lead changes (debounced: a nose either way for a stride is not a lead change)
      if (!this.leader) this.leader = L;
      else if (L !== this.leader) {
        if (this.cand !== L) { this.cand = L; this.candT = now; }
        const hold = s.rem < 300 ? 0.25 : s.rem < 700 ? 0.6 : 1.5;
        if (now - this.candT >= hold && s.gap12 > 0.12 && !L.finished) {
          const old = this.leader; this.leader = L; this.cand = null; this.lastLeadChangeAt = s.rem; this.leadNews = { h: L, old, t: now }; this.mem.delete("breakaway"); this.mem.delete("margin");
          if (s.rem < 330 && s.rem > 12) this.push("lead", 9, 1.4, () => this.lineLateLead(), { interrupt: true });
        }
      } else this.cand = null;
      // falls (grouped: a pile-up is one call) — urgent
      for (const h of r.horses) if ((h.fallen || h.dnf) && !this.fallSeen.has(h)) { this.fallSeen.add(h); this.falls.push(h); this.fallAt = now; }
      if (this.falls.length && now - this.fallAt > 0.6) {
        this.fallGroup = (this.fallGroup || []).concat(this.falls.splice(0));
        this.push("fall", 8, 3, () => this.lineFall(), { interrupt: true });
      }
      if (!this.winCalled && s.fin.length) this.finish(s);
    }

    /* ===== 2. phrases ===== */
    // the best unused phrase of a topic matching the facts; tier chosen near the current excitement
    pickUnit(topic, facts, form, tierHint, filter) {
      let L = (BANK.byTopic.get(topic) || []).filter(u => (!form || u.form === form) && (!filter || filter(u)));
      if (facts) L = L.filter(u => Object.keys(facts).every(k => facts[k] == null ? u[k] == null : u[k] === facts[k]) && (facts.venue === undefined ? !u.venue : true) && (facts.race === undefined ? !u.race : true));
      if (!L.length) return null;
      const want = tierHint != null ? tierHint : this.tier();
      const score = u => (this.used.has(u.id) ? 100 + (this.now - this.used.get(u.id) < 30 ? 100 : 0) : 0) + Math.abs(u.tier - want) * 0.6 + (SESSION_USE.get(u.id) || 0) * 0.15 + this.rng() * 0.5;
      L = L.slice().sort((a, b) => score(a) - score(b));
      return L[0];
    }
    tier() { const I = this.I; return I < 1.6 ? 1 : I < 2.4 ? 2 : I < 3.3 ? 3 : I < 4.4 ? 4 : 5; }
    nameCtx() { const I = this.I; return I >= 4.4 ? "s" : I >= 3.2 ? "x" : "c"; }
    N(h, ctx) { return { h, ctx: ctx || this.nameCtx() }; }
    fresh(key, cool) { const m = this.mem.get(key); return !m || this.now - m.t >= cool; }
    memo(key, v) { this.mem.set(key, { t: this.now, v }); }
    memv(key) { const m = this.mem.get(key); return m ? m.v : undefined; }
    named(h, within) { const t = this.mention.get(h); return t != null && this.now - t < within; }

    /* ===== 3. what to say next: every candidate observation, scored ===== */
    candidates(s, st) {
      const C = [], add = (key, score, build, o) => C.push(Object.assign({ key, score, build }, o || {}));
      const L = s.L, L2 = s.L2, L3 = s.L3, now = this.now, P = this.player(), D = this.race.dist, gL = s.gL;
      const trend = this.leadTrend(8);
      const late = st === "straight" || st === "final";
      // --- the start and the early stages ---
      if (st === "early") {
        const slow = this.race.horses.find(h => h.startCat === "MISSED" && !h.dnf) || this.race.horses.find(h => h.startCat === "SLOW" && !h.dnf);
        if (!this.flags.startNote && now - this.awayT > 1) add("startNote", slow ? 6 : 3.2, () => { this.flags.startNote = true; return slow ? this.L1(slow, "start_slow", "c") : this.full("start_clean"); });
        if (!this.flags.earlyLead && L.progress > Math.min(130, D * 0.1)) add("earlyLead", 7, () => {
          this.flags.earlyLead = true; const tussle = L2 && s.gL < 0.6;
          const a = this.L1(L, "early_lead", "c", { claim: L }); if (tussle && a) a.parts.push({ pause: 0.25 }, { u: this.pickUnit("early_tussle", null, "full") });
          return a; });
        if (this.flags.earlyLead && !this.flags.settle) add("settle", 3.6, () => { this.flags.settle = true; return this.full("settle"); });
      }
      if (st === "early" || st === "finish") return C;
      // --- a lead change not yet called (earlier than the last 330 m: those are called at once) ---
      const LN = this.leadNews;
      if (LN && LN.h === L && this.lastCalledLeader !== L && now - LN.t < 6) add("leadNew", 8.5, () => { this.leadNews = null;
        const caught = this.bigLead && this.bigLead.h === LN.old && now - this.bigLead.t < 20 && gL < 1.5 && (st === "turn" || st === "near" || late);
        const line = this.L1(L, late ? "lead_new_late" : "lead_new", late || caught ? "x" : "c", { claim: L });
        if (caught && line) { this.bigLead = null; const u = this.pickUnit("caught_late", null, "full", null, x => !/hang on|close now/.test(x.text)); if (u) line.parts.unshift({ u }); }
        return line; });
      // --- distance markers (folded into the line) ---
      const mk = [1000, 800, 600, 400, 300, 200, 100, 50].filter(m => this.markers[m] && !this.markers[m].said && now - this.markers[m].t < 2.5);
      const marker = mk.length ? mk[mk.length - 1] : null;
      // --- the home turn: anticipation, then the turn ---
      if (st === "near" && !this.flags.near) add("near", 6.5, () => { this.flags.near = true; return this.full("turn_near"); });
      if (st === "turn" && !this.flags.turnOn) add("turnOn", 7.5, () => {
        this.flags.turnOn = true; const parts = [];
        const u = this.pickUnit(s.pack < 8 ? "turn_bunched" : "turn_on", null, "full") || this.pickUnit("turn_on", null, "full"); parts.push({ u });
        if (gL >= 4) parts.push({ pause: 0.2 }, this.N(L, "c"), { u: this.pickUnit("turn_clear") });
        else parts.push({ pause: 0.2 }, this.N(L, "c"), { u: this.pickUnit("turn_lead") });
        return { parts, claim: L, who: [L], cat: "turn" }; });
      if (st === "turn" && this.flags.turnOn && gL >= 4 && L2 && L.v >= L2.v - 0.3 && !this.flags.turnRunaway) add("turnRunaway", 5.5, () => { this.flags.turnRunaway = true; return this.full("turn_runaway"); });
      if (st === "straight" && !this.flags.straight || st === "final" && !this.flags.straight) add("straighten", 8.5, () => {
        this.flags.straight = true; const R = this.route();
        const u = R.straightRace ? this.pickUnit("straight_six") : (this.pickUnit("straighten", { race: this.raceKey }) && this.raceKey ? this.pickUnit("straighten", { race: this.raceKey }) : null) || (this.rng() < 0.5 && this.venue !== "generic" ? this.pickUnit("straighten", { venue: this.venue }) : null) || this.pickUnit("straighten", {});
        const parts = [{ u }]; const main = this.lateMain(s, true); if (main) parts.push({ pause: 0.06 }, ...main.parts);
        return { parts, claim: main && main.claim, who: main ? main.who : [], cat: "straight" }; });
      // --- markers ---
      if (marker && (marker <= 600 || st === "mid")) add("marker" + marker, marker <= 400 ? 7 : 4.6, () => {
        mk.forEach(m => this.markers[m].said = true);
        const close = gL < 1 || s.near >= 2;
        const u = this.pickUnit("marker", { marker, close: close && marker <= 200 ? true : null }) || this.pickUnit("marker", { marker });
        if (!u) return null; const parts = [{ u }];
        if (late || marker === 600) { const main = this.lateMain(s, false); if (main) { parts.push({ pause: 0.05 }, ...main.parts); return { parts, claim: main.claim, who: main.who, cat: marker === 200 ? "m200" : marker === 400 ? "m400" : "marker" }; } }
        return { parts, cat: "marker" }; });
      // --- the straight and the finish: called in short bursts ---
      if (late && this.flags.straight) {
        add("late", 5.6, () => this.lateMain(s, false, now - this.lastSpokeEnd >= 0.8));
        if (this.raceKey && !this.flags.crowd && this.I >= 3.6) add("crowd", 4.4, () => { this.flags.crowd = true; const u = this.pickUnit("crowd", { venue: this.venue }) || this.pickUnit("crowd", {}); return u ? { parts: [{ u }], cat: "crowd" } : null; });
        if (gL >= 4 && L2 && L3 && s.gap23 < 0.6 * LEN && this.fresh("placings", 20)) add("placings", 4.6, () => { this.memo("placings"); return this.full("placings"); });
        return C;
      }
      // --- mid-race: the story of the race ---
      const strungOut = s.span > 30 || s.groups.length >= 6, bunched = s.pack < 9 && s.run.length >= 8;
      if (st === "mid" || st === "near" || st === "turn") {
        // the running order, once (twice in long races)
        const ordN = this.flags.orderN || 0;
        if (st === "mid" && s.rem > 700 && ((ordN === 0 && L.progress > D * 0.28) || (ordN === 1 && D >= 2000 && L.progress > D * 0.62)) && s.run.length >= 5) add("order", 5.8, () => { this.flags.orderN = ordN + 1; return this.orderCall(s); });
        // the leader: a breakaway is a story, not a statistic
        const bk = this.memv("breakaway");
        if (gL >= 3.4 && !bk) add("breakaway", 7.2, () => { this.memo("breakaway", gL); this.memo("margin", Math.round(gL)); return this.rng() < 0.6 ? this.L1(L, "breakaway", "c", { claim: L }) : this.full("breakaway", { claim: L }); });
        if (bk != null && gL >= 2.5) {
          const mb = this.memv("margin"), band = this.band(gL);
          if (mb != null && Math.abs(band - mb) >= 2 && this.fresh("margin", 24)) add("margin", 4.4 + Math.min(2, Math.abs(band - mb) * 0.3), () => { this.memo("margin", band); return this.L1(L, "margin", "c", { claim: L, facts: { margin: band } }); });
          if (trend > 1.4 && this.fresh("gapGrow", 22)) add("gapGrow", 5.2, () => { this.memo("gapGrow"); return this.rng() < 0.65 ? this.full("gap_growing", { form: "full" }) : this.L1(L, "gap_growing", "c", { claim: L }); });
          if (trend < -1.4 && this.fresh("gapClose", 14)) add("gapClose", 6.2, () => { this.memo("gapClose"); const slowing = L2 && L2.v > L.v + 0.25; return slowing && this.rng() < 0.5 ? this.L1(L, "gap_closing", "c") : this.full("gap_closing", { form: "full" }); });
          if (Math.abs(trend) < 0.8 && this.fresh("chasers", 26) && now - (this.mem.get("breakaway") || {}).t > 6) add("chasers", 4.2, () => { this.memo("chasers"); return this.full(this.rng() < 0.7 ? "chasers_idle" : "breakaway", { form: "full" }); });
          if (L2 && this.fresh("chaseLead:" + L2.def.name, 22)) add("chaseLead", 5.3, () => { this.memo("chaseLead:" + L2.def.name); return this.L1(L2, "chase_lead", "c"); });
          if (L2 && L3 && s.gap23 < 0.5 * LEN && this.fresh("battle2", 24)) add("battle2", 5.6, () => { this.memo("battle2"); const parts = [{ u: this.pickUnit("battle_second") }]; if (this.rng() < 0.6) parts.push({ pause: 0.25 }, this.N(L3, "c"), { u: this.pickUnit("mover", null, "post") }); return { parts, who: [L2, L3], cat: "battle2" }; });
          if (trend < -0.6 && this.fresh("chasersGo", 30)) add("chasersGo", 4.6, () => { this.memo("chasersGo"); return this.full("chasers_go"); });
        } else if (gL < 2.5 && bk != null) this.mem.delete("breakaway");
        // the leader, the normal way: only when it hasn't been said for a while (and not while a breakaway story runs)
        if (bk == null && this.fresh("leadHold", st === "mid" ? 22 : 14) && !(this.lastCalledLeader === L && this.named(L, 18))) add("leadHold", this.lastCalledLeader === L ? 3.2 : 5.5, () => { this.memo("leadHold"); return gL >= 0.8 && gL < 2.5 && this.rng() < 0.45 ? this.L1(L, "margin", "c", { claim: L, facts: { margin: gL < 1.5 ? 1 : 2 } }) : this.L1(L, "lead_hold", "c", { claim: L }); });
        // horses on the move, under pressure, boxed in, wide, on the rail
        for (const h of s.ord.slice(1, Math.min(s.ord.length, 9))) {
          const g = this.gain(h, s, 8), closing = L && h.v - L.v;
          if ((g >= 2 || (g >= 1 && closing > 0.45)) && this.fresh("mover:" + h.def.name, 14)) add("mover", 4.6 + g * 0.5 + (h === P ? 0.8 : 0), () => { this.memo("mover:" + h.def.name); const wide = h.laneF > (L ? L.laneF + 1.6 : 4); const rail = h.laneF < 1.2;
            const u = st === "turn" ? this.pickUnit("turn_move") : this.pickMover(wide, rail); return { parts: [this.N(h, "c"), { u }], who: [h], cat: "mover" }; }, { h });
        }
        for (const h of s.run) {
          if (h === L) continue; const rk = s.ranks.get(h), drop = -this.gain(h, s, 8);
          if (rk <= 6 && (drop >= 2 || (h.S != null && h.S < 22 && h.effort > 0.85)) && this.fresh("pressure:" + h.def.name, 24) && L.progress > D * 0.35) add("pressure", 4 + (h === P ? 1 : 0) + (st === "turn" ? 0.8 : 0), () => { this.memo("pressure:" + h.def.name); return this.L1(h, st === "turn" ? "turn_pressure" : "pressure", "c"); }, { h });
          const b0 = this.blockSince.get(h);
          if (b0 != null && now - b0 > 1.5 && rk <= 8 && this.fresh("traffic:" + h.def.name, 16)) add("traffic", h === P ? 5.8 : 3.8, () => { this.memo("traffic:" + h.def.name); return this.rng() < 0.75 || h === P ? this.L1(h, "traffic", "c") : this.full("traffic", { form: "full" }); }, { h });
          const w0 = this.wideSince.get(h);
          if (w0 != null && now - w0 > 6 && rk <= 7 && st === "mid" && this.fresh("wide:" + h.def.name, 60)) add("wide", 3.4 + (h === P ? 0.8 : 0), () => { this.memo("wide:" + h.def.name); return this.L1(h, "wide", "c"); }, { h });
          const r0 = this.railSince.get(h);
          if (r0 != null && now - r0 > 6 && rk >= 2 && rk <= 5 && st === "mid" && this.fresh("rail:" + h.def.name, 70)) add("rail", 3 + (h === P ? 0.8 : 0), () => { this.memo("rail:" + h.def.name); return this.L1(h, "rail", "c"); }, { h });
          const S = h.S != null ? h.S : 60, E = h.effort != null ? h.effort : 0.6;
          if (rk >= 2 && rk <= 5 && S > 55 && E < 0.62 && st !== "turn" && L.progress > D * 0.3 && this.fresh("travel:" + h.def.name, 45) && this.fresh("travel", 16)) add("travel", 3.3 + (h === P ? 0.9 : 0), () => { this.memo("travel:" + h.def.name); this.memo("travel"); return this.L1(h, "travel", "c"); }, { h });
        }
        if (this.gapFound && now - this.gapFound.t < 2 && this.fresh("gapFound:" + this.gapFound.h.def.name, 20)) { const h = this.gapFound.h; add("gapFound", h === P ? 7 : 5, () => { this.memo("gapFound:" + h.def.name); this.gapFound = null; return this.L1(h, "gap_found", "c"); }, { h }); }
        // the player's horse: where it is, now and then, when it changes
        if (P && !P.dnf && !P.finished && P !== L) {
          const rk = s.ranks.get(P), last = this.memv("ppos");
          if (!this.named(P, 16) && (last == null || Math.abs(last - rk) >= 2 || this.fresh("ppos", 30))) add("ppos", last == null ? (L.progress > D * 0.4 ? 6.5 : 4.4) : Math.abs(last - rk) >= 2 ? 4.6 : 3.4, () => { this.memo("ppos", rk);
            const zoneU = rk >= 3 && this.rng() < 0.35 ? this.pickUnit("pos_zone", { zone: rk <= 4 ? "handy" : rk <= Math.ceil(s.n * 0.6) ? "mid" : "back" }) : null;
            return { parts: [this.N(P, "c"), { u: zoneU || this.pickUnit("pos", { rank: rk }) || this.pickUnit("pos_zone", { zone: "mid" }) }], who: [P], cat: "player" }; });
        }
        // the shape of the race (each said once, when true)
        if (st === "mid") {
          if (strungOut && !this.flags.strung && L.progress > D * 0.25) add("strung", 3.8, () => { this.flags.strung = true; return this.full("strung"); });
          if (bunched && !this.flags.bunched && L.progress > D * 0.22) add("bunched", 3.8, () => { this.flags.bunched = true; return this.full("bunched"); });
          if (!this.flags.pace && this.paceS.length >= 20 && L.progress > D * 0.3) { const p = this.paceS.reduce((a, b) => a + b, 0) / this.paceS.length;
            add("pace", 3.7, () => { this.flags.pace = true; return this.full(p > this.paceHi() ? "pace_fast" : p < this.paceLo() ? "pace_slow" : "pace_steady"); }); }
          if (D >= 1400 && !this.flags.half && L.progress >= D / 2 && L.progress < D / 2 + 120) add("half", 4.2, () => { this.flags.half = true; return this.full("halfway"); });
          if (D >= 2400 && !this.flags.long && L.progress > D * 0.2 && L.progress < D * 0.45) add("long", 3, () => { this.flags.long = true; return this.full("long_race"); });
          const last = s.run[s.run.length - 1];
          if (last && s.run.length >= 7 && !this.flags.back && L.progress > D * 0.3 && last !== P) add("back", 2.9, () => { this.flags.back = true; return this.L1(last, "back", "c"); });
        }
        // nothing worth saying for a while: a short colour line about the shape of the race (never the same twice)
        if (st === "mid") add("quiet", 1.2, () => this.rng() < 0.5 && bk != null ? this.full("chasers_idle") : this.full("quiet"));
        // on the way to and round the turn the call never stops for long: the turn's own colour, or the leader again
        if (st === "near") add("quiet", 1.2, () => this.full("turn_near"));
        if (st === "turn") add("quiet", 1.2, () => this.rng() < 0.6 ? this.full("turn_on") : this.L1(L, gL >= 4 ? "turn_clear" : "turn_lead", "c", { claim: L }));
      }
      return C;
    }
    pickMover(wide, rail) {
      const all = (BANK.byTopic.get("mover") || []).filter(u => wide ? /wide|outside/.test(u.text) || !/rail/.test(u.text) : rail ? /rail/.test(u.text) || !/wide/.test(u.text) : !/wide|rail/.test(u.text));
      const fresh = all.filter(u => !this.used.has(u.id)); const L = fresh.length ? fresh : all; return L[(this.rng() * L.length) | 0];
    }
    band(gL) { return gL >= 12 ? 14 : gL >= 9 ? 10 : gL >= 7 ? 8 : gL >= 5.5 ? 6 : gL >= 4.5 ? 5 : gL >= 3.5 ? 4 : gL >= 2.5 ? 3 : gL >= 1.5 ? 2 : 1; }
    paceHi() { return 0.86; } paceLo() { return 0.78; }
    // a name + a phrase about that horse
    L1(h, topic, ctx, o) { o = o || {}; const u = this.pickUnit(topic, o.facts || null, "post"); if (!u || !h) return null; return { parts: [this.N(h, ctx), { u }], claim: o.claim || null, who: [h], cat: topic }; }
    full(topic, o) { o = o || {}; const u = this.pickUnit(topic, o.facts || null, o.form || "full"); return u ? { parts: [{ u }], claim: o.claim || null, who: [], cat: topic } : null; }
    // the classic run through the field: "A leads from B, then C, D… and last of all Z"
    orderCall(s) {
      const o = s.run, n = o.length, P = this.player(), show = Math.min(n - 1, n <= 8 ? 4 : 5), C = t => ({ u: (BANK.byTopic.get("order") || []).find(u => u.text === t) });
      const parts = [this.N(o[0], "c"), C("leads from"), this.N(o[1], "c")];
      for (let i = 2; i <= show; i++) parts.push(i === 2 ? C("then") : i === show && show >= 4 ? C("and then") : C("followed by"), this.N(o[i], "c"));
      const pr = P ? o.indexOf(P) : -1;
      if (P && pr > show && pr < n - 1) parts.push(C("back to"), this.N(P, "c"));
      if (n > show + 2) parts.push(C("and last of all,"), this.N(o[n - 1], "c"));
      for (const h of o.slice(0, show + 1)) this.mention.set(h, this.now);
      return { parts: parts.filter(p => !("u" in p) || p.u), claim: o[0], who: [o[0]], cat: "order" };
    }
    /* the main call in the straight: what the finish actually looks like right now */
    lateMain(s, first, force) {
      const L = s.L, L2 = s.L2, L3 = s.L3, gL = s.gL, now = this.now, ctx = this.nameCtx(), P = this.player();
      if (!L) return null;
      // a horse flying from behind the leaders is the first thing a caller's eye catches
      const fly = s.run.slice(3, 10).filter(h => h.v > L.v + 1.2 && s.pos(L) - s.pos(h) < 8 * LEN).sort((a, b) => b.v - a.v)[0];
      if (fly && this.fresh("ch:" + fly.def.name, 4)) { this.memo("ch:" + fly.def.name); return { parts: [{ u: this.pickUnit("challenge", null, "pre") }, this.N(fly, ctx === "c" ? "x" : ctx)], who: [fly], cat: "challenge", claim: null }; }
      // a desperate finish: two or three locked together
      if (L2 && L3 && (s.pos(L) - s.pos(L3)) < 1.1 * LEN && this.fresh("three", 3.5)) { this.memo("three"); this.memo("battle");
        return { parts: [this.N(L, "s"), this.N(L2, "s"), this.N(L3, "s"), { u: this.pickUnit("three_way") }], who: [L, L2, L3], cat: "battle3", claim: null }; }
      if (L2 && gL < 0.55 && this.fresh("battle", 3)) { this.memo("battle");
        const and = (BANK.byTopic.get("battle") || []).find(u => u.form === "conn");
        return { parts: [this.N(L, "s"), { u: and }, this.N(L2, "s"), { u: this.pickUnit("battle", null, "full") }], who: [L, L2], cat: "battle", claim: null }; }
      // a big leader being run down: the story of the race
      const bl = this.bigLead && this.bigLead.h === L && now - this.bigLead.t < 20 ? this.bigLead : null;
      if (bl && gL < Math.max(1.6, bl.gL * 0.45) && this.fresh("caught", 6)) { this.memo("caught");
        return this.rng() < 0.5 ? this.L1(L, "caught_late", ctx === "c" ? "x" : ctx) : this.full("caught_late", { form: "full" }); }
      // a runaway: margin calls and emphatic colour, never a manufactured thriller
      if (gL >= 4) {
        if (first || this.fresh("rmargin", 5)) { const band = this.band(gL); if (this.memv("rmargin") !== band || first) { this.memo("rmargin", band); return this.L1(L, "margin_late", "x", { claim: L, facts: { margin: band } }) || this.L1(L, "runaway_late", "x", { claim: L }); } }
        if (this.fresh("runaway", force ? 0 : 2.5)) { this.memo("runaway");
          // a prediction ("nothing's going to catch this one") only once the race is effectively over
          const settled = gL >= 6 && s.rem < 200 && (!L2 || L.v >= L2.v - 0.2), safe = u => settled || !PREDICT.test(u.text);
          const fu = this.pickUnit("runaway_late", null, "full", null, safe), pu = this.pickUnit("runaway_late", null, "post", null, safe);
          return this.rng() < 0.55 && fu ? { parts: [{ u: fu }], who: [], cat: "runaway_late" } : pu ? { parts: [this.N(L, "x"), { u: pu }], claim: L, who: [L], cat: "runaway_late" } : null; }
        return null;
      }
      // a big run from behind the leading group (the midfield swooper), called as it happens
      const sw = s.run.slice(2, 10).filter(h => h.v > L.v + 0.7 && s.pos(L) - s.pos(h) < 9 * LEN && this.gain(h, s, 4) >= 1).sort((a, b) => b.v - a.v)[0];
      if (sw && this.fresh("ch:" + sw.def.name, 3.5)) { this.memo("ch:" + sw.def.name);
        return this.rng() < 0.6 ? { parts: [{ u: this.pickUnit("challenge", null, "pre") }, this.N(sw, ctx === "c" ? "x" : ctx)], who: [sw], cat: "challenge", claim: null } : this.L1(sw, "challenge", ctx === "c" ? "x" : ctx); }
      // a challenger closing
      const ch = [L2, L3].filter(Boolean).find(h => h.v > L.v + 0.25 && s.pos(L) - s.pos(h) < 3.2 * LEN) || s.run.slice(1, 6).find(h => this.gain(h, s, 5) >= 2);
      if (ch && this.fresh("ch:" + ch.def.name, 3.5)) { this.memo("ch:" + ch.def.name);
        if (this.rng() < 0.5) { const pre = this.pickUnit("challenge", null, "pre"); return { parts: [{ u: pre }, this.N(ch, ctx === "c" ? "x" : ctx)], who: [ch], cat: "challenge", claim: null }; }
        return this.L1(ch, "challenge", ctx === "c" ? "x" : ctx); }
      // the leader: fighting on, or wilting
      if (this.fresh("leadLate", force ? 0 : 3)) { this.memo("leadLate");
        const wilt = L2 && L2.v > L.v + 0.35 && gL < 2.2;
        if (gL >= 1.5 && gL < 4 && this.fresh("lm", 8)) { this.memo("lm"); const u = this.L1(L, "margin_late", ctx === "c" ? "x" : ctx, { claim: L, facts: { margin: this.band(gL) } }); if (u) return u; }
        return this.L1(L, wilt ? "lead_wilt" : "lead_fight", ctx === "c" ? "x" : ctx, { claim: L }); }
      if (P && P !== L && !this.named(P, 5) && s.ranks.get(P) <= 5 && P.v > L.v) return this.L1(P, "challenge", ctx === "c" ? "x" : ctx);
      return null;
    }
    lineAway() {
      const u = (this.raceKey === "cup" || this.raceKey === "everest") && this.rng() < 0.7 ? this.pickUnit("away", { race: this.raceKey }) : null;
      return { parts: [{ u: u || this.pickUnit("away", {}) }], cat: "away", gap: 0.5 };
    }
    lineLateLead() {
      const q = this.lastSnap, L = this.leader; if (!q || q.L !== L || this.lastCalledLeader === L) return null;
      const tight = q.gap12 < 0.5 * LEN;
      return { parts: [this.N(L, this.I >= 4.4 ? "s" : "x"), { u: this.pickUnit(tight ? "lead_new_tight" : "lead_new_late") }], claim: L, who: [L], cat: "lead" };
    }
    lineFall() {
      const F = (this.fallGroup || []).splice(0); if (!F.length) return null; const P = this.player();
      F.sort((a, b) => ((b === P) - (a === P)) || ((b.fallT || 0) - (a.fallT || 0)));
      if (F.length === 1) return this.rng() < 0.75 ? { parts: [this.N(F[0], "x"), { u: this.pickUnit("fall", null, "post") }], who: F, cat: "fall" } : { parts: [{ u: this.pickUnit("fall", null, "full") }, this.N(F[0], "x"), { u: this.pickUnit("fall", null, "post") }], who: F, cat: "fall" };
      const multi = (BANK.byTopic.get("fall") || []).find(u => /pile-up/.test(u.text));
      return { parts: [{ u: multi }].concat(F.slice(0, 3).map(h => this.N(h, "x"))), who: F, cat: "fall" };
    }

    /* ===== the finish: never names a winner before the timing has decided it ===== */
    finish(s) {
      const r = this.race, W = s.fin[0];
      if (!this.firstFinT) {
        this.firstFinT = this.now; this.finalPending = true;
        const second = s.fin[1] || s.run[0];
        // the margin AT the moment the winner crossed (the sample can come a fraction of a second later)
        const lateBy = typeof r.clock === "number" && typeof W.finishTime === "number" ? Math.max(0, r.clock - W.finishTime) : 0;
        const gapM = second ? (second.finished ? (second.finishTime - W.finishTime) * Math.max(8, second.v || 16) : r.dist - second.progress + (second.v || 0) * lateBy) : 99;
        this.winGap = gapM;
        if (gapM < 0.75) { this.photo = true; this.push("photo", 10, 2.5, () => ({ parts: [{ u: this.pickUnit("line", null, "full", 5) }], cat: "photo" }), { interrupt: true }); return; }
      }
      if (this.photo && (s.fin.length < 2 || this.now - this.firstFinT < 1.0 || this.q.some(e => e.cat === "photo") || (this.cur && this.cur.cat === "photo"))) return;
      this.winCalled = true;
      const gL = this.winGap / LEN;
      this.push("win", 10, 4, () => {
        const q = this.snapshot(), Wn = q.fin[0] || W;
        const late = (this.lastLeadChangeAt >= 0 && this.lastLeadChangeAt < 150) || (this.at200 && (this.at200.ranks.get(Wn) || 1) >= 3);
        const wire = this.ledAll === Wn && gL >= 1;
        let pre, post, after;
        if (this.photo) { pre = this.pickUnit("win_pre_photo"); post = this.pickUnit("win_photo", null, "post"); after = this.raceKey && this.raceKey !== "major" ? this.pickUnit("after_major", { race: this.raceKey }) : this.pickUnit("after_close"); }
        else if (gL >= 5) { pre = this.pickUnit("win_pre"); post = wire && this.rng() < 0.4 ? this.pickUnit("win_wire") : this.pickUnit("win_dominant"); after = this.raceKey && this.raceKey !== "major" && this.rng() < 0.5 ? this.pickUnit("after_major", { race: this.raceKey }) : this.pickUnit("after_dominant"); }
        else if (gL >= 2) { pre = this.pickUnit("win_pre"); post = wire ? this.pickUnit("win_wire") : this.pickUnit("win_clear"); after = this.pickUnit("after_clear"); }
        else { pre = this.pickUnit("win_pre"); post = late ? this.pickUnit("win_late") : this.pickUnit("win_close"); after = this.raceKey && this.raceKey !== "major" ? this.pickUnit("after_major", { race: this.raceKey }) : gL < 1 ? this.pickUnit("after_close") : null; }
        // "On the photo, it's X by a nose!" · "X has won it comfortably!" · "And the winner is X!" + a line on the win
        const parts = this.photo ? [{ u: pre }, this.N(Wn, "s"), { u: post }] : after && this.rng() < 0.4 ? [{ u: pre }, this.N(Wn, "s")] : [this.N(Wn, "s"), { u: post }];
        if (after) parts.push({ pause: 0.3 }, { u: after });
        return { parts, claim: Wn, who: [Wn], final: true, cat: "win" };
      }, { interrupt: true });
    }

    /* ===== 4. the scheduler ===== */
    push(cat, pri, ttl, make, extra) { this.q = this.q.filter(e => e.cat !== cat); this.q.push(Object.assign({ cat, pri, t: this.now, ttl, make }, extra || {})); }
    // how long the caller may stay quiet before something must be said, and how significant a call must be to break
    // a short silence, by stage
    quietRules(st) { return st === "mid" ? { max: 5.5, need: 3.9 } : st === "near" ? { max: 3, need: 3 } : st === "turn" ? { max: 2.2, need: 3 } : st === "early" ? { max: 3.5, need: 3 } : { max: 0.9, need: 2 }; }
    schedule(s) {
      const now = this.now;
      this.q = this.q.filter(e => now - e.t <= e.ttl);
      if (this.cur) {
        // a long run through the field never runs on into the straight: the business end is called live
        if (this.cur.cat === "order" && (this.st === "straight" || this.st === "final" || this.st === "turn") && now - this.cur.t0 > 0.5) this.cancel();
        else if (!this.q.length) return;
      }
      if (this.cur) {
        this.q.sort((a, b) => b.pri - a.pri || a.t - b.t);
        const top = this.q[0], spoke = now - this.cur.t0;
        const stale = this.cur.claim && s && s.L && this.cur.claim !== s.L && s.rem < 300 && !this.cur.final;
        if ((top.interrupt && top.pri >= this.cur.pri + 3 && spoke > 0.2) || (top.interrupt && stale && spoke > 0.2)) this.cancel();
        else return;
      }
      if (now < this.nextOK) return;
      let out = null, item = null;
      this.q.sort((a, b) => b.pri - a.pri || a.t - b.t);
      while (this.q.length && !out) { item = this.q.shift(); out = item.make && item.make(); if (out) out.pri = item.pri; }
      if (!out && s && this.race.state === "running" && !this.winCalled && !s.fin.length && this.st) {
        const st = this.st, rules = this.quietRules(st), silent = now - this.lastSpokeEnd;
        const C = this.candidates(s, st).sort((a, b) => b.score - a.score);
        const need = silent >= rules.max ? 0 : rules.need;
        for (const c of C) {
          if (c.score < need) break; if (c.key === "quiet" && silent < rules.max) continue;
          const o = c.build(); if (!o || !o.parts || !o.parts.length || o.parts.some(p => "u" in p && !p.u)) continue;
          if (this.said.has(this.caption(o.parts))) { this.memo(c.key + ":dup"); continue; }   // already said this race: say the next best thing instead
          out = o; out.pri = 3; out.key = c.key; break;
        }
        // a second, related observation in the same breath (mid-race only): "…, and Midnight Legend is improving out wider"
        if (out && (st === "mid") && out.parts.length <= 2 && this.rng() < 0.55) {
          const used = new Set((out.who || []).filter(Boolean)), c2 = C.find(c => c.key !== out.key && c.key !== "quiet" && c.key !== "order" && c.score >= 3.6 && (!c.h || !used.has(c.h)) && !/lead|breakaway|margin|marker/.test(c.key));
          if (c2) { const o2 = c2.build(); if (o2 && o2.parts.length <= 2 && !(o2.who || []).some(h => h && used.has(h)) && !(o2.claim && out.claim && o2.claim !== out.claim)) { out.parts.push({ pause: 0.32 }, ...o2.parts); out.who = (out.who || []).concat(o2.who || []); if (o2.claim && !out.claim) out.claim = o2.claim; } }
        }
        if (!out) { this.nextOK = now + 0.35; return; }
      }
      if (!out || !out.parts || !out.parts.length || out.parts.some(p => "u" in p && !p.u)) { if (out) this.nextOK = now + 0.3; return; }
      const text = this.caption(out.parts);
      if (this.said.has(text) && !out.final) { this.nextOK = now + 0.25; return; }
      this.said.add(text);
      const cat = out.cat || (item && item.cat) || "line";
      const I = cat === "intro" ? 1.8 : clampN(this.I + (cat === "win" || cat === "photo" ? 0.6 : 0), 1, 5);
      const cur = { text, cat, pri: out.pri || 3, claim: out.claim || null, final: !!out.final, t0: now, I };
      this.cur = cur;
      for (const p of out.parts) if (p.u) { this.used.set(p.u.id, now); SESSION_USE.set(p.u.id, (SESSION_USE.get(p.u.id) || 0) + 1); } else if (p.h) this.mention.set(p.h, now);
      if (out.claim && !out.final) this.lastCalledLeader = out.claim;
      if (out.key === "leadHold" || out.key === "earlyLead" || out.key === "leadNew") this.memo("leadHold");
      if (this.log) this.log({ t: now, text, cat, I: +I.toFixed(2), rem: s ? +s.rem.toFixed(1) : null, claim: out.claim || null, leaderNow: s ? s.L : null, final: !!out.final, key: out.key || cat, ids: out.parts.filter(p => p.u).map(p => p.u.id), st: this.st });
      const gap = out.gap != null ? out.gap : gapAfter(this.I, this.rng);
      const parts = out.parts.map(p => p.u ? { id: p.u.id, text: p.u.text, tier: p.u.tier } : p.h ? { name: nmFull(p.h), ctx: p.ctx, h: p.h } : { pause: p.pause });
      this.sp.speak(text, voiceParams(I), () => { if (this.cur === cur) { this.cur = null; this.lastSpokeEnd = this.now; this.nextOK = this.now + gap; if (cur.final) this.finalPending = false; } }, { parts, cat, I });
      if (out.final) this.done = this.winCalled;
    }
    caption(parts) {
      let t = "", prevName = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i], nx = parts[i + 1];
        if (p.pause != null) { t = t.replace(/[,\s]+$/, ""); if (!/[.!?]$/.test(t)) t += "."; t += " "; prevName = false; continue; }
        if (p.u) { let x = p.u.text; if (prevName && p.u.form === "post" && /[,!]$/.test(t)) t = t.replace(/[,!]$/, ""); t += (t && !/\s$/.test(t) ? " " : "") + x; prevName = false; continue; }
        if (p.h) { const nm = nmFull(p.h); const end = !nx || nx.pause != null; const punct = end ? (p.ctx === "c" ? "." : "!") : nx.h ? (p.ctx === "s" ? "!" : ",") : nx.u && nx.u.form === "post" ? "" : nx.u && nx.u.form === "conn" ? (nx.u.text === "leads from" ? "" : nx.u.text === "and" ? (p.ctx === "s" ? "!" : "") : ",") : NAME_PUNCT[p.ctx];
          t += (t && !/\s$/.test(t) ? " " : "") + nm + punct; prevName = true; }
      }
      t = t.replace(/\s+([,.!?])/g, "$1").replace(/,\s*,/g, ",").replace(/,\s*$/, ".").trim();
      t = t.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
      if (!/[.!?]$/.test(t)) t += this.I >= 3.4 ? "!" : ".";
      return t;
    }
    cancel() { const c = this.cur; this.cur = null; this.sp.cancel(); if (c) this.lastSpokeEnd = this.now; if (c && c.final) this.finalPending = false; }
    stop() { this.done = true; this.q = []; this.cancel(); this.finalPending = false; }
  }
  // the browser voice's pace rises with the excitement (the recorded voice carries its own delivery)
  function voiceParams(I) { return { rate: clampN(0.97 + 0.048 * (I - 1), 0.95, 1.17), pitch: clampN(1 + 0.022 * (I - 1), 1, 1.09), level: I }; }
  // the breath between lines: unhurried mid-race, almost none in a driving finish
  function gapAfter(I, rng) { const r = (rng || Math.random)(); return I < 1.6 ? 1.1 + r * 1.2 : I < 2.6 ? 0.6 + r * 0.6 : I < 3.6 ? 0.2 + r * 0.25 : 0.03 + r * 0.06; }

  // ---------- browser: settings, voice, captions, audio ducking ----------
  const SET = { on: true, vol: 0.9, voice: "", captions: true };
  let synth = null, voices = [], booth = null, capEl = null, capT = 0, primed = false;
  if (inBrowser) {
    try { const s = JSON.parse(localStorage.getItem("ff_commentary") || "null"); if (s && typeof s === "object") Object.assign(SET, { on: s.on !== false, vol: clampN(+s.vol || 0.9, 0, 1), voice: typeof s.voice === "string" ? s.voice : "", captions: s.captions !== false }); } catch (e) {}
    synth = ("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined") ? window.speechSynthesis : null;
    const load = () => { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } };
    if (synth) { load(); try { synth.addEventListener ? synth.addEventListener("voiceschanged", load) : (synth.onvoiceschanged = load); } catch (e) {} setTimeout(load, 600); setTimeout(load, 2000); }
  }
  function saveSet() { try { localStorage.setItem("ff_commentary", JSON.stringify(SET)); } catch (e) {} }
  // best voice: the player's choice, else Australian English (a male "Lee" voice first on a Mac, then "Karen"), then
  // other English voices. Enhanced / premium / natural variants are preferred when the system has them.
  function scoreVoice(v) {
    const lang = (v.lang || "").toLowerCase().replace("_", "-"), name = v.name || "";
    if (!lang.startsWith("en")) return -1;
    let s = lang === "en-au" ? 100 : lang === "en-nz" ? 70 : lang === "en-gb" ? 60 : lang === "en-ie" ? 55 : lang === "en-us" ? 40 : 30;
    if (/\b(lee)\b/i.test(name)) s += 20; else if (/\b(karen|catherine)\b/i.test(name)) s += 14;
    if (/premium|enhanced|natural|neural/i.test(name)) s += 12;
    if (/google/i.test(name)) s += 4;
    if (/(bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)/i.test(name)) s -= 80;   // novelty voices
    return s;
  }
  function englishVoices() { return voices.filter(v => scoreVoice(v) >= 0).sort((a, b) => scoreVoice(b) - scoreVoice(a)); }
  function chooseVoice() {
    if (!voices.length) return null;
    if (SET.voice) { const v = voices.find(x => x.voiceURI === SET.voice || x.name === SET.voice); if (v) return v; }
    return englishVoices()[0] || null;
  }
  const browserSpeaker = {
    cur: null, timer: null,
    speak(text, prm, onEnd) {
      showCaption(text, prm.level);
      duck(true, prm.level);
      const t0 = performance.now();
      const finish = () => {
        // an utterance that "ends" almost at once failed to speak (no voices, engine busy): keep the call's natural pace
        // so the captions and the scheduler don't race through lines
        const early = (performance.now() - t0) < est * 350;
        if (early && !finish.deferred) { finish.deferred = true; if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(finish, est * 1000 - (performance.now() - t0)); return; }
        if (this.timer) { clearTimeout(this.timer); this.timer = null; } if (this.cur === u) { this.cur = null; duck(false); } onEnd && onEnd(); onEnd = null; };
      const est = 0.8 + text.split(/\s+/).length / (2.7 * prm.rate);
      let u = null;
      if (!synth || !SET.on || SET.vol <= 0) { this.timer = setTimeout(finish, est * 1000); return; }   // captions only
      try {
        u = new SpeechSynthesisUtterance(text);
        const v = chooseVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-AU";
        u.rate = prm.rate; u.pitch = prm.pitch; u.volume = clampN(SET.vol * (0.84 + 0.04 * prm.level), 0, 1);
        u.onend = finish; u.onerror = finish;
        this.cur = u;
        // Chrome drops an utterance queued in the same tick as cancel(): give the engine a moment
        if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(() => { if (this.cur === u) synth.speak(u); }, 60); } else synth.speak(u);
        if (synth.paused) synth.resume();
      } catch (e) { u = null; }
      this.timer = setTimeout(finish, (est * 1.8 + 1.5) * 1000);        // some engines never fire onend
    },
    cancel() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.cur = null; try { if (synth) synth.cancel(); } catch (e) {} duck(false); hideCaption(); },
  };
  function duck(on, level) { try { if (typeof audio !== "undefined" && audio.commDuck) audio.commDuck(on ? 1 : 0, level || 1); } catch (e) {} }
  function showCaption(text, I) {
    if (!inBrowser || !SET.captions) return;
    if (!capEl) { capEl = document.createElement("div"); capEl.id = "commCap"; const hud = document.getElementById("hud"); (hud || document.body).appendChild(capEl);
      const st = document.createElement("style"); st.textContent = `#commCap{position:absolute;top:calc(max(10px,env(safe-area-inset-top,0px)) + 4px);left:50%;transform:translateX(-50%);max-width:min(620px,60vw);font-family:var(--font-b);font-size:13.5px;line-height:1.35;text-align:center;color:var(--fg);background:rgba(10,16,13,.62);border:1px solid var(--panel-line);border-radius:10px;padding:5px 12px;pointer-events:none;opacity:0;transition:opacity .25s}#commCap.on{opacity:1}#commCap.hot{border-color:rgba(232,195,90,.7);font-weight:600}#commCap.max{border-color:var(--accent);color:#fff2c8;font-weight:700;font-size:14.5px}#commCap::before{content:"🎙 ";opacity:.8}@media (max-width:640px){#commCap{top:auto;bottom:250px;max-width:86vw;font-size:12.5px}}`; document.head.appendChild(st); }
    capEl.textContent = text; capEl.className = "on" + (I >= 4.5 ? " max" : I >= 3.4 ? " hot" : "");
    clearTimeout(capT); capT = setTimeout(hideCaption, 4500);
  }
  function hideCaption() { if (capEl) capEl.className = ""; }

  // the enhanced (neural) voice when it is installed and ready; otherwise the browser's own voices
  function neural() { return typeof VOICE !== "undefined" ? VOICE.speaker() : null; }
  let warned = false;
  // ElevenLabs (recorded / enhanced): the player's chosen voice, built from recordings + the live engine's line plan
  function elevenSpeaker() {
    return { speak: (text, prm, onEnd, info) => { showCaption(text, prm.level); duck(true, prm.level); ELEVEN.speak(text, prm, () => { duck(false); onEnd && onEnd(); }, info); },
      cancel: () => { ELEVEN.cancel(); duck(false); hideCaption(); } };
  }
  const elevenOn = () => typeof ELEVEN !== "undefined" && ELEVEN.active();      // (still loading → caption-only until ready, never a silent fallback)
  // a name the recordings don't have, said by the local system voice (no caption: the line's caption is already up)
  let localU = null;
  function sayLocal(text, level, done) {
    if (!synth) { setTimeout(done, 300); return; }
    let fired = false; const fin = () => { if (fired) return; fired = true; clearTimeout(tm); done && done(); };
    const tm = setTimeout(fin, 2500);
    try { const u = new SpeechSynthesisUtterance(text); const v = chooseVoice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = 1.08; u.pitch = 1.04; u.volume = clampN(SET.vol, 0, 1); u.onend = fin; u.onerror = fin; localU = u; synth.speak(u); } catch (e) { fin(); }
  }
  function activeSpeaker() {
    if (elevenOn() && SET.on && SET.vol > 0) return elevenSpeaker();
    const nv = neural();
    if (!nv && typeof VOICE !== "undefined" && SET.on && !warned) { const why = VOICE.liveIssue && VOICE.liveIssue(); if (why && why !== "still measuring") { warned = true; try { toast("Enhanced voice " + why + " — using the standard voice (Settings → Voice test)", "info", 3.5); } catch (e) {} } }
    if (!nv || !SET.on || SET.vol <= 0) return browserSpeaker;
    return { speak: (text, prm, onEnd) => nv.speak(text, prm, onEnd), cancel: () => { nv.cancel(); hideCaption(); } };
  }
  // ---------- public API (browser) ----------
  function metaFor(cfg) {
    const c = cfg && cfg.career;
    if (c) return { name: c.name, venue: c.venue, major: !!c.major, crown: !!c.crown, official: !!c.official, rivalry: c.rivalry || {} };
    return { name: null, venue: cfg && cfg.track === "randwick" ? "Royal Randwick" : cfg && cfg.track === "flemington" ? "Flemington" : "Furlong Park", major: false, crown: false, official: false };
  }
  return {
    Booth, voiceParams, scoreVoice, metaFor, lengthsW, distW, nmShort, nmFull,
    get settings() { return SET; },
    set(k, v) { SET[k] = v; saveSet(); if (k === "on" && !v) this.silence(); },
    get supported() { return !!synth; },
    voiceList() { return englishVoices().map(v => ({ id: v.voiceURI || v.name, name: v.name, lang: v.lang, local: v.localService })); },
    currentVoice() { const v = chooseVoice(); return v ? v.name + " (" + v.lang + ")" : (synth ? "System default" : "Not available in this browser"); },
    // must run inside a user gesture once: some browsers only allow speech after the player has interacted
    prime() { if (primed || !synth) return; primed = true; try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } catch (e) {} },
    begin(race, cfg) { this.silence(); if (!race) return;
      if (typeof ELEVEN !== "undefined" && ELEVEN.active()) ELEVEN.prepare(race).catch(() => {});      // decode + fetch names now, not mid-race
      // the speaker is chosen per line (the recordings may finish loading, or the mode change, after the race starts)
      let curSp = null; const dyn = { speak: (t, prm, end, info) => { curSp = activeSpeaker(); curSp.speak(t, prm, end, info); }, cancel: () => { if (curSp) curSp.cancel(); } };
      booth = new Booth(race, metaFor(cfg), dyn, { log: inBrowser && window.__commLog ? (e => window.__commLog.push(Object.assign({}, e, { claim: e.claim ? e.claim.def.name : null, leaderNow: e.leaderNow ? e.leaderNow.def.name : null }))) : null }); },
    update(race) {
      if (!booth || booth.race !== race) return;
      if (!SET.on && !SET.captions) return;
      booth.update(performance.now() / 1000);
    },
    // how long the results screen should wait so the winner call isn't cut off (ms)
    holdMs() { return booth && (booth.finalPending || (booth.firstFinT && !booth.winCalled)) ? 2600 : 0; },
    silence() { if (booth) booth.stop(); booth = null; browserSpeaker.cancel(); const nv = neural(); if (nv) nv.cancel(); if (typeof ELEVEN !== "undefined") ELEVEN.cancel(); hideCaption(); },
    sayLocal, cancelLocal() { try { if (localU && synth) synth.cancel(); } catch (e) {} localU = null; },
    get engineName() { return elevenOn() && SET.on ? (ELEVEN.settings.mode === "eleven_plus" ? "ElevenLabs enhanced" : "ElevenLabs recorded") : neural() ? "Local neural voice" : SET.on ? "Local system voice" : "Off"; },
    test() { this.sample("Into the straight, and here they come! It's going to be close!", 4.2); },
    // speak one line with whatever engine is active (the voice test screen); returns timing info for neural engines
    async sample(text, level) { this.prime(); browserSpeaker.cancel(); const nv = neural(); if (nv) nv.cancel();
      if (typeof VOICE !== "undefined" && (VOICE.settings.engine === "kokoro" || VOICE.settings.engine === "piper")) { const r = await VOICE.sample(text, level); if (r) return Object.assign({ engine: VOICE.engineLabel }, r); }
      browserSpeaker.speak(text, voiceParams(level), () => {}); return { engine: "System voice: " + this.currentVoice() }; },
    _caption(text, I) { showCaption(text, I); },
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = COMM;
