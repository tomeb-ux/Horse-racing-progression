// Phase 7 rules (public/career-core.js): the stable economy — scaled purses, entry fees, weekly bills charged on calendar advance, sponsorship, milestones,
// the stable club advance / debt, and atomic, once-only money.   node tests/phase7-core.js
const S = require('../public/season.js'), K = require('../public/career-core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const clone = o => JSON.parse(JSON.stringify(o)), J = o => JSON.stringify(o);
const mkHorse = (id, r) => ({ id, name: id, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, pot: { top: r + 10, acc: r + 10, end: r + 10, spr: r + 10, rec: r + 10, tem: r + 10, agi: r + 10, sta: r + 10 }, look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, silk: '#d62828', silk2: '#fff', silkPat: 'hoops', xp: 0, trainPts: 0, lvl: 1, xpFrac: 0, races: 0, wins: 0, places: 0, podiums: 0, history: [], born: 1 });
function career(n) { const C = K.fresh(31337); C.horses = Array.from({ length: n == null ? 1 : n }, (_, i) => mkHorse('h' + i, 68)); S.migrate(C); K.migrate(C, { from: 4 }); for (const h of C.horses) K.fillHorse(h, C, { age: 4 }); C.cal.events.forEach(e => { if (e.kind === 'round') e.day = 9999; }); return C; }
const E = K.ECON;

// ---------------------------------------------------------------- purses and entry fees
ok(K.purseOf({ prize: '$40,000' }) === 12000 && K.purseOf({ prize: '$100,000', tier: 1 }) === 30000 && K.purseOf({ prize: '$300,000', tier: 2 }) === 54000 && K.purseOf({ prize: '$5,000,000', tier: 3 }) === 300000 && K.purseOf({ prize: '$20,000,000', tier: 4 }) === 1000000, 'purses are the face value × a per-tier scale (Provincial 0.30, Metropolitan 0.18, Group 1 0.06, Everest / Cup 0.05)');
ok(K.purseOf({}) === 0 && K.entryFee({}) === 0 && K.purseLabel({}) === '—', 'a race without a purse (an optional race) pays nothing and has no entry fee');
ok(K.entryFee({ prize: '$40,000' }) === 500 && K.entryFee({ prize: '$5,000,000', tier: 3 }) === 12000 && K.entryFee({ prize: '$1,000', tier: 1 }) === E.ENTRY_MIN, 'entry fee ≈ 4% of the purse, never under the minimum');
ok(K.purseLabel({ prize: '$40,000' }) === '$12,000', 'the label shows the real (scaled) purse');
for (const d of S.DIVS) for (const r of d.rounds) { const p = K.purseOf(r), f = K.entryFee(r); if (!(p > 0 && f > 0 && f < p * 0.1)) ok(false, 'purse/fee out of range for ' + r.id); }
{ const first = S.DIVS[0].rounds[0], p = K.purseOf(first); ok(K.prizeFor(first, 1) > K.entryFee(first) * 5, 'winning an early round pays many times its entry fee'); }

// ---------------------------------------------------------------- the weekly bill
{ const C = career(1), b = K.weeklyBill(C); ok(b.cost === E.HORSE_WEEK + E.PROPERTY_WEEK && b.items.length === 2 && b.sponsor === 0, 'one horse on a basic property: feed & care + property upkeep = $' + b.cost + '/week');
  C.horses.push(mkHorse('h1', 70)); C.fac.track = 2; ok(K.weeklyBill(C).cost === 2 * E.HORSE_WEEK + E.PROPERTY_WEEK + 2 * E.FAC_WEEK, 'a second horse and an upgraded facility raise the bill');
  C.staff.trainer = { wage: 900 }; ok(K.weeklyBill(C).items.some(x => x.k === 'wages' && x.amount === 900), 'staff wages appear when staff exist');
  ok(K.sponsorWeekly(0) === 0 && K.sponsorWeekly(10) === 250 && K.sponsorWeekly(30) === 600 && K.sponsorWeekly(60) === 1200 && K.sponsorWeekly(500) === 2500, 'sponsorship grows with reputation'); }

// ---------------------------------------------------------------- bills are charged as the calendar advances, once per week
{ const C = career(1); C.day = 0; K.econOf(C).paidWeek = 0; const cash0 = C.cash, wk = E.HORSE_WEEK + E.PROPERTY_WEEK;
  let r = K.advance(C, 3, { force: true }); ok(r.ok && r.bills.length === 0 && C.cash === cash0, 'moving within a week charges nothing');
  r = K.advance(C, 5, { force: true }); ok(r.bills.length === 1 && C.cash === cash0 - wk && C.day === 8 && C.ledger[C.ledger.length - 1].kind === 'upkeep', 'crossing a week boundary charges exactly one bill (one ledger line)');
  const snap = J(C); r = K.chargeWeeks(C, 3, 8); ok(r.length === 0 && J(C) === snap, 'charging the same weeks again does nothing (idempotent)');
  r = K.advance(C, 21, { force: true }); ok(r.bills.length === 3 && C.cash === cash0 - 4 * wk, 'three more weeks → three more bills'); ok(K.audit(C).length === 0, 'the ledger audits clean'); }
{ const C = career(1); C.day = 0; K.econOf(C).paidWeek = 0; K.apply(C, 'test:burn', -(C.cash - 500), 'buy', 'spend down'); K.advance(C, 7, { force: true });
  ok(C.cash === 0 && K.econOf(C).debt === (E.HORSE_WEEK + E.PROPERTY_WEEK) - 500, 'a bill the stable cannot pay is part-paid and the rest is owed to the club (never a negative balance)');
  K.advance(C, 70, { force: true }); ok(C.cash === 0 && K.econOf(C).debt === 11 * (E.HORSE_WEEK + E.PROPERTY_WEEK) - 500 && K.audit(C).length === 0, 'with no cash every week adds to what is owed; cash stays at 0'); }
{ const C = career(1); C.day = 0; K.econOf(C).paidWeek = 0; C.rep = 60; const cash0 = C.cash; K.advance(C, 7, { force: true }); ok(C.cash === cash0 - (E.HORSE_WEEK + E.PROPERTY_WEEK) + 1200, 'sponsorship income arrives with the weekly bill'); }
{ const old = career(1); old.day = 100; delete old.econ; K.migrate(old, { from: 4 }); ok(K.econOf(old).paidWeek === 14 && K.econOf(old).debt === 0, 'an existing career gains its economy record with no retroactive bills'); const c0 = old.cash; K.advance(old, 3, { force: true }); ok(old.cash === c0, 'and nothing is charged for weeks already past'); }

// ---------------------------------------------------------------- entry fees
{ const C = career(1), m = S.DIVS[0].rounds[0], key = 'entry:s1:maiden:h0', fee = K.entryFee(m), cash0 = C.cash;
  let r = K.payEntry(C, key, m, 'h0'); ok(r.ok && r.fee === fee && C.cash === cash0 - fee && C.ledger[C.ledger.length - 1].kind === 'entry', 'entering a round charges the entry fee through the ledger');
  r = K.payEntry(C, key, m, 'h0'); ok(r.ok && r.already && C.cash === cash0 - fee, 'the same race instance is never charged twice');
  const C2 = career(1); C2.cash = fee - 1; const s2 = J([C2.cash, C2.ledger, C2.txn]); r = K.payEntry(C2, key, m, 'h0'); ok(!r.ok && r.reason === 'cash' && J([C2.cash, C2.ledger, C2.txn]) === s2, 'without the cash the entry is refused and nothing changes');
  ok(K.payEntry(career(1), 'entry:o0:x:h0', {}, 'h0').fee === 0, 'a free (optional) race charges nothing'); }

// ---------------------------------------------------------------- the stable club
{ const C = career(1); ok(!K.clubOffer(C).ok && K.clubOffer(C).reason === 'not-needed', 'no advance while cash is comfortable');
  C.cash = 1000; ok(K.clubOffer(C).ok, 'an advance is offered when cash is low');
  let r = K.clubAdvance(C); ok(r.ok && C.cash === 1000 + E.CLUB.AMOUNT && K.econOf(C).debt === E.CLUB.AMOUNT && C.ledger[C.ledger.length - 1].kind === 'advance', 'the advance adds cash and the same amount of debt');
  C.cash = 500; r = K.clubAdvance(C); ok(!r.ok && r.reason === 'used' && C.cash === 500, 'only one advance per season');
  C.day = K.seasonStartDay(2) + 2; ok(K.clubOffer(C).ok, 'a new season brings a new allowance'); }
{ const C = career(1); K.econOf(C).debt = 5000; const cash0 = C.cash;
  let r = K.repayFromPrize(C, 'prize:a', 7200); ok(r.paid === 3600 && K.econOf(C).debt === 1400 && C.cash === cash0 - 3600, 'half of a prize repays the club');
  r = K.repayFromPrize(C, 'prize:b', 7200); ok(r.paid === 1400 && K.econOf(C).debt === 0, 'repayment never exceeds what is owed');
  r = K.repayFromPrize(C, 'prize:c', 7200); ok(r.paid === 0, 'nothing is taken once the debt is cleared'); r = K.repayFromPrize(C, 'prize:a', 7200); ok(r.paid === 0, 'the same prize never repays twice'); }

// ---------------------------------------------------------------- reputation and milestones (once, ever)
{ const C = career(1), t3 = { tier: 3 }, t1 = { tier: 1 };
  ok(K.addRep(C, 1, t1, true) === 4 && K.addRep(C, 1, { tier: 2 }, true) === 8 && K.addRep(C, 1, t3, true) === 15 && K.addRep(C, 2, t1, true) === 1 && K.addRep(C, 5, t1, true) === 0 && K.addRep(C, 1, {}, false) === 1, 'reputation grows with results (more for bigger races)');
  C.wins = 1; let m = K.milestones(C, 1, t1); ok(m.length === 1 && m[0].id === 'win1' && m[0].amount === 2000, 'the first win pays a milestone bonus');
  m = K.milestones(C, 1, t1); ok(m.length === 0, 'a milestone pays once, ever'); C.wins = 5; m = K.milestones(C, 1, t3); ok(m.map(x => x.id).sort().join() === 'g1,stakes,win5', 'one big win can complete several milestones (5 wins, first stakes, first Group 1)');
  ok(K.audit(C).length === 0, 'bonuses pass the audit'); }

// ---------------------------------------------------------------- fuzz: random money operations never break an invariant
{ let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; const C = career(2); C.day = 0; K.econOf(C).paidWeek = 0; const m = S.DIVS[1].rounds[0]; let bad = 0, spent = 0;
  for (let i = 0; i < 4000; i++) { const a = (rnd() * 8) | 0, key = 'k' + ((rnd() * 40) | 0);
    if (a === 0) K.advance(C, 1 + ((rnd() * 20) | 0), { force: true }); else if (a === 1) K.payEntry(C, 'entry:' + key, m, 'h0'); else if (a === 2) K.awardPrize(C, 'prize:' + key, m, 1 + ((rnd() * 5) | 0), 'h0'); else if (a === 3) K.clubAdvance(C); else if (a === 4) K.repayFromPrize(C, 'prize:' + key, 1000 + ((rnd() * 20000) | 0)); else if (a === 5) { C.wins = (C.wins | 0) + 1; K.milestones(C, 1, m); } else if (a === 6) K.addRep(C, 1, m, true); else K.groom(C, 'h0');
    if (C.cash < 0 || !isFinite(C.cash) || K.econOf(C).debt < 0 || !isFinite(K.econOf(C).debt)) bad++; }
  ok(bad === 0, 'cash and the club debt stay valid (never negative) through 4,000 random money operations'); ok(K.audit(C).length === 0, 'the ledger audits clean after the fuzz run');
  const back = JSON.parse(JSON.stringify(C)); ok(J(K.econOf(back)) === J(K.econOf(C)), 'the economy record round-trips through JSON'); }

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
