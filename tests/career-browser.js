// End-to-end browser test of Career Mode, the championship, Chaos isolation and the live commentary, on the real game page.
// Speech synthesis is replaced by a recording stub (headless Chromium has no voices) so every spoken line can be checked.
//   PORT=8095 node server/index.js   (in another shell)  then   PORT=8095 node tests/career-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = process.env.BASE || `http://localhost:${PORT}/`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };

const SPEECH_STUB = () => {
  window.__spoken = []; window.__cancels = 0; window.__overlap = 0; window.__commLog = [];
  let speaking = null;
  class U { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = ''; } }
  const voices = [{ name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha', localService: true }, { name: 'Karen', lang: 'en-AU', voiceURI: 'Karen', localService: true }, { name: 'Daniel', lang: 'en-GB', voiceURI: 'Daniel', localService: true }, { name: 'Thomas', lang: 'fr-FR', voiceURI: 'Thomas', localService: true }];
  const synth = {
    get speaking() { return !!speaking; }, pending: false, paused: false,
    getVoices: () => voices, addEventListener() {}, resume() {},
    speak(u) {
      if (speaking) window.__overlap++;
      speaking = u; if (u.text.trim()) window.__spoken.push({ t: performance.now() / 1000, text: u.text, rate: u.rate, pitch: u.pitch, vol: u.volume, voice: u.voice && u.voice.name });
      const dur = u.text.trim() ? 350 + u.text.split(/\s+/).length / (2.6 * u.rate) * 1000 : 10;
      u.__tm = setTimeout(() => { if (speaking === u) speaking = null; u.onend && u.onend(); }, dur);
    },
    cancel() { window.__cancels++; if (speaking) { clearTimeout(speaking.__tm); speaking = null; } },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = U;
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
  if (fs.existsSync(__dirname + '/../public/vendor/three.min.js')) await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.addInitScript(() => { localStorage.setItem('ff_crowd', '"off"'); localStorage.setItem('ff_shadows', 'false'); localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_autoReplay', 'false'); });
  await ctx.addInitScript(SPEECH_STUB);
  // an existing v1 career save (the format before this update): two horses, a trophy and race history
  const V1 = { v: 1, stable: 'Old Timers Stable', active: 1, wins: 7, created: 1700000000000,
    trophies: [{ raceId: 'slipper', race: 'Golden Slipper', horse: 'Legacy Lad', t: 1700000100000 }],
    horses: [
      { id: 'hOLD1', name: 'Legacy Lad', look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [1, 1, 0, 0], maneCol: '#0a0806', tailCol: '#0a0806', build: 0 }, silk: '#1d3557', silk2: '#e8c35a', silkPat: 'sash',
        attrs: { top: 70, acc: 66, end: 64, spr: 68, rec: 60, tem: 62, agi: 61, sta: 63 }, pot: { top: 88, acc: 80, end: 76, spr: 85, rec: 70, tem: 75, agi: 72, sta: 79 }, xp: 40, trainPts: 3, lvl: 4, races: 9, wins: 3, places: 6, podiums: 5,
        history: [{ raceId: 'maiden', name: 'Maiden Plate', place: 1, field: 10, dnf: false, t: 1700000000500 }, { raceId: 'listed', name: 'Festival Stakes', place: 2, field: 12, dnf: false, t: 1700000000600 }] },
      { id: 'hOLD2', name: 'Second Wind', look: { type: 'grey', coat: '#b9b3aa', face: 'blaze', socks: [0, 0, 0, 0], maneCol: '#8c8984', tailCol: '#8c8984', build: 0.85 }, silk: '#d62828', silk2: '#f4f1ea', silkPat: 'hoops',
        attrs: { top: 60, acc: 55, end: 70, spr: 55, rec: 66, tem: 60, agi: 55, sta: 52 }, pot: { top: 80, acc: 70, end: 90, spr: 70, rec: 85, tem: 72, agi: 66, sta: 66 }, xp: 0, trainPts: 0, lvl: 1, races: 0, wins: 0, places: 0, podiums: 0, history: [] },
    ] };
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(BASE); await p.evaluate(v1 => localStorage.setItem('ff_career', JSON.stringify(v1)), V1);
  await p.reload(); await p.waitForFunction(() => typeof CAREER !== 'undefined' && typeof COMM !== 'undefined' && typeof SEASON !== 'undefined');
  await p.evaluate(() => { window.__rr = renderer.render.bind(renderer); renderer.render = () => {}; });
  const ff = () => p.evaluate(() => { let n = 0; while (race && race.state !== 'done' && n++ < 120 * 400) race.step(SIM_DT); return race && race.state; });

  console.log('\n— menu & old save');
  ok(!(await p.$('#btnChamp')), 'stand-alone Championship button removed (Career is the championship)');
  await p.click('#btnCareer'); await sleep(300);
  const mig = await p.evaluate(() => { const C = CAREER.data; return { v: C.v, n: C.horses.length, names: C.horses.map(h => h.name), tro: C.trophies.length, wins: C.wins, stable: C.stable, season: C.season && C.season.n, div: C.season && C.season.div, hist: C.horses[0].history.map(e => e.dist + '/' + e.tier), xp: C.horses[0].xp, lvl: C.horses[0].lvl, attrs: C.horses[0].attrs.top }; });
  ok(mig.v === 2 && mig.n === 2 && mig.names.join() === 'Legacy Lad,Second Wind' && mig.tro === 1 && mig.wins === 7 && mig.stable === 'Old Timers Stable' && mig.lvl === 4 && mig.attrs === 70, `v1 save migrated with horses, trophies, wins and progression intact (${JSON.stringify(mig)})`);
  ok(mig.season === 1 && mig.div === 0 && mig.hist.join() === '1200/1,1200/2', 'a championship season was added and old race history gained distance/grade facts');
  ok(await p.evaluate(() => ui.state === 'c_hub' && /NEXT EVENT|Next event/i.test(document.getElementById('car_hub').textContent) && /Maiden Plate/.test(document.getElementById('car_hub').textContent)), 'dashboard shows the next championship event (Maiden Plate)');

  console.log('\n— create a custom horse');
  await p.evaluate(() => [...document.querySelectorAll('#car_hub button')].find(b => /Create/.test(b.textContent)).click());
  ok(await p.evaluate(() => /Stable is full|slots/.test(document.body.textContent) || ui.state === 'c_create'), 'create screen opens (3 slots at 7 career wins)');
  await p.fill('#cName', 'Midnight Legend');
  await p.evaluate(() => { const order = [0, 1, 3, 7, 2, 4, 5, 6]; for (let k = 0; k < 400; k++) { const rows = document.querySelectorAll('#cAttrs .car-arow'); const r = rows[order[k % 8]]; const plus = r.querySelectorAll('.car-step')[1]; if (!plus.disabled) plus.click(); if (document.getElementById('cPool').textContent === '0') break; } });
  await p.evaluate(() => [...document.querySelectorAll('#car_create button')].find(b => /Confirm/.test(b.textContent)).click()); await sleep(200);
  const nh = await p.evaluate(() => { const h = CAREER.data.horses.find(x => x.name === 'Midnight Legend'); return h && { r: Math.round(Object.values(h.attrs).reduce((a, b) => a + b) / 8), act: CAREER.data.horses[CAREER.data.active].name }; });
  ok(nh && nh.r >= 69 && nh.r <= 71 && nh.act === 'Midnight Legend', `new horse starts at a rating of about 70 (${JSON.stringify(nh)})`);

  console.log('\n— Chaos is on in Quick Race…');
  await p.evaluate(() => { settings.chaos = true; store.set('chaos', true); show('menu'); });
  await p.click('#btnQuick'); await p.click('#setupGo'); await sleep(400);
  ok(await p.evaluate(() => race.chaos === true && race.cfg.chaos === true), 'Quick Race with Chaos selected runs a chaos race');
  await p.evaluate(() => quitToMenu());

  console.log('\n— …but never in an official championship race');
  await p.click('#btnCareer'); await sleep(200);
  await p.click('#hubEnter'); await sleep(200);
  ok(await p.evaluate(() => /Entry requirements/.test(document.getElementById('car_event').textContent) && document.querySelectorAll('#car_event [data-go]').length >= 2), 'event view lists eligible horses with requirements');
  const idx = await p.evaluate(() => CAREER.data.horses.findIndex(h => h.name === 'Midnight Legend'));
  await p.click(`#car_event [data-go="${idx}"]`); await sleep(500);
  const cr = await p.evaluate(() => ({ chaos: race.chaos, cfgChaos: race.cfg.chaos, assist: race.cfg.assist, unl: race.cfg.unlimited, kickChip: !document.getElementById('kickChip').hidden && getComputedStyle(document.getElementById('kickChip')).display !== 'none', keys: document.getElementById('hudKeys').textContent, opp: race.horses.slice(1).map(h => h.def._stable).filter(Boolean).length, field: race.horses.length, name: race.player.def.name, settingsChaos: settings.chaos }));
  ok(cr.chaos === false && cr.cfgChaos === false && cr.settingsChaos === true, 'career race has chaos OFF in the race itself even though Quick Race still has it on');
  ok(!cr.kickChip && !/P kick/.test(cr.keys), 'no kick HUD chip and no kick key hint');
  ok(cr.assist === false && cr.unl === false, 'no stamina assist or unlimited options in championship racing');
  ok(cr.opp === cr.field - 1 && cr.name === 'Midnight Legend', `all ${cr.opp} rivals are recurring AI stable runners; the player rides Midnight Legend`);
  await p.waitForFunction(() => race.state === 'running', null, { timeout: 20000 }); await sleep(1500);
  await p.keyboard.press('p'); await sleep(200);
  ok(await p.evaluate(() => !race.player.kickUsed && !race.events.some(e => /kick/.test(e.type)) && !race.horses.some(h => h.fallen && /kicked/.test(h.cause || ''))), 'pressing P does nothing in a championship race');
  // run the rest instantly and check the official result
  const before = await p.evaluate(() => ({ cur: CAREER.data.season.cur, rank: SEASON.standings(CAREER.data).find(r => r.you).rank }));
  await ff(); await sleep(1500);
  const after = await p.evaluate(() => { const C = CAREER.data, s = C.season, rd = s.rounds[0], me = rd.res && rd.res.find(e => e.sid === 'player'); return { cur: s.cur, st: rd.st, n: rd.res && rd.res.length, place: me && me.place, pts: SEASON.standings(C).find(r => r.you).pts, panel: (document.getElementById('resCareerPanel') || {}).textContent || '', ui: ui.state, order: race && race.finishOrder.map(h => h.def.name), resNames: rd.res.map(e => e.name) }; });
  ok(after.cur === 1 && after.st === 'done' && after.n === 10, `round 1 committed once with all 10 runners (finished ${after.place}, ${after.pts} pts)`);
  ok(after.pts === SEASON_POINTS(after.place), 'points match the published table');
  ok(/CHAMPIONSHIP POSITION: \w+ → \w+/.test(after.panel) && /POINT/.test(after.panel), 'results show the championship update: ' + after.panel.replace(/\s+/g, ' ').slice(0, 140));
  ok(after.order.slice(0, 10).join() === after.resNames.join(), 'official round result = the race\'s own finishing order');
  // a replayed results flow / reload must not award it again
  await p.evaluate(() => CAREER.onResult(race, 1));
  ok(await p.evaluate(() => CAREER.data.season.cur === 1 && SEASON.standings(CAREER.data).find(r => r.you).pts) === after.pts, 'calling the result hook again awards nothing');
  await p.reload(); await p.waitForFunction(() => typeof CAREER !== 'undefined'); await p.evaluate(() => { renderer.render = () => {}; });
  await p.click('#btnCareer'); await sleep(200);
  ok(await p.evaluate(p0 => CAREER.data.season.cur === 1 && SEASON.standings(CAREER.data).find(r => r.you).pts === p0 && CAREER.data.season.rounds[0].st === 'done', after.pts), 'after a page reload the calendar and points are unchanged');

  console.log('\n— skip a round');
  await p.click('#hubSkip'); await sleep(200);
  ok(await p.evaluate(() => /cannot come back/.test(document.getElementById('car_event').textContent)), 'skipping explains the consequences first');
  await p.click('#skYes'); await sleep(200);
  const sk = await p.evaluate(() => { const C = CAREER.data, rd = C.season.rounds[1]; return { cur: C.season.cur, st: rd.st, me: rd.res.some(e => e.sid === 'player'), n: rd.res.length, pts: SEASON.standings(C).find(r => r.you).pts, ai: SEASON.standings(C).filter(r => !r.you).reduce((s, r) => s + r.pts, 0) }; });
  ok(sk.cur === 2 && sk.st === 'skip' && !sk.me && sk.n === 9 && sk.pts === after.pts, `skipped round: calendar advanced, 9 AI results recorded, no points for the stable (${JSON.stringify(sk)})`);
  ok(await p.evaluate(() => { const r = CAREER._test; r.enterOfficial(1, 0); return !race || race.cfg.career == null || CAREER.data.season.cur === 2; }), 'the skipped round cannot be entered afterwards');
  await p.evaluate(() => { if (race) quitToMenu(); CAREER.open(); });

  console.log('\n— optional races');
  const o0 = await p.evaluate(() => { const C = CAREER.data, h = C.horses.find(x => x.name === 'Midnight Legend'); return { cur: C.season.cur, pts: SEASON.standings(C).find(r => r.you).pts, xp: h.xp + h.lvl * 1000, tp: h.trainPts, races: h.races, tro: C.trophies.length }; });
  for (let k = 0; k < 2; k++) {
    await p.evaluate(i => CAREER._test.enterOptional('o_bm64', i), idx); await sleep(300);
    ok(await p.evaluate(() => race.chaos === false && race.cfg.career && race.cfg.career.official === false), 'optional race starts (chaos off)');
    await ff(); await sleep(1300);
    await p.evaluate(() => { if (ui.state === 'replay') endReplay(); });
    await p.evaluate(() => { clearRaceMeshes(); race = null; CAREER.open(); });
  }
  const o1 = await p.evaluate(() => { const C = CAREER.data, h = C.horses.find(x => x.name === 'Midnight Legend'); return { cur: C.season.cur, pts: SEASON.standings(C).find(r => r.you).pts, xp: h.xp + h.lvl * 1000, tp: h.trainPts, races: h.races, tro: C.trophies.length, last: h.history[h.history.length - 1] }; });
  ok(o1.cur === o0.cur && o1.pts === o0.pts && o1.tro === o0.tro, 'optional races leave the calendar, points and trophies unchanged');
  ok(o1.races === o0.races + 2 && o1.xp > o0.xp && o1.tp > o0.tp && o1.last.off === false, `optional races award experience and training points (+${o1.tp - o0.tp} pts) and are recorded as optional`);

  console.log('\n— qualification');
  const q = await p.evaluate(() => { const C = CAREER.data, h = C.horses.find(x => x.name === 'Midnight Legend'); const e = SEASON.eligibility(h, SEASON.BY_ID.melbcup), ev = SEASON.eligibility(h, SEASON.BY_ID.everest);
    const h2 = JSON.parse(JSON.stringify(h)); for (const k in h2.attrs) h2.attrs[k] = 88; h2.history.push({ raceId: 'sandown', name: 'Sandown Stayers', place: 2, dist: 3200, tier: 2 }); const e2 = SEASON.eligibility(h2, SEASON.BY_ID.melbcup);
    const h3 = JSON.parse(JSON.stringify(h2)); h3.history.push({ raceId: 'o_wildcard', name: 'Everest Wildcard Sprint', place: 1, dist: 1200, tier: 2 }); const sprinterH = JSON.parse(JSON.stringify(h3)); Object.assign(sprinterH.attrs, { end: 60, rec: 60 }); const e3 = SEASON.eligibility(sprinterH, SEASON.BY_ID.melbcup);
    return { mc: e.ok, mcReq: e.reqs.map(r => r.label + ':' + r.ok + ':' + r.detail), ev: ev.ok, mc2: e2.ok, sprinterCup: e3.ok, sprinterWhy: e3.reqs.filter(r => !r.ok).map(r => r.label) }; });
  ok(!q.mc && !q.ev && q.mcReq.some(x => /Horse rating:false/.test(x)) && q.mcReq.some(x => /Staying qualification:false:Not achieved/.test(x)), 'a young horse is refused the Melbourne Cup and The Everest, with reasons: ' + q.mcReq.join(' | '));
  ok(q.mc2, 'meeting rating, staying ability and a staying result qualifies a horse for the Melbourne Cup');
  ok(!q.sprinterCup && q.sprinterWhy.includes('Staying ability'), 'a sprinter with only sprint wins cannot qualify for the Cup');
  await p.evaluate(() => { CAREER.open(); });

  console.log('\n— standings, calendar, history screens');
  for (const [fn, id, re] of [['openStandings', 'car_stand', /Behind/], ['openCalendar', 'car_cal', /Not entered/], ['openHistory', 'car_hist', /No completed seasons/], ['openOptional', 'car_opt', /Everest Wildcard/]]) {
    await p.evaluate(f => CAREER._test[f](), fn); await sleep(100);
    ok(await p.evaluate(([i, r]) => new RegExp(r).test(document.getElementById(i).textContent), [id, re.source]), `${fn} renders`);
  }

  console.log('\n— finish a season (rounds skipped quickly) → history + next season');
  await p.evaluate(() => { CAREER.open(); for (let i = 0; i < 20 && !SEASON.done(CAREER.data.season); i++) CAREER._test.doSkip(CAREER.data.season.cur); CAREER._test.openSeasonEnd(); });
  ok(await p.evaluate(() => ui.state === 'c_send' && /Finish Season/.test(document.getElementById('car_send').textContent)), 'season-complete screen with final standings');
  await p.click('#seGo'); await sleep(200);
  const hs = await p.evaluate(() => { const C = CAREER.data; return { n: C.season.n, cur: C.season.cur, hist: C.history.length, h0: C.history[0] && { pos: C.history[0].playerPos, champ: C.history[0].champion.name, entered: C.history[0].entered, skipped: C.history[0].skipped, used: C.history[0].horsesUsed } }; });
  ok(hs.n === 2 && hs.cur === 0 && hs.hist === 1 && hs.h0.entered === 1 && hs.h0.skipped === 9 && hs.h0.used.join() === 'Midnight Legend', 'season 1 archived permanently, season 2 started: ' + JSON.stringify(hs.h0));
  await p.evaluate(() => CAREER._test.openHistory()); await sleep(100);
  ok(await p.evaluate(c => document.getElementById('car_hist').textContent.includes(c), hs.h0.champ), 'history screen shows the recorded champion');

  console.log('\n— live commentary in a real-time race');
  await p.evaluate(() => { settings.chaos = false; store.set('chaos', false); settings.dist = 1000; settings.opp = 7; window.__spoken.length = 0; window.__commLog.length = 0; show('menu'); });
  await p.click('#btnQuick'); await p.click('#setupGo');
  await p.evaluate(() => { window.__iv = setInterval(() => { if (!race || ui.state !== 'racing') return; const S = race.st; if (race.state !== 'running') keys[' '] = S && S.m < S.z; else if (keys[' ']) { keys[' '] = false; spaceReleased(); } if (race.state === 'running' && !window.__sp) { window.__sp = 1; setTimeout(spacePressed, 260); } riderInput.effort = race.clock > 3 ? 0.78 : 0.9; }, 16); });
  await p.waitForFunction(() => race && race.state === 'running', null, { timeout: 20000 });
  const gateT = await p.evaluate(() => performance.now() / 1000);
  await p.waitForFunction(() => ui.state === 'results' || ui.state === 'replay', null, { timeout: 150000 });
  await p.evaluate(() => clearInterval(window.__iv));
  const cm = await p.evaluate(() => ({ spoken: window.__spoken, log: window.__commLog, overlap: window.__overlap, winner: race.finishOrder[0].def.name, player: race.player.def.name }));
  console.log('   spoken lines:'); cm.spoken.forEach(s => console.log(`     ${(s.t).toFixed(1)}s r${s.rate.toFixed(2)} p${s.pitch.toFixed(2)} ${s.voice || '-'}: ${s.text}`));
  ok(cm.spoken.length >= 6, `the commentator spoke ${cm.spoken.length} lines through speechSynthesis`);
  ok(cm.spoken.every(s => s.voice === 'Karen'), 'the Australian voice (Karen, en-AU) was chosen automatically over US/UK voices');
  ok(!cm.spoken.some(s => s.t > gateT - 0.75 && s.t < gateT + 0.2), 'nothing spoken as the gates opened');
  const win = cm.log.find(e => e.cat === 'win');
  ok(win && win.text.includes(cm.winner), `winner call names the official winner (${win ? win.text : 'none'})`);
  const early = cm.spoken.filter(s => s.t < gateT + 20), late = cm.spoken.slice(-4);
  ok(Math.max(...late.map(s => s.rate)) > Math.max(...early.map(s => s.rate)), 'speaking rate rises towards the finish');
  ok(cm.log.filter(e => e.claim && !e.final).every(e => e.claim === e.leaderNow), 'every "who leads" call was true when spoken');
  ok(cm.spoken.some(s => s.text.includes(cm.player)), `the rider's horse (${cm.player}) is called by name`);

  console.log('\n— commentary stops when leaving a race');
  await p.evaluate(() => { window.__spoken.length = 0; if (ui.state === 'replay') endReplay(); show('menu'); });
  await p.click('#btnQuick'); await p.click('#setupGo');
  await p.evaluate(() => { window.__iv = setInterval(() => { if (!race || ui.state !== 'racing') return; if (race.state === 'running' && !window.__sp2) { window.__sp2 = 1; setTimeout(spacePressed, 260); } }, 16); });
  await p.waitForFunction(() => race && race.state === 'running' && race.clock > 6, null, { timeout: 30000 });
  const c0 = await p.evaluate(() => window.__cancels);
  await p.evaluate(() => { show('pause'); }); await sleep(100);
  const c1 = await p.evaluate(() => window.__cancels);
  await p.evaluate(() => quitToMenu()); const n0 = await p.evaluate(() => window.__spoken.length); await sleep(4000);
  ok(c1 > c0, 'pausing cancels speech');
  ok(await p.evaluate(n => window.__spoken.length === n, n0), 'no speech continues after quitting to the menu');
  await p.evaluate(() => clearInterval(window.__iv));

  console.log('\n— settings & Chaos still available in Quick Race');
  await p.click('#btnSettings'); await sleep(300);
  const st = await p.evaluate(() => ({ chips: document.querySelectorAll('#optComm .chip').length, vol: [...document.querySelectorAll('#optCommVol .chip')].map(c => c.textContent).join(','), voices: [...document.querySelectorAll('#optCommVoice option')].map(o => o.textContent) }));
  ok(st.chips === 2 && st.vol === '25%,50%,75%,100%' && st.voices.length === 4 && /Karen/.test(st.voices[0]) && !st.voices.some(v => /Thomas/.test(v)), 'commentary on/off, volume and English voice list in Settings: ' + st.voices.join(' / '));
  await p.evaluate(() => { [...document.querySelectorAll('#optComm .chip')].find(c => c.textContent === 'Off').click(); window.__spoken.length = 0; });
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('ff_commentary')).on === false), 'commentary setting is remembered');
  await p.evaluate(() => { settings.chaos = true; store.set('chaos', true); settings.dist = 1000; show('menu'); });
  await p.click('#btnQuick'); await p.click('#setupGo'); await sleep(300);
  await p.waitForFunction(() => race && race.state === 'running' && race.clock > 3, null, { timeout: 30000 });
  ok(await p.evaluate(() => race.chaos === true && getComputedStyle(document.getElementById('kickChip')).display !== 'none' && !document.getElementById('kickChip').hidden), 'back in Quick Race, Chaos Mode and the kick chip still work');
  ok(await p.evaluate(() => window.__spoken.length === 0), 'commentary OFF: nothing is spoken');
  await p.evaluate(() => { [...['ff_commentary']].forEach(k => localStorage.setItem(k, JSON.stringify({ on: true, vol: 0.9, voice: '', captions: true }))); quitToMenu(); });

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
function SEASON_POINTS(place) { return [0, 15, 12, 10, 8, 6, 5, 4, 3, 2, 1][place] || 0; }
