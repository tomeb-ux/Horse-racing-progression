// Championship logic: full seasons, points, standings, tie-breakers, skipping, double-commit protection, promotion,
// history, trophies, multiple horses and save migration.  node tests/season.js
const S = require('../public/season.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const clone = o => JSON.parse(JSON.stringify(o));
const mkHorse = (id, name, r) => ({ id, name, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, history: [] });
const C = { seed: 777, stable: 'Test Stable', horses: [mkHorse('a', 'Sprint Queen', 70), mkHorse('b', 'Stayer King', 70)], trophies: [] };
S.migrate(C);
ok(C.v === 3 && C.season && C.season.n === 1 && C.season.div === 0 && C.season.rounds.length === 10 && S.stablesOf(C, 0).length === 9 && Object.keys(C.rivals).length === 93, 'a new career starts in the 10-round Provincial Championship with 9 AI stables and a world of 93 persistent rivals');
// determinism: the same career seed gives the same stables, goings and AI-only results
{ const D = { seed: 777, stable: 'x', horses: [], trophies: [] }; S.migrate(D);
  ok(JSON.stringify(D.world) === JSON.stringify(C.world) && JSON.stringify(D.rivals) === JSON.stringify(C.rivals) && D.season.rounds.map(r => r.going).join() === C.season.rounds.map(r => r.going).join(), 'stables, rivals and going are deterministic from the career seed');
  ok(JSON.stringify(S.simulateRound(C, 0, 3)) === JSON.stringify(S.simulateRound(D, 0, 3)), 'AI-only round results are deterministic (standings never change on reload)'); }
const rivalSnap = JSON.parse(JSON.stringify(C.rivals));
// the player result as a real race would deliver it: all runners, our place p
function raceRes(Cx, idx, horse, p) {
  const all = S.simulateRound(Cx, Cx.season.div, idx), ai = all.filter(e => e.place > 0), dnf = all.filter(e => !e.place);
  const out = []; let k = 0;
  for (let place = 1; place <= ai.length + 1; place++) out.push(place === p ? { sid: 'player', hid: horse.id, name: horse.name, place } : Object.assign({}, ai[k++], { place }));
  return out.concat(dnf);
}
// Season 1: alternate horses (one stable entry per round), mix of results, one skip
const places = [1, 3, 2, 0, 1, 5, 2, 1, 4, 1];   // 0 = skip
let expected = 0; const usedPerRound = [];
for (let i = 0; i < 10; i++) {
  const h = C.horses[i % 2];
  if (!places[i]) { const r = S.skipRound(C); ok(r && C.season.rounds[i].st === 'skip' && !r.res.some(e => e.sid === 'player'), `round ${i + 1} skipped (AI-only result)`); continue; }
  const res = raceRes(C, i, h, places[i]);
  const sum = S.commitRound(C, i, res, h.id); usedPerRound.push(h.name);
  expected += S.pointsFor(places[i]);
  ok(sum && sum.pts === S.pointsFor(places[i]) && sum.total === expected, `round ${i + 1}: ${h.name} ${places[i]} → +${sum && sum.pts} (total ${sum && sum.total})`);
  ok(S.commitRound(C, i, res, h.id) === null, `round ${i + 1} cannot be committed twice`);
}
ok(S.commitRound(C, 3, raceRes(C, 3, C.horses[0], 1), 'a') === null, 'a skipped round cannot be claimed later');
ok(S.skipRound(C) === null && S.done(C.season), 'season complete: nothing more to skip');
// standings integrity
const st = S.standings(C), me = st.find(r => r.you);
ok(me.pts === expected && me.wins === 4 && me.starts === 9 && me.podiums === 7, `stable totals: ${me.pts} pts, ${me.wins} wins, ${me.starts} starts, ${me.podiums} podiums`);
const allPts = C.season.rounds.reduce((s, rd) => s + rd.res.reduce((t, e) => t + S.pointsFor(e.place), 0), 0);
ok(st.reduce((s, r) => s + r.pts, 0) === allPts, 'every point in the table comes from a recorded result (no arbitrary AI points)');
ok(st.every((r, i) => i === 0 || r.pts <= st[i - 1].pts) && st.every((r, i) => r.rank === i + 1 && r.behind === st[0].pts - r.pts), 'table sorted with ranks and gaps');
ok(st.filter(r => !r.you).every(r => r.starts === 10), 'every AI stable ran in all 10 rounds');
// tie-breakers
{ const T = clone(C); T.season.rounds.forEach(rd => rd.res = []);
  T.season.rounds[0].res = [{ sid: 'd0s1', place: 1, name: 'x' }, { sid: 'd0s2', place: 2, name: 'y' }];   // 15 vs 12
  T.season.rounds[1].res = [{ sid: 'd0s2', place: 4, name: 'y' }, { sid: 'd0s1', place: 11, name: 'x' }];  // 12+8 = 20 vs 15: s2 ahead
  T.season.rounds[2].res = [{ sid: 'd0s1', place: 8, name: 'x' }];                                       // s1 15+3 = 18
  T.season.rounds[3].res = [{ sid: 'd0s1', place: 9, name: 'x' }];                                       // s1 20 = s2 20 → wins decide
  const L = S.standings(T); const a = L.find(r => r.sid === 'd0s1'), b = L.find(r => r.sid === 'd0s2');
  ok(a.pts === 20 && b.pts === 20 && a.rank < b.rank, 'tie on points → more wins ranks higher');
  T.season.rounds[3].res = []; T.season.rounds[4].res = [{ sid: 'd0s3', place: 2, name: 'z' }, { sid: 'd0s4', place: 2, name: 'w' }];
  const L2 = S.standings(T), c = L2.find(r => r.sid === 'd0s3'), d = L2.find(r => r.sid === 'd0s4');
  ok(c.pts === d.pts && c.rank < d.rank && JSON.stringify(S.standings(T)) === JSON.stringify(L2), 'full tie → fixed deterministic order, identical every time'); }
// close the season
const pos = me.rank;
const cl = S.closeSeason(C);
ok(cl && C.history.length === 1 && C.season.n === 2 && C.season.cur === 0, 'season closed, archived, season 2 created');
const H = C.history[0];
ok(H.playerPos === pos && H.playerPts === expected && H.entered === 9 && H.skipped === 1 && H.standings.length === 10, 'history keeps final position, points, entries and full standings');
ok(H.horsesUsed.sort().join() === 'Sprint Queen,Stayer King', 'history records both horses used by the stable');
ok(H.majors.length === 1 && H.majors[0].race === 'Provincial Championship Final', 'feature-race winners recorded');
ok(cl.promoted === (pos <= 3) && C.season.div === (pos <= 3 ? 1 : 0), `promotion: finished ${pos} → division ${C.season.div}`);
ok((pos === 1) === C.trophies.some(t => t.kind === 'champ' && t.season === 1), 'a championship trophy only for 1st');
ok(S.closeSeason(C) === null && C.history.length === 1, 'a season cannot be closed twice (no duplicate history or trophy)');
// promotion all the way to the Feature Series, and the Feature Series has no promotion
{ const P = { seed: 5, stable: 'P', horses: [], trophies: [] }; S.migrate(P); P.horses.push(mkHorse('z', 'Zed', 90));   // a brand-new career starts in the Provincial
  for (let season = 0; season < 3; season++) {
    for (let i = 0; i < P.season.rounds.length; i++) S.commitRound(P, i, raceRes(P, i, P.horses[0], 1), 'z');
    const div = P.season.div; const r = S.closeSeason(P);
    ok(r.entry.playerPos === 1 && r.trophy && r.trophy.race === S.DIVS[div].name + ' Champions', `season ${season + 1}: champions of the ${S.DIVS[div].short}`);
  }
  ok(P.season.div === 2 && P.history.map(h => h.div).join() === '0,1,2', 'promoted Provincial → Metropolitan → Feature Series, then stays at the top');
  ok(P.trophies.filter(t => t.kind === 'champ').length === 3, 'three championship trophies, none duplicated');
  ok(P.season.rounds.length === 12 && S.DIVS[2].rounds.some(r => r.id === 'everest') && S.DIVS[2].rounds.some(r => r.id === 'melbcup') && S.DIVS[2].rounds.some(r => r.id === 'coxplate'), 'the Feature Series includes The Everest, Cox Plate and Melbourne Cup'); }
// qualification
{ const h = mkHorse('q', 'Q', 80); h.attrs.end = 70; h.attrs.rec = 70;
  ok(!S.eligibility(h, S.BY_ID.melbcup).ok, 'Melbourne Cup refused without staying ability and a staying result');
  h.attrs.end = 84; h.attrs.rec = 82; ok(!S.eligibility(h, S.BY_ID.melbcup).ok, '… still refused without a qualifying run');
  h.history.push({ raceId: 'o_cuptrial', name: "Bart's Cup Trial", place: 3, dist: 2400, tier: 2 }); ok(S.eligibility(h, S.BY_ID.melbcup).ok, '… qualified after a top-3 in a staying qualifier');
  h.history.push(...Array.from({ length: 10 }, (_, i) => ({ raceId: 'o_bm64', name: 'BM64', place: 5, dist: 1400, tier: 1 })));
  ok(!S.eligibility(h, S.BY_ID.melbcup).ok, '… and the qualification lapses after 10 more runs (recent form matters)');
  const sp = mkHorse('s', 'S', 80); Object.assign(sp.attrs, { top: 90, acc: 90, spr: 90, end: 66, rec: 66 }); sp.history.push({ raceId: 'harboursprint', name: 'Harbour City Sprint', place: 2, dist: 1200, tier: 3 });
  ok(S.eligibility(sp, S.BY_ID.everest).ok && !S.eligibility(sp, S.BY_ID.melbcup).ok, 'a sprinter qualifies for The Everest, not the Cup');
  ok(S.eligibility(mkHorse('n', 'N', 50), S.BY_ID.maiden).ok, 'provincial rounds are open to every horse'); }
// migration of a damaged / older season object
{ const M = { seed: 9, stable: 'M', horses: [mkHorse('m', 'M', 82)], trophies: [{ raceId: 'everest', race: 'The Everest', horse: 'M' }], season: { n: 3, div: 7, rounds: 'bad' } };
  S.migrate(M); ok(M.season && M.season.div === 2 && M.trophies.length === 1, 'a corrupt season is rebuilt (division chosen from the best horse) without touching trophies'); }
// ---- persistent rivals ----
{ const R = { seed: 31, stable: 'R', horses: [], trophies: [] }; S.migrate(R); const hh = mkHorse('me', 'Midnight Legend', 72); R.horses.push(hh);
  const ids0 = S.stablesOf(R, 0).flatMap(st => st.horses), snap = JSON.parse(JSON.stringify(R.rivals));
  // the same runner turns up again with its records, and its rating moves only through its own races
  const first = S.runnersFor(R, 0, 0)[0];
  for (let i = 0; i < R.season.rounds.length; i++) { const res = raceRes(R, i, hh, 1 + (i % 4)); S.commitRound(R, i, res, 'me'); S.recordH2H(R, hh, S.roundDef(R.season, i), res.map((e, k) => ({ hid: e.hid, place: e.place, t: 60 + e.place * 0.2, player: e.sid === 'player' })), R.season.n); }
  const rv = R.rivals[first._hid];
  ok(rv && rv.name === first.name && rv.starts >= 3 && rv.form.length >= 3, `a rival keeps its identity and records across rounds (${first.name}: ${rv.starts} starts, form ${rv.form.join('-')})`);
  ok(Object.values(R.rivals).every(x => Object.keys(x.attrs).every(k => x.attrs[k] <= x.pot[k] + 1e-9)), 'no rival ever exceeds its own potential');
  const grew = ids0.filter(id => S.rRating(R.rivals[id]) > S.rRating(snap[id])).length;
  ok(grew >= 5, `rivals develop through their own racing (${grew} of ${ids0.length} provincial rivals improved over the season)`);
  // independence: the same season with the player losing every race gives the rivals exactly the same development
  const Q = { seed: 31, stable: 'R', horses: [], trophies: [] }; S.migrate(Q); const hq = mkHorse('me', 'Midnight Legend', 50); Q.horses.push(hq);
  for (let i = 0; i < Q.season.rounds.length; i++) S.commitRound(Q, i, raceRes(Q, i, hq, 10), 'me');
  const diff = ids0.filter(id => Math.abs(S.rRating(R.rivals[id]) - S.rRating(Q.rivals[id])) > 1).length;
  ok(diff <= 2, `rival development does not follow the player's results (${diff} of ${ids0.length} differ by more than a point between a winning and a losing career)`);
  const metro = S.stablesOf(R, 1).flatMap(st => st.horses).filter(id => R.rivals[id].starts > 0).length;
  ok(metro >= 11 && R.season.others[1].cur === 10 && R.season.others[2].cur === 12, `the other championships race on in the background (${metro} metropolitan rivals have run)`);
  // head-to-head
  const key = Object.keys(R.h2h).sort((a, b) => R.h2h[b].n - R.h2h[a].n)[0], hr = R.h2h[key];
  ok(hr && hr.n >= 3 && hr.ahead + hr.behind === hr.n && hr.closest != null && hr.last.length === Math.min(8, hr.n), `head-to-head recorded per pair (${hr.n} meetings, ${hr.ahead}-${hr.behind}, closest ${hr.closest} s)`);
  // form guide is grounded in the numbers
  const fg = S.formGuide(R, S.runnersFor(R, 0, 4).map(d => ({ name: d.name, attrs: d.attrs, form: R.rivals[d._hid].form })), S.DIVS[0].rounds[4]);
  ok(fg.length === 9 && fg.filter(r => r.contender).length === 3 && fg.every(r => ['Excellent', 'Good', 'Fair', 'Poor'].includes(r.suit)), 'form guide ranks the field with contenders and trip suitability');
  const sp = mkHorse('s', 'S', 80); Object.assign(sp.attrs, { top: 92, acc: 92, spr: 92, sta: 90, end: 60, rec: 60 });
  ok(S.suitability(sp.attrs, 1200).label === 'Excellent' && ['Fair', 'Poor'].includes(S.suitability(sp.attrs, 3200).label), 'a sprinter is rated Excellent at 1200 m and poorly suited to 3200 m');
  // optional fields are grade-matched and stable until raced
  const f1 = S.optionalField(R, 'o_maiden'), f2 = S.optionalField(R, 'o_maiden'), fw = S.optionalField(R, 'o_wildcard');
  const avg = f => f.reduce((a, d) => a + Object.values(d.attrs).reduce((x, y) => x + y) / 8, 0) / f.length;
  ok(JSON.stringify(f1) === JSON.stringify(f2) && avg(f1) < avg(fw) - 8, `optional fields match the grade (maiden ${avg(f1).toFixed(0)} vs Everest wildcard ${avg(fw).toFixed(0)}) and stay the same until raced`);
  // a long career: rivals retire at their peak and new prospects arrive; records survive
  const RR = { seed: 77, stable: 'RR', horses: [], trophies: [] }; S.migrate(RR); RR.horses.push(mkHorse('x', 'X', 90));
  for (let season = 0; season < 6; season++) { while (!S.done(RR.season)) S.skipRound(RR); S.closeSeason(RR); }
  const retired = Object.values(RR.rivals).filter(x => x.retired);
  ok(retired.length > 0 && S.stablesOf(RR, 0).every(st => st.horses.length === 3 && st.horses.every(id => !RR.rivals[id].retired)), `over six seasons ${retired.length} rivals retired at their peak and were replaced by new prospects`);
  ok(RR.history.length === 6 && RR.history.every(e => e.others.length === 2 && e.others.every(o => o.champion)), 'every season archives the champions of all three championships');
  ok(JSON.stringify(RR).length < 400 * 1024, `the save stays small after six seasons (${(JSON.stringify(RR).length / 1024).toFixed(0)} KB)`);
}
// ---- migration of a Prompt-1 (v2) save: AI horse identities and results are kept ----
{ const old = { v: 2, seed: 99, stable: 'Old', horses: [mkHorse('h1', 'Old Timer', 70)], trophies: [{ raceId: 'maiden', race: 'Maiden Plate', horse: 'Old Timer', season: 1 }], wins: 2,
    season: { n: 1, div: 0, seed: 5, cur: 1, closed: false, stables: Array.from({ length: 9 }, (_, k) => ({ sid: 'd0s' + k, name: 'Legacy Stable ' + k, q: 1, silk: '#111111', silk2: '#eeeeee', silkPat: 'plain', horses: ['sprint', 'mile', 'stay'].map((t, j) => ({ hid: 'd0s' + k + t[0], name: 'Legacy ' + k + '-' + j, type: t, style: 'mid', role: 'x', coat: 1, shape: { top: 80, acc: 80, end: 80, spr: 80, rec: 80, tem: 80, agi: 80, sta: 80 } })) })),
      rounds: Array.from({ length: 10 }, (_, i) => ({ id: S.DIVS[0].rounds[i].id, st: i === 0 ? 'done' : 'open', going: 'good', res: i === 0 ? [{ sid: 'player', hid: 'h1', name: 'Old Timer', place: 1 }, { sid: 'd0s0', hid: 'd0s0s', name: 'Legacy 0-0', place: 2 }] : null, ph: i === 0 ? 'h1' : null })) } };
  S.migrate(old);
  ok(old.v === 3 && old.season.cur === 1 && old.season.rounds[0].res.length === 2 && old.rivals['d0s0s'] && old.rivals['d0s0s'].name === 'Legacy 0-0' && S.stablesOf(old, 0)[0].name === 'Legacy Stable 0', 'v2 save: season progress, results and AI horse identities are preserved as persistent rivals');
  ok(old.horses[0].attrs.top === 70 && old.trophies.length === 1 && S.standings(old).find(r => r.you).pts === 15, 'v2 save: player horse, trophies and points intact');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
