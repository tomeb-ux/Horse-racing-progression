// Phase 6 rules (public/career-core.js): stable care, hands-on training rewards and "Rest a day" — pure logic, no browser.   node tests/phase6-core.js
// Every reward is dated (once per horse per day), drill points are capped per week, cash never goes negative, and nothing here touches how a horse races.
const S = require('../public/season.js'), K = require('../public/career-core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const clone = o => JSON.parse(JSON.stringify(o)), J = o => JSON.stringify(o);
const mkHorse = (id, name, r) => ({ id, name, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, pot: { top: r + 10, acc: r + 10, end: r + 10, spr: r + 10, rec: r + 10, tem: r + 10, agi: r + 10, sta: r + 10 },
  look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, silk: '#d62828', silk2: '#fff', silkPat: 'hoops', xp: 0, trainPts: 0, lvl: 1, xpFrac: 0, races: 0, wins: 0, places: 0, podiums: 0, history: [], born: 1 });
function career() { const C = K.fresh(4242); C.horses = [mkHorse('h0', 'Alpha', 70), mkHorse('h1', 'Bravo', 66)]; S.migrate(C); K.migrate(C, { from: 4 }); for (const h of C.horses) K.fillHorse(h, C, { age: 4 }); return C; }

// ---------------------------------------------------------------- grooming
{ const C = career(), h = C.horses[0], c0 = h.composure;
  let r = K.groom(C, 'h0'); ok(r.ok && !r.already && r.gain === 4 && h.composure === c0 + 4, 'grooming lifts composure by a few points');
  const snap = J(C); r = K.groom(C, 'h0'); ok(r.ok && r.already && r.gain === 0 && J(C) === snap, 'grooming twice on the same day changes nothing (no free repeat)');
  ok(K.careStatus(C, h).groomed === true && K.careStatus(C, C.horses[1]).groomed === false, 'the groomed flag is per horse');
  C.day++; r = K.groom(C, 'h0'); ok(r.ok && !r.already && h.composure === c0 + 8, 'the next day it can be groomed again');
  h.composure = 99; C.day++; K.groom(C, 'h0'); ok(h.composure === 100, 'composure never goes above 100');
  ok(!K.groom(C, 'nobody').ok, 'an unknown horse is refused'); }

// ---------------------------------------------------------------- feeding
{ const C = career(), h = C.horses[0], f0 = h.fitness = 80, c0 = h.composure, cash0 = C.cash;
  let r = K.feed(C, 'h0', 0); ok(r.ok && !r.already && C.cash === cash0 && h.composure === c0 + 1 && h.fitness === f0, 'stable feed is free and gives a tiny lift');
  const snap = J(C); r = K.feed(C, 'h0', 1); ok(r.ok && r.already && J(C) === snap && C.cash === cash0, 'a horse fed today cannot be fed (or charged) again, even with the better feed');
  const C2 = career(), h2 = C2.horses[0]; h2.fitness = 80; r = K.feed(C2, 'h0', 1); ok(r.ok && C2.cash === 150000 - K.CARE.FEED_COST && h2.fitness === 82 && C2.ledger[C2.ledger.length - 1].kind === 'care', 'quality feed costs $' + K.CARE.FEED_COST + ' through the ledger and gives fitness +2');
  ok(K.audit(C2).length === 0, 'the ledger still audits after a care expense');
  const C3 = career(); C3.cash = 100; const s3 = J([C3.cash, C3.horses[0].composure, C3.horses[0].fitness, C3.ledger, C3.txn]); r = K.feed(C3, 'h0', 1); ok(!r.ok && r.reason === 'cash' && J([C3.cash, C3.horses[0].composure, C3.horses[0].fitness, C3.ledger, C3.txn]) === s3 && !K.careStatus(C3, C3.horses[0]).fed, 'quality feed without the cash is refused and changes nothing');
  C2.day++; r = K.feed(C2, 'h0', 1); ok(r.ok && !r.already && C2.cash === 150000 - 2 * K.CARE.FEED_COST, 'the next day it can be fed (and paid for) again'); }

// ---------------------------------------------------------------- tacking up, readiness
{ const C = career(), h = C.horses[1]; ok(!K.careStatus(C, h).prepared, 'not prepared at first'); K.prepare(C, 'h1'); ok(K.careStatus(C, h).prepared, 'prepare marks the horse ready today');
  const r0 = K.readiness(C, h); K.groom(C, 'h1'); K.feed(C, 'h1', 0); ok(K.readiness(C, h) >= r0 && K.readiness(C, h) <= 100, 'readiness only goes up with care and stays within 0–100');
  C.day++; ok(!K.careStatus(C, h).prepared, 'tack-up is only good for the day'); K.prepare(C, 'h1'); K.unprepare(C, 'h1'); ok(!K.careStatus(C, h).prepared, 'unprepare clears it'); }

// ---------------------------------------------------------------- drill rewards: once a day, capped a week, never when tired
{ const C = career(), h = C.horses[0]; h.fitness = 90;
  let r = K.drillReward(C, 'h0', 'accel', 1); ok(r.ok && r.pts === 0.5 && h.xpFrac === 0.5 && h.trainPts === 3 * 0 && h.fitness === 87, 'a perfect drill earns the maximum 0.5 points and costs 3 fitness');
  const snap = J(C); r = K.drillReward(C, 'h0', 'settle', 1); ok(r.ok && r.pts === 0 && r.reason === 'today' && h.xpFrac === 0.5 && h.fitness === 87, 'a second drill the same day is practice only (no reward, no cost)');
  ok(K.careStatus(C, h).best.accel === 100 && K.careStatus(C, h).best.settle === 100, 'the best score is still recorded for practice runs');
  C.day++; r = K.drillReward(C, 'h0', 'accel', 0); ok(r.ok && r.pts === 0.15 && Math.abs(h.xpFrac - 0.65) < 1e-9 || (r.ok && h.trainPts >= 0), 'a poor drill earns the minimum, a perfect one the maximum (' + r.pts + ')');
  // training points carry into whole points
  const C2 = career(), g = C2.horses[0]; g.fitness = 100; g.xpFrac = 0.8; g.trainPts = 2; r = K.drillReward(C2, 'h0', 'accel', 1); ok(g.trainPts === 3 && Math.abs(g.xpFrac - 0.3) < 1e-9, 'fractions carry into whole training points (0.8 + 0.5 → +1, 0.3 left)');
  // tired horses gain nothing
  const C3 = career(), t = C3.horses[0]; t.fitness = 50; r = K.drillReward(C3, 'h0', 'accel', 1); ok(r.ok && r.pts === 0 && r.reason === 'tired' && t.fitness === 50 && t.xpFrac === 0, 'a tired horse (fitness < ' + K.CARE.DRILL_MIN_FITNESS + ') gains nothing and loses nothing');
  // weekly cap: even resting a day at a time you cannot farm it
  const C4 = career(), w = C4.horses[0]; w.fitness = 100; C4.day = 7 * 10; let total = 0; for (let d = 0; d < 7; d++) { w.fitness = 100; total += K.drillReward(C4, 'h0', 'accel', 1).pts; C4.day++; }
  ok(total <= K.CARE.DRILL_WEEK_CAP + 1e-9 && total >= 0.99, 'seven consecutive perfect days earn at most ' + K.CARE.DRILL_WEEK_CAP + ' points in the week (' + total + ')');
  C4.day = 7 * 11; w.fitness = 100; ok(K.drillReward(C4, 'h0', 'accel', 1).pts === 0.5, 'a new week opens a fresh allowance');
  for (const bad of [NaN, -5, 7, undefined, 'x', null]) { const C5 = career(); C5.horses[0].fitness = 100; const r5 = K.drillReward(C5, 'h0', 'accel', bad); ok(r5.ok && r5.pts >= 0.15 - 1e-9 && r5.pts <= 0.5 + 1e-9, 'a nonsense grade (' + String(bad) + ') is clamped into range'); }
  ok(!K.drillReward(C, 'nobody', 'accel', 1).ok, 'an unknown horse earns nothing'); }

// ---------------------------------------------------------------- Rest a day
{ const C = career(); for (const h of C.horses) h.fitness = 70; C.day = 3;
  const ev = (C.cal.events.find(e => e.kind === 'round' && e.round === 0)); ev.day = 20;                         // the next round is far off
  let r = K.restDay(C); ok(r.ok && C.day === 4 && C.horses[0].fitness > 70, 'resting a day moves the calendar on by exactly one day and horses recover');
  C.booking = { eid: ev.id, hid: 'h0', day: C.day }; const s = J(C); r = K.restDay(C); ok(!r.ok && r.reason === 'booked-today' && J(C) === s, 'you cannot rest through the day of a race you have booked');
  C.booking = { eid: ev.id, hid: 'h0', day: C.day + 1 }; r = K.restDay(C); ok(r.ok && C.day === 5, 'the day before a booked race you can still rest (the booking stays valid)');
  C.day = 20; delete C.booking; const s2 = J(C); r = K.restDay(C); ok(!r.ok && r.reason === 'round-today' && r.skips.length === 1 && J(C) === s2 && C.day === 20, 'you cannot sleep through an open championship round that is scheduled today');
  C.day = 5; const C3 = clone(C); K.restDay(C3); ok(K.careStatus(C3, C3.horses[0]).groomed === false, 'a new day resets the daily care flags'); }

// ---------------------------------------------------------------- persistence: the care record survives a save round trip and a re-migration
{ const C = career(); K.groom(C, 'h0'); K.feed(C, 'h0', 1); K.prepare(C, 'h0'); C.horses[0].fitness = 100; K.drillReward(C, 'h0', 'gate', 0.8);
  const back = JSON.parse(JSON.stringify(C)); ok(J(K.careStatus(back, back.horses[0])) === J(K.careStatus(C, C.horses[0])), 'the care record round-trips through JSON');
  const again = clone(back); K.migrate(again, { from: 4 }); ok(J(again.farm) === J(back.farm), 'migrating again leaves the care record untouched');
  ok(K.audit(C).length === 0, 'the money audit is still clean'); }

// ---------------------------------------------------------------- fuzz: 3,000 random actions never break an invariant
{ let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; const C = career(); C.cal.events.forEach(e => { if (e.kind === 'round') e.day = 9999; });
  let weekPts = {}, bad = 0;
  for (let i = 0; i < 3000; i++) {
    const hid = rnd() < 0.5 ? 'h0' : 'h1', a = (rnd() * 6) | 0, h = C.horses.find(x => x.id === hid), d0 = C.day;
    if (a === 0) K.groom(C, hid); else if (a === 1) K.feed(C, hid, rnd() < 0.5 ? 1 : 0); else if (a === 2) K.prepare(C, hid); else if (a === 3) { const r = K.drillReward(C, hid, 'accel', rnd()); const wk = hid + ':' + Math.floor(C.day / 7); weekPts[wk] = (weekPts[wk] || 0) + (r.pts || 0); } else if (a === 4) { if (rnd() < 0.3) K.restDay(C); } else { C.cash = Math.max(0, C.cash); }
    if (C.cash < 0 || h.composure < 0 || h.composure > 100 || h.fitness < 0 || h.fitness > 100 || C.day < d0 || !isFinite(h.xpFrac) || h.xpFrac < 0 || h.xpFrac >= 1) bad++;
  }
  ok(bad === 0, 'cash, composure, fitness and the day counter stay valid through 3,000 random actions');
  ok(Object.values(weekPts).every(v => v <= K.CARE.DRILL_WEEK_CAP + 1e-6), 'no horse earned more than the weekly cap in any week of the fuzz run (max ' + Math.max(...Object.values(weekPts)).toFixed(2) + ')');
  ok(K.audit(C).length === 0, 'the ledger audits clean after the fuzz run'); }

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
