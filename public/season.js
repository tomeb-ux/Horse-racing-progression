'use strict';
/* =====================================================================
   FINAL FURLONG — CAREER SEASONS & CHAMPIONSHIP CORE (pure logic, no DOM)
   Three tiered championships (Provincial → Metropolitan → Group 1 Feature Series), each a calendar of rounds contested
   by the player's stable and a fixed set of recurring AI stables. One runner per stable per round; points from real
   finishing positions. Qualification for the feature races comes from a horse's own recorded results.

   Loads as a classic browser script (global SEASON, after sim.js) and as a Node module (tests).
   Everything here is deterministic from the career seed + season number, so standings never change on reload.
   This is a fictional championship inspired by Australian racing — not the real calendar or eligibility rules.
   ===================================================================== */
const SEASON = (() => {
  const SIMX = (typeof ROSTER !== "undefined") ? { ROSTER } : require("./sim.js");
  const R0 = SIMX.ROSTER;
  const AKEYS = ["top", "acc", "end", "spr", "rec", "tem", "agi", "sta"];
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function rngOf(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStr(s) { let x = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  const gauss = rng => { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // ---------- points ----------
  const POINTS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1];             // 11th+ and DNF score nothing
  const pointsFor = place => place > 0 && place <= POINTS.length ? POINTS[place - 1] : 0;

  // ---------- the calendar ----------
  // tier: 1 provincial · 2 metropolitan / stakes · 3 Group 1 · 4 crown jewel. str = target rating of the AI runners.
  // req: qualification rules checked against the horse (see checkReq). Legacy career race ids are kept so old
  // career history still maps onto these events.
  const R = (o) => Object.assign({ tier: 1, req: [], major: false, crown: false }, o);
  const DIVS = [
    { id: 0, key: "prov", name: "Provincial Championship", short: "Provincial", field: 10, promote: 3, rounds: [
      R({ id: "maiden", name: "Maiden Plate", venue: "Randwick", dist: 1200, grade: "Maiden", diff: "easy", str: 59, prize: "$40,000" }),
      R({ id: "country", name: "Country Cup", venue: "Scone", dist: 1400, grade: "Provincial", diff: "easy", str: 60, prize: "$60,000" }),
      R({ id: "kembla", name: "Kembla Sprint", venue: "Kembla Grange", dist: 1000, grade: "Class 3", diff: "medium", str: 60, prize: "$45,000" }),
      R({ id: "midweek", name: "Midweek Handicap", venue: "Warwick Farm", dist: 1600, grade: "Class 2", diff: "medium", str: 61, prize: "$50,000" }),
      R({ id: "geelongtrial", name: "Geelong Classic Trial", venue: "Geelong", dist: 2000, grade: "Benchmark 70", diff: "medium", str: 62, prize: "$55,000" }),
      R({ id: "gosford", name: "Gosford Guineas", venue: "Gosford", dist: 1200, grade: "Provincial", diff: "medium", str: 62, prize: "$80,000" }),
      R({ id: "ballarat", name: "Ballarat Stayers' Handicap", venue: "Ballarat", dist: 2400, grade: "Benchmark 70", diff: "medium", str: 63, prize: "$60,000" }),
      R({ id: "newcastle", name: "Newcastle Mile", venue: "Newcastle", dist: 1600, grade: "Provincial", diff: "medium", str: 64, prize: "$90,000" }),
      R({ id: "bendigo", name: "Bendigo Sprint Classic", venue: "Bendigo", dist: 1400, grade: "Provincial Feature", diff: "medium", str: 64, prize: "$100,000" }),
      R({ id: "provfinal", name: "Provincial Championship Final", venue: "Hawkesbury", dist: 2000, grade: "Provincial Final", diff: "medium", str: 65, prize: "$150,000", major: true }),
    ] },
    { id: 1, key: "metro", name: "Metropolitan Championship", short: "Metropolitan", field: 12, promote: 3, rounds: [
      R({ id: "listed", name: "Festival Stakes", venue: "Rosehill", dist: 1200, grade: "Listed", tier: 2, diff: "medium", str: 67, prize: "$160,000", req: [{ k: "rating", min: 62 }] }),
      R({ id: "bayside", name: "Bayside Stakes", venue: "Caulfield", dist: 1400, grade: "Group 3", tier: 2, diff: "medium", str: 68, prize: "$200,000", req: [{ k: "rating", min: 62 }] }),
      R({ id: "gr3mile", name: "Autumn Stakes", venue: "Caulfield", dist: 1600, grade: "Group 3", tier: 2, diff: "medium", str: 69, prize: "$200,000", req: [{ k: "rating", min: 63 }] }),
      R({ id: "sandown", name: "Sandown Stayers", venue: "Sandown", dist: 3200, grade: "Listed", tier: 2, diff: "medium", str: 69, prize: "$160,000", req: [{ k: "rating", min: 63 }] }),
      R({ id: "springsprint", name: "Spring Sprint Championship", venue: "Royal Randwick", dist: 1200, grade: "Listed", tier: 2, diff: "medium", str: 70, prize: "$250,000", req: [{ k: "rating", min: 64 }] }),
      R({ id: "valleystakes", name: "Moonee Valley Stakes", venue: "Moonee Valley", dist: 2000, grade: "Group 3", tier: 2, diff: "hard", str: 71, prize: "$200,000", req: [{ k: "rating", min: 64 }] }),
      R({ id: "gr2stay", name: "Chairman's Handicap", venue: "Randwick", dist: 2400, grade: "Group 2", tier: 2, diff: "hard", str: 72, prize: "$300,000", req: [{ k: "rating", min: 65 }] }),
      R({ id: "kingsford", name: "Kingsford Mile", venue: "Randwick", dist: 1600, grade: "Group 2", tier: 2, diff: "hard", str: 72, prize: "$300,000", req: [{ k: "rating", min: 65 }] }),
      R({ id: "flemsprint", name: "Flemington Sprint Handicap", venue: "Flemington", dist: 1000, grade: "Group 3", tier: 2, diff: "hard", str: 73, prize: "$250,000", req: [{ k: "rating", min: 66 }] }),
      R({ id: "springmetro", name: "Spring Metropolitan", venue: "Randwick", dist: 2400, grade: "Group 2", tier: 2, diff: "hard", str: 74, prize: "$500,000", major: true, req: [{ k: "rating", min: 66 }] }),
    ] },
    { id: 2, key: "feature", name: "Group 1 Feature Series", short: "Feature Series", field: 12, promote: 0, rounds: [
      R({ id: "slipper", name: "Golden Slipper", venue: "Rosehill", dist: 1200, grade: "Group 1", tier: 3, diff: "hard", str: 74, prize: "$5,000,000", major: true, req: [{ k: "rating", min: 70 }] }),
      R({ id: "newmarket", name: "Newmarket Handicap", venue: "Flemington", dist: 1200, grade: "Group 1", tier: 3, diff: "hard", str: 74, prize: "$1,500,000", major: true, req: [{ k: "rating", min: 70 }] }),
      R({ id: "doncaster", name: "Doncaster Mile", venue: "Randwick", dist: 1600, grade: "Group 1", tier: 3, diff: "hard", str: 75, prize: "$3,000,000", major: true, req: [{ k: "rating", min: 71 }] }),
      R({ id: "derby", name: "Australian Derby", venue: "Randwick", dist: 2400, grade: "Group 1", tier: 3, diff: "hard", str: 75, prize: "$2,000,000", major: true, req: [{ k: "rating", min: 71 }, { k: "stamina", min: 68 }] }),
      R({ id: "goldeneagle", name: "Golden Eagle", venue: "Rosehill", dist: 1600, grade: "Group 1", tier: 3, diff: "hard", str: 76, prize: "$10,000,000", major: true, req: [{ k: "rating", min: 72 }] }),
      R({ id: "harboursprint", name: "Harbour City Sprint", venue: "Randwick", dist: 1200, grade: "Group 2 · Everest qualifier", tier: 3, diff: "hard", str: 76, prize: "$750,000", req: [{ k: "rating", min: 71 }] }),
      R({ id: "everest", name: "The Everest", venue: "Royal Randwick", dist: 1200, grade: "The Everest", tier: 4, diff: "hard", str: 79, prize: "$20,000,000", major: true, crown: true,
        req: [{ k: "rating", min: 76 }, { k: "sprint", min: 80 }, { k: "result", label: "Sprint qualification", maxPlace: 3, minTier: 2, distMax: 1400, within: 10, hint: "top 3 in a Listed race or better at 1400 m or shorter" }] }),
      R({ id: "caulfield", name: "Caulfield Cup", venue: "Caulfield", dist: 2400, grade: "Group 1", tier: 3, diff: "hard", str: 77, prize: "$5,000,000", major: true, req: [{ k: "rating", min: 73 }, { k: "stamina", min: 72 }] }),
      R({ id: "coxplate", name: "Cox Plate", venue: "Moonee Valley", dist: 2000, grade: "Group 1 W.F.A.", tier: 3, diff: "hard", str: 78, prize: "$5,000,000", major: true,
        req: [{ k: "rating", min: 75 }, { k: "form", label: "Recent form", maxPlace: 4, minTier: 2, within: 5, hint: "top 4 in a Listed race or better in the last 5 runs" }] }),
      R({ id: "cuptrial", name: "Hotham Stayers' Trial", venue: "Flemington", dist: 2400, grade: "Group 3 · Cup qualifier", tier: 3, diff: "hard", str: 76, prize: "$500,000", req: [{ k: "rating", min: 71 }] }),
      R({ id: "melbcup", name: "Melbourne Cup", venue: "Flemington", dist: 3200, grade: "Melbourne Cup", tier: 4, diff: "hard", str: 79, prize: "$8,000,000", major: true, crown: true,
        req: [{ k: "rating", min: 76 }, { k: "stamina", min: 78 }, { k: "result", label: "Staying qualification", maxPlace: 3, minTier: 2, distMin: 2000, within: 10, hint: "top 3 in a Listed race or better at 2000 m or further" }] }),
      R({ id: "champions", name: "Champions Stakes", venue: "Flemington", dist: 2000, grade: "Group 1", tier: 3, diff: "hard", str: 78, prize: "$3,000,000", major: true, req: [{ k: "rating", min: 74 }] }),
    ] },
  ];
  // Optional races: run any time, any number of times. Experience and horse records only — never championship points.
  const OPTIONAL = [
    R({ id: "o_trial", name: "Barrier Trial", venue: "Warwick Farm", dist: 1000, grade: "Trial", tier: 0, diff: "easy", str: 56, field: 8, note: "A gentle hit-out — little experience" }),
    R({ id: "o_maiden", name: "Maiden Handicap", venue: "Wyong", dist: 1200, grade: "Maiden", tier: 1, diff: "easy", str: 59, field: 10 }),
    R({ id: "o_bm64", name: "Benchmark 64 Handicap", venue: "Gosford", dist: 1400, grade: "Benchmark 64", tier: 1, diff: "medium", str: 62, field: 10 }),
    R({ id: "o_stayhcp", name: "Country Staying Handicap", venue: "Ballarat", dist: 2400, grade: "Benchmark 64", tier: 1, diff: "medium", str: 62, field: 10 }),
    R({ id: "o_bm78", name: "Benchmark 78 Mile", venue: "Rosehill", dist: 1600, grade: "Benchmark 78", tier: 2, diff: "medium", str: 68, field: 12, req: [{ k: "rating", min: 62 }] }),
    R({ id: "o_wildcard", name: "Everest Wildcard Sprint", venue: "Randwick", dist: 1200, grade: "Listed · Everest qualifier", tier: 2, diff: "hard", str: 73, field: 12, req: [{ k: "rating", min: 68 }], note: "Top 3 earns Everest sprint qualification" }),
    R({ id: "o_cuptrial", name: "Bart's Cup Trial", venue: "Flemington", dist: 2400, grade: "Listed · Cup qualifier", tier: 2, diff: "hard", str: 73, field: 12, req: [{ k: "rating", min: 68 }], note: "Top 3 earns Melbourne Cup staying qualification" }),
    R({ id: "o_wfa", name: "Weight-for-Age Stakes", venue: "Caulfield", dist: 2000, grade: "Group 2", tier: 3, diff: "hard", str: 78, field: 12, req: [{ k: "rating", min: 72 }], note: "Counts as recent form for the Cox Plate" }),
  ];
  const BY_ID = {};
  DIVS.forEach(d => d.rounds.forEach((r, i) => { r.div = d.id; r.round = i; r.field = r.field || d.field; BY_ID[r.id] = r; }));
  OPTIONAL.forEach(r => { r.optional = true; BY_ID[r.id] = r; });
  // legacy career race ids that no longer have a round (none at present) map here for old history entries
  const LEGACY = { maiden: 1, country: 1, midweek: 1, listed: 2, gr3mile: 2, gr2stay: 2, slipper: 3, newmarket: 3, doncaster: 3, goldeneagle: 3, derby: 3, caulfield: 3, coxplate: 3, everest: 4, melbcup: 4 };

  // ---------- AI stables ----------
  const STABLE_NAMES = [
    ["Hunter Valley Racing", "Gumtree Lodge", "Red Dust Stables", "Murray River Racing", "Wattle Creek Stud", "Tablelands Thoroughbreds", "Ironbark Racing", "Coastal Breeze Stables", "Blackwood Farm"],
    ["Harbour Lights Racing", "Bluegum Park", "Silver Fern Lodge", "Kingsford Racing", "Parramatta Park Stables", "Yarra Valley Thoroughbreds", "Golden Mile Racing", "Botany Bay Stables", "Moonlight Lodge", "Eastern Suburbs Racing", "Bayside Thoroughbreds"],
    ["Southern Star Syndicate", "Crown Point Racing", "Opal Coast Thoroughbreds", "Sapphire Downs", "Emerald Hill Stud", "Kookaburra Park", "Grand Parade Racing", "Platinum Spur Stables", "Highgate Lodge", "Royal Laurel Racing", "Starlight Bloodstock"],
  ];
  const HORSE_NAMES = ["Desert Comet", "Brumby Dancer", "Copper Coast", "Silver Billabong", "Outback Express", "Harbour Spark", "Red Gum Rocket", "Wattle Flame",
    "Coral Sea Storm", "Southerly Buster", "Bush Telegraph", "Kingfisher Bay", "Opal Dreamer", "Tasman Tide", "Ironbark Queen", "Golden Wattle", "Starry Outback",
    "Mulga Moon", "Swagman's Luck", "Thunderbolt Lane", "Blue Mountain Mist", "Riverina Rose", "Cockatoo Charm", "Sunburnt Country", "Dingo Dash", "Pilbara Gold",
    "Boomerang Bay", "Lightning Ridge", "Coolabah Star", "Kakadu Knight", "Silver Brolga", "Emu Parade", "Barramundi Blue", "Daintree Flyer", "Gibber Plains",
    "Ningaloo Reef", "Eucalypt Express", "Paddock Prince", "Saltbush Sally", "Flinders Flame", "Burrawang Belle", "Jacaranda Jewel", "Cobbler's Creek", "Gidgee Rose",
    "Kimberley Ruby", "Banjo's Ballad", "Snowy River Spirit", "Waratah Warrior", "Billabong Bandit", "Nullarbor Nights", "Overland Mail", "Gold Rush Girl",
    "Rainbow Lorikeet", "Magpie Melody", "Kurrajong King", "Bottlebrush Bay", "Marri Moon", "Bluestone Lane", "Spinifex Spirit", "Arafura Wind", "Jindabyne Jet",
    "Hawkesbury Haze", "Merino Magic", "Tumbleweed Tom", "Murrumbidgee Mist", "Gulf Country", "Quandong Queen", "Bunya Pine", "Warrego Run", "Mallee Fire",
    "Darling Downs", "Wollemi Wonder", "Southern Aurora", "Desert Rain", "Moonlit Paddock", "Silky Oak", "Red Centre", "Whitsunday Wave", "Byron Breeze",
    "Tamworth Twang", "Opal Hunter", "Cape Otway", "Glasshouse Gale", "Platypus Pete", "Echidna Edge", "Flying Fox", "Coastal Ranger", "Granite Belt",
    "Bellbird Call", "Cassowary Charge", "Lyrebird Lilt", "Galah Gala", "Dusty Swagman", "Merindah Mist", "Southern Sky", "Sandstone Sovereign", "Clover Downs",
    "River Red Gum", "Salt Lake Sunset", "Stockman's Pride", "Wedge-tail Wings", "Heron Island", "Boab Bandit"];
  const SILK_PAL = ["#d62828", "#1d3557", "#2e8b57", "#e8c35a", "#7a4fd1", "#e86a17", "#f4f1ea", "#15161a", "#5fb7e8", "#e75480", "#1f6b3a", "#d9a521"];
  const PATTERNS = ["plain", "hoops", "sash", "quartered", "stars", "chevrons", "braces", "diamond", "crossbelts"];
  const COAT_HEX = [0x7a4a28, 0x45291a, 0x8f4a24, 0x241a14, 0xb9b3aa, 0x5d3a22, 0x6b4226, 0x96522c, 0x3c2a1a];
  // template shapes from the roster: how sprint-leaning each horse is
  const shapeIdx = d => (d.attrs.top + d.attrs.acc + d.attrs.spr) / 3 - (d.attrs.end + d.attrs.rec) / 2;
  const sortedT = R0.slice().sort((a, b) => shapeIdx(b) - shapeIdx(a));
  const POOLS = { sprint: sortedT.slice(0, 5), mile: sortedT.slice(3, 9), stay: sortedT.slice(7) };
  const avgAttr = a => AKEYS.reduce((s, k) => s + a[k], 0) / AKEYS.length;

  function makeStables(careerSeed, div) {
    const D = DIVS[div], n = D.field - 1, rng = rngOf(hashStr(careerSeed + "/stables/" + div));
    const usedNames = new Set(), out = [];
    const nameRng = rngOf(hashStr(careerSeed + "/names"));
    const pool = HORSE_NAMES.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = nameRng() * (i + 1) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let nameAt = div * 33;                                                   // each division draws its own block of names
    for (let k = 0; k < n; k++) {
      const sid = "d" + div + "s" + k;
      const q = 1.035 - 0.07 * k / Math.max(1, n - 1) + (rng() - 0.5) * 0.012;  // a spread of strong and weaker stables
      const silk = SILK_PAL[(k * 5 + div * 3) % SILK_PAL.length], silk2 = SILK_PAL[(k * 7 + 6 + div) % SILK_PAL.length];
      const st = { sid, name: STABLE_NAMES[div][k] || ("Stable " + (k + 1)), q: +q.toFixed(4), silk, silk2: silk2 === silk ? "#f4f1ea" : silk2, silkPat: PATTERNS[(k + div * 2) % PATTERNS.length], horses: [] };
      for (const type of ["sprint", "mile", "stay"]) {
        const P = POOLS[type], t = P[(rng() * P.length) | 0];
        let nm = pool[nameAt++ % pool.length]; while (usedNames.has(nm)) nm = pool[nameAt++ % pool.length]; usedNames.add(nm);
        const a = {}; for (const key of AKEYS) a[key] = clampN(Math.round(t.attrs[key] + (rng() - 0.5) * 8), 40, 99);
        st.horses.push({ hid: sid + type[0], name: nm, type, style: t.style, role: t.role, coat: COAT_HEX[(rng() * COAT_HEX.length) | 0], shape: a });
      }
      out.push(st);
    }
    return out;
  }
  // a stable horse rated for one race: its shape normalised to the round's strength × the stable's quality
  function rateDef(st, h, str) {
    const k = (str * st.q) / avgAttr(h.shape), attrs = {};
    for (const key of AKEYS) attrs[key] = clampN(Math.round(h.shape[key] * k), 30, 99);
    return { name: h.name, role: h.role, style: h.style, coat: h.coat, silk: st.silk, silk2: st.silk2, silkPat: st.silkPat, attrs, _sid: st.sid, _hid: h.hid, _stable: st.name };
  }
  // distance suitability (also the lightweight AI-only race model): which attributes matter more as the trip lengthens
  function power(attrs, dist) {
    const x = clampN((dist - 1000) / 2200, 0, 1);
    const w = { top: 0.30, acc: 0.17 - 0.11 * x, spr: 0.18 - 0.06 * x, end: 0.05 + 0.30 * x, rec: 0.04 + 0.11 * x, sta: 0.10 - 0.07 * x, tem: 0.06 + 0.03 * x, agi: 0.06 };
    let s = 0, ws = 0; for (const k in w) { s += w[k] * attrs[k]; ws += w[k]; } return s / ws;
  }
  function pickRunner(st, round) {
    let best = null, bp = -1;
    for (const h of st.horses) { const d = rateDef(st, h, round.str), p = power(d.attrs, round.dist); if (p > bp) { bp = p; best = d; } }
    return best;
  }
  // the AI runners for a round (used for the real race and for AI-only results)
  function runners(season, idx) { const round = DIVS[season.div].rounds[idx]; return season.stables.map(st => pickRunner(st, round)); }
  // AI-only result for a round the player skipped: a consistent lightweight model seeded by season + round
  function simulateRound(season, idx) {
    const round = DIVS[season.div].rounds[idx], rng = rngOf(hashStr(season.seed + "/round/" + idx));
    const field = runners(season, idx).map(d => ({ d, s: power(d.attrs, round.dist) + gauss(rng) * 3.2, dnf: rng() < 0.006 }));
    field.sort((a, b) => (a.dnf - b.dnf) || (b.s - a.s));
    let pl = 0;
    return field.map(f => ({ sid: f.d._sid, hid: f.d._hid, name: f.d.name, place: f.dnf ? 0 : ++pl }));
  }
  const GOINGS = [["good", 0.55], ["soft", 0.18], ["firm", 0.17], ["heavy", 0.10]];
  function goingFor(seed, idx) { const r = rngOf(hashStr(seed + "/going/" + idx))(); let acc = 0; for (const [g, p] of GOINGS) { acc += p; if (r < acc) return g; } return "good"; }

  // ---------- season lifecycle ----------
  function newSeason(C, div) {
    const n = (C.season ? C.season.n : 0) + 1;
    const seed = hashStr(C.seed + "/season/" + n);
    C.season = { n, div, seed, cur: 0, closed: false, stables: makeStables(C.seed, div),
      rounds: DIVS[div].rounds.map((r, i) => ({ id: r.id, st: "open", going: goingFor(seed, i), res: null, ph: null })) };
    return C.season;
  }
  const done = s => s.cur >= s.rounds.length;
  const roundDef = (s, i) => DIVS[s.div].rounds[i == null ? s.cur : i];

  function standings(C) {
    const s = C.season, rows = {};
    const add = (sid, name) => rows[sid] || (rows[sid] = { sid, name, pts: 0, starts: 0, wins: 0, seconds: 0, podiums: 0, bestMajor: 99, you: sid === "player" });
    add("player", C.stable);
    s.stables.forEach(st => add(st.sid, st.name));
    s.rounds.forEach((rd, i) => {
      if (!rd.res) return; const meta = roundDef(s, i);
      for (const e of rd.res) {
        const row = rows[e.sid]; if (!row) continue;
        row.starts++; row.pts += pointsFor(e.place);
        if (e.place === 1) row.wins++; if (e.place === 2) row.seconds++; if (e.place > 0 && e.place <= 3) row.podiums++;
        if (meta.major && e.place > 0) row.bestMajor = Math.min(row.bestMajor, e.place);
      }
    });
    // tie-breakers: points → wins → seconds → best feature-race result → a fixed stable order
    const list = Object.values(rows).sort((a, b) => b.pts - a.pts || b.wins - a.wins || b.seconds - a.seconds || a.bestMajor - b.bestMajor || (a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : 0));
    const lead = list[0] ? list[0].pts : 0;
    list.forEach((r, i) => { r.rank = i + 1; r.behind = lead - r.pts; });
    return list;
  }
  const rankOf = (C, sid) => { const l = standings(C); const r = l.find(x => x.sid === sid); return r ? r.rank : l.length; };

  // commit one official round as a single logical result. Refuses anything that isn't the open current round.
  function commitRound(C, idx, res, playerHid) {
    const s = C.season;
    if (!s || s.closed || idx !== s.cur || !s.rounds[idx] || s.rounds[idx].st !== "open") return null;
    const before = standings(C), b = before.find(x => x.you);
    const rd = s.rounds[idx]; rd.res = res; rd.st = "done"; rd.ph = playerHid || null; s.cur++;
    const after = standings(C), a = after.find(x => x.you), me = res.find(e => e.sid === "player");
    return { round: idx, pts: me ? pointsFor(me.place) : 0, place: me ? me.place : null, before: b.rank, after: a.rank, total: a.pts, behind: a.behind, leader: after[0], next: done(s) ? null : roundDef(s) };
  }
  function skipRound(C) {
    const s = C.season; if (!s || s.closed || done(s)) return null;
    const idx = s.cur, rd = s.rounds[idx];
    rd.res = simulateRound(s, idx); rd.st = "skip"; rd.ph = null; s.cur++;
    return { round: idx, res: rd.res };
  }
  // season over: archive it permanently, award the championship, promote, start the next one
  function closeSeason(C) {
    const s = C.season; if (!s || s.closed || !done(s)) return null;
    const list = standings(C), me = list.find(x => x.you), D = DIVS[s.div];
    const champ = list[0];
    const majors = [];
    s.rounds.forEach((rd, i) => {
      const meta = roundDef(s, i); if (!meta.major || !rd.res) return;
      const w = rd.res.find(e => e.place === 1); if (!w) return;
      const st = w.sid === "player" ? C.stable : (s.stables.find(x => x.sid === w.sid) || {}).name;
      majors.push({ race: meta.name, horse: w.name, stable: st || "", you: w.sid === "player" });
    });
    const used = [...new Set(s.rounds.filter(r => r.res && r.ph).map(r => { const e = r.res.find(x => x.sid === "player"); return e ? e.name : null; }).filter(Boolean))];
    const promoted = D.promote > 0 && me.rank <= D.promote && s.div < DIVS.length - 1;
    const entry = { n: s.n, div: s.div, divName: D.name, t: Date.now(),
      champion: { sid: champ.sid, name: champ.name, pts: champ.pts, you: champ.you },
      standings: list.map(r => ({ sid: r.sid, name: r.name, pts: r.pts, starts: r.starts, wins: r.wins, podiums: r.podiums, you: r.you })),
      playerPos: me.rank, playerPts: me.pts, playerWins: me.wins, playerStarts: me.starts, majors, horsesUsed: used, promoted,
      entered: s.rounds.filter(r => r.st === "done").length, skipped: s.rounds.filter(r => r.st === "skip").length };
    C.history = C.history || []; C.history.push(entry);
    let trophy = null;
    if (me.rank === 1 && !C.trophies.some(t => t.kind === "champ" && t.season === s.n)) {
      trophy = { kind: "champ", raceId: "champ_" + D.key, race: D.name + " Champions", season: s.n, div: s.div, horse: used.join(", "), t: Date.now() };
      C.trophies.push(trophy);
    }
    s.closed = true;
    const nextDiv = promoted ? s.div + 1 : s.div;
    newSeason(C, nextDiv);
    return { entry, trophy, promoted, nextDiv };
  }

  // ---------- qualification ----------
  const hRating = h => Math.round(avgAttr(h.attrs));
  const sprintIdx = a => Math.round((a.top + a.acc + a.spr) / 3);
  const stayIdx = a => Math.round((a.end + a.rec) / 2);
  // a history entry's race facts (older saves only stored the race id)
  function runFacts(e) {
    const m = BY_ID[e.raceId];
    return { dist: e.dist || (m && m.dist) || 0, tier: e.tier != null ? e.tier : (m ? m.tier : (LEGACY[e.raceId] || 1)), place: e.dnf ? 0 : (e.place | 0) };
  }
  function checkReq(h, rq) {
    if (rq.k === "rating") { const v = hRating(h); return { label: "Horse rating", ok: v >= rq.min, detail: v + " / " + rq.min + " required" }; }
    if (rq.k === "sprint") { const v = sprintIdx(h.attrs); return { label: "Sprinting ability", ok: v >= rq.min, detail: v + " / " + rq.min + " (speed, acceleration, sprint)" }; }
    if (rq.k === "stamina") { const v = stayIdx(h.attrs); return { label: "Staying ability", ok: v >= rq.min, detail: v + " / " + rq.min + " (endurance, recovery)" }; }
    if (rq.k === "result" || rq.k === "form") {
      const runs = (h.history || []).slice(-rq.within);
      const hit = runs.slice().reverse().find(e => { const f = runFacts(e); return f.place > 0 && f.place <= rq.maxPlace && f.tier >= (rq.minTier || 0) && (!rq.distMin || f.dist >= rq.distMin) && (!rq.distMax || f.dist <= rq.distMax); });
      return { label: rq.label, ok: !!hit, detail: hit ? "Achieved · " + ordinalS(hit.place) + " in the " + hit.name : "Not achieved — " + rq.hint };
    }
    return { label: "?", ok: true, detail: "" };
  }
  function eligibility(h, race) {
    const reqs = (race.req || []).map(rq => checkReq(h, rq));
    return { ok: reqs.every(r => r.ok), reqs };
  }
  const ordinalS = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  // ---------- save migration (career save v1 → v2) ----------
  function migrate(C) {
    if (!C.seed) C.seed = (Math.random() * 2 ** 31) >>> 0;
    C.history = Array.isArray(C.history) ? C.history : [];
    C.trophies = Array.isArray(C.trophies) ? C.trophies : [];
    for (const h of C.horses) for (const e of h.history || []) { if (e.dist == null) { const f = runFacts(e); e.dist = f.dist; e.tier = f.tier; } if (e.off == null) e.off = true; }
    // a valid season object, or a fresh one in the division that suits the stable's best horse
    const s = C.season;
    const valid = s && typeof s === "object" && DIVS[s.div] && Array.isArray(s.rounds) && s.rounds.length === DIVS[s.div].rounds.length && Array.isArray(s.stables) && s.stables.length === DIVS[s.div].field - 1;
    if (!valid) {
      C.season = null;
      const best = C.horses.reduce((m, h) => Math.max(m, hRating(h)), 0);
      newSeason(C, best >= 80 ? 2 : best >= 74 ? 1 : 0);
    } else s.cur = clampN(s.cur | 0, 0, s.rounds.length);
    C.v = 2;
    return C;
  }

  return { DIVS, OPTIONAL, BY_ID, POINTS, pointsFor, makeStables, rateDef, runners, simulateRound, power, newSeason, done, roundDef, standings, rankOf,
    commitRound, skipRound, closeSeason, eligibility, checkReq, migrate, hRating, sprintIdx, stayIdx, goingFor, hashStr, rngOf };
})();
if (typeof module !== "undefined" && module.exports) module.exports = SEASON;
