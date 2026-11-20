// The player keeps shoving into the horse alongside (advanced steering, incidents full): when the player goes down,
// the horse being shoved must go down with them.
const S = require('./loadsim')(process.argv[2]); const X = S.extra;
const shove = (rem, d, h, r) => { const sp = { e: 0.85, steer: 0 }; let side = 0; for (const o of r.horses) if (o !== h && !o.fallen && Math.abs(o.progress - h.progress) < 2.5 && Math.abs(o.laneF - h.laneF) < 1.3) side = Math.sign(o.laneF - h.laneF) || 1; sp.steer = side; return sp; };
let falls = 0, withVictim = 0, n = 0; const extra = [];
for (let s = 0; s < 24; s++) {
  const r = X.simRace({ distance: 1600, horse: s % 12, diff: 'medium', going: ['good', 'heavy'][s % 2], seed: 9100 + s * 17, pacing: shove, tapping: 'average', steerMode: 'advanced', incidents: 'full' });
  n++; const p = r.player; if (!p.fallen) continue; falls++;
  const ev = r.events.filter(e => e.type === 'collision' && e.other === p && /pushed over/.test(e.h.fallCause || ''));
  if (ev.length) withVictim++;
  extra.push(`${p.fallCause} → ${r.dnfs.filter(h => h !== p).map(h => h.def.name + ' (' + h.fallCause + ')').join(', ') || 'nobody else'}`);
}
console.log(`${n} races shoving into a rival: player fell in ${falls}; the shoved horse went down too in ${withVictim} of those`);
extra.slice(0, 8).forEach(x => console.log('  ' + x));
