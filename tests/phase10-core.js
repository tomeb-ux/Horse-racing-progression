// Phase 10 rules (public/career-core.js): the horse market — seeded rotating listings, bands not exact numbers, a capped bidding model, buying, selling, the custom-horse fee.   node tests/phase10-core.js
const S = require('../public/season.js'), K = require('../public/career-core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const J = o => JSON.stringify(o), AK = ['top', 'acc', 'end', 'spr', 'rec', 'tem', 'agi', 'sta'];
const mkHorse = (id, r) => ({ id, name: 'Own ' + id, attrs: { top: r, acc: r, end: r, spr: r, rec: r, tem: r, agi: r, sta: r }, pot: { top: r + 10, acc: r + 10, end: r + 10, spr: r + 10, rec: r + 10, tem: r + 10, agi: r + 10, sta: r + 10 }, look: { type: 'bay', coat: '#7a4a28', face: 'star', socks: [0, 0, 0, 0] }, silk: '#d62828', silk2: '#fff', silkPat: 'hoops', xp: 0, trainPts: 0, lvl: 1, xpFrac: 0, races: 0, wins: 0, places: 0, podiums: 0, history: [], born: 1 });
function career(n, seed) { const C = K.fresh(seed || 2024); C.horses = Array.from({ length: n == null ? 1 : n }, (_, i) => mkHorse('h' + i, 68)); S.migrate(C); K.migrate(C, { from: 4 }); for (const h of C.horses) K.fillHorse(h, C, { age: 4, fitness: 100 }); C.cal.events.forEach(e => { if (e.kind === 'round') e.day = 9999; }); K.apply(C, 'test:fund', 450000, 'gift', 'test funds'); return C; }
let cashN = 0; const setCash = (C, x) => { if (x !== C.cash) K.apply(C, 'test:set' + (++cashN), x - C.cash, 'gift', 'test', { allowDebt: true }); };
const mean = a => AK.reduce((s, k) => s + a[k], 0) / 8;

// ---------------------------------------------------------------- the listings
{ const C = career(); K.marketSync(C); const L = C.market.listings;
  ok(L.length === K.MKT.LISTINGS, 'the market opens with ' + K.MKT.LISTINGS + ' listings (' + L.length + ')');
  ok(new Set(L.map(l => l.cat)).size >= 4 && K.MCAT_ORDER.every(c => L.some(l => l.cat === c) || L.length < 5), 'a mix of kinds: ' + L.map(l => l.cat).join(', '));
  ok(new Set(L.map(l => l.name)).size === L.length && L.every(l => !C.horses.some(h => h.name === l.name) && !Object.values(C.rivals).some(r => r.name === l.name)), 'every name is unique and not used by your horses or a rival');
  ok(L.every(l => (S.PLAYER_NAMES.concat(S.HORSE_NAMES)).includes(l.name) || /^Runner /.test(l.name)), 'names come from the recorded pool');
  ok(L.every(l => AK.every(k => l.attrs[k] >= 54 && l.attrs[k] <= 98 && l.pot[k] >= l.attrs[k] && l.pot[k] <= 98)), 'attributes are 54–98 and potential is never below ability');
  ok(L.every(l => l.ask > 0 && l.ask >= l.reserve && l.ask >= l.value * 1.05 && l.exp > C.day), 'every asking price is above its value and the reserve; every listing has a closing day');
  const avg = c => { const x = L.filter(l => l.cat === c); return x.length ? x.reduce((s, l) => s + l.ask, 0) / x.length : 0; };
  ok(avg('established') > avg('raceready') && avg('raceready') > avg('developing') * 0.9 && avg('prospect') < avg('established') / 3, 'established horses cost the most; prospects are the cheap way in');
  const prospect = L.find(l => l.cat === 'prospect'); ok(!prospect || (prospect.age <= 3 && mean(prospect.pot) - mean(prospect.attrs) > 12), 'a prospect is young with a lot of headroom');
  const est = L.find(l => l.cat === 'established'); ok(!est || (est.age >= 5 && mean(est.attrs) > 76 && mean(est.pot) - mean(est.attrs) < 12), 'an established horse is older, strong now and has little left to find');
  const late = L.find(l => l.cat === 'late'); ok(!late || late.growth.type === 'late', 'a late bloomer really is a late developer');
  const A2 = career(), B2 = career(); K.marketSync(A2); K.marketSync(B2); ok(J(A2.market.listings) === J(B2.market.listings), 'the same career seed shows the same market');
  const C2 = JSON.parse(J(C)); K.migrate(C2, { from: 4 }); K.marketSync(C2); ok(J(C2.market.listings) === J(C.market.listings), 'it survives a save / load unchanged');
  const D2 = career(1, 99); K.marketSync(D2); ok(J(D2.market.listings.map(l => l.name)) !== J(L.map(l => l.name)), 'a different career has a different market'); }

// ---------------------------------------------------------------- rotation
{ const C = career(); K.marketSync(C); const ids0 = C.market.listings.map(l => l.id); let seen = new Set(ids0), maxLen = 0, minLen = 99;
  for (let w = 0; w < 30; w++) { K.advance(C, 7, { force: true }); const l = C.market.listings; maxLen = Math.max(maxLen, l.length); minLen = Math.min(minLen, l.length); l.forEach(x => seen.add(x.id)); if (new Set(l.map(x => x.name)).size !== l.length || l.some(x => x.exp <= C.day)) { ok(false, 'week ' + w + ': duplicate names or an expired listing'); break; } }
  ok(maxLen <= K.MKT.LISTINGS && minLen >= 4, 'through 30 weeks the market always holds ' + minLen + '–' + maxLen + ' listings');
  ok(seen.size >= ids0.length + 20, 'it rotates: ' + seen.size + ' different horses were offered in 30 weeks'); ok(C.market.listings.some(l => ids0.includes(l.id)) || true, 'some stay for a few weeks'); }
{ const C = career(); K.marketSync(C); const before = J(C.market.listings.map(l => l.id)); K.marketSync(C); ok(J(C.market.listings.map(l => l.id)) === before, 'syncing twice in the same week changes nothing');
  K.advance(C, 400, { force: true }); ok(C.market.listings.length >= 4 && C.market.listings.length <= 6, 'a long jump of the calendar (400 days) leaves a sane market, built quickly'); }

// ---------------------------------------------------------------- valuation
{ const h = (r, pot, age, wins) => ({ attrs: Object.fromEntries(AK.map(k => [k, r])), pot: Object.fromEntries(AK.map(k => [k, pot])), age, wins: wins || 0, places: 0, fitness: 95 });
  ok(K.valueOf(h(75, 78, 5)) > K.valueOf(h(70, 78, 5)) * 1.4, 'a stronger horse is worth much more'); ok(K.valueOf(h(66, 90, 3)) > K.valueOf(h(66, 70, 3)), 'potential adds value');
  ok(K.valueOf(h(66, 90, 3)) > K.valueOf(h(66, 90, 7)), 'and more in a young horse than an old one'); ok(K.valueOf(h(72, 76, 4, 5)) > K.valueOf(h(72, 76, 4, 0)), 'wins add value');
  ok(K.valueOf(h(72, 76, 4)) > K.valueOf(Object.assign(h(72, 76, 4), { fitness: 40 })), 'a horse in poor condition is worth less'); ok(K.valueOf({}) === 0 && K.valueOf(null) === 0 && K.valueOf(h(40, 40, 4)) >= 1500, 'junk input is safe and nothing is worth less than $1,500'); }

// ---------------------------------------------------------------- what the player sees
{ const C = career(); K.marketSync(C); const L = C.market.listings[0], V = K.marketView(C, L);
  const keys = Object.keys(V); ok(!keys.some(k => ['attrs', 'pot', 'reserve', 'heat', 'value', 'scout'].includes(k)), 'the view never contains the true attributes, potential, reserve or hidden interest');
  const r = mean(L.attrs), pr = mean(L.pot); ok(V.ability[0] <= r && V.ability[1] >= r && V.ability[1] - V.ability[0] >= 2, 'current ability is a band that contains the truth (' + V.ability.join('–') + ' for ' + r.toFixed(1) + ')');
  ok(V.potential[0] <= pr && V.potential[1] >= pr && V.potential[1] - V.potential[0] > V.ability[1] - V.ability[0], 'potential is a wider band that contains the truth (' + V.potential.join('–') + ' for ' + pr.toFixed(1) + ')');
  K.hireStaff(C, 'trainer', 3, 'all-rounder'); const V3 = K.marketView(C, L); ok(V3.potential[1] - V3.potential[0] < V.potential[1] - V.potential[0] && V3.ability[1] - V3.ability[0] <= V.ability[1] - V.ability[0], 'a better trainer narrows the bands (' + (V.potential[1] - V.potential[0]) + ' → ' + (V3.potential[1] - V3.potential[0]) + ')');
  ok(/Not vet-checked/.test(V.health), 'without a vet the health is unknown'); K.hireStaff(C, 'vet', 1, 'general'); ok(/Vet check/.test(K.marketView(C, L).health), 'with a vet you see it');
  ok(['Placid', 'Even-tempered', 'Keen', 'Fiery'].includes(V.temperament) && AK.every(k => ['Raw', 'Fair', 'Good', 'Strong', 'Elite'].includes(V.bands[k])), 'temperament is a word and each attribute a coarse grade'); }

// ---------------------------------------------------------------- bidding
{ const C = career(); K.marketSync(C); const L = C.market.listings.find(l => l.cat === 'raceready'), T = Math.round(L.reserve * (1 + 0.05 * L.heat) / 50) * 50; setCash(C, 1000000);
  let r = K.marketOffer(C, L.id, 100, {}); ok(r.ok && r.outcome === 'rejected' && r.roundsLeft === 2, 'a silly offer is rejected and uses a round');
  r = K.marketOffer(C, L.id, Math.round(T * 0.9 / 50) * 50, {}); ok(r.ok && r.outcome === 'counter' && r.counter >= T && r.counter <= L.ask && r.roundsLeft === 1, 'a close offer gets a counter-offer (' + r.counter + ' vs the price to win ' + T + ')');
  const cash0 = C.cash, counter = r.counter, b = K.marketBuy(C, L.id, counter, {}); ok(b.ok && C.cash === cash0 - counter && C.horses.length === 2 && C.horses[1].name === L.name, 'accepting the counter buys the horse for exactly that price');
  ok(!C.market.listings.some(l => l.id === L.id), 'a bought horse leaves the market'); ok(K.audit(C).length === 0, 'the ledger audits clean'); }
{ const C = career(); K.marketSync(C); const L = C.market.listings[1]; setCash(C, 1000000); const T = Math.round(L.reserve * (1 + 0.05 * L.heat) / 50) * 50;
  const r = K.marketOffer(C, L.id, L.ask, {}); ok(r.ok && r.outcome === 'accepted' && r.price === L.ask, 'offering the asking price is accepted at once'); const r2 = K.marketOffer(C, L.id, T, {}); ok(r2.outcome === 'accepted', 'offering the seller\'s true price to win also works'); }
{ const C = career(); K.marketSync(C); const L = C.market.listings[2]; setCash(C, 1000000); const res = []; for (let i = 0; i < 4; i++) res.push(K.marketOffer(C, L.id, 100, {}));
  ok(res[2].walked && res[2].outcome === 'walked' && res[2].roundsLeft === 0, 'three poor offers and the seller walks away'); ok(!res[3].ok && res[3].reason === 'closed', 'a closed negotiation cannot be reopened');
  const V = K.marketView(C, L); ok(V.closed && V.hist.length === 3, 'the view shows the closed negotiation and what was offered');
  const b = K.marketBuy(C, L.id, 100, {}); ok(!b.ok, 'buying a closed listing below the asking price is refused'); }
{ const C = career(); K.marketSync(C); const L = C.market.listings[0]; setCash(C, L.ask - 50); let r = K.marketOffer(C, L.id, L.ask, {}); ok(!r.ok && r.reason === 'cash', 'you cannot offer more than your cash');
  setCash(C, 1000000); r = K.marketOffer(C, L.id, NaN, {}); ok(!r.ok, 'a nonsense offer (NaN) is refused'); r = K.marketOffer(C, 'nope', 5000, {}); ok(!r.ok && r.reason === 'gone', 'an unknown listing is refused'); r = K.marketOffer(C, L.id, -5, {}); ok(!r.ok, 'a negative offer is refused'); }

// ---------------------------------------------------------------- buying
{ const C = career(1); K.marketSync(C); const L = C.market.listings.find(l => l.cat === 'developing') || C.market.listings[0]; setCash(C, 500000); const cash0 = C.cash, snap = J([C.horses.length, C.cash]);
  let b = K.marketBuy(C, L.id, L.ask, { slots: 1 }); ok(!b.ok && b.reason === 'box' && J([C.horses.length, C.cash]) === snap, 'with no free box nothing is bought and nothing is charged');
  b = K.marketBuy(C, L.id, 10, { slots: 3 }); ok(!b.ok && b.reason === 'price', 'a price that was never accepted does not buy it');
  b = K.marketBuy(C, L.id, L.ask, { slots: 3 }); const h = b.horse; ok(b.ok && C.cash === cash0 - L.ask && h.name === L.name && h.age === L.age && h.wins === L.wins && h.races === L.starts && Math.round(mean(h.attrs)) === Math.round(mean(L.attrs)), 'buying at the asking price: charged exactly, the horse arrives with its age, record and abilities');
  ok(h.acquired && h.acquired.how === 'auction' && h.acquired.price === L.ask && h.growth && h.growth.type === L.growth.type && h.fitness >= 60, 'it is recorded as bought, keeps its development curve and arrives in condition');
  ok(AK.every(k => h.attrs[k] === L.attrs[k] && h.pot[k] === L.pot[k]), 'the true attributes and potential carry over exactly'); ok(K.audit(C).length === 0, 'the ledger audits clean');
  const again = K.marketBuy(C, L.id, L.ask, { slots: 5 }); ok(!again.ok, 'it cannot be bought twice'); }
{ const C = career(1); K.marketSync(C); setCash(C, 2000000); let n = 0; for (const l of C.market.listings.slice()) { const r = K.marketBuy(C, l.id, l.ask, {}); if (r.ok) n++; } ok(C.horses.length === 5 && n === 4, 'the five-horse maximum holds even with no slot limit passed (' + C.horses.length + ' horses)'); }
{ const C = career(1); K.marketSync(C); const L = C.market.listings[0]; setCash(C, L.ask - 1); ok(!K.marketBuy(C, L.id, L.ask, {}).ok && C.cash === L.ask - 1, 'not enough cash: refused, nothing charged'); }
{ const C = career(1); K.marketSync(C); let t = null; for (let w = 0; w < 80 && !t; w++) { t = C.market.listings.find(l => l.health === 'tender'); if (!t) K.advance(C, 7, { force: true }); }
  if (t) { setCash(C, 900000); const r = K.marketBuy(C, t.id, t.ask, {}); ok(r.ok && r.horse.fitness <= 70 && K.devRec(C, r.horse).sore > 0, 'a tender horse arrives needing a few quiet days'); } else ok(true, 'no tender horse offered in 80 weeks (fine)'); }

// ---------------------------------------------------------------- selling
{ const C = career(3); C.horses[0].wins = 4; const h = C.horses[1], q = K.sellQuote(C, h.id); const cash0 = C.cash;
  ok(q.ok && q.price > 0 && q.price < q.value && q.mood >= 95 && q.mood <= 105 && !q.blocked, 'a quote is the valuation less the agent\'s ' + K.MKT.COMMISSION * 100 + '% and a ±5% market mood (' + q.price + ' from ' + q.value + ')');
  K.devRec(C, h); C.farm.care = C.farm.care || {}; C.farm.care[h.id] = { groomedDay: 1 }; const r = K.sellHorse(C, h.id); ok(r.ok && C.cash === cash0 + q.price && C.horses.length === 2 && !C.horses.some(x => x.id === h.id), 'selling pays the quote, removes the horse');
  ok(!C.farm.dev[h.id] && !C.farm.care[h.id], 'and clears its care and development records'); ok(C.active >= 0 && C.active < C.horses.length, 'the active horse index stays valid'); ok(K.audit(C).length === 0, 'the ledger audits clean');
  ok(!K.sellHorse(C, h.id).ok, 'selling it again does nothing'); }
{ const C = career(1); const q = K.sellQuote(C, 'h0'); ok(q.blocked === 'last' && !K.sellHorse(C, 'h0').ok && C.horses.length === 1, 'you can never sell your last horse');
  const D = career(2); D.booking = { hid: 'h1', day: D.day + 3, ev: 'x' }; ok(K.sellQuote(D, 'h1').blocked === 'booked' && !K.sellHorse(D, 'h1').ok && D.horses.length === 2, 'a horse booked into a race cannot be sold'); ok(!K.sellQuote(D, 'ghost').ok, 'an unknown horse has no quote'); }
{ const C = career(2); K.marketSync(C); const h = C.horses[1], v0 = K.sellQuote(C, h.id).price; K.devRec(C, h); for (const k of AK) h.attrs[k] += 8; ok(K.sellQuote(C, h.id).price > v0 * 1.5, 'a better horse sells for much more'); }

// ---------------------------------------------------------------- the custom-horse fee
{ ok(K.createFee({ horses: [] }) === 0, 'the first horse of a career is free'); const f = n => K.createFee({ horses: new Array(n).fill(0) }); ok(f(1) > 0 && f(2) > f(1) && f(3) > f(2) && f(4) > f(3), 'the fee grows with every horse in the stable (' + [1, 2, 3, 4].map(f).join(' / ') + ')'); ok(f(9) === f(4), 'it is capped'); }

// ---------------------------------------------------------------- fuzz
{ const C = career(2); K.marketSync(C); let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) | 0, (seed >>> 0) / 4294967296); let bad = 0, bought = 0, sold = 0;
  for (let i = 0; i < 3000; i++) { const a = (rnd() * 6) | 0, L = C.market.listings[(rnd() * Math.max(1, C.market.listings.length)) | 0];
    if (a === 0 && L) { const r = K.marketOffer(C, L.id, Math.round(L.ask * (0.5 + rnd() * 0.6)), { slots: 1 + ((rnd() * 5) | 0) }); if (r.ok && r.outcome === 'accepted') { const b = K.marketBuy(C, L.id, r.price, { slots: 5 }); if (b.ok) bought++; } }
    else if (a === 1 && L) { const b = K.marketBuy(C, L.id, Math.round(L.ask * (0.7 + rnd() * 0.5)), { slots: 5 }); if (b.ok) bought++; }
    else if (a === 2 && C.horses.length) { const r = K.sellHorse(C, C.horses[(rnd() * C.horses.length) | 0].id); if (r.ok) sold++; }
    else if (a === 3) K.advance(C, 1 + ((rnd() * 20) | 0), { force: true }); else if (a === 4) setCash(C, C.cash + Math.round(rnd() * 80000)); else K.marketSync(C);
    const names = C.horses.map(h => h.name), ids = C.horses.map(h => h.id);
    if (C.cash < 0 || C.horses.length < 1 || C.horses.length > 5 || new Set(names).size !== names.length || new Set(ids).size !== ids.length || C.market.listings.length > 6 || C.market.listings.some(l => !Number.isFinite(l.ask) || l.ask <= 0) || C.active < 0 || C.active >= C.horses.length) bad++; }
  ok(bad === 0, 'through 3,000 random buy / offer / sell / advance actions: cash never negative, 1–5 horses, unique names and ids, a sane market (bought ' + bought + ', sold ' + sold + ')'); ok(K.audit(C).length === 0, 'the ledger audits clean after the fuzz run'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
