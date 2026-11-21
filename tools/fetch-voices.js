// Optional: download the enhanced-commentary voice files into public/voices/ so a self-hosted server (npm start)
// serves them itself (no CDN or Hugging Face needed by the browser). Everything comes from the public npm registry:
//   onnxruntime-web (MIT), phonemizer (eSpeak NG WASM), kokoro-js voices (Apache-2.0), Kokoro-82M int8 model (Apache-2.0,
//   via the kokoro-q8-shards mirror, verified against its SHA-256).
//   node tools/fetch-voices.js            (≈ 105 MB on disk; public/voices/ is git-ignored)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), https = require('https'), crypto = require('crypto');
const OUT = path.join(__dirname, '..', 'public', 'voices');
const SHA = 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478';
const VOICES = ['am_michael', 'am_fenrir', 'am_puck', 'bm_george', 'bm_fable', 'af_heart', 'af_bella', 'bf_emma'];
const get = url => new Promise((res, rej) => https.get(url, r => { if (r.statusCode >= 300 && r.statusCode < 400) return res(get(r.headers.location)); if (r.statusCode !== 200) return rej(new Error(url + ' ' + r.statusCode)); const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c))); }).on('error', rej));
function untar(buf) { const files = {}; let o = 0; while (o + 512 <= buf.length) { const name = buf.slice(o, o + 100).toString().replace(/\0.*$/, ''); if (!name) break; const size = parseInt(buf.slice(o + 124, o + 136).toString().replace(/\0.*$/, '').trim() || '0', 8); files[name] = buf.slice(o + 512, o + 512 + size); o += 512 + Math.ceil(size / 512) * 512; } return files; }
const pkg = async (name, ver) => untar(zlib.gunzipSync(await get(`https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${ver}.tgz`)));
(async () => {
  fs.mkdirSync(path.join(OUT, 'runtime'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'kokoro'), { recursive: true });
  const ort = await pkg('onnxruntime-web', '1.20.1');
  for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) fs.writeFileSync(path.join(OUT, 'runtime', f), ort['package/dist/' + f]);
  const ph = await pkg('phonemizer', '1.2.1'); fs.writeFileSync(path.join(OUT, 'runtime', 'phonemizer.js'), ph['package/dist/phonemizer.js']);
  const kj = await pkg('kokoro-js', '1.2.1'); for (const v of VOICES) fs.writeFileSync(path.join(OUT, 'kokoro', v + '.bin'), kj[`package/voices/${v}.bin`]);
  const sh = await pkg('kokoro-q8-shards', '1.0.0'); const model = Buffer.concat([0, 1, 2, 3, 4, 5].map(i => sh[`package/kokoro-q8.part${i}.bin`]));
  const h = crypto.createHash('sha256').update(model).digest('hex'); if (h !== SHA) throw new Error('Kokoro model checksum mismatch: ' + h);
  fs.writeFileSync(path.join(OUT, 'kokoro', 'model_quantized.onnx'), model);
  console.log('voices ready in', OUT, '(model sha256 verified)');
})().catch(e => { console.error(e); process.exit(1); });
