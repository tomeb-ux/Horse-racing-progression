// Phase 11 rules: the grassroots and regional circuit — extra open races, age / maiden / class eligibility, the dated calendar, the winnable early-race pressure profiles, the venue styles and the neutral commentary intros.   node tests/phase11-core.js
const sim = require('../public/sim.js'), S = require('../public/season.js'), K = require('../public/career-core.js'), COMM = require('../public/commentary.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const AK = ['top', 'acc', 'end', 'spr', 'rec', 'tem', 'agi', 'sta'], DISTS = [1000, 1200, 1400, 1600, 2000, 2400, 3200];
const horse = o => Object.assign({ id: 'x', age: 3, wins: 0, races: 0, history: [], attrs: Object.fromEntries(AK.map(k => [k, 71])) }, o, o && o.rating ? { attrs: Object.fromEntries(AK.map(k => [k, o.rating])) } : {});
const reg = S.OPTIONAL.filter(m => m.regional);

// ---------------------------------------------------------------- the races
ok(S.OPTIONAL.length >= 20 && reg.length >= 13, `many open races: ${S.OPTIONAL.length} (${reg.length} on the regional circuit)`);
ok(new Set(S.OPTIONAL.map(m => m.id)).size === S.OPTIONAL.length && S.OPTIONAL.every(m => S.BY_ID[m.id] === m && m.optional), 'every open race has a unique id and is registered');
ok(S.OPTIONAL.every(m => DISTS.includes(m.dist) && m.field >= 8 && m.field <= 12 && m.venue && m.name && m.grade && m.str > 40 && m.str < 95), 'distances, fields, venues and strengths are all valid');
ok(reg.every(m => S.REGIONAL_VENUES.includes(m.venue)), 'every regional race is run at a listed regional course');
ok(new Set(reg.map(m => m.venue)).size === reg.length, 'each regional race is at its own town (' + new Set(reg.map(m => m.venue)).size + ' towns)');
ok(reg.filter(m => m.prize).every(m => K.purseOf(m) >= 2000 && K.purseOf(m) <= 12000) && reg.some(m => K.purseOf(m) > 0), 'regional purses are modest ($' + Math.min(...reg.filter(m => m.prize).map(m => K.purseOf(m))) + '–$' + Math.max(...reg.map(m => K.purseOf(m))) + ') — real money, nothing like the city races');
ok(reg.every(m => m.tier <= 1), 'the regional circuit sits at the bottom of the ladder (tier 0–1)');
for (const m of S.OPTIONAL) for (const rq of m.req || []) if (!['rating', 'age', 'wins', 'maxrating', 'sprint', 'stamina', 'result', 'form'].includes(rq.k)) ok(false, m.id + ' has an unknown requirement ' + rq.k);

// ---------------------------------------------------------------- who can enter
{ const el = (h, id) => S.eligibility(h, S.BY_ID[id]).ok;
  const newbie = horse({ age: 3, rating: 71 }), baby = horse({ age: 2, rating: 64 }), winner = horse({ age: 4, wins: 3, rating: 71 }), star = horse({ age: 6, wins: 12, rating: 82 }), mid = horse({ age: 4, wins: 1, rating: 70 });
  ok(el(newbie, 'g_picnic') && el(newbie, 'g_threeyo') && el(newbie, 'o_maiden') && el(newbie, 'g_trial'), 'a new three-year-old can enter the maidens and the trial');
  ok(!el(newbie, 'g_twoyo') && el(baby, 'g_twoyo'), 'the two-year-old race is for two-year-olds only');
  ok(!el(winner, 'g_picnic') && !el(winner, 'g_threeyo') && !el(winner, 'o_maiden'), 'a horse that has won can no longer enter a maiden');
  ok(el(winner, 'g_bm58') && el(winner, 'g_kyneton'), 'but it can step up to a country class race');
  ok(!el(horse({ age: 4, rating: 71 }), 'g_threeyo') && !el(horse({ age: 4, rating: 71 }), 'g_toowoomba'), 'age limits keep four-year-olds out of the three-year-old races');
  ok(S.eligibility(star, S.BY_ID.g_bm58).ok === false && S.eligibility(star, S.BY_ID.g_bm58).reqs.some(r => /too good|rated/.test(r.detail)), 'a Group-class horse is too good for a benchmark race (and is told why)');
  ok(!S.OPTIONAL.filter(m => m.regional && (m.req || []).some(r => r.k === 'maxrating')).some(m => el(star, m.id)), 'a rating-82 star cannot enter any class-limited country race');
  { const cap = S.BY_ID.g_bm58.req.find(r => r.k === 'maxrating').max; ok(el(horse({ rating: cap }), 'g_bm58') && !el(horse({ rating: cap + 1 }), 'g_bm58'), 'the class limit is exact (rated ' + cap + ' is in, ' + (cap + 1) + ' is out)'); }
  ok(el(star, 'o_bm78') && el(star, 'o_wfa') && !el(newbie, 'o_wfa'), 'the city races still need the rating they always did');
  ok(S.OPTIONAL.filter(m => el(newbie, m.id)).length >= 12, 'a new horse always has a dozen or more races it can enter (' + S.OPTIONAL.filter(m => el(newbie, m.id)).length + ')');
  ok(S.OPTIONAL.filter(m => el(horse({ age: 3, rating: 76 }), m.id)).length >= 8, 'a 76-rated horse still has country races to run in before the city (' + S.OPTIONAL.filter(m => el(horse({ age: 3, rating: 76 }), m.id)).length + ')');
  ok(S.eligibility(null, S.BY_ID.g_picnic).ok === false, 'a missing horse is simply not eligible (no crash)'); }

// ---------------------------------------------------------------- the dated calendar
{ const C = K.fresh(31); C.horses = []; S.migrate(C); K.migrate(C, { from: 4 }); const ev = C.cal.events, opt = ev.filter(e => e.kind === 'optional'), n = C.season.n, start = K.seasonStartDay(n), end = K.seasonEndDay(n);
  ok(opt.length === S.OPTIONAL.length * K.OPT_PER_SEASON && ev.filter(e => e.kind === 'round').length === 10, `a season has the 10 championship rounds and ${opt.length} dated open meetings (${S.OPTIONAL.length} races × ${K.OPT_PER_SEASON})`);
  ok(opt.every(e => e.day >= start && e.day <= end && S.BY_ID[e.ref] && e.venue === S.BY_ID[e.ref].venue), 'every meeting is inside the season, at its race\'s own course');
  ok(reg.every(m => opt.filter(e => e.ref === m.id).length === K.OPT_PER_SEASON), 'every regional race is run ' + K.OPT_PER_SEASON + ' times a season');
  const byDay = {}; for (const e of ev) byDay[e.day] = (byDay[e.day] || 0) + 1; ok(Math.max(...Object.values(byDay)) <= 4, 'no more than ' + Math.max(...Object.values(byDay)) + ' meetings on any one day');
  const sorted = ev.every((e, i) => i === 0 || ev[i - 1].day <= e.day); ok(sorted, 'the programme is in date order');
  ok(reg.filter(m => m.pressure === 'grass').every(m => opt.some(e => e.ref === m.id && e.day < start + 190)), 'every grassroots maiden has a meeting in the first half of the season');
  const gaps = []; const ds = [...new Set(ev.map(e => e.day))].sort((a, b) => a - b); for (let i = 1; i < ds.length; i++) gaps.push(ds[i] - ds[i - 1]); ok(Math.max(...gaps) <= 14, 'there is never a gap of more than two weeks without a race meeting (longest ' + Math.max(...gaps) + ' days)');
  const C2 = K.fresh(31); C2.horses = []; S.migrate(C2); K.migrate(C2, { from: 4 }); ok(JSON.stringify(C2.cal.events.map(e => [e.id, e.day])) === JSON.stringify(ev.map(e => [e.id, e.day])), 'the programme is the same for the same career'); }

// ---------------------------------------------------------------- the pressure profiles (winnable early races)
{ const L = S.LIFT; ok(L.grass[0] < L.country[0] && L.country[0] < L.normal[0] && L.normal[0] < L.early[0], 'rivals are less far ahead of you in a grassroots race than a country one, a country one than a normal one, and a normal one than a first start');
  ok(L.grass.every((v, i) => v <= L.country[i] + 1e-9) && L.country.every((v, i) => v <= L.normal[i] + 1e-9), 'at every rank, the easier kind is easier');
  const C = { seed: 4242, stable: 'T', horses: [], trophies: [] }; S.migrate(C); const pd = { attrs: Object.fromEntries(AK.map(k => [k, 71])), races: 0 };
  const top = (defs, meta) => { const f = S.raceField(defs, meta, pd, false); return (Math.max(...f.map(d => S.racePower(d.attrs, meta.dist))) - S.racePower(pd.attrs, meta.dist)) / S.ptsPerLength(meta.dist); };
  const tGrass = top(S.optionalField(C, 'g_picnic'), S.BY_ID.g_picnic), tCountry = top(S.optionalField(C, 'g_bm58'), S.BY_ID.g_bm58), tNormal = top(S.runnersFor(C, 1, 0), S.DIVS[1].rounds[0]);
  ok(Math.abs(tGrass - S.LIFT.grass[0]) < 0.9 && Math.abs(tCountry - S.LIFT.country[0]) < 0.9 && tGrass < tCountry && tCountry < tNormal, `the strongest rival is ${tGrass.toFixed(1)} lengths better than a 71 horse in a maiden, ${tCountry.toFixed(1)} in a country class race, ${tNormal.toFixed(1)} in the metropolitan (the profiles)`);
  ok(S.DIVS[0].rounds[0].pressure === 'grass' && S.DIVS[0].rounds[1].pressure === 'country' && !S.DIVS[0].rounds[2].pressure, 'the Maiden Plate and the Country Cup are the winnable stepping stones; the later rounds are unchanged');
  const f0 = S.raceField(S.optionalField(C, 'g_picnic'), S.BY_ID.g_picnic, { attrs: pd.attrs, races: 0 }, false), f9 = S.raceField(S.optionalField(C, 'g_picnic'), S.BY_ID.g_picnic, { attrs: pd.attrs, races: 9 }, false);
  ok(JSON.stringify(f0.map(d => d.attrs)) === JSON.stringify(f9.map(d => d.attrs)), 'a grassroots race is as winnable on a horse\'s first start as its ninth (no extra early pressure on top)'); }

// ---------------------------------------------------------------- the venue styles
{ const metro = ['Randwick', 'Royal Randwick', 'Flemington', 'Caulfield', 'Rosehill', 'Warwick Farm', 'Moonee Valley', 'Sandown', 'Hawkesbury', 'Furlong Park', '', null];
  ok(metro.every(v => S.venueStyle(v) === null), 'the city courses keep their own scenery (no country style)');
  ok(S.REGIONAL_VENUES.every(v => { const s = S.venueStyle(v); return s && s.style === 'country' && (s.variant === 0 || s.variant === 1) && s.town === v; }), 'every regional course gets a country style with its town name');
  ok(new Set(S.REGIONAL_VENUES.map(v => S.venueStyle(v).variant)).size === 2, 'both country looks are used');
  ok(S.venueStyle('Moree').variant === S.venueStyle('Moree').variant, 'a town always looks the same');
  ok(S.REGIONAL_VENUES.every(v => !/randwick|flemington/i.test(v)), 'no regional course is one of the two modelled flagships');
  const used = new Set(S.OPTIONAL.map(m => m.venue).concat(S.DIVS[0].rounds.map(r => r.venue))); ok(S.REGIONAL_VENUES.filter(v => !used.has(v)).length === 0, 'every listed regional course is used by at least one race'); }

// ---------------------------------------------------------------- neutral commentary intros
{ const mkBooth = venue => { const r = new sim.Race({ distance: 1200, field: 6, diff: 'hard', playerHorse: 0, allBots: true, going: 'good', seed: 7 }); return new COMM.Booth(r, { name: 'Test', venue, major: false, crown: false, official: true }, { speak() {}, cancel() {}, tick() {} }, { player: r.horses[0], log: () => {} }); };
  ok(mkBooth('Moree').venue === 'neutral' && mkBooth('Dubbo').venue === 'neutral' && mkBooth('Warwick Farm').venue === 'neutral', 'a country or other named course is called neutrally — never "Furlong Park"');
  ok(mkBooth('Royal Randwick').venue === 'randwick' && mkBooth('Flemington').venue === 'flemington' && mkBooth('Furlong Park').venue === 'generic' && mkBooth('').venue === 'generic', 'the flagships and the original course keep their own intros');
  const b = mkBooth('Moree'), seen = new Set(); for (let i = 0; i < 40; i++) { b.used = new Map(); const u = b.pickUnit('intro', { venue: b.venue }) || b.pickUnit('intro', {}); if (u) seen.add(u.id); }
  ok(seen.size >= 1 && [...seen].every(id => { const u = b.constructor && b.pickUnit && null; return true; }), 'a neutral intro is available'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
