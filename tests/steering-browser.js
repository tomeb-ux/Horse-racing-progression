// Screen-relative steering (D = the horse's right / right of the screen when riding forwards, A = left) in the real game, on a right-handed course (Royal Randwick), a left-handed one (Flemington,
// main course and the Straight Six) and the original generic course. Drives the real key path (keydown → keys →
// handlePlayerInput → applyRiderInput → the simulation) and checks, on straights and on bends:
//   • D increases the horse's distance from the inside rail, A decreases it (measured in world metres from the rail);
//   • on screen (chase camera) the horse moves towards the side where the outside rail is drawn;
//   • the body follows the movement: nose turned towards the side it is moving to, body leaning that way;
//   • through a bend horses lean towards the inside rail (into the bend), never out of it;
//   • the radar shows the rail on the side it is really on.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/steering-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const CASES = [
  { track: 'randwick', dist: 1600, at: 1350, where: 'straight', hand: 'right' },
  { track: 'randwick', dist: 1600, at: 850, where: 'bend', hand: 'right' },
  { track: 'randwick', dist: 2000, at: 560, where: 'home turn', hand: 'right' },
  { track: 'flemington', dist: 2400, at: 1500, where: 'back straight', hand: 'left' },
  { track: 'flemington', dist: 2400, at: 800, where: 'home turn', hand: 'left' },
  { track: 'flemington', dist: 1200, at: 700, where: 'Straight Six', hand: 'left' },
  { track: 'generic', dist: 1600, at: 300, where: 'home straight', hand: 'left' },
  { track: 'generic', dist: 1600, at: 600, where: 'bend', hand: 'left' },
];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_comm', '"off"'); localStorage.setItem('ff_quality', '"low"'); localStorage.setItem('ff_autoReplay', 'false'); window.__noPresent = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE); await p.waitForFunction(() => typeof startRace === 'function');
  await p.evaluate(() => { renderer.render = () => {}; });
  for (const c of CASES) {
    console.log(`\n— ${c.track} (${c.hand}-handed), ${c.where}`);
    await p.evaluate(c => {
      settings.cam = 0;
      startRace(Object.assign(quickCfg(), { distance: c.dist, field: 8, track: c.track, chaos: false, incidents: 'off', seed: 5 }));
      camMode = 0;
      race.state = 'count'; race.openGates();
      // hold the player in the middle of the course, clear of the field, until the probe point
      let n = 0; const P = race.player;
      while (race.dist - P.progress > c.at && n++ < 300000) { if (race.state === 'running' && !P.started) spacePressed(); riderInput.effort = 0.75; handlePlayerInput(SIM_DT); P.laneF = 3; P.targetLane = 3; P.latV = 0; P.progress = Math.max(P.progress, Math.max(...race.horses.map(h => h.progress)) + 14); race.step(SIM_DT); }
      for (const h of race.horses) if (h !== P) h.progress = Math.min(h.progress, P.progress - 30);
      window.__run = (sec, cam) => { for (let i = 0; i < sec / SIM_DT; i++) { handlePlayerInput(SIM_DT); race.step(SIM_DT); if (i % 4 === 0) { updateHorseMeshes(SIM_DT * 4); if (cam) updateCamera(SIM_DT * 4); } } updateHorseMeshes(SIM_DT); };
      window.__probe = () => {
        const P = race.player, m = P.mesh; m.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const rIn = race.route.point(P.progress - NOSE_OFF, 0, {}), rOut = race.route.point(P.progress - NOSE_OFF, race.trk.W, {});
        const railDist = Math.hypot(m.position.x - rIn.x, m.position.z - rIn.z);
        const pr = v => new THREE.Vector3(v.x, 0, v.z).project(camera).x;
        const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion);
        const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(m.userData.B.body.getWorldQuaternion(new THREE.Quaternion()));
        const pt = race.route.point(P.progress - NOSE_OFF, laneOff(P.laneF), {});
        return { lane: P.laneF, railDist, sx: pr(m.position), sxIn: pr(rIn), sxOut: pr(rOut),
          noseOut: nose.x * pt.nx + nose.z * pt.nz, leanOut: bodyUp.x * pt.nx + bodyUp.z * pt.nz, turn: race.route.isTurn(P.progress),
          k: race.route.kIn(P.progress), curv: P.curv, roll: m.userData.roll, rh: document.getElementById('prox').classList.contains('rh') };
      };
    }, c);
    // settle, then straight-line reference (no steering)
    const s0 = await p.evaluate(() => { __run(1.2, true); updateProx(race.player); return __probe(); });
    if (/bend|turn/.test(c.where)) {
      ok(s0.k > 1e-3, `probe point is on the bend (curvature ${s0.k.toFixed(4)} /m)`);
      ok(s0.leanOut < -0.002, `through the bend with no steering the horse leans INTO the bend, towards the inside rail (lean ${s0.leanOut.toFixed(3)} curv ${s0.curv} roll ${s0.roll})`);
    } else ok(s0.k < 1e-4, `probe point is on a straight`);
    ok(s0.rh === (c.hand === 'right'), `radar draws the rail on the ${c.hand === 'right' ? 'right' : 'left'} (where it really is from the saddle)`);
    // hold D
    await p.keyboard.down('d');
    const d1 = await p.evaluate(() => { __run(0.6, true); const a = __probe(); __run(0.6, false); return [a, __probe()]; });
    await p.keyboard.up('d');
    const dm = d1[0], de = d1[1], rs = c.hand === 'right' ? -1 : 1;       // D = right: wider on a left-handed course, towards the rail on a right-handed one
    ok(rs * (de.lane - s0.lane) > 0.2, `D moves the horse to its right: ${c.hand === 'right' ? 'towards the inside rail (right-handed course)' : 'wider (left-handed course)'} — lane ${s0.lane.toFixed(2)} → ${de.lane.toFixed(2)}`);
    ok(dm.sx > s0.sx, `D on screen (chase camera): the horse moves RIGHT (${s0.sx.toFixed(3)} → ${dm.sx.toFixed(3)})`);
    ok(rs * dm.noseOut > 0.003, `D: nose turned to the right, the way it is moving (${dm.noseOut.toFixed(3)})`);
    ok(rs * (dm.leanOut - s0.leanOut) > 0, `D: body leans with the move (${s0.leanOut.toFixed(3)} → ${dm.leanOut.toFixed(3)})`);
    // hold A
    await p.evaluate(() => __run(1.0, false));
    const a0 = await p.evaluate(() => __probe());
    await p.keyboard.down('a');
    const a1 = await p.evaluate(() => { __run(0.6, true); const a = __probe(); __run(0.6, false); return [a, __probe()]; });
    await p.keyboard.up('a');
    ok(rs * (a1[1].lane - a0.lane) < -0.2, `A moves the horse to its left — lane ${a0.lane.toFixed(2)} → ${a1[1].lane.toFixed(2)}`);
    ok(rs * a1[0].noseOut < -0.003, `A: nose turned to the left (${a1[0].noseOut.toFixed(3)})`);
  }
  // keep A held to the rail: the horse stops at the rail, it never crosses it
  const rail = await p.evaluate(() => { startRace(Object.assign(quickCfg(), { distance: 1600, field: 4, track: 'randwick', incidents: 'off', seed: 9 })); race.state = 'count'; race.openGates(); updateHorseMeshes(0); keys.d = true; let mn = 9; for (let i = 0; i < 40 / SIM_DT; i++) { handlePlayerInput(SIM_DT); race.step(SIM_DT); mn = Math.min(mn, race.player.laneF); } keys.d = false; return mn; });
  ok(rail >= 0 && rail < 0.6, `Randwick: holding D (right = the rail there) the horse reaches the rail and stays on the course (min lane ${rail.toFixed(2)})`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
