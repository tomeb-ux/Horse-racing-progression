// Two independent browser sessions play one online race through the real server (optionally one via a laggy proxy).
// Checks: room create/join, horse pick, ready/start, both control their own horse, both see each other, identical
// rendering of the shared simulation, fair starts, a reconnect mid-race, identical official results, replays.
const { chromium } = require('playwright');
const { startProxy } = require('./latency-proxy');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
const LAT = +(process.env.LAT || 0), JIT = +(process.env.JIT || 0), DIST = +(process.env.DIST || 1000);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let proxy = null; if (LAT || JIT) proxy = startProxy(PORT + 1, `ws://localhost:${PORT}/ws`, LAT, JIT);
  const b = await chromium.launch();
  const mk = async (who) => {
    const ctx = await b.newContext({ viewport: { width: 560, height: 315 } });
    await ctx.addInitScript(([nr]) => { window.__norender = nr; localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_scenery', '"low"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); window.__commLog = []; }, [process.env.RENDER !== '1']);
    const page = await ctx.newPage(); page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) page.errs.push(m.text()); });
    page.on('load', () => page.evaluate(() => { if (window.__norender && typeof renderer !== 'undefined') renderer.render = () => {}; }).catch(() => {}));   // headless software GL is too slow for two pages; logic still runs every frame
    page.who = who; return page;
  };
  const A = await mk('A'), B = await mk('B');
  await A.goto(BASE); await A.waitForTimeout(1200);
  await A.click('#btnMP'); await A.fill('#mpName', 'Alice'); await A.click('#mpCreate');
  await A.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.getElementById('mpCodeBig').textContent));
  const code = await A.$eval('#mpCodeBig', e => e.textContent); console.log('room code shown to host:', code);
  const qs = proxy ? `?join=${code}&server=ws://localhost:${PORT + 1}/ws` : `?join=${code}`;
  await B.goto(BASE + qs); await B.waitForTimeout(1500);
  console.log('join link prefilled code:', await B.$eval('#mpCode', e => e.value));
  await B.fill('#mpName', 'Bob'); await B.click('#mpJoin');
  for (const p of [A, B]) await p.waitForFunction(() => MP.lobby && MP.lobby.players[1] && document.querySelectorAll('#mpHorses .chip').length === 12, null, { timeout: 15000 });
  const pick = (p, name) => p.waitForTimeout(LAT ? 600 : 0).then(() => p.evaluate(n => [...document.querySelectorAll('#mpHorses .chip')].find(c => c.textContent === n).click(), name));
  await pick(B, 'Yes Yes Yes'); await sleep(300); await pick(A, 'Ka Ying Rising'); await sleep(300);
  await pick(B, 'Ka Ying Rising'); await sleep(300);
  console.log('B tries to take the same horse → status:', await B.$eval('#mpStatus', e => e.textContent), '· B still on', await B.evaluate(() => ROSTER[MP.lobby.players[1].horse].name));
  console.log("B sees A's horse disabled:", await B.evaluate(() => [...document.querySelectorAll('#mpHorses .chip')].find(c => c.textContent === 'Ka Ying Rising').disabled));
  await A.evaluate(d => [...document.querySelectorAll('#mpSettings .chip')].find(c => c.textContent === d + 'm').click(), DIST); await sleep(300);
  console.log('B sees host settings:', await B.evaluate(() => JSON.stringify(MP.lobby.settings)), '· guest settings buttons disabled:', await B.evaluate(() => document.querySelector('#mpSettings .chip').disabled));
  await sleep(LAT ? 800 : 0); await A.click('#mpReady'); await B.click('#mpReady'); await sleep(400 + (LAT ? 1200 : 0));
  console.log('lobby status (host):', await A.$eval('#mpStatus', e => e.textContent));
  await A.click('#mpStart');
  await A.waitForFunction(() => ui.state === 'racing' && MP.racing, null, { timeout: 15000 }); await B.waitForFunction(() => ui.state === 'racing' && MP.racing, null, { timeout: 15000 });
  console.log('both in the race:', await A.evaluate(() => race.player.def.name), 'vs', await B.evaluate(() => race.player.def.name), '· A sees rival', await A.evaluate(() => race.horses[MP.rivals[0]].mpName));
  // riders: track the start sweet spot with Space, press 0.25 s after seeing the gates open, ride, tap the rhythm in the final 450 m
  const rider = (p, eff, steerAt) => p.evaluate(([eff, steerAt]) => {
    window.__log = []; window.__seenGate = null; window.__steer = steerAt; let lastTap = -9;
    window.__iv = setInterval(() => {
      if (!race || !MP.racing || ui.state !== 'racing') return;
      const p = race.player, S = race.st;
      if (race.state === 'load' || race.state === 'count') { keys[' '] = S.m < S.z; const ls = MP.snaps[MP.snaps.length - 1], Ps = ls && ls.P[MP.myIdx]; if (Ps && Ps.st) (window.__stlog = window.__stlog || []).push([+S.m.toFixed(3), +S.z.toFixed(3), Ps.st.m, Ps.st.z, Ps.st.aligned, Ps.st.R, S.aligned ? 1 : 0]); }
      else if (keys[' ']) { keys[' '] = false; spaceReleased(); }
      if (race.state === 'running' && window.__seenGate == null) window.__seenGate = performance.now();
      if (window.__seenGate != null && !window.__pressed && performance.now() - window.__seenGate > 250) { window.__pressed = 1; spacePressed(); }
      riderInput.effort = race.clock > 3 ? eff : 0.9;
      keys.d = race.clock > steerAt && race.clock < steerAt + 1.2;
      if (race.dist - p.progress < 440 && Math.abs(p.rhythmPin() - 0.5) < 0.12 && race.clock - lastTap > 0.5) { lastTap = race.clock; spacePressed(); }
      const rv = race.horses[MP.rivals[0]], ai = race.horses[5];
      window.__log.push([performance.now() + MP.offset - MP.delay, p.progress, p.laneF, rv.progress, rv.laneF, ai.progress, rv.mesh.position.x, rv.mesh.position.z, race.clock]);
    }, 16);
  }, [eff, steerAt]);
  await rider(A, 0.84, 12); await rider(B, 0.86, 18);
  // mid-race: drop B's connection, then let it reconnect by itself
  await B.waitForFunction(() => race && race.clock > 22, null, { timeout: 120000 });
  await B.evaluate(() => MP.ws.close()); const tDrop = Date.now();
  await B.waitForFunction(() => MP.ws && MP.ws.readyState === 1, null, { timeout: 20000 });
  console.log('B reconnected after', ((Date.now() - tDrop) / 1000).toFixed(1), 's; A was told:', await A.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).filter(t => /Bob/.test(t)).join(' | ') || '(toast gone)'));
  await A.waitForFunction(() => ui.state === 'results' || ui.state === 'replay', null, { timeout: 240000 });
  await B.waitForFunction(() => ui.state === 'results' || ui.state === 'replay', null, { timeout: 60000 });
  for (const p of [A, B]) await p.evaluate(() => clearInterval(window.__iv));
  // compare what both screens showed of the same horses at the same server times
  const LA = await A.evaluate(() => window.__log), LB = await B.evaluate(() => window.__log);
  const at = (L, t, k) => { for (let i = 1; i < L.length; i++) if (L[i][0] >= t) { const a = L[i - 1], c = L[i], u = (t - a[0]) / Math.max(1e-6, c[0] - a[0]); return a[k] + (c[k] - a[k]) * u; } return null; };
  let maxDiff = 0, nCmp = 0;
  for (const s of LA) { if (s[8] < 2) continue; const pb = at(LB, s[0], 5); if (pb == null) continue; maxDiff = Math.max(maxDiff, Math.abs(pb - s[5])); nCmp++; }
  let selfDiff = 0; for (const s of LA) { const pb = at(LB, s[0], 3); if (pb == null || s[8] < 2) continue; selfDiff = Math.max(selfDiff, Math.abs(pb - s[1])); }   // A's horse as B saw it vs as A saw it
  const dl = []; for (const s of LA) { if (s[8] < 2) continue; const pb = at(LB, s[0], 5); if (pb != null) dl.push(Math.abs(pb - s[5])); } dl.sort((x, y) => x - y);
  console.log(`same AI horse on both screens at matching server times: median ${dl[dl.length >> 1].toFixed(3)} m · 95th pct ${dl[Math.floor(dl.length * 0.95)].toFixed(3)} m · max ${maxDiff.toFixed(3)} m over ${nCmp} samples (includes Bob's deliberate disconnect)`);
  console.log(`Alice's horse on Bob's screen vs Alice's own: max difference ${selfDiff.toFixed(3)} m`);
  // smoothness: frame-to-frame jumps of the rival's mesh vs its speed
  // (over 100 ms windows: the logger's timer isn't locked to the render frames, so per-sample figures alias 2–4×)
  const sp = []; for (let i = 0, j = 0; i < LA.length; i++) { while (j < LA.length && LA[j][0] - LA[i][0] < 100) j++; if (j >= LA.length) break; if (LA[i][8] < 1) continue; sp.push(Math.hypot(LA[j][6] - LA[i][6], LA[j][7] - LA[i][7]) / ((LA[j][0] - LA[i][0]) / 1000)); }
  sp.sort((a, b) => a - b);
  console.log('rival mesh speed over 100 ms windows (m/s): median', sp[sp.length >> 1].toFixed(1), '· 99th pct', sp[Math.floor(sp.length * 0.99)].toFixed(1), '· max', sp[sp.length - 1].toFixed(1), '(a racehorse tops out ≈ 18–19 m/s; a teleport would show as hundreds)');
  console.log("rival's lane changes visible to A:", (Math.max(...LA.map(s => s[4])) - Math.min(...LA.filter(s => s[8] > 3).map(s => s[4]))).toFixed(2), 'lanes');
  await sleep(1500);
  const res = p => p.evaluate(() => ({ mp: (document.getElementById('resMPLine') || {}).textContent, order: [...document.querySelectorAll('#resOrder .lb-row')].map(r => r.textContent).join(' | '), start: race.player.stat.startQ + ' ' + (race.player.stat.reactT || 0).toFixed(2), place: document.getElementById('resPlace').textContent, rec: race.rec.n, full: race.recFull.n, state: ui.state }));
  const rA = await res(A), rB = await res(B);
  console.log('A result line:', rA.mp); console.log('B result line:', rB.mp);
  for (const [nm, pg] of [['A', A], ['B', B]]) { const c = await pg.evaluate(() => ({ n: window.__commLog.length, win: (window.__commLog.find(e => e.cat === 'win') || {}).text || '', official: race && race.finishOrder[0] && race.finishOrder[0].def.name, stale: window.__commLog.filter(e => e.claim && !e.final && e.claim !== e.leaderNow).length }));
    console.log(`commentary ${nm}: ${c.n} lines · winner call "${c.win}" · names official winner ${!!c.official && c.win.includes(c.official)} · stale leader calls ${c.stale}`); }
  console.log('identical finishing order on both screens:', rA.order === rB.order, '·', rA.order.slice(0, 120) + '…');
  for (const [nm, p] of [['A', A], ['B', B]]) { const L = await p.evaluate(() => window.__stlog || []); const al = L.filter(r => r[4]).length, cl = L.filter(r => r[6]).length; console.log(`start marker ${nm}: ${L.length} samples · aligned on server ${(100 * al / Math.max(1, L.length)).toFixed(0)}% · on own screen ${(100 * cl / Math.max(1, L.length)).toFixed(0)}% · server readiness at the gate ${L.length ? L[L.length - 1][5] : '?'}`); if (process.env.STDUMP) console.log(JSON.stringify(L.filter((r, i) => i % 15 === 0))); }
  console.log('starts (both pressed 0.25 s after seeing the gates):', 'A', rA.start, '· B', rB.start, '· recording frames', rA.rec, rA.full, 'state', rA.state, rB.state);
  // independent replays: A opens the photo finish and steps a frame, B is untouched
  for (const p of [A, B]) await p.evaluate(() => { if (ui.state === 'replay') { if (HL.on) endHighlights(); else endReplay(); } });
  await A.evaluate(() => startReplay('photo', false)); await A.keyboard.press('l'); await A.keyboard.press('ArrowRight');
  console.log('A replay at the line:', await A.evaluate(() => ui.state + ' t=' + RP.t.toFixed(3) + ' paused=' + RP.paused), '· B still on:', await B.evaluate(() => ui.state));
  await A.evaluate(() => endReplay());
  await A.click('#resLobby'); await B.click('#resLobby'); await sleep(500);
  console.log('back in the lobby:', await A.evaluate(() => ui.state + ' ' + MP.lobby.state), '/', await B.evaluate(() => ui.state));
  console.log('page errors A:', A.errs.length ? A.errs : 'none', '· B:', B.errs.length ? B.errs : 'none');
  await b.close(); if (proxy) proxy.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
