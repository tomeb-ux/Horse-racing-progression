// Phase 9 rules (public/career-core.js): long-term development — weekly plans, training sessions, load / soreness / peaking, race-day condition, progress that never passes potential.   node tests/phase9-core.js
const S = require('../public/season.js'), K = require('../public/career-core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const J = o => JSON.stringify(o), AK = ['top', 'acc', 'end', 'spr', 'rec', 'tem', 'agi', 'sta'];
const mkHorse = (id, r) => ({ id, name: id, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, pot: { top: r + 12, acc: r + 12, end: r + 12, spr: r + 12, rec: r + 12, tem: r + 12, agi: r + 12, sta: r + 12 }, look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, silk: '#d62828', silk2: '#fff', silkPat: 'hoops', xp: 0, trainPts: 0, lvl: 1, xpFrac: 0, races: 0, wins: 0, places: 0, podiums: 0, history: [], born: 1 });
function career(n) { const C = K.fresh(2024); C.horses = Array.from({ length: n || 2 }, (_, i) => mkHorse('h' + i, 66)); S.migrate(C); K.migrate(C, { from: 4 }); for (const h of C.horses) K.fillHorse(h, C, { age: 4, fitness: 100 }); C.cal.events.forEach(e => { if (e.kind === 'round') e.day = 9999; }); K.apply(C, 'test:fund', 450000, 'gift', 'test funds'); return C; }
const day = (C, d) => { C.day = d; K.autoDay(C, d); };
const sum = h => AK.reduce((a, k) => a + h.attrs[k], 0), prog = (C, h) => AK.reduce((a, k) => a + K.devRec(C, h).prog[k], 0);

// ---------------------------------------------------------------- plans
{ const C = career(), h = C.horses[0];
  ok(Object.keys(K.PLANS).includes('rest') && Object.keys(K.PLANS).length >= 6 && Object.values(K.PLANS).every(p => p.label && p.w), 'there are several weekly plans, each with a label and weights, including Rest');
  let r = K.setPlan(C, 'h0', 'speed', 2); ok(r.ok && r.plan === 'speed' && r.int === 2 && K.devRec(C, h).plan === 'speed', 'setting a plan and an intensity stores them on the horse');
  r = K.setPlan(C, 'h0', 'nope', 1); ok(!r.ok && K.devRec(C, h).plan === 'speed', 'an unknown plan changes nothing');
  r = K.setPlan(C, 'ghost', 'speed', 1); ok(!r.ok, 'an unknown horse cannot be given a plan');
  r = K.setPlan(C, 'h0', 'speed', 99); ok(r.int === 3, 'intensity is clamped (hard is the maximum)'); r = K.setPlan(C, 'h0', 'speed', -4); ok(r.int >= 1 && r.int <= 3, 'a nonsense intensity is clamped into range');
  const d = K.devRec(C, h); ok(d.plan && d.int >= 1 && d.int <= 3 && Array.isArray(d.log) && AK.every(k => d.prog[k] >= 0 && d.prog[k] < 1), 'the development record is complete and well-formed');
  const bad = career(1); bad.farm.dev = { h0: { plan: 'zzz', int: 9, prog: { top: 5, acc: -1 }, load: 'x', sore: null } }; const rr = K.devRec(bad, bad.horses[0]); ok(K.PLANS[rr.plan] && rr.int === 1 && AK.every(k => rr.prog[k] >= 0 && rr.prog[k] < 1) && Number.isFinite(rr.load) && rr.sore === 0, 'a corrupted development record is repaired on read'); }

// ---------------------------------------------------------------- a day of the plan
{ const C = career(1), h = C.horses[0]; C.day = 7 * 20 + 3; K.setPlan(C, 'h0', 'speed', 2); const s0 = prog(C, h) + sum(h);
  day(C, C.day); ok(prog(C, h) + sum(h) > s0, 'a day of the plan adds a little progress'); ok(h.fitness < 100 && K.devRec(C, h).load > 0, 'and costs a little fitness and adds training load');
  const snap = J([h.attrs, K.devRec(C, h).prog, h.fitness]); day(C, C.day); ok(J([h.attrs, K.devRec(C, h).prog]) === J([h.attrs, K.devRec(C, h).prog]) && K.devRec(C, h).sessions === 1, 'a second pass over the same day never double-counts a session (one session a day)');
  const D = career(1), q = D.horses[0]; D.day = 7 * 20; K.setPlan(D, 'h0', 'speed', 2); q.fitness = 100; for (let i = 0; i < 7; i++) { day(D, 140 + i); } ok(K.devRec(D, q).sessions === 6, 'one day of the week is a rest day (6 sessions in 7 days; got ' + K.devRec(D, q).sessions + ')');
  const R = career(1), rh = R.horses[0]; K.setPlan(R, 'h0', 'rest', 3); for (let i = 0; i < 14; i++) day(R, 140 + i); ok(K.devRec(R, rh).sessions === 0 && prog(R, rh) === 0, 'a Rest plan trains nothing'); }

// ---------------------------------------------------------------- progress is gradual and bounded
{ const C = career(1), h = C.horses[0]; C.day = 140; K.setPlan(C, 'h0', 'balanced', 3); let maxStep = 0;
  for (let i = 0; i < 400; i++) { const before = Object.assign({}, h.attrs); day(C, 140 + i); h.fitness = 100; for (const k of AK) maxStep = Math.max(maxStep, h.attrs[k] - before[k]); }
  ok(maxStep <= 1, 'no attribute ever jumps by more than one point in a day (max ' + maxStep + ')'); ok(AK.every(k => h.attrs[k] <= h.pot[k]), 'no attribute passes its potential, however long it trains');
  const full = career(1), fh = full.horses[0]; for (const k of AK) fh.attrs[k] = fh.pot[k]; const snap = J(fh.attrs); K.setPlan(full, 'h0', 'speed', 3); for (let i = 0; i < 60; i++) { day(full, 140 + i); fh.fitness = 100; } ok(J(fh.attrs) === snap, 'a horse already at its potential gains nothing'); }
{ // diminishing returns: the nearer the ceiling, the slower
  const far = career(1), near = career(1), a = far.horses[0], b = near.horses[0]; for (const k of AK) b.pot[k] = b.attrs[k] + 2; far.day = near.day = 140;
  K.setPlan(far, 'h0', 'speed', 2); K.setPlan(near, 'h0', 'speed', 2); day(far, 140); day(near, 140); ok(prog(far, a) + sum(a) > prog(near, b) + sum(b) - 1e-9 && prog(far, a) + sum(a) - 8 * 66 > (prog(near, b) + sum(b) - 8 * 66) * 1.5, 'progress slows as a horse nears its ceiling (diminishing returns)'); }
{ // age: a young horse develops faster than an old one
  const y = career(1), o = career(1); for (const [C, age] of [[y, 3], [o, 9]]) { const h = C.horses[0]; h.foaled = K.seasonYear(K.seasonOfDay(C.day)) - age; h.age = K.ageOf(h, C.day); h.fitness = 100; } K.setPlan(y, 'h0', 'balanced', 2); K.setPlan(o, 'h0', 'balanced', 2);
  for (let i = 0; i < 28; i++) { day(y, 140 + i); day(o, 140 + i); y.horses[0].fitness = o.horses[0].fitness = 100; K.devRec(y, y.horses[0]).load = K.devRec(o, o.horses[0]).load = 0; }
  const gy = prog(y, y.horses[0]) + sum(y.horses[0]), go = prog(o, o.horses[0]) + sum(o.horses[0]); ok(gy > go, 'a young horse builds faster than a veteran of the same make (' + gy.toFixed(2) + ' vs ' + go.toFixed(2) + ')'); }

// ---------------------------------------------------------------- the plan shapes the horse
{ const a = career(1), b = career(1); a.day = b.day = 140; K.setPlan(a, 'h0', 'speed', 2); K.setPlan(b, 'h0', 'stamina', 2); for (let i = 0; i < 90; i++) { day(a, 140 + i); day(b, 140 + i); a.horses[0].fitness = b.horses[0].fitness = 100; K.devRec(a, a.horses[0]).load = K.devRec(b, b.horses[0]).load = 0; }
  const ga = (k, C) => K.devReport(C, C.horses[0]).rows.find(r => r.k === k).v - 66, pa = (k, C) => K.devRec(C, C.horses[0]).prog[k];
  ok(ga('top', a) + pa('top', a) > ga('top', b) + pa('top', b) && ga('end', b) + pa('end', b) > ga('end', a) + pa('end', a), 'a speed plan builds top speed; a stamina plan builds endurance'); }

// ---------------------------------------------------------------- load, soreness, recovery
{ const C = career(1), h = C.horses[0]; C.day = 140; K.setPlan(C, 'h0', 'balanced', 3); let sore = 0; for (let i = 0; i < 60; i++) { const w = K.devRec(C, h).sore; day(C, 140 + i); if (K.devRec(C, h).sore > w) sore++; h.fitness = Math.max(h.fitness, 70); }
  ok(sore >= 1, 'training hard every day eventually makes the horse sore (' + sore + ' spells in 60 days)');
  const s = career(1), sh = s.horses[0]; K.devRec(s, sh).sore = 3; const p0 = J(sh.attrs) + J(K.devRec(s, sh).prog); day(s, 140); ok(K.devRec(s, sh).sore === 2 && J(sh.attrs) + J(K.devRec(s, sh).prog) === p0, 'a sore horse rests that day (no session) and the soreness counts down');
  const t = career(1), th = t.horses[0]; th.fitness = 30; K.setPlan(t, 'h0', 'speed', 3); const q0 = J(th.attrs) + J(K.devRec(t, th).prog); day(t, 140); ok(J(th.attrs) + J(K.devRec(t, th).prog) === q0 && th.fitness === 30, 'a horse that is too tired does not train (and loses nothing)');
  const L = career(1), lh = L.horses[0]; K.devRec(L, lh).load = 50; K.setPlan(L, 'h0', 'rest', 1); day(L, 140); ok(K.devRec(L, lh).load === 50 - K.DEV.LOAD_DECAY, 'training load drains away each day (' + K.DEV.LOAD_DECAY + ')'); }
{ // a high load slows development
  const lo = career(1), hi = career(1); K.devRec(hi, hi.horses[0]).load = 70; K.setPlan(lo, 'h0', 'speed', 2); K.setPlan(hi, 'h0', 'speed', 2); K.trainSession(lo, lo.horses[0], K.PLANS.speed.w, { source: 'auto', int: 2 }); K.trainSession(hi, hi.horses[0], K.PLANS.speed.w, { source: 'auto', int: 2 });
  ok(prog(hi, hi.horses[0]) < prog(lo, lo.horses[0]) * 0.8, 'an overloaded horse takes far less from the same session'); }

// ---------------------------------------------------------------- trainer / facilities help, capped
{ const a = career(1), b = career(1); b.fac.training = 3; b.fac.track = 3; K.hireStaff(b, 'trainer', 3, 'all-rounder'); K.setPlan(a, 'h0', 'speed', 2); K.setPlan(b, 'h0', 'speed', 2); K.trainSession(a, a.horses[0], K.PLANS.speed.w, { source: 'auto', int: 2 }); K.trainSession(b, b.horses[0], K.PLANS.speed.w, { source: 'auto', int: 2 });
  const ga = prog(a, a.horses[0]), gb = prog(b, b.horses[0]); ok(gb > ga && gb <= ga * (K.FAC_CAP + 0.01) / 0.7, 'a trainer and facilities help, but within the cap (×' + (gb / ga).toFixed(2) + ')'); }
{ // no trainer: automatic training is a little less effective than a hired trainer's
  const a = career(1), b = career(1); K.hireStaff(b, 'trainer', 1, 'all-rounder'); K.trainSession(a, a.horses[0], K.PLANS.balanced.w, { source: 'auto', int: 2 }); K.trainSession(b, b.horses[0], K.PLANS.balanced.w, { source: 'auto', int: 2 }); ok(prog(b, b.horses[0]) > prog(a, a.horses[0]), 'a hired trainer makes the scheduled sessions worth more than running them unaided'); }

// ---------------------------------------------------------------- the taper before a booked race, and peaking
{ const C = career(1), h = C.horses[0]; C.day = 140; K.setPlan(C, 'h0', 'speed', 3); C.booking = { hid: 'h0', day: 142, ev: 'x' }; day(C, 140); ok(K.devRec(C, h).sessions === 0, 'two days before a booked race the plan tapers (no session)');
  day(C, 141); ok(K.devRec(C, h).sessions === 0, 'and the day before the race too'); C.booking = { hid: 'other', day: 142, ev: 'x' }; day(C, 143); ok(K.devRec(C, h).sessions >= 1 || K.dowOf(143) === 0, 'a booking for another horse does not stop this one'); }
{ const C = career(1), h = C.horses[0]; h.fitness = 100; K.devRec(C, h).load = 0; ok(K.peaking(C, h) && K.raceAttrs(C, h).peak, 'a fresh, fit, unloaded horse is peaking');
  const ra = K.raceAttrs(C, h); ok(ra.attrs.top >= h.attrs.top && ra.attrs.top <= Math.round(h.attrs.top * 1.021) + 1 && ra.attrs.tem === h.attrs.tem, 'peaking gives at most about +2% to the racing attributes only (never composure or the others)');
  K.devRec(C, h).load = 60; ok(!K.peaking(C, h), 'a loaded horse is not peaking'); h.fitness = 40; K.devRec(C, h).load = 0; const tr = K.raceAttrs(C, h); ok(tr.pen > 0 && tr.pen <= 0.06 + 1e-9 && tr.attrs.top < h.attrs.top, 'a tired horse races a little below its ratings, by no more than 6% (' + Math.round(tr.pen * 1000) / 10 + '%)');
  h.fitness = 0; ok(K.raceAttrs(C, h).pen <= 0.06 + 1e-9, 'even at zero fitness the penalty is capped'); h.fitness = NaN; ok(Number.isFinite(K.raceAttrs(C, h).attrs.top), 'a corrupted fitness value cannot produce NaN ratings');
  const before = J(h.attrs); K.raceAttrs(C, h); ok(J(h.attrs) === before, 'working out the race condition never alters the saved attributes'); }

// ---------------------------------------------------------------- the report
{ const C = career(1), h = C.horses[0]; C.day = 140; K.setPlan(C, 'h0', 'speed', 2); for (let i = 0; i < 20; i++) { day(C, 140 + i); h.fitness = 100; }
  const r = K.devReport(C, h); ok(r.rows.length === 8 && r.rows.every(x => x.v <= x.pot && x.rem === x.pot - x.v && x.prog >= 0 && x.prog < 1), 'the report lists all eight attributes with value, potential, remaining and progress to the next point');
  ok(r.remaining === r.rows.reduce((a, x) => a + x.rem, 0) && r.pctOfPotential > 0 && r.pctOfPotential <= 100 && ['peaking', 'overworked', 'sore', 'steady'].includes(r.form), 'the report gives total remaining headroom, percent of potential and a plain form word');
  ok(r.log.length > 0 && r.log.length <= 7 && r.sessions >= 10, 'it carries a short log of recent sessions and the session count'); }

// ---------------------------------------------------------------- calendar integration: advance() runs the plan, saves stay valid
{ const C = career(2); C.cal.events.forEach(e => { if (e.kind === 'round') e.day = 99999; }); K.setPlan(C, 'h0', 'balanced', 2); K.setPlan(C, 'h1', 'rest', 1); const a0 = sum(C.horses[0]) + prog(C, C.horses[0]), b0 = sum(C.horses[1]);
  K.advance(C, 28, { force: true }); ok(sum(C.horses[0]) + prog(C, C.horses[0]) > a0 && sum(C.horses[1]) <= b0 + 1, 'advancing the calendar runs each horse\'s own plan (the training one grew; the resting one did not)');
  ok(K.audit(C).length === 0 && C.cash >= 0, 'the ledger still audits clean and cash is never negative'); const copy = JSON.parse(JSON.stringify(C)); K.migrate(copy, { from: 4 }); ok(J(copy.farm.dev) === J(C.farm.dev), 'development state survives a save / load round trip unchanged'); }
{ // fuzz
  const C = career(3); let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) | 0, (seed >>> 0) / 4294967296); let bad = 0; const plans = Object.keys(K.PLANS);
  for (let i = 0; i < 2500; i++) { const a = (rnd() * 6) | 0, h = C.horses[(rnd() * 3) | 0];
    if (a === 0) K.setPlan(C, h.id, plans[(rnd() * plans.length) | 0], 1 + ((rnd() * 3) | 0)); else if (a === 1) K.advance(C, 1 + ((rnd() * 10) | 0), { force: true }); else if (a === 2) K.drillReward(C, h.id, ['gate', 'accel', 'sprint', 'endurance', 'settle', 'agility'][(rnd() * 6) | 0], rnd()); else if (a === 3) h.fitness = Math.round(rnd() * 100); else if (a === 4) K.raceAttrs(C, h); else K.devReport(C, h);
    if (C.cash < 0 || C.horses.some(x => AK.some(k => x.attrs[k] > x.pot[k] || !Number.isFinite(x.attrs[k]) || x.attrs[k] < 0) || x.fitness < 0 || x.fitness > 100 || AK.some(k => { const p = K.devRec(C, x).prog[k]; return !(p >= 0 && p < 1); }))) bad++; }
  ok(bad === 0, 'attributes stay finite and within potential, progress within [0,1), fitness and cash in range through 2,500 random actions'); ok(K.audit(C).length === 0, 'the ledger audits clean after the fuzz run'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
