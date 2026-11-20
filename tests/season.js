// Championship logic: full seasons, points, standings, tie-breakers, skipping, double-commit protection, promotion,
// history, trophies, multiple horses and save migration.  node tests/season.js
const S = require('../public/season.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const clone = o => JSON.parse(JSON.stringify(o));
const mkHorse = (id, name, r) => ({ id, name, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, history: [] });
const C = { seed: 777, stable: 'Test Stable', horses: [mkHorse('a', 'Sprint Queen', 70), mkHorse('b', 'Stayer King', 70)], trophies: [] };
S.migrate(C);
ok(C.v === 2 && C.season && C.season.n === 1 && C.season.div === 0 && C.season.rounds.length === 10 && C.season.stables.length === 9, 'a new career starts in the 10-round Provincial Championship with 9 AI stables');
// determinism: the same career seed gives the same stables, goings and AI-only results
{ const D = { seed: 777, stable: 'x', horses: [], trophies: [] }; S.migrate(D);
  ok(JSON.stringify(D.season.stables) === JSON.stringify(C.season.stables) && D.season.rounds.map(r => r.going).join() === C.season.rounds.map(r => r.going).join(), 'stables and going are deterministic from the career seed');
  ok(JSON.stringify(S.simulateRound(C.season, 3)) === JSON.stringify(S.simulateRound(D.season, 3)), 'AI-only round results are deterministic (standings never change on reload)'); }
// the player result as a real race would deliver it: all runners, our place p
function raceRes(Cx, idx, horse, p) {
  const all = S.simulateRound(Cx.season, idx), ai = all.filter(e => e.place > 0), dnf = all.filter(e => !e.place);
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
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
