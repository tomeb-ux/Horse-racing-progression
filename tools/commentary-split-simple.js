#!/usr/bin/env node
// Split one ElevenLabs batch master (lines separated by blank lines) into clips WITHOUT scipy: the N-1 longest silences are the cuts.
// Used for small additions (Phase 21 town names). Same encoding and loudness rules as tools/commentary-library.py (mono MP3, 24 kHz, 48 kbps, RMS by tier).
//   node tools/commentary-split-simple.js <master.mp3> <batch name> <tier> <ids+texts.json (array of [id,text])> <out dir (public/assets/audio/commentary)>
// Appends the clips to <out dir>/manifest.json (replacing any with the same id). Refuses a master whose cuts are ambiguous.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const [, , master, batch, tierS, listF, outDir] = process.argv, tier = +tierS, list = JSON.parse(fs.readFileSync(listF, 'utf8'));
const TIER_DB = { 1: -21.0, 2: -20.0, 3: -19.0, 4: -17.5, 5: -16.5 }, TIER_TEMPO = { 1: 1, 2: 1, 3: 1.03, 4: 1.06, 5: 1.12 }, VOICE_ID = 'MTGAJpjryOZn2Xr8FOtm';
const run = (c, a) => spawnSync(c, a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const dur = f => +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.trim();
const T = dur(master), n = list.length;
let best = null;
for (const [noise, d] of [[-35, 0.25], [-32, 0.2], [-38, 0.3], [-30, 0.18], [-40, 0.35]]) {
  const e = run('ffmpeg', ['-hide_banner', '-i', master, '-af', `silencedetect=noise=${noise}dB:d=${d}`, '-f', 'null', '-']).stderr;
  const st = [...e.matchAll(/silence_start: ([0-9.]+)/g)].map(m => +m[1]), en = [...e.matchAll(/silence_end: ([0-9.]+)/g)].map(m => +m[1]);
  const S = st.map((a, i) => [a, en[i] != null ? en[i] : T]).filter(([a, b]) => a > 0.2 && b < T - 0.1);
  if (S.length >= n - 1) { const top = S.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0])).slice(0, n - 1).sort((p, q) => p[0] - q[0]); const gaps = top.map(([a, b]) => b - a); const rest = S.filter(s => !top.includes(s)).map(([a, b]) => b - a); const margin = Math.min(...gaps) - (rest.length ? Math.max(...rest) : 0); if (!best || margin > best.margin) best = { top, margin, noise, d }; if (S.length === n - 1) break; }
}
if (!best) { console.error('REFUSED: found fewer than ' + (n - 1) + ' pauses'); process.exit(2); }
console.error(`cuts at noise ${best.noise} dB / ${best.d}s, margin to the next-longest pause ${best.margin.toFixed(2)}s`);
const bounds = [0, ...best.top.map(([a, b]) => (a + b) / 2), T];
const mf = path.join(outDir, 'manifest.json'), man = JSON.parse(fs.readFileSync(mf, 'utf8')); const ver = man.clips[0] && man.clips[0].version || 2;
const syl = t => Math.max(1, (t.toLowerCase().match(/[aeiouy]+/g) || []).length);
const rates = [];
list.forEach(([id, text], i) => {
  const a = bounds[i], b = bounds[i + 1], tmp = path.join(require('os').tmpdir(), 'cs_' + process.pid + '_' + i + '.wav');
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(a), '-to', String(b), '-i', master, '-ac', '1', '-ar', '24000', tmp]);
  // trim leading/trailing silence, then level to the tier's RMS target with a peak limit
  const trimmed = tmp + '.t.wav'; run('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse', trimmed]);
  const vd = run('ffmpeg', ['-hide_banner', '-i', trimmed, '-af', 'volumedetect', '-f', 'null', '-']).stderr, mean = +(vd.match(/mean_volume: (-?[0-9.]+) dB/) || [0, -25])[1];
  const gain = TIER_DB[tier] - mean, tempo = TIER_TEMPO[tier];
  const file = id + '.mp3', out = path.join(outDir, file); fs.mkdirSync(path.dirname(out), { recursive: true });
  const filt = [`volume=${gain.toFixed(2)}dB`, tempo !== 1 ? `atempo=${tempo}` : null, 'alimiter=limit=0.89:level=false', 'afade=t=in:d=0.01'].filter(Boolean).join(',');
  run('ffmpeg', ['-y', '-v', 'error', '-i', trimmed, '-af', filt, '-ac', '1', '-ar', '24000', '-b:a', '48k', out]);
  const d = dur(out), rate = syl(text) / d; rates.push([id, +rate.toFixed(2)]);
  const entry = { id, file, duration: +d.toFixed(3), text, tier, batch, voice_id: VOICE_ID, version: ver };
  const k = man.clips.findIndex(c => c.id === id); if (k >= 0) man.clips[k] = entry; else man.clips.push(entry);
  for (const f of [tmp, trimmed]) try { fs.unlinkSync(f); } catch (e) {}
});
fs.writeFileSync(mf, JSON.stringify(man));
const bad = rates.filter(([, r]) => r < 2.2 || r > 7.5);
console.error(`wrote ${n} clips; speaking rates (syl/s) ${Math.min(...rates.map(r => r[1]))}–${Math.max(...rates.map(r => r[1]))}${bad.length ? '  FLAGGED: ' + bad.map(b => b.join('=')).join(', ') : ''}`);
