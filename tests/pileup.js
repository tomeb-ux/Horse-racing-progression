// Force one horse in the pack to fall mid-race (all-bot races) and see who else goes down, by where they were at that moment.
const S = require('./loadsim')(process.argv[2]); const X = S.extra, R = S.Race;
const mode = process.argv[3] || 'full', N = +(process.argv[4] || 40);
let falls = 0, hist = {}, finished = 0, stumbles = 0;
const zones = {};   // where each runner was when the horse fell → [down, stayed up]
const zone = (dp, dl) => dp > 4 ? 'ahead' : Math.abs(dl) > 2.2 ? 'well wide' : dp > -3.5 ? 'alongside' : dp > -15 ? '0–15 m behind' : dp > -30 ? '15–30 m behind' : dp > -50 ? '30–50 m behind' : '50 m+ behind';
for (let s = 0; s < N; s++) {
  const orig = R.prototype.simStep; let done = false, snap = null, F = null;
  R.prototype.simStep = function (dt) {
    if (!done && this.clock > 25) {
      F = this.order[Math.min(this.order.length - 3, 2 + (s % 4))];
      if (F && !F.finished) { snap = this.horses.filter(h => h !== F && !h.fallen && !h.finished).map(h => [h, zone(h.progress - F.progress, h.laneF - F.laneF)]); F.cause = "test"; F.fall(this, s % 2 ? 1 : -1); } done = true;
    }
    orig.call(this, dt);
  };
  const r = X.simRace({ distance: 1600, horse: s % 12, diff: ['easy', 'medium', 'hard'][s % 3], going: ['good', 'heavy'][s % 2], seed: 6100 + s * 31, incidents: mode });
  R.prototype.simStep = orig;
  const f = r.events.filter(e => e.type === 'fall').length - 1; falls += f; hist[f] = (hist[f] || 0) + 1;
  stumbles += r.events.filter(e => e.type === 'collision' && !e.h.fallen).length;
  if (snap) for (const [h, z] of snap) { const Z = zones[z] = zones[z] || [0, 0]; Z[h.fallen ? 0 : 1]++; }
  if (r.finishOrder.length) finished++;
}
console.log(`${N} races, one horse forced down mid-pack at 25 s (incidents ${mode}):`);
console.log(' extra fallers per race:', (falls / N).toFixed(2), '· races by number of extra fallers:', JSON.stringify(hist), '· hit it but stayed up:', stumbles, '· races that still finished:', finished + '/' + N);
console.log(' where the other runners were when it fell → share that went down too:');
for (const z of ['alongside', '0–15 m behind', '15–30 m behind', '30–50 m behind', '50 m+ behind', 'well wide', 'ahead']) if (zones[z]) console.log(`   ${z.padEnd(16)} ${(100 * zones[z][0] / (zones[z][0] + zones[z][1])).toFixed(0).padStart(3)}% of ${zones[z][0] + zones[z][1]}`);
