// Phase 8 rules (public/career-core.js): facilities (levels 0–3) and staff (trainer, groom, vet) — prices, capped effects, wages in the weekly bill, daily staff care.   node tests/phase8-core.js
const S = require('../public/season.js'), K = require('../public/career-core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const J = o => JSON.stringify(o);
const mkHorse = (id, r) => ({ id, name: id, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, pot: { top: r + 10, acc: r + 10, end: r + 10, spr: r + 10, rec: r + 10, tem: r + 10, agi: r + 10, sta: r + 10 }, look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, silk: '#d62828', silk2: '#fff', silkPat: 'hoops', xp: 0, trainPts: 0, lvl: 1, xpFrac: 0, races: 0, wins: 0, places: 0, podiums: 0, history: [], born: 1 });
function career(n) { const C = K.fresh(2024); C.horses = Array.from({ length: n || 2 }, (_, i) => mkHorse('h' + i, 68)); S.migrate(C); K.migrate(C, { from: 4 }); for (const h of C.horses) K.fillHorse(h, C, { age: 4 }); C.cal.events.forEach(e => { if (e.kind === 'round') e.day = 9999; }); K.apply(C, 'test:fund', 450000, 'gift', 'test funds'); return C; }
const F = K.FACILITIES, R = K.STAFFROLES;

// ---------------------------------------------------------------- facilities
{ const C = career(); const cash0 = C.cash;
  ok(Object.keys(F).sort().join() === K.FAC_KEYS.slice().sort().join(), 'every facility key of the save has a definition');
  let r = K.buyFacility(C, 'training'); ok(r.ok && r.level === 1 && r.cost === F.training.cost[0] && C.fac.training === 1 && C.cash === cash0 - r.cost && C.ledger[C.ledger.length - 1].kind === 'facility', 'buying level 1 charges the price through the ledger');
  r = K.buyFacility(C, 'training'); ok(r.ok && r.level === 2 && r.cost === F.training.cost[1], 'the next level costs more');
  K.buyFacility(C, 'training'); r = K.buyFacility(C, 'training'); ok(!r.ok && r.reason === 'max' && C.fac.training === 3, 'level 3 is the maximum');
  const snap = J([C.cash, C.fac, C.txn]); ok(K.buyFacility(C, 'nope').ok === false && J([C.cash, C.fac, C.txn]) === snap, 'an unknown facility changes nothing');
  const P = career(); K.apply(P, 'test:burn', -P.cash + 100, 'buy', 'burn'); const s2 = J([P.cash, P.fac, P.txn]); r = K.buyFacility(P, 'gates'); ok(!r.ok && r.reason === 'cash' && J([P.cash, P.fac, P.txn]) === s2, 'without the cash nothing is built and nothing changes');
  const Q = career(); Q.fac.gates = 1; ok(!K.buyFacility(Q, 'gates').ok || Q.fac.gates === 2, 'a level can only be bought once, in order');
  const Z = career(); K.buyFacility(Z, 'vet'); const again = Object.assign({}, Z.txn); Z.fac.vet = 0; r = K.buyFacility(Z, 'vet'); ok(!r.ok && r.reason === 'owned' && Z.fac.vet === 0, 'the same purchase key can never be paid twice (even if the level were reset)'); ok(K.audit(C).length === 0, 'the ledger audits clean'); }
{ const C = career(); ok(K.facEffects(C).train === 1 && K.facEffects(C).recover === 0 && K.facEffects(C).feedDiscount === 0 && K.facEffects(C).setback === 1, 'no facilities, no staff: no effects');
  for (const k of Object.keys(F)) { C.fac[k] = 3; } C.staff.trainer = { tier: 3, spec: 'all-rounder', wage: 2400 }; C.staff.vet = { tier: 3, spec: 'general', wage: 1800 };
  for (const f of ['top', 'acc', 'spr', 'agi', 'end', 'sta', 'tem']) ok(K.facEffects(C, f).train <= K.FAC_CAP + 1e-9, 'the total training boost is capped at ×' + K.FAC_CAP + ' even with everything maxed (' + f + ': ×' + K.facEffects(C, f).train.toFixed(2) + ')');
  ok(K.facEffects(C).setback >= 0.2 && K.facEffects(C).feedDiscount <= 0.45 + 1e-9, 'setbacks never vanish entirely and the feed discount is bounded'); }
{ const C = career(); C.staff.trainer = { tier: 2, spec: 'speed', wage: 1100 }; const sp = K.facEffects(C, 'acc').train, st = K.facEffects(C, 'end').train; ok(sp > st && st > 1, 'a speed trainer helps speed work more than stamina work (×' + sp.toFixed(2) + ' vs ×' + st.toFixed(2) + ')'); }

// ---------------------------------------------------------------- staff
{ const C = career(), cash0 = C.cash, w0 = K.weeklyBill(C).cost;
  let r = K.hireStaff(C, 'groom', 2, 'calm horses'); ok(r.ok && r.fee === 2 * R.groom.wage[1] && C.cash === cash0 - r.fee && C.staff.groom.tier === 2 && C.staff.groom.wage === R.groom.wage[1] && C.staff.groom.name, 'hiring a tier-2 groom costs two weeks of wages up front and records a named employee');
  ok(K.weeklyBill(C).cost === w0 + R.groom.wage[1] && K.weeklyBill(C).items.some(x => x.k === 'wages'), 'the wages join the one weekly bill');
  r = K.hireStaff(C, 'groom', 1); ok(!r.ok && r.reason === 'filled', 'a filled role cannot be hired twice');
  r = K.fireStaff(C, 'groom'); ok(r.ok && C.staff.groom === null && K.weeklyBill(C).cost === w0, 'letting them go ends the wages');
  r = K.hireStaff(C, 'groom', 2); ok(r.ok, 'the role can be filled again (a new hire key)'); ok(!K.hireStaff(C, 'banker', 1).ok, 'unknown roles are refused');
  const P = career(); K.apply(P, 'test:burn', -P.cash + 100, 'buy', 'burn'); ok(K.hireStaff(P, 'vet', 3).reason === 'cash' && P.staff.vet == null, 'without the cash nobody is hired'); ok(K.audit(C).length === 0, 'ledger clean'); }

// ---------------------------------------------------------------- daily effects as the calendar moves
{ const C = career(1); C.day = 0; K.econOf(C).paidWeek = 0; const h = C.horses[0]; h.composure = 50; h.fitness = 60; K.hireStaff(C, 'groom', 1);
  K.advance(C, 3, { force: true }); ok(h.composure === 62 || h.composure === 50 + 3 * 4 + 3 * 1, 'a groom brushes and feeds every day the calendar passes: 3 days → composure ' + h.composure);
  const D = career(1); D.day = 0; K.econOf(D).paidWeek = 0; D.horses[0].composure = 50; K.advance(D, 3, { force: true }); ok(D.horses[0].composure === 50, 'with no groom nothing changes by itself');
  const E = career(1); E.day = 0; K.econOf(E).paidWeek = 0; E.horses[0].fitness = 50; K.hireStaff(E, 'vet', 3); const f0 = E.horses[0].fitness; K.advance(E, 2, { force: true }); const F1 = career(1); F1.day = 0; K.econOf(F1).paidWeek = 0; F1.horses[0].fitness = 50; K.advance(F1, 2, { force: true }); ok(E.horses[0].fitness > F1.horses[0].fitness, 'a vet speeds recovery (' + E.horses[0].fitness + ' vs ' + F1.horses[0].fitness + ')');
  const G = career(1); G.day = 0; K.econOf(G).paidWeek = 0; G.fac.comfort = 3; G.horses[0].composure = 60; K.advance(G, 4, { force: true }); ok(G.horses[0].composure === 72, 'comfortable boxes steadily restore composure (+3 a day, to a limit of 90)'); G.horses[0].composure = 89; K.advance(G, 5, { force: true }); ok(G.horses[0].composure <= 90, 'and never beyond 90'); }

// ---------------------------------------------------------------- the wash bay
{ const C = career(1), h = C.horses[0], c0 = h.composure, f0 = h.fitness = 80; let r = K.wash(C, 'h0'); ok(r.ok && !r.already && h.composure === c0 + 3 && h.fitness === 81, 'a wash lifts composure +3 and fitness +1'); const snap = J(C); r = K.wash(C, 'h0'); ok(r.already && J(C) === snap, 'once a day'); C.day++; ok(!K.wash(C, 'h0').already, 'again the next day'); }

// ---------------------------------------------------------------- fuzz
{ let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; const C = career(2); C.day = 0; K.econOf(C).paidWeek = 0; let bad = 0;
  for (let i = 0; i < 3000; i++) { const a = (rnd() * 6) | 0, k = Object.keys(F)[(rnd() * 7) | 0], r2 = Object.keys(R)[(rnd() * 3) | 0];
    if (a === 0) K.buyFacility(C, k); else if (a === 1) K.hireStaff(C, r2, 1 + ((rnd() * 3) | 0)); else if (a === 2) K.fireStaff(C, r2); else if (a === 3) K.advance(C, 1 + ((rnd() * 15) | 0), { force: true }); else if (a === 4) K.wash(C, 'h0'); else C.horses.forEach(h => K.groom(C, h.id));
    if (C.cash < 0 || Object.values(C.fac).some(v => v < 0 || v > 3) || C.horses.some(h => h.composure < 0 || h.composure > 100 || h.fitness < 0 || h.fitness > 100)) bad++; }
  ok(bad === 0, 'cash, facility levels, composure and fitness stay in range through 3,000 random actions'); ok(K.audit(C).length === 0, 'the ledger audits clean after the fuzz run'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
