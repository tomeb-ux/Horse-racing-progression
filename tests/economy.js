// Economy balance by simulation (Phase 7): whole careers with the REAL race engine, the real championship / rival / XP code and the real money rules
// (career-core.js: entry fees, weekly bills, prizes, sponsorship, milestones, club advance). Reports the money curve and checks the design goals:
//   • a competent early-career stable can keep one horse, enter every round, and bank a surplus (a first upgrade ≈ within a season; a second horse within 1–2);
//   • a poor stable is squeezed but never trapped: it can always enter the next round (cash or the club advance) and the balance never goes negative;
//   • nothing is ever paid twice, and cash + the ledger agree.
//   node tests/economy.js [careersPerCombo=1] [seasons=2]
const path = require('path');
const sim = require(path.join(__dirname, '..', 'public', 'sim.js')), S = require(path.join(__dirname, '..', 'public', 'season.js')), K = require(path.join(__dirname, '..', 'public', 'career-core.js'));
const X = sim.SIM_EXPORTS, AK = ['top', 'acc', 'end', 'spr', 'rec', 'tem', 'agi', 'sta'];
const N = +process.argv[2] || 1, SEASONS = +process.argv[3] || 2;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const BASE = 54, START_POOL = 136, START_CAP = 84, POT_POOL = 168, POT_CAP = 98;
const TPL = { sprint: { top: 22, acc: 26, spr: 22, sta: 24, agi: 12, tem: 10, end: 10, rec: 10 }, mile: { top: 20, acc: 16, spr: 18, end: 18, rec: 14, tem: 16, agi: 18, sta: 16 }, stay: { end: 30, rec: 26, top: 18, tem: 22, spr: 10, acc: 8, agi: 10, sta: 12 } };
function create(t) { const w = TPL[t], sum = AK.reduce((s, x) => s + w[x], 0), a = {}; let left = START_POOL; for (const x of AK) { const v = Math.min(START_CAP - BASE, Math.floor(START_POOL * w[x] / sum)); a[x] = BASE + v; left -= v; }
  for (const x of AK.slice().sort((p, q) => w[q] - w[p])) { if (left <= 0) break; const add = Math.min(left, START_CAP - a[x]); a[x] += add; left -= add; }
  const ww = {}; for (const x of AK) ww[x] = Math.max(1, a[x] - BASE + 4); const s2 = AK.reduce((s, x) => s + ww[x], 0), pot = {}; let pl = POT_POOL;
  for (const x of AK) { const hr = Math.min(POT_CAP - a[x], Math.floor(POT_POOL * ww[x] / s2)); pot[x] = a[x] + hr; pl -= hr; }
  for (let g = 0; pl > 0 && g < 500; g++) { const x = AK.filter(y => pot[y] < POT_CAP).sort((p, q) => ww[q] - ww[p])[g % 3]; if (!x) break; pot[x]++; pl--; }
  return { id: 'p1', name: 'Test Horse', attrs: a, pot, trainPts: 0, xpFrac: 0, history: [], w, look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, silk: '#fff', silk2: '#000', silkPat: 'solid', xp: 0, lvl: 1, races: 0, wins: 0, places: 0, podiums: 0, offRaces: 0, offWins: 0, champPts: 0, majors: 0, prize: 0, trained: 0, born: 1 }; }
function train(h) { for (let guard = 0; guard < 400; guard++) { let best = null, bs = -1; for (const x of AK) { if (h.attrs[x] >= h.pot[x]) continue; const c = S.upgCost(h.attrs[x]); if (c > h.trainPts) continue; const sc = h.w[x] / c; if (sc > bs) { bs = sc; best = x; } } if (!best) break; h.trainPts -= S.upgCost(h.attrs[best]); h.attrs[best]++; } }
const rating = a => AK.reduce((s, x) => s + a[x], 0) / 8;
function runRace(meta, h, opp, ride, seed, going) {
  const def = { name: h.name, style: h.w === TPL.stay ? 'steady' : h.w === TPL.sprint ? 'stalk' : 'mid', role: 'x', coat: 1, silk: '#fff', attrs: Object.assign({}, h.attrs) }, good = ride === 'good';
  const r = new sim.Race({ distance: meta.dist, field: opp.length + 1, diff: meta.diff, playerDef: def, oppDefs: opp, allBots: good, going: going || 'good', incidents: 'full', seed }); r.state = 'count'; r.openGates(); const p = r.player;
  if (!good) { r.st.launched = true; r.applyStart(p, 0.45, 0.3); }
  while (r.finishOrder.length + r.dnfs.length < r.horses.length && r.clock < 600) { if (!good && !p.finished && !p.dnf) { const sp = X.PACING.flatOut(r.dist - p.progress, r.dist, p, r); p.effort = sp.e; p.drive = !!sp.drive && p.started; } r.simStep(sim.SIM_DT); }
  r.finishOrder.sort((a, b) => a.finishTime - b.finishTime); return r;
}
const results = [];
for (const t of ['sprint', 'mile', 'stay']) for (const ride of ['good', 'poor']) for (let c = 0; c < (ride === 'good' ? N : Math.max(1, N - 0)); c++) {
  const C = K.fresh(9000 + c * 131 + t.length * 7); const h = create(t); C.horses = [h]; S.migrate(C); K.migrate(C, { from: 4 }); K.fillHorse(h, C, { age: 4 });
  let seed = 4000 + c * 977 + t.length, minCash = C.cash, stuck = 0, races = 0, fees = 0, prizes = 0, bonus = 0, advances = 0; const bySeason = [];
  const startCash = C.cash;
  for (let sn = 0; sn < SEASONS; sn++) {
    const s0 = { cash: C.cash, fees: 0, prizes: 0, wins: 0, races: 0, skipped: 0, bonus: 0, upkeep: 0, sponsor: 0 };
    while (!S.done(C.season)) {
      const s = C.season, meta = S.roundDef(s); if (!S.eligibility(h, meta).ok) { S.skipRound(C); s0.skipped++; continue; }
      const ev = K.roundEvent(C, s.cur); if (ev) K.enterRound(C, s.cur);                                             // the date becomes the round's day (the weekly bills fall due on the way)
      const fee = K.entryFee(meta), key = 'entry:s' + s.n + ':' + meta.id + ':' + h.id;
      if (C.cash < fee) { const o = K.clubAdvance(C); if (o.ok) advances++; }                                       // the club helps once a season
      const pe = K.payEntry(C, key, meta, h.name); if (!pe.ok) { stuck++; S.skipRound(C); s0.skipped++; continue; }
      fees += pe.fee; s0.fees += pe.fee;
      const opp = S.runners(C), r = runRace(meta, h, opp, ride, seed++, s.rounds[s.cur].going), P = r.player, place = P.dnf ? 0 : r.finishOrder.indexOf(P) + 1;
      const res = r.finishOrder.map((x, i) => ({ sid: x === P ? 'player' : x.def._sid, hid: x === P ? h.id : x.def._hid, name: x.def.name, place: i + 1, t: x.finishTime })); r.dnfs.forEach(x => res.push({ sid: x === P ? 'player' : x.def._sid, hid: x === P ? h.id : x.def._hid, name: x.def.name, place: 0 }));
      S.commitRound(C, s.cur, res.map(e => ({ sid: e.sid, hid: e.hid, name: e.name, place: e.place })), h.id); S.recordH2H(C, h, meta, res.map(e => ({ hid: e.hid, place: e.place, t: e.t, player: e.sid === 'player' })), s.n);
      const oppAvg = opp.reduce((a, d) => a + rating(d.attrs), 0) / opp.length, xp = S.xpFor({ tier: meta.tier, oppAvg, rating: rating(h.attrs), place: place || r.horses.length, field: r.horses.length, dnf: place === 0, optional: false });
      h.xpFrac += xp / S.XP_PER_PT; const tp = Math.floor(h.xpFrac); h.xpFrac -= tp; h.trainPts += tp; h.races++; train(h);
      if (place === 1) { h.wins++; C.wins++; s0.wins++; }
      if (place >= 1 && place <= 5) { const pr = K.awardPrize(C, 'prize:s' + s.n + ':' + meta.id + ':' + h.id, meta, place, h.name); if (pr.ok) { prizes += pr.amount; s0.prizes += pr.amount; K.repayFromPrize(C, 'prize:s' + s.n + ':' + meta.id + ':' + h.id, pr.amount); } }
      K.addRep(C, place, meta, true); for (const m of K.milestones(C, place, meta)) { bonus += m.amount; s0.bonus += m.amount; }
      races++; s0.races++; minCash = Math.min(minCash, C.cash);
    }
    // the season rolls over (the calendar runs to 1 August: the remaining weekly bills fall due)
    S.closeSeason(C); K.startSeason(C); K.syncCalendar(C); s0.end = C.cash; s0.net = C.cash - s0.cash; s0.debt = K.econOf(C).debt; bySeason.push(s0); minCash = Math.min(minCash, C.cash);
  }
  const ledgerKinds = {}; for (const e of C.ledger) ledgerKinds[e.kind] = (ledgerKinds[e.kind] || 0) + e.amount;
  results.push({ t, ride, c, races, fees, prizes, bonus, advances, stuck, minCash, end: C.cash, debt: K.econOf(C).debt, rep: C.rep, bySeason, audit: K.audit(C), kinds: ledgerKinds, wins: h.wins });
  console.log(`${t.padEnd(6)} ${ride.padEnd(4)} #${c}: ${races} rounds, ${h.wins} wins · prizes $${prizes.toLocaleString()} fees $${fees.toLocaleString()} bonus $${bonus.toLocaleString()} · cash $${startCash.toLocaleString()} → $${C.cash.toLocaleString()} (min $${minCash.toLocaleString()}) owed $${K.econOf(C).debt.toLocaleString()} · per season net ${bySeason.map(x => '$' + x.net.toLocaleString()).join(' / ')} · rep ${C.rep}`);
}
const good = results.filter(r => r.ride === 'good'), poor = results.filter(r => r.ride === 'poor');
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
console.log(`\ngood riders: mean net per season $${Math.round(mean(good.flatMap(r => r.bySeason.map(x => x.net)))).toLocaleString()}, mean end cash $${Math.round(mean(good.map(r => r.end))).toLocaleString()}; poor riders: mean net per season $${Math.round(mean(poor.flatMap(r => r.bySeason.map(x => x.net)))).toLocaleString()}, mean end cash $${Math.round(mean(poor.map(r => r.end))).toLocaleString()}`);
ok(results.every(r => r.minCash >= 0), `the balance never went negative in any of the ${results.length} careers (lowest ever $${Math.min(...results.map(r => r.minCash)).toLocaleString()})`);
ok(results.every(r => r.audit.length === 0), 'every career passes the ledger audit (cash = the sum of the ledger, no key paid twice)');
ok(results.every(r => r.stuck === 0), `every stable could always enter the next round — cash, a cheaper position or the club advance was always enough (${results.reduce((a, r) => a + r.stuck, 0)} blocked entries)`);
ok(good.every(r => r.bySeason[0].net > 0), `a competent stable ends its FIRST season in profit (net ${good.map(r => '$' + r.bySeason[0].net.toLocaleString()).join(', ')}) — one horse is sustainable`);
ok(mean(good.map(r => r.bySeason[0].net)) >= 20000, `…with a real surplus towards a first upgrade or a second horse (mean first-season net $${Math.round(mean(good.map(r => r.bySeason[0].net))).toLocaleString()})`);
ok(mean(good.map(r => r.end)) > mean(poor.map(r => r.end)), 'good riding earns clearly more than poor riding (the economy rewards good decisions)');
ok(poor.every(r => r.debt <= 60000), `poor results are squeezed but recoverable: money owed to the club stays modest (max $${Math.max(0, ...poor.map(r => r.debt)).toLocaleString()})`);
ok(results.every(r => r.advances <= SEASONS), 'the club advance is used at most once per season');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
