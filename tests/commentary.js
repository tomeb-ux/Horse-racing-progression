// Commentary accuracy tests: the real race engine + the commentary booth with a simulated voice.
// Every line is checked against the race state at the moment it is spoken.
//   node tests/commentary.js [races=36] [--print]
const path = require('path');
const sim = require(path.join(__dirname, '..', 'public', 'sim.js'));
const COMM = require(path.join(__dirname, '..', 'public', 'commentary.js'));
const S = require(path.join(__dirname, '..', 'public', 'season.js'));
const N = +(process.argv[2] || 36), PRINT = process.argv.includes('--print');
let pass = 0, fail = 0; const fails = [];
const ok = (c, msg) => { if (c) pass++; else { fail++; fails.push(msg); } };

function fakeSpeaker(clock, log) {
  return {
    cur: null, endAt: 0, onEnd: null, overlaps: 0,
    spans: [],
    speak(text, prm, onEnd) { if (this.cur) this.overlaps++; this.cur = text; this.onEnd = onEnd; this.t0 = clock.t; this.endAt = clock.t + 0.35 + text.split(/\s+/).length / (2.6 * prm.rate); log.push({ t: clock.t, text, rate: prm.rate }); },
    cancel() { if (this.cur) this.spans.push([this.t0, clock.t]); this.cur = null; this.onEnd = null; },
    tick() { if (this.cur && clock.t >= this.endAt) { this.spans.push([this.t0, this.endAt]); const f = this.onEnd; this.cur = null; this.onEnd = null; f && f(); } },
  };
}
const AK = ["top", "acc", "end", "spr", "rec", "tem", "agi", "sta"];
function runOne(i, opts) {
  opts = opts || {};
  const dists = [1000, 1200, 1400, 1600, 2000, 2400, 3200], dist = opts.dist || dists[i % dists.length];
  const C = { seed: 900 + i, stable: "T", horses: [], trophies: [] }; S.migrate(C);
  const ridx = Math.min(S.DIVS[i % 3].rounds.length - 1, i % 10);
  const opp = S.runnersFor(C, i % 3, ridx).slice(0, 11);
  const t = sim.ROSTER[i % 12], avg = AK.reduce((s, k) => s + t.attrs[k], 0) / 8, rt = opts.rating || (S.DIVS[i % 3].rounds[ridx].str + (i % 5) * 2 - 2), a = {};
  for (const k of AK) a[k] = Math.max(30, Math.min(99, Math.round(t.attrs[k] * rt / avg)));
  const meta = opts.meta ? opts.meta : i % 4 === 0 ? { name: "Melbourne Cup", venue: "Flemington", major: true, crown: true, official: true } : i % 4 === 1 ? { name: "Spring Sprint Championship", venue: "Royal Randwick", official: true } : { name: null, venue: "Furlong Park" };
  const r = new sim.Race({ distance: dist, field: opp.length + 1, diff: "hard", playerDef: { name: opts.pname || "Midnight Legend", style: t.style, role: t.role, coat: 1, silk: "#fff", attrs: a }, oppDefs: opp, allBots: true, going: "good", incidents: opts.incidents || "full", seed: 31337 + i * 7919 });
  const clock = { t: 0 }, log = [], speakLog = [];
  const sp = fakeSpeaker(clock, speakLog);
  const booth = new COMM.Booth(r, meta, sp, { player: r.horses[0], log: e => log.push(e), rng: sim.ROSTER && (() => ((i * 9301 + log.length * 49297) % 233280) / 233280) });
  const dt = sim.SIM_DT; let gateT = null, gateSpeaking = false; const finT = new Map(); let forcedFall = null;
  let steps = 0;
  while (steps++ < 120 * 420) {
    const before = r.state;
    r.step(dt); clock.t += dt;
    if (before !== "running" && r.state === "running" && gateT == null) { gateT = clock.t; gateSpeaking = !!sp.cur; }
    if (opts.fallAt && !forcedFall && r.state === "running") { const L = r.order[0]; if (L && L.progress > r.dist * opts.fallAt) { const h = r.horses.slice().sort((x, y) => y.progress - x.progress)[3]; h.stab = 0; h.fall(r, 1, 0, "balance"); forcedFall = h; } }
    for (const h of r.horses) if (h.finished && !finT.has(h)) finT.set(h, clock.t);
    if (steps % 4 === 0) booth.update(clock.t);
    sp.tick();
    if (r.state === "done" && log.some(e => e.cat === 'win') && !sp.cur) break;
    if (r.state === "done" && clock.t - (finT.size ? Math.min(...finT.values()) : clock.t) > 12) break;
  }
  return { r, log, speakLog, sp, gateT, gateSpeaking, finT, meta, forcedFall, clock };
}

const agg = { cover: [], maxGapMid: [], maxGapLate: [], clauses: [], lines: 0, races: 0, early: [], late: [], final200: [], stale: 0, claims: 0, names: 0 };
for (let i = 0; i < N; i++) {
  const R = runOne(i);
  const { r, log, sp, finT } = R, tag = `race ${i} (${r.dist} m)`;
  agg.races++; agg.lines += log.length;
  // continuity: share of the running race with the caller talking, and the longest silences
  { const t0 = R.gateT + 1.5, t1 = Math.min(...finT.values()); const sp2 = sp.spans.map(([a, b]) => [Math.max(a, t0), Math.min(b, t1)]).filter(x => x[1] > x[0]);
    const talk = sp2.reduce((a, x) => a + x[1] - x[0], 0); agg.cover.push(talk / (t1 - t0));
    const ts = [t0].concat(sp2.flat()).concat([t1]); let gm = 0, gl = 0; const late = t1 - 25;
    for (let i = 0; i + 1 < ts.length; i += 2) { const g = ts[i + 1] - ts[i]; if (ts[i] < late) gm = Math.max(gm, g); else gl = Math.max(gl, g); }
    agg.maxGapMid.push(gm); agg.maxGapLate.push(gl);
    for (const e of log) if (e.rem != null && e.rem > 0) agg.clauses.push(e.text.split(/,/).length); }
  const W = r.finishOrder[0];
  const win = log.find(e => e.cat === 'win');
  ok(!!win, `${tag}: a winner call was made`);
  if (win) ok(win.text.includes(W.def.name), `${tag}: winner call names the official winner ${W.def.name} — said "${win.text}"`);
  ok(sp.overlaps === 0, `${tag}: no overlapping speech (${sp.overlaps})`);
  ok(!R.gateSpeaking, `${tag}: silent as the gates open`);
  // photo: no name before the second horse has crossed
  const fo = r.finishOrder;
  const photo = log.find(e => e.cat === 'photo');
  if (photo && win) { const t2 = finT.get(fo[1]); ok(t2 != null && win.t >= t2, `${tag}: photo winner named only after both had crossed`); }
  // every leadership claim is true when the line starts
  for (const e of log) if (e.claim && !e.final) { agg.claims++; if (e.claim !== e.leaderNow) { agg.stale++; ok(false, `${tag}: "${e.text}" claims ${e.claim.def.name} leads but ${e.leaderNow && e.leaderNow.def.name} does (rem ${e.rem})`); } }
  // no identical sentence within 20 s
  for (let a = 0; a < log.length; a++) for (let b = a + 1; b < log.length; b++) if (log[a].text === log[b].text && log[b].t - log[a].t < 20) ok(false, `${tag}: repeated "${log[a].text}"`);
  // intensity curve
  for (const e of log) { if (e.rem == null) continue; if (e.rem > 800) agg.early.push(e.I); if (e.rem < 400 && e.rem > 0) agg.late.push(e.I); }
  // close vs dominant finishes
  const margin = fo[1] ? (fo[1].finishTime - fo[0].finishTime) * 16 : 99;
  const late = log.filter(e => e.rem != null && e.rem < 230 && e.rem > -1 && !e.final);
  if (margin < 1.0) { const maxI = Math.max(1, ...log.filter(e => e.rem != null && e.rem < 250).map(e => e.I)); agg.final200.push(maxI); ok(maxI >= 4.5, `${tag}: close finish (${margin.toFixed(2)} m) reached max excitement (${maxI})`); }
  const at200 = log.find(e => e.cat === 'm200');
  if (at200 && /clear|dominant|put them away/.test(at200.text)) ok(!late.some(e => /head to head|nothing between|together|stride for stride|desperately close|photo/i.test(e.text)), `${tag}: runaway winner was not called as a close finish`);
  if (log.some(e => /Midnight Legend/.test(e.text))) agg.names++;
  if (PRINT || (i < 2)) { console.log(`\n— ${tag}${R.meta.name ? " · " + R.meta.name : ""} · winner ${W.def.name} by ${margin.toFixed(2)} m`); for (const e of log) console.log(`  ${e.t.toFixed(1).padStart(6)}s  I${e.I.toFixed(1)}  ${e.rem == null ? "  pre" : String(Math.round(e.rem)).padStart(5)}m  ${e.text}`); }
}
// a forced fall is called, by name
{
  const R = runOne(3, { dist: 1600, fallAt: 0.4 });
  const fl = R.log.find(e => e.cat === 'fall');
  ok(!!fl && R.forcedFall && fl.text.includes(R.forcedFall.def.name), `forced fall is called by name (${fl ? fl.text : "no call"})`);
}
// names: pronunciation override, long names shortened after the first mention, full name for the winner
{ const H = (name, say) => ({ def: { name, say }, cloth: 3 });
  ok(COMM.nmFull(H('Midnight Legend', 'Midnight Ledge-end')) === 'Midnight Ledge-end' && COMM.nmShort(H('Midnight Legend')) === 'Midnight Legend', 'pronunciation override is spoken; two-word names are kept whole');
  ok(COMM.nmShort(H('The Magnificent Comet')) === 'Magnificent Comet' && COMM.nmShort(H('Thunder Over Randwick')) === 'Thunder Over', 'long names are shortened the way callers do');
  ok(COMM.nmFull(H('<script>X')) === 'script X' && COMM.nmFull(H('')) === 'number 3', 'odd characters are dropped and an empty name falls back to the saddlecloth');
}
// The Everest: feature-race call, and a long custom name all the way to the line
{ const E = runOne(6, { dist: 1200, meta: { name: 'The Everest', venue: 'Royal Randwick', major: true, crown: true, official: true }, pname: 'Thunder Over Randwick' });
  const intro = E.log.find(e => e.cat === 'intro'), win = E.log.find(e => e.cat === 'win');
  ok(intro && /Everest/.test(intro.text) && /Randwick/.test(intro.text), 'Everest intro names the race and venue: ' + (intro && intro.text));
  ok(win && win.text.includes(E.r.finishOrder[0].def.name), 'Everest winner call names the winner: ' + (win && win.text));
  ok(E.log.some(e => /Thunder Over/.test(e.text)), 'a long custom name is called (shortened in running)');
}
// several lead changes in one race are all followed correctly
{ let most = null; for (let i = 0; i < 10; i++) { const o = runOne(40 + i, { dist: 1600 }); const ch = o.r.leadChanges || 0; if (!most || ch > most.ch) most = { o, ch }; }
  const bad = most.o.log.filter(e => e.claim && !e.final && e.claim !== e.leaderNow);
  ok(most.ch >= 2 && bad.length === 0, `a race with ${most.ch} lead changes: every leadership call correct (${most.o.log.filter(e => e.claim).length} calls)`); }
// voice parameters rise with intensity but stay natural
{ const a = COMM.voiceParams(1), b = COMM.voiceParams(5); ok(b.rate > a.rate && b.rate <= 1.18 && b.pitch > a.pitch && b.pitch <= 1.1, 'voice pace rises with excitement, pitch barely moves (no strained or chipmunk speech)'); }
// voice ranking: Australian first, novelty voices never
{ const v = [{ name: "Samantha", lang: "en-US" }, { name: "Karen", lang: "en-AU" }, { name: "Lee (Enhanced)", lang: "en-AU" }, { name: "Zarvox", lang: "en-US" }, { name: "Thomas", lang: "fr-FR" }].sort((a, b) => COMM.scoreVoice(b) - COMM.scoreVoice(a));
  ok(v[0].name.startsWith("Lee") && v[1].name === "Karen" && COMM.scoreVoice({ name: "Zarvox", lang: "en-US" }) < COMM.scoreVoice({ name: "Samantha", lang: "en-US" }) && COMM.scoreVoice({ name: "Thomas", lang: "fr-FR" }) < 0, 'voice ranking prefers Australian English, avoids novelty and non-English voices'); }

const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
ok(mean(agg.late) > mean(agg.early) + 1.2, `excitement rises: early ${mean(agg.early).toFixed(2)} → final 400 m ${mean(agg.late).toFixed(2)}`);
ok(agg.names >= N * 0.6, `custom horse name called in ${agg.names}/${N} races`);
console.log(`\ncontinuity: caller speaking ${(100 * mean(agg.cover)).toFixed(0)}% of the running race · longest silence mid-race avg ${mean(agg.maxGapMid).toFixed(1)} s (max ${Math.max(...agg.maxGapMid).toFixed(1)}) · in the last 25 s avg ${mean(agg.maxGapLate).toFixed(1)} s · ${mean(agg.clauses).toFixed(1)} clauses per line`);
ok(mean(agg.cover) > 0.7 && mean(agg.maxGapLate) < 1.5, 'the call is continuous: speaking most of the race, no long gaps in the closing stages');
console.log(`${agg.races} races · ${(agg.lines / agg.races).toFixed(1)} lines per race · leadership claims ${agg.claims}, stale ${agg.stale} · mean excitement early ${mean(agg.early).toFixed(2)}, last 400 m ${mean(agg.late).toFixed(2)} · close finishes max ${agg.final200.length ? Math.min(...agg.final200).toFixed(1) + "–" + Math.max(...agg.final200).toFixed(1) : "n/a"} · custom name called in ${agg.names}/${N}`);
for (const f of fails.slice(0, 25)) console.log(' ✗ ' + f);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
