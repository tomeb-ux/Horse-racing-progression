'use strict';
/* =====================================================================
   FINAL FURLONG — LIVE RACE COMMENTARY
   An original, energetic Australian-style race caller, spoken aloud with the browser's built-in speech synthesis.

   Three layers, all outside the simulation (the race is only ever READ, never changed):
     1. Booth   — watches the race state (single-player Race or the multiplayer snapshot view), detects real events
                  (break, leader changes, movers, traffic, wide runs, falls, markers, challenges, the finish) and
                  computes an excitement level from distance to go + how close the contest really is.
     2. Queue   — prioritised, de-duplicated, expiring lines. A line's words are generated at the moment it is spoken
                  from the CURRENT race state, so it can never describe a position that has already changed. Urgent
                  calls (a lead change in the last 300 m, a fall, the finish) interrupt a stale one.
     3. Voice   — window.speechSynthesis with the best available English voice (Australian preferred: on a Mac,
                  "Lee" or "Karen"); rate, pitch and volume rise with the excitement level. No audio files, no cloud
                  service, no API keys. If speech isn't available the game carries on (optional captions still work).
   Loads as a classic browser script (global COMM) and as a Node module (tests: tests/commentary.js).
   ===================================================================== */
const COMM = (() => {
  const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  const SIMG = (typeof racePhase !== "undefined") ? { racePhase, isTurn, HOME_STRAIGHT, FINAL_BEND, LEN_M } : require("./sim.js");
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- words ----------
  const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
  const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const ordW = n => ORD[n] || n + "th";
  const numW = n => NUM[n] || String(n);
  const DISTW = { 1000: "one thousand", 1200: "twelve hundred", 1400: "fourteen hundred", 1600: "sixteen hundred", 2000: "two thousand", 2400: "twenty-four hundred", 3200: "thirty-two hundred" };
  const distW = d => DISTW[d] || String(d);
  function lengthsW(m) {
    const L = Math.abs(m) / SIMG.LEN_M;
    if (L < 0.1) return "a nose"; if (L < 0.22) return "a head"; if (L < 0.38) return "a neck"; if (L < 0.7) return "half a length";
    if (L < 1.25) return "a length"; if (L < 1.75) return "a length and a half"; if (L < 2.5) return "two lengths";
    const n = Math.round(L); return n <= 12 ? numW(n) + " lengths" : "a long way";
  }
  // a horse's name as the caller says it: the pronunciation override when the player set one, symbols a voice would
  // stumble on removed. Long names are shortened after the first mention in a call, as real race-callers do.
  function nmFull(h) { const raw = (h && h.def && (h.def.say || h.def.name)) || ""; const s = String(raw).replace(/[^\p{L}\p{N}' .\-&]/gu, " ").replace(/\s+/g, " ").trim(); return s || "number " + ((h && h.cloth) || "?"); }
  function nmShort(h) { const f = nmFull(h), w = f.split(" "); if (w.length < 3 && f.length <= 16) return f; const core = w.filter(x => !/^(the|a|an|of|de|du|la|le)$/i.test(x)); return core.slice(0, 2).join(" ") || f; }
  const raceRef = name => /^the\s/i.test(name) ? name : "the " + name;
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  // join clauses into one flowing call: "A, B, and C" (a voice keeps one intonation line through commas)
  function flow(parts) { parts = parts.filter(Boolean); if (parts.length <= 1) return parts[0] || ""; return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1]; }

  // ---------- the booth (pure; no DOM) ----------
  // A continuous race call. Instead of firing isolated announcements, the caller keeps a running description going:
  // whenever it finishes a line it builds the next one from the CURRENT race (leader, margins, movers, traffic, the
  // rider's horse, distance markers), linking clauses the way a real caller does ("still leads", "but", "and", "back to").
  // News that happens between lines (a lead change, a horse making ground, a fall) is folded into the next line;
  // only genuinely urgent news (a fall, a lead change in the last 300 m, the finish) cuts a line short.
  class Booth {
    constructor(race, meta, speaker, opts) {
      this.race = race; this.meta = meta || {}; this.sp = speaker; this.opts = opts || {};
      this.q = []; this.cur = null; this.nextOK = 0; this.sampleT = -1;
      this.recent = []; this.catUse = {}; this.said = {}; this.mention = new Map(); this.rankHist = new Map();
      this.leader = null; this.cand = null; this.candT = 0; this.lastLeadChangeAt = -1; this.lastCalledLeader = null;
      this.flags = {}; this.falls = []; this.fallSeen = new Set(); this.news = []; this.I = 1; this.done = false; this.finalPending = false; this.winCalled = false;
      this.prestige = this.meta.crown ? 2 : this.meta.major ? 1.2 : this.meta.official ? 0.6 : 0.3;
      this.rng = this.opts.rng || Math.random; this.log = this.opts.log || null; this.markers = {};
      this.rivalry = this.meta.rivalry || {};
    }
    // ----- state -----
    snapshot() {
      const r = this.race, H = r.horses;
      const fin = H.filter(h => h.finished && !h.dnf).sort((a, b) => (a.finishTime || 0) - (b.finishTime || 0));
      const run = H.filter(h => !h.finished && !h.dnf && !h.fallen).sort((a, b) => b.progress - a.progress);
      const ord = fin.concat(run);
      const L = ord[0], L2 = ord[1], L3 = ord[2];
      const rem = L ? r.dist - L.progress : r.dist;
      const pos = h => h.finished ? r.dist : h.progress;
      const gap12 = L && L2 ? Math.max(0, pos(L) - pos(L2)) : 99;
      let near = 0; if (L) for (const h of run) if (h !== L && pos(L) - h.progress < 1.5 * SIMG.LEN_M) near++;
      const ranks = new Map(); ord.forEach((h, i) => ranks.set(h, i + 1));
      return { ord, run, fin, L, L2, L3, rem, gap12, near, ranks, n: H.filter(h => !h.dnf).length, pos };
    }
    player() { const p = this.race.player; return p && (p.isPlayer || this.opts.player === p) ? p : (this.opts.player || null); }
    intensity(s) {
      const rem = s.rem, gL = s.gap12 / SIMG.LEN_M;
      let I = rem > 800 ? 1 : rem > 600 ? 2 : rem > 400 ? 3 : rem > 200 ? 3.5 : 4;
      if (this.leaderPhase === "final bend") I = Math.max(I, 2);
      if (rem <= 450 && (gL < 1.5 || s.near >= 2)) I += 0.8;
      if (rem <= 220 && gL < 0.8) I = 5;
      if (rem <= 400 && gL > 4) I = Math.min(I, 3.2);                 // a runaway: animated, but not a manufactured thriller
      I += (rem < 600 ? 0.25 : 0) * this.prestige;
      return clampN(I, 1, 5);
    }
    pick(cat, arr) {
      const used = this.catUse[cat] || [];
      let options = arr.map((t, i) => i).filter(i => !used.includes(i));
      if (!options.length) { this.catUse[cat] = []; options = arr.map((t, i) => i); }
      const i = options[(this.rng() * options.length) | 0];
      (this.catUse[cat] = this.catUse[cat] || []).push(i); if (this.catUse[cat].length > Math.max(1, arr.length - 1)) this.catUse[cat].shift();
      return arr[i];
    }
    push(cat, pri, ttl, make, extra) {
      if (this.q.some(e => e.cat === cat)) this.q = this.q.filter(e => e.cat !== cat);
      this.q.push(Object.assign({ cat, pri, t: this.now, ttl, make }, extra || {}));
    }
    posPhrase(rank, n) {
      if (rank === 1) return "in front"; if (rank === 2) return "second"; if (rank <= 4) return "handy in " + ordW(rank); if (rank <= Math.ceil(n / 2)) return "midfield, in " + ordW(rank);
      if (rank < n - 1) return "back in " + ordW(rank); return "at the tail of the field";
    }
    laneTag(h, ref) { if (h.laneF < 1.2) return "on the rail"; if (ref && h.laneF > ref.laneF + 1.6) return "out wider"; if (h.laneF > 4.5) return "three wide"; return ""; }
    mentioned(h, within) { const t = this.mention.get(h); return t != null && this.now - t < within; }
    gain(h, s, secs) { const a = this.rankHist.get(h); if (!a || !a.length) return 0; const old = a.find(x => this.now - x[0] <= secs) || a[0]; return old[1] - s.ranks.get(h); }
    // the horse making the best run among the first `top` positions (places gained + speed on the leader)
    closer(s, top) {
      let best = null, bs = 0;
      for (const h of s.ord.slice(1, top)) { const sc = this.gain(h, s, 8) + (h.v - s.L.v) * 1.3; if (sc > bs) { bs = sc; best = h; } }
      return bs >= 1 ? best : null;
    }
    // ----- update -----
    update(now) {
      this.now = now;
      const r = this.race; if (!r || this.done) return;
      if (r.state === "load" || r.state === "count") { this.preRace(r); this.schedule(null); return; }
      if (r.state !== "running" && r.state !== "done") return;
      if (now - this.sampleT >= 0.1) { this.sampleT = now; this.detect(this.snapshot()); }
      this.schedule(this.lastSnap);
    }
    preRace(r) {
      if (!this.flags.intro && (r.state === "load" || (r.state === "count" && r.countT > 2))) {
        this.flags.intro = true;
        const m = this.meta, n = r.horses.length, venue = m.venue || "Furlong Park";
        const lines = m.major
          ? [`Welcome to ${venue} for the running of ${raceRef(m.name)}, ${numW(n)} runners over ${distW(r.dist)} metres, and they're almost ready.`,
             `It's ${m.name} day here at ${venue}, ${numW(n)} go to the gates over ${distW(r.dist)} metres.`]
          : m.name ? [`${m.name} over ${distW(r.dist)} metres here at ${venue}, ${numW(n)} runners, and they're loading up.`, `${numW(n)} runners for ${raceRef(m.name)} at ${venue}, over ${distW(r.dist)} metres.`]
          : [`${numW(n)} runners over ${distW(r.dist)} metres here at ${venue}, and they're going in.`, `Welcome to ${venue}, ${numW(n)} runners over ${distW(r.dist)} metres, and they're loading now.`];
        const text = this.pick("intro", lines);
        this.push("intro", 5, 4, () => ({ text: cap1(text) }));
      }
      // keep the start clear: nothing is said in the final moments before the gates open (the rider is listening)
      if (r.state === "count" && r.countT <= 0.8) { this.q = []; if (this.cur) this.cancel("gates"); this.nextOK = Infinity; }
    }
    detect(s) {
      this.lastSnap = s;
      const r = this.race, now = this.now, L = s.L; if (!L) return;
      if (!this.flags.away) { this.flags.away = true; this.awayT = now; this.nextOK = now + 0.3; }
      this.leaderPhase = SIMG.racePhase(L.progress, s.rem, r.dist, r.trk);
      this.I = this.intensity(s);
      if (!this.rankT || now - this.rankT >= 0.5) { this.rankT = now; for (const [h, k] of s.ranks) { let a = this.rankHist.get(h); if (!a) this.rankHist.set(h, a = []); a.push([now, k]); while (a.length && now - a[0][0] > 12) a.shift(); } }
      // distance markers crossed by the leader (folded into the next line in the straight)
      for (const m of [600, 400, 300, 200, 100, 50]) if (!this.markers[m] && s.rem <= m && r.dist > m + 150) this.markers[m] = { t: now, said: false };
      // lead changes (debounced: a nose either way for a stride isn't a lead change)
      if (!this.leader) { this.leader = L; }
      else if (L !== this.leader) {
        if (this.cand !== L) { this.cand = L; this.candT = now; }
        const hold = s.rem < 300 ? 0.25 : s.rem < 700 ? 0.6 : 1.5;
        if (now - this.candT >= hold && s.gap12 > 0.12 && !L.finished) {
          const old = this.leader; this.leader = L; this.cand = null; this.lastLeadChangeAt = s.rem;
          this.news.push({ k: "lead", h: L, old, t: now });
          if (s.rem < 320 && s.rem > 15) this.push("lead", 9, 1.4, () => {               // late lead change: called at once
            const q = this.lastSnap; if (q.L !== L) return null;
            if (this.lastCalledLeader === L) return null;
            const tight = q.gap12 < 0.5 * SIMG.LEN_M;
            return { text: this.pick("leadlate", tight ? [`${nmShort(L)} gets the nose in front!`, `${nmShort(L)} just edges ahead!`, `and now ${nmShort(L)} has got there!`] : [`${nmShort(L)} hits the front!`, `${nmShort(L)} sweeps to the lead!`, `and ${nmShort(L)} has taken over!`]), claim: L, who: [L] };
          }, { interrupt: true });
        }
      } else this.cand = null;
      // movers and traffic become news for the next line
      if (now - (this.newsT || 0) > 1) {
        this.newsT = now;
        for (const h of s.ord.slice(1, 8)) if (this.gain(h, s, 8) >= 3 && !this.news.some(n => n.h === h) && !this.mentioned(h, 10)) this.news.push({ k: "mover", h, t: now });
        const P = this.player(); if (P && P.blocked && (P.blockedTime || 0) > 1 && s.rem > 120 && !this.recentNews("trap", 12)) this.news.push({ k: "trap", h: P, t: now });
        this.news = this.news.filter(n => now - n.t < 7);
      }
      // falls (grouped: a pile-up is one call, and it cuts in)
      for (const h of r.horses) if ((h.fallen || h.dnf) && !this.fallSeen.has(h)) { this.fallSeen.add(h); this.falls.push(h); this.fallAt = now; }
      if (this.falls.length && now - this.fallAt > 0.6) {
        this.fallGroup = (this.fallGroup || []).concat(this.falls.splice(0)); const Pp = this.player();
        this.push("fall", 8, 3, () => {
          const F = (this.fallGroup || []).splice(0); if (!F.length) return null;
          F.sort((a, b) => ((b === Pp) - (a === Pp)) || ((b.fallT || 0) - (a.fallT || 0)));
          if (F.length === 1) return { text: this.pick("fall", F[0] === Pp ? [`Oh no, ${nmFull(F[0])} has gone down!`, `${nmFull(F[0])} has fallen!`] : [`Oh, there's a fall, ${nmFull(F[0])} is down!`, `${nmFull(F[0])} has gone down!`]), who: F };
          const names = F.slice(0, 3).map(nmFull);
          return { text: F.length > 3 ? `There's a big fall, ${names.join(", ")}, and ${numW(F.length - 3)} more are down!` : `There's a fall, ${names.length === 2 ? names.join(" and ") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]} are down!`, who: F };
        }, { interrupt: true });
      }
      if (!this.winCalled && s.fin.length) this.finish(s);
    }
    recentNews(k, within) { return this.said["n_" + k] != null && this.now - this.said["n_" + k] < within; }
    takeNews(k, filter) { const i = this.news.findIndex(n => n.k === k && (!filter || filter(n))); if (i < 0) return null; const n = this.news.splice(i, 1)[0]; this.said["n_" + k] = this.now; return n; }
    stage(s) {
      if (this.now - this.awayT < 6 || s.L.progress < Math.min(220, this.race.dist * 0.18)) return "early";
      if (s.rem <= 250) return "final";
      const hs = (this.race.trk && this.race.trk.homeStraight) || SIMG.HOME_STRAIGHT;
      if (s.rem <= hs) return "straight";
      if (this.leaderPhase === "final bend" || s.rem <= hs + 160) return "turn";
      return "mid";
    }
    // ----- composing the next line of the call -----
    leaderClause(s, style) {
      const L = s.L, same = this.lastCalledLeader === L, g = s.gap12, m = lengthsW(g);
      const lead = this.news.find(n => n.k === "lead" && n.h === L);
      if (lead) { this.takeNews("lead"); return this.pick("lc_new", [`${nmFull(L)} has taken over in front`, `${nmFull(L)} now leads`, `${nmFull(L)} goes to the lead`]); }
      if (g > 4 * SIMG.LEN_M) return this.pick("lc_clear", [`${nmShort(L)} is ${m} clear`, `${nmShort(L)} has kicked ${m} clear`]);
      if (style === "order") return same ? `${nmShort(L)} still leads by ${m}` : `${nmFull(L)} leads by ${m}`;
      if (same) return this.pick("lc_same", [`${nmShort(L)} still leads`, `${nmShort(L)} still in front`, `${nmShort(L)} holds the lead`, `it's still ${nmShort(L)}`]);
      return this.pick("lc", [`${nmFull(L)} leads`, `${nmFull(L)} takes them along`, `${nmFull(L)} is in front`]);
    }
    playerClause(s, quick) {
      const P = this.player(); if (!P || P.dnf || P.finished || this.mentioned(P, quick ? 6 : 12)) return null;
      const rk = s.ranks.get(P); if (!rk || rk === 1) return null;
      const trap = this.takeNews("trap", n => n.h === P);
      if (trap) return this.pick("ptrap", P.laneF < 1.6 ? [`${nmShort(P)} is pocketed on the rail`, `there's no room for ${nmShort(P)} along the inside`] : [`${nmShort(P)} is looking for a run`, `${nmShort(P)} is held up behind runners`]);
      const tired = (P.S != null && P.S < 28) || (P.F != null && P.F > 48), easy = (P.S == null || P.S > 50) && (P.F == null || P.F < 25);
      if (quick) return P.v > s.L.v + 0.4 ? `${nmShort(P)} is flying home` : `${nmShort(P)} is ${ordW(rk)}`;
      return tired ? this.pick("ptired", [`${nmShort(P)} is under pressure ${this.posPhrase(rk, s.n)}`, `${nmShort(P)} is being pushed along ${this.posPhrase(rk, s.n)}`])
        : easy ? this.pick("peasy", [`${nmShort(P)} is travelling nicely ${this.posPhrase(rk, s.n)}`, `${nmShort(P)} is going easily ${this.posPhrase(rk, s.n)}`, `${nmShort(P)} is nicely placed ${this.posPhrase(rk, s.n)}`])
        : this.pick("pmid", [`${nmShort(P)} is ${this.posPhrase(rk, s.n)}`, `back to ${nmShort(P)}, ${this.posPhrase(rk, s.n)}`]);
    }
    moverClause(s) {
      const mv = this.takeNews("mover", n => !n.h.dnf && !n.h.finished && s.ranks.get(n.h) > 1); if (!mv) return null;
      const h = mv.h, tag = this.laneTag(h, s.L);
      return this.pick("mover", [`${nmShort(h)} is improving ${tag || "through the field"}`, `${nmShort(h)} is starting to make ground${tag ? " " + tag : ""}`, `${nmShort(h)} moves up ${tag || "into it"}`]);
    }
    // the classic call through the field, leader to last, in one breath
    orderCall(s) {
      const o = s.ord.filter(h => !h.finished), n = o.length, P = this.player(), parts = [this.leaderClause(s, "order")];
      let i = 1;
      const show = Math.min(n - 1, n <= 8 ? 5 : 4);
      while (i <= show) {
        const h = o[i], nx = o[i + 1], tag = this.laneTag(h, o[0]);
        if (nx && i + 1 <= show && Math.abs(h.progress - nx.progress) < 0.6 * SIMG.LEN_M) { parts.push(`${i === 1 ? "then " : ""}${nmShort(h)} and ${nmShort(nx)} together`); i += 2; continue; }
        parts.push(i === 1 ? `${nmShort(h)} ${tag || "second"}` : `${nmShort(h)}${tag ? " " + tag : ""}`); i++;
      }
      const pr = P ? o.indexOf(P) : -1;
      if (P && pr > show && pr < n - 1) parts.push(`back to ${nmShort(P)} in ${ordW(pr + 1)}`);
      if (n > show + 2) parts.push(`and last of all it's ${nmShort(o[n - 1])}`);
      for (const h of o.slice(0, show + 1).concat(P ? [P] : [])) this.mention.set(h, this.now);
      return parts.slice(0, -1).join(", ") + (parts.length > 1 ? ", " : "") + parts[parts.length - 1].replace(/^and /, n > show + 2 ? "and " : "");
    }
    markerPhrase(s) {
      const ms = [600, 400, 300, 200, 100, 50].filter(m => this.markers[m] && !this.markers[m].said);
      if (!ms.length) return null;
      const m = ms[ms.length - 1]; ms.forEach(x => this.markers[x].said = true);
      if (this.now - this.markers[m].t > 2.5) return null;          // too late to mention it
      return { 600: "six hundred to go", 400: "four hundred to go", 300: "three hundred metres out", 200: "two hundred to go", 100: "a hundred to go", 50: "fifty metres" }[m];
    }
    rivalryClause(s) {
      if (this.flags.rivalry) return null;
      const P = this.player(); if (!P || !this.rivalry) return null;
      const top = s.ord.slice(0, 3); if (!top.includes(P)) return null;
      const rv = top.find(h => h !== P && this.rivalry[h.def.name]); if (!rv) return null;
      const R = this.rivalry[rv.def.name]; this.flags.rivalry = true;
      return R.n >= 3 ? `${nmShort(P)} and ${nmShort(rv)} have met ${numW(Math.min(12, R.n))} times before` : `${nmShort(P)} and ${nmShort(rv)} meet again`;
    }
    nextLine(s) {
      const st = this.stage(s), now = this.now, m = this.meta, D = this.race.dist, P = this.player();
      if (st === "early") {
        if (!this.flags.awayCall) {
          this.flags.awayCall = true;
          const slow = this.race.horses.find(h => (h.startCat === "MISSED") && !h.dnf) || this.race.horses.find(h => h.startCat === "SLOW" && !h.dnf);
          const jump = m.major ? this.pick("away", [`And they're away in ${raceRef(m.name)}`, `${m.name} is underway`]) : this.pick("away", [`And they're away`, `They jump`, `And they're off and racing`]);
          return { text: flow([jump, slow ? `${nmShort(slow)} ${slow.startCat === "MISSED" ? "missed the kick" : "was slow to begin"}` : null]) + "!", who: slow ? [slow] : [], cat: "away", gap: 0.4 };
        }
        if (!this.flags.early && s.L.progress > Math.min(150, D * 0.12)) {
          this.flags.early = true;
          const B = s.L2, rel = B && (B.laneF > s.L.laneF + 0.7 ? "on its outside" : B.laneF < s.L.laneF - 0.7 ? "on the inside" : "right behind");
          const sw = this.pick("early", [`${nmFull(s.L)} is quickest to find the front`, `${nmFull(s.L)} goes straight to the lead`, `${nmFull(s.L)} begins best and leads`]);
          this.lastCalledLeader = s.L;
          return { text: flow([sw, B ? `${nmShort(B)} ${rel}` : null, this.playerClause(s)]) + ".", claim: s.L, who: [s.L, B], cat: "early", gap: 1.0 };
        }
        return null;
      }
      if (st === "mid") {
        const last = this.said.order;
        if (!this.flags.order1 || (now - (last || 0) > 26 && D >= 2000 && s.rem > 900)) {
          this.flags.order1 = true; this.said.order = now; this.lastCalledLeader = s.L;
          return { text: cap1(this.orderCall(s)) + ".", claim: s.L, who: [s.L], cat: "order", gap: 1.6 };
        }
        const parts = [this.leaderClause(s), this.moverClause(s), this.playerClause(s)];
        if (parts.filter(Boolean).length < 2 && !this.flags.bunch && s.run.length >= 6 && s.L.progress - s.ord[Math.min(7, s.ord.length - 1)].progress < 11) { this.flags.bunch = true; parts.push("they're well bunched up"); }
        if (parts.filter(Boolean).length < 2 && s.L2) parts.push(`${nmShort(s.L2)} ${this.laneTag(s.L2, s.L) || "second"}`);
        this.lastCalledLeader = s.L;
        if (D >= 1400 && !this.flags.half && s.L.progress >= D / 2) { this.flags.half = true; parts.unshift("past halfway"); }
        return { text: cap1(flow(parts)) + ".", claim: s.L, who: [s.L, s.L2, P], cat: "mid", gap: this.I < 1.6 ? 2.2 + this.rng() * 1.6 : 1.2 };
      }
      if (st === "turn") {
        const first = !this.flags.turn; this.flags.turn = true;
        const c = this.closer(s, 8), venue = m.venue ? m.venue.replace(/^Royal /, "") : null;
        const open = first ? this.pick("turn", [`Coming to the turn${venue && m.major ? " at " + venue : ""}`, `They're approaching the home turn`, `Down to the home turn now`]) : this.markerPhrase(s);
        const parts = [open, this.leaderClause(s), c && c !== s.L ? this.pick("tc", [`${nmShort(c)} is winding up ${this.laneTag(c, s.L) || "behind them"}`, `${nmShort(c)} is starting to make a move`, `here comes ${nmShort(c)} ${this.laneTag(c, s.L) || ""}`.trim()]) : this.moverClause(s), this.playerClause(s, true)];
        this.lastCalledLeader = s.L; if (c) this.mention.set(c, now);
        return { text: cap1(flow(parts.slice(0, 3).concat(parts[3] && parts.filter(Boolean).length < 4 ? [parts[3]] : []))) + (this.I >= 3 ? "!" : "."), claim: s.L, who: [s.L, c, P], cat: first ? "turn" : "turn2", gap: this.I < 2.6 ? 0.9 : 0.35 };
      }
      // the straight and the finish: short linked bursts, one straight after another
      const mk = this.markerPhrase(s), gL = s.gap12 / SIMG.LEN_M, A = s.L, B = s.L2;
      const parts = [];
      if (!this.flags.straight) {
        this.flags.straight = true;
        parts.push(m.major ? `They're turning for home in ${raceRef(m.name)}` : this.pick("str0", [`They straighten for home`, `Into the straight`, `They turn for home`]));
      } else if (mk) parts.push(mk);
      const prevLead = this.lastCalledLeader;
      if (gL > 4) parts.push(this.pick("sclear", [`${nmShort(A)} has a break on them`, `${nmShort(A)} is ${lengthsW(s.gap12)} clear`, `${nmShort(A)} is running right away from them`]));
      else if (B && gL < 0.4) parts.push(this.pick("slocked", [`${nmShort(A)} and ${nmShort(B)} locked together`, `${nmShort(A)} and ${nmShort(B)}, nothing between them`, `${nmShort(A)} and ${nmShort(B)} side by side`]));
      else parts.push(prevLead === A ? this.pick("sstill", [`${nmShort(A)} still holds them`, `${nmShort(A)} still in front`, `${nmShort(A)} hanging on`]) : `${nmShort(A)} in front`);
      if (B && gL >= 0.4 && gL <= 4) {
        const closing = B.v - A.v;
        parts.push(closing > 0.25 ? this.pick("schase", [`${nmShort(B)} is coming at it`, `${nmShort(B)} charging after it`, `here comes ${nmShort(B)}`]) : closing < -0.25 ? `${nmShort(B)} can't close the gap` : `${nmShort(B)} chasing`);
      }
      if (s.near >= 2 && gL < 1.5) parts.push(`${numW(s.near + 1)} of them across the track`);
      else { const c = this.closer(s, 6); if (c && c !== A && c !== B && !this.mentioned(c, 4)) parts.push(`${nmShort(c)} ${this.laneTag(c, A) || "finishing strongly"}`); }
      const rv = this.rivalryClause(s); if (rv) parts.push(rv);
      if (parts.length < 3 && st !== "final") { const pc = this.playerClause(s, true); if (pc) parts.push(pc); }
      this.lastCalledLeader = A;
      const short = st === "final" ? parts.slice(0, 3) : parts.slice(0, 4);
      const cat = mk === "two hundred to go" ? "m200" : mk === "four hundred to go" ? "m400" : st === "final" ? "final" : "straight";
      return { text: cap1(flow(short)) + (this.I >= 3.4 ? "!" : "."), claim: A, who: [A, B], cat, gap: this.I >= 4.4 ? 0.04 : this.I >= 3.4 ? 0.15 : 0.45 };
    }
    // the finish: never names a winner before the timing has decided it
    finish(s) {
      const r = this.race, W = s.fin[0], m = this.meta;
      if (!this.firstFinT) {
        this.firstFinT = this.now; this.finalPending = true;
        const second = s.fin[1] || s.run[0];
        const gapM = second ? (second.finished ? (second.finishTime - W.finishTime) * Math.max(8, W.v || 16) : r.dist - second.progress) : 99;
        this.winGap = gapM;
        if (gapM < 0.75) {
          this.photo = true;
          this.push("photo", 10, 2.5, () => ({ text: this.pick("photo", [`They hit the line together, it's a photo!`, `Locked together on the line, it's a photo finish!`]) }), { interrupt: true });
          return;
        }
      }
      if (this.photo && (s.fin.length < 2 || this.now - this.firstFinT < 1.0 || this.q.some(e => e.cat === "photo") || (this.cur && this.cur.cat === "photo"))) return;
      this.winCalled = true;
      const late = this.lastLeadChangeAt >= 0 && this.lastLeadChangeAt < 160, gL = this.winGap / SIMG.LEN_M, what = m.name ? raceRef(m.name) : null;
      this.push("win", 10, 4, () => {
        const q = this.snapshot(), Wn = q.fin[0] || W, nm = nmFull(Wn);
        let t;
        if (this.photo) t = this.pick("winp", what ? [`And on the photo, ${nm} has won ${what}!`, `${nm} gets the photo, ${nm} wins ${what}!`] : [`And on the photo, it's ${nm}!`, `${nm} gets the verdict!`]);
        else if (gL > 4) t = what && m.major ? `${nm}, and it's a dominant win in ${what}!` : this.pick("wind", [`${nm} wins it easily!`, `${nm}, ${lengthsW(this.winGap)} clear at the line!`]);
        else if (late) t = this.pick("winl", [`${nm} gets there in the final strides!`, `${nm} swoops late${what ? " to win " + what : ""}!`]);
        else if (gL < 1.5) t = this.pick("winc", [`${nm} just holds on${what ? " to win " + what : ""}!`, `${nm} by ${lengthsW(this.winGap)}!`]);
        else t = what ? this.pick("winm", [`And ${nm} wins ${what}!`, `${nm} has won ${what}!`]) : this.pick("win", [`And ${nm} wins!`, `${nm} is the winner!`]);
        if (m.major && (this.photo || gL < 1)) t += ` What a finish to ${what}!`;
        return { text: t, claim: Wn, who: [Wn], final: true };
      }, { interrupt: true });
    }
    // ----- the scheduler -----
    schedule(s) {
      const now = this.now;
      this.q = this.q.filter(e => now - e.t <= e.ttl);
      if (this.cur) {
        if (!this.q.length) return;
        this.q.sort((a, b) => b.pri - a.pri || a.t - b.t);
        const top = this.q[0], spoke = now - this.cur.t0;
        const stale = this.cur.claim && s && s.L && this.cur.claim !== s.L && s.rem < 300 && !this.cur.final;
        // only urgent news cuts in: a fall, a late lead change (or a line that has just gone stale), the finish
        if ((top.interrupt && top.pri >= this.cur.pri + 3 && spoke > 0.2) || (top.interrupt && stale && spoke > 0.2)) this.cancel("interrupt");
        else return;
      }
      if (now < this.nextOK) return;
      let item = null, out = null;
      this.q.sort((a, b) => b.pri - a.pri || a.t - b.t);
      while (this.q.length && !out) { item = this.q.shift(); out = item.make && item.make(); }
      if (!out && s && this.race.state === "running" && !this.winCalled && !s.fin.length) { out = this.nextLine(s); item = out ? { cat: out.cat, pri: 3 } : null; }
      if (!out || !out.text) return;
      out.text = out.text.replace(/\s+([,.!])/g, "$1").replace(/,\s*,/g, ",").replace(/(^|[.!?]\s+)([a-z])/g, (mm, a, b) => a + b.toUpperCase());
      if (this.recent.includes(out.text)) { this.nextOK = now + 0.3; return; }
      this.recent.push(out.text); if (this.recent.length > 14) this.recent.shift();
      const cat = out.cat || item.cat;
      const I = cat === "intro" ? 1.6 : clampN(this.I + (cat === "win" || cat === "photo" ? 0.6 : 0), 1, 5);
      const cur = { text: out.text, cat, pri: item.pri, claim: out.claim || null, final: !!out.final, t0: now, I };
      this.cur = cur; this.said[cat] = now;
      for (const h of out.who || []) if (h) this.mention.set(h, now);
      if (out.claim) this.claimed = { h: out.claim, t: now };
      if (out.claim && !out.final) this.lastCalledLeader = out.claim;
      if (this.log) this.log({ t: now, text: out.text, cat, I: +I.toFixed(2), rem: s ? +s.rem.toFixed(1) : null, claim: out.claim || null, leaderNow: s ? s.L : null, final: !!out.final });
      const gap = out.gap != null ? out.gap : gapAfter(this.I);
      this.sp.speak(out.text, voiceParams(I), () => { if (this.cur === cur) { this.cur = null; this.nextOK = this.now + gap; if (cur.final) this.finalPending = false; } });
      if (out.final) this.done = this.winCalled;
    }
    cancel() { const c = this.cur; this.cur = null; this.sp.cancel(); if (c && c.final) this.finalPending = false; }
    stop() { this.done = true; this.q = []; this.cancel("stop"); this.finalPending = false; }
  }
  // the voice: pace rises from a measured 0.97 to about 1.16 in a driving finish. Pitch moves only a little — a raised
  // pitch on a synthetic voice sounds strained, not excited; the excitement comes from shorter, faster, linked calls.
  function voiceParams(I) { return { rate: clampN(0.97 + 0.048 * (I - 1), 0.95, 1.17), pitch: clampN(1 + 0.022 * (I - 1), 1, 1.09), level: I }; }
  function gapAfter(I) { return I < 1.6 ? 2.0 : I < 2.6 ? 1.0 : I < 3.6 ? 0.3 : 0.05; }

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
      const finish = () => { if (this.timer) { clearTimeout(this.timer); this.timer = null; } if (this.cur === u) { this.cur = null; duck(false); } onEnd && onEnd(); onEnd = null; };
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

  // ---------- public API (browser) ----------
  function metaFor(cfg) {
    const c = cfg && cfg.career;
    if (c) return { name: c.name, venue: c.venue, major: !!c.major, crown: !!c.crown, official: !!c.official, rivalry: c.rivalry || {} };
    return { name: null, venue: "Furlong Park", major: false, crown: false, official: false };
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
    begin(race, cfg) { this.silence(); if (!race) return; booth = new Booth(race, metaFor(cfg), browserSpeaker, { log: inBrowser && window.__commLog ? (e => window.__commLog.push(Object.assign({}, e, { claim: e.claim ? e.claim.def.name : null, leaderNow: e.leaderNow ? e.leaderNow.def.name : null }))) : null }); },
    update(race) {
      if (!booth || booth.race !== race) return;
      if (!SET.on && !SET.captions) return;
      booth.update(performance.now() / 1000);
    },
    // how long the results screen should wait so the winner call isn't cut off (ms)
    holdMs() { return booth && (booth.finalPending || (booth.firstFinT && !booth.winCalled)) ? 2600 : 0; },
    silence() { if (booth) booth.stop(); booth = null; browserSpeaker.cancel(); },
    test() { this.prime(); browserSpeaker.cancel(); browserSpeaker.speak("Into the straight, and here they come! It's going to be close!", voiceParams(4.2), () => {}); },
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = COMM;
