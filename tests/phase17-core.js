// Phase 17 rules (pure, no browser): the farm day schedule, the training-session rule it shares with autoDay, the farm clock's saved state, and the clock-driven light.
//   node tests/phase17-core.js
const K = require('../public/career-core.js'), A = require('../public/atmosphere.js'); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log(' ✗ ' + m); } };
const deep = o => JSON.stringify(o);
const mk = (id, name, o) => Object.assign({ id, name, foaled: 2020, age: 4, fitness: 90, composure: 70, attrs: { top: 70, acc: 70, end: 70, spr: 70, rec: 70, tem: 70, agi: 70, sta: 70 }, pot: { top: 85, acc: 85, end: 85, spr: 85, rec: 85, tem: 85, agi: 85, sta: 85 }, lastRaceDay: null }, o || {});
const base = n => { const C = { v: 4, seed: 777, stable: 'T', horses: Array.from({ length: n }, (_, i) => mk('h' + i, 'Horse ' + i)), active: 0, trophies: [], wins: 0, history: [], season: null, day: 9, cash: 1e5, farm: { dev: {} }, booking: null }; return C; };
const rng = s => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

// ---- the clock constants and formatting
ok(K.CLOCK.start === 5.5 && K.CLOCK.dusk === 19 && K.CLOCK.secPerDay === 600, 'the farm day runs 05:30 → 19:00 in ~600 s');
ok(K.fmtClock(5.5) === '05:30' && K.fmtClock(19) === '19:00' && K.fmtClock(6.25) === '06:15' && K.fmtClock(0) === '00:00' && K.fmtClock(12.999) === '13:00', 'times format as HH:MM');

// ---- the session rule agrees with autoDay (fuzz): sessionFor() on the state AFTER autoDay equals "a session really ran"
{ const R = rng(5); let n = 0, agree = 0;
  for (let t = 0; t < 600; t++) {
    const C = base(1 + (R() * 4 | 0)); C.day = 10 + (R() * 200 | 0);
    C.horses.forEach(h => { h.fitness = 40 + R() * 60; const r = C.farm.dev[h.id] = { plan: ['balanced', 'speed', 'stamina', 'rest', 'sprint'][R() * 5 | 0], int: 1 + (R() * 3 | 0), sore: R() < 0.2 ? 1 + (R() * 3 | 0) : 0, load: R() * 90 }; });
    if (R() < 0.3) C.booking = { hid: 'h0', day: C.day + (R() * 4 | 0) - 1, eid: 'x' };
    const pre = JSON.parse(JSON.stringify(C)), post = JSON.parse(JSON.stringify(C)); K.autoDay(post, post.day);
    for (const h of post.horses) { const was = (pre.farm.dev[h.id].sessions | 0), now = (post.farm.dev[h.id].sessions | 0), s = K.sessionFor(post, post.day, h.id); n++; if (s.works === (now > was)) agree++; else console.log('   mismatch', h.id, s, was, now, pre.farm.dev[h.id], pre.booking, pre.day); }
  } ok(agree === n, `sessionFor agrees with autoDay on ${n} random horse-days (${agree})`); }

// ---- the schedule
{ const C = base(5); C.horses[1].age = 2; C.horses[2].age = 9; C.horses[3].lastRaceDay = 8; C.farm.dev.h4 = { plan: 'balanced', int: 1, sore: 2, load: 10 };
  const before = deep(C), P = K.farmDay(C, C.day, 'clear'), P2 = K.farmDay(C, C.day, 'clear');
  ok(deep(C) === before, 'building the schedule never changes the career'); ok(deep(P) === deep(P2), 'the same career, day and weather give the same schedule');
  ok(P.horses.length === 5 && P.horses.every((h, i) => h.idx === i), 'one entry per horse, in stable order');
  const e = i => P.horses[i];
  ok(e(0).turnout.from === 10 && e(0).turnout.to === 15.5 && e(0).turnout.paddock === 0, 'an ordinary horse: out 10:00–15:30 in the first paddock');
  ok(e(1).turnout.to - e(1).turnout.from < e(0).turnout.to - e(0).turnout.from, 'a young horse (2yo) is out for less time');
  ok(e(2).turnout.to - e(2).turnout.from > e(0).turnout.to - e(0).turnout.from, 'an older horse (9yo) is out for longer');
  ok(e(3).turnout.from <= 9.5 + 0.75 && e(3).turnout.to - e(3).turnout.from >= 7, 'the day after a race the horse gets a long, early turnout');
  ok(e(4).pinned && /sore/.test(e(4).pinned) && !e(4).turnout && !e(4).work, 'a sore horse stays in its box (no work, no turnout)');
  ok(P.horses.every((h, i) => !h.turnout || (h.turnout.from >= 9 && h.turnout.to <= 17.5)), 'every turnout window sits inside the working day');
  ok(new Set(P.horses.map(h => h.turnout && h.turnout.from)).size >= 3, 'horses are staggered, not all out at the same minute');
  ok([0, 1, 2, 3].every(i => e(i).turnout.paddock === i % 3), 'horses are spread over the three paddocks');
  ok(e(0).lines.length >= 3 && e(0).lines.every(l => typeof l === 'string'), 'each horse has plain-language lines for the Inspect card');
  const R1 = K.farmDay(C, C.day, 'rain'), L1 = K.farmDay(C, C.day, 'light_rain');
  ok(R1.horses.every(h => h.pinned && !h.turnout), 'heavy rain keeps every horse in'); ok(L1.horses[0].turnout.to - L1.horses[0].turnout.from <= 2.01, 'light rain gives a short turnout');
  // booking: race tomorrow and race day pin the booked horse; a race in 3 days does not
  const C2 = base(3); C2.booking = { hid: 'h1', day: C2.day + 1, eid: 'e' }; let Q = K.farmDay(C2, C2.day, 'clear'); ok(/race tomorrow/.test(Q.horses[1].pinned) && !Q.horses[1].turnout && Q.horses[0].turnout && Q.horses[2].turnout, 'the horse booked for tomorrow stays in; the others are not affected');
  C2.booking.day = C2.day; Q = K.farmDay(C2, C2.day, 'clear'); ok(/race day/.test(Q.horses[1].pinned), 'the horse racing today stays in'); C2.booking.day = C2.day + 3; Q = K.farmDay(C2, C2.day, 'clear'); ok(!Q.horses[1].pinned && Q.horses[1].turnout, 'a race three days away does not pin the horse yet');
  // work: Sunday and the taper days have none
  const C3 = base(2); C3.day = 6; /* find a Sunday */ while (K.dowOf(C3.day) !== 0) C3.day++; ok(!K.farmDay(C3, C3.day, 'clear').horses[0].work, 'no trackwork on a Sunday');
  C3.day++; C3.farm.dev.h0 = { plan: 'balanced', int: 2, sore: 0, load: 0, sessDay: C3.day }; const Wk = K.farmDay(C3, C3.day, 'clear'); ok(Wk.horses[0].work && Wk.horses[0].work.from >= 6 && Wk.horses[0].work.to <= 9.5 && !Wk.horses[1].work, 'a horse whose session ran this morning has a trackwork block (the other has none)');
  // placeAt
  ok(K.placeAt(P, 'h0', 7) === 'box' && K.placeAt(P, 'h0', 10) === 'paddock' && K.placeAt(P, 'h0', 15.49) === 'paddock' && K.placeAt(P, 'h0', 15.5) === 'box' && K.placeAt(P, 'h4', 12) === 'box' && K.placeAt(P, 'nobody', 12) === 'box', 'placeAt gives box / paddock at the right hours, and "box" for pinned or unknown horses');
  ok(K.placeAt(Wk, 'h0', 6.5) === 'work' && K.placeAt(Wk, 'h0', 12) === 'paddock', 'placeAt reports work in the morning block'); }
// fuzz: never throws, never changes the career, windows always valid
{ const R = rng(9); let bad = 0;
  for (let t = 0; t < 400; t++) { const C = base(1 + (R() * 5 | 0)); C.day = R() * 800 | 0; C.horses.forEach(h => { h.age = 2 + (R() * 9 | 0); h.fitness = R() * 100; if (R() < 0.3) h.lastRaceDay = C.day - 1; if (R() < 0.2) h.retired = true; if (R() < 0.1) delete h.fitness; C.farm.dev[h.id] = R() < 0.5 ? { plan: 'speed', int: 1 + (R() * 3 | 0), sore: R() < 0.2 ? 2 : 0, load: R() * 100, sessDay: R() < 0.5 ? C.day : -1 } : undefined; if (!C.farm.dev[h.id]) delete C.farm.dev[h.id]; });
    if (R() < 0.3) C.booking = { hid: 'h0', day: C.day + (R() * 5 | 0), eid: 'x' }; const s = deep(C); let P; try { P = K.farmDay(C, C.day, ['clear', 'partly_cloudy', 'overcast', 'light_rain', 'rain', undefined][R() * 6 | 0]); } catch (e) { bad++; console.log(e.message); continue; }
    if (deep(C) !== s) bad++; for (const h of P.horses) { if (h.turnout && !(h.turnout.from < h.turnout.to && h.turnout.from >= K.CLOCK.start && h.turnout.to <= K.CLOCK.dusk && h.turnout.paddock >= 0 && h.turnout.paddock < 3)) bad++; if (h.work && !(h.work.from < h.work.to && h.work.to < 10)) bad++; } }
  ok(bad === 0, 'fuzz (400 careers: ages, fitness, injuries, bookings, retirements, missing records): no throw, no mutation, valid windows'); }

// ---- the clock's saved state
{ const C = base(1); C.day = 12; const c = K.clockOf(C); ok(c.day === 12 && c.t === K.CLOCK.start && C.farm.clock === c, 'a new day starts at dawn (05:30)');
  c.t = 11.25; ok(K.clockOf(C).t === 11.25, 'leaving and returning the same day resumes the clock'); C.day = 13; ok(K.clockOf(C).t === K.CLOCK.start && K.clockOf(C).day === 13, 'the next calendar day starts at dawn again');
  C.farm.clock = { day: 13, t: 99 }; ok(K.clockOf(C).t === K.CLOCK.start, 'a damaged clock is repaired'); C.farm.clock = { day: 13, t: NaN }; ok(K.clockOf(C).t === K.CLOCK.start, 'a NaN clock is repaired'); const d0 = C.day; K.clockOf(C); ok(C.day === d0, 'reading the clock never changes the calendar day');
  const E = { v: 4, horses: [], day: 3 }; ok(K.clockOf(E).t === 5.5 && typeof E.farm === 'object', 'works on a career with no farm record'); }

// ---- the clock-driven light
{ ok(A.blend(5.5, 'clear').tod === 'early_morning' && A.blend(12, 'clear').tod === 'midday' && A.blend(19, 'clear').tod === 'dusk' && A.blend(19, 'clear').lights === true, 'the blend names the nearest day part (and the lamps are on at dusk)');
  for (const [h, tod] of [[5.5, 'early_morning'], [8.5, 'mid_morning'], [12, 'midday'], [15, 'afternoon'], [16.8, 'late_afternoon'], [18, 'golden_hour'], [19, 'dusk']]) { const b = A.blend(h, 'partly_cloudy'), p = A.params(tod, 'partly_cloudy'); ok(Math.abs(b.sunI - p.sunI) < 1e-9 && Math.abs(b.expo - p.expo) < 1e-9 && b.hemiSky === p.hemiSky && deep(b.sky) === deep(p.sky), 'at ' + tod + "'s own hour the blend equals the day-part look"); }
  let mono = true, prev = A.blend(5.5, 'clear').sunDir[1]; for (let h = 5.5; h <= 12; h += 0.1) { const y = A.blend(h, 'clear').sunDir[1]; if (y < prev - 0.02) mono = false; prev = y; } ok(mono, 'the sun rises smoothly through the morning');
  let step = 0, last = A.blend(5.5, 'clear'); for (let h = 5.6; h <= 19; h += 0.05) { const b = A.blend(h, 'clear'); step = Math.max(step, Math.abs(b.sunI - last.sunI), Math.abs(b.expo - last.expo) * 3, Math.abs(b.lightI - last.lightI)); last = b; } ok(step < 0.2, 'no sudden jump in light intensity from one moment to the next (largest step ' + step.toFixed(3) + ')');
  ok(A.blend(-5, 'clear').hour === 5.5 && A.blend(99, 'clear').hour === 19 && A.blend(NaN, 'clear').hour === 5.5 && A.blend(10, 'bogus').wx === 'clear', 'out-of-range hours clamp; unknown weather falls back to clear');
  const r = A.blend(10, 'rain'); ok(r.rain === 1 && r.wet === 1 && A.blend(10, 'clear').rain === 0, 'weather carries through the blend');
  const dd = A.blend(14, 'clear'); ok(Math.abs(Math.hypot(...dd.sunDir) - 1) < 1e-6 && Math.abs(Math.hypot(...dd.lightDir) - 1) < 1e-6, 'sun and light directions stay unit length'); ok(dd.envFrom && dd.envFrom.key === dd.key, 'the environment map follows the nearest day part (its cache key)'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
