// Two browsers; both riders fall (test hook — server with FF_TEST_HOOKS=1): both must spectate the leading AI horse
// while the race runs on to an AI winner, then get identical results.
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`, SHOTS = process.env.SHOTS;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 900, height: 520 } });
    await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
    await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p; };
  const A = await mk(), B = await mk();
  await A.goto(BASE); await sleep(1200); await A.click('#btnMP'); await A.fill('#mpName', 'Alice'); await A.click('#mpCreate');
  await A.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.getElementById('mpCodeBig').textContent));
  const code = await A.$eval('#mpCodeBig', e => e.textContent);
  await B.goto(BASE + '?join=' + code); await sleep(1200); await B.fill('#mpName', 'Bob'); await B.click('#mpJoin');
  for (const p of [A, B]) await p.waitForFunction(() => MP.lobby && MP.lobby.players.filter(Boolean).length === 2 && document.querySelectorAll('#mpHorses .chip').length === 12);
  await A.evaluate(() => [...document.querySelectorAll('#mpSettings .chip')].find(c => c.textContent === '1000m').click()); await sleep(300);
  await A.evaluate(() => [...document.querySelectorAll('#mpSettings .opt-row')].find(r => /Chaos/.test(r.textContent)).querySelectorAll('.chip')[1].click()); await sleep(400);
  console.log('chaos row on both screens:', await A.evaluate(() => MP.lobby.settings.chaos), await B.evaluate(() => MP.lobby.settings.chaos), '· guest chips disabled:', await B.evaluate(() => [...document.querySelectorAll('#mpSettings .opt-row')].find(r => /Chaos/.test(r.textContent)).querySelector('.chip').disabled));
  // back off chaos for this test (so the AI pack isn't all brought down with the riders) — leader spectating is the point here
  await A.evaluate(() => [...document.querySelectorAll('#mpSettings .opt-row')].find(r => /Chaos/.test(r.textContent)).querySelectorAll('.chip')[0].click()); await sleep(300);
  for (const p of [A, B]) { await p.click('#mpReady'); await sleep(300); }
  await A.click('#mpStart');
  for (const p of [A, B]) { await p.waitForFunction(() => ui.state === 'racing' && MP.racing, null, { timeout: 15000 }); await p.evaluate(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; }); }
  for (const p of [A, B]) await p.evaluate(() => { window.__iv = setInterval(() => { if (!race || !MP.racing) return; riderInput.effort = 0.8; if (race.state === 'running' && !window.__p) { window.__p = 1; setTimeout(spacePressed, 250); } }, 16); });
  await A.waitForFunction(() => race.state === 'running' && race.clock > 9, null, { timeout: 120000 });
  for (const p of [A, B]) await p.evaluate(() => MP.ws.send(JSON.stringify({ type: 'debugFall' })));
  for (const p of [A, B]) await p.waitForFunction(() => MP.spec, null, { timeout: 10000 });
  await sleep(600);
  for (const [nm, p] of [['A', A], ['B', B]]) console.log(nm, 'spectating:', await p.evaluate(() => MP.spec.def.name + ' · AI ' + !MP.spec.mpName + ' · leader ' + (race.order.find(h => !h.dnf && !h.finished) === MP.spec)), '· banner:', await p.$eval('#mpSpec', e => e.textContent));
  if (SHOTS) { await A.evaluate(() => { renderer.render = window.__rr; }); await sleep(800); await A.screenshot({ path: SHOTS + '/leader_spec.png' }); await A.evaluate(() => { renderer.render = () => {}; }); }
  for (const p of [A, B]) await p.waitForFunction(() => ui.state === 'results' || ui.state === 'replay', null, { timeout: 240000 });
  for (const p of [A, B]) await p.evaluate(() => { clearInterval(window.__iv); if (ui.state === 'replay') endReplay(); });
  await sleep(500);
  for (const [nm, p] of [['A', A], ['B', B]]) console.log(nm, 'result line:', await p.$eval('#resMPLine', e => e.textContent), '· winner', await p.evaluate(() => race.finishOrder[0] && race.finishOrder[0].def.name));
  for (const [nm, p] of [['A', A], ['B', B]]) console.log('page errors', nm, p.errs.length ? p.errs : 'none');
  await b.close();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
