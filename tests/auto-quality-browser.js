// AUTO graphics (gfx.js): driven with synthetic frame intervals. Steps down only on SUSTAINED slowness, ignores single
// spikes, doesn't oscillate around the threshold, recovers when there is headroom (with back-off for a level that
// failed), remembers its level, is ignored by the fixed presets — and never changes the race itself.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/auto-quality-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_commentary', JSON.stringify({ on: false, vol: 0.9, captions: false })); localStorage.removeItem('ff_quality'); localStorage.removeItem('ff_autoLevel'); window.__noPresent = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => typeof GFX !== 'undefined' && typeof startRace === 'function');
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; renderer.render = () => {}; window.__feed = (ms, secs) => { const n = Math.round(secs * 1000 / ms); for (let i = 0; i < n; i++) GFX.autoTick(ms / 1000, true); return GFX.AUTO.level; }; });
  const def = await p.evaluate(() => settings.quality);
  ok(def === 'auto', 'AUTO is the default preset');
  const r1 = await p.evaluate(() => { GFX.AUTO.hold = 0; const lv = [__feed(16.7, 30)]; lv.push(__feed(21, 2.5)); lv.push(__feed(21, 3)); return lv; });
  ok(r1[0] === 0 && r1[1] === 0 && r1[2] === 1, `steady 60 fps keeps full quality; ~48 fps for one 1.5 s window: no change; sustained (2 windows): one step down (${r1.join(' → ')})`);
  const st = await p.evaluate(() => ({ note: GFX.AUTO_STEPS[GFX.AUTO.level].note, saved: localStorage.getItem('ff_autoLevel') }));
  ok(/crowd/.test(st.note) && st.saved === '1', `first step reduces distant crowd detail ("${st.note}") and is remembered for next time`);
  const spikes = await p.evaluate(() => { GFX.AUTO.hold = 0; const l0 = GFX.AUTO.level; for (let k = 0; k < 20; k++) { for (let i = 0; i < 80; i++) GFX.autoTick(i % 40 === 0 ? 0.12 : 0.0167, true); } return [l0, GFX.AUTO.level]; });
  ok(spikes[0] === spikes[1], `occasional 120 ms hitches (GC / shader compile) at 60 fps: no change (level ${spikes[1]})`);
  const osc = await p.evaluate(() => { const lv = []; let changes = GFX.AUTO.changes; for (let k = 0; k < 40; k++) lv.push(__feed(k % 2 ? 18.6 : 17.9, 1.5)); return { changes: GFX.AUTO.changes - changes, lv: [...new Set(lv)] }; });
  ok(osc.changes === 0, `hovering just around the limit for 60 s: ${osc.changes} changes (no oscillation)`);
  const deep = await p.evaluate(() => { const t = []; for (let k = 0; k < 12; k++) t.push(__feed(45, 2)); return { lv: GFX.AUTO.level, R: GFX.runtimeParams(), path: t }; });
  ok(deep.lv >= 6 && deep.R.pr <= 1.75 && deep.R.shadow <= 1024, `a badly struggling GPU (22 fps) reaches the render-scale steps within ~24 s (level ${deep.lv}: render ×${deep.R.pr}, shadows ${deep.R.shadow}; path ${deep.path.join(',')})`);
  const order = await p.evaluate(() => GFX.AUTO_STEPS.map(s => s.note));
  ok(order.findIndex(n => /crowd/.test(n)) < order.findIndex(n => /trees/.test(n)) && order.findIndex(n => /trees/.test(n)) < order.findIndex(n => /shadow/.test(n)) && order.findIndex(n => /shadow/.test(n)) < order.findIndex(n => /render scale/.test(n)) && order.findIndex(n => /horses/.test(n)) === order.length - 1, 'order: crowd → trees → shadows → scenery → render scale; nearby-horse detail only at the very last step');
  const up = await p.evaluate(() => { const l0 = GFX.AUTO.level; GFX.AUTO.fails = {}; const t0 = __feed(10, 6); const t1 = __feed(10, 14); return [l0, t0, t1]; });
  ok(up[1] === up[0] && up[2] === up[0] - 1, `headroom: no change for the first 6 s, one step back up after 12 s (${up.join(' → ')})`);
  const backoff = await p.evaluate(() => { GFX.AUTO.hold = 0; const l = GFX.AUTO.level; __feed(30, 3); const down = GFX.AUTO.level; __feed(10, 20); return [l, down, GFX.AUTO.level]; });
  ok(backoff[2] === backoff[1], `a level that just failed is not retried at once (${backoff.join(' → ')}; retry after 60 s, then 120 s…)`);
  const fixed = await p.evaluate(() => { settings.quality = 'high'; GFX.applyQuality(); const l = GFX.AUTO.level; __feed(60, 10); const R = GFX.runtimeParams(); const r = { same: GFX.AUTO.level === l, pr: R.pr, sh: R.shadow }; settings.quality = 'auto'; return r; });
  ok(fixed.same && fixed.pr === 2 && fixed.sh === 4096, 'manual High: AUTO never changes anything (full resolution, 4096 shadows)');
  // Phase 15C: while a race is LIVE AUTO queues its changes (no applyQuality, no setPixelRatio, no ff_autoLevel write); a SEVERE slowdown still applies at once;
  // the queued change lands at the next non-live frame, or at the start of the next race
  const q = await p.evaluate(() => {
    const A = GFX.AUTO, w = [], sp = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'ff_autoLevel') w.push(v); return sp.call(this, k, v); };
    let pr = 0; const spr = renderer.setPixelRatio; renderer.setPixelRatio = function () { pr++; return spr.apply(this, arguments); };
    const reset = l => { GFX.setAuto(l, 'test'); A.hold = 0; A.fails = {}; A.pending = null; A.bad = A.good = 0; A.win.length = 0; A.winT = 0; w.length = 0; pr = 0; };
    const live = (ms, secs) => { const n = Math.round(secs * 1000 / ms); for (let i = 0; i < n; i++) GFX.autoTick(ms / 1000, true, true, true); };
    const o = {};
    reset(3); live(10, 30); o.up = { level: A.level, pending: A.pending && A.pending.to, writes: w.length, pr };            // plenty of headroom, live: queued
    GFX.autoTick(0.0167, true, true, false); o.upApplied = { level: A.level, pending: A.pending, writes: w.slice(), pr, stored: localStorage.getItem('ff_autoLevel') };   // first non-live frame: applied once
    reset(0); live(22, 12); o.mild = { level: A.level, pending: A.pending && A.pending.to, writes: w.length, pr };            // ~45 fps for 12 s, live: queued, not applied
    live(45, 4); o.severe = { level: A.level, pending: A.pending, writes: w.length, pr };                                      // ~22 fps, live: applied at once
    reset(4); A.pending = { to: 3, why: 'test', hold: 4 }; startRace(Object.assign(quickCfg(), { distance: 1000, field: 6, track: 'generic', incidents: 'off', allBots: true, seed: 9 }));
    o.atStart = { level: A.level, pending: A.pending, writes: w.slice(), state: race.state }; quitToMenu();
    reset(2); A.pending = { to: 1, why: 'test', hold: 4 }; settings.quality = 'high'; GFX.autoTick(0.0167, true, true, false); o.fixedPreset = { level: A.level, pending: A.pending }; settings.quality = 'auto';
    Storage.prototype.setItem = sp; renderer.setPixelRatio = spr; return o;
  });
  ok(q.up.level === 3 && q.up.pending === 2 && q.up.writes === 0 && q.up.pr === 0, `live race, headroom: the up-step is queued (level ${q.up.level}, queued → ${q.up.pending}); no applyQuality / setPixelRatio (${q.up.pr}), no ff_autoLevel write (${q.up.writes})`);
  ok(q.upApplied.level === 2 && q.upApplied.pending === null && q.upApplied.writes.join() === '2' && q.upApplied.pr === 1 && q.upApplied.stored === '2', `the first non-live frame applies it once (level 2, one setPixelRatio, one write, stored ${q.upApplied.stored})`);
  ok(q.mild.level === 0 && q.mild.pending === 1 && q.mild.writes === 0 && q.mild.pr === 0, `live race, a mild slowdown (45 fps): queued, not applied (level ${q.mild.level}, queued → ${q.mild.pending})`);
  ok(q.severe.level === 2 && q.severe.pending === null && q.severe.writes === 1 && q.severe.pr === 1, `live race, a severe slowdown (22 fps): still applied at once (level ${q.severe.level}, one change)`);
  ok(q.atStart.level === 3 && q.atStart.pending === null && q.atStart.writes.join() === '3' && q.atStart.state === 'load', `a queued change is applied when the next race starts, behind the loading gates (level ${q.atStart.level}, race state ${q.atStart.state})`);
  ok(q.fixedPreset.pending === null && q.fixedPreset.level === 2, 'a fixed preset (not AUTO) discards a queued change and never applies it');

  // physics independence: the same race at full quality and at the lowest AUTO level finishes identically
  const phys = await p.evaluate(() => {
    const run = lvl => { GFX.setAuto(lvl, 'test'); startRace(Object.assign(quickCfg(), { distance: 1600, field: 12, track: 'randwick', incidents: 'off', allBots: true, seed: 77 }));
      race.state = 'count'; race.openGates(); let n = 0, now = performance.now(); lastT = now; while (race.state !== 'done' && n++ < 4000) frame(now += 16.667); while (race.state !== 'done') race.step(SIM_DT);
      return race.finishOrder.map(h => h.def.name + ':' + h.finishTime.toFixed(4)).join('|'); };
    const a = run(0), z = run(GFX.AUTO_STEPS.length - 1); GFX.setAuto(0, 'test'); return { same: a === z, a: a.slice(0, 60) };
  });
  ok(phys.same, `identical result at full quality and at the lowest AUTO level (finish order and times: ${phys.a}…)`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
