// Phase 21 (pure): the 14 regional towns are named by the caller. For every town a real simulated race is run with that venue; the director's intro must name the town, a town
// crowd line may be used in the straight, and every town phrase must have a recording. Also: a non-town venue still gets the neutral intro and never another town's.
//   node tests/phase21-core.js
const path = require('path'), fs = require('fs');
const sim = require('../public/sim.js'), COMM = require('../public/commentary.js'), CALLS = require('../public/calls.js');
const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/assets/audio/commentary/manifest.json'), 'utf8')), have = new Set(man.clips.map(c => c.id));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const slug = t => t.toLowerCase().replace(/[^a-z]+/g, '_');
ok(CALLS.TOWNS.length === 14, '14 regional towns');
// the towns are the regional circuit's venues
{ const S = require('../public/season.js'); const src = fs.readFileSync(path.join(__dirname, '..', 'public/season.js'), 'utf8'); const reg = new Set([...src.matchAll(/venue: "([A-Za-z ]+)"[^\n]*?regional: true/g)].map(m => m[1])); ok([...reg].every(v => CALLS.TOWNS.includes(v)) && reg.size === 14, `every regional-circuit venue is a named town (${reg.size})`); }
for (const t of CALLS.TOWNS) {
  const us = CALLS.units.filter(u => u.venue === slug(t)); ok(us.filter(u => u.topic === 'intro').length === 2 && us.filter(u => u.topic === 'crowd').length === 1, t + ': 2 intros and 1 crowd line');
  ok(us.every(u => have.has(u.topic + '/' + u.id.split('/').pop()) || have.has(u.id)), t + ': every town phrase has a recording');
}
function run(venue, seed) {
  const t = sim.ROSTER[seed % 12], opp = sim.ROSTER.filter((_, i) => i !== seed % 12).slice(0, 7).map(r => ({ name: r.name, style: r.style, role: r.role, coat: 1, silk: '#fff', attrs: Object.assign({}, r.attrs) }));
  const r = new sim.Race({ distance: 1400, field: 8, diff: 'medium', playerDef: { name: 'Test Horse', style: t.style, role: t.role, coat: 1, silk: '#fff', attrs: Object.assign({}, t.attrs) }, oppDefs: opp, allBots: true, going: 'good', incidents: 'off', seed });
  const lines = [], clock = { t: 0 }, sp = { speak: u => { lines.push(u.text || (u.parts || []).map(p => p.text).join(' ')); return 0; }, say: () => 0, busy: () => false, stop() {}, isSpeaking: () => false };
  let booth; try { booth = new COMM.Booth(r, { name: null, venue, major: false, crown: false, official: false }, sp, { player: r.horses[0], log: e => { if (e && (e.text || e.line)) lines.push(e.text || e.line); }, rng: (() => { let s = seed * 7919 + 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })() }); } catch (e) { return { err: e.message }; }
  let st = 0; while (st++ < 40 * 420) { r.step(sim.SIM_DT); clock.t += sim.SIM_DT; if (booth.tick) booth.tick(sim.SIM_DT); else if (booth.step) booth.step(sim.SIM_DT); if (r.state === 'done') break; }
  const picks = []; for (let k = 0; k < 12; k++) { const u = booth.pickUnit('intro', { venue: booth.venue }); picks.push(u && u.text); } const crowd = booth.pickUnit('crowd', { venue: booth.venue });
  return { venue: booth.venue, isTown: booth.isTown, lines, picks, crowd: crowd && crowd.text };
}
for (const t of CALLS.TOWNS) { const o = run(t, 3 + CALLS.TOWNS.indexOf(t)); ok(!o.err, t + ': the booth builds (' + (o.err || '') + ')'); if (o.err) continue; ok(o.venue === slug(t) && o.isTown, t + ': the venue key is the town'); ok(o.picks.every(x => x && x.includes(t)), t + ': the intro names the town (' + o.picks[0] + ')'); ok(o.crowd === t + ' is on its feet!', t + ': the crowd line names the town'); }
{ const o = run('Furlong Park', 5); ok(o.venue === 'generic' && !o.isTown, 'Furlong Park stays generic'); const o2 = run('Gosford', 6); ok(o2.venue === 'neutral' && !o2.isTown, 'a non-circuit venue (Gosford) keeps the neutral intros'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
