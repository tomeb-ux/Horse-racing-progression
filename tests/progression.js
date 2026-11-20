// Career progression & beginner balance with the real race engine (multi-process).
//   node tests/progression.js [careersPerCombo=3] [races=24] [workers=4]
// Each career: create a horse from a creator template (sprinter / miler / stayer), alternate official championship
// rounds and grade-matched optional races, auto-train after every race. "good" = the AI jockey rides the horse;
// "poor" = flat out from a so-so start (a badly mismanaged ride). Reports win / top-3 rates and rating by race number.
const { execFile } = require('child_process'), path = require('path');
const [N, RACES, W] = [+(process.argv[2] || 3), +(process.argv[3] || 24), +(process.argv[4] || 4)];
let rows = [], left = W; const t0 = Date.now();
for (let k = 0; k < W; k++) execFile('node', [path.join(__dirname, 'progression_worker.js'), k, W, N, RACES], { maxBuffer: 1 << 26 }, (e, so) => {
  if (e) { console.error(e); process.exit(1); }
  rows = rows.concat(JSON.parse(so)); if (--left) return;
  const races = rows.filter(r => !r.end), ends = rows.filter(r => r.end);
  const buckets = [[1, 3], [4, 8], [9, 12], [13, 16], [17, 20], [21, 24], [25, 30]].filter(b => b[0] <= RACES);
  for (const ride of ["good", "poor"]) {
    console.log(`\n=== ${ride === "good" ? "well ridden (AI jockey)" : "badly ridden (flat out from the gate)"}`);
    for (const t of ["sprint", "mile", "stay"]) {
      const R = races.filter(r => r.ride === ride && r.t === t);
      const line = buckets.map(([a, b]) => { const s = R.filter(r => r.n >= a && r.n <= b); if (!s.length) return ""; const w = s.filter(r => r.place === 1).length / s.length, p3 = s.filter(r => r.place > 0 && r.place <= 3).length / s.length, rt = s.reduce((x, r) => x + r.rating, 0) / s.length, dv = s.reduce((x, r) => x + r.div, 0) / s.length;
        return `r${a}-${b}: win ${(w * 100).toFixed(0).padStart(3)}% top3 ${(p3 * 100).toFixed(0).padStart(3)}% rt ${rt.toFixed(0)} div ${dv.toFixed(1)}`; }).filter(Boolean);
      console.log(`${t.padEnd(7)} ` + line.join(" | "));
    }
  }
  const first3 = races.filter(r => r.ride === "good" && r.n <= 3), maiden = races.filter(r => r.race === "maiden");
  console.log(`\nfirst three races (well ridden): win ${(100 * first3.filter(r => r.place === 1).length / first3.length).toFixed(0)}%, top-3 ${(100 * first3.filter(r => r.place > 0 && r.place <= 3).length / first3.length).toFixed(0)}% · maiden plate: won ${maiden.filter(r => r.place === 1).length}/${maiden.length} (good ${maiden.filter(r => r.ride === "good" && r.place === 1).length}/${maiden.filter(r => r.ride === "good").length}, poor ${maiden.filter(r => r.ride === "poor" && r.place === 1).length}/${maiden.filter(r => r.ride === "poor").length})`);
  const tp = races.filter(r => r.n <= 3); console.log(`training points per race, races 1-3: ${(tp.reduce((a, r) => a + r.tp, 0) / tp.length).toFixed(1)} · races 13+: ${(races.filter(r => r.n > 12).reduce((a, r) => a + r.tp, 0) / Math.max(1, races.filter(r => r.n > 12).length)).toFixed(1)}`);
  console.log(`rival average rating at the end (Prov/Metro/Feature): ${[0, 1, 2].map(d => (ends.reduce((a, e) => a + e.rivals[d], 0) / ends.length).toFixed(1)).join(" / ")} — identical across good and poor careers means rivals don't track the player`);
  const g = ends.filter(e => e.ride === "good"), p = ends.filter(e => e.ride === "poor");
  console.log(`  good-ride careers ${[0, 1, 2].map(d => (g.reduce((a, e) => a + e.rivals[d], 0) / g.length).toFixed(1)).join("/")} vs poor-ride careers ${[0, 1, 2].map(d => (p.reduce((a, e) => a + e.rivals[d], 0) / p.length).toFixed(1)).join("/")}`);
  console.log(`most-met rival head-to-head example: ${JSON.stringify(ends[0].h2h && { n: ends[0].h2h.n, ahead: ends[0].h2h.ahead, behind: ends[0].h2h.behind, closest: ends[0].h2h.closest })}`);
  console.log(`\n${races.length} races in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
});
