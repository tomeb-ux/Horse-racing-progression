// Generates comparison samples with the enhanced (Kokoro) commentary voice, using the SAME engine code the game runs in
// its Web Worker (public/voice-core.js), and measures synthesis latency.
//   node tools/voice-samples.mjs <outDir> <model.onnx> <kokoro-js voices dir> <ort dist dir> <phonemizer.js> [voices...]
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const [out, modelPath, voicesDir, ortDir, phonPath, ...vs] = process.argv.slice(2);
const ort = await import(path.resolve(ortDir, 'ort.wasm.min.mjs'));
ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = path.resolve(ortDir) + '/';
const { phonemize } = await import(path.resolve(phonPath));
const { kokoroCore } = require(path.resolve('public/voice-core.js'));
const K = kokoroCore(ort, phonemize);
let t0 = performance.now(); await K.load(fs.readFileSync(modelPath)); const loadMs = performance.now() - t0;
const SCRIPTS = {
  s1_calm: { text: "They're away and racing in the Spring Sprint. Desert Comet is quickest to find the front, with Midnight Legend settling in third along the rail.", speed: 1.0 },
  s2_turn: { text: "Coming to the home turn, Desert Comet still leads them, Midnight Legend has worked into third, and Quiet Thunder is beginning to make ground out wider!", speed: 1.1 },
  s3_finish: { text: "Two hundred to go! Desert Comet and Midnight Legend, locked together! Quiet Thunder flying down the outside! It's going to be close!", speed: 1.22 },
  s4_name: { text: "And here's Bay Majesty, the local hope, making a long run down the middle of the track!", speed: 1.12 },
};
fs.mkdirSync(out, { recursive: true });
const wav = (f32, sr) => { const n = f32.length, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2); return b; };
const rows = []; console.log(`model loaded in ${loadMs.toFixed(0)} ms`);
for (const v of (vs.length ? vs : ['am_michael'])) {
  const voice = new Float32Array(fs.readFileSync(path.join(voicesDir, v + '.bin')).buffer.slice(0));
  const british = v.startsWith('b');
  for (const [k, s] of Object.entries(SCRIPTS)) {
    t0 = performance.now(); const r = await K.synth(s.text, voice, s.speed, british); const ms = performance.now() - t0;
    const dur = r.audio.length / 24000; fs.writeFileSync(path.join(out, `${v}_${k}.wav`), wav(r.audio, 24000));
    // clause-sized chunk (what the game synthesises first, so playback can start early)
    const first = s.text.split(/(?<=[,!?.])\s+/)[0]; t0 = performance.now(); const r1 = await K.synth(first, voice, s.speed, british); const ms1 = performance.now() - t0;
    rows.push({ voice: v, sample: k, audio_s: +dur.toFixed(2), synth_ms: Math.round(ms), rtf: +(ms / 1000 / dur).toFixed(2), first_clause_ms: Math.round(ms1), first_clause_audio_s: +(r1.audio.length / 24000).toFixed(2) });
  }
}
console.table(rows); fs.writeFileSync(path.join(out, 'latency.json'), JSON.stringify({ loadMs, rows }, null, 1));
