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
  // the names a player may give a career horse (all recorded in the ElevenLabs commentator's voice). Rivals never use them.
  const PLAYER_NAMES = ["Ka Ying Rising", "Tempted", "Half Yours", "Point Of Law", "Trust Your Instinct", "Soul Of Spain", "Make Up Your Mind", "Redline",
    "Black Caviar", "Think About It", "Pierro", "Fan Girl", "Way With Words", "By Design", "If You Say So", "All Things Beautiful", "Spanish Affair",
    "Call It Fate", "All Things Equal"];
  const SILK_PAL = ["#d62828", "#1d3557", "#2e8b57", "#e8c35a", "#7a4fd1", "#e86a17", "#f4f1ea", "#15161a", "#5fb7e8", "#e75480", "#1f6b3a", "#d9a521"];
  const PATTERNS = ["plain", "hoops", "sash", "quartered", "stars", "chevrons", "braces", "diamond", "crossbelts"];
  const COAT_HEX = [0x7a4a28, 0x45291a, 0x8f4a24, 0x241a14, 0xb9b3aa, 0x5d3a22, 0x6b4226, 0x96522c, 0x3c2a1a];
  const NAME_A = ["Copper", "Silver", "Golden", "Southern", "Northern", "Red", "Blue", "Wild", "Quiet", "Royal", "Coastal", "Desert", "Midnight", "River", "Storm", "Iron", "Opal", "Wattle", "Harbour", "Outback", "Ember", "Lucky", "Brave", "Summer"];
  const NAME_B = ["Comet", "Ranger", "Echo", "Arrow", "Drifter", "Spirit", "Banner", "Charm", "Flyer", "Legend", "Gambler", "Breeze", "Duke", "Belle", "Prince", "Lass", "Rocket", "Mist", "Tide", "Thunder", "Whistle", "Ballad", "Dancer", "Jewel"];
  // template shapes from the roster: how sprint-leaning each horse is
  const shapeIdx = d => (d.attrs.top + d.attrs.acc + d.attrs.spr) / 3 - (d.attrs.end + d.attrs.rec) / 2;
  const sortedT = R0.slice().sort((a, b) => shapeIdx(b) - shapeIdx(a));
  const POOLS = { sprint: sortedT.slice(0, 5), mile: sortedT.slice(3, 9), stay: sortedT.slice(7) };
  const avgAttr = a => AKEYS.reduce((s, k) => s + a[k], 0) / AKEYS.length;
  const r1 = v => Math.round(v * 10) / 10;

  // ---------- persistent rivals ----------
  // Every AI horse is a persistent rival with its OWN attributes, potential and development rate. Nothing about a rival
  // is ever scaled to the player's horses: rivals improve only through their own races (each run closes part of the gap
  // to their potential, at their own rate) and eventually retire, replaced by a new prospect in the same stable.
  // Grade bands (rating now → potential): provincial horses are genuinely weaker than metropolitan ones, and a handful of
  // established stars headline the Feature Series.
  const BANDS = [
    { lo: 55, hi: 63, grow: [4, 11] },          // Provincial: maidens and country horses
    { lo: 64, hi: 72, grow: [3, 9] },           // Metropolitan: listed / group 3 horses
    { lo: 72, hi: 80, grow: [3, 8], stars: 3, star: [83, 86] },   // Feature Series: group 1 horses + a few elite stars
  ];
  function shapeTo(shape, rating) { const k = rating / avgAttr(shape), o = {}; for (const key of AKEYS) o[key] = clampN(r1(shape[key] * k), 30, 99); return o; }
  function newRival(C, st, div, slot, type, rng, star) {
    const B = BANDS[div], P = POOLS[type], t = P[(rng() * P.length) | 0];
    const shape = {}; for (const key of AKEYS) shape[key] = clampN(t.attrs[key] + (rng() - 0.5) * 8, 40, 99);
    const q = st.q;                               // a stable's quality shifts where its horses sit in the band
    const r0 = star ? B.star[0] + rng() * (B.star[1] - B.star[0]) : B.lo + (B.hi - B.lo) * clampN((q - 0.965) / 0.07 * 0.6 + rng() * 0.5, 0, 1);
    const g = star ? 1 + rng() * 3 : B.grow[0] + rng() * (B.grow[1] - B.grow[0]) * (rng() < 0.2 ? 1.5 : 1);   // a few late-blooming prospects
    C.rivalSeq = (C.rivalSeq || 0) + 1;
    return { id: st.sid + type[0] + C.rivalSeq, name: rivalName(C, rng), sid: st.sid, div, type, slot, style: t.style, role: t.role,
      coat: COAT_HEX[(rng() * COAT_HEX.length) | 0], attrs: shapeTo(shape, r0), pot: shapeTo(shape, Math.min(94, r0 + g)), rate: r1(0.03 + rng() * 0.07) || 0.05,
      star: !!star, born: C.season ? C.season.n : 1, starts: 0, wins: 0, seconds: 0, thirds: 0, majors: [], form: [], seasons: {} };
  }
  // rival names come only from the recorded pool (so the commentator can always say them in the ElevenLabs voice):
  // first names never used in this career, then names of rivals that have left the active population
  function rivalName(C, rng) {
    const all = Object.values(C.rivals || {}), mine = new Set((C.horses || []).map(h => h.name).concat(PLAYER_NAMES));
    const used = new Set(all.map(r => r.name)), activeNames = new Set(all.filter(r => r.active !== false).map(r => r.name));
    const fresh = HORSE_NAMES.filter(n => !used.has(n) && !mine.has(n));
    if (fresh.length) return fresh[(rng() * fresh.length) | 0];
    const reuse = HORSE_NAMES.filter(n => !activeNames.has(n) && !mine.has(n));
    if (reuse.length) return reuse[(rng() * reuse.length) | 0];
    for (let i = 0; i < 200; i++) { const n = NAME_A[(rng() * NAME_A.length) | 0] + " " + NAME_B[(rng() * NAME_B.length) | 0]; if (!used.has(n)) return n; }
    return "Runner " + (C.rivalSeq || 0);
  }
  function stableShells(seed, div) {
    const D = DIVS[div], n = D.field - 1, rng = rngOf(hashStr(seed + "/stables/" + div));
    const out = [];
    for (let k = 0; k < n; k++) {
      const sid = "d" + div + "s" + k, q = 1.035 - 0.07 * k / Math.max(1, n - 1) + (rng() - 0.5) * 0.012;
      const silk = SILK_PAL[(k * 5 + div * 3) % SILK_PAL.length], silk2 = SILK_PAL[(k * 7 + 6 + div) % SILK_PAL.length];
      out.push({ sid, name: STABLE_NAMES[div][k] || ("Stable " + (k + 1)), q: +q.toFixed(4), silk, silk2: silk2 === silk ? "#f4f1ea" : silk2, silkPat: PATTERNS[(k + div * 2) % PATTERNS.length], horses: [] });
    }
    return out;
  }
  // the whole racing world: every division's stables and their rivals (created once per career, then persistent)
  function ensureWorld(C) {
    C.rivals = C.rivals && typeof C.rivals === "object" ? C.rivals : {};
    C.h2h = C.h2h && typeof C.h2h === "object" ? C.h2h : {};
    if (Array.isArray(C.world) && C.world.length === DIVS.length && C.world.every((w, d) => Array.isArray(w) && w.length === DIVS[d].field - 1)) return;
    C.world = [];
    for (let d = 0; d < DIVS.length; d++) {
      const rng = rngOf(hashStr(C.seed + "/rivals/" + d)), shells = stableShells(C.seed, d);
      shells.forEach((st, k) => {
        ["sprint", "mile", "stay"].forEach((type, j) => {
          const star = BANDS[d].stars && k < BANDS[d].stars && j === k % 3;
          const rv = newRival(C, st, d, j, type, rng, star); C.rivals[rv.id] = rv; st.horses.push(rv.id);
        });
      });
      C.world.push(shells);
    }
  }
  const stablesOf = (C, div) => C.world[div];
  const rival = (C, id) => C.rivals[id] || null;
  function rivalDef(C, rv, st) {
    st = st || stablesOf(C, rv.div).find(s => s.sid === rv.sid) || { silk: "#888888", silk2: "#ffffff", silkPat: "plain", name: "" };
    const attrs = {}; for (const k of AKEYS) attrs[k] = clampN(Math.round(rv.attrs[k]), 30, 99);
    return { name: rv.name, role: rv.role, style: rv.style, coat: rv.coat, silk: st.silk, silk2: st.silk2, silkPat: st.silkPat, attrs, _sid: rv.sid, _hid: rv.id, _stable: st.name, _rival: true };
  }
  const rRating = rv => Math.round(avgAttr(rv.attrs));
  // distance suitability (also the lightweight AI-only race model): which attributes matter more as the trip lengthens
  function power(attrs, dist) {
    const x = clampN((dist - 1000) / 2200, 0, 1);
    const w = { top: 0.30, acc: 0.17 - 0.11 * x, spr: 0.18 - 0.06 * x, end: 0.05 + 0.30 * x, rec: 0.04 + 0.11 * x, sta: 0.10 - 0.07 * x, tem: 0.06 + 0.03 * x, agi: 0.06 };
    let s = 0, ws = 0; for (const k in w) { s += w[k] * attrs[k]; ws += w[k]; } return s / ws;
  }
  // each stable sends its best-suited horse: sprinters for the sprints, stayers for the staying races
  function stableRunner(C, st, dist) {
    let best = null, bp = -1;
    for (const id of st.horses) { const rv = C.rivals[id]; if (!rv) continue; const p = power(rv.attrs, dist); if (p > bp) { bp = p; best = rv; } }
    return best;
  }
  function runnersFor(C, div, idx) { const round = DIVS[div].rounds[idx]; return stablesOf(C, div).map(st => rivalDef(C, stableRunner(C, st, round.dist), st)); }
  function runners(C, idx) { return runnersFor(C, C.season.div, idx == null ? C.season.cur : idx); }
  // optional races: a field picked by grade from the whole rival population, preferring horses suited to the trip.
  // Deterministic until the race is run (the form guide shows exactly the field you will meet).
  function optionalField(C, id) {
    const meta = BY_ID[id]; if (!meta) return [];
    const rng = rngOf(hashStr(C.seed + "/opt/" + (C.optN | 0) + "/" + id));
    const sc = Object.values(C.rivals).filter(rv => !rv.retired && rv.active !== false).map(rv => { const rt = rRating(rv), fit = power(rv.attrs, meta.dist) - rt;
      return { rv, s: -Math.abs(rt - meta.str) * 1.4 + fit * 1.2 + rng() * 4 }; }).sort((a, b) => b.s - a.s);
    const seen = new Set(), out = [];
    for (const x of sc) { if (out.length >= meta.field - 1) break; if (seen.has(x.rv.sid) && out.length < meta.field - 3) continue; seen.add(x.rv.sid); out.push(rivalDef(C, x.rv)); }
    return out;
  }
  // ---- race-day field: the competition always keeps pace with the player's horse ----
  // How fast a horse really runs a trip, from time trials in the race engine (a fitted linear model per distance,
  // R² 0.93–0.99): mostly top speed, with endurance mattering more as the trip lengthens. RACE_W are the weights,
  // SEC_PT the seconds one rating point is worth over the trip.
  const RACE_W = [
    [1000, { top: 0.79, acc: 0.0, end: 0.09, spr: 0.06, rec: 0.01, tem: 0.01, agi: 0.0, sta: 0.04 }, 0.150],
    [1200, { top: 0.78, acc: 0.03, end: 0.08, spr: 0.06, rec: 0.0, tem: 0.01, agi: 0.0, sta: 0.05 }, 0.178],
    [1600, { top: 0.70, acc: 0.02, end: 0.17, spr: 0.0, rec: 0.045, tem: 0.037, agi: 0.007, sta: 0.02 }, 0.268],
    [2000, { top: 0.60, acc: 0.0, end: 0.40, spr: 0.0, rec: 0.07, tem: 0.03, agi: 0.0, sta: 0.0 }, 0.45],
    [2400, { top: 0.60, acc: 0.0, end: 0.41, spr: 0.0, rec: 0.0, tem: 0.06, agi: 0.014, sta: 0.0 }, 0.611],
    [3200, { top: 0.66, acc: 0.0, end: 0.42, spr: 0.0, rec: 0.077, tem: 0.065, agi: 0.0, sta: 0.0 }, 0.773],
  ];
  function raceW(dist) {
    let i = 0; while (i < RACE_W.length - 2 && dist > RACE_W[i + 1][0]) i++;
    const [d0, w0, s0] = RACE_W[i], [d1, w1, s1] = RACE_W[i + 1], f = clampN((dist - d0) / (d1 - d0), 0, 1), w = {};
    for (const k of AKEYS) w[k] = w0[k] + (w1[k] - w0[k]) * f;
    return { w, spp: s0 + (s1 - s0) * f };
  }
  function racePower(attrs, dist) { const { w } = raceW(dist); let s = 0, ws = 0; for (const k of AKEYS) { s += w[k] * attrs[k]; ws += w[k]; } return s / ws; }
  // rating points worth one length at the line over this trip
  const ptsPerLength = dist => 2.4 / (raceW(dist).spp * 16.5);
  // Rivals are primed for the race (never weakened): the strongest are lifted to at least a set margin, in lengths of
  // raw ability over the trip, above the player's horse, and the rest of the field to within a few lengths of it. A new
  // horse meets a field it can place in but not beat on talent alone; as it improves the rivals rise with it; finals are
  // as hard as Quick Race on Hard. Only the race-day copy is lifted: the rival's own record and development are unchanged.
  //   pressure: "early" (a new horse's first starts), "normal", "major", "final"
  // (in raw time-trial lengths: races are tactical and bunched, so real margins are far smaller. Quick Race on Hard
  //  gives the player a field averaging about +5.5, +3.5, +2, +1.2, +0.5 … lengths over it — the "final" profile)
  const LIFT = {                                  // lengths over the player's horse for the 1st, 2nd, 3rd … strongest rival
    early:  [6.0, 4.2, 2.6, 1.2, 0.2, -0.8],
    normal: [5.0, 3.2, 1.8, 0.8, -0.2, -1.2],
    major:  [5.0, 3.4, 2.0, 1.0, 0.0, -1.0],
    final:  [4.5, 3.0, 1.6, 0.6, -0.2, -1.0],
  };
  const LIFT_REST = { early: -2.0, normal: -2.6, major: -2.4, final: -2.2 };   // the depth of the rest of the field
  function racePressure(h, meta, isFinal) {
    const runs = h ? (h.races | 0) : 0;
    const base = isFinal || meta.crown ? "final" : meta.major ? "major" : "normal";
    // a new horse's first three starts are early-pressure; the 4th–6th blend into the normal margins
    const early = clampN((6 - runs) / 3, 0, 1);
    return { key: base, early: base === "normal" ? early : 0 };
  }
  function liftAttrs(attrs, dist, want) {
    const a = Object.assign({}, attrs);
    for (let it = 0; it < 4; it++) {                       // additive lift keeps the horse's shape; capped attrs push the rest
      const d = want - racePower(a, dist); if (d <= 0.05) break;
      for (const k of AKEYS) a[k] = clampN(Math.round((a[k] + d) * 10) / 10, 30, 99);
    }
    for (const k of AKEYS) a[k] = Math.round(a[k]);
    return a;
  }
  function raceField(defs, meta, h, isFinal) {
    if (!h || !h.attrs || !defs || !defs.length) return defs;
    const P = racePower(h.attrs, meta.dist), pr = racePressure(h, meta, isFinal), ppl = ptsPerLength(meta.dist);
    const m = LIFT[pr.key].map((x, i) => x + pr.early * ((LIFT.early[i] != null ? LIFT.early[i] : x) - x)), rest = LIFT_REST[pr.key] + pr.early * (LIFT_REST.early - LIFT_REST[pr.key]);
    const order = defs.map((d, i) => ({ i, p: racePower(d.attrs, meta.dist) })).sort((a, b) => b.p - a.p);
    const out = defs.slice();
    order.forEach((o, rank) => {
      const want = P + ppl * (rank < m.length ? m[rank] : rest - 0.5 * (rank - m.length));
      if (o.p >= want - 0.05) return;
      out[o.i] = Object.assign({}, defs[o.i], { attrs: liftAttrs(defs[o.i].attrs, meta.dist, want), _lift: +(want - o.p).toFixed(1) });
    });
    return out;
  }

  // AI-only result for a round nobody human ran: a consistent lightweight model seeded by season + division + round
  function simulateRound(C, div, idx) {
    const s = C.season, round = DIVS[div].rounds[idx], rng = rngOf(hashStr(s.seed + "/round/" + div + "/" + idx));
    const field = runnersFor(C, div, idx).map(d => ({ d, s: power(d.attrs, round.dist) + gauss(rng) * 3.2, dnf: rng() < 0.006 }));
    field.sort((a, b) => (a.dnf - b.dnf) || (b.s - a.s));
    let pl = 0;
    return field.map(f => ({ sid: f.d._sid, hid: f.d._hid, name: f.d.name, place: f.dnf ? 0 : ++pl }));
  }
  // a rival's run: records + its own development (a share of the gap to its potential, at its own rate)
  function recordRivalRun(C, hid, place, meta, season) {
    const rv = C.rivals[hid]; if (!rv) return;
    rv.starts++; if (place === 1) rv.wins++; if (place === 2) rv.seconds++; if (place === 3) rv.thirds++;
    rv.form.push(place); if (rv.form.length > 10) rv.form.shift();
    if (place === 1 && meta && meta.major && !meta.optional) rv.majors.push({ race: meta.name, season });
    const ss = rv.seasons[season] || (rv.seasons[season] = { starts: 0, wins: 0, places: 0, rating: rRating(rv) }); ss.starts++; if (place === 1) ss.wins++; if (place > 0 && place <= 3) ss.places++;
    const rng = rngOf(hashStr(C.seed + "/dev/" + hid + "/" + rv.starts));
    for (const k of AKEYS) rv.attrs[k] = clampN(r1(rv.attrs[k] + (rv.pot[k] - rv.attrs[k]) * rv.rate * (0.6 + 0.8 * rng())), 30, rv.pot[k]);
    ss.ratingEnd = rRating(rv);
  }
  function recordResult(C, meta, res, season) { for (const e of res) if (e.sid !== "player") recordRivalRun(C, e.hid, e.place, meta, season); }
  // head-to-head: every real race a player horse runs against a rival is kept per pair
  function recordH2H(C, horse, meta, finishers, season) {
    const me = finishers.find(f => f.player); if (!me) return;
    for (const f of finishers) {
      if (f.player || !f.hid || !C.rivals[f.hid]) continue;
      const key = horse.id + "|" + f.hid, r = C.h2h[key] || (C.h2h[key] = { n: 0, ahead: 0, behind: 0, closest: null, last: [] });
      r.n++;
      const mineBetter = me.place > 0 && (f.place === 0 || me.place < f.place);
      if (mineBetter) r.ahead++; else r.behind++;
      if (me.t != null && f.t != null) { const g = Math.abs(me.t - f.t); if (r.closest == null || g < r.closest) r.closest = +g.toFixed(3); }
      r.last.push({ race: meta.name, season, me: me.place, them: f.place, gap: me.t != null && f.t != null ? +(f.t - me.t).toFixed(2) : null }); if (r.last.length > 8) r.last.shift();
    }
  }
  function h2hFor(C, horseId, hid) { return C.h2h[horseId + "|" + hid] || null; }

  const GOINGS = [["good", 0.55], ["soft", 0.18], ["firm", 0.17], ["heavy", 0.10]];
  function goingFor(seed, idx) { const r = rngOf(hashStr(seed + "/going/" + idx))(); let acc = 0; for (const [g, p] of GOINGS) { acc += p; if (r < acc) return g; } return "good"; }

  // ---------- season lifecycle ----------
  function newSeason(C, div) {
    ensureWorld(C);
    const n = (C.season ? C.season.n : 0) + 1;
    const seed = hashStr(C.seed + "/season/" + n);
    C.season = { n, div, seed, cur: 0, closed: false,
      rounds: DIVS[div].rounds.map((r, i) => ({ id: r.id, st: "open", going: goingFor(seed, i), res: null, ph: null })),
      others: {} };
    for (let d = 0; d < DIVS.length; d++) if (d !== div) C.season.others[d] = { cur: 0, rounds: DIVS[d].rounds.map(r => ({ id: r.id, res: null })) };
    return C.season;
  }
  const done = s => s.cur >= s.rounds.length;
  const roundDef = (s, i) => DIVS[s.div].rounds[i == null ? s.cur : i];
  // the other two championships keep racing in step with the player's season (their rivals develop too)
  function advanceOthers(C, frac) {
    const s = C.season;
    for (const d in s.others) {
      const o = s.others[d], target = Math.min(o.rounds.length, Math.round(frac * o.rounds.length));
      while (o.cur < target) { const res = simulateRound(C, +d, o.cur); o.rounds[o.cur].res = res; recordResult(C, DIVS[d].rounds[o.cur], res, s.n); o.cur++; }
    }
  }

  function standingsFrom(C, div, rounds, stableName) {
    const rows = {};
    const add = (sid, name) => rows[sid] || (rows[sid] = { sid, name, pts: 0, starts: 0, wins: 0, seconds: 0, podiums: 0, bestMajor: 99, you: sid === "player" });
    if (stableName) add("player", stableName);
    stablesOf(C, div).forEach(st => add(st.sid, st.name));
    rounds.forEach((rd, i) => {
      if (!rd.res) return; const meta = DIVS[div].rounds[i];
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
  function standings(C) { return standingsFrom(C, C.season.div, C.season.rounds, C.stable); }
  const rankOf = (C, sid) => { const l = standings(C); const r = l.find(x => x.sid === sid); return r ? r.rank : l.length; };

  // commit one official round as a single logical result. Refuses anything that isn't the open current round.
  function commitRound(C, idx, res, playerHid) {
    const s = C.season;
    if (!s || s.closed || idx !== s.cur || !s.rounds[idx] || s.rounds[idx].st !== "open") return null;
    const before = standings(C), b = before.find(x => x.you);
    const rd = s.rounds[idx]; rd.res = res; rd.st = "done"; rd.ph = playerHid || null; s.cur++;
    recordResult(C, roundDef(s, idx), res, s.n);
    advanceOthers(C, s.cur / s.rounds.length);
    const after = standings(C), a = after.find(x => x.you), me = res.find(e => e.sid === "player");
    return { round: idx, pts: me ? pointsFor(me.place) : 0, place: me ? me.place : null, before: b.rank, after: a.rank, total: a.pts, behind: a.behind, leader: after[0], next: done(s) ? null : roundDef(s) };
  }
  function skipRound(C) {
    const s = C.season; if (!s || s.closed || done(s)) return null;
    const idx = s.cur, rd = s.rounds[idx];
    rd.res = simulateRound(C, s.div, idx); rd.st = "skip"; rd.ph = null; s.cur++;
    recordResult(C, roundDef(s, idx), rd.res, s.n);
    advanceOthers(C, s.cur / s.rounds.length);
    return { round: idx, res: rd.res };
  }
  // season over: archive it permanently, award the championship, promote, retire old rivals, start the next one
  function closeSeason(C) {
    const s = C.season; if (!s || s.closed || !done(s)) return null;
    advanceOthers(C, 1);
    const list = standings(C), me = list.find(x => x.you), D = DIVS[s.div];
    const champ = list[0];
    const majorsOf = (div, rounds) => { const out = []; rounds.forEach((rd, i) => { const meta = DIVS[div].rounds[i]; if (!meta.major || !rd.res) return; const w = rd.res.find(e => e.place === 1); if (!w) return;
      const st = w.sid === "player" ? C.stable : (stablesOf(C, div).find(x => x.sid === w.sid) || {}).name; out.push({ race: meta.name, horse: w.name, stable: st || "", you: w.sid === "player", hid: w.hid }); }); return out; };
    const used = [...new Set(s.rounds.filter(r => r.res && r.ph).map(r => { const e = r.res.find(x => x.sid === "player"); return e ? e.name : null; }).filter(Boolean))];
    const promoted = D.promote > 0 && me.rank <= D.promote && s.div < DIVS.length - 1;
    const others = Object.keys(s.others).map(d => { const l = standingsFrom(C, +d, s.others[d].rounds, null); return { div: +d, divName: DIVS[d].name, champion: l[0] ? { sid: l[0].sid, name: l[0].name, pts: l[0].pts } : null, majors: majorsOf(+d, s.others[d].rounds) }; });
    const entry = { n: s.n, div: s.div, divName: D.name, t: Date.now(),
      champion: { sid: champ.sid, name: champ.name, pts: champ.pts, you: champ.you },
      standings: list.map(r => ({ sid: r.sid, name: r.name, pts: r.pts, starts: r.starts, wins: r.wins, podiums: r.podiums, you: r.you })),
      playerPos: me.rank, playerPts: me.pts, playerWins: me.wins, playerStarts: me.starts, majors: majorsOf(s.div, s.rounds), horsesUsed: used, promoted,
      entered: s.rounds.filter(r => r.st === "done").length, skipped: s.rounds.filter(r => r.st === "skip").length, others };
    C.history = C.history || []; C.history.push(entry);
    let trophy = null;
    if (me.rank === 1 && !C.trophies.some(t => t.kind === "champ" && t.season === s.n)) {
      trophy = { kind: "champ", raceId: "champ_" + D.key, race: D.name + " Champions", season: s.n, div: s.div, horse: used.join(", "), t: Date.now() };
      C.trophies.push(trophy);
    }
    s.closed = true;
    retireRivals(C, s.n);
    const nextDiv = promoted ? s.div + 1 : s.div;
    newSeason(C, nextDiv);
    return { entry, trophy, promoted, nextDiv };
  }
  // rivals who have reached their ceiling and raced a long career retire; a new prospect takes their box
  function retireRivals(C, season) {
    const retired = [];
    for (let d = 0; d < DIVS.length; d++) stablesOf(C, d).forEach(st => st.horses.forEach((id, j) => {
      const rv = C.rivals[id]; if (!rv) return;
      const atPeak = AKEYS.every(k => rv.pot[k] - rv.attrs[k] < 1.2), rng = rngOf(hashStr(C.seed + "/retire/" + id + "/" + season));
      if (rv.starts >= 28 && atPeak && rng() < 0.4) {
        rv.retired = season; retired.push(rv.name);
        const nr = newRival(C, st, d, j, rv.type, rng, false); C.rivals[nr.id] = nr; st.horses[j] = nr.id;
      }
    }));
    // retired horses keep their records (history, head-to-heads) but leave the active population
    for (const id in C.rivals) if (C.rivals[id].retired && !stablesOf(C, C.rivals[id].div).some(st => st.horses.includes(id))) C.rivals[id].active = false;
    return retired;
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
  function eligibility(h, race) { const reqs = (race.req || []).map(rq => checkReq(h, rq)); return { ok: reqs.every(r => r.ok), reqs }; }
  const ordinalS = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  // ---------- form guide ----------
  // what the numbers really say about each runner for THIS race: rating, how well the trip suits it (the same distance
  // model that picks stable runners), recent form and achievements. No hidden favouritism for the player's horse.
  const SUIT = [[1.2, "Excellent"], [3.2, "Good"], [6, "Fair"], [99, "Poor"]];
  function suitability(attrs, dist) {
    const best = Math.max(...[1000, 1200, 1400, 1600, 2000, 2400, 3200].map(d => power(attrs, d))), here = power(attrs, dist);
    const loss = best - here; return { loss, label: SUIT.find(x => loss <= x[0])[1] };
  }
  function formGuide(C, entries, meta) {
    const rows = entries.map(e => {
      const a = e.attrs, p = power(a, meta.dist), suit = suitability(a, meta.dist), form = (e.form || []).slice(-5);
      const recent = form.filter(x => x > 0), avgPlace = recent.length ? recent.reduce((s, x) => s + x, 0) / recent.length : null;
      const top2 = AKEYS.slice().sort((x, y) => a[y] - a[x]).slice(0, 2);
      return Object.assign({}, e, { rating: Math.round(avgAttr(a)), power: p, suit: suit.label, formTxt: form.length ? form.map(x => x === 0 ? "F" : x > 9 ? "0" : x).join("-") : "first start",
        score: p + (avgPlace != null ? (6 - Math.min(10, avgPlace)) * 0.35 : 0), strengths: top2 });
    });
    const sorted = rows.slice().sort((x, y) => y.score - x.score);
    sorted.forEach((r, i) => { r.rank = i + 1; r.contender = i < 3; });
    return sorted;
  }

  // ---------- experience & training points (shared by the career UI and the progression tests) ----------
  // tier of race × strength of the field × finishing place, reduced when the field is far weaker than the horse
  const XP_PER_PT = 2;
  function xpFor(o) {   // { tier, oppAvg, rating, place, field, dnf, optional }
    const oppF = clampN(o.oppAvg / 70, 0.5, 1.35);
    const gap = o.rating - o.oppAvg, gapF = gap > 6 ? Math.max(0.2, 1 - (gap - 6) / 16) : 1;
    const placeMult = o.place === 1 ? 1 : Math.max(0.15, 1 - (o.place - 1) * 0.11);
    const tierF = 0.8 + (o.tier || 0) * 0.28;
    let xp = 56 * tierF * oppF * placeMult;
    if (o.place === 1) xp += 18 * tierF;
    if (o.dnf) xp = xp * 0.25 + 4;
    if (o.optional) xp *= 0.9;
    return Math.max(2, Math.round(xp * gapF * (o.field >= 10 ? 1 : 0.85)));
  }
  const upgCost = v => v < 70 ? 1 : v < 78 ? 2 : v < 85 ? 3 : v < 91 ? 4 : 6;

  // ---------- save migration ----------
  // v1 (no season) and v2 (season with per-race normalised AI horses) → v3 (persistent rivals). Every player horse,
  // trophy, record and season result is kept; the v2 AI horses become rivals with the same ids and names.
  function migrate(C) {
    if (!C.seed) C.seed = (Math.random() * 2 ** 31) >>> 0;
    C.history = Array.isArray(C.history) ? C.history : [];
    C.trophies = Array.isArray(C.trophies) ? C.trophies : [];
    for (const h of C.horses) for (const e of h.history || []) { if (e.dist == null) { const f = runFacts(e); e.dist = f.dist; e.tier = f.tier; } if (e.off == null) e.off = true; }
    const s = C.season;
    const v2stables = s && Array.isArray(s.stables) && s.stables.length && s.stables[0] && Array.isArray(s.stables[0].horses) && typeof s.stables[0].horses[0] === "object";
    ensureWorld(C);
    if (v2stables && DIVS[s.div] && s.stables.length === DIVS[s.div].field - 1) {
      // keep the v2 identities (ids + names used in recorded results) for the current division's rivals
      s.stables.forEach((old, k) => { const st = C.world[s.div][k]; if (!st) return; st.name = old.name || st.name;
        (old.horses || []).forEach((oh, j) => { const id = st.horses[j], rv = C.rivals[id]; if (!rv || !oh || !oh.hid) return; let nid = oh.hid; if (C.rivals[nid] && nid !== id) nid = oh.hid + 'x' + j;   // v2 gave a stable's sprinter and stayer the same id
          delete C.rivals[id]; rv.id = nid; rv.name = oh.name || rv.name; C.rivals[rv.id] = rv; st.horses[j] = rv.id; }); });
      delete s.stables;
    }
    const valid = s && typeof s === "object" && DIVS[s.div] && Array.isArray(s.rounds) && s.rounds.length === DIVS[s.div].rounds.length;
    if (!valid) {
      C.season = null;
      const best = C.horses.reduce((m, h) => Math.max(m, hRating(h)), 0);
      newSeason(C, best >= 82 ? 2 : best >= 75 ? 1 : 0);
    } else {
      s.cur = clampN(s.cur | 0, 0, s.rounds.length);
      if (!s.others) { s.others = {}; for (let d = 0; d < DIVS.length; d++) if (d !== s.div) s.others[d] = { cur: 0, rounds: DIVS[d].rounds.map(r => ({ id: r.id, res: null })) }; }
      delete s.stables;
    }
    C.v = 3;
    return C;
  }

  return { PLAYER_NAMES, HORSE_NAMES, DIVS, OPTIONAL, BY_ID, POINTS, BANDS, pointsFor, power, runners, runnersFor, optionalField, simulateRound, newSeason, done, roundDef, standings, standingsFrom, rankOf,
    commitRound, skipRound, closeSeason, eligibility, checkReq, migrate, hRating, sprintIdx, stayIdx, goingFor, hashStr, rngOf, ensureWorld, stablesOf, rival, rivalDef, rRating,
    recordResult, recordH2H, h2hFor, formGuide, suitability, xpFor, upgCost, XP_PER_PT, retireRivals, raceField, racePressure, racePower, ptsPerLength, LIFT };
})();
if (typeof module !== "undefined" && module.exports) module.exports = SEASON;
