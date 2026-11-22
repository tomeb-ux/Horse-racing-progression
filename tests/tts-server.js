// The ElevenLabs commentary endpoint (server/tts.js) against a MOCK ElevenLabs API (no real key, no credits):
// not-configured behaviour, the key staying server-side, caching (no second upstream call for the same phrase),
// invalid key / no credits / rate limiting / timeout / model fallback / daily budget / input limits.
//   node tests/tts-server.js
const http = require('http'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const MOCK = 18611; let hits = [];
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const key = req.headers['xi-api-key'], body = JSON.parse(b || '{}'); hits.push({ url: req.url, key, body });
    const send = (c, t, ct) => { res.writeHead(c, { 'content-type': ct || 'application/json' }); res.end(t); };
    if (!/^\/v1\/text-to-speech\/MTGAJpjryOZn2Xr8FOtm\?output_format=mp3_44100_64$/.test(req.url)) return send(404, '{"detail":"wrong url"}');
    if (key === 'bad') return send(401, '{"detail":{"status":"invalid_api_key"}}');
    if (key === 'broke') return send(401, '{"detail":{"status":"quota_exceeded","message":"This request exceeds your quota"}}');
    if (key === 'busy') return send(429, '{"detail":{"status":"too_many_concurrent_requests"}}');
    if (key === 'slow') return setTimeout(() => send(200, Buffer.alloc(400, 1), 'audio/mpeg'), 9500);
    if (key === 'nomodel' && body.model_id === 'eleven_v4') return send(422, '{"detail":{"status":"model_not_found","message":"model eleven_v4 not available"}}');
    send(200, Buffer.concat([Buffer.from('ID3'), Buffer.alloc(600, 7)]), 'audio/mpeg');
  });
}).listen(MOCK);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function withServer(env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-tts-')), port = 18700 + Math.floor(Math.random() * 200);
  const p = spawn(process.execPath, [path.join(__dirname, '../server/index.js')], { env: Object.assign({}, process.env, { PORT: port, ELEVENLABS_API_BASE: 'http://127.0.0.1:' + MOCK, ELEVENLABS_CACHE_DIR: dir }, env), stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await req(port, 'GET', '/healthz'); break; } catch (e) { await sleep(100); } }
  try { await fn(port, dir); } finally { p.kill(); }
}
function req(port, method, p, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'content-type': 'application/json' } }, res => { const c = []; res.on('data', x => c.push(x)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) })); });
    r.on('error', reject); r.end(body ? JSON.stringify(body) : undefined);
  });
}
const J = r => { try { return JSON.parse(r.body.toString()); } catch (e) { return {}; } };
(async () => {
  console.log('— no key configured');
  await withServer({ ELEVENLABS_API_KEY: '' }, async port => {
    const s = J(await req(port, 'GET', '/api/tts/status'));
    ok(s.configured === false && s.voiceId === 'MTGAJpjryOZn2Xr8FOtm', 'status: not configured, voice ID MTGAJpjryOZn2Xr8FOtm');
    const r = await req(port, 'POST', '/api/tts', { text: 'Desert Comet!', kind: 'name' });
    ok(r.status === 503 && J(r).error === 'not-configured' && hits.length === 0, 'a request without a key is refused locally (503 not-configured), nothing sent upstream');
  });
  console.log('\n— a valid key (mock)');
  hits = [];
  await withServer({ ELEVENLABS_API_KEY: 'sk_test_secret_123' }, async (port, dir) => {
    const s = J(await req(port, 'GET', '/api/tts/status'));
    ok(s.configured === true && !JSON.stringify(s).includes('sk_test'), 'status: configured — and the key never appears in a response');
    const t0 = Date.now(), r1 = await req(port, 'POST', '/api/tts', { text: 'Desert Comet!', kind: 'name' }), ms = Date.now() - t0;
    ok(r1.status === 200 && r1.headers['content-type'] === 'audio/mpeg' && r1.headers['x-tts-cache'] === 'miss' && r1.body.length > 200, `first request: audio/mpeg from ElevenLabs (${ms} ms through the server)`);
    ok(hits.length === 1 && hits[0].key === 'sk_test_secret_123' && hits[0].body.model_id === 'eleven_v4' && hits[0].body.text === '[urgent, fast and loud] Desert Comet!', 'upstream call: key in the xi-api-key header (server-side), voice MTGAJpjryOZn2Xr8FOtm, eleven_v4, an urgent name read (the library delivery)');
    const r2 = await req(port, 'POST', '/api/tts', { text: 'Desert Comet!', kind: 'name' });
    ok(r2.status === 200 && r2.headers['x-tts-cache'] === 'hit' && hits.length === 1, 'the same phrase again: served from the disk cache, no second upstream call (no credits spent)');
    ok(fs.readdirSync(dir).length === 1, 'cached on disk once');
    const r3 = await req(port, 'POST', '/api/tts', { text: '<script>alert(1)</script> Quiet Thunder' + 'x'.repeat(300), kind: 'name' });
    ok(r3.status === 200 && hits[1].body.text.length <= 146 && !/[<>]/.test(hits[1].body.text), 'input is cleaned (no markup) and capped at 120 characters');
    let lim = null; for (let i = 0; i < 25; i++) { const r = await req(port, 'POST', '/api/tts', { text: 'Name ' + i, kind: 'name' }); if (r.status === 429) { lim = i; break; } }
    ok(lim != null && lim <= 20 && J(await req(port, 'POST', '/api/tts', { text: 'Another', kind: 'name' })).error === 'rate-limited', `per-IP rate limit: request ${lim + 2} within a minute is refused (rate-limited)`);
    ok((await req(port, 'POST', '/api/tts', { text: 'Desert Comet!', kind: 'name' })).status === 200, '…but cached phrases are still served while rate-limited');
  });
  console.log('\n— daily budget');
  hits = [];
  await withServer({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_DAILY_CHARS: '80' }, async port => {
    const a = await req(port, 'POST', '/api/tts', { text: 'Desert Comet!', kind: 'name' }), b = await req(port, 'POST', '/api/tts', { text: 'Brumby Dancer!', kind: 'name' }), c = await req(port, 'POST', '/api/tts', { text: 'Copper Coast!', kind: 'name' });
    ok(a.status === 200 && b.status === 200 && c.status === 429 && J(c).error === 'daily-limit' && hits.length === 2, 'ELEVENLABS_DAILY_CHARS stops spending for the day (counted as ElevenLabs bills: delivery tags included — third name refused, 2 upstream calls)');
  });
  console.log('\n— ElevenLabs errors (the game falls back; nothing hangs)');
  for (const [key, code, http] of [['bad', 'invalid-key', 502], ['broke', 'no-credits', 502], ['busy', 'rate-limited', 502]]) {
    await withServer({ ELEVENLABS_API_KEY: key }, async port => { const r = await req(port, 'POST', '/api/tts', { text: 'Tempted!', kind: 'name' }); ok(r.status === http && J(r).error === code, `${key} key → ${r.status} ${J(r).error}`); });
  }
  await withServer({ ELEVENLABS_API_KEY: 'slow' }, async port => { const t0 = Date.now(), r = await req(port, 'POST', '/api/tts', { text: 'Tempted!', kind: 'name' }); ok(r.status === 504 && J(r).error === 'timeout' && Date.now() - t0 < 9500, `a slow upstream is cut off at 8 s → 504 timeout (${Date.now() - t0} ms)`); });
  hits = [];
  await withServer({ ELEVENLABS_API_KEY: 'nomodel' }, async port => {
    const r = await req(port, 'POST', '/api/tts', { text: 'Tempted!', kind: 'name' }), s = J(await req(port, 'GET', '/api/tts/status'));
    ok(r.status === 200 && hits.length === 2 && hits[1].body.model_id === 'eleven_multilingual_v2' && hits[1].body.text === 'Tempted!' && s.model === 'eleven_multilingual_v2', 'model refused → one retry on eleven_multilingual_v2 (tags removed), remembered for later requests');
  });
  mock.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
