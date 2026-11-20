'use strict';
// One authoritative race: the shared simulation (public/sim.js) stepped at a fixed 1/120 s on the server.
// Clients send rider inputs; the server applies them, runs the AI, physics, incidents and results, and broadcasts
// snapshots (20 Hz) and events. Nothing a client sends can move a horse except through the normal rider controls.
const { performance } = require('perf_hooks');
const SIM = require('../public/sim.js');
const { Race, ROSTER, SIM_DT, REC_F, applyRiderInput, riderPress, riderKick, Bot } = SIM;

const SNAP_MS = 45;              // 20 snapshots per second
const AI_TAKEOVER_S = 20;        // a disconnected rider has this long to come back before an AI jockey rides the horse home
const r3 = x => Math.round(x * 1000) / 1000;

class RaceSession {
  constructor(room, send) {
    this.room = room; this.send = send;   // send(slot|null, msg) — null = everyone
    const s = room.settings, P = room.players;
    // the riders, in seat order: rider k rides race.horses[k]; AI jockeys fill the rest of the field
    this.slots = P.map((p, i) => p ? i : -1).filter(i => i >= 0);
    this.hiOf = {}; this.slots.forEach((slot, k) => { this.hiOf[slot] = k; });
    this.cfg = { distance: s.dist, field: Math.max(s.field, this.slots.length), diff: s.diff, going: s.going, incidents: s.chaos ? 'full' : s.incidents, chaos: !!s.chaos, humans: this.slots.map(i => P[i].horse),
      seed: room.nextSeed(), assist: false, unlimited: false, playerHorse: P[this.slots[0]].horse };
    const hooks = {};
    this.events = [];
    this.race = new Race(Object.assign({}, this.cfg, { hooks }));
    this.slotHorse = this.slots.map((slot, k) => this.race.horses[k]);        // indexed by rider k, not seat
    this.inputs = this.slotHorse.map(h => ({ effort: h.effort }));
    this.discAt = this.slotHorse.map(() => null);
    const idx = h => this.race.horses.indexOf(h), ev = (k, o) => this.events.push(Object.assign({ k, t: performance.now(), c: r3(this.race.clock) }, o || {}));
    hooks.msg = (text, dur) => { if (this.race.state === 'count' || text === 'GO!' || text === "THEY'RE OFF!") ev('msg', { text, dur }); };
    hooks.tick = () => ev('tick'); hooks.gate = () => ev('gate');
    hooks.lead = (L, prev) => ev('lead', { i: idx(L), p: prev ? idx(prev) : -1 });
    hooks.photo = () => ev('photo');
    hooks.finish = h => ev('finish', { i: idx(h), ft: h.finishTime });
    hooks.incident = (type, h, other) => ev('incident', { type, i: idx(h), o: other ? idx(other) : -1 });
    hooks.fall = h => ev('fall', { i: idx(h) });
    hooks.kick = (h, o) => ev('kick', { i: idx(h), o: o ? idx(o) : -1, side: o ? Math.sign(o.laneF - h.laneF) || 1 : 0 });
    hooks.start = (cat, rt) => ev('start', { i: 0, cat, rt });
    hooks.startOther = (cat, h) => ev('start', { i: idx(h), cat, rt: h.st.rt });
    hooks.done = () => { this.finished = true; };
    this.t0 = performance.now(); this.acc = 0; this.lastSnap = 0; this.lastTick = performance.now();
    this.finished = false; this.closed = false;
  }
  startMsg() {
    return { type: 'raceStart', cfg: this.cfg, horses: this.race.horses.map(h => ROSTER.indexOf(h.def)), slots: this.slots,
      names: this.slots.map(i => this.room.players[i] ? this.room.players[i].name : 'Rider'), s: performance.now() };
  }
  start() {
    this.send(null, this.startMsg());
    this.timer = setInterval(() => this.tick(), 1000 / 60);
  }
  stop() { this.closed = true; clearInterval(this.timer); }
  setInput(slot, inp) { const k = this.hiOf[slot]; if (inp && k != null) this.inputs[k] = inp; }
  // Space: gate reaction or rhythm tap judged at the moment the rider saw it, bounded by their measured latency
  press(slot, msg, rttMs) {
    const k = this.hiOf[slot], h = this.slotHorse[k], race = this.race; if (!h || h.bot || race.state !== 'running') return;
    const lagS = Math.min(0.6, (rttMs || 150) / 1000 + 0.15 + 0.12);      // round trip + render buffer + slack
    const clock = race.clock;
    let rt = Number(msg.rt), tSeen = Number(msg.tSeen);
    rt = Number.isFinite(rt) ? Math.min(clock, Math.max(clock - lagS, rt, 0)) : clock;
    tSeen = Number.isFinite(tSeen) ? Math.min(clock, Math.max(clock - lagS, tSeen)) : clock;
    const res = riderPress(race, h, { rt, tSeen });
    if (res) this.send(slot, { type: 'pressres', r: res });
  }
  // chaos mode: P — the server applies the rider's one kick (side chosen by the rider; geometry decided here)
  kick(slot, side) {
    const k = this.hiOf[slot], h = this.slotHorse[k]; if (!h || h.bot) return;
    const r = riderKick(this.race, h, side);
    if (r) this.send(slot, { type: 'kickres', ok: r.ok, why: r.why || null, name: r.target ? r.target.def.name : null, used: h.kickUsed ? 1 : 0 });
  }
  setConnected(slot, on) {
    const k = this.hiOf[slot]; if (k == null) return;
    this.discAt[k] = on ? null : performance.now();
    if (!on) this.inputs[k] = Object.assign({}, this.inputs[k], { steer: 0, hold: false });   // let go of the steering
  }
  tick() {
    if (this.closed) return;
    const now = performance.now(), race = this.race;
    this.acc += Math.min(0.25, (now - this.lastTick) / 1000); this.lastTick = now;
    for (let s = 0; s < this.slotHorse.length; s++) {   // late starters: a rider's own latency extends the auto-start deadline (bounded)
      const p = this.room.players[this.slots[s]]; this.slotHorse[s].lagAllow = Math.min(0.6, ((p && p.rtt) || 150) / 1000 + 0.15);
      const hs = this.slotHorse[s], inp = this.inputs[s]; if (hs.st) hs.st.mSeen = inp ? inp.sm : null;
      if (hs.st) hs.st.zLag = Math.min(0.6, ((p && p.rtt) || 150) / 2000 + ((inp && inp.dl) || 0.12));
      if (this.discAt[s] != null && now - this.discAt[s] > AI_TAKEOVER_S * 1000 && !this.slotHorse[s].bot && !this.slotHorse[s].finished && !this.slotHorse[s].dnf) this.aiTakeover(s);
    }
    let n = 0;
    while (this.acc >= SIM_DT && n++ < 60 && !this.finished) {
      for (let s = 0; s < this.slotHorse.length; s++) applyRiderInput(race, this.slotHorse[s], this.inputs[s], SIM_DT);
      race.step(SIM_DT);
      this.acc -= SIM_DT;
    }
    if (now - this.lastSnap >= SNAP_MS || this.finished) { this.lastSnap = now; this.broadcastSnap(now); }
    if (this.finished) { this.stop(); this.sendResults(); }
  }
  debugFall(slot) { const h = this.slotHorse[this.hiOf[slot]]; if (h && h.started && !h.fallen && !h.finished) { h.cause = 'test'; h.fall(this.race, 1); } }
  aiTakeover(slot) {
    const h = this.slotHorse[slot];
    if (h.st && !h.st.launched) this.race.launch(true, h);
    h.bot = new Bot(h, this.cfg.diff, h.rng || this.race.rng); h.aiTook = Math.round(h.progress); h.steerIn = null; h.drive = false; h.restrain = false; h.settle = false;
    this.events.push({ k: 'ai', t: performance.now(), c: r3(this.race.clock), i: slot, at: h.aiTook });
  }
  // forSlot: that rider gets full detail of their own horse; everyone gets the light details of every rider
  snapshot(now, forSlot) {
    const mine = forSlot == null ? -1 : this.hiOf[forSlot];
    const race = this.race;
    const H = race.horses.map(h => {
      const fl = (h.finished ? 1 : 0) | (h.dnf ? 2 : 0) | (h.started ? 4 : 0) | (h.fallen ? 8 : 0) | ((h.fallKind === 'trip' ? 1 : h.fallKind === 'side' ? 2 : 0) << 4);
      return [r3(h.progress), r3(h.laneF), r3(h.latV), r3(h.v), r3(h.phase), r3(h.eAct), r3(h.F), r3(SIM.rideLevel(h)), r3(h.mom), r3(h.accel), r3(h.restrainLvl), r3(h.relax), r3(h.stumV), r3(h.fallen ? h.fallT : 0),
        h.rank, fl, h.fallDir || 1, r3(h.vFall || 0)];
    });
    const P = this.slotHorse.map((h, k) => k !== mine ? { S: r3(h.S), SR: r3(h.SR), effort: r3(h.effort), ai: h.aiTook != null ? 1 : 0 } : ({
      effort: r3(h.effort), S: r3(h.S), F: r3(h.F), SR: r3(h.SR), streak: h.streak, mom: r3(h.mom), keen: r3(h.keen), relax: r3(h.relax), restrain: h.restrain ? 1 : 0,
      drive: h.drive ? 1 : 0, settle: h.settle ? 1 : 0, stab: r3(h.stab), kB: r3(h.kB), lean: r3(h.lean), sideBlocked: h.sideBlocked || 0, blocked: h.blocked ? 1 : 0,
      rhythmT: r3(h.rhythmT), missRun: h.missRun, penT: r3(h.penT), urgeHeat: r3(h.urgeHeat), aDem: r3(h.aDem || 0), cap: r3(h.cap || 0), onBend: h.onBend ? 1 : 0, lowStab: r3(h.lowStab),
      groundLost: r3(h.groundLost), accel: r3(h.accel), finishTime: h.finishTime || null, ai: h.aiTook != null ? 1 : 0, startCat: h.startCat || null,
      overtakes: h.stat.overtakes, lost: h.stat.lost,
      kickUsed: h.kickUsed ? 1 : 0,
      st: h.st ? { z: r3(h.st.z), m: r3(h.st.m), R: r3(h.st.R), open: h.st.open ? 1 : 0, launched: h.st.launched ? 1 : 0, cat: h.st.cat, rt: h.st.rt, aligned: h.st.aligned ? 1 : 0, zone: r3(h.st.zone), t: r3(h.st.t) } : null,
    }));
    return { type: 'snap', s: now, c: r3(race.clock), state: race.state, countT: r3(race.countT), loadT: r3(race.loadT), lp: r3(race.leaderProgress), H, P, ev: this.lastEv || [] };
  }
  broadcastSnap(now) {
    this.lastEv = this.events.splice(0);                  // the same events go to everyone with this snapshot
    for (const slot of this.slots) this.send(slot, this.snapshot(now, slot));
    this.lastEv = [];
  }
  // official result + the recording each client needs for its own photo-finish replay and highlights
  resultsPayload() {
    const race = this.race, idx = h => race.horses.indexOf(h);
    const ser = e => ({ t: e.t, type: e.type, h: idx(e.h), other: e.other ? idx(e.other) : -1, mag: e.mag || 0, at: e.at, rank: e.rank });
    const tl = race.tel;
    return {
      type: 'results',
      order: race.finishOrder.map(h => [idx(h), h.finishTime, h.stat.finishV || h.v]),
      dnfs: race.dnfs.map(idx),
      riders: this.slotHorse.map((h, k) => ({ slot: this.slots[k], i: idx(h), name: this.room.players[this.slots[k]] ? this.room.players[this.slots[k]].name : 'Rider', stat: h.stat, S: h.S, F: h.F, SR: h.SR, distRun: h.distRun,
        groundLost: h.groundLost, incidents: h.incidents, fallCause: h.fallCause || null, dnf: !!h.dnf, fallen: !!h.fallen, startCat: h.startCat, ai: h.aiTook != null ? h.aiTook : null,
        lowStab: h.lowStab, vFall: h.vFall || 0, fallDir: h.fallDir || 1 })),
      fallen: race.horses.map(h => h.fallen ? [h.fallDir || 1, h.vFall || 0, h.fallCause || null, h.stat.dnfAt || 0, h.stat.dnfT || 0, h.fallKind || 'balance'] : null),
      tel: { t: tl.t, prog: tl.prog.map(a => a.map(r3)), rank: tl.rank },
      events: race.events.map(ser), leadChanges: race.leadChanges, dist: race.dist,
    };
  }
  replayBinary() {
    const race = this.race, R = race.rec, F = race.recFull, H = race.horses.length;
    const first = (R.head - R.n + R.cap) % R.cap, n = R.n, m = F.n;
    const buf = new Float32Array(n + n * H * REC_F + m + m * H * REC_F);
    let o = 0;
    for (let j = 0; j < n; j++) buf[o++] = R.t[(first + j) % R.cap];
    for (let j = 0; j < n; j++) { const src = ((first + j) % R.cap) * H * REC_F; for (let k = 0; k < H * REC_F; k++) buf[o++] = R.d[src + k]; }
    buf.set(F.t.subarray(0, m), o); o += m;
    buf.set(F.d.subarray(0, m * H * REC_F), o);
    return { meta: { type: 'replayMeta', n, m, H, F: REC_F, bytes: buf.byteLength }, buf };
  }
  sendResults() {
    this.results = this.resultsPayload();
    this.replay = this.replayBinary();
    this.send(null, this.results); this.send(null, this.replay.meta); this.send(null, this.replay.buf, true);
    if (this.onDone) this.onDone();
  }
}
module.exports = { RaceSession };
