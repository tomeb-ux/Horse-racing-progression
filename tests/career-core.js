// Career data architecture (public/career-core.js): save v4 migration from v1/v2/v3 saves, the calendar, the idempotent money
// ledger, prize schedule, ageing/fitness data, the deterministic dated programme, backups and export/import.   node tests/career-core.js
const S = require('../public/season.js'), K = require('../public/career-core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const clone = o => JSON.parse(JSON.stringify(o)), J = o => JSON.stringify(o);
const mkHorse = (id, name, r, extra) => Object.assign({ id, name, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, pot: { top: r + 10, acc: r + 10, end: r + 10, spr: r + 10, rec: r + 10, tem: r + 10, agi: r + 10, sta: r + 10 },
  look: { type: 'grey', coat: '#b9b3aa', face: 'blaze', socks: [1, 0, 2, 0], maneCol: '#8c8984', tailCol: '#8c8984', build: 0.4, muscle: 0.2, neck: 1.02, neckG: 1, head: 1, maneLen: 0.9, tailLen: 1.1 },
  silk: '#1d3557', silk2: '#e8c35a', silkPat: 'sash', xp: 40, trainPts: 3, lvl: 4, xpFrac: 0.5, races: 9, wins: 3, places: 6, podiums: 5, offRaces: 6, offWins: 2, champPts: 31, majors: 1, prize: 0, trained: 7, history: [] }, extra || {});
const Saturdays = evs => evs.every(e => K.dowOf(e.day) === 6);

// ---------------------------------------------------------------- calendar maths
ok(K.fmtDate(0) === 'Sat 1 Aug 2026' && K.parts(0).dow === 6, 'day 0 is Saturday 1 August 2026 (the start of season 1)');
ok(K.seasonOfDay(0) === 1 && K.seasonOfDay(K.seasonStartDay(2) - 1) === 1 && K.seasonOfDay(K.seasonStartDay(2)) === 2, 'seasons run 1 August – 31 July (31 Jul is still season 1, 1 Aug starts season 2)');
ok(K.seasonStartDay(1) === 0 && K.seasonStartDay(2) === 365 && K.seasonStartDay(3) - K.seasonStartDay(2) === 366, 'season lengths follow the calendar (season 2 contains 29 Feb 2028 → 366 days)');
ok(K.fmtDate(K.seasonStartDay(2) + 212) === 'Tue 29 Feb 2028' && K.fmtDate(K.seasonStartDay(2) + 213) === 'Wed 1 Mar 2028', 'leap day 2028 is handled');
ok(K.fmtDate(100, { short: true }) === '9 Nov' || /^\d+ \w{3}$/.test(K.fmtDate(100, { short: true, noYear: true })), 'short date formats');
ok(K.seasonLabel(1) === '2026–27' && K.seasonLabel(4) === '2029–30', 'season labels');
{ const dow = [...Array(60)].map((_, i) => K.dowOf(i)); ok(dow.every((d, i) => d === (6 + i) % 7), 'weekday cycle is continuous'); }
ok(K.parts(-5).y === 2026 && K.fmtDate(NaN) === 'Sat 1 Aug 2026', 'a bad day number is treated as day 0');

// ---------------------------------------------------------------- a new career
const NC = K.fresh(777); S.migrate(NC); K.migrate(NC, { from: 4 });
ok(NC.v === 4 && NC.cash === 150000 && NC.ledger.length === 1 && NC.ledger[0].kind === 'start' && NC.ledger[0].bal === 150000, 'a new career starts at v4 with the $150,000 package as one ledger entry');
ok(NC.day === 0 && NC.season.n === 1 && NC.cal.season === 1 && NC.cal.events.length === 10 + 8 * K.OPT_PER_SEASON, 'new career: day 0, season 1, a dated programme of 10 rounds + optional meetings');
ok(Object.keys(NC.fac).sort().join() === K.FAC_KEYS.slice().sort().join() && K.FAC_KEYS.every(k => NC.fac[k] === 0) && K.STAFF_KEYS.every(k => NC.staff[k] === null), 'facilities start at Basic (0), no staff');
ok(NC.player.outfit === 'stable' && /^#[0-9a-f]{6}$/.test(NC.player.look.skin) && Array.isArray(NC.hof) && NC.hof.length === 0 && NC.rep === 0 && Array.isArray(NC.market.listings) && NC.farm.state === 'default', 'character appearance, hall of fame, reputation, market and farm state have defaults');
ok(K.audit(NC).length === 0, 'a new career passes the money audit');
{ const again = clone(NC); K.migrate(again, { from: 4 }); ok(J(again) === J(NC), 'migrating a v4 career again changes nothing (idempotent)'); }

// ---------------------------------------------------------------- the ledger
{ const C = clone(NC), snap = () => J(C);
  let r = K.apply(C, 'a:1', 5000, 'prize', 'test'); ok(r.ok && C.cash === 155000 && C.ledger.length === 2 && C.ledger[1].bal === 155000 && C.ledger[1].amount === 5000, 'a credit changes cash and adds one ledger entry with the balance');
  let before = snap(); r = K.apply(C, 'a:1', 5000, 'prize', 'again'); ok(!r.ok && r.dup && snap() === before, 'the same key again is refused and changes nothing at all');
  before = snap(); r = K.apply(C, 'a:2', -200000, 'buy'); ok(!r.ok && r.reason === 'insufficient' && r.short === 45000 && snap() === before, 'a purchase beyond the cash is refused (shortfall reported) and changes nothing');
  r = K.apply(C, 'a:2', -155000, 'buy'); ok(r.ok && C.cash === 0, 'spending exactly all the cash is allowed');
  before = snap(); r = K.apply(C, 'a:3', -1, 'buy'); ok(!r.ok && C.cash === 0 && snap() === before, 'cash can never go negative through apply');
  r = K.apply(C, 'a:4', -50, 'fee', 'allowed debt', { allowDebt: true }); ok(r.ok && C.cash === -50, 'a defined debt type may go below zero only when it says so');
  C.cash = 0; C.ledger.pop(); delete C.txn['a:4'];
  before = snap();
  for (const bad of [NaN, Infinity, -Infinity, '100', null, undefined, 0, 2e9, -2e9, {}, [5], true]) { r = K.apply(C, 'bad:' + Math.random().toString(36).slice(2, 8), bad, 'x'); if (r.ok) ok(false, 'a bad amount was accepted: ' + String(bad)); }
  ok(snap() === before, 'NaN, Infinity, strings, null, zero, huge and non-number amounts are all refused without changing anything');
  for (const bk of ['', 'with space', '__proto__', 'a/b', 'x'.repeat(97), null, 5, undefined]) if (K.apply(C, bk, 10, 'x').ok) ok(false, 'a bad key was accepted: ' + String(bk));
  ok(snap() === before, 'malformed transaction keys are refused');
  r = K.apply(C, 'frac:1', 10.6, 'x'); ok(r.ok && C.cash === 11 && Number.isInteger(C.cash), 'amounts are rounded to whole dollars');
  ok(K.audit(C).length === 0, 'the ledger audit is clean after those operations');
}
{ // the ledger window, season summaries and key pruning
  const C = clone(NC); for (let i = 0; i < 700; i++) K.apply(C, 'p:' + i, 100 + i % 7, 'prize', 'n' + i);
  ok(C.ledger.length === 300 && C.ledger[299].n === 701 && K.audit(C).length === 0, 'only the last 300 entries are kept and they still chain (audit clean)');
  ok(C.fin[1].in === 150000 + [...Array(700)].reduce((s, _, i) => s + 100 + i % 7, 0) && C.fin[1].out === 0, 'the season summary counts every credit even after old entries leave the window');
  for (let i = 0; i < 4500; i++) K.apply(C, 'q:' + i, 1, 'prize'); ok(Object.keys(C.txn).length <= 4000 && K.applied(C, 'q:4499') && !K.applied(C, 'p:0'), 'applied keys are bounded; the newest keys always remain');
}
{ // fuzz: any sequence of operations keeps the invariants
  const C = clone(NC); let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; let bad = 0;
  for (let i = 0; i < 6000; i++) { const key = 'f:' + Math.floor(rnd() * 900), amt = Math.round((rnd() - 0.55) * 60000); const c0 = C.cash; const r = K.apply(C, key, amt, 'fuzz'); if (C.cash < 0 || (!r.ok && C.cash !== c0)) bad++; }
  ok(bad === 0 && K.audit(C).length === 0, 'fuzz (6,000 random credits/debits, many repeated keys): cash never negative, refusals never change cash, audit clean');
}

// ---------------------------------------------------------------- prizes
ok(K.purseFace({ prize: '$40,000' }) === 40000 && K.purseOf({ prize: '$40,000' }) === 12000 && K.purseOf({ prize: '$20,000,000', tier: 4 }) === 1000000 && K.purseOf({}) === 0 && K.purseOf({ prize: 'abc' }) === 0, 'the purse is read once, from the race data; a race without a purse pays nothing (optional races, as before)');
{ const m = { prize: '$40,000', tier: 1 }, t = { prize: '$5,000,000', tier: 3 };
  const sum = K.prizeFor(m, 1) + K.prizeFor(m, 2) + K.prizeFor(m, 3) + K.prizeFor(m, 4) + K.prizeFor(m, 5);
  ok(K.prizeFor(m, 1) === 7200 && K.prizeFor(m, 2) === 2400 && K.prizeFor(m, 3) === 1200 && K.prizeFor(m, 4) === 720 && K.prizeFor(m, 5) === 480 && sum === 12000, 'places 1–5 share the whole purse (60/20/10/6/4%)');
  ok(K.prizeFor(m, 6) === 0 && K.prizeFor(m, 0) === 0 && K.prizeFor(m, -1) === 0 && K.prizeFor(m, 1.9) === 7200 && K.prizeFor({}, 1) === 0, 'sixth and below, DNF (0) and a race with no purse earn nothing');
  ok(K.prizeFor(t, 1) === 174000 && [1, 2, 3, 4, 5].reduce((s, p) => s + K.prizeFor(t, p), 0) === 300000, 'Group 1 and crown races use the top-grade split, still summing to the purse'); }
for (const d of S.DIVS) for (const r of d.rounds) if (![1, 2, 3, 4, 5].every(p => K.prizeFor(r, p) > 0) || [1, 2, 3, 4, 5].reduce((s, p) => s + K.prizeFor(r, p), 0) !== K.purseOf(r)) ok(false, 'purse not fully paid for ' + r.id);
{ const C = clone(NC), m = S.DIVS[0].rounds[0];
  const a = K.awardPrize(C, 'prize:s1:maiden:h1', m, 1, 'Fast Lad'); ok(a.ok && a.amount === 7200 && C.cash === 157200, 'a prize is credited once through the ledger');
  const b = K.awardPrize(C, 'prize:s1:maiden:h1', m, 1, 'Fast Lad'); ok(!b.ok && b.dup && b.amount === 0 && C.cash === 157200, 'the same race result replayed does not pay again');
  const R = JSON.parse(JSON.stringify(C)); const c = K.awardPrize(R, 'prize:s1:maiden:h1', m, 1, 'Fast Lad'); ok(!c.ok && R.cash === 157200, 'after the save is serialised and reloaded the same result still cannot pay again');
  ok(!K.awardPrize(C, 'prize:s1:x:h1', m, 6, 'x').ok && !K.awardPrize(C, 'prize:s1:x2:h1', m, 0, 'x').ok && C.cash === 157200, 'unplaced runners and DNFs earn nothing');
  const d = K.awardPrize(C, 'prize:s1:maiden:h2', m, 2, 'Second Horse'); ok(d.ok && C.cash === 159600, 'a different horse in the same race (different key) is a separate award'); }

// ---------------------------------------------------------------- migration fixtures
// v1: no season, no rivals, no distances in history; a horse with a custom appearance and a recorded prize
const V1 = { v: 1, stable: 'Old Timers Stable', active: 1, wins: 7, created: 1700000000000, unknownKeep: { a: 1 },
  trophies: [{ raceId: 'slipper', race: 'Golden Slipper', horse: 'Legacy Lad', t: 1700000100000 }],
  horses: [mkHorse('hOLD1', 'Legacy Lad', 70, { born: null, prize: 400000, history: [{ raceId: 'maiden', name: 'Maiden Plate', place: 1, field: 10, dnf: false, t: 1700000000500 }, { raceId: 'listed', name: 'Festival Stakes', place: 2, field: 12, dnf: false, t: 1700000000600 }], online: { runs: 2, wins: 1, places: 1, last: [] } }),
    mkHorse('hOLD2', 'Second Wind', 60, { prize: 0, races: 0, wins: 0, history: [] })] };
// v3: a played career (three rounds done), then serialised exactly as the game stores it
const V3 = (() => { const C = { v: 3, seed: 4242, stable: 'Southern Cross Stable', horses: [mkHorse('hA', 'Alpha', 72, { prize: 150000 }), mkHorse('hB', 'Bravo', 66, { prize: 90000 })], active: 0, trophies: [{ raceId: 'maiden', race: 'Maiden Plate', horse: 'Alpha', season: 1 }], wins: 4, history: [], season: null, created: 1 };
  S.migrate(C); for (let i = 0; i < 3; i++) { const all = S.simulateRound(C, 0, i), ai = all.filter(e => e.place > 0).slice(0, 9); S.commitRound(C, i, [{ sid: 'player', hid: 'hA', name: 'Alpha', place: 1 }].concat(ai.map((e, k) => Object.assign({}, e, { place: k + 2 }))), 'hA'); }
  return clone(C); })();
// v2: from the season tests' fixture
const V2 = { v: 2, seed: 99, stable: 'Old', horses: [mkHorse('h1', 'Old Timer', 70, { prize: 2000000 })], trophies: [{ raceId: 'maiden', race: 'Maiden Plate', horse: 'Old Timer', season: 1 }], wins: 2,
  season: { n: 1, div: 0, seed: 5, cur: 1, closed: false, stables: Array.from({ length: 9 }, (_, k) => ({ sid: 'd0s' + k, name: 'Legacy Stable ' + k, q: 1, silk: '#111111', silk2: '#eeeeee', silkPat: 'plain', horses: ['sprint', 'mile', 'stay'].map((t, j) => ({ hid: 'd0s' + k + t[0], name: 'Legacy ' + k + '-' + j, type: t, style: 'mid', role: 'x', coat: 1, shape: { top: 80, acc: 80, end: 80, spr: 80, rec: 80, tem: 80, agi: 80, sta: 80 }, attrs: { top: 80, acc: 80, end: 80, spr: 80, rec: 80, tem: 80, agi: 80, sta: 80 } })) })),
    rounds: Array.from({ length: 10 }, (_, i) => ({ id: S.DIVS[0].rounds[i].id, st: i === 0 ? 'done' : 'open', going: 'good', res: i === 0 ? [{ sid: 'player', hid: 'h1', name: 'Old Timer', place: 1 }, { sid: 'd0s0', hid: 'd0s0s', name: 'Legacy 0-0', place: 2 }] : null, ph: i === 0 ? 'h1' : null })) } };

function migrated(fx, from) { const C = clone(fx); const f = from != null ? from : C.v; S.migrate(C); K.migrate(C, { from: f }); return C; }
// every key of every horse keeps its value (race history entries may only GAIN facts such as distance/grade from the existing v1 → v3 step)
function horseKeysPreserved(orig, C) { return orig.horses.every((oh, i) => Object.keys(oh).every(k => k === 'history' ? oh.history.every((e, j) => Object.keys(e).every(kk => J(C.horses[i].history[j][kk]) === J(e[kk]))) && C.horses[i].history.length === oh.history.length : J(C.horses[i][k]) === J(oh[k]))); }

{ const C = migrated(V1);
  ok(C.v === 4 && C.horses.length === 2 && horseKeysPreserved(V1, C), 'v1 save → v4: every field of every horse is unchanged (attributes, potential, look, silks, records, history)');
  ok(C.horses[0].look.face === 'blaze' && J(C.horses[0].look.socks) === '[1,0,2,0]' && C.horses[0].look.coat === '#b9b3aa', 'v1: the custom appearance is preserved exactly');
  ok(C.trophies.length === 1 && C.trophies[0].race === 'Golden Slipper' && C.wins === 7 && C.stable === 'Old Timers Stable' && C.active === 1 && C.unknownKeep.a === 1 && C.created === 1700000000000, 'v1: trophies, wins, stable name, active horse, creation time and unknown fields are kept');
  ok(C.cash === 150000 + 40000 && C.ledger.length === 2 && C.ledger[1].amount === 40000 && K.audit(C).length === 0, 'v1: starting cash = $150,000 package + 10% of recorded prize ($400,000 → $40,000), as two audited ledger entries');
  ok(C.horses.every(h => h.age === 3 && h.fitness === 90 && h.retired === false && h.acquired.how === 'migrated' && h.growth && ['early', 'avg', 'late'].includes(h.growth.type) && h.composure === 70), 'v1: horses get age 3, fitness 90, a development profile, not retired');
  ok(C.migrated.from === 1 && C.season && C.season.n === 1 && C.day === K.seasonStartDay(1) && C.cal.season === 1, 'v1: a championship season exists and the date is the season start');
}
{ const C = migrated(V2);
  ok(C.v === 4 && horseKeysPreserved(V2, C) && C.trophies.length === 1 && C.rivals['d0s0s'].name === 'Legacy 0-0', 'v2 save → v4: horses, trophies and the v2 AI identities are preserved');
  ok(C.cash === 150000 + 200000 && K.audit(C).length === 0, 'v2: the credit for past success is 10% of $2,000,000 = $200,000');
  const e = K.roundEvent(C, 0); ok(C.day === e.day + 1 && K.seasonOfDay(C.day) === 1, 'v2: round 1 was done, so today is the day after its scheduled date');
}
{ const C = migrated(V3);
  ok(C.v === 4 && horseKeysPreserved(V3, C) && J(C.season) === J(V3.season) && J(C.rivals) === J(V3.rivals) && J(C.world) === J(V3.world) && J(C.h2h) === J(V3.h2h), 'v3 save → v4: horses, the whole championship (season, rivals, world, head-to-heads) are byte-for-byte unchanged');
  ok(C.cash === 150000 + 24000 && C.horses[0].age === 3 && C.horses[1].age === 3, 'v3: package + 10% of $240,000 recorded prize ($24,000)');
  const last = K.roundEvent(C, 2); ok(C.day === last.day + 1, 'v3: three rounds done → the date is the day after round 3');
  ok(Object.keys(V3).every(k => k in C), 'v3: no top-level key was removed');
  const again = clone(C); K.migrate(again, { from: 4 }); ok(J(again) === J(C), 'v3: migrating twice changes nothing');
  const reload = clone(C); S.migrate(reload); K.migrate(reload, { from: 4 }); ok(J(reload) === J(C), 'v3: a save → load → migrate cycle (what every page reload does) changes nothing');
}
{ const big = clone(V3); big.horses[0].prize = 50000000; const C = migrated(big); ok(C.cash === 150000 + K.LEGACY_CAP, 'the credit for past success is capped ($250,000), so a rich old save cannot arrive with a game-breaking bank balance'); }
{ const C = clone(V3); C.horses.forEach(h => h.prize = 0); const D = migrated(C); ok(D.cash === 150000 && D.ledger.length === 1, 'no recorded prize → no extra credit'); }
{ // age by seasons since the horse was created, between 3 and 6
  const base = clone(V3); base.season.n = 8; base.season.seed = 5; base.horses = [mkHorse('a', 'A', 70, { born: 8 }), mkHorse('b', 'B', 70, { born: 7 }), mkHorse('c', 'C', 70, { born: 3 }), mkHorse('d', 'D', 70, { born: null }), mkHorse('e', 'E', 70, { born: 20 })];
  base.season.rounds.forEach(r => { r.st = 'open'; r.res = null; r.ph = null; }); base.season.cur = 0; base.history = [];
  const C = migrated(base); ok(J(C.horses.map(h => h.age)) === '[3,4,6,3,3]', 'migrated ages = 3 + seasons since created, clamped 3–6 (got ' + J(C.horses.map(h => h.age)) + ')'); ok(C.season.n === 8 && C.day === K.seasonStartDay(8) && K.ageOf(C.horses[2], C.day) === 6, 'horse age is derived from the calendar year of the date');
  ok(K.ageOf(C.horses[0], K.seasonStartDay(9) - 1) === 3 && K.ageOf(C.horses[0], K.seasonStartDay(9)) === 4, 'a horse turns a year older on 1 August, not before'); }
{ // damaged v4 data is repaired, never trusted
  const C = clone(NC); C.cash = 'lots'; C.fac = { training: 9, track: -3, recovery: 'x' }; C.staff = { trainer: { tier: 99, wage: -5, name: '<b>X</b>' }, groom: 'bad' }; C.player = { outfit: 'pirate', look: { skin: 'red', hair: 99 } }; C.txn = { ok: 1, 'bad key!': 2 }; C.ledger = [{ bad: 1 }, null]; C.market = 'x'; C.hof = 'x'; C.notices = 5; C.rep = 'high';
  K.migrate(C, { from: 4 });
  ok(Number.isInteger(C.cash) && C.fac.training === 3 && C.fac.track === 0 && C.fac.recovery === 0 && C.staff.trainer.tier === 3 && C.staff.trainer.wage === 0 && !/[<>]/.test(C.staff.trainer.name) && C.staff.groom === null, 'corrupt facilities and staff are clamped to valid values');
  ok(C.player.outfit === 'stable' && C.player.look.skin === '#c68e6b' && C.player.look.hair === 9 && !('bad key!' in C.txn) && Array.isArray(C.ledger) && Array.isArray(C.hof) && Array.isArray(C.notices) && C.rep === 0 && Array.isArray(C.market.listings), 'corrupt character, ledger, market, hall of fame and notices fall back to defaults'); }
{ const C = migrated(V3); C.horses[0].fitness = 'hot'; C.horses[0].growth = { type: 'wild' }; C.horses[0].foaled = 'x'; C.horses[0].acquired = 5; K.migrate(C, { from: 4 });
  ok(C.horses[0].fitness === 90 && ['early', 'avg', 'late'].includes(C.horses[0].growth.type) && Number.isInteger(C.horses[0].foaled) && C.horses[0].acquired.how === 'created', 'corrupt per-horse v4 fields are repaired'); }
ok(J(K.keepHorse({ id: 'x', fitness: 55, age: 5, foaled: 2021, plan: 'speed', retired: true, composure: 20, value: 9000, attrs: { top: 1 } })) === J({ foaled: 2021, age: 5, fitness: 55, composure: 20, plan: 'speed', retired: true, value: 9000 }), 'keepHorse passes valid stored v4 values through unchanged and ignores everything else');

// ---------------------------------------------------------------- the dated programme
{ const a = clone(NC), b = clone(NC); b.cal = null; K.syncCalendar(b); ok(J(a.cal) === J(b.cal), 'the programme is deterministic: rebuilding it gives identical events, times and forecasts');
  const c = K.fresh(778); S.migrate(c); K.migrate(c, { from: 4 }); ok(J(c.cal) !== J(a.cal), 'a different career seed gives a different programme');
  const rounds = NC.cal.events.filter(e => e.kind === 'round');
  ok(rounds.length === 10 && rounds.every((e, i) => e.round === i) && rounds.every((e, i) => i === 0 || e.day - rounds[i - 1].day >= 7), 'championship rounds are dated in round order, at least a week apart');
  ok(Saturdays(NC.cal.events), 'every event is on a Saturday');
  ok(NC.cal.events.every(e => e.day >= K.seasonStartDay(1) && e.day <= K.seasonEndDay(1)) && rounds[0].day >= 7 && rounds[9].day <= K.seasonEndDay(1) - 14, 'every event falls inside the 1 Aug – 31 Jul season; rounds leave room at both ends');
  ok(NC.cal.events.every((e, i, a2) => i === 0 || a2[i - 1].day <= e.day), 'events are sorted by date');
  ok(NC.cal.events.every(e => K.TODS.includes(e.tod) && ['clear', 'partly_cloudy', 'overcast', 'light_rain', 'rain'].includes(e.forecast.weather) && ['good', 'soft', 'firm', 'heavy'].includes(e.forecast.going)), 'every event stores a time of day and a weather + going forecast');
  ok(rounds.every((e, i) => e.forecast.going === NC.season.rounds[i].going), 'a championship round\'s forecast going is exactly the going the season already assigned it (race conditions unchanged)');
  ok(NC.cal.events.filter(e => e.kind === 'optional').every(e => e.forecast.going === 'good'), 'optional races keep their current going (good)');
  ok(S.OPTIONAL.every(m => NC.cal.events.filter(e => e.ref === m.id).length === K.OPT_PER_SEASON), 'each optional race has its meetings in the programme');
  // property checks over many careers: no evening races off lit courses, weather fits the going, programme valid in all three divisions
  let badEve = 0, badWx = 0, badOrder = 0, n = 0, eve = 0, kinds = {};
  for (let seed = 1; seed <= 150; seed++) for (let div = 0; div < 3; div++) { const C = { seed, stable: 'x', horses: [], trophies: [] }; S.migrate(C); S.newSeason(C, div); K.placeSeason(C); n++;
    let prev = -1; for (const e of C.cal.events) { if (e.tod === 'evening') { eve++; if (!/randwick|flemington/i.test(e.venue)) badEve++; }
      const ok2 = { heavy: ['light_rain', 'rain'], soft: ['light_rain', 'overcast', 'partly_cloudy'], good: ['clear', 'partly_cloudy', 'overcast'], firm: ['clear', 'partly_cloudy'] }[e.forecast.going]; if (!ok2.includes(e.forecast.weather)) badWx++; kinds[e.tod] = (kinds[e.tod] || 0) + 1; }
    const r = C.cal.events.filter(e => e.kind === 'round'); for (let i = 1; i < r.length; i++) if (r[i].day <= r[i - 1].day) badOrder++; if (!Saturdays(C.cal.events)) badOrder++; }
  ok(badEve === 0 && badWx === 0 && badOrder === 0, `property check over ${n} seasons: no evening race at a course without lights (${eve} evening races, all at Randwick/Flemington), weather always fits the going, rounds always in order on Saturdays`);
  ok(kinds.afternoon > kinds.early_morning && kinds.afternoon > kinds.dusk && Object.keys(kinds).length >= 7, 'time-of-day mix: mostly afternoons, with every daylight option used (' + J(kinds) + ')'); }
{ const C = clone(NC), before = J(C.cal); C.cal = JSON.parse(JSON.stringify(C.cal)); K.syncCalendar(C); ok(J(C.cal) === before, 'a stored programme is left alone on reload (a race keeps its scheduled time of day)');
  const e0 = K.roundEvent(C, 0); ok(K.upcoming(C, 3)[0].day >= C.day && K.nextMeeting(C, 'o_trial').ref === 'o_trial' && e0.id === 'r1-1', 'upcoming / nextMeeting / roundEvent lookups'); }

// ---------------------------------------------------------------- time
{ const C = migrated({ v: 3, seed: 55, stable: 'T', horses: [mkHorse('h1', 'One', 70, { born: 1 })], trophies: [], wins: 0, history: [], active: 0 }), r0 = K.roundEvent(C, 0);
  let before = J(C); let a = K.advance(C, r0.day + 3);
  ok(!a.ok && a.needsConfirm && a.skips.length === 1 && a.skips[0].round === 0 && J(C) === before, 'advancing past an open round is refused with a warning naming the event, and changes nothing');
  a = K.advance(C, r0.day - C.day); ok(a.ok && C.day === r0.day && a.skips.length === 0, 'advancing exactly to the round\'s day is allowed (it is still enterable that day)');
  a = K.advance(C, 1); ok(!a.ok && a.needsConfirm, 'but one more day would skip it');
  a = K.advance(C, 1, { cap: true }); ok(a.ok && C.day === r0.day && a.days === 0, 'the cap option never carries the date past the next open round');
  a = K.advance(C, 3, { force: true }); ok(a.ok && C.day === r0.day + 3 && a.skips.length === 1, 'a confirmed advance passes the round (the skip is reported)');
  const d = C.day; K.advance(C, -5); K.advance(C, NaN); K.advance(C, 0); K.advance(C, 0.4); ok(C.day === d, 'time never goes backwards and bad values do nothing');
  ok(K.enterRound(C, 0).days === 0 && C.day === d, 'entering a round dated earlier than today never moves the date back');
  const r1 = K.roundEvent(C, 1); const e = K.enterRound(C, 1); ok(e.ok && C.day === r1.day, 'entering round 2 sets the date to its scheduled day'); }
{ // fitness and age through time
  const C = migrated({ v: 3, seed: 56, stable: 'T', horses: [mkHorse('h1', 'One', 70, { born: 1 })], trophies: [], wins: 0, history: [], active: 0 }), h = C.horses[0];
  const meta = S.DIVS[0].rounds[0]; const a = K.afterRace(C, h, meta, { going: 'good', dnf: false }); ok(h.fitness === 90 - a.cost && a.cost > 0 && h.lastRaceDay === C.day, 'a race lowers fitness by a distance/going/endurance cost and records the date');
  const f0 = h.fitness; K.advance(C, 2, { force: true }); ok(h.fitness > f0 && h.fitness <= 100, 'fitness recovers as days pass');
  K.advance(C, 60, { force: true }); ok(h.fitness === 100, 'and never exceeds 100');
  ok(K.raceFitnessCost(h, { dist: 3200, going: 'good' }) > K.raceFitnessCost(h, { dist: 1000, going: 'good' }) && K.raceFitnessCost(h, { dist: 1600, going: 'heavy' }) > K.raceFitnessCost(h, { dist: 1600, going: 'good' }) && K.raceFitnessCost(h, { dist: 1600, going: 'good', dnf: true }) > K.raceFitnessCost(h, { dist: 1600, going: 'good' }), 'a longer race, heavier going or a fall costs more fitness');
  const lo = { attrs: { end: 50, rec: 50 } }, hi = { attrs: { end: 95, rec: 95 } }; ok(K.raceFitnessCost(hi, { dist: 2400 }) < K.raceFitnessCost(lo, { dist: 2400 }) && K.recoveryPerDay(hi, {}) > K.recoveryPerDay(lo, {}) && K.recoveryPerDay(lo, { recovery: 3 }) > K.recoveryPerDay(lo, { recovery: 0 }), 'endurance, recovery and the recovery facility all help');
  ok(K.fitnessPenalty(100) === 0 && K.fitnessPenalty(80) === 0 && K.fitnessPenalty(60) > 0 && K.fitnessPenalty(20) > K.fitnessPenalty(60) && K.fitnessPenalty(0) <= 0.06, 'the (not yet active) unfit penalty is zero when fit and small even when exhausted');
  const C2 = migrated({ v: 3, seed: 57, stable: 'T', horses: [mkHorse('h1', 'One', 70, { born: 1 })], trophies: [], wins: 0, history: [], active: 0 }); const age0 = C2.horses[0].age;
  K.advance(C2, K.seasonStartDay(2) - C2.day - 1, { force: true }); ok(C2.horses[0].age === age0, 'the day before 1 August nothing ages');
  const r = K.advance(C2, 1, { force: true }); ok(C2.horses[0].age === age0 + 1 && r.rolled && r.aged.length === 1 && r.aged[0].age === age0 + 1, 'on 1 August the horse is a year older and the roll-over is reported once'); }
{ // growth data
  const types = {}; let bad = 0; for (let i = 0; i < 600; i++) { const g = K.growthProfile('horse' + i); types[g.type] = (types[g.type] || 0) + 1; if (g.peak < 3 || g.peak > 7 || g.from < g.peak + 2 || g.from > 12 || g.rate < 0.6 || g.rate > 1.4) bad++; }
  ok(J(K.growthProfile('abc')) === J(K.growthProfile('abc')) && new Set([...Array(40)].map((_, i) => J(K.growthProfile('h' + i)))).size > 10, 'growth profiles are deterministic per horse and vary between horses');
  ok(bad === 0 && types.early > 80 && types.avg > 200 && types.late > 60, 'growth profiles: early / average / late developers all occur with sane peak and decline ages ' + J(types));
  const g = { type: 'avg', peak: 5, from: 8, rate: 1 };
  ok(K.devRate(g, 3) > K.devRate(g, 4) && K.devRate(g, 4) > K.devRate(g, 5) && K.devRate(g, 5) >= K.devRate(g, 7) && K.devRate(g, 12) >= 0.1, 'development slows with age but never stops entirely');
  ok(K.declineRate(g, 7) === 0 && K.declineRate(g, 8) > 0 && K.declineRate(g, 10) > K.declineRate(g, 8), 'physical decline starts only after the horse\'s decline age and grows gradually');
  ok(K.ageStage(3) === 'Young' && K.ageStage(5) === 'Developing' && K.ageStage(7) === 'Mature' && K.ageStage(9) === 'Veteran', 'age stages');
  ok(K.formIdx({ history: [] }) === 0.5 && K.formIdx({ history: [{ place: 1, field: 10 }, { place: 1, field: 10 }] }) === 1 && K.formIdx({ history: [{ dnf: true }] }) < 0.2, 'form index'); }

// ---------------------------------------------------------------- a whole season the way the game plays it, then the next
{ const C = migrated({ v: 3, seed: 2024, stable: 'Play', horses: [mkHorse('h1', 'Runner', 72, { born: 1 })], trophies: [], wins: 0, history: [], active: 0 });
  const h = C.horses[0]; let expectCash = C.cash, lastDay = C.day, mono = true, replay = 0;
  const places = [1, 2, 3, 4, 5, 6, 0, 1, 2, 3];
  for (let i = 0; i < 10; i++) {
    const ent = K.enterRound(C, i); if (C.day < lastDay) mono = false; lastDay = C.day;
    const m = S.roundDef(C.season, i), res = S.simulateRound(C, 0, i), ai = res.filter(e => e.place > 0), p = places[i];
    const field = []; let k = 0; for (let pl = 1; pl <= ai.length + 1; pl++) field.push(pl === p ? { sid: 'player', hid: h.id, name: h.name, place: pl } : Object.assign({}, ai[k++], { place: pl }));
    S.commitRound(C, i, p ? field : field.filter(e => e.sid !== 'player'), h.id);
    const key = 'prize:s1:' + m.id + ':' + h.id;
    if (p) { const r1 = K.awardPrize(C, key, m, p, h.name); expectCash += r1.ok ? r1.amount : 0; const r2 = K.awardPrize(C, key, m, p, h.name); if (r2.ok) replay++; }
    K.afterRace(C, h, m, { going: C.season.rounds[i].going, dnf: !p });
    K.afterOptional(C);   // an optional race between rounds
  }
  const adj = C.ledger.filter(e => e.kind === 'upkeep' || e.kind === 'sponsor' || e.kind === 'repay' || e.kind === 'advance').reduce((t, e) => t + e.amount, 0);   // Phase 7: the weekly bills fall due as the calendar moves
  ok(mono && C.cash === expectCash + adj && replay === 0 && K.audit(C).length === 0, `ten rounds played with every result replayed: cash is exactly the prizes (${expectCash}) plus the weekly bills charged on the way (${adj}), nothing paid twice, date never goes back, audit clean`);
  ok(C.horses[0].fitness >= 0 && C.horses[0].fitness <= 100, 'fitness stays within 0–100 over a season');
  const age0 = h.age, n0 = C.season.n; S.closeSeason(C); K.startSeason(C);
  ok(C.season.n === n0 + 1 && C.cal.season === n0 + 1 && C.day === K.seasonStartDay(n0 + 1) && h.age === age0 + 1, 'closing the season lays out the next programme, moves to 1 August and ages the horses once');
  ok(K.roundEvent(C, 0).day > C.day && C.cal.events.every(e => e.season === n0 + 1), 'the new season\'s first round is still ahead');
  { const hl = C.history.length, tl = C.trophies.length, ages = J(C.horses.map(x => x.age)), day = C.day; ok(S.closeSeason(C) === null && K.startSeason(C).days === 0 && C.history.length === hl && C.trophies.length === tl && J(C.horses.map(x => x.age)) === ages && C.day === day, 'closing the same season twice archives nothing again, awards no second title and ages nobody twice'); }
  const key2 = 'prize:s1:' + S.DIVS[0].rounds[0].id + ':' + h.id; const c0 = C.cash; K.awardPrize(C, key2, S.DIVS[0].rounds[0], 1, h.name); ok(C.cash === c0, 'last season\'s prize key still cannot be replayed in the new season');
  const rl = JSON.parse(JSON.stringify(C)); S.migrate(rl); K.migrate(rl, { from: 4 }); ok(J(rl) === J(C), 'save → reload after a season change is stable'); }
{ // size: the save stays modest after many seasons
  const C = migrated({ v: 3, seed: 9, stable: 'Big', horses: [mkHorse('h1', 'Runner', 72, { born: 1 })], trophies: [], wins: 0, history: [], active: 0 });
  for (let s = 0; s < 8; s++) { while (!S.done(C.season)) { const i = C.season.cur; K.enterRound(C, i); S.skipRound(C); K.apply(C, 'x:' + s + ':' + i, 3000 + i, 'prize', 'Prize ' + i + ' of a long note about a race'); } S.closeSeason(C); K.startSeason(C); }
  ok(JSON.stringify(C).length < 520 * 1024 && C.ledger.length <= 300 && K.audit(C).length === 0, `after 8 seasons the save is ${(JSON.stringify(C).length / 1024).toFixed(0)} KB (ledger capped at 300 entries, audit clean)`); }

// ---------------------------------------------------------------- backups (a mock of localStorage)
const mockStore = (opts) => { const m = new Map(); opts = opts || {}; return { m, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { if (opts.throws) throw new Error('QuotaExceededError'); if (opts.drop) return; m.set(k, String(v)); }, get length() { return m.size; }, key: i => [...m.keys()][i] }; };
{ const st = mockStore(), raw = J(V3); const b = K.backup(st, raw, 'v3', 111); ok(b.ok && b.key === 'ff_career_v3_backup' && st.getItem('ff_career_v3_backup') === raw, 'a backup stores the exact original text under ff_career_v3_backup and is read back');
  const b2 = K.backup(st, raw, 'v3', 222); ok(b2.ok && b2.reused && st.m.size === 1, 'backing up the same text again reuses the existing copy');
  const raw2 = J(V1), b3 = K.backup(st, raw2, 'v3', 333); ok(b3.ok && b3.key === 'ff_career_v3_backup_333' && st.getItem('ff_career_v3_backup') === raw && st.getItem(b3.key) === raw2, 'a different save of the same version never overwrites the older backup (a timestamped copy is added)');
  ok(K.listBackups(st).length === 2, 'backups can be listed');
  ok(!K.backup(mockStore({ throws: true }), raw, 'v3').ok && !K.backup(mockStore({ drop: true }), raw, 'v3').ok && !K.backup(st, '', 'v3').ok && !K.backup(st, null, 'v3').ok, 'a full or silently-dropping storage, or nothing to back up, reports failure instead of pretending'); }
{ // the whole startup pipeline on a mock store: original text is backed up byte-for-byte BEFORE the migrated save is written
  for (const [name, fx] of [['v1', V1], ['v2', V2], ['v3', V3]]) {
    const st = mockStore(), raw = J(fx); st.setItem('ff_career', raw);
    const bk = K.backup(st, raw, 'v' + fx.v); const C = clone(JSON.parse(raw)); S.migrate(C); K.migrate(C, { from: fx.v }); st.setItem('ff_career', J(C));
    ok(bk.ok && st.getItem('ff_career_v' + fx.v + '_backup') === raw && JSON.parse(st.getItem('ff_career')).v === 4, `${name}: the backup is the untouched original text and the stored save is now v4`);
    const restored = JSON.parse(st.getItem('ff_career_v' + fx.v + '_backup')); const C2 = migrated(restored, fx.v); ok(J(C2.horses.map(h => h.attrs)) === J(C.horses.map(h => h.attrs)) && J(C2.trophies) === J(C.trophies), `${name}: migrating from the backup gives the same horses and trophies`); } }

// ---------------------------------------------------------------- export / import
{ const C = migrated(V3), text = K.exportSave(C, 1234), env = JSON.parse(text);
  ok(env.app === 'final-furlong-career' && env.v === 4 && env.exported === 1234 && typeof env.sum === 'string', 'an export carries the app name, version and a checksum');
  const p = K.parseImport(text); ok(p.ok && J(p.career) === J(C) && p.from === 4, 'export → import round trip returns the identical career');
  const re = clone(p.career); S.migrate(re); K.migrate(re, { from: p.from }); ok(J(re) === J(C), 'and loading the imported career changes nothing');
  ok(K.parseImport(text.replace('"cash":', '"cash":1')).ok === false, 'a file edited after export fails its checksum');
  ok(!K.parseImport(text.slice(0, text.length - 40)).ok && !K.parseImport('').ok && !K.parseImport('   ').ok && !K.parseImport('not json').ok && !K.parseImport(null).ok && !K.parseImport(undefined).ok && !K.parseImport('{}').ok && !K.parseImport('[]').ok, 'cut-off, empty, non-JSON and wrong-shape files are refused with a message');
  ok(!K.parseImport(J({ app: 'final-furlong-career', career: 5 })).ok && !K.parseImport(J({ v: 3, horses: 'x' })).ok, 'a damaged envelope or a missing horse list is refused');
  const newer = clone(C); newer.v = 9; ok(/newer version/.test(K.parseImport(J(newer)).error), 'a save from a newer game version is refused with advice');
  const many = clone(C); many.horses = Array.from({ length: 13 }, (_, i) => mkHorse('x' + i, 'X' + i, 60)); ok(!K.parseImport(J(many)).ok, 'an absurd number of horses is refused');
  ok(!K.parseImport('x'.repeat(7 * 1024 * 1024)).ok, 'a file over 6 MB is refused');
  const bare = K.parseImport(J(V3)); ok(bare.ok && bare.from === 3 && J(bare.career) === J(V3), 'a bare older save (e.g. a pasted ff_career value or the v3 backup) is accepted');
  for (const [n, fx] of [['v1', V1], ['v2', V2]]) { const x = K.parseImport(J(fx)); ok(x.ok && x.from === fx.v, `a bare ${n} save is accepted for upgrading`); } }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
