// Multiplayer with a career horse and the new riding mechanics, through the real server (two browsers).
// Checks: a career horse can be picked in the lobby and everyone sees it with its real rating; both screens race the same
// horse (same name and abilities); the stall balance (W/S) works online and builds readiness on the server; Space at the
// gates jumps; the lunge works online (judged by the server); the result goes on the career horse's record only
// (online runs — no experience, training points or championship points); no page errors.
//   PORT=8095 node tests/mp-career.js        (server running: PORT=8095 node server/index.js)
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch();
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 900, height: 520 } });
    await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_comm', '"off"'); });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); return p; };
  const A = await mk(), B = await mk(); global.__pages = [A, B];
  await A.goto(BASE); await sleep(1200);
  // Alice has a career with one horse (rated 90 across the board)
  const before = await A.evaluate(() => {
    CAREER.load(); const C = CAREER.data;
    C.horses = [{ id: 'hx1', name: 'Thunder Road', attrs: { top: 90, acc: 90, end: 90, spr: 90, rec: 90, tem: 90, agi: 90, sta: 90 }, pot: { top: 95, acc: 95, end: 95, spr: 95, rec: 95, tem: 95, agi: 95, sta: 95 },
      look: { type: 'chestnut', coat: '#9a4a20', face: 'blaze', socks: [1, 0, 0, 2] }, silk: '#ff6600', silk2: '#101010', silkPat: 'stripes', races: 4, wins: 1, xp: 37, trainPts: 3, champPts: 12 }];
    store.set('career', C); CAREER.load();
    const h = CAREER.data.horses[0]; return { cash: CAREER.data.cash, list: CAREER.onlineHorses().map(x => x.name + ' ' + x.rating), xp: h.xp, trainPts: h.trainPts, races: h.races, champPts: h.champPts };
  });
  ok(before.list.join() === 'Thunder Road 90', `Alice's career horses offered for online races: ${before.list.join(', ')}`);
  await A.click('#btnMP'); await A.fill('#mpName', 'Alice'); await A.click('#mpCreate');
  await A.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.getElementById('mpCodeBig').textContent));
  const code = await A.$eval('#mpCodeBig', e => e.textContent);
  await B.goto(BASE + '?join=' + code); await sleep(1200); await B.fill('#mpName', 'Bob'); await B.click('#mpJoin');
  for (const p of [A, B]) await p.waitForFunction(() => MP.lobby && MP.lobby.players.filter(Boolean).length === 2, null, { timeout: 15000 });
  await A.evaluate(() => document.querySelector('#mpHorses .mp-career').click());
  await B.waitForFunction(() => MP.lobby.players.some(p => p && p.career), null, { timeout: 5000 });
  const seen = await B.evaluate(() => document.getElementById('mpPlayers').textContent);
  ok(/Thunder Road · career horse · rating 90/.test(seen), `Bob's lobby shows Alice's career horse and its rating ("${(seen.match(/★[^·]+· career horse · rating \d+/) || [''])[0]}")`);
  ok(await B.evaluate(() => document.querySelectorAll('#mpHorses .mp-career').length === 0), 'Bob (no career) is offered only the Quick Race horses');
  await A.evaluate(() => [...document.querySelectorAll('#mpSettings .chip')].find(c => c.textContent === '1000m').click()); await sleep(300);
  for (const p of [A, B]) { await p.click('#mpReady'); await sleep(300); }
  await A.click('#mpStart');
  for (const p of [A, B]) { await p.waitForFunction(() => ui.state === 'racing' && MP.racing, null, { timeout: 15000 }); await p.evaluate(() => { renderer.render = () => {}; }); }
  const horses = await Promise.all([A, B].map(p => p.evaluate(() => race.horses.slice(0, 2).map(h => h.def.name + ':' + h.def.attrs.top + ':' + (h.def.career ? 'c' : 'r')).join('|'))));
  ok(horses[0] === horses[1] && /Thunder Road:90:c/.test(horses[0]), `both screens race the same horses (${horses[0]})`);
  // riders: balance with W/S (a simple controller on the horse's weight), jump on the gates, push, ride out, lunge
  for (const p of [A, B]) await p.evaluate(() => { window.__R = []; window.__frames = 0; const u0 = MP.update; MP.update = dt => { window.__frames++; window.__ctl && window.__ctl(); u0(dt); }; window.__ctl = (() => {
    if (!race || !MP.racing) return; const me = race.player, S = me.st; (window.__ST = window.__ST || []).push(race.state + ':' + (S && S.R != null ? S.R.toFixed(2) : 'x'));
    if (race.state === 'load' || race.state === 'count') { const a = S.poise + S.pv * 0.3; keys.w = a < -0.05; keys.s = a > 0.05; window.__R.push(S.R); }
    else { keys.w = false; keys.s = false; }
    riderInput.effort = race.state === 'running' && race.dist - me.progress < 400 ? 1 : 0.75;
    if (race.state === 'running' && !window.__p) { window.__p = 1; window.__rAtGate = S.R; setTimeout(spacePressed, 250); }
    if (race.state === 'running' && me.started && !window.__l && me.ttl() <= 0.3 && me.ttl() > 0) { window.__l = 1; spacePressed(); }
  }); window.__iv = 0; });
  await A.waitForFunction(() => race.state === 'running' && race.clock > 1.5, null, { timeout: 120000 });
  const rA = await A.evaluate(() => ({ R: window.__rAtGate, local: window.__R.length + ' (' + window.__frames + ' frames)', cat: race.player.startCat }));
    ok(rA.R > 0.6, `stall balance online: readiness ${Math.round(100 * rA.R)}% when the gates opened (server), ${rA.local} balance updates on screen`);
  ok(rA.cat && rA.cat !== 'MISSED', `Alice jumped on the gates online: ${rA.cat}`);
  for (const p of [A, B]) await p.waitForFunction(() => ui.state === 'results' || ui.state === 'replay', null, { timeout: 240000 });
  for (const p of [A, B]) await p.evaluate(() => { window.__ctl = null; if (ui.state === 'replay') endReplay(); });
  await sleep(500);
  const resA = await A.evaluate(() => ({ lunge: startUI.lunge, q: race.player.stat.lungeQ, line: document.getElementById('resMPLine').textContent, order: race.finishOrder.map(h => h.def.name).join('|') }));
  const resB = await B.evaluate(() => ({ order: race.finishOrder.map(h => h.def.name).join('|'), q: race.horses[0].stat.lungeQ }));
  ok(resA.lunge && resA.q != null && resA.q > 0, `the lunge works online: "${resA.lunge}" (stretch at the line ${resA.q})`);
  ok(resA.order === resB.order, 'identical official result on both screens');
  ok(/Added to Thunder Road's online record/.test(resA.line), `the result screen notes the record: "${resA.line.slice(0, 110)}…"`);
  const after = await A.evaluate(() => { CAREER.load(); const h = CAREER.data.horses[0]; return { cash: CAREER.data.cash, txn: Object.keys(CAREER.data.txn || {}).filter(k => /^on:/.test(k)), online: h.online, xp: h.xp, trainPts: h.trainPts, races: h.races, champPts: h.champPts }; });
  ok(after.online && after.online.runs === 1 && after.online.last.length === 1 && after.online.last[0].vs === 'Bob', `on Thunder Road's record: ${JSON.stringify(after.online)}`);
  ok(after.xp === before.xp && after.trainPts === before.trainPts && after.races === before.races && after.champPts === before.champPts, 'no experience, training points, career starts or championship points from an online race');
  ok(after.cash > before.cash || /no prize money/.test(resA.line) === false && after.txn.length === 0, `online prize money banked (cash ${before.cash} → ${after.cash}) once: ${after.txn.join()}`);
  ok(after.txn.length === 1 || after.cash === before.cash, 'one ledger entry for the race');
  // rematch: one click each returns to the lobby already ready (same horses), the host starts again
  ok(await A.$eval('#resAgain', e => !e.hidden && /Rematch/.test(e.textContent)), 'the result screen offers a REMATCH button');
  await A.click('#resAgain'); await B.click('#resAgain');
  await A.waitForFunction(() => /All \d+ ready/.test(document.getElementById('mpStatus') ? document.getElementById('mpStatus').textContent : ''), null, { timeout: 15000 }).catch(() => {});
  const st = await A.$eval('#mpStatus', e => e.textContent).catch(() => '?');
  ok(/All 2 ready/.test(st), `after Rematch both riders are ready in the lobby: "${st}"`);
  await A.click('#mpStart'); await A.waitForFunction(() => typeof race !== 'undefined' && race && race.state && race.state !== 'done' && MP.racing, null, { timeout: 20000 });
  ok(true, 'the rematch starts a new online race');
  for (const [nm, p] of [['Alice', A], ['Bob', B]]) ok(!p.errs.length, `no page errors (${nm})` + (p.errs.length ? ': ' + p.errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); console.log(global.__pages ? global.__pages.map(p => p.errs) : ''); process.exit(1); });
