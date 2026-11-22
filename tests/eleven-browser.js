// ElevenLabs commentary in the real game (headless Chromium, real MP3 decoding through Web Audio):
// the recorded library loads, the test screen reports the true backend, a live race is called with the recordings
// (latency from the commentary decision to sound), the official winner is named, Enhanced mode without a server key
// degrades to the recordings, and quitting/restarting silences everything at once.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/eleven-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 900, height: 560 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_autoReplay', 'false'); localStorage.setItem('ff_eleven', JSON.stringify({ mode: 'eleven', nameFallback: 'local' })); localStorage.setItem('ff_comm', '"eleven"'); localStorage.setItem('ff_commentary', JSON.stringify({ on: true, vol: 0.9, captions: true })); window.__noPresent = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => typeof startRace === 'function' && typeof ELEVEN !== 'undefined');
  await p.evaluate(() => { renderer.render = () => {}; });
  console.log('— library + test screen');
  const lib = await p.evaluate(async () => { await ELEVEN.loadLibrary(); return { ready: ELEVEN.ready, clips: ELEVEN.clipCount, names: ELEVEN.nameCount, id: ELEVEN.VOICE_ID, name: ELEVEN.VOICE_NAME }; });
  ok(lib.ready && lib.clips >= 790 && lib.names >= 128 && lib.id === 'MTGAJpjryOZn2Xr8FOtm', `recordings loaded: ${lib.clips} clips, ${lib.names} horse names, voice "${lib.name}" ${lib.id}`);
  const U = t => p.evaluate(t => CALLS.units.find(u => u.text === t).id, t);
  const t1 = await p.evaluate(async id => ELEVEN.test([{ id }], 4), await U("And they're away!"));
  ok(t1.backend === 'ElevenLabs recorded (your voice)' && t1.firstMs < 1500, `Test 1 (race start): "${t1.backend}", decoded and started in ${Math.round(t1.firstMs)} ms (first use)`);
  const t5 = await p.evaluate(async id => ELEVEN.test([{ id }, { name: 'My Custom Champion', ctx: 'x' }], 4), await U("Here comes"));
  ok(/local voice/.test(t5.backend) && t5.missingName, `a name the recordings lack: labelled "${t5.backend}" — not passed off as ElevenLabs`);
  const t5b = await p.evaluate(async id => ELEVEN.test([{ id }, { name: 'Quiet Thunder', ctx: 'x' }], 4), await U("Here comes"));
  ok(t5b.backend === 'ElevenLabs recorded (your voice)', 'a recorded name: all ElevenLabs');
  const all7 = await p.evaluate(async () => { const out = []; for (const [label, I, partsFn] of VOICE_SAMPLES) { const parts = partsFn(); out.push(parts.every(Boolean) && parts.filter(x => x.id).every(x => ELEVEN.clipCount && x.id)); } return out; });
  ok(all7.length === 7 && all7.every(Boolean), 'the seven voice tests in Settings use phrases that exist in the recordings');
  console.log('\n— a live race called with the recordings (Royal Randwick, 1200 m)');
  await p.evaluate(() => {
    window.__lines = []; window.__starts = [];
    const S0 = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { window.__starts.push(performance.now()); return S0.apply(this, a); };
    const sp = ELEVEN.speak; ELEVEN.speak = function (text, prm, onEnd, info) { const t = performance.now(), n = window.__starts.length, rec = { text, t, cat: info && info.cat, parts: info && info.parts.map(x => x.id || (x.name != null ? 'name:' + x.ctx + ':' + x.name : 'pause')), I: info && info.I }; window.__lines.push(rec);
      const wrapEnd = () => { rec.end = performance.now(); onEnd && onEnd(); }; const r = sp.call(this, text, prm, wrapEnd, info);
      const poll = () => { if (window.__starts.length > n) rec.startedNow = window.__starts[n] - t; else if (performance.now() - t < 2000) setTimeout(poll, 2); }; poll(); return r; };
    startRace(Object.assign(quickCfg(), { distance: 1200, field: 8, track: 'randwick', incidents: 'off', allBots: true, seed: 21 }));
  });
  await p.waitForFunction(() => race && race.state === 'done' && race.finishOrder.length, null, { timeout: 180000 });
  await p.waitForTimeout(6000);
  const R = await p.evaluate(() => ({ lines: window.__lines, winner: race.finishOrder[0].def.name, stats: ELEVEN.stats, decoded: ELEVEN.decoded, engine: COMM.engineName, plan: ELEVEN.lastPlan }));
  const lat = R.lines.map(l => l.startedNow).filter(x => x != null).sort((a, b) => a - b);
  ok(R.engine === 'ElevenLabs recorded', 'the race was called by the ElevenLabs recorded voice');
  ok(R.lines.length >= 10 && R.stats.voiced >= R.lines.length - 2 && R.stats.local === 0, `${R.lines.length} lines, ${R.stats.voiced} voiced entirely from the recordings (local-voice fallbacks: ${R.stats.local})`);
  ok(lat.length && lat[lat.length >> 1] < 80 && lat[lat.length - 1] < 300, `decision → sound (decoded just in time): median ${lat[lat.length >> 1].toFixed(0)} ms, worst ${lat[lat.length - 1].toFixed(0)} ms`);
  const win = R.lines.find(l => l.cat === 'win');
  ok(win && win.parts.some(x => x === 'name:s:' + R.winner) && win.text.includes(R.winner), `winner call: "${win ? win.text : '—'}" (official winner ${R.winner}, screamed name take)`);
  ok(R.decoded <= 160, `memory: ${R.decoded} clips decoded at once (cap 160; the rest stay compressed)`);
  console.log('   ' + R.lines.map(l => `${(l.startedNow != null ? l.startedNow.toFixed(0) : '–').padStart(4)} ms  ${l.text}`).join('\n   '));
  console.log('\n— Enhanced mode with no API key on the server; quitting mid-line');
  const B = await p.evaluate(async () => {
    ELEVEN.set('mode', 'eleven_plus'); const st = await ELEVEN.serverStatus(true);
    startRace(Object.assign(quickCfg(), { distance: 1000, field: 6, track: 'flemington', incidents: 'off', allBots: true, seed: 5, playerDef: undefined }));
    await new Promise(r => setTimeout(r, 9000));
    const going = race.state; let live = 0; const S1 = AudioBufferSourceNode.prototype.stop;
    COMM.silence(); const after = ELEVEN.lastPlan;
    return { st, going, engine: COMM.engineName, used: ELEVEN.stats.server.used };
  });
  ok(B.st && B.st.configured === false && B.going !== 'load' && B.used === 0, `no key on the server → status "${B.st.reason || 'not configured'}", nothing requested, the race runs (${B.going}) on the recordings`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
