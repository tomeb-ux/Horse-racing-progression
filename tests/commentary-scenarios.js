// Commentary director — scenario tests. Runs many real races through the commentary director (with a simulated voice),
// finds the seven race shapes below, and checks that the call fits the race that actually happened:
//   packed field · leader all the way · runaway leader caught late · midfield horse's big finishing run ·
//   little positional movement · three-horse battle · photo finish
// For every race: no sentence repeated, phrases varied, the leader not narrated over and over, every claim true when
// spoken, excitement proportional to how close the finish really is, the winner named only after the official result.
//   node tests/commentary-scenarios.js [races=160] [--doc docs/COMMENTARY-SCENARIOS.md]
const path = require('path'), fs = require('fs');
const sim = require(path.join(__dirname, '..', 'public', 'sim.js'));
const COMM = require(path.join(__dirname, '..', 'public', 'commentary.js'));
const S = require(path.join(__dirname, '..', 'public', 'season.js'));
const N = +(process.argv[2] || 160), DOC = process.argv.includes('--doc') ? process.argv[process.argv.indexOf('--doc') + 1] : null;
const LEN = sim.LEN_M;
let pass = 0, fail = 0; const fails = [];
const ok = (c, msg) => { if (c) pass++; else { fail++; fails.push(msg); } };

function fakeSpeaker(clock, log) {
  return { cur: null, endAt: 0, onEnd: null, overlaps: 0, spans: [],
    speak(text, prm, onEnd, info) { if (this.cur) this.overlaps++; this.cur = text; this.onEnd = onEnd; this.t0 = clock.t;
      // duration of the real recordings: ~0.075 s per character at a calm pace, ~0.065 when urgent, + joins
      this.endAt = clock.t + 0.25 + text.length * (prm.level >= 4 ? 0.062 : prm.level >= 3 ? 0.068 : 0.074); log.push({ t: clock.t, text }); },
    cancel() { if (this.cur) this.spans.push([this.t0, clock.t]); this.cur = null; this.onEnd = null; },
    tick() { if (this.cur && clock.t >= this.endAt) { this.spans.push([this.t0, this.endAt]); const f = this.onEnd; this.cur = null; this.onEnd = null; f && f(); } } };
}
const AK = ["top", "acc", "end", "spr", "rec", "tem", "agi", "sta"];
function field(i) {
  const C = { seed: 500 + i, stable: "T", horses: [], trophies: [] }; S.migrate(C);
  const div = i % 3, ridx = Math.min(S.DIVS[div].rounds.length - 1, (i * 7) % 10);
  let opp = S.runnersFor(C, div, ridx).slice(0, 11);
  const kind = i % 6;
  // shape some fields: evenly matched (packed / close finishes), one class runner (wire-to-wire), a speed horse with
  // no stamina against stayers (runaway caught late)
  if (kind === 1) opp = opp.map(d => Object.assign({}, d, { style: "mid", attrs: Object.fromEntries(AK.map(k => [k, 74 + ((k.length * 7 + d.name.length) % 5)])) }));
  if (kind === 2) opp[0] = Object.assign({}, opp[0], { style: "front", attrs: { top: 99, acc: 96, end: 92, spr: 80, rec: 85, tem: 90, agi: 80, sta: 95 } });
  if (kind === 3) opp[0] = Object.assign({}, opp[0], { style: "front", attrs: { top: 99, acc: 99, end: 30, spr: 40, rec: 40, tem: 30, agi: 70, sta: 30 } });
  if (kind === 4) { opp[0] = Object.assign({}, opp[0], { style: "closer", attrs: { top: 97, acc: 80, end: 95, spr: 99, rec: 85, tem: 90, agi: 80, sta: 90 } }); }
  return opp;
}
function runOne(i) {
  const dists = [1200, 1400, 1600, 2000, 2400, 3200, 1000], dist = dists[i % dists.length];
  const opp = field(i), t = sim.ROSTER[i % 12];
  const meta = i % 5 === 0 ? { name: "Melbourne Cup", venue: "Flemington", major: true, crown: true, official: true } : i % 5 === 1 ? { name: "The Everest", venue: "Royal Randwick", major: true, crown: true, official: true } : { name: null, venue: "Furlong Park" };
  const r = new sim.Race({ distance: dist, field: opp.length + 1, diff: "hard", playerDef: { name: "Midnight Legend", style: t.style, role: t.role, coat: 1, silk: "#fff", attrs: Object.assign({}, t.attrs) }, oppDefs: opp, allBots: true, going: "good", incidents: "off", seed: 777 + i * 104729, track: i % 5 === 0 ? "flemington" : i % 5 === 1 ? "randwick" : undefined });
  const clock = { t: 0 }, log = [], speakLog = [], sp = fakeSpeaker(clock, speakLog);
  let seedR = (i * 2654435761) >>> 0; const rng = () => { seedR = (seedR * 1664525 + 1013904223) >>> 0; return seedR / 4294967296; };
  const booth = new COMM.Booth(r, meta, sp, { player: r.horses[0], log: e => log.push(e), rng });
  // race facts sampled alongside: margins, ranks, the field's spread
  const facts = { lead: [], spanMid: [], rank: new Map(), at: {} }; const finT = new Map();
  let steps = 0;
  while (steps++ < 160 * 420) {
    r.step(sim.SIM_DT); clock.t += sim.SIM_DT;
    if (r.state === "running" && steps % 20 === 0) {
      const run = r.horses.filter(h => !h.finished && !h.dnf).sort((a, b) => b.progress - a.progress);
      const fin = r.horses.filter(h => h.finished).sort((a, b) => a.finishTime - b.finishTime), ord = fin.concat(run);
      if (run.length > 1 && !fin.length) { const L = run[0], rem = r.dist - L.progress, frac = L.progress / r.dist;
        facts.lead.push({ t: clock.t, rem, L, gL: (L.progress - run[1].progress) / LEN, g3: run[2] ? (L.progress - run[2].progress) / LEN : 99 });
        if (frac > 0.3 && frac < 0.8) facts.spanMid.push((run[0].progress - run[Math.min(7, run.length - 1)].progress) / LEN);   // the first eight runners
        for (const m of [600, 400, 200]) if (!facts.at[m] && rem <= m) facts.at[m] = { L, gL: (L.progress - run[1].progress) / LEN, ranks: new Map(ord.map((h, k) => [h, k + 1])) };
        if (frac > 0.3 && frac < 0.85) { const top = run.slice(0, 6).map(h => h.def.name).join("|"); facts.rank.set(top, (facts.rank.get(top) || 0) + 1); } }
    }
    for (const h of r.horses) if (h.finished && !finT.has(h)) finT.set(h, clock.t);
    if (steps % 4 === 0) booth.update(clock.t);
    sp.tick();
    if (r.state === "done" && log.some(e => e.cat === 'win') && !sp.cur) break;
    if (r.state === "done" && clock.t - (finT.size ? Math.min(...finT.values()) : clock.t) > 12) break;
  }
  const fo = r.finishOrder, W = fo[0];
  const margin = fo[1] ? (fo[1].finishTime - W.finishTime) * Math.max(10, fo[1].stat && fo[1].stat.vFin || 16) : 99;
  const m3 = fo[2] ? (fo[2].finishTime - W.finishTime) * 16 : 99;
  return { i, r, meta, log, sp, facts, finT, W, margin, m3, dist };
}
// what kind of race was it?
function classify(R) {
  const f = R.facts, lead = f.lead, out = [];
  const led = lead.filter(x => x.rem < R.dist * 0.75), wire = led.length && led.every(x => x.L === R.W);
  if (R.margin < 0.3) out.push("photo");
  if (R.m3 < 1.4 * LEN && R.margin < 1.2 * LEN) out.push("three");
  if (wire && R.margin > 1.5 * LEN) out.push("wire");
  if (f.at[600] && f.at[600].gL >= 3 && f.at[600].L !== R.W) out.push("caught");
  if (f.at[400] && f.at[400].ranks.get(R.W) >= 5) out.push("midfield");
  if (f.spanMid.length && f.spanMid.reduce((a, b) => a + b, 0) / f.spanMid.length < 9.5) out.push("packed");
  const samples = [...f.rank.values()].reduce((a, b) => a + b, 0), top = Math.max(0, ...f.rank.values());
  if (samples > 20 && top / samples > 0.55) out.push("static");
  return out;
}
const SC = { packed: "A tightly packed field", wire: "Leading from start to finish", caught: "A runaway leader caught late", midfield: "A midfield horse's powerful finishing run", static: "Very little positional movement", three: "A dramatic three-horse battle", photo: "A photo finish" };
const found = {}, all = [];
const agg = { lines: 0, races: 0, unique: 0, units: 0, rep: 0, leadMid: [], midLines: [], cover: [], maxQuiet: [], late: [], early: [] };
for (let i = 0; i < N; i++) {
  const R = runOne(i), { log, r } = R, tag = `race ${i} (${R.dist} m)`;
  const kinds = classify(R); R.kinds = kinds; all.push(R);
  for (const k of kinds) if (!found[k]) found[k] = R;
  agg.races++; agg.lines += log.length;
  // 1. nothing said twice: no identical sentence in a race, and phrases varied
  const texts = log.map(e => e.text); ok(new Set(texts).size === texts.length, `${tag}: no sentence repeated (${texts.length - new Set(texts).size} repeats)`);
  const ids = log.flatMap(e => e.ids || []); agg.units += ids.length; agg.unique += new Set(ids).size;
  // 2. claims are true when spoken; the winner only after the result
  for (const e of log) if (e.claim && !e.final && e.claim !== e.leaderNow) ok(false, `${tag}: "${e.text}" claims ${e.claim.def.name} leads but ${e.leaderNow && e.leaderNow.def.name} does`);
  const win = log.find(e => e.cat === 'win'); ok(win && win.text.includes(R.W.def.name), `${tag}: winner called — ${win && win.text}`);
  const firstFin = Math.min(...R.finT.values()); ok(!log.some(e => (e.cat === 'win') && e.t < firstFin), `${tag}: no winner named before the finish`);
  ok(R.sp.overlaps === 0, `${tag}: no overlapping speech`);
  // 3. a close finish is never invented: battle/photo language only when it really is close at that moment
  for (const e of log) {
    const at = R.facts.lead.filter(x => x.t <= e.t).pop();
    if (/locked together|Stride for stride|Neck and neck|Nothing between them|won't give an inch|Head to head|hammer and tongs|Side by side/.test(e.text) && at) ok(at.gL < 1.0, `${tag}: "${e.text}" at a ${at.gL.toFixed(1)}-length margin`);
    if (/demolition|procession|lengths clear!|right out on its own|in a class of its own|running them ragged/.test(e.text) && at && e.cat !== 'win') ok(at.gL >= 1.4, `${tag}: runaway call "${e.text}" with only ${at.gL.toFixed(1)} lengths`);
    if (/starting to come back to them\.|reel in the leader|margin is coming down|lead is shrinking|closing the gap/.test(e.text)) ok(R.facts.lead.some(x => x.t <= e.t && x.t > e.t - 12 && x.gL > (at ? at.gL : 0) + 1), `${tag}: "${e.text}" without the margin actually coming down`);
    if (/coming back to them!|lead is disappearing|swallowing up the leader|leader is stopping/.test(e.text)) { const big = Math.max(0, ...R.facts.lead.filter(x => x.t > e.t - 25 && x.t <= e.t).map(x => x.gL));
      ok(big >= 3 && at && at.gL < big - 1.4, `${tag}: "${e.text}" — the leader's biggest margin in the last 25 s was ${big.toFixed(1)} lengths, now ${at ? at.gL.toFixed(1) : "?"}`); }
  }
  // a prediction ("nothing's going to catch this one") must come true
  for (const e of log) if (/catch this one|all over bar the shouting|got them all off the bit|running for the places/.test(e.text)) ok(e.leaderNow === R.W, `${tag}: "${e.text}" — but ${R.W.def.name} won, not ${e.leaderNow && e.leaderNow.def.name}`);
  if (R.margin > 4 * LEN) ok(!log.some(e => e.rem != null && e.rem < 150 && /locked|Stride for stride|Neck and neck|photo|together/i.test(e.text)), `${tag}: a ${(R.margin / LEN).toFixed(1)}-length win was not called as a close finish`);
  if (R.margin < 0.6) { const maxI = Math.max(...log.filter(e => e.rem != null && e.rem < 250).map(e => e.I)); ok(maxI >= 4.6, `${tag}: a close finish (${R.margin.toFixed(2)} m) reached full excitement (${maxI})`); }
  // 4. the leader is not narrated over and over: mid-race lines about the leader
  const mid = log.filter(e => e.st === 'mid'); const aboutLeader = mid.filter(e => e.claim && e.key !== 'leadNew' && e.key !== 'order').length;   // a lead change is news; the run through the field is the field
  if (mid.length >= 6) { agg.leadMid.push(aboutLeader / mid.length); agg.midLines.push(mid.length); }
  const bigLead = R.facts.lead.filter(x => x.rem > 700 && x.gL >= 4).length > 10;
  if (bigLead && mid.length >= 6) ok(aboutLeader / mid.length <= 0.5, `${tag}: with a big breakaway the caller talks about the race, not just the leader (${aboutLeader}/${mid.length} lines about the leader)`);
  // 5. pacing: quiet moments mid-race, continuous at the end
  { const t0 = log.find(e => e.cat === 'away') ? log.find(e => e.cat === 'away').t + 2 : 0, t1 = firstFin;
    const sp2 = R.sp.spans.map(([a, b]) => [Math.max(a, t0), Math.min(b, t1)]).filter(x => x[1] > x[0]); const talk = sp2.reduce((a, x) => a + x[1] - x[0], 0);
    agg.cover.push(talk / (t1 - t0)); const ts = [t0].concat(sp2.flat()).concat([t1]); let gm = 0, gl = 0;
    for (let k = 0; k + 1 < ts.length; k += 2) { const g = ts[k + 1] - ts[k]; if (ts[k] < t1 - 20) gm = Math.max(gm, g); else gl = Math.max(gl, g); }
    agg.maxQuiet.push(gm); ok(gl < 2.2, `${tag}: no long silence in the last 20 s (${gl.toFixed(1)} s)`); ok(gm < 9, `${tag}: no dead air mid-race (${gm.toFixed(1)} s)`); }
  for (const e of log) { if (e.rem == null) continue; if (e.rem > 800 && e.st === 'mid') agg.early.push(e.I); if (e.rem < 400 && e.rem > 0) agg.late.push(e.I); }
}
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
ok(mean(agg.late) > mean(agg.early) + 2, `excitement rises: mid-race ${mean(agg.early).toFixed(2)} → final 400 m ${mean(agg.late).toFixed(2)}`);
ok(agg.unique / agg.units > 0.75, `phrases within a race are varied: ${(100 * agg.unique / agg.units).toFixed(0)}% of phrase uses are a phrase's only use in that race`);
for (const k of Object.keys(SC)) ok(!!found[k], `scenario found and called: ${SC[k]}`);
console.log(`${agg.races} races · ${(agg.lines / agg.races).toFixed(1)} lines per race · ${(100 * agg.unique / agg.units).toFixed(0)}% unique phrase uses per race · mid-race lines about the leader ${(100 * mean(agg.leadMid)).toFixed(0)}% · speaking ${(100 * mean(agg.cover)).toFixed(0)}% of the race (longest mid-race pause avg ${mean(agg.maxQuiet).toFixed(1)} s) · excitement mid ${mean(agg.early).toFixed(2)} → last 400 m ${mean(agg.late).toFixed(2)}`);
{ const sp = all.map(R => R.facts.spanMid.length ? R.facts.spanMid.reduce((a, b) => a + b, 0) / R.facts.spanMid.length : 99).sort((a, b) => a - b); console.log('mid-race spread of the first eight (lengths): min ' + sp[0].toFixed(1) + ', 10th pct ' + sp[Math.floor(sp.length * 0.1)].toFixed(1) + ', median ' + sp[sp.length >> 1].toFixed(1)); }
console.log('scenarios found: ' + Object.keys(SC).map(k => `${k}${found[k] ? " (race " + found[k].i + ")" : " —"}`).join(", "));
if (DOC) {
  let md = `# Final Furlong — the race caller in seven kinds of race\n\nGenerated by \`node tests/commentary-scenarios.js ${N} --doc ${DOC}\`: real simulated races, the commentary director, and the lines it chose (the same phrases the ElevenLabs commentator recorded). Time · excitement (1 calm … 5 frantic) · distance to go · the line.\n`;
  for (const [k, title] of Object.entries(SC)) { const R = found[k]; if (!R) { md += `\n## ${title}\n\n(not found in ${N} races)\n`; continue; }
    md += `\n## ${title}\n\n${R.meta.name || "Race"} at ${R.meta.venue}, ${R.dist} m — winner ${R.W.def.name} by ${(R.margin / LEN).toFixed(2)} lengths.\n\n| time | I | to go | call |\n|---|---|---|---|\n`;
    for (const e of R.log) md += `| ${e.t.toFixed(1)} s | ${e.I.toFixed(1)} | ${e.rem == null ? "pre" : Math.max(0, Math.round(e.rem)) + " m"} | ${e.text} |\n`; }
  fs.writeFileSync(DOC, md); console.log('wrote ' + DOC);
}
for (const f of fails.slice(0, 30)) console.log(' ✗ ' + f);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
