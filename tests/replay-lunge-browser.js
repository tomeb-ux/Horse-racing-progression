// The finish replay shows what the timing shows: at the photo instant the first horse's visible nose is on the line
// (including a lunge's stretch), the lunge is visible (neck stretched, recorded in the replay) and the banner reports it.
// No turf particles are created.     PORT=8095 node tests/replay-lunge-browser.js [shotsDir]
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`, SHOTS = process.argv[2];
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 680 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_comm', '"off"'); window.__rafQ = []; window.requestAnimationFrame = f => { window.__rafQ.push(f); return 1; }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 240000 }); await p.waitForFunction(() => typeof startRace === 'function', null, { timeout: 240000 });
  // a close finish: the player's horse is held level with a rival to the line and lunges perfectly
  const res = await p.evaluate(() => {
    window.__t = performance.now(); window.__step = n => { for (let i = 0; i < n; i++) { window.__t += 1000 / 60; const q = window.__rafQ.splice(0); for (const f of q) f(window.__t); } };
    settings.parade = 'off'; ui.state = 'racing';
    startRace(Object.assign(quickCfg(), { distance: 1000, field: 6, track: 'randwick', incidents: 'off', seed: 21, diff: 'hard' })); if (typeof PRESENT !== 'undefined' && PRESENT.mode) PRESENT.finish();
    const R0 = renderer.render.bind(renderer); renderer.render = () => {}; window.__R0 = R0;
    for (let i = 0; i < 60 * 20 && race.state !== 'running'; i++) __step(1);
    spacePressed(); __step(1);
    const P = race.player; let lunged = null, maxNeck = 0;
    for (let i = 0; i < 60 * 120 && !P.finished; i++) {
      keys.w = true; keys.shift = race.dist - P.progress < 250;
      // keep it level with the leader of the others (a contrived photo: only the finish matters here)
      if (!window.__rival && race.dist - P.progress < 60) window.__rival = race.horses.filter(h => h !== P && !h.finished).sort((a, c) => c.progress - a.progress)[0];
      const o = window.__rival;
      if (o && !o.finished) { P.progress = o.progress - 0.15; P.v = o.v; P.laneF = Math.min(NLANES - 1, o.laneF + 1.2); }
      if (lunged == null && P.ttl() <= 0.27) { lunged = riderPress(race, P); pressFeedback(lunged); }
      __step(1);
      maxNeck = Math.max(maxNeck, P.mesh.userData.lunge || 0);
    }
    for (let i = 0; i < 60 * 3; i++) __step(1);
    const turf = scene.getObjectsByProperty ? scene.getObjectsByProperty('type', 'InstancedMesh').filter(m => m.geometry && m.geometry.type === 'DodecahedronGeometry').length : 0;
    return { lunged, maxNeck, lungeQ: P.stat.lungeQ, rec: race.rec.d.length / race.rec.cap / race.horses.length, turf };
  });
  ok(res.lunged && res.lunged.kind === 'lunge' && res.lunged.res === 'perfect' && res.lungeQ > 0.85, `a perfectly timed lunge (stretch at the line ${res.lungeQ})`);
  ok(res.maxNeck > 0.8, `the horse visibly stretches its neck out in the race (lunge pose ${res.maxNeck.toFixed(2)})`);
  ok(res.rec === 15, `the replay recording carries the lunge (${res.rec} channels per horse)`);
  ok(res.turf === 0, 'no turf particle system in the scene');
  // the replay: step to the freeze frame and measure where the first horse's visible nose is relative to the line
  const rp = await p.evaluate(() => {
    renderer.render = window.__R0;
    if (ui.state !== 'replay') startReplay('photo', true);
    let out = null, sawStretch = 0;
    // play it through to the player's own crossing, then look at that frame
    for (let i = 0; i < 60 * 30 && ui.state === 'replay' && RP.t < race.player.finishTime - 0.02; i++) { __step(1); sawStretch = Math.max(sawStretch, race.player.mesh.userData.lunge || 0); }
    RP.manual = true; RP.paused = true; RP.stepTo = race.player.finishTime; __step(1);
    const first = race.finishOrder[0], P = race.player;
    const nz = P.mesh.userData.nose.getWorldPosition(new THREE.Vector3()), tp = race.route.point(race.dist, 0, {});
    const along = (nz.x - tp.x) * tp.hx + (nz.z - tp.z) * tp.hz;
    if (!RP.bannerShown) replayBanner();
    out = { along, first: first.isPlayer ? 'player' : first.def.name, near: RP.near && RP.near.def.name, close: RP.close, banner: document.getElementById('rpB3').textContent, b1: document.getElementById('rpB1').textContent, sawStretch: Math.max(sawStretch, P.mesh.userData.lunge || 0) };
    return out || { none: true, freezeT: RP.freezeT, close: RP.close, nd: RP.nd };
  });
  ok(rp && !rp.none, `replayed to the player's crossing (${JSON.stringify(rp).slice(0, 160)})`);
  if (rp && !rp.none) {
    ok(Math.abs(rp.along) < 0.06, `at the instant the timing says the player crossed, their visible (lunging) nose is on the line (${(rp.along * 100).toFixed(1)} cm), not short of it`);
    ok(rp.sawStretch > 0.8, `the lunge is visible in the replay (neck stretch ${rp.sawStretch.toFixed(2)})`);
    ok(/lunge/.test(rp.banner), `the replay banner reports the lunge: "${rp.b1} · ${rp.banner}"`);
  }
  if (SHOTS) await p.screenshot({ path: SHOTS + '/replay-photo.png', timeout: 60000 }).catch(e => console.log('   (screenshot skipped: ' + e.message.split('\n')[0] + ')'));
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
