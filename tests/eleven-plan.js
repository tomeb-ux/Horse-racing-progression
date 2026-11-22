// The recorded commentary library (no browser): every phrase the director can say has a recording in the new voice,
// every horse name the game can field is recorded in three deliveries, the files exist, and the deliveries really
// differ (pitch and level rise from the calm mid-race calls to the screamed finish).
//   node tests/eleven-plan.js
const path = require('path'), fs = require('fs');
const CALLS = require('../public/calls.js'), S = require('../public/season.js'), sim = require('../public/sim.js');
const DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'commentary');
const M = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const QC = JSON.parse(fs.readFileSync(path.join(DIR, 'qc.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const byId = new Map(M.clips.map(c => [c.id, c]));
ok(M.voice.id === 'MTGAJpjryOZn2Xr8FOtm' && M.voice.provider === 'ElevenLabs' && M.voice.model === 'eleven_v4' && M.clips.every(c => c.voice_id === 'MTGAJpjryOZn2Xr8FOtm'), 'manifest: every clip is the new commentator voice MTGAJpjryOZn2Xr8FOtm (eleven_v4) — no clip from the previous voice');
const missing = CALLS.units.filter(u => !byId.has(u.id));
ok(missing.length === 0, `every phrase in the bank (${CALLS.units.length}) has a recording${missing.length ? ' — missing: ' + missing.slice(0, 5).map(u => u.id).join(', ') : ''}`);
ok(M.clips.filter(c => !c.name).every(c => { const u = CALLS.byId.get(c.id); return u && u.text === c.text; }), 'each phrase recording is the exact words of the caption');
const names = [...new Set(sim.ROSTER.map(r => r.name).concat(S.HORSE_NAMES, S.PLAYER_NAMES))];
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const have = new Set(M.clips.filter(c => c.name).map(c => norm(c.name) + '|' + c.ctx));
const lack = names.filter(n => !['c', 'x', 's'].every(k => have.has(norm(n) + '|' + k)));
ok(lack.length === 0, `every horse name the game can field (${names.length}: Quick Race, career rivals, the 19 choosable career names) is recorded in all three deliveries${lack.length ? ' — missing ' + lack.join(', ') : ''}`);
ok(M.clips.every(c => fs.existsSync(path.join(DIR, c.file)) && fs.statSync(path.join(DIR, c.file)).size > 1500), `all ${M.clips.length} files present`);
const tot = M.clips.reduce((a, c) => a + c.duration, 0), size = M.clips.reduce((a, c) => a + fs.statSync(path.join(DIR, c.file)).size, 0);
ok(size < 7e6, `library size ${(size / 1e6).toFixed(1)} MB, ${Math.round(tot)} s of audio (fits the single-file build)`);
const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
const f0 = t => med(QC.filter(q => q.tier === t && !/^names-/.test(q.id) && q.f0).map(q => q.f0));
ok(f0(1) < f0(2) && f0(2) < f0(4) && f0(4) < f0(5) && f0(5) - f0(1) > 60, `delivery rises: median pitch calm ${f0(1)} Hz → lively ${f0(2)} → urgent ${f0(4)} → screaming ${f0(5)} Hz`);
const dur = t => med(M.clips.filter(c => c.tier === t && !c.name).map(c => c.duration / Math.max(1, c.text.length)));
ok(dur(5) < dur(1), `the finish is called faster: ${(1000 * dur(1)).toFixed(0)} ms per character mid-race → ${(1000 * dur(5)).toFixed(0)} ms screaming`);
ok(QC.every(q => !q.flag), 'no clip flagged by the splitter (speaking rate plausible for its words)');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
