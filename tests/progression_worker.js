// worker: plays whole careers with the real race engine + the real championship/rival/XP code.
//   node progression_worker.js <k> <K> <careersPerCombo> <races>
const path = require('path');
const sim = require(path.join(__dirname, '..', 'public', 'sim.js'));
const S = require(path.join(__dirname, '..', 'public', 'season.js'));
const X = sim.SIM_EXPORTS;
const [k, K, N, RACES] = process.argv.slice(2).map(Number);
const AK = ["top", "acc", "end", "spr", "rec", "tem", "agi", "sta"];
const BASE = 54, START_POOL = 136, START_CAP = 84, POT_POOL = 168, POT_CAP = 98;
const TPL = { sprint: { top: 22, acc: 26, spr: 22, sta: 24, agi: 12, tem: 10, end: 10, rec: 10 }, mile: { top: 20, acc: 16, spr: 18, end: 18, rec: 14, tem: 16, agi: 18, sta: 16 },
  stay: { end: 30, rec: 26, top: 18, tem: 22, spr: 10, acc: 8, agi: 10, sta: 12 } };
function create(t) {   // same allocation as the creator's templates + "follow my build" potential
  const w = TPL[t], sum = AK.reduce((s, x) => s + w[x], 0), a = {};
  let left = START_POOL; for (const x of AK) { const v = Math.min(START_CAP - BASE, Math.floor(START_POOL * w[x] / sum)); a[x] = BASE + v; left -= v; }
  for (const x of AK.slice().sort((p, q) => w[q] - w[p])) { if (left <= 0) break; const add = Math.min(left, START_CAP - a[x]); a[x] += add; left -= add; }
  const ww = {}; for (const x of AK) ww[x] = Math.max(1, a[x] - BASE + 4);
  const s2 = AK.reduce((s, x) => s + ww[x], 0), pot = {}; let pl = POT_POOL;
  for (const x of AK) { const hr = Math.min(POT_CAP - a[x], Math.floor(POT_POOL * ww[x] / s2)); pot[x] = a[x] + hr; pl -= hr; }
  for (let g = 0; pl > 0 && g < 500; g++) { const x = AK.filter(y => pot[y] < POT_CAP).sort((p, q) => ww[q] - ww[p])[g % 3]; if (!x) break; pot[x]++; pl--; }
  return { id: "p1", name: "Test Horse", attrs: a, pot, trainPts: 0, xpFrac: 0, history: [], w };
}
function train(h) {      // spend points on the attributes this build values most (cheapest useful first)
  for (let guard = 0; guard < 400; guard++) {
    let best = null, bs = -1;
    for (const x of AK) { if (h.attrs[x] >= h.pot[x]) continue; const c = S.upgCost(h.attrs[x]); if (c > h.trainPts) continue; const sc = h.w[x] / c; if (sc > bs) { bs = sc; best = x; } }
    if (!best) break; h.trainPts -= S.upgCost(h.attrs[best]); h.attrs[best]++;
  }
}
const rating = a => AK.reduce((s, x) => s + a[x], 0) / 8;
function runRace(meta, h, opp, ride, seed, going) {
  const def = { name: h.name, style: h.w === TPL.stay ? "steady" : h.w === TPL.sprint ? "stalk" : "mid", role: "x", coat: 1, silk: "#fff", attrs: Object.assign({}, h.attrs) };
  const good = ride === "good";
  const r = new sim.Race({ distance: meta.dist, field: opp.length + 1, diff: meta.diff, playerDef: def, oppDefs: opp, allBots: good, going: going || "good", incidents: "full", seed });
  r.state = "count"; r.openGates();
  const p = r.player;
  if (!good) { r.st.launched = true; r.applyStart(p, 0.45, 0.3); }
  while (r.finishOrder.length + r.dnfs.length < r.horses.length && r.clock < 600) {
    if (!good && !p.finished && !p.dnf) { const sp = X.PACING.flatOut(r.dist - p.progress, r.dist, p, r); p.effort = sp.e; p.drive = !!sp.drive && p.started; }
    r.simStep(sim.SIM_DT);
  }
  r.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
  return r;
}
const out = [];
const combos = []; for (const t of ["sprint", "mile", "stay"]) for (const ride of ["good", "poor"]) for (let c = 0; c < N; c++) combos.push({ t, ride, c });
for (let ci = k; ci < combos.length; ci += K) {
  const { t, ride, c } = combos[ci];
  const C = { seed: 5000 + c * 97 + t.length, stable: "Test", horses: [], trophies: [] }; S.migrate(C);
  const h = create(t); C.horses.push(h);
  let n = 0, seed = 1000 + ci * 7777, optN = 0;
  while (n < RACES) {
    // alternate: an official round when one is open (enter if qualified, otherwise skip), then an optional race
    const s = C.season;
    let meta, opp, official = false;
    if (n % 2 === 0) {
      if (S.done(s)) { S.closeSeason(C); continue; }
      meta = S.roundDef(s); if (!S.eligibility(h, meta).ok) { S.skipRound(C); continue; }
      opp = S.runners(C); official = true;
    } else {
      const rt = rating(h.attrs);
      const opts = S.OPTIONAL.filter(o => S.eligibility(h, o).ok && o.tier > 0).sort((a, b) => Math.abs(a.str - (rt - 3)) - Math.abs(b.str - (rt - 3)));
      meta = opts[0]; C.optN = optN; opp = S.optionalField(C, meta.id);
    }
    const r = runRace(meta, h, opp, ride, seed++, official ? s.rounds[s.cur].going : "good");
    const P = r.player, place = P.dnf ? 0 : r.finishOrder.indexOf(P) + 1;
    const res = r.finishOrder.map((x, i) => ({ sid: x.isPlayer || x === P ? "player" : x.def._sid, hid: x === P ? h.id : x.def._hid, name: x.def.name, place: i + 1, t: x.finishTime }));
    r.dnfs.forEach(x => res.push({ sid: x === P ? "player" : x.def._sid, hid: x === P ? h.id : x.def._hid, name: x.def.name, place: 0 }));
    if (official) S.commitRound(C, s.cur, res.map(e => ({ sid: e.sid, hid: e.hid, name: e.name, place: e.place })), h.id);
    else { S.recordResult(C, meta, res.filter(e => e.sid !== "player"), s.n); optN++; }
    S.recordH2H(C, h, meta, res.map(e => ({ hid: e.hid, place: e.place, t: e.t, player: e.sid === "player" })), s.n);
    const oppAvg = opp.reduce((a, d) => a + rating(d.attrs), 0) / opp.length;
    const xp = S.xpFor({ tier: meta.tier, oppAvg, rating: rating(h.attrs), place: place || r.horses.length, field: r.horses.length, dnf: place === 0, optional: !official });
    h.xpFrac += xp / S.XP_PER_PT; const tp = Math.floor(h.xpFrac); h.xpFrac -= tp; h.trainPts += tp;
    h.history.push({ raceId: meta.id, name: meta.name, place, dist: meta.dist, tier: meta.tier, off: official });
    n++;
    out.push({ t, ride, c, n, div: s.div, official, race: meta.id, tier: meta.tier, place, field: r.horses.length, rating: +rating(h.attrs).toFixed(1), oppAvg: +oppAvg.toFixed(1), xp, tp });
    train(h);
  }
  // rival development is independent of the player: record the rival ratings at the end
  out.push({ t, ride, c, end: true, rivals: [0, 1, 2].map(d => { const rs = S.stablesOf(C, d).flatMap(st => st.horses.map(id => C.rivals[id])); return +(rs.reduce((a, rv) => a + S.rRating(rv), 0) / rs.length).toFixed(1); }), h2h: Object.values(C.h2h).sort((a, b) => b.n - a.n)[0] });
}
process.stdout.write(JSON.stringify(out));
