// does riding a horse to its knack pay? same horse, same seeds: ridden to its tip vs ridden against it
const S = require('./loadsim')(process.argv[2]); const X = S.extra, P = X.PACING;
const N = +(process.argv[3] || 16);
const plans = {
  lead:    [(rem, d, h, r) => ({ e: rem > 500 ? (r.leaderProgress - h.progress < 1.5 ? h.comfort() + 0.03 : h.comfort() + 0.12) : 1, drive: rem < 200 }), (rem, d, h, r) => ({ e: rem > 450 ? h.comfort() - 0.1 : 1, drive: rem < 200 })],
  settled: [P.reactiveSettled, P.reactive],
  even:    [(rem, d, h) => ({ e: rem > 400 ? h.comfort() + 0.03 : 1, drive: rem < 200 }), (rem, d, h, r) => ({ e: rem > 400 ? (Math.floor(r.clock / 5) % 2 ? h.comfort() + 0.15 : h.comfort() - 0.1) : 1, drive: rem < 200 })],
  back:    [(rem, d, h, r) => rem > 800 ? { e: h.comfort() - 0.02 } : P.reactive(rem, d, h, r), (rem, d, h, r) => rem > 800 ? { e: Math.max(h.comfort() + 0.12, 0.85) } : P.reactive(rem, d, h, r)],
  cover:   [P.reactive, (rem, d, h) => ({ e: rem > 500 ? Math.max(h.comfort() + 0.12, 0.85) : 1, drive: rem < 200 })],
  rail:    [(rem, d, h, r) => { h.targetLane = 0; return P.reactive(rem, d, h, r); }, (rem, d, h, r) => { h.targetLane = 6; return P.reactive(rem, d, h, r); }],
};
const rows = {};
S.ROSTER.forEach((def, hi) => {
  const K = S.KNACK[def.name]; if (!K || !plans[K.cond]) return;
  const res = [0, 1].map(k => { let pl = 0; for (let s = 0; s < N; s++) { const dist = [1200, 1600, 2000, 2400][s % 4]; const r = X.simRace({ distance: dist, horse: hi, diff: 'medium', seed: 9100 + s * 31, pacing: plans[K.cond][k], tapping: 'average' }); pl += r.finishOrder.indexOf(r.player) + 1; } return pl / N; });
  rows[def.name] = { knack: K.cond, 'avg place ridden right': +res[0].toFixed(2), 'ridden wrong': +res[1].toFixed(2), gain: +(res[1] - res[0]).toFixed(2) };
});
console.log(`Same horse, same ${N} races (1200–2400 m, medium): ridden to its knack vs against it`); console.table(rows);
