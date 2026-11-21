// Enhanced commentary voice, end to end in a real browser (headless Chromium): download from the server's /voices/
// folder (tools/fetch-voices.js) into Cache Storage with checksum, Web Worker start-up, Kokoro synthesis through
// ONNX Runtime Web, playback scheduling, dropping lines that can't start in time, live use during a race, fallback.
//   node tools/fetch-voices.js ; PORT=8095 node server/index.js ; PORT=8095 node tests/voice-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 640 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  let external = 0; await ctx.route(/huggingface\.co|jsdelivr\.net/, r => { external++; r.abort(); });
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_eleven', JSON.stringify({ mode: 'local' })); /* this suite tests the LOCAL neural voice */ localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_voice', JSON.stringify({ engine: 'kokoro', kokoroVoice: 'am_michael' }));
    window.__sys = 0; const S = window.speechSynthesis; if (S) { const o = S.speak.bind(S); S.speak = u => { if (u.text && u.text.trim()) window.__sys++; try { o(u); } catch (e) {} }; } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE); await p.waitForFunction(() => typeof VOICE !== 'undefined' && typeof COMM !== 'undefined');
  await p.evaluate(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; });
  console.log('— download & verify');
  ok(await p.evaluate(() => VOICE.supported()), 'the browser supports the local neural voice (Worker, Web Audio, Cache Storage, SubtleCrypto)');
  const st0 = await p.evaluate(async () => (await VOICE.status('kokoro')).ready);
  const t0 = Date.now(); const prog = await p.evaluate(async () => { const seen = []; await VOICE.download('kokoro', f => seen.push(f)); return { n: seen.length, last: seen[seen.length - 1] }; });
  const st1 = await p.evaluate(async () => VOICE.status('kokoro'));
  ok(!st0 && st1.ready && prog.last >= 0.99, `downloaded ${Math.round(st1.total / 1e6)} MB into Cache Storage in ${((Date.now() - t0) / 1000).toFixed(1)} s with progress reports (${prog.n}); the model passed its SHA-256 check`);
  ok(external === 0, 'nothing was requested from Hugging Face or a CDN (served by this server, then local)');
  console.log('\n— worker + synthesis');
  const w = await p.evaluate(async () => { const t = performance.now(); const okk = await VOICE.warm(); return { ok: okk, ms: performance.now() - t, threads: VOICE.stats.threads, init: VOICE.stats.initMs }; });
  ok(w.ok, `Kokoro loaded in the Web Worker in ${(w.init / 1000).toFixed(1)} s (${w.threads} thread${w.threads > 1 ? 's (cross-origin isolated)' : ''})`);
  const s = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 200)); const r = await COMM.sample("Two hundred to go! Desert Comet leads!", 4.6); return Object.assign({}, r, { sources: VOICE._speaker.sources.length, ctx: VOICE._speaker && typeof audio }); });
  ok(s.firstMs > 0 && s.rtf > 0, `sample spoken by ${s.engine}: first audio after ${Math.round(s.firstMs)} ms, generating at ${(1 / s.rtf).toFixed(2)}× real time on this (slow, shared) CPU`);
  ok(await p.evaluate(() => VOICE._clauses("Coming to the home turn, Desert Comet still leads them, Midnight Legend has worked into third, and Quiet Thunder is beginning to make ground out wider!").length === 4), 'lines are split into clauses so the first can start while the rest are generated');
  console.log('\n— a line that cannot start in time is dropped, never played late');
  const drop = await p.evaluate(async () => { const sp = VOICE._speaker, orig = sp.clip.bind(sp); let dropped = 0; sp.onDrop = () => dropped++;
    sp.clip = async (t, v, pr) => { await new Promise(r => setTimeout(r, 2600)); return orig(t, v, pr); };
    const t = performance.now(); await new Promise(r => sp.speak("And they're off and racing, Desert Comet jumps best.", { level: 2 }, r)); const el = performance.now() - t; sp.clip = orig; return { dropped, el, playing: sp.sources.length }; });
  ok(drop.dropped === 1 && drop.el < 2200, `a deliberately slow line was dropped after ${(drop.el / 1000).toFixed(1)} s and the caller released (no stale audio)`);
  console.log('\n— live race (Kokoro)');
  const iso = await p.evaluate(() => self.crossOriginIsolated);
  const kr = await p.evaluate(() => ({ rtf: VOICE.stats.rtf, threads: VOICE.stats.threads, live: !!VOICE.speaker(), issue: VOICE.liveIssue() }));
  ok(iso && kr.threads > 1, `the server's cross-origin isolation lets the voice use ${kr.threads} threads (Kokoro now ${(1 / kr.rtf).toFixed(2)}× real time here)`);
  ok(kr.live === (kr.rtf <= 0.85), kr.live ? 'Kokoro is fast enough here to call races live' : `Kokoro is correctly NOT used for live calling on this slow CPU (${kr.issue}) — races fall back rather than dropping every line`);
  console.log('\n— live race (Piper: a test stand-in voice served from /voices/piper)');
  await p.evaluate(async () => { VOICE.set('engine', 'piper'); VOICE.set('piperVoice', 'en_GB-alan-medium'); await VOICE.download('piper'); await VOICE.warm(); });
  const pr = await p.evaluate(() => ({ rtf: VOICE.stats.rtf, live: !!VOICE.speaker() }));
  ok(pr.live && pr.rtf < 0.85, `Piper generates at ${(1 / pr.rtf).toFixed(1)}× real time here — fast enough for live calling`);
  await p.evaluate(() => { window.__commLog = []; VOICE.stats.spoken = 0; VOICE.stats.dropped = 0; COMM.prime(); const cfg = Object.assign(quickCfg(), { distance: 1000, field: 10, track: 'generic', allBots: true }); startRace(cfg); });
  await sleep(70000);
  const live = await p.evaluate(() => ({ lines: (window.__commLog || []).length, sys: window.__sys, spoken: VOICE.stats.spoken, dropped: VOICE.stats.dropped, first: VOICE.stats.firstMs }));
  ok(live.lines >= 6 && live.sys === 0 && live.spoken >= live.lines * 0.7, `live race: the caller composed ${live.lines} lines, the neural voice spoke ${live.spoken} (dropped ${live.dropped}); first clause ready in ~${Math.round(live.first)} ms; the system voice was never used`);
  await p.evaluate(() => { VOICE.set('engine', 'kokoro'); });
  console.log('\n— fallback');
  const fb = await p.evaluate(async () => { await VOICE.remove('kokoro'); VOICE.set('engine', 'kokoro'); await VOICE.warm(); return { sp: !!VOICE.speaker(), st: (await VOICE.status('kokoro')).ready }; });
  ok(!fb.sp && !fb.st, 'with the model removed, the enhanced speaker is unavailable and the standard voice takes over');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
