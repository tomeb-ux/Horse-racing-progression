// Long race (Melbourne Cup, 3200 m, 24 runners, full crowd) through the real frame loop: JS heap and per-frame CPU
// sampled over the whole race — no growth trend (leak) and no worsening frame cost as it goes on.
//   PORT=8095 node server/index.js ; PORT=8095 node tests/longrace-browser.js
const { chromium } = require('playwright'); const fs = require('fs');
const PORT = +(process.env.PORT || 8095), BASE = `http://localhost:${PORT}/`;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await b.newContext({ viewport: { width: 480, height: 270 } });
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ body: fs.readFileSync(__dirname + '/../public/vendor/three.min.js'), contentType: 'text/javascript' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { localStorage.setItem('ff_sound', 'false'); localStorage.setItem('ff_autoReplay', 'false'); localStorage.setItem('ff_eleven', JSON.stringify({ mode: 'eleven' })); window.__noPresent = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => typeof startRace === 'function');
  const R = await p.evaluate(async () => {
    window.requestAnimationFrame = () => 0;
    const R0 = renderer.render.bind(renderer); let k = 0; renderer.render = (s, c) => { if (k++ % 8 === 0) R0(s, c); };   // draw every 8th frame (software GL)
    startRace(Object.assign(quickCfg(), { distance: 3200, field: 24, track: 'flemington', incidents: 'off', allBots: true, seed: 3, career: { name: 'Melbourne Cup', venue: 'Flemington', major: true, crown: true } }));
    let now = performance.now(); lastT = now; const heap = [], cpu = []; let n = 0;
    while (race.state !== 'done' && n < 30000) {
      const a = performance.now(); frame(now += 16.667); const d = performance.now() - a; if (k % 8 !== 1) cpu.push(d);
      if (n % 600 === 0) { if (window.gc) window.gc(); heap.push(+(performance.memory.usedJSHeapSize / 1048576).toFixed(1)); }
      n++; if (n % 200 === 0) await new Promise(r => setTimeout(r, 0));
    }
    const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(f * a.length)];
    const third = Math.floor(cpu.length / 3), early = cpu.slice(0, third), late = cpu.slice(-third);
    return { frames: n, state: race.state, winner: race.finishOrder[0] && race.finishOrder[0].def.name, heap, early: [q(early, 0.5), q(early, 0.95)], late: [q(late, 0.5), q(late, 0.95)], lines: ELEVEN.stats.lines, voiced: ELEVEN.stats.voiced };
  });
  console.log('   heap (MB, every 10 s of race):', R.heap.join(' '));
  ok(R.state === 'done' && R.frames > 10000, `Melbourne Cup run to the finish through ${R.frames} frames (${(R.frames / 60).toFixed(0)} s of race); winner ${R.winner}`);
  const h = R.heap.slice(2), first = Math.min(...h.slice(0, 3)), last = Math.max(...h.slice(-3));
  ok(last - first < 12, `no heap growth trend: ${first} MB early → ${last} MB late (after GC)`);
  ok(R.late[0] < R.early[0] * 1.5 + 0.5 && R.late[1] < R.early[1] * 1.5 + 1, `per-frame CPU does not worsen: first third median ${R.early[0].toFixed(2)} ms / p95 ${R.early[1].toFixed(2)} ms, last third ${R.late[0].toFixed(2)} / ${R.late[1].toFixed(2)} ms`);
  ok(R.lines > 10, `commentary ran throughout (${R.lines} lines, ${R.voiced} voiced with the ElevenLabs recordings)`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
