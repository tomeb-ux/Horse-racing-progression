// Career difficulty calibration with the real race engine (multi-process).
//   node tests/career_difficulty.js [racesPerCondition=60] [workers=4]
// "Rides well" is modelled by the Hard AI jockey riding the player's horse. Compares career fields (with the race-day
// lift of season.js raceField) against Quick Race on Hard (10 runners from the roster, Hard jockeys).
// Targets: a new horse's first starts → about 3rd (win ≲ 12 %); normal races → competitive (win ~15–25 %);
// finals → about as hard as Quick Race Hard.
const { execFile } = require('child_process'), path = require('path');
const AK = ["top", "acc", "end", "spr", "rec", "tem", "agi", "sta"];
const CONDS = [
  { id: "QR hard (baseline)", qr: true },
  { id: "new horse · maiden", div: 0, round: 0, rating: 71, runs: 0 },
  { id: "new horse · country cup", div: 0, round: 1, rating: 71, runs: 1 },
  { id: "new horse · midweek 1600", div: 0, round: 3, rating: 72, runs: 2 },
  { id: "6th start · Newcastle Mile", div: 0, round: 7, rating: 74, runs: 6 },
  { id: "Provincial Final", div: 0, round: 9, rating: 75, runs: 9, final: true },
  { id: "metro · Kingsford Mile", div: 1, round: 7, rating: 79, runs: 16 },
  { id: "Spring Metropolitan (final)", div: 1, round: 9, rating: 80, runs: 19, final: true },
  { id: "G1 · Doncaster (major)", div: 2, round: 2, rating: 84, runs: 24 },
  { id: "The Everest (crown)", div: 2, round: 6, rating: 87, runs: 28, final: true },
  { id: "Melbourne Cup (crown)", div: 2, round: 10, rating: 87, runs: 30, final: true },
];
if (process.argv[2] === 'worker') {
  const sim = require(path.join(__dirname, '..', 'public', 'sim.js'));
  const S = require(path.join(__dirname, '..', 'public', 'season.js'));
  const [k, K, N] = process.argv.slice(3, 6).map(Number), lift = process.env.NOLIFT ? false : true, diff = process.env.DIFF || "hard";
  // the player's horse: a career-creator build suited to the trip (sprinter / miler / stayer), scaled to the rating,
  // with the career's own style detection (career.js detectStyle)
  const TPL = { sprint: { top: 22, acc: 26, spr: 22, sta: 24, agi: 12, tem: 10, end: 10, rec: 10 }, mile: { top: 20, acc: 16, spr: 18, end: 18, rec: 14, tem: 16, agi: 18, sta: 16 },
    stay: { end: 30, rec: 26, top: 18, tem: 22, spr: 10, acc: 8, agi: 10, sta: 12 } };
  const detectStyle = a => { const sprint = (a.top + a.acc + a.spr) / 3, stay = (a.end + a.rec) / 2;
    if (a.spr >= 85 && stay < sprint - 4) return "closer"; if (a.sta >= 82 && a.acc >= 78 && a.end < 80) return "front";
    if (sprint >= 83 && a.end < 74) return "stalk"; if (stay >= 80 && a.end >= 82) return "steady"; if (a.agi >= 82 && a.tem >= 78) return "stalk"; return "mid"; };
  const playerDef = (rating, dist) => {
    const w = TPL[dist <= 1400 ? "sprint" : dist >= 2000 ? "stay" : "mile"], sum = AK.reduce((a, k) => a + w[k], 0), attrs = {};
    // spread around the rating in proportion to the build (± about 9 points), then re-centred on the rating
    for (const k of AK) attrs[k] = rating + (w[k] / sum * 8 - 1) * 9;
    const avg = AK.reduce((a, k) => a + attrs[k], 0) / 8; for (const k of AK) attrs[k] = Math.max(30, Math.min(99, Math.round(attrs[k] + rating - avg)));
    return { name: "Test Horse", role: "x", style: detectStyle(attrs), coat: 0x7a4a28, silk: "#ffffff", attrs };
  };
  const out = []; let j = 0;
  for (const c of CONDS) for (let s = 0; s < N; s++, j++) {
    if (j % K !== k) continue;
    const seed = 9000 + j * 7919;
    let r;
    if (c.qr) {
      const dist = [1200, 1600, 2000, 2400][s % 4];
      r = new sim.Race({ distance: dist, field: 10, diff: "hard", playerHorse: s % sim.ROSTER.length, allBots: true, going: "good", incidents: "full", seed });
    } else {
      const C = { seed: 4242 + (s % 9), stable: "T", horses: [], trophies: [] }; S.migrate(C);
      const meta = S.DIVS[c.div].rounds[c.round], pd = playerDef(c.rating, meta.dist);
      let opp = S.runnersFor(C, c.div, c.round);
      if (lift) opp = S.raceField(opp, meta, { attrs: pd.attrs, races: c.runs }, !!c.final);
      r = new sim.Race({ distance: meta.dist, field: meta.field, diff: lift ? diff : meta.diff, playerDef: pd, oppDefs: opp, allBots: true, going: "good", incidents: "full", seed });
    }
    r.state = "count"; r.openGates();
    while (r.finishOrder.length + r.dnfs.length < r.horses.length && r.clock < 600) r.simStep(sim.SIM_DT);
    r.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
    out.push({ c: c.id, place: r.player.dnf ? 0 : r.finishOrder.indexOf(r.player) + 1, n: r.horses.length });
  }
  process.stdout.write(JSON.stringify(out));
} else {
  const N = +(process.argv[2] || 60), W = +(process.argv[3] || 4), t0 = Date.now();
  let rows = [], left = W;
  for (let k = 0; k < W; k++) execFile('node', [__filename, 'worker', k, W, N], { maxBuffer: 1 << 26 }, (e, so) => {
    if (e) { console.error(e); process.exit(1); }
    rows = rows.concat(JSON.parse(so)); if (--left) return;
    for (const c of CONDS) {
      const R = rows.filter(r => r.c === c.id), fin = R.filter(r => r.place > 0);
      const w = R.filter(r => r.place === 1).length / R.length, p3 = R.filter(r => r.place > 0 && r.place <= 3).length / R.length;
      const med = fin.map(r => r.place).sort((a, b) => a - b)[fin.length >> 1];
      console.log(`${c.id.padEnd(30)} win ${(100 * w).toFixed(0).padStart(3)}%  top-3 ${(100 * p3).toFixed(0).padStart(3)}%  avg place ${(fin.reduce((a, r) => a + r.place, 0) / fin.length).toFixed(1)}  median ${med}  (of ${R[0].n}, n=${R.length})`);
    }
    console.log(`${rows.length} races in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  });
}
