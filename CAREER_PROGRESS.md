# Career Mode expansion — progress

Master specification: `CAREER_EXPANSION_SPEC.md` (saved verbatim; refer to it rather than asking for it again).
Implementation plan (approved): `CAREER_PLAN.md`.
**Rule: one approved phase at a time. After a phase: tests, git commit, playable build, update this file — then STOP and wait for the owner's review.**

## Decisions on record
- The championship divisions (Provincial → Metropolitan → Group 1 Feature Series) are kept. Their rounds get real dates
  on an August–July racing season, alongside many more optional races.
- Commentary reuses the existing recorded clips for now: country venues use neutral lines and auction horses use the
  128 recorded names. New venue intros (and any extra names) will be priced first and recorded only with the owner's
  approval.
- The first build phase was the spec's **Phase 2: career data architecture + save migration**.
- Multiplayer is hidden and disabled during the expansion, with its code kept. **Done in Phase 2.**
- **Phase 4 visual-quality requirement (owner, added during Phase 3):** the Australian training property must feel **visually polished,
  realistic and immersive — not a basic collection of low-poly buildings on flat green terrain.** Particular attention to: the central stable
  courtyard; the proportions and materials of the five horse stalls; realistic fencing; natural paths; paddock detail; appropriate Australian
  vegetation; the overall layout. Use the existing detailed horse models. It should be somewhere the owner would genuinely enjoy walking
  around between races. Keep the performance budgets, but get there with efficient modelling, instancing and sensible detail allocation
  (detail where the player looks, cheap further out) — not by making everything visually simplistic. **At the end of Phase 4 provide
  screenshots from several angles — especially the main stable courtyard, the farmhouse, the paddocks and the training area — so the owner
  can review the visual quality before Phase 5.**
- **Testing is risk-based from Phase 4 on** (owner's instruction) — see "Testing policy" below. Tests are never weakened or deleted.
- Development runs one approved phase at a time. After each phase: tests, a git commit, a playable build (artifact +
  GitHub zip) and an update of this file.
- Prize money for optional races stays at nothing (as before); championship rounds pay places 1–5. Real purse and
  entry-fee balancing happens in Phase 7 (decided while implementing Phase 2 so that cash cannot be farmed before there is
  anything to spend it on).

## Status by phase

| Phase | Status |
|---|---|
| 1 — Existing project audit | **Done.** Findings are in `CAREER_PLAN.md` §1 |
| 2 — Career data architecture + save migration | **Done and approved by the owner** (on `main`, published) |
| 3 — Scene separation | **Done and approved by the owner** (on `main`, published) |
| 4 — Farm environment | **Done — awaiting the owner's visual review** (screenshots delivered; details below) |
| 5 — Third-person character | **Next.** Not started — do not begin until Phase 4 is approved |
| 6 — Farm interactions | Not started |
| 7 — Finances | Not started |
| 8 — Staff and facilities | Not started |
| 9 — Long-term horse development | Not started |
| 10 — Horse marketplace | Not started |
| 11 — Racing calendar expansion | Not started |
| 12 — Time of day and weather | Not started |
| 13 — Transport transitions | Not started |
| 14 — Balance and full testing | Not started |

## Testing policy for the remaining phases (owner's instruction, given during Phase 3) — risk-based, nothing weakened or deleted

All existing tests stay in the repo and unchanged. What changes is **which of them run after a given change**. Every phase report must list
**what was executed (with counts) and what was deferred, and why**.

**Tier 1 — always run for any change (fast, ≈ 1–5 min):**
`node tests/career-core.js` (3 s) · `PORT=8095 node tests/scenes-browser.js` (scene transitions, input isolation, 10-trip leak check; ≈ 6 min) ·
the phase's own tests (e.g. `tests/farm-browser.js` from Phase 4) · a **short racing smoke test**: `steering-browser.js` (15 s) + `start-browser.js` (25 s) +
`replay-lunge-browser.js` (8 s) · `node tools/build-single.js && node tests/single-browser.js` (the single file still boots).

**Tier 2 — farm-only visual / interaction changes** (only `farm.js`, farm HUD, farm assets, the farm branch of the frame loop, Office/Career screens):
Tier 1 + **performance measurement** (draw calls, triangles, frame time from the F8 overlay on the farm; `tools/smooth.js` before/after when the frame loop,
`gfx.js` or `venues.js` is touched) + `tests/career-browser.js` (≈ 3.5 min) when `career.js` or save data was touched.
The long-duration racing suite is **deferred** — say so in the report.

**Tier 3 — FULL regression** (every Node test in `CAREER_PLAN.md` §4 + every browser test incl. `longrace-browser.js` ≈ 18 min and `career_difficulty.js` ≈ 5–7 min):
run when a change touches **race physics, simulation timing, starting mechanics, horse attributes that affect racing (`toDef`, attributes, fitness/age/growth effects when
they are switched on in Phase 9), race results / rewards (`onResult`, `finishRace`, `season.js`), difficulty (`raceField`), commentary, `sim.js`, the race part of
the frame loop, `gfx.js` / `venues.js` shared systems**, **before a major release** (the end of Phase 9 — when fitness/age/growth start to affect racing —
and Phase 14), **and whenever an earlier failure suggests a regression risk**.
Phase 2 and Phase 3 each ran the full suite (this file's test reports).

**Rules:** a browser test that fails is rerun once on its own before it counts as a real failure — report both results. Timing-sensitive tests
(`start-browser`, `steering-browser`) are not run while a CPU-heavy job is running. Multiplayer tests stay "not run — multiplayer disabled by design".
Never claim a test passed without running it.

## Phase 2 — what was implemented

Racing, physics, graphics, horse models, controls, AI and commentary are untouched. The only edits to shared files are the
multiplayer flag and one script tag in `index.html`.

1. **Multiplayer hidden and disabled.** `FF_FEATURES.multiplayer = false` (`public/index.html`). The menu button is hidden;
   `?join=` links and automatic rejoin of an online room do nothing (verified in the browser: no WebSocket is opened). All
   code is kept: `public/mp.js`, `server/`, `tests/mp-*.js`. Flip the flag back to restore it. README and HANDOFF updated
   (and the stale `?mp=1` note corrected: no such switch ever existed).
2. **`public/career-core.js` (new, pure logic, Node-testable, global `CORE`)**, registered in `tools/build-single.js` and in
   `index.html` before `career.js`:
   - **Save schema v4 and migration** (`CORE.migrate`, chained after `SEASON.migrate`; idempotent; removes and rewrites nothing).
     New top-level fields: `day, cash, ledger, ledgerSeq, txn, fin, fac, staff, player, market, hof, rep, entries, notices,
     farm, cal, migrated`; new per-horse fields: `foaled, age, growth, fitness, composure, lastRaceDay, trainDay,
     trainedToday, plan, acquired, retired, value`. Damaged v4 values are clamped or replaced by defaults.
   - **Existing careers** keep every horse, attribute, potential, appearance, record, trophy and the whole championship
     (season, rivals, world, head-to-heads are byte-identical after migration — tested). They gain: age 3 (+1 per season
     since the horse was created, max 6), fitness 90, a seeded growth profile, the $150,000 starting package plus a credit of
     10 % of recorded prize money (capped at $250,000) as two audited ledger entries, no staff, Basic facilities, and dates:
     today = the day after the last completed round (or 1 August of the current season). No retroactive expenses.
   - **Calendar.** Day 0 = Sat 1 Aug 2026 = start of season 1; season *n* runs 1 Aug – 31 Jul (leap years handled); horses
     age on 1 August. `advance(C, days)` never goes back, recovers fitness, ages horses, and **refuses** (returns
     `needsConfirm` with the events that would be missed) if it would pass an open championship round — unless `{force}`;
     `{cap}` stops at the next open round. (No player-facing "advance time" button exists yet; only forced/capped calls are used.)
   - **Money ledger.** Every cash change is `CORE.apply(C, key, amount, kind, note)`: a key applies **once, ever** (duplicates
     change nothing), cash can't go negative (unless a debt type says so), bad amounts/keys are refused without side effects,
     the last 300 entries and per-season income/spend summaries are kept, `CORE.audit` verifies the chain.
   - **Prize schedule.** `prizeFor(meta, place)`: places 1–5 share the race's purse (60/20/10/6/4 %; Group 1/crown races
     58/19/10/7/6 %). Purse = the race's `prize` string, read in one place. Optional races have no purse and pay nothing (as before).
   - **Horse data + rules (no effect on racing yet):** age from the calendar, per-horse growth profile (early/average/late
     developer, peak age, decline age/rate), `devRate`/`declineRate`, race fitness cost (distance, going, fall, endurance),
     daily recovery (recovery attribute + facility), the small unfit penalty, a form index.
   - **Dated programme.** `placeSeason` lays out the season deterministically from the career seed: championship rounds in
     order on Saturdays across 1 Aug–31 Jul, plus 3 dated meetings of each of the 8 optional races, each event storing a
     time of day (evening only at Randwick/Flemington, which have lights) and a weather + going forecast. A round's forecast
     going is exactly the going the season already assigned it, so race conditions are unchanged. The stored programme is
     never re-rolled on reload.
   - **Backups, export, import.** `backup()` writes the exact original text, reads it back, never overwrites an older copy
     (adds a timestamp instead) and reports failure honestly. `exportSave` wraps the save with a version + checksum;
     `parseImport` rejects empty, cut-off, edited, wrong-shape, too-large and newer-version files.
3. **`public/career.js`:**
   - `load()` → verified backup of the stored text whenever the version isn't 4 (`ff_career_v<N>_backup`; this now includes
     v3, and a *newer* save opened by this build) → `prepare()` = `sanHorse` + `SEASON.migrate` + `CORE.migrate`. `sanHorse`
     keeps valid v4 horse fields. `save()` now reports a failed write once instead of failing silently.
   - `onResult` credits prize money once through the ledger (key `prize:s<season>:<raceId>:<horseId>`; the horse's own prize
     record grows only by what was credited), writes the date and prize onto the race history entry, applies the post-race
     fitness cost, and shows the prize + cash on the results panel. An optional race takes one calendar day (never past the
     next open round).
   - Entering a round (or skipping it) sets the date to the round's scheduled day, never backwards. Finishing a season
     builds the next programme and moves to 1 August (ages the horses once).
   - A newly created horse gets the v4 fields (age 3, fitness 100).
4. **UI (minimal):** the career hub shows the date and cash and has an **Office** button; the next-event panel, the season
   calendar, the event screen and the optional-race list show dates, time of day and forecast. **Office** screen: cash and
   this season's income/spending, the ledger (25 latest) and season summaries, the dated upcoming calendar, horse condition
   (age, fitness, development type — labelled as not yet affecting racing), and *Save & backups*: download a career file,
   copy to clipboard, import from file or pasted text (shows what's inside and asks first; verified backup of the current
   career before replacing; refused files change nothing), list of backup copies.

## Test report — Phase 2 (every number below came from actually running the test on the final code)

Baseline = the same test run on the untouched code (commit `5139a6f`) before any change.

| Test | Result | Baseline |
|---|---|---|
| `node tests/career-core.js` (new) | **PASS** 128 / 0 | — |
| `node tests/season.js` | PASS 64 / 0 | 64 / 0 |
| `node tests/riding-control.js` | PASS 25 / 0 | 25 / 0 |
| `node tests/randwick.js 2` | PASS 41 / 0 | 41 / 0 |
| `node tests/flemington.js` | PASS 46 / 0 | 46 / 0 |
| `node tests/chaos.js public/sim.js` | PASS 25 / 0 | 25 / 0 |
| `node tests/avoid.js public/sim.js` | PASS 12 / 0 | 12 / 0 |
| `node tests/commentary.js 36` | PASS 164 / 0 | 164 / 0 |
| `node tests/commentary-scenarios.js 160` | PASS 1881 / 0 | 1881 / 0 |
| `node tests/eleven-plan.js` | PASS 9 / 0 | 9 / 0 |
| `node tests/career_difficulty.js 100 3` | PASS — output identical to the baseline run (1100 races) | — |
| `tests/career-browser.js` (extended: +27 Phase 2 checks) | PASS 114 / 0 | 87 / 0 |
| `tests/steering-browser.js` | PASS 70 / 0 | 70 / 0 |
| `tests/start-browser.js` | PASS 8 / 0 | 8 / 0 |
| `tests/replay-lunge-browser.js` | PASS 9 / 0 | 9 / 0 |
| `tests/presentation-browser.js` | PASS 11 / 0 | 11 / 0 |
| `tests/eleven-browser.js` | PASS 12 / 0 | 12 / 0 |
| `tests/longrace-browser.js` | PASS 5 / 0 (1087 s) | not completed (see below) |
| `tests/auto-quality-browser.js` | PASS 12 / 0 | not completed (see below) |
| `node tests/single-browser.js` (new; the built single file opened from disk) | PASS 8 / 0, repeated 8 times in a row | — |
| `tests/mp-*.js` (protocol, e2e, spectate, leader, chaos, career) | **not run — multiplayer disabled by design** | — |
| `tools/smooth.js` | not run — Phase 2 does not touch the frame loop, graphics or venues (the built file differs from the pre-change build only in the multiplayer flag, the new core and `career.js`) | — |
| `tests/voice-browser.js` | not run — not in the `CAREER_PLAN.md` §4 list (slow, needs downloaded voice models) | — |

Failures that happened along the way (all were faults in the new tests, none in the game):
- `career-browser.js` first run on the new code: 113 passed, **1 failed** (a wrong expected string in one of my new checks — `join('')` vs `join()`). Fixed; rerun alone 114 / 0; the final full run also 114 / 0 first time.
- `single-browser.js`: failed on 4 of 6 early runs because it wrote the test save to `localStorage` and then reloaded a `file://` page, which loses the write in headless Chromium (the game then, correctly, started a fresh career). Reworked to seed storage before the page loads; 8 / 8 runs pass since.
- The baseline `longrace` and `auto-quality` runs on the old code were stopped before finishing because the machine was busy with other tests (`longrace` takes ~18 minutes here), so no baseline exists for them; both pass on the new code.
- Mutation check: deliberately removing the duplicate-key guard, the negative-cash guard and the starting-cash step each made `career-core.js` fail (13, 6 and 19 failures), so those tests do detect the faults they are meant to.

What the new tests cover: v1, v2 and v3 save fixtures migrated with every horse field, appearance, trophy and the whole championship byte-identical; money (a prize is credited exactly once across replay, reload and a second result call; cash never negative; fuzzed with 6,000 random operations); calendar maths including leap years and the 1 August roll-over; deterministic dated programme (Saturdays, order, evening races only at lit courses, weather fits the going, going unchanged); backups (written, read back, never overwritten, failure reported); export/import (round trip, tampered, cut-off, newer-version and money-inconsistent files refused, current career backed up first); the real browser flow (v1 save → v4, Office, hub, forced win paying $24,000 once and surviving a reload, optional races, season roll-over ageing horses, hidden multiplayer including `?join=` and a stored online session opening no socket).

## Test report — Phase 3 (full suite; every number came from actually running the test on the final code)

| Test | Result | Phase 2 result |
|---|---|---|
| `node tests/career-core.js` | PASS 128 / 0 | 128 / 0 |
| `node tests/season.js` | PASS 64 / 0 | 64 / 0 |
| `node tests/riding-control.js` | PASS 25 / 0 | 25 / 0 |
| `node tests/randwick.js 2` | PASS 41 / 0 | 41 / 0 |
| `node tests/flemington.js` | PASS 46 / 0 | 46 / 0 |
| `node tests/chaos.js public/sim.js` | PASS 25 / 0 | 25 / 0 |
| `node tests/avoid.js public/sim.js` | PASS 12 / 0 | 12 / 0 |
| `node tests/commentary.js 36` | PASS 164 / 0 | 164 / 0 |
| `node tests/commentary-scenarios.js 160` | PASS 1881 / 0 | 1881 / 0 |
| `node tests/eleven-plan.js` | PASS 9 / 0 | 9 / 0 |
| `node tests/career_difficulty.js 100 3` | PASS — output identical to the pre-expansion baseline | identical |
| `tests/career-browser.js` | PASS 114 / 0 | 114 / 0 |
| `tests/scenes-browser.js` (new) | **PASS 36 / 0** — run 4 times on the final code, 36 / 0 every time | — |
| `tests/steering-browser.js` | PASS 70 / 0 | 70 / 0 |
| `tests/start-browser.js` | first run **7 / 1 failed** ("stage 3: 2 pushes into stride, drive 54%"); rerun alone **8 / 0**; three further runs alone 8 / 0 each | 8 / 0 |
| `tests/replay-lunge-browser.js` | PASS 9 / 0 | 9 / 0 |
| `tests/presentation-browser.js` | PASS 11 / 0 | 11 / 0 |
| `tests/eleven-browser.js` | PASS 12 / 0 | 12 / 0 |
| `tests/auto-quality-browser.js` | PASS 12 / 0 | 12 / 0 |
| `tests/longrace-browser.js` | PASS 5 / 0 (1096 s) | 5 / 0 |
| `node tests/single-browser.js` | PASS 8 / 0 (on the Phase 3 build) | 8 / 0 |
| `tools/smooth.js` before/after (randwick + flemington × chase/jockey cams × 60/144 Hz, 8 conditions) | motion judder (horse and camera cv, d2) **identical** in all 8; draw calls **identical** (222–270); allocation within noise; update-cost p95 equal or lower; render-cost p95 moves both ways between runs — a focused repeat (randwick/chase/60, old and new code alternately, 3 rounds each) gave old 3.8 / 4.9 / 5.13 ms vs new 5.96 / 4.73 / 4.83 ms (p50 2.45–2.55 vs 2.45–2.67), i.e. overlapping — **no measurable change** | — |
| `tests/mp-*.js` | **not run — multiplayer disabled by design** | not run |

The one failure: `start-browser` first run, while the CPU-heavy Node regression was running on the same machine (this test taps keys against real frame timing; the code it exercises is untouched by Phase 3). It passed alone on the rerun and on three more runs once the machine was quiet. The baseline `smooth.js` was taken on the untouched code (separate checkout) before any Phase 3 edit.

What `scenes-browser.js` verifies (all in the real game): scenes follow the UI state (menu / stable / office / farm / race) and input contexts switch with them; the loading overlay; the farm shows the career's two real horses in five plaque-labelled boxes; **no race and no race meshes exist on the farm and no frame of the race scene is drawn there (30 farm frames, 0 race frames); the farm is not drawn during a race**; F8 counters and AUTO quality keep running on the farm; W/S/A/D/Shift/←→ movement, stable-block collision and the boundary; **W, Space, P, C, Q, R on the farm change nothing in the riding controls' key map, effort or camera**; the E prompt only near the float, E opens the real next-round event screen with the farm's listeners removed and its horses disposed; Esc returns to the hub; **a key held on the farm is released when a race starts**; riding keys work normally in the race; **leaving a race cancels commentary and nothing more is spoken**; **10 farm ↔ race round trips (identical field): geometries 282 → 282, textures 67 → 67, programs Δ0, JS heap Δ ≈ 0.5 MB; farm back to the same 50 scene objects, 2 horses, 5 plaques; career save data byte-for-byte unchanged**; `FARM.dispose()` frees the static geometry (297 → 272) and the next visit rebuilds it.

## Known issues / limits (carry into later phases)
- **Optional races pay nothing and take a day each; cash can't be spent yet.** Prize purses are the race data's face values
  (a Golden Eagle win credits $5.8 M). Phase 7 must rebalance purses, add entry fees/upkeep, and simulate whole careers.
- **Ageing/fitness/growth have no effect on racing** (by design). `CORE.fitnessPenalty` exists but is not wired to `toDef`.
  Phase 9 switches them on. Existing horses are capped at age 6 on migration so none arrive in decline.
- **`advance()` skip warnings have no UI yet** — nothing in the game advances time except entering/skipping rounds, finishing
  a season and optional races. Phase 6/13 add the "advance day / next race" controls and must use the `needsConfirm` result.
- **Time of day and weather are stored but not rendered** (Phase 12). Optional-race meetings are informational: any optional
  race can still be entered at any time (as before); Phase 11 will tie entry to dated events.
- **Entering a round moves the date before the race starts.** If the player quits mid-race the date has still advanced (no
  rewards are lost). Phase 13's atomic "save then travel" flow should own this.
- **`ff_career` is stored as plain JSON in localStorage** (5 MB browser limit). A save is ~70 KB after migration and stays
  below ~520 KB after eight simulated seasons (tested). The ledger window (300 entries) and applied-key set (4,000) are bounded.
- **Commentary intro at unknown venues.** A career race at a venue other than Randwick or Flemington picks the generic intro
  "Welcome to Furlong Park…" (`commentary.js` `venueKey`). Fix in Phase 11 with neutral existing lines.
- **Venues are cached forever** (`venues.js` `use`). Measured in Phase 3: ten farm ↔ race round trips (identical field) leave GPU geometries/textures unchanged (282 → 282, 67 → 67), JS heap Δ ≈ 0.5 MB. With *random* opponents the game's own horse-model cache grows for the first ~7 races, then flattens (277 → 304 geometries) — a cache, not a leak. No dispose path is needed yet; `FARM.dispose()` exists for the farm.
- **The career *stable* frame path still skips `perfFrame`/`autoTick`** (unchanged; they do run on the farm and in races).
- **GitHub zip not regenerated** (the user's upload zip is a build output; this phase was delivered as a git push + the artifact).

## Phase 3 — what was implemented (scene separation)

The race itself is untouched: no change to `sim.js`, the race loop's simulation/render code, physics, graphics, horses, AI or commentary.

1. **`public/scenes.js` (new) — `SCENES`**, a scene + input-context manager that *follows the existing UI state*: `show()` calls
   `SCENES.sync(state)`, so every existing screen works exactly as before. Scenes: `menu · stable · office · farm · race`.
   Input contexts: `race` (racing/pause/replay/parade/celebrate), `farm`, `ui`. On every scene change the held keys are released
   (like the window-blur handler). Per-scene `enter/leave` hooks (`SCENES.register`), a loading overlay (`SCENES.withOverlay`),
   `SCENES.enter("farm" | "career" | "menu", {instant})`, and a resource ledger: `snapshot()` (GPU geometries/textures/programs,
   JS heap, whether a race is alive, farm info), `mark(name)` / `check(name, tol)` for leak checks, and a log of the last 40
   transitions. Every route out of the race world goes through `SCENE_SERVICES.leaveRace()` (index.html): finishes a parade/
   celebration, clears replay/highlights, `race = null`, `clearRaceMeshes()`; `show()` already silences the commentary.
2. **`public/farm.js` (new) — `FARM`, a labelled PLACEHOLDER scene**: its own `THREE.Scene` + camera drawn by the shared
   renderer (the `STABLE3D` pattern). Flat ground, a stable block with five boxes where the career's real horses stand (via
   `CAREER.farmStalls()` → `buildHorse(toDef(h))`) with name plaques, a horse float, trees, a walkable placeholder figure,
   third-person camera, and one interaction point: **E — Travel to next race** (opens the usual event screen for the next
   championship round). Movement: W A S D, Shift = run, ← → or drag = look, **Esc = back to the Career hub**; simple collision with
   the stable block and float and a boundary. `enter()` builds the static geometry once (kept afterwards), stands the horses, and
   attaches the farm's own keyboard/pointer/resize listeners; `leave()` removes the listeners and disposes horses + plaques;
   `FARM.dispose()` frees the static geometry too (low-memory mode).
3. **Input isolation.** The farm's listeners run in the *capture* phase and swallow every plain key (not Ctrl/Alt/Meta or F-keys)
   while the farm is active; the riding controls' global `keydown` also returns early when `SCENES.input === "farm"`. The farm
   keeps its own key map. Farm keys therefore never reach `keys`, `riderInput` or the camera, and race keys are inert on the farm.
4. **Frame loop (`index.html`):** a farm branch (`FARM.frame(dt)`, then `perfFrame`) placed before the career-stable branch;
   `GFX.autoTick` now also runs while on the farm, so F8 diagnostics and AUTO quality work there (this fixes the audit's
   "career frame path skips diagnostics" for the farm; the career *stable* screens still skip them — unchanged).
5. **`career.js`:** a **Farm (preview)** button on the Career hub; `CAREER.farmStalls()` and `CAREER.travelToNextRace()`.
6. **`tools/build-single.js`** inlines `scenes.js` and `farm.js`; both have `<script>` tags before `career-core.js`.

## Phase 4 — what was implemented (the farm environment)

The race, physics, graphics, horses, AI and commentary are untouched. `index.html` only gained script tags. All new code is in new files:

| File | Role |
|---|---|
| `public/farm-world.js` | **the kit**: the layout (single source of truth, `FARMWORLD.L`), terrain height function, procedurally generated textures *with* normal maps (weathered boards, wood grain, weatherboard, corrugated iron, gravel, dirt, sand, straw, concrete), materials, and `Batch` — merges boxes / quads / cylinders / beams per material and ~48 m cell with metre-based UVs |
| `public/farm-build.js` | **structures**: stable block, farmhouse, feed shed, vet bay, float + ute, oval rails/gates/timing hut, paddock fences/gates/troughs/shelter, courtyard furniture + sign arch, boundary + entrance |
| `public/farm-trees.js` | **trees**: gum, Moreton Bay fig, cypress — tapering vertex-coloured trunks and limbs plus crossed leaf-spray cards carrying a generated leaf texture (alpha-tested, canopy-centred normals, mip-safe edges), 2 gum shapes × 2 levels of detail |
| `public/farm-ground.js` | **land and plants**: rolling terrain (fine mesh round the property + coarse mesh out to the hills) on the racecourse turf shader extended with a painted **splat map** (paths / courtyard / worn dirt / oval sand, noisy broken edges, no extra geometry), sky dome + fog, instanced shrubs / boulders / grass tufts / trees with distance LOD and per-cell frustum culling, and `assemble()` |
| `public/farm.js` | **scene lifecycle**: build once, per-visit horses and plaques, own listeners, third-person walker, collision (boxes + capsules + boundary), sun + shadow that follow the player, interaction points, view presets for screenshots |
| `tools/farm-shots.js` | real in-game screenshots from the preset angles |

**The property** (220 × 160 m walkable, metres, x east / z south, courtyard at the origin): central crushed-granite **courtyard** (fig tree in a sleeper-edged bed with benches, water trough, hitching rails, lamp posts, mounting block, barrow and bales, timber **sign arch** carrying the stable's name); north, the **stable block** — five loose boxes 4 m wide under a 29 m verandah (concrete apron with expansion joints and kerb, posts with brackets, gutter and downpipes, corrugated roof with ridge cap, three roof vents, soffit lining, weatherboard gables), each box with a timber front, steel-bar flanks, a Dutch door (lower leaf shut with strap hinges and latch, upper leaf standing open), solid-board/steel-bar partitions, lintel, straw bed banked at the walls and a rubber mat, hay net, water bucket, feed bin and a plaque on the left flank (name · age · condition · rating · recent form · next race for the active horse); a **tack room** and an open **wash bay** (sloped slab, drain, hose reel, wash rail) at the ends; west, the **farmhouse** (weatherboard on brick piers, hipped iron roof, chimney, front verandah with decking, balustrade, steps, shuttered windows, front door, rainwater tank, white picket garden fence, shrubs, palms, cypress screen); east, the **feed & equipment shed** (steel-clad, roller door, lean-to with ~100 hay bales, silo, tank, feed bins), the **vet bay** (concrete slab, timber walls, iron roof, steel crush, table, cabinet) and the **horse float + ute** on a hardstand; south, the **exercise oval** (381 m round the middle of the track, ~9 m wide sand, white post-and-rail on both sides with a gap at the gate, striped furlong poles, a four-stall **starting-gate practice** unit, timing hut and bench); three **paddocks** (post-and-rail with galvanised gates, concrete troughs, steel hay-feeder rings, a timber-and-iron shelter, shade trees, grass tufts, boulders, worn dirt at the gates); post-and-wire **boundary**, brick-pillared **entrance gate** with name board and letterbox, a gravel drive lined with gums, eucalypt windbreaks, rolling hills fading into haze.

**Interaction points:** the float ("E — Travel to next race", as in Phase 3) and the farmhouse door ("E — Enter the farmhouse office" → the Office screen; Back returns to the hub).
**Walking:** collision against 35 buildings/props and 276 fence/rail sections plus the boundary; the walker follows the terrain; the camera never goes under the ground.
**Not walkable by design:** inside buildings, inside the paddocks (closed gates) and the oval's infield (no gap in the inner rail) — verified by a reachability search in the test.

## Test report — Phase 4 (risk-based; farm-only change — see "Testing policy")

__P4_REPORT__

## Known issues / limits after Phase 4
- **The walker is still a stand-in figure** (Phase 5 builds the real character, appearance and outfits). The camera is simple (no obstacle pull-in yet).
- **Paddocks are fenced scenery only** — no horses graze in them yet; horses stay in their boxes (the spec's per-box display). The paddock gates are closed.
- **No interaction yet with the horses, the stalls, the vet bay, the training area or the gate practice** (Phase 6 / 9). Their areas exist and are reachable.
- **Time of day and weather are not applied** to the farm (fixed warm late-morning light; Phase 12).
- **The oval is ~381 m (middle of the track)**, a little under the plan's 400–600 m; its rails are 353 m and 410 m.
- **First entry builds the property** (~1 s of geometry + texture generation on a fast machine, ~3 s on this software renderer) behind the loading overlay; later visits are instant.
- Software-GL screenshots show the farm without antialiasing at 1600 × 900; the real game uses the renderer's normal settings.

## Exactly what Phase 5 requires (from `CAREER_PLAN.md` §3 and `CAREER_EXPANSION_SPEC.md` §5; do not start until the owner approves Phase 4)
Replace the stand-in figure in `public/farm.js` with the real third-person character:
1. **Character** (rigid-part, low-poly but believable human; pattern of `presentation.js makeStrapper`, upgraded): head / hair / skin / build options and **three outfits** — stable, training (riding gear), race-day (with helmet); saved in `C.player` (already in the v4 save: `look{head,hair,hairCol,skin,build}`, `outfit`, `colours`). Procedural walk and jog cycle.
2. **Movement:** WASD relative to the camera, Shift = jog, smooth turning and stopping, XZ collision (already in place against the new colliders), terrain height (already in place).
3. **Camera:** behind and above, mouse/drag orbit with a sensitivity setting, **occlusion pull-in** (raycast against the collider proxies) so walls/trees never block the view, no shake.
4. **Appearance editor** in the Office (a screen over the farm or a Career screen) writing `C.player`.
5. **Tests (Tier 2):** `tests/farm-browser.js` + `tests/scenes-browser.js` still green, new checks for the character (appearance saved/reloaded, three outfits, walk-cycle animates only when moving, camera never inside a collider, sensitivity setting), short racing smoke; performance budget re-measured with the character (≤ 250 draw calls, ≤ 500k triangles).
6. When done: update this file and HANDOFF.md, commit, build, publish to the existing artifact, **give the owner screenshots of the character and outfits**, then STOP.
