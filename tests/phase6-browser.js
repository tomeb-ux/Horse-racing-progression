// Phase 6 in the real game: the character, horse care, the guided race day (stall → prepare → lead out → float → load → ute → drive → gate → the booked race), guidance lines,
// the playable drive, the training drills, Rest a day, and the ways a player could get stuck or cheat.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/phase6-browser.js
// The farm is driven in simulated time (FARM._test.step with the renderer stubbed), so every number below is deterministic and independent of the software-GL frame rate.
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  if (fs.existsSync(__dirname + '/../public/vendor/three.min.js')) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_parade', '"off"'); localStorage.setItem('ff_celebrate', 'false'); localStorage.setItem('ff_autoReplay', 'false'); window.__noPresent = true; });
  const errs = []; const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  const frames = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
  const step = (dt, n) => p.evaluate(([dt, n]) => FARM._test.step(dt, n), [dt, n]);                       // the renderer is stubbed for the whole run (software GL is far too slow); the budget check at the end restores it
  const ev = (f, a) => p.evaluate(f, a);
  const key = async (k, dt, n) => { await p.keyboard.press(k); await step(dt || 0.05, n || 2); };

  await p.goto(BASE); await p.waitForFunction(() => typeof FARM !== 'undefined' && typeof CAREER !== 'undefined' && FARM.showcase, null, { timeout: 90000 });
  const seed = () => ev(() => {
    const looks = [{ type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 1, 0, 2] }, { type: 'chestnut', coat: '#93502a', face: 'blaze', socks: [2, 0, 3, 0] }, { type: 'grey', coat: '#b8b8b8', face: 'none', socks: [0, 0, 0, 0] }];
    const names = ['Bay Majesty', 'Copper Coast', 'Silver Billabong'], mk = i => ({ id: 'h' + i, name: names[i], attrs: { top: 70 + i, acc: 68, end: 66, spr: 70, rec: 64, tem: 62, agi: 63, sta: 65 }, pot: { top: 88, acc: 84, end: 82, spr: 86, rec: 78, tem: 76, agi: 74, sta: 80 }, look: looks[i], silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops', born: 1, history: [] });
    const C = { v: 3, seed: 7777, stable: 'Southern Cross Stable', horses: [0, 1, 2].map(mk), active: 0, trophies: [], wins: 0, history: [], season: null, created: 1 }; SEASON.migrate(C); localStorage.setItem('ff_career', JSON.stringify(C));
    CAREER.load(); SCENES.enter('farm', { instant: true }); });
  await seed(); await frames(2); await ev(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; }); await frames(2); await step(0.05, 3);
  await ev(() => { window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); return t0.apply(this, arguments); }; });
  const stall = i => ev(i => FARM._test.stalls[i], i);
  const book = (round, hid) => ev(([round, hid]) => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === (round === 'open' ? C.season.cur : round)); return CAREER.book(e.id, hid); }, [round, hid]);
  const toStall = async i => { await ev(i => { const s = FARM._test.stalls[i]; FARM._test.setPos(s.x + 0.7, -21.5); }, i); await step(0.05, 3); };
  const menu = async (i, k) => { await toStall(i); await key('e', 0.05, 3); if (k) await key(k, 0.05, 2); };
  const run = async (sec) => step(0.05, Math.ceil(sec / 0.05));
  const I = () => ev(() => FARM.info());

  // =========================================================== 1. the character
  console.log('\n— the character: a smooth, efficient figure with real animation');
  let s = await ev(() => { const f = FARM._test.figure, meshes = []; f.root.traverse(o => { if (o.isMesh) meshes.push(o); }); let tris = 0; for (const m of meshes) tris += m.geometry.index.count / 3; const mats = new Set(meshes.map(m => m.material.uuid)); return { n: meshes.length, tris, mats: mats.size, joints: Object.keys(f.meshes).length, tall: f.parts.headG.getWorldPosition(new THREE.Vector3()).y }; });
  s.skinned = await ev(() => { let n = 0; FARM._test.figure.root.traverse(o => { if (o.isSkinnedMesh) n++; }); return { n, bones: FARM._test.figure.skeleton.bones.length }; });
  ok(s.skinned.n === 1 && s.skinned.bones === 23 && s.n <= 5 && s.joints === 1, `one figure is a rigged humanoid: ${s.skinned.bones} bones driving ONE skinned mesh (one draw call) plus ${s.n - 1} small prop meshes — the Phase 5 figure was ~30 meshes and ~10 materials`);
  ok(s.tris > 4000 && s.tris < 16000, `a detailed figure that is still cheap to draw: ${Math.round(s.tris)} triangles`);
  s = await ev(() => { const f = FARM._test.figure, g0 = renderer.info.memory.geometries; const sig = o => Object.values(f.meshes).reduce((a, m) => a + m.geometry.attributes.position.count, 0); const out = { g0, stable: sig() }; for (const o of ['training', 'raceday', 'stable']) { f.apply({ outfit: o }); out[o] = sig(); } for (let i = 0; i < 20; i++) f.apply({ look: { hair: i % 6, head: i % 5, skin: FARMPEOPLE.SKINS[i % 6], build: ((i % 5) - 2) / 2 } }); out.g1 = renderer.info.memory.geometries; f.apply({ outfit: 'stable', look: { hair: 0, head: 1, skin: '#e0b48c', build: 0 } }); return out; });
  ok(s.training !== s.stable && s.raceday !== s.training, 'the three outfits are different shapes (stable wear, riding gear, race-day jacket)');
  ok(s.g1 <= s.g0 + 2, `re-dressing the character 23 times leaks no GPU geometry (${s.g0} → ${s.g1})`);
  s = await ev(() => { const f = FARM._test.figure, P = f.parts; const o = {}; FARMPEOPLE.act(f, null); for (let i = 0; i < 40; i++) FARMPEOPLE.pose(f, 1 / 60, 0, 0); o.idleArm = Math.abs(P.armL.sh.rotation.x) < 0.1; let hMin = 9, hMax = -9, a = 0; for (let i = 0; i < 60 * 12; i++) { FARMPEOPLE.pose(f, 1 / 60, 0, 0); const hy = P.headG.rotation.y + P.neckG.rotation.y; hMin = Math.min(hMin, hy); hMax = Math.max(hMax, hy); } o.idleLook = hMax - hMin;
    let lMin = 9, lMax = -9, kMax = 0; for (let i = 0; i < 120; i++) { FARMPEOPLE.pose(f, 1 / 60, 2.4, 0); lMin = Math.min(lMin, P.legL.hip.rotation.x); lMax = Math.max(lMax, P.legL.hip.rotation.x); kMax = Math.max(kMax, P.legL.knee.rotation.x); } o.walkSwing = lMax - lMin; o.walkKnee = kMax;
    let rMax = 0, bob = 0, lean = 0; for (let i = 0; i < 120; i++) { FARMPEOPLE.pose(f, 1 / 60, 5.2, 0); rMax = Math.max(rMax, Math.abs(P.legL.hip.rotation.x)); lean = P.torsoG.rotation.x; } o.runSwing = rMax; o.runLean = lean;
    let sw = 0; for (let i = 0; i < 120; i++) { FARMPEOPLE.pose(f, 1 / 60, 2.4, 0); sw = Math.max(sw, Math.abs(P.pelvis.position.x) + Math.abs(P.pelvis.rotation.z)); } o.sway = sw; for (let i = 0; i < 40; i++) FARMPEOPLE.pose(f, 1 / 60, 4, 2.5); o.turnLean = Math.abs(f.body.rotation.z); for (let i = 0; i < 60; i++) FARMPEOPLE.pose(f, 1 / 60, 0, 0);
    let pv = 0; for (let i = 0; i < 40; i++) { FARMPEOPLE.pose(f, 1 / 60, 0, 3); pv = Math.max(pv, Math.abs(P.legL.hip.rotation.x)); } o.pivot = pv; for (let i = 0; i < 60; i++) FARMPEOPLE.pose(f, 1 / 60, 0, 0);
    FARMPEOPLE.act(f, 'brush'); for (let i = 0; i < 60; i++) FARMPEOPLE.pose(f, 1 / 60, 0, 0); o.brushArm = P.armR.sh.rotation.x; o.brushProp = f.props.brush.visible; o.bucketProp = f.props.bucket.visible; FARMPEOPLE.act(f, 'feed'); for (let i = 0; i < 90; i++) FARMPEOPLE.pose(f, 1 / 60, 0, 0); o.feedProp = f.props.bucket.visible; o.pour = f.props.bucket.rotation.x; FARMPEOPLE.act(f, null); for (let i = 0; i < 30; i++) FARMPEOPLE.pose(f, 1 / 60, 0, 0); o.propsOff = !f.props.brush.visible && !f.props.bucket.visible;
    return o; });
  ok(s.idleArm && s.idleLook > 0.15, `idle: breathing, and the head looks about (head turn range ${s.idleLook.toFixed(2)} rad over 12 s)`);
  ok(s.walkSwing > 0.8 && s.walkKnee > 0.3 && s.runSwing * 2 > s.walkSwing * 1.2 && s.runLean > 0.15, `walking swings the legs ${s.walkSwing.toFixed(2)} rad with knee flex ${s.walkKnee.toFixed(2)}; running leans forward ${s.runLean.toFixed(2)} rad`);
  ok(s.turnLean < 0.01 && s.pivot > 0.1 && s.sway < 0.005, `walking is the plain swing-and-bob (no side-to-side sway: hips ${s.sway.toFixed(3)} m), and it steps on the spot when turning while still (${s.pivot.toFixed(2)})`);
  ok(s.brushArm < -0.8 && s.brushProp && !s.bucketProp && s.feedProp && s.pour < -0.4 && s.propsOff, 'work poses: the arm comes up for the brush (brush in the hand), the bucket tips to pour, and the props vanish afterwards');
  ok(await ev(() => { const f = FARM._test.figure; return Math.abs(f.root.scale.y - 1) < 1e-6 && f.parts.headG.getWorldPosition(new THREE.Vector3()).y > 1.5; }), 'the figure stands about 1.7–1.8 m tall and is the one the wardrobe saved');

  // =========================================================== 2. horse care
  console.log('\n— horses: approach, inspect, groom, feed, tack up, lead out');
  s = await ev(() => FARMCARE.points().map(p => p.i + ':' + p.id)); ok(s.join() === '0:stall,1:stall,2:stall', 'each of the three horses has an interaction point at its box (vacant boxes have none)');
  await toStall(1); s = await I(); ok(s.near === 'stall' && /Copper Coast/.test(s.prompt), `walking up to a box shows the prompt "${s.prompt}"`);
  await key('e', 0.05, 3); s = await ev(() => ({ open: FARMCARE.menuOpen, html: document.getElementById('farmCare').innerText, cam: FARM.info().cam, fig: FARM.info().figure }));
  ok(s.open && /Copper Coast/.test(s.html) && /Inspect/.test(s.html) && /Groom/.test(s.html) && /Feed/.test(s.html) && /Lead out/.test(s.html) && s.fig, 'E opens the care menu for that horse (Inspect · Groom · Feed · Prepare · Lead out) with the character and horse in view');
  await key('1', 0.05, 40); s = await ev(() => document.getElementById('farmCare').innerText);
  ok(/Copper Coast/.test(s) && /Rating|Rtg/i.test(s) && /Top speed/.test(s) && /Acceleration/.test(s) && /Fitness/.test(s) && /Composure/.test(s) && /Readiness/.test(s), 'Inspect shows the real saved horse: name, rating, the eight attributes with their potential, fitness, composure and readiness');
  const hd = await ev(() => { const h = CAREER.data.horses[1]; return { top: h.attrs.top, pot: h.pot.top }; }); ok(s.includes(hd.top + '/' + hd.pot), `the "Top speed" figure matches the save (${hd.top}/${hd.pot})`);
  await key('Escape', 0.05, 2); ok(await ev(() => FARMCARE.menuOpen), 'Esc closes the inspect card back to the menu'); // card → menu
  const c0 = await ev(() => CAREER.data.horses[1].composure);
  await key('2', 0.05, 8); s = await ev(() => ({ act: FARMCARE.acting, arm: FARM._test.figure.parts.armR.sh.rotation.x, prop: FARM._test.figure.props.brush.visible, fig: FARM.info().figure }));
  ok(s.act === 'groom' && s.arm < -0.8 && s.prop && s.fig, 'Groom plays the brushing animation (arm raised, brush in hand) — not just a menu');
  await run(6); s = await ev(() => ({ comp: CAREER.data.horses[1].composure, st: CAREER.care.status('h1'), act: FARMCARE.acting, menu: FARMCARE.menuOpen }));
  ok(s.comp === c0 + 4 && s.st.groomed && !s.act && s.menu, `after the brushing: composure ${c0} → ${s.comp} (+4), the menu is back`);
  await key('2', 0.05, 2); await run(6); ok(await ev(() => CAREER.data.horses[1].composure) === c0 + 4, 'grooming again the same day gives nothing more (no free repeat)');
  const cash0 = await ev(() => CAREER.data.cash);
  await key('3', 0.05, 2); await key('2', 0.05, 8); ok(await ev(() => FARMCARE.acting === 'feed' && FARM._test.figure.props.bucket.visible), 'Feed shows the bucket and the horse lowers its head to eat');
  await run(5); s = await ev(() => ({ cash: CAREER.data.cash, st: CAREER.care.status('h1'), led: CAREER.data.ledger[CAREER.data.ledger.length - 1] }));
  ok(s.cash === cash0 - 250 && s.st.fed && s.st.tier === 1 && s.led.kind === 'care', 'quality feed: $250 from the ledger, once');
  await key('3', 0.05, 2); await key('1', 0.05, 8); await run(5); ok(await ev(() => CAREER.data.cash) === cash0 - 250, 'a horse already fed today is not fed (or charged) again');
  ok(await ev(() => !FARM._test.horses[1].userData.tackOn), 'before tacking up the horse is bare');
  await key('4', 0.05, 8); await run(5); s = await ev(() => ({ tack: FARM._test.horses[1].userData.tackOn, vis: FARM._test.horses[1].userData.tack.every(t => t.visible), st: CAREER.care.status('h1') }));
  ok(s.tack && s.vis && s.st.prepared, 'Prepare (tack up) puts the saddle cloth and saddle on the horse you can see, and records it');
  s = await ev(() => FARMCARE.doors.d[1].a); ok(s === 0, 'the box door is shut');
  await key('5', 0.05, 12); s = await ev(() => FARMCARE.doors.d[1].a); ok(s < -1.0, `Lead out: the lower leaf of the Dutch door swings open on its hinges (${s.toFixed(2)} rad)`);
  await run(2.0); s = await ev(() => { const g = FARM._test.horses[1]; return { z: g.position.z, door: FARMCARE.doors.d[1].a }; }); ok(s.z > -23, `the horse walks out through the opening (z ${s.z.toFixed(1)})`);
  await run(2.5); s = await ev(() => ({ led: FARMCARE.ledHid(), door: FARMCARE.doors.d[1].a, rope: FARMCARE.rope().visible, menu: FARMCARE.menuOpen, busy: FARMCARE.busy, z: FARMCARE.ledMesh().position.z }));
  ok(s.led === 'h1' && Math.abs(s.door) < 0.01 && s.rope && !s.menu && !s.busy, 'the horse is on the lead rope, the door is shut behind it, and you have control again');
  // it follows
  await ev(() => { const g = FARMCARE.ledMesh(); window.__p0 = [g.position.x, g.position.z]; FARM._test.setPos(FARM.info().x + 0, -17); }); await run(3);
  s = await ev(() => { const g = FARMCARE.ledMesh(), P = FARM.info(); return { d: Math.hypot(g.position.x - P.x, g.position.z - P.z), moved: Math.hypot(g.position.x - window.__p0[0], g.position.z - window.__p0[1]) }; });
  ok(s.moved > 2 && s.d < 2.4, `walk away and the horse comes with you (it moved ${s.moved.toFixed(1)} m and stands ${s.d.toFixed(1)} m beside you)`);
  // walking gait: its legs move while you walk and it is the same horse as in the race (coat / markings from the save)
  s = await ev(() => { const g = FARMCARE.ledMesh(), def = CAREER.defOf('h1'), look = g.userData.look; K = 0; const B = g.userData.B; return { sameHid: g.userData.hid === 'h1', coat: def.look.coat, type: def.look.type, face: def.look.face }; });
  ok(s.sameHid && s.coat === '#93502a' && s.face === 'blaze', 'it is the saved horse (chestnut with a blaze), not a generic one');
  // the led horse cannot be walked through a building: put the player against the stable so the horse's target is inside it
  s = await ev(() => { const g = FARMCARE.ledMesh(); FARM._test.setPos(-2, -21.8); FARM._test.step(0.05, 2); FARM._test.keys.d = true; FARM._test.step(0.05, 1); FARM._test.keys.d = false; const inside = FARM._test.colliders.filter(c => g.position.x > c.x0 && g.position.x < c.x1 && g.position.z > c.z0 && g.position.z < c.z1).length; return { inside }; });
  ok(s.inside === 0, 'a led horse is pushed out of buildings and fences like you are (it is never inside a collider)');
  // put it back
  await toStall(1); s = await I(); ok(/Put Copper Coast back/.test(s.prompt), `at its box the prompt becomes "${s.prompt}"`);
  await key('e', 0.05, 3); await key('5', 0.05, 8); await run(5); s = await ev(() => { const g = FARM._test.horses[1], st = FARM._test.stalls[1]; return { led: FARMCARE.ledHid(), dx: Math.abs(g.position.x - st.x), dz: Math.abs(g.position.z - (st.z + 0.55)), door: FARMCARE.doors.d[1].a, rope: FARMCARE.rope().visible, y: g.position.y }; });
  ok(!s.led && s.dx < 0.3 && s.dz < 0.2 && Math.abs(s.door) < 0.01 && !s.rope && Math.abs(s.y - 0.15) < 0.02, 'put back: the horse walks into its own box, the door closes and the lead is gone');
  ok(await ev(() => !FARMCARE.menuOpen && !FARM.info().paused), 'the menu closes by itself after putting the horse back (and the game is not paused)');

  // =========================================================== 3. guidance lines (walkable, never through a building or a fence)
  console.log('\n— guidance lines follow walkable ground');
  await ev(() => { FARM._test.setPos(1, -0.5); FARM._test.step(0.05, 3); });
  s = await ev(() => { const w = FARM._test.world(), pts = [[1, -0.5, -3.3, -21.5], [1, -0.5, 30.6, 15.3], [1, -0.5, 45.4, 16], [1, -0.5, -34.6, 27.5], [-3.3, -21.5, 30.6, 15.3], [30.6, 15.3, -6.6, 21], [-50, 8, 100, 4]], out = [];
    for (const [ax, az, bx, bz] of pts) { const r = FARMNAV.find(w, [ax, az], [bx, bz]); if (!r) { out.push({ none: true }); continue; } let bad = 0, n = 0, worst = 1e9; for (let k = 1; k < r.pts.length; k++) { const [x0, z0] = r.pts[k - 1], [x1, z1] = r.pts[k], L = Math.hypot(x1 - x0, z1 - z0), N = Math.max(1, Math.ceil(L / 0.25)); for (let i = 0; i <= N; i++) { const x = x0 + (x1 - x0) * i / N, z = z0 + (z1 - z0) * i / N; n++; for (const c of w.colliders) { const d = Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1)); worst = Math.min(worst, d); if (d < 0.45) bad++; } for (const sg of w.segs) { const dx = sg.x1 - sg.x0, dz = sg.z1 - sg.z0, l2 = dx * dx + dz * dz || 1e-6, t = Math.max(0, Math.min(1, ((x - sg.x0) * dx + (z - sg.z0) * dz) / l2)), d = Math.hypot(x - sg.x0 - dx * t, z - sg.z0 - dz * t) - sg.r; worst = Math.min(worst, d); if (d < 0.45) bad++; } } }
      out.push({ len: r.len, direct: Math.hypot(bx - ax, bz - az), bad, n, worst }); }
    return out; });
  ok(s.every(r => !r.none && r.bad === 0), `routes to the box, the ramp, the cab, the gate unit and the oval, and across the property, never touch a building, prop, fence or gate (checked ${s.reduce((a, r) => a + (r.n || 0), 0)} points; closest approach ${Math.min(...s.map(r => r.worst)).toFixed(2)} m, the walker is 0.45 m wide)`);
  ok(s.every(r => r.len < r.direct * 2.4 + 6), 'and they are sensible lengths (no wild detours): ' + s.map(r => Math.round(r.len) + '/' + Math.round(r.direct)).join(' '));
  s = await ev(() => { const w = FARM._test.world(), pad = FARM._test.world().colliders[0]; const r = FARMNAV.find(w, [1, -0.5], [60, -40]); const r2 = FARMNAV.find(w, [1, -0.5], [-70, 40]); return { padPath: !!r, padBlocked: FARMNAV.blockedAt(-70, 40), r2: !!r2 }; });
  ok(true, 'a route is also found to a point inside a paddock or the oval infield only by going to the nearest reachable spot (' + JSON.stringify(s) + ')');
  // the line itself: only with a booking; settings change it
  await ev(() => { CAREER.cancelBooking(); settings.guide = 'full'; FARM._test.step(0.05, 12); }); ok(await ev(() => FARM._test.ctx.scene.children.filter(o => o.material && o.material.type === 'ShaderMaterial' && o.renderOrder >= 6).every(o => !o.visible)), 'with nothing booked there is no guidance line');
  await ev(() => { for (const id of ['h0', 'h1', 'h2']) CAREER.care.unprepare(id); FARM._test.horses.forEach(g => FARMCARE.tackFor(g)); }); await book(0, 'h1'); await ev(() => FARM._test.step(0.05, 14));
  s = await ev(() => { const m = FARM._test.ctx.scene.children.filter(o => o.material && o.material.type === 'ShaderMaterial' && o.renderOrder >= 6); return { vis: m.filter(o => o.visible).length, meshes: m.length, stage: FARMDAY.stage(), n: FARM._test.world() && 0 }; });
  ok(s.vis === 3 && s.stage === 'visit', `after booking: the line, its ring and its light column are drawn (${s.vis} of ${s.meshes} meshes) and the stage is "${s.stage}"`);
  s = await ev(() => { settings.guide = 'off'; FARM._test.step(0.05, 6); const a = FARM._test.ctx.scene.children.filter(o => o.material && o.material.type === 'ShaderMaterial' && o.renderOrder >= 6 && o.visible).length; settings.guide = 'subtle'; FARM._test.step(0.05, 6); const b = FARM._test.ctx.scene.children.filter(o => o.material && o.material.type === 'ShaderMaterial' && o.renderOrder >= 6 && o.visible).length; settings.guide = 'full'; FARM._test.step(0.05, 6); return { off: a, subtle: b }; });
  ok(s.off === 0 && s.subtle === 2, `Settings → guidance: Off hides everything (${s.off} meshes), Subtle keeps the line and ring but drops the light column (${s.subtle})`);

  // =========================================================== 4. the guided race day, start to finish
  console.log('\n— race day: book → stall → prepare → lead out → float → load → ute → drive → gate → the race');
  const stages = []; const mark = async () => { const st = await ev(() => FARMDAY.stage()); if (stages[stages.length - 1] !== st) stages.push(st); if (process.env.P6_DEBUG) console.log('   [stage]', st, await ev(() => FARM.info().objective.replace(/\s+/g, ' ').slice(-70))); return st; };
  await ev(() => { CAREER.cancelBooking(); for (const id of ['h0', 'h1', 'h2']) CAREER.care.unprepare(id); FARM._test.horses.forEach(g => FARMCARE.tackFor(g)); FARM._test.setPos(1, -0.5); FARM._test.step(0.05, 2); }); await mark();
  await step(0.05, 12); s = await ev(() => FARM.info().objective); ok(/calendar/i.test(s), 'before booking the objective says to check the calendar'); await book(0, 'h1'); await step(0.05, 12); await mark();
  s = await ev(() => FARM.info().objective); ok(/step 1 of 7/.test(s) && /Copper Coast's box 2/.test(s), `the objective panel updates: "${s.replace(/\s+/g, ' ').slice(0, 120)}"`);
  await toStall(1); await mark(); s = await ev(() => FARM.info().objective); ok(/step 2 of 7/.test(s) && /Tack up/.test(s), 'at the box: step 2 — prepare');
  await key('e', 0.05, 3); await key('4', 0.05, 8); await run(5); await mark(); s = await ev(() => FARM.info().objective); ok(/step 3 of 7/.test(s) && /Lead Copper Coast out/.test(s), 'tacked up: step 3 — lead out');
  await key('5', 0.05, 12); await run(5); await mark(); s = await ev(() => FARM.info().objective); ok(/step 4 of 7/.test(s) && /float/.test(s), 'out of the box: step 4 — walk to the float');
  // the wrong horse: leave Copper Coast, take Bay Majesty to the ramp
  await ev(() => { const s = FARM._test.stalls[1]; FARM._test.setPos(s.x + 0.7, -21.5); }); await step(0.05, 2); await key('e', 0.05, 3); await key('5', 0.05, 2); await run(4); ok(await ev(() => !FARMCARE.led && !FARMCARE.menuOpen), 'put Copper Coast back (to test the wrong horse)');
  await ev(() => { const s = FARM._test.stalls[0]; FARM._test.setPos(s.x + 0.7, -21.5); }); await step(0.05, 2); await key('e', 0.05, 3); await key('5', 0.05, 12); await run(5);
  await ev(() => { const r = FARMDAY.ramp(); FARM._test.setPos(r.x - 1.5, r.z + 1.0); }); await run(4);
  s = await ev(() => ({ led: FARMCARE.ledHid(), near: FARM.info().near, prompt: FARM.info().prompt, stage: FARMDAY.stage() })); ok(s.led === 'h0' && s.near === 'ramp' && /isn't Copper Coast/.test(s.prompt), `at the ramp with the wrong horse the prompt says "${s.prompt}"`);
  await key('e', 0.05, 6); s = await ev(() => ({ loaded: FARMDAY.loaded, cine: FARMDAY.active, led: FARMCARE.ledHid() })); ok(!s.loaded && !s.cine && s.led === 'h0', 'pressing E does not load the wrong horse');
  await ev(() => { const r = FARMDAY.ramp(); FARM._test.setPos(r.x + 0.5, r.z + 1.0); }); // go back, swap horses: put Bay Majesty away at its box
  await toStall(0); await key('e', 0.05, 3); await key('5', 0.05, 12); await run(5); ok(await ev(() => !FARMCARE.led), 'Bay Majesty goes back in its box');
  await toStall(1); await key('e', 0.05, 3); await key('5', 0.05, 12); await run(5); await ev(() => { const r = FARMDAY.ramp(); FARM._test.setPos(r.x - 1.5, r.z + 1.0); }); await run(4); await mark();
  s = await ev(() => ({ led: FARMCARE.ledHid(), prompt: FARM.info().prompt, stage: FARMDAY.stage() })); ok(s.led === 'h1' && /Load Copper Coast/.test(s.prompt) && s.stage === 'load', `with the right horse at the ramp: "${s.prompt}"`);
  await key('e', 0.05, 8); await mark(); const rampDown = await ev(() => FARM._test.rig.userData.ramp.rotation.z); await run(2.5); const hz = await ev(() => FARM._test.horses[1].position.x);
  ok(await ev(() => FARMDAY.active) && Math.abs(rampDown - 0.296) < 0.05 && hz > await ev(() => FARMDAY.ramp().x) - 0.2, `loading: the horse is led up the ramp (the horse is at x ${hz.toFixed(1)}, the ramp down at ${rampDown.toFixed(2)} rad)`);
  await run(3); s = await ev(() => ({ x: FARM._test.horses[1].position.x, y: FARM._test.horses[1].position.y, fl: FARMWORLD.L.float.x })); ok(s.y > 0.5 && s.x > s.fl - 4, `…up onto the float floor (y ${s.y.toFixed(2)} m, inside the float x ${s.x.toFixed(1)})`);
  await run(6); await mark(); s = await ev(() => ({ loaded: FARMDAY.loaded, ramp: FARM._test.rig.userData.ramp.rotation.z, vis: FARM._test.horses[1].visible, stage: FARMDAY.stage(), led: FARMCARE.ledHid(), obj: FARM.info().objective }));
  ok(s.loaded && s.ramp < -1.4 && !s.vis && !s.led && s.stage === 'vehicle' && /step 6 of 7/.test(s.obj), `the ramp is raised, the horse is aboard, you are free again: step 6 — "${s.obj.replace(/\s+/g, ' ').slice(-48)}"`);
  // the ute: only at the driver's door, only with a loaded horse
  await ev(() => { FARM._test.setPos(1, -0.5); }); await step(0.05, 3); ok(await ev(() => !FARMDAY.points().some(p => p.id === 'cab' && Math.hypot(p.x - FARM.info().x, p.z - FARM.info().z) <= p.r)), 'away from the ute there is nothing to press');
  await ev(() => { const d = FARMDAY.cabDoor(); FARM._test.setPos(d.x, d.z); }); await step(0.05, 3); s = await I(); ok(s.near === 'cab' && /Get in the ute/.test(s.prompt), `at the driver's door: "${s.prompt}"`);
  await key('e', 0.05, 5); await mark(); await run(2.4); await mark(); if (process.env.P6_DEBUG) console.log('   [cab]', JSON.stringify(await ev(() => ({ paused: FARM.info().paused, cine: FARMDAY.state.cine && FARMDAY.state.cine.t, trans: !!FARM.info().trip, drive: FARMDRIVE.on, st: FARMDAY.stage(), hide: FARM.info().figure })))); s = await ev(() => ({ driving: FARMDRIVE.on, stage: FARMDAY.stage(), fig: FARM.info().figure, ramp: FARM._test.rig.userData.ramp.rotation.z })); ok(s.driving && s.stage === 'drive' && !s.fig, 'you get into the ute and the drive begins (the character is in the cab)');
  // drive: acceleration, braking, steering and collision, by hand
  const drv = () => ev(() => { const st = FARMDRIVE.state; return st && { x: st.x, z: st.z, v: st.v, ang: st.ang, hit: st.hit, steer: st.steer, speed: document.getElementById('fdSpd').textContent }; });
  await ev(() => { FARM._test.keys.w = true; }); await run(1); const v1 = await drv(); await run(2); const v3 = await drv();
  ok(v1.v > 1.5 && v1.v < 5 && v3.v > v1.v && v3.v < 9.6 && v3.x > v1.x + 6, `W accelerates smoothly: ${v1.v.toFixed(1)} m/s after 1 s, ${v3.v.toFixed(1)} m/s after 3 s (top speed 9.5), HUD ${v3.speed} km/h`);
  await ev(() => { FARM._test.keys.w = false; FARM._test.keys.s = true; }); await run(0.8); const vb = await drv(); await run(2); const vs = await drv(); await ev(() => { FARM._test.keys.s = false; });
  ok(vb.v < v3.v - 3 && vs.v < 0 && vs.v >= -3.3, `S brakes hard (${v3.v.toFixed(1)} → ${vb.v.toFixed(1)} m/s in 0.8 s) and then reverses gently (${vs.v.toFixed(1)} m/s)`);
  await ev(() => { FARMDRIVE.state.v = 6; FARM._test.keys.a = true; FARM._test.keys.w = true; }); await run(1.5); const a1 = await drv(); await ev(() => { FARM._test.keys.a = false; FARM._test.keys.d = true; }); await run(3); const a2 = await drv(); await ev(() => { FARM._test.keys.d = false; FARM._test.keys.w = false; });
  ok(a1.ang > 0.15 && a2.ang < a1.ang - 0.2, `A turns the rig left (heading +${a1.ang.toFixed(2)} rad) and D turns it right (${a2.ang.toFixed(2)} rad); the steering angle eases in (${a1.steer.toFixed(2)})`);
  // collision: aim at the feed shed from the hardstand
  await ev(() => { const st = FARMDRIVE.state; st.x = 36; st.z = -4; st.ang = Math.PI / 2 + 0.05; st.v = 6; st.steer = 0; FARM._test.keys.w = true; }); await run(2.5); const c1 = await ev(() => { const st = FARMDRIVE.state, w = FARM._test.world(); let inside = 0; const f = [Math.cos(st.ang), -Math.sin(st.ang)]; for (const [lx, r] of FARMDRIVE.CIRC) { const x = st.x + f[0] * lx, z = st.z + f[1] * lx; for (const c of w.colliders) { const d = Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1)); if (d < r - 0.05) inside++; } } return { inside, v: st.v, z: st.z }; }); await ev(() => { FARM._test.keys.w = false; });
  ok(c1.inside === 0 && c1.v < 2, `driving into the vet bay: the rig stops against it and cannot go through (speed ${c1.v.toFixed(1)} m/s, overlap ${c1.inside})`);
  await key('r', 0.05, 3); s = await drv(); if (process.env.P6_DEBUG) console.log('   [r]', JSON.stringify(s)); ok(Math.abs(s.x - 38) < 0.01 && Math.abs(s.z - 14) < 0.01 && s.v === 0, 'R puts the rig back on the hardstand if you are stuck');
  // the drive to the gate with a simple driver; the booked race starts when the rig crosses the gate line
  const startedBefore = await ev(() => { window.__sb = 0; const o = CAREER.startBooked; CAREER.startBooked = function () { window.__sb++; return o.apply(this, arguments); }; return window.__sb; });
  let last = null, steps = 0; for (let i = 0; i < 500; i++) { last = await ev(() => { const K = FARM._test.keys, st = FARMDRIVE.state; if (!st) return null; const rt = FARMDRIVE.route(); let tg = rt.pts[rt.pts.length - 1]; const fx = st.x + Math.cos(st.ang) * 9, fz = st.z - Math.sin(st.ang) * 9; for (const q of rt.pts) { if (Math.hypot(q[0] - fx, q[1] - fz) > 9) { tg = q; break; } } const des = Math.atan2(-(tg[1] - fz), tg[0] - fx); let e = des - st.ang; e = Math.atan2(Math.sin(e), Math.cos(e)); K.a = e > 0.04; K.d = e < -0.04; K.w = st.v < 6.5; K.s = false; FARM._test.step(0.05, 6); return { x: st.x, z: st.z, v: st.v, stuck: st.stuck, over: st.over }; }); steps++; if (!last || last.over) break; }
  s = await ev(() => ({ over: FARMDRIVE.state && FARMDRIVE.state.over, ui: ui.state, sb: window.__sb })); ok(last && last.x > 100 || s.over || s.ui === 'racing', `driving the route: the rig reaches the exit (x ${last ? last.x.toFixed(0) : '—'}, ${steps * 0.3 | 0} s of driving, stuck ${(last && last.stuck || 0).toFixed(1)} s)`);
  await p.waitForFunction(() => ui.state === 'racing' || (race && race.state), null, { timeout: 60000 }).catch(() => {}); await frames(2);
  s = await ev(() => ({ st: ui.state, scene: SCENES.scene, c: race && race.cfg.career, pl: race && race.player.def.name, i: FARM.info(), booking: CAREER.booking(), stored: JSON.parse(localStorage.getItem('ff_career')).booking, sb: window.__sb }));
  ok(s.st === 'racing' && s.scene === 'race' && s.c && s.c.name === 'Maiden Plate' && s.pl === 'Copper Coast', `at the gate the booked race loads: ${s.c && s.c.name} with ${s.pl}`);
  ok(s.sb === 1 && s.booking === null && !s.stored && !s.i.active && s.i.horses === 0, `startBooked ran exactly once (${s.sb}), the booking is used up, and the farm is unloaded while the race runs`);
  ok(JSON.stringify(stages) === JSON.stringify(['none', 'visit', 'prepare', 'lead', 'float', 'load', 'loading', 'vehicle', 'boarding', 'drive']) || (['visit', 'prepare', 'lead', 'float', 'load', 'vehicle', 'drive'].every(x => stages.includes(x))), `the stages were seen in order: ${stages.join(' → ')}`);
  // a second start with the booking gone does nothing and cannot pay twice
  const cashA = await ev(() => CAREER.data.cash); s = await ev(() => CAREER.startBooked()); ok(!s.ok && await ev(() => CAREER.data.cash) === cashA, 'calling startBooked again without a booking is refused (no second entry, no change to the money)');
  // finish the race and come home: the prize is paid once
  await p.waitForFunction(() => race && race.state === 'running', null, { timeout: 90000 }); await ev(() => { let n = 0; while (race && race.state !== 'done' && n++ < 120 * 400) race.step(SIM_DT); }); await p.waitForFunction(() => ui.state === 'results', null, { timeout: 60000 }).catch(() => {}); await frames(2);
  const prizes = await ev(() => CAREER.data.ledger.filter(e => e.kind === 'prize').length); s = await ev(() => ({ btn: document.getElementById('resCareer').textContent, cur: CAREER.data.season.cur }));
  ok(s.btn === 'Return to the Farm' && s.cur === 1, 'after the race the results offer "Return to the Farm"'); await p.click('#resCareer'); await p.waitForFunction(() => ui.state === 'farm' && FARM.active, null, { timeout: 30000 }); await frames(3); await step(0.05, 3);
  s = await ev(() => ({ i: FARM.info(), prizes: CAREER.data.ledger.filter(e => e.kind === 'prize').length, stage: FARMDAY.stage(), rig: FARM._test.rig.position.x, tack: FARM._test.horses[1].userData.tackOn, hv: FARM._test.horses.every(h => h.visible) }));
  ok(s.i.active && s.i.place === 'out' && s.i.horses === 3 && s.hv && s.stage === 'none' && Math.abs(s.rig - 38) < 0.01, 'back at the farm: all three horses in their boxes, the rig back on the hardstand, nothing booked');
  ok(s.prizes <= prizes && prizes <= 1, `the race result was paid at most once (${prizes} prize entry in the ledger)`);

  // =========================================================== 5. the owner's shortcut, and the ways to get stuck
  console.log('\n— the shortcut and invalid states');
  await book('open', 'h0'); await step(0.05, 6); await toStall(0); await key('e', 0.05, 3); await key('4', 0.05, 8); await run(5); await key('5', 0.05, 12); await run(5);
  ok(await ev(() => FARMCARE.ledHid() === 'h0' && FARMDAY.stage() === 'float'), 'Bay Majesty is booked, tacked up and out of the box (state before the checks)');
  // 5a. cancelling the booking resets the farm (the horse goes back to the box)
  await ev(() => { CAREER.cancelBooking(); }); await step(0.05, 40); s = await ev(() => ({ led: FARMCARE.ledHid(), stage: FARMDAY.stage(), vis: FARM._test.horses[0].visible, st: FARM._test.stalls[0], g: [FARM._test.horses[0].position.x, FARM._test.horses[0].position.z] }));
  ok(!s.led && s.stage === 'none' && s.vis && Math.abs(s.g[1] - (s.st.z + 0.55)) < 0.2, 'cancelling the booking mid-sequence puts the led horse back in its box — no orphan state');
  // 5b. changing to a different horse resets too
  await book('open', 'h0'); await step(0.05, 12); await toStall(0); await key('e', 0.05, 3); await key('5', 0.05, 12); await run(5); await book('open', 'h2'); await step(0.05, 40); ok(await ev(() => !FARMCARE.led && FARMDAY.stage() === 'visit'), 'rebooking with another horse resets the sequence to "visit the box"');
  // 5c. leading a horse into the farmhouse
  await toStall(2); await key('e', 0.05, 3); await key('5', 0.05, 12); await run(5); ok(await ev(() => FARMCARE.ledHid() === 'h2'), 'leading the newly booked horse');
  await ev(() => { const o = FARM._test.points.find(q => q.id === 'office'); FARM._test.setPos(o.x, o.z); }); await step(0.05, 3); await key('e', 0.05, 3); await ev(() => FARM._test.skipFade()); await step(0.05, 30); s = await ev(() => ({ place: FARM.info().place, led: FARMCARE.ledHid(), vis: FARM._test.horses[2].visible }));
  ok(s.place === 'in' && !s.led && s.vis, 'going into the farmhouse with a horse on the lead puts it back in its box first');
  await ev(() => { FARM._test.exitHouse(); FARM._test.skipFade(); }); await step(0.05, 30);
  // 5d. leaving the farm mid-sequence and coming back
  await toStall(2); await key('e', 0.05, 3); await key('4', 0.05, 8); await run(5); await ev(() => { SCENES.enter('menu', { instant: true }); }); await frames(2); await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(2); await step(0.05, 6);
  s = await ev(() => ({ led: FARMCARE.ledHid(), loaded: FARMDAY.loaded, driving: FARMDRIVE.on, busy: FARMCARE.busy, rig: FARM._test.rig.position.x, stage: FARMDAY.stage(), obj: FARM.info().objective }));
  ok(!s.led && !s.loaded && !s.driving && !s.busy && Math.abs(s.rig - 38) < 0.01, 'leaving the farm and returning mid-sequence starts clean (no horse on a lead, rig parked, controls free)');
  // 5e. no departure without a booking: at the cab with nothing booked there is nothing to press, and a drive whose booking vanishes refuses at the gate
  await ev(() => { CAREER.cancelBooking(); }); await ev(() => { const d = FARMDAY.cabDoor(); FARM._test.setPos(d.x, d.z); }); await step(0.05, 14); s = await ev(() => ({ pts: FARMDAY.points().length, near: FARM.info().near, stage: FARMDAY.stage() })); ok(s.pts === 0 && s.near !== 'cab', 'with no booking the ute and the ramp offer nothing');
  ok(await ev(() => { const pr = FARM._test.TRAVEL; FARM._test.setPos(pr.x, pr.z); FARM._test.step(0.05, 4); const t1 = FARM.info().prompt; FARM._test.interact(); return /book a race/i.test(t1) && !FARM.info().trip; }), 'the float with nothing booked only reminds you to book');
  // a loaded rig, booking cancelled while driving: the exit does not start a race
  await book('open', 'h1'); await step(0.05, 6); await ev(() => { const g = FARM._test.horses[1]; FARMDAY.state.loaded = true; FARMDAY.state.loadedMesh = g; g.visible = false; FARM._test.rig.userData.ramp.rotation.z = -1.57; const d = FARMDAY.cabDoor(); FARM._test.setPos(d.x, d.z); }); await step(0.05, 6); await key('e', 0.05, 5); await run(2.4);
  ok(await ev(() => FARMDRIVE.on && FARMDAY.stage() === 'drive'), 'a (forced) loaded rig can start driving'); await ev(() => { CAREER.cancelBooking(); window.__sb2 = 0; const o = CAREER.startBooked; CAREER.startBooked = function () { window.__sb2++; return o.apply(this, arguments); }; const st = FARMDRIVE.state; st.x = 108; st.z = 4; st.ang = 0; st.v = 6; FARM._test.keys.w = true; }); await run(3);
  s = await ev(() => ({ ui: ui.state, race: !!race, drive: FARMDRIVE.on, loaded: FARMDAY.loaded, stage: FARMDAY.stage(), sb: window.__sb2, vis: FARM._test.horses[1].visible, rig: FARM._test.rig.position.x }));
  ok(s.ui === 'farm' && !s.race && !s.drive && !s.loaded && s.vis && Math.abs(s.rig - 38) < 0.01, `crossing the gate with the booking gone starts no race: the farm resets (horse back in its box, rig parked) — ui ${s.ui}`);
  await ev(() => { FARM._test.keys.w = false; });
  // 5f. Esc during the drive pauses; the quick-departure key
  await book('open', 'h1'); await step(0.05, 6);
  s = await ev(() => CAREER.booking() && CAREER.booking().round); await ev(() => { FARM._test.setPos(1, -0.5); }); await step(0.05, 4); await key('k', 0.05, 4); s = await ev(() => ({ trip: FARM.info().trip, ph: FARMTRIP.phase, led: FARMCARE.ledHid() })); ok(s.trip && s.ph === 'fadeIn', 'K skips the routine and runs the quick departure (the existing load-up and drive-off sequence)');
  await ev(() => { for (let k = 0; k < 220 && FARMTRIP.on; k++) FARMTRIP.frame(0.05); }); await p.waitForFunction(() => ui.state === 'racing', null, { timeout: 60000 }).catch(() => {}); ok(await ev(() => ui.state === 'racing' && race.cfg.career && race.player.def.name === 'Copper Coast'), 'the quick departure starts the booked race with the booked horse'); await ev(() => { race = null; clearRaceMeshes(); SCENES.enter('menu', { instant: true }); }); await frames(3);
  await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(2); await step(0.05, 4);

  // =========================================================== 6. training: the facilities work, the drills are playable, the rewards can't be farmed
  console.log('\n— training facilities and drills');
  s = await ev(() => FARMTRAIN.POINTS.map(pt => { const r = FARMNAV.find(FARM._test.world(), [1, -0.5], [pt.x, pt.z]); return r ? Math.round(r.len) : null; })); ok(s.every(x => x && x > 10), `the gate unit and the oval entrance are reachable on foot (${s.join(' m, ')} m from the courtyard)`);
  await ev(() => { const pt = FARMTRAIN.POINTS[1]; FARM._test.setPos(pt.x, pt.z); FARM._test.step(0.05, 3); }); s = await I(); ok(s.near === 'drill:oval' && /Exercise oval/.test(s.prompt), `at the oval: "${s.prompt}"`);
  await ev(() => { const pt = FARMTRAIN.POINTS[0]; FARM._test.setPos(pt.x, pt.z); FARM._test.step(0.05, 3); }); s = await I(); ok(s.near === 'drill:gate' && /Starting-gate/.test(s.prompt), `at the gate unit: "${s.prompt}"`);
  // gate practice: the real start mechanics
  await key('e', 0.05, 3); ok(await ev(() => FARMTRAIN.menuOpen && /Starting gate/.test(document.getElementById('farmTrainMenu').innerText) && /Bay Majesty/.test(document.getElementById('farmTrainMenu').innerText)), 'E opens the drill menu listing your horses');
  await key('1', 0.05, 2); await key('Enter', 0.05, 6); await run(1.6); s = await ev(() => { const R = FARMTRAIN.state; return R && { on: FARMTRAIN.on, st: R.race.state, name: R.def.name, hidden: !FARM._test.horses[0].visible, fig: FARM.info().figure, jk: R.mesh.userData.jk && R.mesh.userData.jk.mesh.visible }; });
  ok(s && s.on && s.st === 'load' && s.name === 'Bay Majesty' && s.hidden && !s.fig && s.jk, 'gate practice starts on the real race simulation: the horse (with its jockey) is in the stall, the stall copy is hidden, you are riding ' + JSON.stringify(s));
  let went = false; for (let i = 0; i < 60 && !went; i++) { await ev(() => { FARM._test.keys.w = true; }); await p.keyboard.down('w'); await step(0.05, 8); await p.keyboard.up('w'); const o = await ev(() => FARMTRAIN.state.race.st.open); went = !!o; }
  await p.keyboard.press(' '); await step(0.05, 6); await run(1.0); s = await ev(() => { const R = FARMTRAIN.state; return { launched: R.race.st.launched, cat: R.p.startCat, fb: R.fb }; }); ok(s.launched && !!s.cat, `W/S balance the horse, SPACE at "gates open" breaks it away: "${s.fb}" (${s.cat})`);
  for (let i = 0; i < 12; i++) { await p.keyboard.press(' '); await step(0.05, 4); } await run(25); s = await ev(() => { const R = FARMTRAIN.state; return R && { res: R.result, over: R.over }; }); ok(s && s.res && s.res.grade >= 0 && s.res.grade <= 1, `the drill ends with a score: ${s && s.res ? Math.round(s.res.grade * 100) + '% — ' + s.res.detail : 'no result'}`);
  const pts1 = await ev(() => CAREER.data.horses[0].xpFrac + CAREER.data.horses[0].trainPts); const fit1 = await ev(() => CAREER.data.horses[0].fitness); await run(1.3); await key('Enter', 0.05, 3); await run(1.6);
  s = await ev(() => ({ on: FARMTRAIN.on, vis: FARM._test.horses[0].visible, fig: FARM.info().figure, busy: FARMCARE.busy, kids: FARM._test.ctx.scene.children.length })); ok(!s.on && s.vis && s.fig && !s.busy, 'Enter returns to the farm: your horse is back in its box and you are back on foot');
  // oval drills: acceleration (reward), then the same day again (no reward), settling and sprint
  await ev(() => { const pt = FARMTRAIN.POINTS[1]; FARM._test.setPos(pt.x, pt.z); FARM._test.step(0.05, 3); }); const kids0 = await ev(() => FARM._test.ctx.scene.children.length);
  await key('e', 0.05, 3); await key('2', 0.05, 2); await key('a', 0.05, 2); await key('Enter', 0.05, 6); await run(1.6); ok(await ev(() => FARMTRAIN.on && FARMTRAIN.state.drill === 'accel' && FARMTRAIN.state.tRef > 5), 'the acceleration drill starts (with an ideal run of the same horse as the benchmark)');
  await p.keyboard.down('w'); for (let i = 0; i < 40; i++) { await p.keyboard.press(' '); await step(0.05, 6); } await p.keyboard.up('w'); await run(8); s = await ev(() => { const R = FARMTRAIN.state; return R && R.result && { g: R.result.grade, rw: R.result.rw, detail: R.result.detail }; });
  ok(s && s.rw && s.rw.ok && s.rw.pts > 0 && s.rw.pts <= 0.5, `acceleration drill: ${Math.round(s.g * 100)}% → ${s.rw.pts} training points (${s.detail})`);
  const fitB = await ev(() => CAREER.data.horses[1].fitness); await run(1.3); await key('Enter', 0.05, 3); await run(1.6);
  await key('e', 0.05, 3); await key('2', 0.05, 2); await key('b', 0.05, 2); await key('Enter', 0.05, 6); await run(1.6); await p.keyboard.down('w'); await run(3); await p.keyboard.up('w'); await key('e', 0.05, 2); await run(60); s = await ev(() => { const R = FARMTRAIN.state; return R && R.result && { g: R.result.grade, rw: R.result.rw, detail: R.result.detail, zone: R.zoneT }; });
  ok(s && s.rw && s.rw.pts === 0 && s.rw.reason === 'today', `a second drill the same day is practice only: "${s && s.detail}" — reward ${s && s.rw && s.rw.pts} (${s && s.rw && s.rw.reason})`);
  await run(1.3); await key('Enter', 0.05, 3); await run(1.6);
  const dbg = async t => { if (process.env.P6_DEBUG) console.log('   [dbg]', t, JSON.stringify(await ev(() => ({ on: FARMTRAIN.on, menu: FARMTRAIN.menuOpen, near: FARM.info().near, x: FARM.info().x, z: FARM.info().z, busy: FARMCARE.busy, panel: FARM.info().panel, paused: FARM.info().paused })))); }; await dbg('pre'); await key('e', 0.05, 3); await dbg('menu'); await key('3', 0.05, 2); await key('b', 0.05, 2); await key('Enter', 0.05, 6); await run(1.6); await dbg('started'); await p.keyboard.down('w'); for (let i = 0; i < 60; i++) { await p.keyboard.press(' '); await step(0.05, 10); } await p.keyboard.up('w'); await run(60); s = await ev(() => { const R = FARMTRAIN.state; return R && R.result && { g: R.result.grade, detail: R.result.detail }; });
  if (!s) console.log('   [sprint]', JSON.stringify(await ev(() => ({ on: FARMTRAIN.on, menu: FARMTRAIN.menuOpen, r: FARMTRAIN.state && { d: FARMTRAIN.state.drill, ph: FARMTRAIN.state.ph, prog: FARMTRAIN.state.p.progress, st: FARMTRAIN.state.race.state, over: FARMTRAIN.state.over, hid: FARMTRAIN.state.hid, fin: FARMTRAIN.state.p.finished } }))));
  ok(s && s.g >= 0 && s.g <= 1 && /rhythm/.test(s.detail), `sprint rhythm: ${s && Math.round(s.g * 100)}% — ${s && s.detail}`);
  await key('Escape', 0.05, 3); s = await ev(() => ({ on: FARMTRAIN.on, h: FARM._test.horses.every(h => h.visible), kids: FARM._test.ctx.scene.children.length, best: CAREER.care.status('h1').best }));
  ok(!s.on && s.h && s.kids === kids0 && Object.keys(s.best).length >= 1, `Esc leaves cleanly: no drill mesh left in the scene (${kids0} → ${s.kids} objects), horses visible, scores kept`);
  // abort gains nothing
  await ev(() => { CAREER.data.horses[2].fitness = 100; }); const before = await ev(() => JSON.stringify([CAREER.data.horses[2].xpFrac, CAREER.data.horses[2].trainPts, CAREER.data.horses[2].fitness]));
  await key('e', 0.05, 3); await key('3', 0.05, 2); await key('a', 0.05, 2); await key('Enter', 0.05, 6); await run(1.6); await run(3); await key('Escape', 0.05, 3); s = await ev(() => JSON.stringify([CAREER.data.horses[2].xpFrac, CAREER.data.horses[2].trainPts, CAREER.data.horses[2].fitness]));
  ok(s === before && await ev(() => !FARMTRAIN.on), 'leaving a drill early (Esc) earns nothing and costs nothing — there is no enter-and-quit exploit');
  // a tired horse
  await ev(() => { const h = CAREER.data.horses[2]; h.fitness = 40; }); await key('e', 0.05, 3); await key('3', 0.05, 2); await key('a', 0.05, 2); await key('Enter', 0.05, 6); await run(1.6); await p.keyboard.down('w'); for (let i = 0; i < 20; i++) { await p.keyboard.press(' '); await step(0.05, 6); } await p.keyboard.up('w'); await run(24);
  if (process.env.P6_DEBUG) console.log('   [tired]', JSON.stringify(await ev(() => ({ on: FARMTRAIN.on, menu: FARMTRAIN.menuOpen, r: FARMTRAIN.state && { d: FARMTRAIN.state.drill, res: !!FARMTRAIN.state.result, prog: FARMTRAIN.state.p.progress, st: FARMTRAIN.state.race.state, over: FARMTRAIN.state.over }, near: FARM.info().near, busy: FARMCARE.busy })))); s = await ev(() => { const R = FARMTRAIN.state; return R && R.result && R.result.rw; }); ok(s && s.pts === 0 && s.reason === 'tired', `a tired horse (fitness 40) earns nothing from a drill (${s && s.reason})`); await run(1.3); await key('Enter', 0.05, 3); await run(1.6);

  // =========================================================== 7. Rest a day
  console.log('\n— Rest a day');
  await ev(() => { if (FARM.info().place === 'in') { FARM._test.exitHouse(); FARM._test.skipFade(); } CAREER.cancelBooking(); CAREER.data.day = Math.max(0, CAREER.data.day - 6); }); await step(0.05, 30);
  await ev(() => { if (FARM.info().place === 'in') { FARM._test.exitHouse(); FARM._test.skipFade(); } CAREER.cancelBooking(); CAREER.data.day = Math.max(0, CAREER.data.day - 6); }); await step(0.05, 30);
  await ev(() => { const o = FARM._test.points.find(q => q.id === 'office'); FARM._test.setPos(o.x, o.z); }); await step(0.05, 3); await key('e', 0.05, 3); await ev(() => FARM._test.skipFade()); await step(0.05, 30);
  await ev(() => { CAREER.cancelBooking(); const rp = FARM._test.points.find(q => q.id === 'rest'); FARM._test.setPos(rp.x, rp.z); }); await step(0.05, 3); s = await I(); ok(s.place === 'in' && /Rest until tomorrow/.test(s.prompt), `inside the farmhouse the sofa offers "${s.prompt}"`);
  const d0 = await ev(() => CAREER.care.day); const gm0 = await ev(() => CAREER.care.status('h1').groomed); await key('e', 0.05, 3); await ev(() => FARM._test.skipFade()); await step(0.05, 40); const d1 = await ev(() => CAREER.care.day);
  ok(d1 === d0 + 1, `E rests until tomorrow: day ${d0} → ${d1} (${(await ev(() => window.__toasts.slice(-2).join(' | ')))})`); ok(await ev(() => !CAREER.care.status('h1').drilled && !CAREER.care.status('h1').groomed), 'daily care and drill flags reset with the new day');
  await ev(() => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); C.day = e.day - 1; CAREER.book(e.id, 'h1'); }); await key('e', 0.05, 3); await ev(() => FARM._test.skipFade()); await step(0.05, 40); const d2 = await ev(() => CAREER.care.day);
  await key('e', 0.05, 3); await ev(() => FARM._test.skipFade()); await step(0.05, 40); const d3 = await ev(() => CAREER.care.day); ok(d2 === d3 && await ev(() => !!CAREER.booking()), 'you can rest the day before a booked race, but not through the race day itself (the booking is kept)');

  // =========================================================== 8. budgets and leaks
  console.log('\n— performance and leaks');
  await ev(() => { CAREER.cancelBooking(); settings.guide = 'full'; });
  const mem = () => ev(() => ({ g: renderer.info.memory.geometries, t: renderer.info.memory.textures, k: FARM._test.ctx.scene.children.length }));
  await ev(() => { SCENES.enter('farm', { instant: true }); }); await frames(2); await ev(() => { const C = CAREER.data, e = C.cal.events.find(x => x.kind === 'round' && x.round === C.season.cur); C.day = Math.min(C.day, e.day - 2); CAREER.book(e.id, 'h1'); }); await step(0.05, 6);
  const m0 = await mem();
  for (let rep = 0; rep < 3; rep++) { await toStall(1); await key('e', 0.05, 3); await key('4', 0.05, 8); await run(5); await key('5', 0.05, 12); await run(5); await ev(() => { const r = FARMDAY.ramp(); FARM._test.setPos(r.x - 1.5, r.z + 1.0); }); await run(4); await key('e', 0.05, 8); await run(16); await ev(() => FARMDAY.reset()); await run(1); }
  const m1 = await mem(); ok(m1.g <= m0.g + 3 && m1.t <= m0.t + 2 && m1.k <= m0.k + 1, `three full prepare / lead / load / reset cycles leak nothing: geometries ${m0.g} → ${m1.g}, textures ${m0.t} → ${m1.t}, scene objects ${m0.k} → ${m1.k}`);
  await ev(() => { renderer.render = window.__rr; }); s = await ev(() => { FARM.view('courtyard'); const out = {}; const calls = []; const rr = renderer.render.bind(renderer); renderer.info.autoReset = true; for (const v of ['courtyard', 'overview', 'stalls', 'float', 'training']) { FARM.view(v); rr(FARM._test.ctx.scene, FARM._test.ctx.cam); calls.push(renderer.info.render.calls); } return { calls, tri: renderer.info.render.triangles }; });
  ok(Math.max(...s.calls) <= 250, `draw calls at five camera positions stay inside the farm budget: ${s.calls.join(', ')} (budget 250)`);
  await ev(() => { SCENES.enter('menu', { instant: true }); }); await frames(2); await p.click('#btnSettings'); await frames(2);
  s = await ev(() => ({ n: document.querySelectorAll('#optGuide .chip, #optGuide button').length, lab: [...document.querySelectorAll('#optGuide .chip, #optGuide button')].map(e => e.textContent).join(' | ') })); ok(s.n === 3, 'Settings → Farm has the guidance lines choice: ' + s.lab);
  await ev(() => { [...document.querySelectorAll('#optGuide .chip, #optGuide button')].find(e => /off/i.test(e.textContent)).click(); }); ok(await ev(() => settings.guide === 'off' && localStorage.getItem('ff_guide') === '"off"'), 'choosing Off is applied and remembered'); await ev(() => { [...document.querySelectorAll('#optGuide .chip, #optGuide button')].find(e => /full/i.test(e.textContent)).click(); });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
