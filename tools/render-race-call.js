// Render a simulated race's commentary to an MP3 from the recorded clips, timed as the game plays them (for listening
// without running the game). Uses the scenario harness's races.  node tools/render-race-call.js <race index> <out.mp3>
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const src = fs.readFileSync(path.join(__dirname, '..', 'tests', 'commentary-scenarios.js'), 'utf8');
const body = src.split('const found = {}')[0].replace("const N = +(process.argv[2] || 160)", "const N = 1");
const COMMp = require.resolve('../public/commentary.js'); const COMM = require(COMMp);
// capture the parts of every spoken line
const lines = []; const B = COMM.Booth.prototype, orig = B.schedule;
const { runOne } = new Function('require', '__dirname', 'process', body + '\nreturn { runOne };')(require, path.join(__dirname, '..', 'tests'), process);
const sp0 = COMM.Booth; COMM.Booth = class extends sp0 { constructor(r, m, sp, o) { const wrap = { speak: (t, prm, end, info) => { lines.push({ t: this.now, text: t, parts: info.parts, I: info.I }); sp.speak(t, prm, end, info); }, cancel: () => sp.cancel() }; super(r, m, wrap, o); } };
const i = +process.argv[2], out = process.argv[3];
const R = runOne(i);
const DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'commentary'), M = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json')));
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), names = new Map(M.clips.filter(c => c.name).map(c => [norm(c.name) + '|' + c.ctx, c.file])), byId = new Map(M.clips.map(c => [c.id, c]));
// lay each line's clips out from its start time (a later line starts no earlier than the previous one ends)
const inputs = [], delays = []; let tEnd = 0; const t0 = lines[0].t;
for (const L of lines) {
  let t = Math.max(L.t - t0, tEnd), prev = null;
  for (const p of L.parts) {
    if (p.pause != null) { t += p.pause * (L.I >= 4 ? 0.45 : L.I >= 3 ? 0.7 : 1); prev = null; continue; }
    const file = p.id ? byId.get(p.id) && byId.get(p.id).file : names.get(norm(p.name) + '|' + p.ctx) || names.get(norm(p.name) + '|c');
    if (!file) continue; const c = M.clips.find(x => x.file === file);
    if (prev) t += prev.name && p.name != null ? 0.03 : 0.02;
    inputs.push(path.join(DIR, file)); delays.push(t); t += c.duration; prev = p;
  }
  tEnd = t;
}
const args = []; inputs.forEach(f => args.push('-i', f));
const filt = inputs.map((f, k) => `[${k}:a]adelay=${Math.round(delays[k] * 1000)}:all=1[a${k}]`).join(';') + ';' + inputs.map((f, k) => `[a${k}]`).join('') + `amix=inputs=${inputs.length}:normalize=0[o]`;
execFileSync('ffmpeg', ['-hide_banner', '-y', ...args, '-filter_complex', filt, '-map', '[o]', '-ac', '1', '-ar', '24000', '-b:a', '64k', out], { stdio: 'ignore' });
fs.writeFileSync(out.replace(/\.mp3$/, '.txt'), `${R.meta.name || 'Race'} at ${R.meta.venue}, ${R.dist} m — winner ${R.W.def.name} by ${(R.margin / 2.4).toFixed(2)} lengths\n\n` + lines.map(L => `${(L.t - t0).toFixed(1).padStart(6)} s  ${L.text}`).join('\n') + '\n');
console.log('wrote', out, inputs.length, 'clips,', tEnd.toFixed(1), 's');
