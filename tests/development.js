// Long-term development by simulation (Phase 9): years of calendar with the real career-core rules — weekly training plans, racing experience, fatigue, soreness, ageing.
// Checks the owner's brief: noticeable but GRADUAL progress (about 3–4 seasons to approach potential), individual rates, real trade-offs, nothing past potential.   node tests/development.js
const S = require('../public/season.js'), K = require('../public/career-core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
const AK = ['top', 'acc', 'end', 'spr', 'rec', 'tem', 'agi', 'sta'], BASE = 54, START_POOL = 136, START_CAP = 84, POT_POOL = 168, POT_CAP = 98;
const TPL = { mile: { top: 20, acc: 16, spr: 18, end: 18, rec: 14, tem: 16, agi: 18, sta: 16 }, sprint: { top: 22, acc: 26, spr: 22, sta: 24, agi: 12, tem: 10, end: 10, rec: 10 }, stay: { end: 30, rec: 26, top: 18, tem: 22, spr: 10, acc: 8, agi: 10, sta: 12 } };
function create(id, t) { const w = TPL[t], sum = AK.reduce((s, x) => s + w[x], 0), a = {}; let left = START_POOL; for (const x of AK) { const v = Math.min(START_CAP - BASE, Math.floor(START_POOL * w[x] / sum)); a[x] = BASE + v; left -= v; }
  for (const x of AK.slice().sort((p, q) => w[q] - w[p])) { if (left <= 0) break; const add = Math.min(left, START_CAP - a[x]); a[x] += add; left -= add; }
  const ww = {}; for (const x of AK) ww[x] = Math.max(1, a[x] - BASE + 4); const s2 = AK.reduce((s, x) => s + ww[x], 0), pot = {}; let pl = POT_POOL;
  for (const x of AK) { const hr = Math.min(POT_CAP - a[x], Math.floor(POT_POOL * ww[x] / s2)); pot[x] = a[x] + hr; pl -= hr; }
  for (let g = 0; pl > 0 && g < 500; g++) { const x = AK.filter(y => pot[y] < POT_CAP).sort((p, q) => ww[q] - ww[p])[g % 3]; if (!x) break; pot[x]++; pl--; }
  return { id, name: id, attrs: a, pot, look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, silk: '#fff', silk2: '#000', silkPat: 'solid', xp: 0, trainPts: 0, lvl: 1, xpFrac: 0, races: 0, wins: 0, places: 0, podiums: 0, history: [], born: 1, w }; }
function spend(h) { for (let g = 0; g < 400; g++) { let best = null, bs = -1; for (const x of AK) { if (h.attrs[x] >= h.pot[x]) continue; const c = S.upgCost(h.attrs[x]); if (c > h.trainPts) continue; const sc = h.w[x] / c; if (sc > bs) { bs = sc; best = x; } } if (!best) break; h.trainPts -= S.upgCost(h.attrs[best]); h.attrs[best]++; } }
const rating = a => AK.reduce((s, x) => s + a[x], 0) / 8;

function run(label, o) {
  const C = K.fresh(555); const h = create('h1', o.tpl || 'mile'); C.horses = [h]; S.migrate(C); K.migrate(C, { from: 4 }); K.fillHorse(h, C, { age: 3, fitness: 100 }); C.cal.events.forEach(e => { if (e.kind === 'round') e.day = 99999; });
  K.apply(C, 'sim:fund', 5000000, 'gift', 'sim'); if (o.trainer) { K.hireStaff(C, 'trainer', o.trainer, 'all-rounder'); } if (o.fac) { for (const k of ['training', 'track', 'recovery', 'gates']) for (let i = 0; i < o.fac; i++) K.buyFacility(C, k); }
  K.setPlan(C, 'h1', o.plan || 'balanced', o.int || 1); const head0 = AK.reduce((a, k) => a + (h.pot[k] - h.attrs[k]), 0), att0 = Object.assign({}, h.attrs), out = { label, pct: [], rating: [], setbacks: 0, minFit: 100 };
  C.day = 0; K.econOf(C).paidWeek = 0;
  for (let season = 1; season <= 5; season++) {
    for (let w = 0; w < 52; w++) {
      if (o.race !== false && w % 3 === 2) {                              // a race every third week: experience, fatigue, a taper beforehand (the plan's own taper needs a booking)
        const xp = S.xpFor({ tier: 1, oppAvg: rating(h.attrs) - 1, rating: rating(h.attrs), place: 3, field: 10, dnf: false, optional: false }); h.xpFrac += xp / S.XP_PER_PT * K.DEV.RACE_XP_SCALE; const tp = Math.floor(h.xpFrac); h.xpFrac -= tp; h.trainPts += tp; spend(h);
        h.fitness = Math.max(0, h.fitness - 10);
      }
      const before = K.devRec(C, h).sore; K.advance(C, 7, { force: true }); if (K.devRec(C, h).sore > before) out.setbacks++; out.minFit = Math.min(out.minFit, h.fitness);
    }
    const head = AK.reduce((a, k) => a + (h.pot[k] - h.attrs[k]), 0); out.pct.push(Math.round(100 * (head0 - head) / head0)); out.rating.push(+rating(h.attrs).toFixed(1));
    if (AK.some(k => h.attrs[k] > h.pot[k])) out.overPot = true;
  }
  out.dev = K.devReport(C, h); out.atts = att0; console.log(`${label.padEnd(34)} headroom closed by season 1–5: ${out.pct.join('% · ')}%  · rating ${out.rating.join(' → ')} · setbacks ${out.setbacks} · min fitness ${out.minFit}`); return out;
}
const A = run('balanced, light, no staff', {}), B = run('balanced, normal, trainer 2', { int: 2, trainer: 2 }), Bf = run('balanced, normal, trainer 2, facilities 2', { int: 2, trainer: 2, fac: 2 }), Hd = run('balanced, HARD, trainer 2', { int: 3, trainer: 2 }),
  Rst = run('rest (racing experience only)', { plan: 'rest' }), Sp = run('sprinter, speed plan, normal', { tpl: 'sprint', plan: 'speed', int: 2, trainer: 1 }), St = run('stayer, stamina plan, normal', { tpl: 'stay', plan: 'stamina', int: 2, trainer: 1 });
ok(B.pct[0] >= 12 && B.pct[0] <= 40, `after ONE season of good training a horse has closed ${B.pct[0]}% of its headroom — noticeable, not maxed`);
ok(B.pct[2] >= 55 && B.pct[2] <= 92, `after THREE seasons ${B.pct[2]}% — most of the way`); ok(B.pct[3] >= 68, `after FOUR seasons ${B.pct[3]}% — approaching potential (the owner's 3–4 seasons)`);
ok(B.pct[4] <= 100 && B.pct[4] >= B.pct[3], 'it keeps creeping up towards the ceiling and never passes it (' + B.pct[4] + '%)');
ok(A.pct[0] < B.pct[0] && A.pct[3] < B.pct[3], `a light, unmanaged plan develops a horse more slowly than a managed one (${A.pct[3]}% vs ${B.pct[3]}% at season 4)`);
ok(Bf.pct[0] >= B.pct[0] && Bf.pct[2] <= B.pct[2] + 14, `facilities help a little but cannot buy unlimited speed (season 1: ${Bf.pct[0]}% vs ${B.pct[0]}%; season 3: ${Bf.pct[2]}% vs ${B.pct[2]}%)`);
ok(Hd.setbacks > B.setbacks && Hd.pct[3] <= B.pct[3] + 6, `training too hard backfires: ${Hd.setbacks} sore spells (vs ${B.setbacks}) and no faster development (${Hd.pct[3]}% vs ${B.pct[3]}%)`);
ok(Rst.pct[0] < B.pct[0] && Rst.pct[3] < B.pct[3], `racing alone develops a horse more slowly than racing plus training (${Rst.pct[3]}% vs ${B.pct[3]}% at season 4)`);
ok([A, B, Bf, Hd, Rst, Sp, St].every(r => !r.overPot), 'no attribute ever went past its potential');
ok([A, B, Bf, Rst].every(r => r.minFit >= 45), 'sensible plans keep the horse fit enough to train and race (min fitness ' + Math.min(A.minFit, B.minFit, Bf.minFit, Rst.minFit) + ')');
ok(Sp.dev.rows.find(r => r.k === 'spr').v - Sp.atts.spr > St.dev.rows.find(r => r.k === 'spr').v - St.atts.spr && St.dev.rows.find(r => r.k === 'end').v - St.atts.end > Sp.dev.rows.find(r => r.k === 'end').v - Sp.atts.end, 'the plan shapes the horse: a speed plan builds sprint power, a stamina plan builds endurance');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
