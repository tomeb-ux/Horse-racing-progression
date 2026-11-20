// Three browser sessions in one room: Alice falls mid-race (test hook — run the server with FF_TEST_HOOKS=1) and should
// spectate the riders still racing, switching with D; the results list all three riders with Alice as DNF.
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`, SHOTS = process.env.SHOTS;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 900, height: 520 } });
    if (fs.existsSync(__dirname + '/../public/vendor/three.min.js')) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
    await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p; };
  const A = await mk(), B = await mk(), C = await mk();
  await A.goto(BASE); await sleep(1200); await A.click('#btnMP'); await A.fill('#mpName', 'Alice'); await A.click('#mpCreate');
  await A.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.getElementById('mpCodeBig').textContent));
  const code = await A.$eval('#mpCodeBig', e => e.textContent);
  for (const [p, nm] of [[B, 'Bob'], [C, 'Cara']]) { await p.goto(BASE + '?join=' + code); await sleep(1200); await p.fill('#mpName', nm); await p.click('#mpJoin'); await p.waitForFunction(() => MP.lobby && MP.slot >= 0); }
  for (const p of [A, B, C]) await p.waitForFunction(() => MP.lobby && MP.lobby.players.filter(Boolean).length === 3 && document.querySelectorAll('#mpHorses .chip').length === 12);
  console.log('lobby cards:', await A.$$eval('#mpPlayers .mp-p', els => els.map(e => e.querySelector('b').textContent).join(' | ')));
  console.log('runner options (host):', await A.$$eval('#mpSettings .opt-row:nth-child(3) .chip', els => els.map(e => e.textContent).join(' · ')));
  await A.evaluate(() => [...document.querySelectorAll('#mpSettings .chip')].find(c => c.textContent === '1000m').click()); await sleep(400);
  if (SHOTS) await A.screenshot({ path: SHOTS + '/spec_lobby.png' });
  for (const p of [A, B, C]) { await p.click('#mpReady'); await sleep(300); }
  console.log('status:', await A.$eval('#mpStatus', e => e.textContent));
  await A.click('#mpStart');
  for (const p of [A, B, C]) { await p.waitForFunction(() => ui.state === 'racing' && MP.racing, null, { timeout: 15000 }); await p.evaluate(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; }); }
  for (const p of [A, B, C]) await p.evaluate(() => { window.__iv = setInterval(() => { if (!race || !MP.racing || ui.state !== 'racing') return; const S = race.st; if (race.state !== 'running') keys[' '] = S.m < S.z; else if (keys[' ']) { keys[' '] = false; spaceReleased(); } if (race.state === 'running' && !window.__p) { window.__p = 1; setTimeout(spacePressed, 250); } riderInput.effort = race.clock > 3 ? 0.8 : 0.9; }, 16); });
  console.log('A sees rivals:', await A.evaluate(() => MP.rivals.map(k => race.horses[k].mpName).join(', ')), '· tags', await A.evaluate(() => document.querySelectorAll('.mp-tag').length));
  await A.waitForFunction(() => race.state === 'running' && race.clock > 10, null, { timeout: 120000 });
  await A.evaluate(() => MP.ws.send(JSON.stringify({ type: 'debugFall' })));
  await A.waitForFunction(() => race.player.fallen, null, { timeout: 5000 }); console.log('Alice is down; camera on her fall first:', await A.evaluate(() => MP.camHorse() === race.player));
  await A.waitForFunction(() => MP.spec, null, { timeout: 8000 });
  const camDist = () => A.evaluate(() => { const h = MP.camHorse(); return Math.hypot(camera.position.x - h.pos.x, camera.position.z - h.pos.z).toFixed(1); });
  await sleep(800);
  const s1 = await A.evaluate(() => MP.spec.mpName); console.log('spectating', s1, '· banner:', await A.$eval('#mpSpec', e => e.textContent), '· camera', await camDist(), 'm from that horse');
  if (SHOTS) { await A.evaluate(() => { renderer.render = window.__rr; }); await sleep(700); await A.screenshot({ path: SHOTS + '/spec_view1.png' }); }
  await A.keyboard.down('d'); await sleep(120); await A.keyboard.up('d'); await sleep(900);
  const s2 = await A.evaluate(() => MP.spec && MP.spec.mpName); console.log('after D: spectating', s2, '· switched', s1 !== s2, '· camera', await camDist(), 'm from that horse');
  if (SHOTS) { await sleep(300); await A.screenshot({ path: SHOTS + '/spec_view2.png' }); await A.evaluate(() => { renderer.render = () => {}; }); }
  for (const p of [A, B, C]) await p.waitForFunction(() => ui.state === 'results' || ui.state === 'replay', null, { timeout: 240000 });
  for (const p of [A, B, C]) await p.evaluate(() => { clearInterval(window.__iv); if (ui.state === 'replay') endReplay(); });
  await sleep(500);
  for (const [nm, p] of [['A', A], ['B', B], ['C', C]]) console.log(nm, 'result line:', await p.$eval('#resMPLine', e => e.textContent));
  const ord = p => p.evaluate(() => race.finishOrder.map(h => h.def.name).join('|'));
  const oa = await ord(A); console.log('identical order on all three:', oa === await ord(B) && oa === await ord(C));
  for (const [nm, p] of [['A', A], ['B', B], ['C', C]]) console.log('page errors', nm, p.errs.length ? p.errs : 'none');
  await b.close();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
