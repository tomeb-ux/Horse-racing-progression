// incident calibration: (1) normal all-bot racing, (2) the player's riding — safe vs dangerous manoeuvres
const S = require('./loadsim')(process.argv[2]); const X = S.extra, P = X.PACING;
const mode = process.argv[3] || 'all', N = +(process.argv[4] || 60);
const isBend = r => { const h = r.player; return S.Race.prototype.constructor && (((r.startD + h.progress) % 1654.0)); };
function count(r, who) { const c = { stumble: 0, 'major stumble': 0, fall: 0, 'heavy contact': 0, contact: 0, heels: 0 }; for (const e of r.events) if (!who || e.h === who) c[e.type] = (c[e.type] || 0) + 1; return c; }
if (mode === 'all' || mode === 'bots') {
  const goings = ['firm', 'good', 'soft', 'heavy'], dists = [1000, 1600, 2400, 3200], diffs = ['easy', 'medium', 'hard'];
  const tot = { races: 0, stumble: 0, 'major stumble': 0, fall: 0, 'heavy contact': 0, contact: 0, heels: 0, racesWithFall: 0, racesWithMajor: 0, emerg: 0, minStab: [] };
  const byGoing = {};
  for (let s = 0; s < N; s++) {
    const going = goings[s % 4], dist = dists[(s >> 2) % 4], diff = diffs[s % 3];
    const r = X.simRace({ distance: dist, horse: s % 12, diff, going, seed: 51000 + s * 97, incidents: 'full' });
    const c = count(r); tot.races++; for (const k in c) tot[k] = (tot[k] || 0) + c[k];
    if (c.fall) tot.racesWithFall++; if (c['major stumble']) tot.racesWithMajor++; tot.emerg += r.emerg;
    const g = byGoing[going] = byGoing[going] || { races: 0, stumbles: 0, majors: 0, falls: 0 }; g.races++; g.stumbles += c.stumble; g.majors += c['major stumble']; g.falls += c.fall;
  }
  console.log('ALL-BOT RACES, incidents FULL:', JSON.stringify({ races: tot.races, perRace: { stumbles: +(tot.stumble / tot.races).toFixed(2), majors: +(tot['major stumble'] / tot.races).toFixed(3), falls: +(tot.fall / tot.races).toFixed(3), heavyContacts: +(tot['heavy contact'] / tot.races).toFixed(2), contacts: +(tot.contact / tot.races).toFixed(2), heels: +(tot.heels / tot.races).toFixed(2) }, racesWithFall: tot.racesWithFall, racesWithMajor: tot.racesWithMajor, emergencies: tot.emerg }));
  console.table(byGoing);
}
if (mode === 'all' || mode === 'player') {
  const T0 = 450, R0 = 120, LAP = 2 * T0 + 2 * Math.PI * R0;
  const turn = (r, h) => { const d = ((r.startD + h.progress) % LAP + LAP) % LAP; return (d >= T0 && d < T0 + Math.PI * R0) || d >= 2 * T0 + Math.PI * R0; };
  const base = (rem, d, h, r) => ({ e: rem > 600 ? Math.max(h.comfort() + 0.04, 0.8) : 1, drive: rem < 250 });
  const scen = {
    'flat out, no steering (speed alone)': (rem, d, h, r) => ({ e: 1, drive: true, steer: 0 }),
    'normal racing (reactive)': P.reactive,
    'one lane change per bend': (rem, d, h, r) => { const sp = base(rem, d, h, r); const b = turn(r, h); h._lc = h._lc || 0; sp.steer = b && (r.clock % 12) < 0.9 ? (h.laneF > 3 ? -1 : 1) : 0; return sp; },
    'weave hard on bends (A/D every 0.6s)': (rem, d, h, r) => { const sp = base(rem, d, h, r); sp.steer = turn(r, h) ? (Math.floor(r.clock / 0.6) % 2 ? 1 : -1) : 0; return sp; },
    'weave 2s then straighten (recover)': (rem, d, h, r) => { const sp = base(rem, d, h, r); sp.steer = turn(r, h) && (r.clock % 8) < 2 ? (Math.floor(r.clock / 0.6) % 2 ? 1 : -1) : 0; return sp; },
    'snatch up (Q) mid-bend repeatedly': (rem, d, h, r) => { const sp = base(rem, d, h, r); sp.steer = 0; sp.restrain = turn(r, h) && (r.clock % 4) < 1; return sp; },
    'force into horse alongside (hold steer)': (rem, d, h, r) => { const sp = base(rem, d, h, r); let side = 0; for (const o of r.horses) if (o !== h && Math.abs(o.progress - h.progress) < 2.5 && Math.abs(o.laneF - h.laneF) < 1.3) side = Math.sign(o.laneF - h.laneF) || 1; sp.steer = side; return sp; },
  };
  const rows = {};
  for (const going of ['good', 'heavy']) for (const [name, fn] of Object.entries(scen)) {
    for (const [hi, hl] of [[7, 'agile'], [9, 'less agile']]) {
      const c = { stumble: 0, 'major stumble': 0, fall: 0, 'heavy contact': 0, contact: 0 }; let minStab = 0, n = 0, place = 0, dnf = 0;
      for (let s = 0; s < 8; s++) {
        const r = X.simRace({ distance: 1600, horse: hi, diff: 'medium', going, seed: 7700 + s * 13, pacing: fn, tapping: 'average', steerMode: 'advanced', incidents: 'full' });
        const cc = count(r, r.player); for (const k in c) c[k] += cc[k] || 0; minStab += r.player.lowStab; n++; if (r.player.dnf) dnf++; else place += r.finishOrder.indexOf(r.player) + 1;
      }
      rows[`${going} · ${name} · ${hl}`] = { stumbles: +(c.stumble / n).toFixed(2), majors: +(c['major stumble'] / n).toFixed(2), falls: dnf + '/' + n, contacts: +((c.contact + c['heavy contact']) / n).toFixed(1), 'lowest stab': +(minStab / n).toFixed(2), 'avg place (finishers)': n - dnf ? +(place / (n - dnf)).toFixed(1) : '—' };
    }
  }
  console.log('PLAYER RIDING, advanced steering, incidents FULL, 8 races × 1600 m each'); console.table(rows);
}
