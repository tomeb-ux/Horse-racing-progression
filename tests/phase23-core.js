// Phase 23 rules (pure): season goals: modest one-off rewards computed from race histories, paid at most once per season and goal.
//   node tests/phase23-core.js
//   node tests/phase17-core.js
const K = require('../public/career-core.js'), A = require('../public/atmosphere.js'); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log(' ✗ ' + m); } };
const deep = o => JSON.stringify(o);
const mk = (id, name, o) => Object.assign({ id, name, foaled: 2020, age: 4, fitness: 90, composure: 70, attrs: { top: 70, acc: 70, end: 70, spr: 70, rec: 70, tem: 70, agi: 70, sta: 70 }, pot: { top: 85, acc: 85, end: 85, spr: 85, rec: 85, tem: 85, agi: 85, sta: 85 }, lastRaceDay: null }, o || {});
const base = n => { const C = { v: 4, seed: 777, stable: 'T', horses: Array.from({ length: n }, (_, i) => mk('h' + i, 'Horse ' + i)), active: 0, trophies: [], wins: 0, history: [], season: null, day: 9, cash: 1e5, farm: { dev: {} }, booking: null }; return C; };

const rng = s => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const run = (h, place, prize, day, off) => (h.history = h.history || []).push({ raceId: 'r' + h.history.length, name: 'R', place, field: 10, dnf: place === 0, dist: 1400, tier: 1, off: !!off, day, prize: prize || 0 });
{ const C = base(1), v = K.goalsOf(C); ok(v.goals.length === 6 && v.goals.every(g => !g.done && !g.paid && g.value === 0), 'a fresh career has six goals, none done'); ok(deep(K.claimGoals(C)) === '[]' && C.cash === base(1).cash, 'claiming with nothing done pays nothing'); }
{ const C = base(1), h = C.horses[0], d = C.day; run(h, 1, 20000, d); const v = K.goalsOf(C); ok(v.goals.find(g => g.id === 'win1').done && !v.goals.find(g => g.id === 'win3').done, 'one win completes "win a race" only');
  const before = C.cash, paid = K.claimGoals(C); ok(paid.length === 1 && paid[0].id === 'win1' && paid[0].reward === 3000, 'one win pays exactly the win goal ($3,000)'); ok(C.cash > before, 'cash went up');
  const c1 = C.cash; ok(K.claimGoals(C).length === 0 && C.cash === c1, 'claiming again the same season pays nothing more (idempotent)'); ok(K.goalsOf(C).goals.find(g => g.id === 'win1').paid, 'and it shows as paid'); }
{ const C = base(1), h = C.horses[0], d = C.day; for (let i = 0; i < 3; i++) run(h, 1, 25000, d + i); K.claimGoals(C); const v = K.goalsOf(C); ok(['start3', 'win1', 'win3', 'prize60'].every(id => v.goals.find(g => g.id === id).paid), 'three wins and $75,000 pay start3, win1, win3 and prize60'); ok(v.earned === 1500 + 3000 + 6000 + 5000, `earned ${v.earned}`); }
{ const C = base(2), a = C.horses[0], b = C.horses[1], d = C.day; run(a, 1, 1000, d); let v = K.goalsOf(C); ok(v.goals.length === 7 && !v.goals.find(g => g.id === 'twowin').done, 'with two horses there is a seventh goal'); run(b, 1, 1000, d + 1); v = K.goalsOf(C); ok(v.goals.find(g => g.id === 'twowin').done, 'winning with both completes it'); }
{ const C = base(1), h = C.horses[0], d = C.day; run(h, 1, 100, d); K.claimGoals(C); const c1 = C.cash; C.day += 400; const v = K.goalsOf(C); ok(v.season !== K.goalsOf(Object.assign({}, C, { day: d })).season && v.goals.every(g => !g.done && !g.paid), 'a new season starts all over again'); }
{ const C = base(1), h = C.horses[0], d = C.day; run(h, 1, 100, d); const A = deep(C); K.goalsOf(C); ok(deep(C) === A, 'goalsOf is read-only'); }
// fuzz: random histories and claims never pay a goal twice in a season and never break the ledger
{ const R = rng(23); let bad = 0, n = 0; for (let t = 0; t < 300; t++) { const C = base(1 + (R() * 3 | 0)); const paidKeys = new Set(); for (let step = 0; step < 40; step++) { const h = C.horses[R() * C.horses.length | 0], d = C.day + (R() * 30 | 0); if (R() < 0.6) run(h, R() < 0.2 ? 0 : 1 + (R() * 8 | 0), R() < 0.5 ? 10000 * (R() * 4 | 0) : 0, d, R() < 0.5); if (R() < 0.3) { C.day += R() * 20 | 0; const sn = K.goalsOf(C).season; for (const p of K.claimGoals(C)) { const k = sn + ':' + p.id; n++; if (paidKeys.has(k)) bad++; paidKeys.add(k); } } }
    if (K.audit(C).length) bad++; } ok(bad === 0, `${n} payments over 300 random careers: none twice, ledger healthy`); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
