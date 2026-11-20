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
  // horse names as the caller says them: custom names are kept, anything a voice would choke on is dropped
  function nm(h) { const s = String((h && h.def && h.def.name) || "").replace(/[^\p{L}\p{N}' .\-&]/gu, " ").replace(/\s+/g, " ").trim(); return s || "number " + ((h && h.cloth) || "?"); }
  const raceRef = name => /^the\s/i.test(name) ? name : "the " + name;

  // ---------- the booth (pure; no DOM) ----------
  class Booth {
    constructor(race, meta, speaker, opts) {
      this.race = race; this.meta = meta || {}; this.sp = speaker; this.opts = opts || {};
      this.q = []; this.cur = null; this.nextOK = 0; this.lastT = -1; this.sampleT = -1;
      this.recent = []; this.catUse = {}; this.said = {}; this.mention = new Map(); this.rankHist = new Map();
      this.leader = null; this.cand = null; this.candT = 0; this.leadSince = 0; this.lastLeadChangeAt = -1;
      this.flags = {}; this.falls = []; this.fallSeen = new Set(); this.I = 1; this.done = false; this.finalPending = false; this.winCalled = false;
      this.prestige = this.meta.crown ? 2 : this.meta.major ? 1.2 : this.meta.official ? 0.6 : 0.3;
      this.rng = this.opts.rng || Math.random;
      this.log = this.opts.log || null;
    }
    // ----- state helpers -----
    snapshot() {
      const r = this.race, H = r.horses;
      const fin = H.filter(h => h.finished && !h.dnf).sort((a, b) => (a.finishTime || 0) - (b.finishTime || 0));
      const run = H.filter(h => !h.finished && !h.dnf && !h.fallen).sort((a, b) => b.progress - a.progress);
      const ord = fin.concat(run);
      const L = ord[0], L2 = ord[1], L3 = ord[2];
      const rem = L ? r.dist - L.progress : r.dist;
      const gap12 = L && L2 ? Math.max(0, (L.finished ? r.dist : L.progress) - (L2.finished ? r.dist : L2.progress)) : 99;
      let near = 0; if (L) for (const h of run) if (h !== L && L.progress - h.progress < 1.5 * SIMG.LEN_M) near++;
      const ranks = new Map(); ord.forEach((h, i) => ranks.set(h, i + 1));
      return { ord, run, fin, L, L2, L3, rem, gap12, near, ranks, n: H.filter(h => !h.dnf).length };
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
    // ----- phrase picking: varied, never the same line twice in a row -----
    pick(cat, arr) {
      const used = this.catUse[cat] || [];
      let options = arr.map((t, i) => i).filter(i => !used.includes(i));
      if (!options.length) { this.catUse[cat] = []; options = arr.map((t, i) => i); }
      const i = options[(this.rng() * options.length) | 0];
      (this.catUse[cat] = this.catUse[cat] || []).push(i); if (this.catUse[cat].length > Math.max(1, arr.length - 1)) this.catUse[cat].shift();
      return arr[i];
    }
    push(cat, pri, ttl, make, extra) {
      const now = this.now;
      if (this.q.some(e => e.cat === cat)) this.q = this.q.filter(e => e.cat !== cat);   // only the newest of a kind
      this.q.push(Object.assign({ cat, pri, t: now, ttl, make }, extra || {}));
    }
    posPhrase(rank, n) {
      if (rank === 1) return "in front"; if (rank <= 3) return "handy in " + ordW(rank); if (rank <= Math.ceil(n / 2)) return "in midfield, " + ordW(rank);
      if (rank < n - 1) return "back in " + ordW(rank); return "at the tail of the field";
    }
    side(h, ref) { if (h.laneF < 1.3) return "on the inside"; if (ref && h.laneF > ref.laneF + 1.4) return "on the outside"; if (h.laneF > 4.5) return "out wide"; return ""; }
    mentioned(h, within) { const t = this.mention.get(h); return t != null && this.now - t < within; }
    // ----- main update -----
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
          ? [`Welcome to ${venue} for the running of ${raceRef(m.name)}. ${numW(n)} runners over ${distW(r.dist)} metres, and they're almost ready.`,
             `It's ${m.name} day here at ${venue}. ${numW(n)} go to the gates over ${distW(r.dist)} metres.`]
          : m.name ? [`${m.name}, over ${distW(r.dist)} metres at ${venue}. ${numW(n)} runners, and they're loading up.`, `${numW(n)} runners for ${raceRef(m.name)} here at ${venue}, ${distW(r.dist)} metres.`]
          : [`${numW(n)} runners over ${distW(r.dist)} metres here at ${venue}. They're going in.`, `Welcome to ${venue}. ${numW(n)} runners, ${distW(r.dist)} metres, and they're loading now.`];
        const text = this.pick("intro", lines);
        this.push("intro", 5, 4, () => ({ text: cap1(text) }));
      }
      // keep the start clear: nothing is said in the final moments before the gates open (the rider is listening for them)
      if (r.state === "count" && r.countT <= 0.8) { this.q = []; if (this.cur) this.cancel("gates"); this.nextOK = Infinity; }
    }
    detect(s) {
      this.lastSnap = s;
      const r = this.race, now = this.now, L = s.L; if (!L) return;
      if (!this.flags.away) { this.flags.away = true; this.awayT = now; this.nextOK = now + 0.35; }
      this.leaderPhase = SIMG.racePhase(L.progress, s.rem, r.dist);
      this.I = this.intensity(s);
      const P = this.player(), I = this.I, rem = s.rem, n = s.n;
      // rank history for movers
      if (!this.rankT || now - this.rankT >= 0.5) { this.rankT = now; for (const [h, k] of s.ranks) { let a = this.rankHist.get(h); if (!a) this.rankHist.set(h, a = []); a.push([now, k]); while (a.length && now - a[0][0] > 12) a.shift(); } }
      // 1. the break
      if (!this.flags.awayCall && now - this.awayT >= 0.35) {
        this.flags.awayCall = true;
        const m = this.meta;
        const lines = m.major ? [`And they're away in ${raceRef(m.name)}!`, `${m.name} is underway!`, `And they jump in ${raceRef(m.name)}!`] : [`And they're away!`, `They jump!`, `And they're off and racing!`];
        this.push("away", 6, 2.5, () => ({ text: this.pick("away", lines) }));
      }
      if (!this.flags.starts && now - this.awayT > 1.6) {
        this.flags.starts = true;
        const slow = r.horses.filter(h => (h.startCat === "MISSED" || h.startCat === "SLOW") && !h.dnf);
        const missed = slow.find(h => h.startCat === "MISSED") || slow[0];
        if (missed) this.push("start", 4, 3, () => ({ text: this.pick("start", missed.startCat === "MISSED" ? [`${nm(missed)} missed the start.`, `${nm(missed)} has missed the kick!`] : [`${nm(missed)} was slow to begin.`, `${nm(missed)} is a touch slow away.`]), who: [missed] }));
        else if (P && P.startCat === "PERFECT") this.push("start", 3, 3, () => ({ text: this.pick("startp", [`${nm(P)} jumps beautifully.`, `${nm(P)} begins brilliantly.`]), who: [P] }));
      }
      // 2. the early pattern
      if (!this.flags.early && L.progress > Math.min(240, r.dist * 0.2) && now - this.awayT > 6) {
        this.flags.early = true;
        this.push("early", 4, 5, () => {
          const q = this.lastSnap, A = q.L, B = q.L2; if (!A || !B) return null;
          const rel = B.laneF > A.laneF + 0.7 ? "on its outside" : B.laneF < A.laneF - 0.7 ? "on the inside of it" : "right behind";
          let t = this.pick("early", [`${nm(A)} is quickest to find the front, with ${nm(B)} ${rel}.`, `${nm(A)} goes straight to the lead, ${nm(B)} ${rel}.`, `${nm(A)} leads them out, ${nm(B)} ${rel}.`]);
          const Pp = this.player(), pr = Pp && q.ranks.get(Pp);
          if (Pp && pr && pr > 2 && !Pp.dnf) t += ` ${nm(Pp)} settles ${this.posPhrase(pr, q.n)}.`;
          return { text: t, claim: A, who: [A, B, Pp] };
        });
      }
      // 3. lead changes (debounced: a nose either way for a stride isn't a lead change)
      if (!this.leader) { this.leader = L; this.leadSince = now; }
      else if (L !== this.leader) {
        if (this.cand !== L) { this.cand = L; this.candT = now; }
        const hold = rem < 300 ? 0.25 : rem < 700 ? 0.6 : 1.5;
        if (now - this.candT >= hold && s.gap12 > 0.12 && !L.finished) {
          const old = this.leader, candT0 = this.candT; this.leader = L; this.leadSince = now; this.cand = null; this.lastLeadChangeAt = rem;
          const late = rem < 450;
          this.push("lead", late ? 9 : 4, late ? 1.6 : 4, () => {
            const q = this.lastSnap; if (q.L !== L) return null;            // already changed again: say nothing stale
            if (this.claimed && this.claimed.h === L && this.claimed.t >= candT0) return null;   // already called as the leader
            const tight = q.gap12 < 0.5 * SIMG.LEN_M;
            const text = late ? this.pick("leadlate", tight ? [`${nm(L)} gets its nose in front!`, `${nm(L)} takes a narrow lead!`, `${nm(L)} just edges ahead!`] : [`${nm(L)} hits the front!`, `${nm(L)} sweeps to the lead!`, `${nm(L)} has taken over!`])
              : this.pick("lead", [`${nm(L)} takes over the lead.`, `${nm(L)} goes to the front now.`, `${nm(L)} moves up to lead, ${nm(old)} back to second.`]);
            return { text, claim: L, who: [L, old] };
          }, { interrupt: late });
        }
      } else this.cand = null;
      // 4. falls (grouped: a pile-up is one call, not five)
      for (const h of r.horses) if ((h.fallen || h.dnf) && !this.fallSeen.has(h)) { this.fallSeen.add(h); this.falls.push(h); this.fallT = now; }
      if (this.falls.length && now - this.fallT > 0.6) {
        // falls gather into one group until they are called (a pile-up is one call, and nobody is dropped from it)
        this.fallGroup = (this.fallGroup || []).concat(this.falls.splice(0));
        const Pp = this.player();
        this.push("fall", 8, 3, () => {
          const F = (this.fallGroup || []).splice(0); if (!F.length) return null;
          F.sort((a, b) => ((b === Pp) - (a === Pp)) || ((b.fallT || 0) - (a.fallT || 0)));   // the rider's horse, then the first to go down
          const youDown = Pp && F[0] === Pp;
          if (F.length === 1) return { text: this.pick("fall", youDown ? [`Oh no, ${nm(F[0])} has gone down!`, `${nm(F[0])} has fallen!`] : [`Oh, ${nm(F[0])} has gone down!`, `There's a fall! ${nm(F[0])} is down!`]), who: F };
          const names = F.slice(0, 3).map(nm);
          if (F.length > 3) return { text: `There's a big fall! ${names.join(", ")}, and ${numW(F.length - 3)} more are down!`, who: F };
          return { text: `There's a fall! ${names.length === 2 ? names.join(" and ") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]} are down!`, who: F };
        }, { interrupt: true });
      }
      // 5. distance markers & phases
      const D = r.dist;
      if (D >= 1400 && !this.flags.half && L.progress >= D / 2) {
        this.flags.half = true;
        this.push("half", 3, 5, () => { const q = this.lastSnap; return q.L2 ? { text: this.pick("half", [`Halfway, and ${nm(q.L)} leads by ${lengthsW(q.gap12)}.`, `They pass the halfway mark, ${nm(q.L)} in front from ${nm(q.L2)}.`]), claim: q.L, who: [q.L, q.L2] } : null; });
      }
      if (!this.flags.turn && this.leaderPhase === "final bend" && L.progress > 60) {
        this.flags.turn = true;
        this.push("turn", 5, 4, () => {
          const q = this.lastSnap, c = this.closer(q, 8);
          let t = this.pick("turn", [`They're approaching the home turn, and they're beginning to make their moves!`, `Down towards the home turn now, and the pressure is building!`, `Heading for the turn, and they're starting to wind up!`]);
          if (q.gap12 > 4 * SIMG.LEN_M) t += ` ${nm(q.L)} is ${lengthsW(q.gap12)} clear.`;
          else if (c && c !== q.L) t += ` ${nm(q.L)} still leads, but ${nm(c)} is improving quickly!`;
          else t += ` ${nm(q.L)} still leads.`;
          return { text: t, claim: q.L, who: [q.L, c] };
        });
      }
      if (D >= 1200 && !this.flags.m600 && rem <= 600 && rem > 430) {
        this.flags.m600 = true;
        this.push("m600", 5, 3, () => {
          const q = this.lastSnap; if (!q.L2) return null;
          if (q.gap12 > 4 * SIMG.LEN_M) return { text: `Six hundred to go, and ${nm(q.L)} is ${lengthsW(q.gap12)} clear!`, claim: q.L, who: [q.L] };
          return { text: this.pick("m600", [`Six hundred metres to go! ${nm(q.L)} leads from ${nm(q.L2)}.`, `Six hundred to run, ${nm(q.L)} in front, ${nm(q.L2)} on its heels!`]), claim: q.L, who: [q.L, q.L2] };
        });
      }
      if (!this.flags.straight && rem <= SIMG.HOME_STRAIGHT && rem > 300 && D > SIMG.HOME_STRAIGHT + 150) {
        this.flags.straight = true;
        this.push("straight", 7, 2.2, () => {
          const q = this.lastSnap, c = this.closer(q, 6), m = this.meta;
          const lead = m.major ? `They're turning for home in ${raceRef(m.name)}!` : this.pick("straight0", [`They straighten for home!`, `Into the straight!`, `They turn for home!`]);
          if (q.gap12 > 4 * SIMG.LEN_M) return { text: `${lead} ${nm(q.L)} has a break on them!`, claim: q.L, who: [q.L] };
          if (q.gap12 < 0.6 * SIMG.LEN_M && q.L2) return { text: `${lead} ${nm(q.L)} and ${nm(q.L2)} together!`, claim: q.L, who: [q.L, q.L2] };
          if (c && c !== q.L) return { text: `${lead} ${nm(q.L)} leads, but ${nm(c)} is charging after it!`, claim: q.L, who: [q.L, c] };
          return { text: `${lead} ${nm(q.L)} leads.`, claim: q.L, who: [q.L] };
        }, { interrupt: true });
      }
      if (!this.flags.m400 && rem <= 400 && rem > 260) {
        this.flags.m400 = true;
        this.push("m400", 7, 1.8, () => {
          const q = this.lastSnap; if (!q.L2) return null;
          const gL = q.gap12 / SIMG.LEN_M;
          if (gL > 4) return { text: this.pick("m400d", [`Four hundred to go, and ${nm(q.L)} is well clear!`, `Four hundred out, ${nm(q.L)} has them all off the bit!`]), claim: q.L, who: [q.L] };
          if (q.near >= 2) return { text: `Four hundred to go, and there are ${numW(q.near + 1)} horses fighting for the lead!`, claim: q.L, who: [q.L] };
          if (gL < 1.5) return { text: `Four hundred to go! ${nm(q.L)} and ${nm(q.L2)} are locked together!`, claim: q.L, who: [q.L, q.L2] };
          return { text: `Four hundred to go! ${nm(q.L)} holds the advantage, ${nm(q.L2)} giving chase!`, claim: q.L, who: [q.L, q.L2] };
        }, { interrupt: true });
      }
      if (!this.flags.m200 && rem <= 200 && rem > 120) {
        this.flags.m200 = true;
        this.push("m200", 8, 1.4, () => {
          const q = this.lastSnap; if (!q.L2) return null;
          const gL = q.gap12 / SIMG.LEN_M;
          if (gL > 4) return { text: this.pick("m200d", [`${nm(q.L)} is ${lengthsW(q.gap12)} clear! This has been a dominant performance!`, `Two hundred to go and ${nm(q.L)} has put them away!`]), claim: q.L, who: [q.L] };
          if (q.near >= 2) return { text: `Two hundred to go! ${numW(q.near + 1)} in a line!`, claim: q.L, who: [q.L] };
          if (gL < 0.6) return { text: this.pick("m200c", [`Two hundred to go! ${nm(q.L)} and ${nm(q.L2)} are head to head!`, `Two hundred out, ${nm(q.L)} and ${nm(q.L2)}, nothing between them!`]), claim: q.L, who: [q.L, q.L2] };
          return { text: this.pick("m200n", [`Two hundred to go! ${nm(q.L)} by ${lengthsW(q.gap12)}!`, `Two hundred out, ${nm(q.L)} holds on by ${lengthsW(q.gap12)}!`]), claim: q.L, who: [q.L, q.L2] };
        }, { interrupt: true });
      }
      if (!this.flags.m100 && rem <= 110 && rem > 40 && s.L2 && s.gap12 < 0.6 * SIMG.LEN_M) {
        this.flags.m100 = true;
        this.push("m100", 8, 1.1, () => { const q = this.lastSnap; return q.L2 && q.gap12 < 0.7 * SIMG.LEN_M ? { text: this.pick("m100", [`A hundred to go, there's nothing between them!`, `${nm(q.L)} and ${nm(q.L2)}, stride for stride!`, `They're fighting it out!`]), claim: null, who: [q.L, q.L2] } : null; }, { interrupt: true });
      }
      if (!this.flags.line && rem <= 45 && rem > 0 && s.L2 && s.gap12 < 0.45 * SIMG.LEN_M) {
        this.flags.line = true;
        this.push("line", 9, 1.0, () => ({ text: this.pick("line", [`They're going to hit the line together!`, `It's going to be desperately close!`]) }), { interrupt: true });
      }
      if (!this.flags.m300 && rem <= 320 && rem > 215 && s.L2 && !this.cur && now - (this.said.m400 || 0) > 2.5) {
        this.flags.m300 = true; const g0 = this.gapAt400 != null ? this.gapAt400 : s.gap12;
        this.push("m300", 6, 1.6, () => {
          const q = this.lastSnap; if (!q.L2) return null; const gL = q.gap12 / SIMG.LEN_M;
          if (q.gap12 > g0 + 1.2 && gL > 1.5) return { text: this.pick("m300a", [`${nm(q.L)} is pulling away!`, `${nm(q.L)} kicks clear!`, `${nm(q.L)} is going further clear!`]), claim: q.L, who: [q.L] };
          if (q.gap12 < g0 - 1.2) return { text: this.pick("m300b", [`${nm(q.L2)} is closing the gap!`, `${nm(q.L2)} is starting to wind back ${nm(q.L)}!`]), claim: q.L, who: [q.L, q.L2] };
          return gL > 1 ? { text: this.pick("m300c", [`${nm(q.L)} still holds ${nm(q.L2)}!`, `${nm(q.L)} is giving nothing away!`]), claim: q.L, who: [q.L] } : null;
        });
      }
      if (rem <= 400 && this.gapAt400 == null) this.gapAt400 = s.gap12;
      { const Pp = this.player(), pr = Pp && s.ranks.get(Pp);
        if (Pp && !Pp.dnf && !Pp.finished && !this.flags.youStraight && rem < 330 && rem > 120 && pr > 2 && !this.mentioned(Pp, 8) && !this.cur) {
          this.flags.youStraight = true;
          this.push("youS", 5, 1.5, () => { const q = this.lastSnap, k = q.ranks.get(Pp); if (!k || Pp.finished) return null;
            return { text: this.pick("youS", Pp.v > q.L.v + 0.3 ? [`${nm(Pp)} is flying home in ${ordW(k)}!`, `And ${nm(Pp)} is finishing strongly!`] : [`${nm(Pp)} is battling on in ${ordW(k)}.`, `${nm(Pp)} keeps going in ${ordW(k)}.`]), who: [Pp] }; });
        } }
      if (!this.flags.m100 && rem <= 110 && rem > 40 && s.L2 && s.gap12 >= 0.6 * SIMG.LEN_M && !this.cur) {
        this.flags.m100 = true;
        this.push("m100", 7, 1.1, () => { const q = this.lastSnap; if (!q.L2) return null; const gL = q.gap12 / SIMG.LEN_M;
          return { text: gL > 3 ? this.pick("m100d", [`${nm(q.L)} is cruising to the line!`, `A hundred to go, and ${nm(q.L)} has this won!`]) : q.L2.v > q.L.v + 0.3 ? this.pick("m100c", [`${nm(q.L2)} is closing, but is it too late?`, `A hundred to go, ${nm(q.L2)} still coming!`]) : this.pick("m100h", [`A hundred to go, ${nm(q.L)} holds on!`, `${nm(q.L)} is going to hold them!`]), claim: q.L, who: [q.L, q.L2] }; }, { interrupt: true });
      }
      // 6. challenges in the straight
      if (rem < 450 && rem > 30 && s.L2 && !L.finished) {
        const gL = s.gap12 / SIMG.LEN_M, closing = s.L2.v - L.v;
        if (gL < 1.2 && closing > 0.25 && !this.recentCat("chal", 3.2) && !this.recentCat("lead", 1.5)) {
          const A = L, B = s.L2;
          this.push("chal", 7, 1.3, () => { const q = this.lastSnap; if (q.L !== A || q.L2 !== B) return null; return { text: q.gap12 < 0.4 * SIMG.LEN_M ? this.pick("chal1", [`${nm(B)} draws alongside!`, `${nm(B)} is right there with ${nm(A)}!`]) : this.pick("chal2", [`${nm(B)} is coming at ${nm(A)}!`, `${nm(B)} is charging home!`, `Here comes ${nm(B)}!`]), claim: A, who: [A, B] }; }, { interrupt: rem < 250 });
          this.chalPair = [A, B, s.gap12];
        } else if (this.chalPair && this.chalPair[0] === L && s.gap12 > this.chalPair[2] + 0.5 && closing < -0.2 && !this.recentCat("fight", 4)) {
          this.push("fight", 7, 1.3, () => { const q = this.lastSnap; return q.L === L ? { text: this.pick("fight", [`${nm(L)} is fighting back!`, `But ${nm(L)} finds more!`]), claim: L, who: [L] } : null; });
          this.chalPair = null;
        }
      }
      // 7. the running (quiet periods only — the caller doesn't narrate every stride)
      if (rem > 450 && now - this.awayT > 8 && !this.cur && !this.q.length && now >= this.nextOK) this.running(s);
      // 8. the finish
      if (!this.winCalled && s.fin.length) this.finish(s);
    }
    recentCat(cat, within) { const t = this.said[cat]; return t != null && this.now - t < within; }
    // the horse making the best run: biggest recent gain in the first `top` positions, or quickest at the moment
    closer(s, top) {
      let best = null, bs = 0;
      for (const h of s.ord.slice(1, top)) {
        const a = this.rankHist.get(h), rk = s.ranks.get(h); if (!a || !a.length) continue;
        const gain = a[0][1] - rk, dv = h.v - s.L.v, sc = gain + dv * 1.2;
        if (sc > bs) { bs = sc; best = h; }
      }
      return bs >= 1 ? best : null;
    }
    running(s) {
      const now = this.now, P = this.player(), r = this.race;
      const gap = this.I <= 1.5 ? 6.5 + this.rng() * 4 : 3.5;
      if (now - (this.lastRun || this.awayT) < gap) return;
      this.lastRun = now;
      const cands = [];
      // a horse improving quickly
      for (const h of s.ord.slice(1, 7)) { const a = this.rankHist.get(h), rk = s.ranks.get(h); if (a && a.length && a[0][1] - rk >= 3 && !this.mentioned(h, 15)) cands.push(["mover", 3.5, h]); }
      // caught wide on a bend
      for (const h of s.ord.slice(0, 6)) if (h.laneF >= 3.6 && SIMG.isTurn(r.startD + h.progress) && !this.mentioned(h, 20) && !this.said["wide" + nm(h)]) cands.push(["wide", 2.6, h]);
      // the rider's horse: traffic, position, how it's travelling
      if (P && !P.dnf && !P.finished) {
        if (P.blocked && (P.blockedTime || 0) > 1 && !this.recentCat("trap", 12)) cands.push(["trap", 4, P]);
        if (!this.mentioned(P, 16)) cands.push(["you", 2.8, P]);
      }
      if (!this.flags.bunch && s.run.length >= 6) { const sp = s.ord[0].progress - s.ord[Math.min(7, s.ord.length - 1)].progress; if (sp < 11) cands.push(["bunch", 2.4, null]); }
      if (s.L && s.gap12 > 3 * SIMG.LEN_M && !this.recentCat("clear", 20)) cands.push(["clear", 3, s.L]);
      if (s.L && s.L2 && s.rem < 750 && s.L2.v > s.L.v + 0.5 && s.gap12 < 3 && !this.recentCat("weak", 15)) cands.push(["weak", 3.2, s.L]);
      if (!this.recentCat("lead", 9) && !this.recentCat("report", 12)) cands.push(["report", 2, s.L]);
      if (!cands.length) return;
      cands.sort((a, b) => b[1] - a[1]);
      const [kind, pri, h] = cands[0];
      if (kind === "bunch") this.flags.bunch = true;
      if (kind === "wide") this.said["wide" + nm(h)] = now;
      this.push(kind, pri, 4.5, () => {
        const q = this.lastSnap, rk = h ? q.ranks.get(h) : 0;
        if (h && (h.dnf || h.finished)) return null;
        switch (kind) {
          case "mover": return { text: this.pick("mover", [`${nm(h)} is improving quickly ${this.side(h, q.L) || "through the field"}!`, `${nm(h)} is starting to make ground!`, `${nm(h)} moves up ${this.side(h, q.L) || "into contention"}.`]), who: [h] };
          case "wide": return { text: this.pick("wide", [`${nm(h)} is caught very wide.`, `${nm(h)} is three wide without cover.`, `${nm(h)} is doing a lot of work out wide.`]), who: [h] };
          case "trap": return { text: this.pick("trap", h.laneF < 1.6 ? [`There's no room for ${nm(h)} along the inside!`, `${nm(h)} is pocketed on the rail!`] : [`${nm(h)} is looking for room!`, `${nm(h)} is held up behind runners!`]), who: [h] };
          case "you": {
            const tired = (h.S != null && h.S < 30) || (h.F != null && h.F > 45), easy = (h.S == null || h.S > 50) && (h.F == null || h.F < 25);
            if (rk === 1) return { text: this.pick("you1", [`${nm(h)} leads them along.`, `${nm(h)} is setting the pace.`]), claim: h, who: [h] };
            return { text: tired ? this.pick("youT", [`${nm(h)} is being pushed along ${this.posPhrase(rk, q.n)}.`, `${nm(h)} is under pressure, ${this.posPhrase(rk, q.n)}.`])
              : easy ? this.pick("youE", [`${nm(h)} is travelling comfortably ${this.posPhrase(rk, q.n)}.`, `${nm(h)} is going easily ${this.posPhrase(rk, q.n)}.`])
              : this.pick("youM", [`${nm(h)} is ${this.posPhrase(rk, q.n)}.`, `${nm(h)} races ${this.posPhrase(rk, q.n)}.`]), who: [h] };
          }
          case "bunch": return { text: this.pick("bunch", [`The field is bunching up.`, `They're well grouped, not much between them.`, `Not much room in there, they're all together.`]) };
          case "clear": return q.gap12 > 2.5 * SIMG.LEN_M ? { text: this.pick("clear", [`${nm(q.L)} has kicked clear, ${lengthsW(q.gap12)} in front.`, `${nm(q.L)} has opened up a break of ${lengthsW(q.gap12)}.`]), claim: q.L, who: [q.L] } : null;
          case "weak": return q.L === h ? { text: this.pick("weak", [`${nm(h)} is starting to feel the pinch.`, `${nm(h)} is beginning to weaken.`]), claim: h, who: [h] } : null;
          default: return q.L2 ? { text: this.pick("report", [`${nm(q.L)} leads by ${lengthsW(q.gap12)} from ${nm(q.L2)}.`, `${nm(q.L)} leads them along, ${nm(q.L2)} second, then ${nm(q.L3 || q.L2)}.`, `${nm(q.L)} is setting the pace, ${nm(q.L2)} handy.`]), claim: q.L, who: [q.L, q.L2] } : null;
        }
      });
    }
    // the finish: never names a winner before the timing has decided it
    finish(s) {
      const r = this.race, W = s.fin[0], m = this.meta;
      if (!this.firstFinT) {
        this.firstFinT = this.now; this.finalPending = true;
        const second = s.fin[1] || s.run[0];
        const gapM = second ? (second.finished ? (second.finishTime - W.finishTime) * Math.max(8, W.v || 16) : r.dist - second.progress) : 99;
        this.winGap = gapM;
        if (gapM < 0.75) {                                                // too close to call by eye: a photo
          this.photo = true;
          this.push("photo", 10, 2.5, () => ({ text: this.pick("photo", [`They hit the line together! That is a photo finish!`, `Locked together on the line! It's a photo!`]) }), { interrupt: true });
          return;
        }
      }
      if (this.photo) {
        // wait for the second horse to cross so the timing has both of them, then let the photo line breathe
        if (s.fin.length < 2 || this.now - this.firstFinT < 1.0 || this.q.some(e => e.cat === "photo") || (this.cur && this.cur.cat === "photo")) return;
      }
      this.winCalled = true;
      const late = this.lastLeadChangeAt >= 0 && this.lastLeadChangeAt < 160, gL = this.winGap / SIMG.LEN_M;
      const what = m.name ? raceRef(m.name) : null;
      this.push("win", 10, 4, () => {
        const q = this.snapshot(), Wn = q.fin[0] || W;                  // the official order by finishing time
        let t;
        if (this.photo) t = this.pick("winp", what ? [`And on the photo, ${nm(Wn)} has won ${what}!`, `${nm(Wn)} gets the photo! ${nm(Wn)} wins ${what}!`] : [`And on the photo, it's ${nm(Wn)}!`, `${nm(Wn)} gets the verdict!`]);
        else if (gL > 4) t = what && m.major ? `${nm(Wn)} wins ${what}, and it's a dominant performance!` : this.pick("wind", [`${nm(Wn)} wins it easily!`, `${nm(Wn)} wins, ${lengthsW(this.winGap)} clear!`]);
        else if (late) t = this.pick("winl", [`${nm(Wn)} gets there in the final strides!`, `${nm(Wn)} swoops late to win${what ? " " + what : ""}!`]);
        else if (gL < 1.5) t = this.pick("winc", [`${nm(Wn)} just holds on${what ? " to win " + what : ""}!`, `${nm(Wn)} wins it by ${lengthsW(this.winGap)}!`]);
        else t = what ? this.pick("winm", [`And ${nm(Wn)} wins ${what}!`, `${nm(Wn)} has won ${what}!`]) : this.pick("win", [`And ${nm(Wn)} wins!`, `${nm(Wn)} is the winner!`]);
        if (m.major && (this.photo || gL < 1)) t += ` What a finish to ${what}!`;
        return { text: t, claim: Wn, who: [Wn], final: true };
      }, { interrupt: !this.photo });
    }
    // ----- the scheduler -----
    schedule(s) {
      const now = this.now;
      this.q = this.q.filter(e => now - e.t <= e.ttl);
      if (!this.q.length) return;
      this.q.sort((a, b) => b.pri - a.pri || a.t - b.t);
      const top = this.q[0];
      if (this.cur) {
        // urgent news cuts in; a speaking line that has gone stale (its leader has been passed) is cut late in the race
        const stale = this.cur.claim && s && s.L && this.cur.claim !== s.L && s.rem < 450 && !this.cur.final;
        const spoke = now - this.cur.t0;
        if ((top.interrupt && top.pri >= this.cur.pri + 3 && spoke > 0.25) || (top.interrupt && top.pri > this.cur.pri && spoke > 1.4) || (stale && top.pri >= 6 && spoke > 0.25)) this.cancel("interrupt");
        else return;
      }
      if (now < this.nextOK) return;
      this.q.shift();
      const out = top.make && top.make(); if (!out || !out.text) return;
      out.text = out.text.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
      if (this.recent.includes(out.text)) return;                       // never the identical sentence twice close together
      this.recent.push(out.text); if (this.recent.length > 14) this.recent.shift();
      const I = top.cat === "intro" ? 1.6 : clampN(this.I + (top.cat === "win" || top.cat === "photo" ? 0.6 : 0), 1, 5);
      const cur = { text: out.text, cat: top.cat, pri: top.pri, claim: out.claim || null, final: !!out.final, t0: now, I };
      this.cur = cur; this.said[top.cat] = now;
      for (const h of out.who || []) if (h) this.mention.set(h, now);
      if (out.claim) this.claimed = { h: out.claim, t: now };
      if (this.log) this.log({ t: now, text: out.text, cat: top.cat, I: +I.toFixed(2), rem: s ? +s.rem.toFixed(1) : null, claim: out.claim || null, leaderNow: s ? s.L : null, final: !!out.final });
      this.sp.speak(out.text, voiceParams(I), () => { if (this.cur === cur) { this.cur = null; this.nextOK = this.now + gapAfter(this.I); if (cur.final) this.finalPending = false; } });
      if (out.final) this.done = this.winCalled;
    }
    cancel(why) { const c = this.cur; this.cur = null; this.sp.cancel(); if (c && c.final) this.finalPending = false; }
    stop() { this.done = true; this.q = []; this.cancel("stop"); this.finalPending = false; }
  }
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  // voice energy rises with the excitement level (kept inside a natural range — no chipmunk speech)
  function voiceParams(I) { return { rate: clampN(0.98 + 0.075 * (I - 1), 0.95, 1.3), pitch: clampN(1 + 0.05 * (I - 1), 1, 1.2), level: I }; }
  function gapAfter(I) { return I < 1.6 ? 2.2 : I < 2.6 ? 1.2 : I < 3.6 ? 0.5 : 0.12; }

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
    if (c) return { name: c.name, venue: c.venue, major: !!c.major, crown: !!c.crown, official: !!c.official };
    return { name: null, venue: "Furlong Park", major: false, crown: false, official: false };
  }
  return {
    Booth, voiceParams, scoreVoice, metaFor, lengthsW, distW,
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
