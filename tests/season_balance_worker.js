// worker: real engine races — a player horse (AI-ridden) of a given rating vs a division's AI stable runners
const path = require('path');
const sim = require(path.join(__dirname, '..', 'public', 'sim.js'));
const S = require(path.join(__dirname, '..', 'public', 'season.js'));
const [k, K, n] = [+process.argv[2], +process.argv[3], +process.argv[4]];
const plan = JSON.parse(process.argv[5]);
const AK = ["top","acc","end","spr","rec","tem","agi","sta"];
const T = n => sim.ROSTER.find(r => r.name === n);
function playerDef(rating, dist) {
  const t = dist <= 1200 ? T("Ka Ying Rising") : dist >= 2400 ? T("Willow's Pride") : T("Trust Your Instinct");
  const avg = AK.reduce((s, x) => s + t.attrs[x], 0) / 8, attrs = {};
  for (const x of AK) attrs[x] = Math.max(30, Math.min(99, Math.round(t.attrs[x] * rating / avg)));
  return { name: "Test Horse", role: t.role, style: t.style, coat: 0x7a4a28, silk: "#ffffff", attrs };
}
const jobs = []; let j = 0;
for (const p of plan) for (let s = 0; s < n; s++) jobs.push(Object.assign({ s, seed: 7000 + (j++) * 7919 }, p));
const out = [];
for (let i = k; i < jobs.length; i += K) {
  const J = jobs[i];
  const C = { seed: 4242 + J.s, stable: "T", horses: [], trophies: [] }; S.migrate(C);
  const meta = S.DIVS[J.div].rounds[J.round];
  const opp = S.runnersFor(C, J.div, J.round);
  const r = new sim.Race({ distance: meta.dist, field: meta.field, diff: meta.diff, playerDef: playerDef(J.rating, meta.dist), oppDefs: opp, allBots: true, going: "good", incidents: "full", seed: J.seed });
  r.state = "count"; r.openGates();
  while (r.finishOrder.length + r.dnfs.length < r.horses.length && r.clock < 600) r.simStep(sim.SIM_DT);
  const place = r.player.dnf ? 0 : r.finishOrder.indexOf(r.player) + 1;
  out.push({ div: J.div, round: J.round, rating: J.rating, place });
}
process.stdout.write(JSON.stringify(out));
