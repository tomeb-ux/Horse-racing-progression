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
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_autoReplay', 'false'); localStorage.setItem('ff_eleven', JSON.stringify({ mode: 'eleven', nameFallback: 'local' })); localStorage.setItem('ff_commentary', JSON.stringify({ on: true, vol: 0.9, captions: true })); window.__noPresent = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => typeof startRace === 'function' && typeof ELEVEN !== 'undefined');
  await p.evaluate(() => { renderer.render = () => {}; });
  console.log('— library + test screen');
  const lib = await p.evaluate(async () => { await ELEVEN.loadLibrary(); return { ready: ELEVEN.ready, clips: ELEVEN.clipCount, names: ELEVEN.nameCount, id: ELEVEN.VOICE_ID }; });
  ok(lib.ready && lib.clips >= 220 && lib.names >= 128 && lib.id === 'OQt0mf8rKBYkweCSQ9d4', `recordings loaded: ${lib.clips} clips, ${lib.names} names, voice ${lib.id}`);
  const t1 = await p.evaluate(() => ELEVEN.test(['start/away_1']));
  ok(t1.backend === 'ElevenLabs recorded (your voice)' && t1.firstMs < 1500, `Test 1 (race start): "${t1.backend}", decoded and started in ${Math.round(t1.firstMs)} ms (first use, includes MP3 decode)`);
  const t5 = await p.evaluate(() => ELEVEN.test(['transitions/big_run'], { name: 'My Custom Champion' }));
  ok(/local voice/.test(t5.backend) && t5.missingName, `Test 5 with a name the recordings lack: labelled "${t5.backend}" — not passed off as ElevenLabs`);
  const t5b = await p.evaluate(() => ELEVEN.test(['transitions/big_run'], { name: 'Quiet Thunder' }));
  ok(t5b.backend === 'ElevenLabs recorded (your voice)', 'Test 5 with a recorded name: all ElevenLabs');
  console.log('\n— a live race called with the recordings (Royal Randwick, 1200 m)');
  await p.evaluate(() => {
    window.__lines = []; window.__starts = [];
    const S0 = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { window.__starts.push(performance.now()); return S0.apply(this, a); };
    const sp = ELEVEN.speak; ELEVEN.speak = function (text, prm, onEnd, info) { const t = performance.now(), n = window.__starts.length; const r = sp.call(this, text, prm, onEnd, info); window.__lines.push({ text, t, kind: info && info.clip && info.clip.kind, plan: ELEVEN.lastPlan, startedNow: window.__starts.length > n ? window.__starts[n] - t : null, I: info && info.I }); return r; };
    startRace(Object.assign(quickCfg(), { distance: 1200, field: 8, track: 'randwick', incidents: 'off', allBots: true, seed: 21 }));
  });
  await p.waitForFunction(() => race && race.state === 'done' && race.finishOrder.length, null, { timeout: 180000 });
  await p.waitForTimeout(6000);
  const R = await p.evaluate(() => ({ lines: window.__lines, winner: race.finishOrder[0].def.name, stats: ELEVEN.stats, decoded: ELEVEN.decoded, engine: COMM.engineName }));
  const voiced = R.lines.filter(l => l.plan && l.plan.parts.length), lat = voiced.map(l => l.startedNow).filter(x => x != null).sort((a, b) => a - b);
  ok(R.engine === 'ElevenLabs recorded', 'the race was called by the ElevenLabs recorded voice');
  ok(R.lines.length >= 6 && voiced.length / R.lines.length > 0.7, `${R.lines.length} lines, ${voiced.length} voiced with recordings`);
  ok(lat.length && lat[lat.length >> 1] < 30 && lat[lat.length - 1] < 120, `decision → sound: median ${lat[lat.length >> 1].toFixed(1)} ms, worst ${lat[lat.length - 1].toFixed(1)} ms (everything decoded before the start)`);
  const win = R.lines.find(l => l.kind === 'win');
  ok(win && win.plan.items.some(i => /^horse-names(-shout)?\//.test(i) && i.endsWith('/' + R.winner.toLowerCase().replace(/[^a-z0-9]+/g, '_'))), `winner call: ${win ? win.plan.items.join(' + ') : '—'} (official winner ${R.winner})`);
  console.log('   ' + R.lines.map(l => `[${l.kind}] ${l.plan ? l.plan.items.join(' + ') : ''}`).join('\n   '));
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
