# Final Furlong — Career Mode & 3D Stable Empire: implementation plan

> **STATUS AT HANDOFF (read first):** all 14 phases of this plan are implemented on the dev branch `claude/amazing-clarke-jzpr1x` and covered by automated tests; only Phases 1–4 have been approved by the owner. The highest-priority open issue is a racing micro-stutter regression (cause unknown). See `CAREER_PROGRESS.md` → "FINAL STATE" and `HANDOFF.md`. This plan is kept as written for intent; where it differs from what was built, the progress file wins.


## Context
The user supplied a master specification (40 sections) to turn Career Mode into an Australian stable-management game:
- a walkable 3D farm with a third-person character;
- five stalls, horse care and hands-on training;
- finances, staff, facilities and auctions;
- multi-season ageing and retirement;
- a dated racing calendar with country venues, time-of-day lighting and weather;
- strict farm/race scene separation.

Racing must stay exactly as good and as smooth as it is now. Saves, commentary, physics and controls must be preserved. Multiplayer is hidden (code kept). Work goes phase by phase: one approved phase at a time, each tested, committed (git: `/home/user/ffmp-extract/ffmp`, branch `master`) and delivered as a playable build for review.

**User decisions (this session):**
- Keep the championship divisions, placed on a dated calendar.
- Commentary: reuse the existing recorded clips now. Price and record country-venue intros and extra names later, with approval before spending credits.
- **The first build phase = data architecture + save migration** (spec phase 2).

---

## 1. Audit — what exists and what gets reused (spec phase 1, done in this session)

**Career data**
- `public/career.js` (1169 lines, IIFE `CAREER`) holds one save object `C`, stored in localStorage as `ff_career` (via `store` in `index.html:646`), schema **v3**.
- `load()` (career.js:73) already makes backups: `ff_career_backup_<ts>` for unreadable saves and `ff_career_v<N>_backup` before migrating.
- The horse object comes from `sanHorse` (career.js:101–131). Fields:
  - identity and look: id, name, look{…}, silks;
  - ability: attrs{8 keys}, pot{8};
  - progress: xp, trainPts, lvl;
  - record: races/wins/places/podiums, offRaces/offWins, champPts, majors, prize ("record only"), trained, history[≤40], online{}, born (season n).
- There is **no** age, fitness, cash, dates, retirement or hall of fame.

**Championship and rivals**
- `public/season.js` (526 lines) is pure logic and runs in Node. It contains:
  - `DIVS`: 3 divisions × 10–12 rounds. Each round has `{id, name, venue, dist, grade, tier, prize:"$40,000", req[], major, crown}`.
  - `OPTIONAL` (8 races), `newSeason`, `commitRound` (refuses anything except the current open round) and `closeSeason`.
  - Persistent rivals: `ensureWorld`, `recordRivalRun`, `retireRivals`.
  - `raceField` (the race-day lift that gives difficulty).
  - `migrate()`: v1 → v2 → v3.
- **All of this is reused as the championship backbone.**

**Race bridge**
- `competitiveCfg` → `launch` → `startRace(cfg)` (index.html:4093) → `finishRace` → `CAREER.onResult(r, place)`.
- `onResult` is idempotent through `pending` + `commitRound` / `optN` checks (career.js:1093–1134). Prize money is parsed from the string, split 60/20/10%.

**3D stable**
- `public/stable3d.js` (`STABLE3D`) already uses **its own `THREE.Scene` and camera with the shared `renderer`**.
- The main race `scene` is not rendered while it is active (frame branch at index.html:4462).
- It uses `buildHorse(def)` (index.html:2085), `animateHorse` (the idle path when speedN < 0.03), `disposeHorse` and the horse creator UI.
- **This is the pattern the farm scene will follow.**

**Race scene**
- Global `scene` / `world` (index.html:681, 783).
- Venues are built lazily by `VENUES.use(trk)` (venues.js:664), **cached and hidden, never disposed**.
- `clearRaceMeshes()` disposes horses, gates and markers.
- Fixed 120 Hz sim with render interpolation (`visPrev`/`visBegin`/`visEnd`). `GFX.autoTick` handles AUTO quality and `perfFrame` the F8 diagnostics; the career branch currently skips both.

**Lighting**
- `GFX.buildSky()` (gfx.js:117) fixes the sky colours, `SUN_DIR` and the PMREM environment map once.
- The sun follows the camera focus (index.html:2858).
- **No time-of-day, weather or going visuals.** Going exists only in the physics: `GOING {v, drain, slip}` in sim.js:279.

**Tracks**
- `getTrack('generic')` is the analytic oval. Every non-Randwick/Flemington career venue already races on it with `VENUE_GENERIC` scenery.
- New country venues reuse this geometry, so physics stay identical.

**Commentary**
- `commentary.js:71 venueKey()`: an unknown venue gets the "Welcome to Furlong Park" intro (needs a fix).
- `tests/eleven-plan.js` requires every phrase to have a recording, so no new phrases are added without recording them.

**Input**
- One `keys{}` map with keydown/keyup listeners (index.html:3050–3125). Race actions are gated by `ui.state === "racing"`.
- The farm needs a separate input context.

**Build**
- `tools/build-single.js` inlines each `<script src>` by an exact `swap()`, so every new file needs a line there.
- `server/index.js` serves all of `public/`.

**Multiplayer**
- `FF_FEATURES.multiplayer` (index.html:641) controls the `btnMP` menu button.
- `mp.js:426` auto-join is already guarded by the flag.

**Tests (keep green)**
- Node: `season.js`, `riding-control.js`, `randwick.js`, `flemington.js`, `chaos.js`, `avoid.js`, `commentary.js`, `commentary-scenarios.js`, `eleven-plan.js`, `career_difficulty.js`, `progression.js`.
- Browser (server on 8095): `career-browser.js` (includes the V1 → v3 migration fixture), `steering-browser.js`, `start-browser.js`, `replay-lunge-browser.js`, `presentation-browser.js`, `eleven-browser.js`, `longrace-browser.js`, `auto-quality-browser.js`.

---

## 2. Target architecture

### 2.1 Modules (plain scripts, same style as now)

| File | Kind | Role |
|---|---|---|
| `public/career-core.js` **(new)** | Pure logic, no DOM, Node-testable like season.js | Save v4 schema + migration; calendar/dates; ledger (idempotent transactions); economy rates; facilities and staff effects; ageing and growth curves; fitness/recovery; retirement and hall of fame; auction generation and valuation; training limits; race schedule (time of day, weather and going forecasts) |
| `public/career.js` | Existing | Stays the UI layer: hub/office screens, creator, profiles. Calls career-core for every rule; never mutates money directly |
| `public/scenes.js` **(new)** | | `SCENES` manager: `current ∈ {menu, farm, office, stable, race}`; `enter/leave` hooks; input contexts; resource ledger and leak check (`renderer.info.memory`, `performance.memory`); loading overlay |
| `public/farm.js` **(new)** | | Farm scene with its own `THREE.Scene`, like STABLE3D. Terrain, buildings, stalls, paddocks, training lane, transport, colliders, interaction points, farm horses, facility visual variants |
| `public/farm-player.js` **(new)** | | Character builder (customisable, 3 outfits), walk/jog controller with XZ collision, third-person camera with occlusion pull-in, interaction prompt |
| `public/venues.js` | Existing | Add `buildCountry(id)`: 2 cheap country venues on the generic track geometry |
| `public/gfx.js` | Existing | Add `GFX.setTimeOfDay(preset)` and `GFX.setWeather(w)`: sky uniforms, sun direction/colour, hemi/fill, exposure, fog, cached environment map per preset, light rain |

All new files get a `swap()` line in `tools/build-single.js` and a `<script>` tag after `stable3d.js`.

### 2.2 Scene separation (non-negotiable requirement)
- **Race scene** = the existing global `scene`/`world`, unchanged. **Farm** = its own `THREE.Scene` + camera, sharing `renderer`. Only the active scene is rendered and updated.
- **Entering the farm:**
  - `race = null`, `clearRaceMeshes()`, `COMM.stop()` and audio stop;
  - the race scene is not rendered, so venue crowds and flags don't update;
  - cached venue geometry stays in memory (rebuilding Randwick costs seconds). A setting / low-memory mode can dispose cached venues (`disposeGroup` plus material disposal).
- **Entering a race:**
  - farm horses are disposed (`disposeHorse`);
  - the farm stops updating; its static farm geometry stays cached (one copy, re-entered instantly);
  - farm input is detached.
- **Input contexts:** `SCENES.input = "race" | "farm" | "ui"`.
  - The farm uses its own key map. It reads only its own keys; W/A/S/D/Shift/E are consumed only while `input === "farm"`.
  - `handlePlayerInput` and race keydown actions require `input === "race"`.
  - On a context switch, all held keys are cleared, like the existing `blur` handler.
- **Leak test:** 10 farm ↔ race round trips. `renderer.info.memory.geometries/textures` must return to baseline ±small, and heap growth stays bounded (Playwright with `--enable-precise-memory-info`).

### 2.3 Save v4 (central persistent state)
`C.v = 4`, keeping every v3 field. New fields:

- **Calendar:** `C.day` is an integer day since career start. Dates are derived on an Aug 1 – Jul 31 season; horses age on 1 August, as in real Australian racing. `C.seasonStartDay`.
- **Money:**
  - `C.cash`;
  - `C.ledger` (last 300 entries + per-season summaries), each `{id, day, kind, amount, note}`;
  - `C.txn` (set of applied transaction keys, e.g. `prize:s3:r5:h12`, `upg:training:2`, `buy:lot:8812`, `wage:day:412`) so every money event applies exactly once.
- **Facilities:** `C.fac{training, track, recovery, comfort, feed, gates, vet}` at levels 0–3 (Basic → Elite).
- **Staff:** `C.staff{trainer, groom, vet}`, each null or `{tier, spec, name, wage, look}`.
- **Player:** `C.player{look{head, hair, hairCol, skin, build}, outfit:"stable"|"training"|"raceday", colours}`.
- **Other:**
  - `C.market{seed, listings[], refreshDay}`;
  - `C.hof[]` (retired horses: full record snapshot, including look);
  - `C.rep` (reputation);
  - `C.entries[]`;
  - `C.notices[]`;
  - `C.cal{events[]}`: dated race programme, each event `{id, day, venue, meta ref, timeOfDay, forecast{weather, going}}`, deterministic from seed.
- **Per horse:**
  - age: `foaled` (season), `age`;
  - development: `growth` (early/avg/late + peak age + decline rate, seeded per horse);
  - condition: `fitness` (0–100), `fresh` (post-race recovery), `formIdx` (derived), `composure` (light welfare);
  - training: `trainDay` and `trainedToday` (daily limits), `plan` (auto-training focus);
  - ownership: `acquired{how, price, day}`, `retired`, `value` (cached estimate).

**Migration v3 → v4** (`career-core.migrate`, chained after `SEASON.migrate`):
- Backup first (`ff_career_v3_backup`).
- Nothing removed; attrs and pot untouched.
- Age = 3 + seasons since `born`, clamped 3–6. Growth profile seeded from the horse id.
- Fitness = 90.
- Facilities level 0 (Basic) and no staff.
- Starting cash = the new-career package plus a modest credit for past success (e.g. `$150,000 + 10% of recorded prize`, capped). No retroactive expenses.
- The current season gets dates (rounds placed on the calendar from today).
- v1/v2 saves go through the existing chain, then v4.

**Export/import:**
- Download the save JSON.
- Import validates, migrates, backs up the current save, then replaces it.

### 2.4 Performance budgets (measured, not assumed)
- **Farm:** ≤ ~250 draw calls and ≤ ~500k triangles at High.
  - Static meshes merged per material (`GFX.merge`); instanced fences, trees and tufts.
  - One shadow-casting sun, its shadow frustum following the player.
  - Horse idle animation only within distance and frustum (horse LOD via existing `GFX.LODS`); ≤ 5 player horses + ≤ 3 staff NPCs.
- The farm branch adds `perfFrame` + `GFX.autoTick`, so F8 and AUTO quality work there too.
- The race path is untouched. `tools/smooth.js` is run before and after each phase that touches shared code, with no regression in frame-time judder or CPU percentiles.

---

## 3. Phases (spec numbering kept; one phase per approval)
Every phase ends with:
- tests (new + full regression list in §4);
- `CAREER_PROGRESS.md` updated (done / remaining / bugs / exact next-phase requirements);
- a git commit;
- the single-file build published to the artifact, plus the GitHub zip.

### Phase 2 — Career data architecture + save migration ← FIRST BUILD PHASE
1. Save the master spec verbatim as `CAREER_EXPANSION_SPEC.md`, this plan as `CAREER_PLAN.md`, and create `CAREER_PROGRESS.md`.
2. **Hide multiplayer:** `FF_FEATURES.multiplayer = false`, so the menu item, `?join` links and auto-rejoin are off. Server, `mp.js` and tests stay; note it in README/HANDOFF.
3. **`public/career-core.js`:**
   - v4 schema, `migrate`, `fresh` (new-career package);
   - calendar functions (`dateOf(day)`, season of a day, `advance(C, days)` with skip warnings);
   - ledger `apply(C, key, amount, kind, note)` (refuses duplicate keys and refuses going negative unless it is a defined debt type);
   - prize schedule from race grade (replaces string parsing; places 1–5);
   - fitness/recovery and age/growth functions (data and rules only; their gameplay effects are switched on in phase 9);
   - deterministic dated placement of championship rounds and optional races;
   - time-of-day and forecast assignment per event (stored now, rendered in phase 12).
4. **Wire into `career.js`:**
   - `load` → `CORE.migrate`;
   - `onResult` credits prize money to `C.cash` through the ledger (key per race + horse, so never twice), records the date, sets post-race fitness/fresh;
   - entering a round moves `C.day` to its date.
5. **Minimal UI** (no visual overhaul): the career hub shows the date, cash and a small "Office" panel with ledger, calendar dates and export/import buttons. Race and stable visuals are unchanged.
6. **Tests:**
   - new `tests/career-core.js` (Node): migration of v1/v2/v3 fixtures preserving every horse field; prize applied once (replayed `onResult`, reload between); ledger never negative by UI bug; calendar maths; deterministic schedule; export/import round trip.
   - extend `career-browser.js`: v3 save → v4 in the real game, cash credited once after a race + reload, export/import.
   - full regression.
7. **Playable checkpoint:** the existing career plays exactly as now, plus date/cash/office.

### Phase 3 — Scene separation
- `scenes.js`: scene manager, loading overlay, input contexts. Clean enter/leave for menu ↔ farm ↔ office/STABLE3D ↔ race.
- Farm placeholder: ground, five boxes and an interaction point to "travel to race", so transitions can be tested before art.
- Leak test (10 round trips), and a test that controls don't bleed between scenes (farm keys never move `riderInput`; race keys inert on the farm).
- Commentary stops on leaving a race.
- `tools/smooth.js` before/after, to prove racing is untouched.

### Phase 4 — Farm environment
Medium property (≈ 220 × 160 m walkable) laid out around a central courtyard:
- farmhouse/office (exterior + entry trigger; the office is a UI over a framed interior shot, not a modelled house interior);
- main stable block with 5 stalls, name plaques and the correct saved horses via `buildHorse(toDef(h))`;
- grooming/wash bay and feed/equipment shed;
- training area: a 400–600 m exercise lane / small oval plus gate practice;
- 3 paddocks, vet bay and transport float/truck;
- facility "slots" for visual upgrades.

Australian look: eucalypts (reuse `GFX.plantTrees`), timber/steel sheds, post-and-rail fences, troughs, gravel/concrete paths. Lighting is a farm preset on the same GFX pipeline. Horses idle naturally: the existing idle path, plus grazing/ear/tail variations, distance-gated. Built once, merged and instanced, with draw calls and triangles measured.

### Phase 5 — Third-person character
- Rigid-part, low-poly but believable human (pattern of `presentation.js makeStrapper`, upgraded): head/hair/skin/build options and three outfits (stable, training, race-day with helmet).
- Procedural walk/jog cycle; WASD relative to the camera, Shift jog, smooth turning and stopping.
- XZ collision against box/circle colliders (buildings, fences, horses), plus terrain height sampling.
- Camera: behind and above the player, mouse/drag orbit with sensitivity setting, occlusion pull-in via a raycast against the collider proxies, no shake.
- Appearance editor in the office; saved in `C.player`.

### Phase 6 — Farm interactions (EXPANDED by the owner at the Phase 6 kickoff; see CAREER_PROGRESS.md "Exactly what Phase 6 requires")
**Brought forward into Phase 6 from later phases:** the interactive load-up and playable drive (the Phase 13 transport flow, driving part), guided race-day preparation with ground navigation lines, a rebuilt character, in-farm training drills (the playable layer only; long-term progression stays Phase 9), and a small 'Rest a day' calendar advance. Phase 13 keeps: the atomic save-then-travel flow, the post-result return flow and any arrival cinematic. **Phase 11 must add smaller Australian regional/grassroots racecourses; Phase 12 must add morning / midday / late-afternoon / golden-hour sunset races with matching weather and going.**
- Interaction system: proximity + facing + line-of-sight check against the collider proxies, `E` prompt, subtle highlight.
- Actions:
  - horse: inspect (opens existing profile/records), groom (short brush animation, small temporary readiness), feed (tiers), prepare, assign schedule, lead to activity;
  - office: calendar, finances, roster, standings, achievements, staff, facilities;
  - training: phase 9 hooks;
  - transport: race entry.
- Farm map (M) and a quick-access menu, so walking is never mandatory.

### Phase 7 — Finances
- Starting package for new careers; income from prizes (places 1–5, grade-scaled), major bonuses, milestones and modest sponsorship tied to reputation.
- Expenses: weekly feed/care per horse (tiered), wages, maintenance and entry fees. All are charged automatically on calendar advance and shown as one weekly summary.
- Insufficient funds block purchases. Anti-trap measures:
  - low-cost race options are always available;
  - staff can be reduced;
  - horses can be sold;
  - one emergency "club advance" per season (repaid from prizes) when cash < threshold.
- **Balancing by simulation:** a Node economy test runs whole careers with the real race engine (extending `tests/progression_worker.js`). It verifies:
  - early career sustains 1 horse;
  - first upgrade within ~1 season;
  - second horse within ~1–2 seasons;
  - elite only after sustained success;
  - no unrecoverable bankruptcy.

### Phase 8 — Staff and facilities
- Trainer (tier + specialisation → training efficiency), groom (automates care, consistency), vet (recovery, setback handling). Wages weekly.
- Optional simple NPC figures near their areas; manage them by approaching or from the office.
- Facilities at 4 levels with modest, explicit multipliers:
  - training efficiency, recovery speed, condition consistency;
  - gate-practice effectiveness, vet handling;
  - certain activities only from level 1+.
- They never raise attributes past potential.
- Visual changes are small add-on props/signage/surfaces in predefined slots; buildings are never rebuilt.

### Phase 9 — Long-term horse development
**Three separate layers:**
- permanent attrs (≤ pot);
- fitness/form (short-term);
- age/experience.

**Growth model:**
- per-horse curve (early/average/late developer), peak at roughly ages 4–6 with variation;
- gradual and varied decline from ~7–8; some horses stay competitive to 9–10.
- Gains come from scheduled daily training (focus areas with trade-offs) and racing experience. They scale by age curve × facility × staff × diminishing returns near potential.
- The existing `trainPts`/"Train +1" screen is kept as the spending UI, with rebalanced earn rates. Existing horses never lose current values.

**Fitness and recovery:**
- the post-race drop depends on distance, effort, going, endurance/recovery, facility and vet;
- recovers over days (not weeks);
- racing while unfit gives a small, explained performance penalty via the race def. This is a modest vmax/stamina factor in `toDef`, so sim.js is unchanged.

**Limits and retirement:**
- daily training limit: one session per horse per day, scored by date key, so there are no re-entry exploits;
- rare minor setbacks only;
- retirement by choice or late-career prompt, into `C.hof` and the trophy room;
- Hall of Fame screen.

**Testing:** multi-season simulations confirm a horse races 8+ seasons with a believable curve.

### Phase 10 — Horse marketplace
- Rotating listings (refreshed on calendar advance, seeded): developing, young prospects, race-ready, late-maturing, expensive established.
- Shown info: name (from the 128 recorded names minus those in use), age, look (random within the creator's options), current ability bands, potential estimate (ranges, not exact), preferred trip, temperament, record and price.
- Simplified bidding: an AI counter-bid rounds model, capped.
- Sell (with confirmation) at a valuation from age/ability/potential/form/record/health.
- Paid custom creation: the existing creator at a fee, with the same attribute budgets; the fee scales with the stable's horse count. Five-horse cap enforced everywhere.

### Phase 11 — Racing calendar expansion
- A full dated Aug–Jul season with a clear hierarchy:
  - maidens → country class races → provincial → metropolitan benchmark/listed → Group 3/2/1 → championship finals, The Everest and Melbourne Cup.
- Championship divisions stay (their rounds get dates). Many extra open races, entered when eligible by age, record, grade and qualification.
- Early races winnable: the existing `raceField` lift profiles are retuned per grade so a well-ridden new horse can win maidens/country races sometimes, verified with `tests/career_difficulty.js`. This supersedes the earlier "first races ≈ 3rd" tuning, per the spec's §21.6.
- Two cheap country venues (`venues.js buildCountry`) on generic geometry: small stand, rails, a few trees, a light crowd; far cheaper than flagships.
- Commentary fix: unknown venues use neutral intros instead of "Furlong Park".
- New venue intro clips are priced (estimate first) and recorded only with the user's go-ahead.

### Phase 12 — Time of day and weather
- Presets: early morning, mid-morning, midday, afternoon, late afternoon, golden hour, dusk.
  - Night/evening only at venues flagged as lit (Randwick/Flemington with light towers).
  - Each sets the sky shader colours (made uniforms), sun direction/colour/intensity, hemi/fill, exposure and fog. The environment map is cached per preset.
- Weather: clear / partly cloudy / overcast / light rain / rain, by venue and month, with forecasts in the calendar. Going follows rain and maps to the existing `GOING` physics.
- Rain visuals: one GPU particle mesh near the camera; turf tint via the existing `turfMaterial` tint.
- The time of day comes from the stored event, so it is identical when viewed and when raced.
- `tools/smooth.js` and longrace checks confirm no frame-cost regression.

### Phase 13 — Transport transitions
- Transport area flow: select event → choose horse → preparation summary (fitness, forecast, going) → **save** (atomic) → skippable short departure cinematic (float pulling out, fade) → loading overlay → race scene.
- After results: rewards applied once (ledger keys) → development, fitness, records and calendar → return-to-farm transition, spawning at the transport area.

### Phase 14 — Balance and full testing
- All spec test lists (§31–36) automated where possible: Playwright farm walkthrough with collision probes, interaction probes, economy/progression simulations, multi-transition memory, `tools/smooth.js`, plus the full regression.
- Final report in the spec §39 format, honest about anything incomplete.

---

## 4. Verification (every phase)

**Node tests**
```
node tests/career-core.js; node tests/season.js; node tests/riding-control.js
node tests/randwick.js 2; node tests/flemington.js; node tests/chaos.js public/sim.js; node tests/avoid.js public/sim.js
node tests/commentary.js 36; node tests/commentary-scenarios.js 160; node tests/eleven-plan.js
node tests/career_difficulty.js 100 3
```

**Browser tests** (`PORT=8095 node server/index.js`):
- `career-browser.js`, `steering-browser.js`, `start-browser.js`, `replay-lunge-browser.js`;
- `presentation-browser.js`, `eleven-browser.js`, `longrace-browser.js`, `auto-quality-browser.js`;
- from phase 3: the new `scenes-browser.js` (transitions, input isolation, memory);
- from phase 4/5: the new `farm-browser.js` (spawn, walk, collide, interact, stalls show the right horses).

**Smoothness:** `PORT=8095 node tools/smooth.js` before/after any phase touching `index.html`'s loop, gfx or venues.

**Delivery:** `node tools/build-single.js` → publish to the existing artifact URL; GitHub zip (< 100 files); git commit with attribution.

## 5. Risks and mitigations
- **Save safety:**
  - v3 backup before migrating;
  - migration is idempotent and tested on fixtures from v1/v2/v3 and on a real save captured from the browser;
  - import never overwrites without a backup.
- **Racing smoothness:**
  - farm code never runs in race frames (scene gating);
  - race code paths untouched;
  - measured with `tools/smooth.js`.
- **Memory:** horses disposed per scene switch; venue cache bounded; leak test.
- **Commentary:** no new phrases without recordings (eleven-plan test); unknown-venue intro fix uses existing lines.
- **Scope:** each phase is shippable and playable; nothing is claimed untested; placeholders are labelled as such in `CAREER_PROGRESS.md`.
