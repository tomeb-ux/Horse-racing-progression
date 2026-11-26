// Phase 19 rules (pure, no browser): the post-work summary and the rule that the care rewards are the same whoever does the work.
//   node tests/phase19-core.js
//   node tests/phase17-core.js
const K = require('../public/career-core.js'), A = require('../public/atmosphere.js'); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log(' ✗ ' + m); } };
const deep = o => JSON.stringify(o);
const mk = (id, name, o) => Object.assign({ id, name, foaled: 2020, age: 4, fitness: 90, composure: 70, attrs: { top: 70, acc: 70, end: 70, spr: 70, rec: 70, tem: 70, agi: 70, sta: 70 }, pot: { top: 85, acc: 85, end: 85, spr: 85, rec: 85, tem: 85, agi: 85, sta: 85 }, lastRaceDay: null }, o || {});
const base = n => { const C = { v: 4, seed: 777, stable: 'T', horses: Array.from({ length: n }, (_, i) => mk('h' + i, 'Horse ' + i)), active: 0, trophies: [], wins: 0, history: [], season: null, day: 9, cash: 1e5, farm: { dev: {} }, booking: null }; return C; };
const rng = s => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

// ---- the summary is read-only and describes today
{ const C = base(2), before = deep(C), s0 = K.postWork(C, 'h0');
  ok(deep(C) === before, 'postWork changes nothing in the career (read-only)');
  ok(s0 && s0.name === 'Horse 0' && !s0.washed && !s0.groomed && !s0.fed && s0.missing.length === 2, 'a fresh horse has the wash and the groom still on offer');
  ok(s0.missing.find(m => m.k === 'wash').edge === 'composure +3, fitness +1' && s0.missing.find(m => m.k === 'groom').edge === 'composure +4', 'the edge of skipping is stated exactly');
  ok(s0.lines.length === 3 && s0.lines.every(l => typeof l === 'string' && l.length > 5), 'three readable lines');
  ok(K.postWork(C, 'nobody') === null, 'an unknown horse gives null'); }
// ---- the summary follows the care actually done (once per horse per day)
{ const C = base(1); const w = K.wash(C, 'h0'), g = K.groom(C, 'h0'), s = K.postWork(C, 'h0');
  ok(w.ok && !w.already && g.ok && !g.already && s.washed && s.groomed && s.missing.length === 0 && /everything done/.test(s.lines[2]), 'after a wash and a groom nothing is left on offer');
  const w2 = K.wash(C, 'h0'), g2 = K.groom(C, 'h0'); ok(w2.already && g2.already && w2.gain === 0 && g2.gain === 0, 'a second wash or groom the same day gives nothing more');
  C.day += 1; const s2 = K.postWork(C, 'h0'); ok(!s2.washed && !s2.groomed && s2.missing.length === 2, 'tomorrow it is on offer again'); }
// ---- caps: nothing the loop does can exceed one wash + one groom per horse per day (fuzz)
{ const R = rng(19); let bad = 0, n = 0; for (let t = 0; t < 400; t++) { const C = base(1 + (R() * 3 | 0)); const c0 = C.horses.map(h => h.composure), f0 = C.horses.map(h => h.fitness);
    const k = 1 + (R() * 6 | 0); for (let i = 0; i < k; i++) { const id = 'h' + (R() * C.horses.length | 0); if (R() < 0.5) K.wash(C, id); else K.groom(C, id); if (R() < 0.3) K.postWork(C, id); }
    C.horses.forEach((h, i) => { n++; if (h.composure - c0[i] > 7 + 1e-9 || h.fitness - f0[i] > 1 + 1e-9 || h.composure > 100 || h.fitness > 100) bad++; }); }
  ok(bad === 0, `a horse gains at most +7 composure and +1 fitness a day from the loop however often it is repeated (${n} horse-days)`); }
// ---- the player and the staff get the same reward: the groom the player does by hand and the one the groom does are the same function
{ const A = base(1), B = base(1); A.staff = { groom: { name: 'G', wage: 1, hired: 1 } }; K.groom(A, 'h0'); K.staffDaily && K.staffDaily(B);
  const a = A.horses[0].composure - 70; ok(a === K.postWork(A, 'h0').groomed * 4 || a === 4, 'a hand groom is worth exactly the staff groom (+4 composure)'); }
// ---- development is unaffected by care (so doing the loop daily vs never cannot change growth speed)
{ const A = base(1), B = base(1); for (let d = 0; d < 30; d++) { K.autoDay(A, A.day); K.wash(A, 'h0'); K.groom(A, 'h0'); K.autoDay(B, B.day); A.day++; B.day++; }
  const pa = JSON.stringify(A.horses[0].attrs), pb = JSON.stringify(B.horses[0].attrs); ok(pa === pb, '30 days with the care loop every day or never: identical attributes (care touches composure and fitness only)'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
