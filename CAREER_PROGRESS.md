# Career Mode expansion — progress

> **Post-Phase-14 roadmap (approved 2026-11-25): see `ROADMAP_P15.md` (plan, Phases 15–24) and `PROGRESS_P15.md` (running log). This file remains the record of Phases 1–14.**

Master specification: `CAREER_EXPANSION_SPEC.md` (saved verbatim; refer to it rather than asking for it again).
Implementation plan (approved): `CAREER_PLAN.md`.
**Rule: one approved phase at a time. After a phase: tests, git commit, playable build, update this file — then STOP and wait for the owner's review.**  *(Superseded for the final stretch: the owner authorised Phases 7–14 to be built in one run on the dev branch; all are now built but only 1–4 are approved — see the section below.)*

---

## ⭐ FINAL STATE OF THE 14-PHASE ROADMAP — handoff for the next planner (read this section first)

**Status:** all 14 phases of the original Career Mode expansion are **implemented on the dev branch `claude/amazing-clarke-jzpr1x`** and the automated suites below pass. **"Implemented and automatically tested" is not the same as "played and approved".** Only Phases 1–4 were explicitly approved by the owner. Phases 5–14 have been *built and machine-tested*, never signed off. The owner has reported a **racing micro-stutter regression** in the current build (section E) — it is the **highest-priority unresolved issue** and nothing new should be built on top of the game until it is understood.
The detailed per-phase sections further down this file are the historical record and are still accurate for *what was built*; where an older "Known issues after Phase N" list conflicts with this section, **this section wins** (several of those limits were removed by later phases).
Companion documents: `HANDOFF.md` (architecture, files, saves, scenes, performance, the gameplay as it plays today, the owner's next-generation farm vision and the systems that can be reused for it), `FINAL_REPORT.md` (the Phase 14 report, the full test table, balance numbers, smoothness before/after), `CAREER_PLAN.md`, `CAREER_EXPANSION_SPEC.md`.

### A. Phase-by-phase verification (what exists, what was tested, who has reviewed it)

| # | Phase | Implemented | Automated tests (final run unless noted) | Owner review |
|---|---|---|---|---|
| 1 | Audit | yes (`CAREER_PLAN.md` §1) | n/a | accepted |
| 2 | Career data, save v4 migration, ledger, calendar | yes | `career-core` 128/0 · `career-browser` 114/0 · `single-browser` 8/0 | **approved** |
| 3 | Scene separation (`SCENES`) | yes | `scenes-browser` 38/0 | **approved** |
| 4 | Farm environment | yes | `farm-browser` 34/0 | **approved** ("it's really good") |
| 5 | Menu over the farm, Career lands on the farm, farmhouse + calendar booking, first/third person, float drive-off | yes (on `main` too) | `farm-flow-browser` 74/0 | the owner directed it after Phase 4; no explicit approval of the finished phase is recorded |
| 6 | Horse care, guided race day, guidance lines, playable ute, in-farm drills, character | yes | `phase6-core` 43/0 · `phase6-browser` 105/0 (see note 1) | partly: the owner reviewed the character against a reference picture and asked for changes (done) — the rest unreviewed |
| 7 | Finances | yes | `phase7-core` 40/0 · `phase7-browser` 19/0 (see note 2) · `economy` 8/0 | **unreviewed** — balance is by simulation only |
| 8 | Staff, facilities, living farm (turnout, staff NPCs, wash bay, signs) | yes | `phase8-core` 37/0 · `phase8-browser` 26/0 | **unreviewed** |
| 9 | Long-term development, plans, mount/dismount, six drills | yes | `phase9-core` 44/0 · `development` 11/0 · `phase9-browser` 33/0 | published for the owner, who asked for the character to be fixed; the development model and drills themselves are **unreviewed** |
| 9b | Rigged character (owner request) | yes | covered by `phase6-browser` (23 bones, one skinned mesh) | **unreviewed since the rebuild** — the owner has not yet said whether it now meets the brief |
| 10 | Horse market (buy/sell/bid/create fee) | yes | `phase10-core` 71/0 · `phase10-browser` 33/0 | **unreviewed** |
| 11 | Regional / grassroots circuit, two country venue looks | yes | `phase11-core` 41/0 · `phase11-browser` 11/0 · `career_difficulty` (rates below) | **unreviewed** |
| 12 | Time of day and weather (race + farm) | yes | `phase12-core` 36/0 · `phase12-browser` 24/0 | **unreviewed — and the prime suspect list for the stutter includes it (section E)** |
| 13 | Transport transitions (summary, save-then-travel, all-or-nothing start, welcome home) | yes | `phase13-browser` 23/0 | **unreviewed** |
| 14 | Balance, retirement / Hall of Fame, anti-exploit rules, farm map, final report | yes | `retirement` 17/0 · `phase14-browser` 11/0 | **unreviewed** |

Note 1 — `phase6-browser` failed once in the final run (104/105) and again on the automatic rerun: its quick-departure step reused a horse that had already raced that day, which the Phase 14 once-a-day rule correctly refuses. The test was fixed (it now rests that horse first) and re-run: **105/0**.
Note 2 — `phase7-browser` was **not part of the final full run** (it was missed) and, when run during this handoff, had **one stale expectation**: it expected an empty box to open the horse creator, but since Phase 10 the empty box opens the Horse Market (whose *Create* tab leads to the creator). The test was updated to expect the market and now passes **19/0**. This was a test-maintenance fix; no game code changed.

**Also verified for this handoff (re-run on the final code):** `career-core` 128/0, `retirement` 17/0, `phase7-browser` 19/0, and `git diff 5139a6f HEAD -- public/sim.js` is empty — **`sim.js` (race physics, results, AI) is byte-identical to commit `5139a6f`, the earlier `main` state**; the racing code that did change is rendering/lighting/scene glue (`gfx.js`, `venues.js`, `index.html`, `commentary.js` one line, `scenes.js` new).

### B. The final test run (every number came from a real run on the final code; full table in `FINAL_REPORT.md` §7)
Node: `career-core` 128 · `season` 64 · `development` 11 · `economy` 8 · `phase6/7/8/9/10/11/12-core` 43/40/37/44/71/41/36 · `retirement` 17 · `commentary` 164 · `commentary-scenarios` 1,881 · `randwick` 41 · `flemington` 46 · `riding-control` 25 · `avoid` 12 · `chaos` 25 · `eleven-plan` 9 — all 0 failures; `progression` and `career_difficulty` print tables.
Browser (headless Chromium, software GL): `career` 114 · `farm` 34 · `farm-flow` 74 · `scenes` 38 · `phase6` 105 · `phase8` 26 · `phase9` 33 · `phase10` 33 · `phase11` 11 · `phase12` 24 · `phase13` 23 · `phase14` 11 · `phase7` 19 (re-run for this handoff) · `steering` 70 · `start` 8 · `replay-lunge` 9 · `presentation` 11 · `eleven` 12 · `auto-quality` 12 · `longrace` 5 · `single` 8 — all 0 failures on the final code (the two exceptions above were test issues, fixed and re-run).
**Not run:** `tests/mp-*.js` (multiplayer disabled by design); `voice-browser` (needs the ~15-minute neural-voice download — not touched by this work); `field`, `pileup`, `pushfall`, `season_balance`, `strat`, `incidents` (race physics unchanged — `sim.js` identical to `main`'s ancestor).
**Flaky under load:** `longrace-browser` failed 4/5 twice while other heavy jobs ran on the machine and passes 5/5 alone; `start-browser`/`phase9` rhythm checks have each needed a rerun once for timing. Every test that failed was rerun and **both results were reported**.
**Career difficulty (Hard-jockey proxy for a well-ridden horse, 100 races per row, from the final run):** Quick Race Hard 11 % · new horse in a maiden 29 % · Picnic Maiden 23 % · 3yo Maiden 25 % · Country Maiden Plate 35 % · Country Cup 14–18 % · Benchmark 58 Mile 37 % · Kyneton Cup 21 % · Kingsford Mile 21 % · Spring Final 11 % · Group 1 5 % · Everest 0 % · Melbourne Cup 0 %. (These are simulated races, **not human play-testing**.)

### C. What is *not* verified (be explicit when planning)
- **Nothing here has been run on real hardware.** All browser tests use headless Chromium with a software (SwiftShader) GL renderer, so GPU cost, driver stalls, compositor behaviour, high-DPI, touch and non-Chromium browsers are untested.
- **No human play-through of a whole career** has happened. The economy (`economy.js`: 6 AI-ridden careers), development speed (`development.js`) and difficulty (`career_difficulty.js`) were tuned by simulation. Whether the game is *fun*, too easy or too grindy is unknown.
- **Visual quality of Phases 8–14** (staff, signs, wash bay, rain, golden hour, country venues, the rigged character) has been checked by screenshots/tests and the numbers in the budgets, not by the owner's eye.
- **The published artifact is a headless-tested single file** (8.9 MB); it opens from disk (8/8 checks) but was never tried on a phone or a slow laptop.

### D. Known bugs, incomplete functionality and open items (none of these block play as far as the tests can tell)
1. **Racing micro-stutter regression — OPEN, priority 1** (owner report; section E).
2. **+2.7 MB/s JS allocation** in `tools/smooth.js` after the Phase 12 work (9.5 → 12.2 MB/s). Not explained. A direct 120-frame `renderer.render` loop shows no per-frame difference, so it *may* be one-off set-up inside the measured window — **unproven**.
3. **Farm overview camera is at 250 / 250 draw calls** (the test budget; triangles 261k / 500k). There is **no draw-call headroom** for new scenery, animals or NPCs on the property without new batching/instancing or a budget decision.
4. **Horses do not follow daily routines.** Turnout is manual (lead a horse to a gate); the only autonomous behaviour is a paddock horse wandering/grazing, a stable hand shuttling buckets, and hired staff walking between stations. The property is "alive" but not *scheduled*. (This is the owner's next-generation farm brief — `HANDOFF.md` §"Next-generation farm".)
5. **There is no continuous time of day on the farm.** The farm shows one fixed `tod`/weather for the calendar date (race day shows the race's own look); it does not progress through the day.
6. **Weather and lighting are visual (and drive the forecast display); they do not alter race physics.** The *going* still comes from the calendar's stored forecast exactly as before; `sim.js` is untouched.
7. **Commentary** for country venues uses the existing neutral recorded lines; **no new voice clips were recorded or priced** (decision on record). Regional town names are not spoken.
8. **Retirement** is reachable only through Market → Sell/Retire tab; the Hall of Fame screen is reached from there (and the farm ledger). There is no farm-side ceremony, no breeding, no stud career for retired horses.
9. **Training drills map the sim's progress onto the farm oval** (the oval is ~381 m; the sim's own bends are not the farm's bends). Rewards are balanced against the sim's own measures.
10. **Regional circuit is not a money machine by design** (≈ $1,000 expected prize per start against a $400 entry fee and ~$2,000 a week of bills) — if play-testing finds it too stingy, `ECON`/`LIFT` are the knobs.
11. **`main` and the dev branch have diverged.** `origin/main` = `d3bd1d8` ("Phase 5 complete: final test report, Phase 6 handoff"): `main` contains Phases 1–5 (its history includes `bc5b8d7`) **plus two docs/test commits the dev branch does not have** (`7535d54`, `d3bd1d8`: edits to `CAREER_PLAN.md`, `CAREER_PROGRESS.md`, `HANDOFF.md`, `tests/farm-flow-browser.js`). The dev branch holds **everything from Phase 6 to Phase 14** (24 commits past the common ancestor `bc5b8d7`, plus the handoff commit). **Nothing has been merged into `main` by this work.** A merge will conflict in the three docs (the dev branch's versions are the maintained ones) and needs the owner's approval.
12. **Housekeeping:** a stray `[quick]` debug line in `tests/phase6-browser.js` (guarded by `P6_DEBUG`, harmless); the session task list in the Claude UI still shows Phases 8–14 as pending (stale bookkeeping only); `docs/WORKLOG-P*.md` stop at Phase 5 (this file and `HANDOFF.md` are the maintained records).
13. **Multiplayer** remains hidden (`FF_FEATURES.multiplayer = false`); its code and `tests/mp-*.js` are untouched and unrun. The online server still races on the generic course and does not know about career v4 fields beyond the horse picker.

### E. 🔴 Highest-priority unresolved issue — racing micro-stutter regression
**Report:** the owner reports visible micro-stuttering while racing in the current build. **It has not been reproduced here, and the cause is not known.** Nothing below is a diagnosis; it is the evidence so far and a list of places to look.

**History.** Micro-stutter was fixed once already (see `CHANGES.md`, "smooth racing"): the sim runs at a fixed 120 steps/s and each frame now draws every horse at its exact position between the last two steps (`visPrev/visBegin/visEnd` in `index.html frame()`; **F7** toggles it with **F8** diagnostics on). That fix was measured at ≈ 0 % speed judder on a synthetic 60 Hz / 144 Hz display clock. `sim.js`, which owns the stepping, is byte-identical today. So the regression, if it is real, is not in the stepping logic itself — it is somewhere between "the frame is drawn" and "the frame reaches the screen", or in the work the frame loop now shares with the farm.

**What has been measured (all headless, software GL):**
| Test | What it showed |
|---|---|
| `tools/smooth.js` (real `frame()` driven by a synthetic RAF clock with ±0.7 ms jitter; Randwick + Flemington × chase / jockey / broadcast cameras × 60 / 144 Hz; 600 frames; rendering stubbed for the motion pass, real for the CPU pass) | **Phase 3 before/after (8 conditions):** motion judder identical, draw calls identical (222–270), update-cost p95 equal or lower, render-cost p95 overlapping between runs. **Phase 11–14 before/after (Randwick, chase + jockey):** horse speed 17.75 m/s and camera 17.6 m/s, 0 stalls, both before and after; update CPU p50 0.31–0.45 → 0.32–0.34 ms; update + render p50 2.2–2.5 → 2.4–2.7 ms (≈ +0.2–0.3 ms, software renderer); draw calls 222 / 202 and triangles 443k / 486k **identical**; **allocation 9.5 → 12.2 MB/s (unexplained)**. |
| `tests/auto-quality-browser.js` 12/12, `tests/longrace-browser.js` 5/5 (idle machine) | the AUTO quality controller and a long race complete; no errors |
| `tests/scenes-browser.js` 38/38 | 10 farm ↔ race round trips: geometries 282 → 282, textures 67 → 67, programs Δ0, JS heap Δ ≈ 0.5 MB; **no farm frame is drawn during a race and no race frame on the farm** |
| `tests/farm-browser.js` 34/34 | farm ≤ 250 draw calls / ≤ 500k triangles at 8 camera positions |
| `tests/phase12-browser.js` 24/24 | atmosphere applies once per race start; environment-map cache ≤ 5; rain is one draw call and absent when dry |

**Why those results cannot settle the question.** The synthetic clock removes the real display, vsync, the compositor and the GPU: with rendering stubbed and a software renderer, *GPU-side* stalls, shader/driver hitches, texture uploads, vsync mis-pacing, power-saving and frame pacing on a real monitor are **invisible** to `smooth.js`. It also measures a clean, freshly loaded race — **not** a race entered after a farm visit, a long career session, a different time of day/weather, a country venue, or with AUTO quality having changed level. It does not capture GC pauses on a real (large) heap or main-thread long tasks. A "pass" in these tools means "the motion maths and CPU cost are unchanged", not "the game feels smooth".

**Changes since the last build that was known smooth (everything on the race path):** the rest of the farm/career work does not touch the race loop, but these shared things changed: (1) `gfx.js` Phase 12 — sky shader (colours/glow/stars now uniforms, extra trig and a branch), sun/ambient/fill/exposure/fog set per race, environment map built per look (PMREM) and cached, wet-turf material changes, rain mesh; (2) `index.html` — `sunOff()` in three per-frame shadow-camera updates, `GFX.setAtmosphere` at race start, `GFX.autoTick` now also fed by **farm and menu-showcase frames**, the scene manager hooks in `show()` and the frame loop; (3) `venues.js` — `buildCountry` and the country/regional dispatch; (4) `scenes.js` — scene/input-context manager, key release on scene change; (5) the farm world is a large scene that the main menu now renders behind its UI and that `FARM.dispose()` frees / the next visit rebuilds — **what exactly stays resident on the GPU while a race runs has not been measured**.

**Areas to investigate (hypotheses to test with profiling — NOT conclusions):**
1. **The AUTO quality controller sees farm / menu frames** (`autoTick(... || ui.state === "farm" || FARM.showcase)`). The farm is heavier than a typical race frame on weak GPUs, so AUTO can step the quality level down (resolution scale, shadows, LOD bias) *outside* the race and persist it (`ff_autoLevel` in `localStorage`); or it can oscillate (up/down steps with the 60 s fail back-off) once in a race. A mid-race `applyQuality()` (pixel ratio / shadow map / LOD) is a plausible visible hitch. Check `GFX.AUTO.level/changes/last` before and during a race.
2. **GPU memory / residency after a farm visit.** Compare a race entered cold (page load → Quick Race) with a race entered after farm → booking → drive-off. Compare `renderer.info.memory`, program count and frame times between them. The scene tests show no *growth* across trips, but not the absolute resident size on a low-memory GPU.
3. **Phase 12 look cost on a real GPU.** The sky shader is heavier (more math, star branch); wet-turf materials and low-sun shadows differ from the original afternoon. Test the *same* race at `afternoon + clear` (identical to the old look) vs other times of day and weather: if the stutter exists only in the new looks, it is the atmosphere; if it exists in Quick Race too, it is not. Also the shadow-map frustum and shadow texel swimming with the sun offset changing (`GFX.sunOffset` is now a per-look vector, not the old constant).
4. **Race-start hitch vs mid-race stutter.** The first time a look is used, the environment map is generated on the main thread (PMREM), and shader programs compile; confirm these happen before the gates open (the earlier fix compiled shaders before the gates) and not during the first seconds of racing.
5. **Allocation / GC.** The unexplained +2.7 MB/s. Take an allocation profile (Chrome DevTools "Allocation sampling") of ten seconds of racing at the old and new commits; look for per-frame `new Vector3`/closures in the new gfx/venues code and in the HUD/leaderboard/minimap code paths; check the JS heap after a long career session (the career object, the ledger ≤ 300, the market, the calendar are saved with `JSON.stringify` — make sure nothing saves during a race).
6. **Country venues (`buildCountry`)** — different mesh counts, crowd, trees; compare draw calls and frame times at a regional race vs Randwick.
7. **Frame pacing glue.** Verify there is exactly one render loop after scene transitions, that the first frame after the loading overlay/farm→race does not carry a huge `dt` into the interpolation (`visBegin`), that `performance.now` deltas are clamped, and that `F7` (smoothing on/off) still makes the expected difference.
8. **Browser-level effects:** HiDPI render scale, power-saving mode, background tabs, 60 vs 120/144 Hz displays, and the single-file build vs the served build (the owner's artifact is the single file, 8.9 MB).

**Recommended method (do not guess):** (a) ask the owner for their **F8 diagnostics** readout during a stutter (average / median / p95 / p99 frame time, spike count, the frame-time graph and the sim-vs-render CPU split) with and without **F7**, plus: device, browser, refresh rate, quality setting (AUTO?), whether it happens in *Quick Race*, *Career from the farm*, or both, which venue / time of day / weather / camera, and whether it happens on the first race after loading or only after visiting the farm; (b) capture a Chrome **Performance** trace (long tasks, GC, GPU) of 10 s of racing; (c) **bisect** with real-device traces across the commits on the dev branch — `5139a6f` (main's earlier state), `62b7567` (Phase 5), `6c7de66` (Phase 6), `d34d4bc` (Phase 8), `fbec3a8` (Phase 9), `49aaed3` (before Phase 12) and `41c08db` (Phase 12) are good checkpoints; (d) only then change code. Do not claim a cause without a trace that shows it.

### F. The owner's next-generation farm brief
Recorded in full, with the existing systems it can reuse and the constraints (draw-call headroom, optional-not-chores, performance), in **`HANDOFF.md` → "Next-generation farm (owner's proposal)"**. **No work on it has been started** and it should not start until the stutter is understood and the owner has reviewed the game.

### G. Git state at handoff
Branch: `claude/amazing-clarke-jzpr1x` (all work). `main` untouched by this work (see D11 for its divergence). The latest commit hash is quoted in the closing message of the session and in `git log -1`.

---

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
- **Owner's change of direction after the Phase 4 review ("it's really good — make the game centre on the horse property"):**
  1. **Main menu = Settings, Quick Race, Career Mode (How to Play stays), over the horse property as the background** (not the old racecourse).
  2. **Career Mode loads straight into the farm** — walk around it. (First-ever career: create the first horse, then land in the farm.) The old Career hub (standings, rivals, training, trophies, history) stays but is reached from the farm's pause menu, not as the entry screen.
  3. **Go inside the farmhouse and walk around a basic room.** A **race calendar board** (or similar) in the house is where you **select the race** (and the horse) — this replaces "walk to the float to travel".
  4. **Swap between first- and third-person.**
  5. **Booking a race (agreeing it on the calendar) → put the horse in the trailer → drive it off the property**, then the race. First version (Phase 5): automatic loading + drive-off cinematic after you press E at the float; the *interactive* version (lead the horse from its box and load it yourself) belongs to Phase 6/13.
  6. After a career race the player **returns to the farm** (not the hub).
  These are folded into Phase 5 and the later phases (6 horse/farm interactions, 13 transport) — see "Exactly what Phase 5 requires".
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
| 4 — Farm environment | **Done and approved by the owner** ("it's really good") |
| 5 — Character, house, calendar booking, first/third person, menu over the property, trailer departure | **Done** — on `main` (`d3bd1d8`) and on the dev branch (no explicit owner approval is recorded in these notes) |
| 6 — Horse and farm interactions (+ guided race day, playable transport, character rebuild, interactive training) | **Done** — on the dev branch (details below) |
| 7 — Finances | **Built and tested** (dev branch; unreviewed) |
| 8 — Staff and facilities (+ living farm) | **Built and tested** (dev branch; unreviewed) |
| 9 — Long-term horse development | **Built and tested** (dev branch; unreviewed) |
| 10 — Horse marketplace | **Built and tested** (dev branch; unreviewed) |
| 11 — Racing calendar expansion + regional circuit | **Built and tested** (dev branch; unreviewed) |
| 12 — Time of day and weather | **Built and tested** (dev branch; unreviewed; on the stutter suspect list) |
| 13 — Transport transitions | **Built and tested** (dev branch; unreviewed) |
| 14 — Balance, retirement, final report | **Built and tested** (dev branch; unreviewed) — see the FINAL STATE section at the top |

## Git state (historical — as found at the start of Phase 6; see section D11 above for the state at handoff)
`main` (5139a6f) does **not** contain Phases 2–5; they live only on the dev branch `claude/amazing-clarke-jzpr1x` (HEAD bc5b8d7 at the start of Phase 6, 18 commits ahead). Owner's decision (Phase 6 kickoff): **push to the dev branch only; leave `main` untouched until the owner has reviewed the game.**

## Owner decisions for Phase 6 (answers to the kickoff questions)
1. Dev branch only — no push to `main` until reviewed.
2. Care (grooming/feeding) affects **non-race stats only** (recovery, composure/readiness, training-reward bonus). It never changes `toDef`, so racing is byte-identical and the Tier 3 suite is not needed for it.
3. Training drills run **inside the farm scene** on the farm's facilities (oval, gate-practice unit); add a facility if one is needed. (Implemented by running the real `sim.js` `Race` headless for the physics and start mechanics and drawing the horse on the oval.)
4. Add **"Rest a day"** at the farmhouse (advances one day through `CORE.advance`, with the missed-race warning). Rewarded care and drills are capped at one reward per horse per calendar day.

## Exactly what Phase 6 requires (owner's brief, recorded so later sessions don't lose it)
Phase 6 = "Horse and farm interactions", expanded by the owner with these requirements:
1. **Better player character** — believable proportions, face, hair, clothing; walking, running, turning and idle animation; keep customisation and first/third person; efficient to render.
2. **Physical horse interactions** — approach, inspect, groom, feed, prepare for training/racing, lead out of the stall; visible animations (not just menus); real saved horses and career data; modest, balanced, non-compulsory benefits.
3. **Guided race-day preparation** — book (calendar) → objective to visit the horse's stable → walk to the correct stall and prepare → lead the horse out → walk with it to the float → load it (animation) → enter the vehicle → drive down the driveway → transition into the racecourse at the exit. Uses the existing booking, saving and scene-loading systems. **Optional shortcut to skip routine preparation.**
4. **Navigation lines / objectives** — subtle ground guidance (stall → float → vehicle → exit) following walkable paths (not through buildings/fences); upper-left objective panel updates per stage; guidance reducible/disabled in Settings.
5. **Playable transport** — W/S accelerate/brake, A/D steer, smooth follow camera, believable acceleration, basic collision, a clear route out; short and enjoyable; farm unloads and racecourse loads at the exit; no unnecessary overhead.
6. **Interactive training** — existing training facilities usable via E; a few genuinely playable drills (starting-gate practice, acceleration, settling, sprint rhythm); reuse the existing horse controls and data; balanced rewards, no repeat exploits; deeper long-term progression stays in Phase 9.
Constraints: preserve racing/physics/graphics/horses/jockeys/controls/AI/commentary/career/farm scenery/saves; keep farm and race scenes separate; multiplayer hidden (code kept, `mp-*` tests "not run — multiplayer disabled by design"); five-horse maximum; single-file build works; no unrelated refactoring; do **not** begin Phase 7.
Tests required: character/animation, horse interaction, scene transition, single-player regression (risk-based), and specifically booking → preparation → loading → driving → racecourse loading → return to the farm; wrong horse cannot be loaded; cannot depart without a valid booking; no duplicate rewards; no stuck invalid preparation state.

## Requirements carried forward (owner, recorded during Phase 6 — DO NOT LOSE)
- **Phase 11 (racing calendar expansion):** additional, smaller **Australian regional and grassroots racecourses**, so horses progress through country racing before the major metropolitan races.
- **Phase 12 (time of day and weather):** races at different times of day — **morning, midday, late afternoon and golden-hour sunset** (plus the plan's other presets) — with appropriate weather and track conditions.

## Phase 6 — what was implemented (horse and farm interactions, guided race day, playable transport, character, training)

Racing, physics, `sim.js`, graphics kit, venues, commentary, AI and the save format are untouched (the only shared-file edits are `index.html` script tags + one Settings row, `career.js` helpers and `career-core.js` rules). New files: `farm-nav.js`, `farm-care.js`, `farm-day.js`, `farm-drive.js`, `farm-train.js` (all registered in `index.html` and `tools/build-single.js`); `farm-people.js` was rewritten; `farm.js`, `farm-ui.js`, `farm-build.js` (the stall door leaf is now a hinged mesh) were extended.

| What | Where | Notes |
|---|---|---|
| **Character** | `farm-people.js` | Rebuilt to the owner's reference picture: **deliberately basic and smooth** — tapered rounded limbs, plain torso, egg-shaped head with two eye dots and a small nose, six simple hair styles, akubra / helmet with a dark band, jacket in your colour. One figure = **13 merged joint meshes + 2 held props, 1 material, ~4,200 triangles** (Phase 5: ~30 meshes, ~10 materials). Customisation (`C.player`), V first/third person, and the three outfits are unchanged. **Animation:** walk and run with heel/toe foot roll, hip sway, shoulder counter-rotation and arm swing; leaning into turns; stepping on the spot when turning while still; breathing idle with occasional looks round, weight shifts and a hand on the hip; work poses (brush, feed, pat, inspect, tack up, lead, drive) with a brush and a feed bucket as props. |
| **Horse care** | `farm-care.js`, rules in `career-core.js` (`CORE.groom / feed / prepare / drillReward / restDay`), wrappers `CAREER.care.*`, `CAREER.horseInfo`, `CAREER.defOf` | E at a box opens a small menu: **Inspect** (card with the real saved data: attributes/potential, fitness, composure, readiness, form), **Groom** (brush strokes, horse relaxes; composure +4), **Feed** (stable feed free, quality feed $250 through the ledger; small composure/fitness lift), **Prepare** (tack up: the horse really wears its saddle cloth + saddle), **Lead out** (the lower leaf of the Dutch door swings open on hinges — one instanced mesh, 1 draw call — the horse walks out and follows on a lead rope; E at the box puts it back). Led horses are collided with buildings/fences, walk when you walk, can be taken to the float and to the training facilities. **Care affects non-race stats only** (composure, recovery, readiness) — nothing changes `toDef`. Every reward is dated: **once per horse per day**. |
| **Guided race day** | `farm-day.js` | Book a race on the calendar → objective panel (upper left) steps: **1 visit the horse's box → 2 prepare → 3 lead out → 4 walk to the float → 5 load (E at the ramp: horse led up the ramp, ramp raised) → 6 get in the ute (E at the driver's door) → 7 drive** → at the exit gate the booked race starts through the normal `CAREER.startBooked()`. The stage is **derived** from real state (booking, tack, led horse, loaded) so it cannot fall out of step; changing/cancelling the booking resets the farm (horse back in its box). Only the booked horse can be loaded; nothing departs without a valid booking (re-checked at the gate, booking consumed once). **Shortcut:** **K** anywhere, the "Skip the routine · go now" button in the calendar, or E at the float runs the old load-up/drive-off cutscene. |
| **Guidance lines** | `farm-nav.js` | A* over a 1 m grid built from the farm's real colliders (every building, prop, rail, gate) inflated by the walker's radius, then string-pulled; drawn as ONE ground ribbon of soft flowing dashes + a pulsing ring + a faint light column (3 draw calls, only while guiding). Settings → Farm → guidance lines: **Full route / Subtle (nearest ~25 m, no column) / Off**. |
| **Playable transport** | `farm-drive.js` | W accelerate, S brake then reverse, A/D steer, Space handbrake, R reset. Kinematic bicycle model (wheelbase 8.45 m, rear axle at the float's wheels): acceleration eases off with speed, steering tightens at speed, pitch/roll. Six circles along the rig collide with every building/rail/gate (it scrapes and slows, never passes through), boundary fence solid except the gate. Smooth chase camera with speed-based pull-back/FOV. Crossing the gate starts the race. |
| **Training drills** | `farm-train.js` | E at the **gate unit** (real three-stage start) and at the **oval entrance** (acceleration 250 m, settling 600 m, sprint rhythm 650 m). Each runs the **real `sim.js` `Race`** headless (one horse, no commentary, nothing from the race scene), with the real controls (W/S effort & stall balance, E settle, Space push/tap/lunge, Shift drive); the horse + jockey are drawn on the farm oval. Scored against the sim's own measures; reward via `CORE.drillReward`: **0.15–0.5 training points, once per horse per day, ≤ 1.0 per week, none when fitness < 55, −3 fitness when rewarded**; Esc earns nothing; the best score is stored. |
| **Rest a day** | `farm.js`, `CORE.restDay` | E on the farmhouse sofa: one calendar day through `CORE.advance` (horses recover, daily care/drill flags reset). Refused on the day of a booked race and when an open championship round is scheduled today. |

## Test report — Phase 6 (risk-based: farm/UI/career-core change — NO race physics, sim, results or difficulty change)

Results (from the actual runs on the final code):

| Test | Result |
|---|---|
| `node tests/phase6-core.js` (new: care, drills, Rest a day rules, fuzz) | **PASS 43 / 0** |
| `node tests/career-core.js` | PASS 128 / 0 |
| `tests/phase6-browser.js` (new; character/animation, horse interactions, guidance, the whole booking → stall → prepare → lead → float → load → ute → drive → gate → race → return chain, wrong horse refused, no departure without a booking, startBooked exactly once, shortcut, invalid states, drills, Rest a day, leaks, budget) | **PASS 104 / 0** (final run; ~12 earlier runs while building failed on test-setup or real bugs that were fixed — e.g. the rig's own colliders blocking it, R key edge, figure left visible in the cab) |
| `tests/farm-flow-browser.js` | run 1: **69 / 4 failed** (the float prompt wording and the house's new "rest" point changed on purpose; plus a stale 0.15 s booking cache in the quick-departure path — a real bug, fixed); **rerun alone: 73 / 73** |
| `tests/farm-browser.js` | PASS 34 / 34 (draw-call budget ≤ 250 held; the stall doors add one instanced mesh) |
| `tests/scenes-browser.js` | PASS 38 / 38 |
| `tests/career-browser.js` | PASS 114 / 114 |
| Racing smoke: `steering-browser` | PASS 70 / 70 |
| `start-browser` | PASS 8 / 8 |
| `replay-lunge-browser` | PASS 9 / 9 |
| `node tools/build-single.js` + `tests/single-browser.js` | built 8,758 KB; PASS 8 / 8 |
| `tests/mp-*.js` | **not run — multiplayer disabled by design** |

**Performance (measured):** the character is 13 draw calls / ~4,200 triangles (Phase 5: ~30 meshes); the stall doors are one instanced mesh; the guidance line adds 3 draw calls only while guiding; the farm stayed within its ≤ 250 draw-call / ≤ 500k triangle budget in `farm-browser`; per-frame cost of the new systems is small (booking read cached 0.15 s, A* only when the objective changes or you stray 3 m, ribbon alpha loop over ≤ 700 samples). Memory: three full prepare → lead → load → reset cycles leak no geometries/textures/objects (checked in `phase6-browser`). No race code was touched, so `tools/smooth.js` was not run.

 **Deferred, with reason:** the long racing suite (`field`, `chaos`, `avoid`, `pileup`, `pushfall`, `riding-control`, `randwick`, `flemington`, `season_balance`, `progression`, `career_difficulty`, commentary, `longrace-browser`, `auto-quality-browser`, `eleven-*`, `presentation-browser`, `tools/smooth.js`) — `sim.js`, the race loop, `gfx.js`, `venues.js`, results/rewards logic, difficulty and horse attributes were not changed (drills use `sim.js` read-only). `tests/mp-*.js`: **not run — multiplayer disabled by design.**

## Owner directions during Phase 6–7 (record — do not lose)
- **Autonomy:** the owner authorised working through **all remaining phases (7 → 14) in order, without stopping for review** (they were going to sleep); if the usage limit is hit, wait for the reset and continue. Push to the **dev branch only** (`claude/amazing-clarke-jzpr1x`); `main` is not touched until the owner has played it.
- **Answers:** economy tone **Balanced**; training pace **Gradual (~3–4 seasons to approach potential)**; farm scope **everything, performance first**.
- **Character (final):** basic and smooth like the owner's reference picture, smoothed joints, plain walking swing/bob **with no side-to-side sway**.
- **The owner's farm vision (to be delivered across Phases 8–9 and kept in mind afterwards):** a living property — horses moving naturally in stalls **and paddocks**, **staff doing everyday activities**, areas with meaningful purposes (stable, **wash bay**, paddocks, training facilities); **hands-on training is the heart**: walk to the right stable → prepare the horse → lead it to the training area → **mount** → ride the exercise using the real race mechanics → dismount → return it to the stable or paddock; drills: **acceleration** (not just holding W), **starting-gate**, **sprint (200–400 m straight)**, **endurance**, **settling/temperament**, **agility/handling (marked sections, bends, steering)**; walk/trot/canter/gallop transitions, realistic jockey posture and rein responses; **genuine long-term consequences** (acceleration drills → acceleration, endurance → stamina, sprint → finishing, gate → starting + composure; over weeks, months and seasons, per age/potential/temperament/history; never maxed after a few sessions); **trade-offs** (over-training lowers condition/needs recovery; careful programmes peak for a target race); better facilities, specialist trainers and recovery equipment help without unlimited purchasable performance; an engaging **training-results screen** (performance, improvements, remaining potential, progress to the next development milestone); **scheduled automatic training / hired staff**, with riding personally giving a **modest extra benefit**; training organised around the booked race; the property looks more professional as the stable grows (small visual details, no big performance cost); every horse feels like an individual (strengths, weaknesses, personality).

## Phase 7 — Finances (done, dev branch)
`career-core.js`: **purses** = face value × per-tier scale (Provincial 0.30, Metropolitan 0.18, Group 1 0.06, Everest/Cup 0.05; e.g. the Maiden Plate's "$40,000" now pays $12,000, 1st = $7,200), **entry fee** ≈ 4% of the purse (min $400; optional races free), **weekly bill** charged automatically in `advance()` as ONE ledger line (feed & care $600/horse, property $400, $150 per facility level, staff wages) with **sponsorship** from reputation, **milestone bonuses** (once ever), **reputation** from results, **stable club advance** ($8,000, once a season, only when cash < $3,000) and **club debt** repaid from half of each prize; an unpayable bill becomes club debt — **cash can never go negative**. `career.js`: entry fee charged at the gates (`payEntryFee`, once per race instance; a refused entry changes nothing and keeps the booking), booking refused when unaffordable, results panel shows fee/prize/repayment/bonuses, Office **Finances** panel (cash, owed, next bill itemised, season by category, recent prizes, club advance button), the calendar/booking show prize + fee, Rest-a-day reports the weekly bill. Tests: `tests/phase7-core.js` (40), `tests/phase7-browser.js` (19), **`tests/economy.js`** (real race engine, 6 whole careers: balance never negative, a competent stable nets ≈ +$67k in season 1, poor riding is squeezed (−$61k/season) but recoverable). Existing tests updated for the rebalance (prize amounts in `career-core.js`, `career-browser.js`).

## Phase 8 — Staff and facilities + the living farm (done, dev branch)
`career-core.js`: **7 facilities** (levels 0–3, prices $15k–$220k; modest explicit effects) and **3 staff roles** (trainer/groom/vet, tiers 1–3, weekly wages, 2-week recruitment fee, a speciality); `facEffects` — the total training boost is **capped at ×1.25**, setbacks never vanish, nothing passes potential; `advance()` now runs **day by day** (recovery + facilities + vet, comfort, a groom's daily care). Office **Facilities and staff** panel. `farm-life.js` (**`FARMLIFE`**): paddock **turnout** (lead a horse to a gate: it walks in, wanders and grazes with a head-down overlay; saved in `C.farm.turnout`; a booked horse is brought in automatically; E at the gate brings it in again), **people at work** (a stable hand always; hired groom/trainer/vet with the same character model, walking between stations, drawn only within 48 m, no shadows), the **wash bay** (lead a horse there: hose animation, composure +3 once a day), **facility signs** with level pips and props (one mesh, hidden from the high overview camera). Tests: `tests/phase8-core.js` (37), `tests/phase8-browser.js` (26). Farm budget: overview 242 draw calls (≤ 250).

## Phase 9 — Long-term development and hands-on training (done, dev branch)
`career-core.js`: a **development model** — each horse has fractional progress per attribute (`C.farm.dev[hid].prog`), so one session never moves a whole point and progress shows as "x% to the next point". Weekly **plans** (all-round, speed, stamina, starts, acceleration, sprint, agility, rest) at light / normal / hard intensity run by themselves as days pass (`advance()` → `autoDay`: one session a day, a rest day each week, a taper in the 2 days before a booked race, none when sore or tired). Rate = base × plan weight × **age curve** (`devRate`; the young build fast, veterans slowly) × **diminishing returns** near potential × current **training load** × capped facility/staff boost (≤ ×1.25) × source (hands-on 0.5–1.4 by the grade you ride; automatic sessions are ×0.7 without a hired trainer). Hard training raises **load** and costs fitness; past 80 load a horse can go **sore** (2–4 days off); load drains 9/day. Racing experience now builds the horse more slowly (`RACE_XP_SCALE 0.15`). **Race condition** (`raceAttrs`): a tired horse races up to 6 % below its ratings, a fresh, fit, unloaded horse "peaking" gets +2 % on speed/accel/sprint — the saved attributes are never changed. Tuned by simulation (`tests/development.js`): a trained horse closes ~34 % of its headroom in season 1, ~80 % by season 3, ~93 % by season 4 and never passes potential; racing alone 18/36/50/64/75 %; hard training gets more sore spells and no faster development.
`farm-care.js`: horse menu key **6 — Training plan** (plan list + L/N/H intensity), the Inspect card shows development % / headroom / plan / "tired: racing at −x %" / "peaking" and a **training-load bar**. `farm-train.js`: you **mount** (walk to the near side and swing up) and **dismount**; six drills — starting-gate, acceleration (250 m), **sprint (measured 400 m)**, **endurance (1,200 m)**, settling, **agility (five cone gates, steer with A/D)**; the horse **pulls up** through canter/trot to a walk; the results screen shows **what moved, progress to the next point, remaining potential, overall %, form and load**. Hands-on drills: once a day per horse, at most 4 a week, nothing when tired or sore. Tests: `tests/phase9-core.js` (44), `tests/development.js` (11), `tests/phase9-browser.js` (33); `phase6-core`, `career-core` updated for the attribute model; `phase6-browser` updated for the mount / dismount timing.

## Character upgrade (Phase 9b, owner request) — a rigged, believable stable owner / jockey
The Phase 6 "basic shapes" figure was replaced by a **skeleton-driven skinned humanoid** (`public/farm-people.js`): 23 bones, one `SkinnedMesh`, one material, **1 draw call** (the old figure was 13 meshes), ~7.9k triangles, 5k vertices, rebuilt in ~6 ms on a wardrobe change (geometry disposed, no leak). Anatomy: shaped shoulders and deltoids, upper arms / forearms with wrist, **hands with four fingers and a thumb** (fingers curl for gripping), chest, waist, hips, thighs, calves, feet with a toe bone; **a real face** — brow, eyes (white, iris, pupil, lids), nose with nostrils, lips and mouth line, chin, ears — varied by the five face shapes; hair that follows the skull (six styles, hairlines per style); akubra hat / riding helmet with strap / race-day silk helmet; work shirt with rolled sleeves and open collar, polo, race-day jacket with lapels; jeans, breeches, work boots and tall riding boots; belt, buckle, gloves. Clothes are part of the body surface (vertex colours with ambient-occlusion darkening in creases and subtle fabric variation). Joints bend through blended skin weights (no gaps). The appearance data, Wardrobe, first / third-person cameras and controls are unchanged; the walk is the same plain swing-and-bob (no sway). Tests: `phase6-browser` character section updated (23 bones, one skinned mesh, ≤5 meshes, 4–16k triangles); farm-browser: still ≤ 250 draw calls (overview 250, was 250 — the figure now costs 1 call instead of 13) and 261k triangles (budget 500k).

## Phase 10 — The horse market (done, dev branch)
`career-core.js`: `C.market` (seeded by the career seed + week; `wk` = last refreshed week) holds up to **6 listings** that **rotate weekly** (`marketSync`, also called by `advance()`): about 14 % are sold to other buyers each week, every listing closes after 14–28 days, and gaps are refilled keeping a mix of five kinds — **young prospect, developing, race-ready, late bloomer, established** — with names from the recorded pool (the 19 player names then the rival pool) that no horse, rival or listing uses. Each listing is a real horse built from the creator's budgets (start pool, potential pool, caps), with an age, look, development curve, record, condition, a hidden **reserve price** and hidden **rival interest**; the **asking price** is 8–22 % over its **valuation** (`valueOf`: ability steeply, potential for the young, age, record, condition). Typical asks: prospects $19–27k, developing $22–42k, race-ready $36–88k, late bloomers $12–31k, established $92–357k. **The player sees bands, not numbers** (`marketView`): current ability and potential as ranges that narrow with a better **trainer** (±4 → ±1 and ±9 → ±2), the trip it suits, a temperament word, coarse grades per attribute, record, days left, and **health only if a vet is hired**. **Bidding** (`marketOffer`, ≤ 3 rounds): an offer at the asking price or the seller's hidden price-to-win is accepted; within ~18 % of it the seller **counters** (with a margin that shrinks each round); far below is rejected; after three rounds the seller walks away. `marketBuy` pays through the ledger with a key per listing (`buy:<id>` — a double click can never charge twice), refuses without a free box / cash / a price the seller accepted, and the horse arrives with its true attributes, potential, age, record and development curve (a tender-legged horse arrives sore). **Selling** (`sellQuote` / `sellHorse`): valuation × the week's market mood (±5 %) less a 10 % agent's commission, never your last horse or one booked into a race, clears the horse's care / development records. **Custom horses** (the existing creator) now cost a fee that grows with the stable (`createFee`: first horse free, then $14k / $26k / $42k / $64k) charged on confirm. **Five-horse maximum** enforced in `marketBuy` regardless of the slot limit passed in.
`career.js` / UI: a **Horse Market** screen (Buy · Sell · Create your own) opened from the Office or by pressing E at an empty box on the farm (the prompt now reads "Empty box: horse market · create a horse"); the creator's last step shows the fee on the confirm button; `CAREER.market.*` API. Tests: `tests/phase10-core.js` (71), `tests/phase10-browser.js` (27); `farm-flow-browser` updated (an empty box now opens the market).

## Phase 11 — The grassroots and regional circuit (done, dev branch)
`season.js`: **14 new open races on the regional circuit** (all `regional: true`, tier 0–1, at 14 country towns — Muswellbrook, Moree, Mudgee, Tamworth, Dubbo, Wagga Wagga, Hamilton, Echuca, Kyneton, Warrnambool, Toowoomba, Grafton, Port Macquarie, Casino): a country barrier trial, **maidens** (no wins), a **two-year-old** dash, a **three-year-old** maiden and guineas, and **benchmark class races** (rating caps 70–76) from 1,000 m to 2,400 m, with modest purses ($12k–$25k face → $3.6k–$7.5k paid at the tier-1 scale; a $400 minimum entry fee). Eligibility gained three explained rule kinds — `age` (max / min), `wins` (maiden: none), `maxrating` (benchmark class) — shown with the usual ✓/✗ detail ("this race is for horses that have not won"). The existing open races Maiden Handicap (Wyong) and the two country handicaps use the same ladder. A season now has **66 dated open meetings** (22 races × 3, spread evenly by a golden-ratio sequence — at most 4 on any day, never a gap over two weeks) alongside the 10 championship rounds. **Winnable early races**: two new pressure profiles in `LIFT` — `grass` (maidens, trials, age races: the strongest rival starts ≈ 2.4 lengths above you) and `country` (class races ≈ 3.4) — chosen per race with `pressure:`; the Provincial Maiden Plate and Country Cup use them too (this supersedes the old "first races ≈ 3rd" tuning for those races; `racePressure` gives them no extra first-start pressure). Measured with `tests/career_difficulty.js` (100 races each, Hard-jockey proxy for a well-ridden horse): maidens win **23–35 %** (final run; an earlier run measured 25–29 %), country class races **14–37 %** (Country Cup 14–18 %, Kyneton Cup 21 %, Benchmark 58 Mile 37 %), against 11 % for Quick Race Hard and unchanged figures for every metropolitan / Group / crown race (Kingsford Mile 21 %, Spring Final 11 %, Group 1 5 %, Everest 0 %, Melbourne Cup 0 %).
`venues.js`: **`buildCountry`** — two cheap country looks on the generic course (course surface, rails and finish post from the shared `course()` / `finish()`, a short tiered stand under a tin roof with the **town's name** on a board, a tote building, a modest lawn and stand crowd, gum or poplar trees, low hills; ~115 meshes vs the flagships'): regional towns (and the older provincial courses Wyong, Gosford, Scone, Kembla Grange, Ballarat, Bendigo, Newcastle, Geelong) race there (`SEASON.venueStyle(name)` → `{style:"country", variant, town}`, passed in the race config's `career.venueStyle`); the city courses keep Randwick / Flemington / the original venue. **Commentary**: any named course that is not Randwick / Flemington / Furlong Park now gets the **neutral intro lines** — never "Welcome to Furlong Park" (no new audio was recorded or priced; the existing neutral recorded lines are used). `career.js`: the Optional Races screen groups the **country and regional meetings** apart from the city races, shows each race's prize and why a horse is not eligible. Tests: `tests/phase11-core.js` (41), `tests/phase11-browser.js` (11); `career-core` and `career_difficulty` updated (the difficulty tool gained grassroots conditions and an `ONLY=` filter).

## Phase 12 — Time of day and weather (done, dev branch)
`public/atmosphere.js` (**`ATMO`**, new, pure data, also loads in Node): eight **times of day** — early morning, mid-morning, midday, afternoon, late afternoon, **golden hour**, dusk, and the lit **evening** — and five **kinds of weather** — clear, partly cloudy, overcast, light rain, rain. `ATMO.params(tod, wx)` blends them into one set of numbers: sun direction (elevation 9° → 36° → 78° → 50° → 27° → 11° → 2° → −7°), light colour and strength, sky dome colours (zenith / mid / horizon), a warm horizon glow, ambient and fill light, exposure, haze colour and visibility, how wet the turf is and how hard it rains. **Afternoon + clear is exactly the game's original look** (sun (180,260,120), 2.3, ambient 0.32, exposure 0.82), so a Quick Race is unchanged. Cloud greys the sky, takes the sun (clear 2.55 → overcast 0.87 → rain 0.26 at midday), softens shadows, shortens the view (1,500 m → 1,200 → 630) and, in rain, wets and darkens the turf. The evening is floodlit from above and only exists at Randwick / Flemington for the big races (the calendar already scheduled it that way).
`gfx.js`: `GFX.setAtmosphere(params)` re-lights the race scene — the sky shader now takes its colours, the sun colour and the glow as uniforms (stars at dusk and in the evening), the sun / ambient / fill lights, exposure, fog (`GFX.fogRange` shortens every venue's fog by the weather), and the **environment map**, built once per look and cached (at most 5 kept, least-recently-used disposed; ~24 looks → 5 maps; switching to a seen look costs a few ms). **Rain** is one line-segment mesh of streaks round the camera animated entirely in the vertex shader (one draw call, none when dry); **wet turf** darkens and glosses every turf material (`GFX.setWet`). `index.html`: the sun's offset for the shadow camera comes from the atmosphere (`sunOff()`); starting a race applies `cfg.career.tod / wx`. `career.js` passes the **stored calendar event's** time of day and forecast (the booked event if it is this race, else the round's date / the race's next meeting) so **the race runs exactly as the calendar said**.
`farm.js` / `farm-ground.js`: the farm sky shader takes its colours as uniforms too; `applyAtmosphere` scales the farm's own look ("a bright late morning") by the same atmosphere ratios, so the farm shows the same sky as the race: **on race day the booked race's own time of day and weather, otherwise a seeded draw for the date** (`ATMO.dayPart` / `dayWeather`, month-weighted: rainy ≈ 14 % of summer days, 21 % of winter days), refreshed whenever the date changes; the HUD names it ("Golden hour · Clear"); rain falls on the farm on a wet day; leaving the farm restores the race scene's exposure. Tests: `tests/phase12-core.js` (36), `tests/phase12-browser.js` (24); `farm-flow-browser` and `career-browser` updated for the new calendar.

## Phase 13 — Transport transitions (done, dev branch)
**Preparation summary → atomic save → travel.** Getting into the ute (or pressing E at the float / K for the quick departure) now opens **"Ready to go?"** (`FARMUI.openDeparture`, from `CAREER.travel.summary()`): the booked race, venue, date and days away, **time of day, forecast and going** (the calendar's stored values, so it matches the race), your runner's **fitness / composure / readiness**, "peaking" or "tired: racing x % below his ratings", the entry fee (charged on arrival) and cash, and warnings (tired, sore, can't afford the fee). **Leave now** runs `CAREER.travel.commit()`: the career is written and **read straight back** (`saveVerified`); only when what is stored equals what is in memory does the departure start. If the browser refuses the write (storage full or blocked) the panel says so and **the horse stays home — nothing changes**; once storage works again Leave now goes ahead. **Not yet** / Esc leaves everything exactly as it was. **The start is all or nothing:** `startBooked` takes a snapshot and, if the entry fails (no cash for the fee, no longer eligible), restores the date, money, bills and booking exactly — previously an optional race that failed at the gate had already advanced the calendar and charged the weekly bills. **Coming home:** `returnHome` → the farm fades up from black at the hardstand beside the parked ute and float, both horses back in their boxes, with a "Welcome home" note. The existing skippable load-up / drive-off / "Travelling to <venue>" screens are unchanged. Tests: `tests/phase13-browser.js` (23); `phase6-browser` and `farm-flow-browser` updated for the new gate.

## Phase 14 — Balance, retirement, anti-exploit rules (done, dev branch; the final report is FINAL_REPORT.md)
**Retirement and the Hall of Fame** (spec §33, missed by Phase 9 and added here): `CORE.retireHorse` — by choice (Market → Sell tab → **Retire…**, with confirmation) or automatically at the turn of the season for horses past **12** (never your last horse, never a booked one). The horse leaves the stable, its **whole record is kept in `C.hof`** (look, silks, rating, starts / wins / placings, prize money, feature wins, best finish, last ten runs, trophies, how it was acquired, when and why it retired; the most recent 60 are kept), a small **retirement tribute** is paid once through the ledger (15 % of its value — far less than selling it) and reputation rises a little. Horses of 9+ are offered retirement; the **Hall of Fame** screen (Market → Sell tab, or the farm ledger) lists them with their records. **Anti-exploit** (now that open races pay): a prize race entered from the Optional Races screen takes you to its **next dated meeting** (the weekly bills fall due on the way) and is refused if that meeting is after your next championship round; a **horse runs at most once a day**; and the start of any booked race is **all or nothing**. A back-of-envelope check of the regional circuit shows it is not a money machine: ≈ $1,000 expected prize per start against a $400 entry fee and about $2,000 a week of bills — the circuit pays in experience, not cash. **Farm map:** `M` (or Esc to close) opens a top-down plan of the property drawn from the layout and colliders the world is built from — paddocks, courtyard and boxes, farmhouse, sheds, the exercise oval, float and gate, fences, the horses in their boxes (the booked one marked), you as an arrow and a 20 m scale. Tests: `tests/retirement.js` (17), `tests/phase14-browser.js` (11), and retirement steps in `phase10-browser` (now 33).

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

Policy applied: **Tier 2 — farm-only change** (new farm files, `career.js` gained two read-only helpers, `index.html` only gained script tags). The race code, `sim.js`, `season.js`, results/rewards, horse attributes, commentary and the race part of the frame loop were **not touched**, so the long racing suite was **deferred**.

**Executed (all on the final code):**

| Test | Result |
|---|---|
| `node tests/career-core.js` | PASS 128 / 0 |
| `tests/farm-browser.js` (new) | **PASS 33 / 0** — layout, the right horse in each box (coat type, face marking, socks match the saved horse) facing the door on the straw, plaques (name · age · condition · rating · form · next race), collision against the stable, farmhouse, garden fence, paddock fence, paddock gate, oval rail, feed shed, float and the boundary, the walker pushed out of all 18 buildings/props it was dropped into, **18 places a player needs all reachable on foot (0.5 m grid search from the spawn)** while stable interior / house interior / paddock interior / oval infield are not, farmhouse door → Office → Back, float prompt, budget, idle animation gating, memory (4 more visits: geometries 378 → 378, textures 89 → 89; `dispose()` frees 144 geometries / 30 textures) |
| `tests/scenes-browser.js` | PASS 36 / 0 — final code (an earlier run on this phase failed 5 checks twice, first run and rerun alone: they measured walking by wall-clock time and AUTO-quality by sampler state, which the heavier farm on a software renderer (~1–2 fps) breaks; the checks now count frames and spy on `GFX.autoTick`; no product code changed for that) |
| `tests/career-browser.js` | PASS 114 / 0 |
| Short racing smoke: `steering-browser.js` | PASS 70 / 0 |
| `start-browser.js` | PASS 8 / 0 (first run in this phase 8 / 0; once more after the last edit 8 / 0) |
| `replay-lunge-browser.js` | PASS 9 / 0 |
| `node tests/single-browser.js` (the built single file) | PASS 8 / 0 (run twice) |

**Deferred (not run this phase, and why):** the Node racing suite (`season`, `riding-control`, `randwick`, `flemington`, `chaos`, `avoid`, `commentary`, `commentary-scenarios`, `eleven-plan`, `career_difficulty`), `presentation-browser`, `eleven-browser`, `longrace-browser`, `auto-quality-browser` and `tools/smooth.js` — no racing-engine, race-loop, graphics-kit, venue or commentary code was changed. They were last run in full at the end of Phase 3 (all green) and will be run in full again at the Phase 9 gate. `tests/mp-*.js`: **not run — multiplayer disabled by design.**

**Farm performance (measured, 15 camera positions, 1400 × 788, software renderer, high quality):** at most **249 draw calls** (the whole-property overview; budget 250) and **261k triangles** (budget 500k); typical ground-level views 64–177 calls, 87–232k triangles. The property is 104 merged meshes plus ~2,600 instanced trees / shrubs / tufts / rocks (culled per cell, nearby-only shadows). World build ≈ 1.1 s of JS (≈ 3 s total first entry on this software renderer, behind the loading overlay).

**Screenshots** (15 angles — courtyard, stalls ×2, verandah, farmhouse ×2, paddocks ×2, training oval ×2, overview, float, feed shed, entrance gate, trough) are produced by `PORT=8095 node tools/farm-shots.js <dir>`; the set for review was delivered with this phase.


## Known issues / limits after Phase 4
- **The walker is still a stand-in figure** (Phase 5 builds the real character, appearance and outfits). The camera is simple (no obstacle pull-in yet).
- **Paddocks are fenced scenery only** — no horses graze in them yet; horses stay in their boxes (the spec's per-box display). The paddock gates are closed.
- **No interaction yet with the horses, the stalls, the vet bay, the training area or the gate practice** (Phase 6 / 9). Their areas exist and are reachable.
- **Time of day and weather are not applied** to the farm (fixed warm late-morning light; Phase 12).
- **The oval is ~381 m (middle of the track)**, a little under the plan's 400–600 m; its rails are 353 m and 410 m.
- **First entry builds the property** (~1 s of geometry + texture generation on a fast machine, ~3 s on this software renderer) behind the loading overlay; later visits are instant.
- Software-GL screenshots show the farm without antialiasing at 1600 × 900; the real game uses the renderer's normal settings.

## Phase 5 — what was implemented (the property is now the heart of the game; revised after the owner's Phase 4 review)

**The flow the owner asked for, end to end:** main menu (over the property) → *Career Mode* → you are standing in the courtyard (first-ever career: you create the first horse, then land there) → walk to the **farmhouse** and go inside → walk to the **race-calendar board** and press E → pick the race and the horse and *Book* → walk to the **horse float** and press E → the horse is led up the ramp, the ramp goes up, you get in the ute and **drive off the property** → the booked race starts → after the race, *Return to the Farm*.

| What | Where | Notes |
|---|---|---|
| **Main menu over the property** | `farm.js` (menu showcase), `index.html` | Settings, Quick Race, Career Mode (How to Play kept; multiplayer still hidden). The background is the real farm: a slow camera drift over the courtyard, **your own horses in their boxes** (or five of the game's horses if you have no career yet — drawing the menu never creates a save), and the **Quick Race horse** you picked standing in the courtyard. The Settings / Quick-Race-select / How-to-Play screens sit on it too. Built ~60 ms after the page loads; until then the old background shows. |
| **Career Mode lands on the farm** | `career.js` (`CAREER.begin`) | Brand-new career → horse creator → *Create* → straight out onto the property. Existing career → straight onto the property. The old Career hub (standings, calendar, training, stable, rivals, trophies, history) is reached from the **pause menu** (Esc → *Career*) and has a **Back to the Farm** button. |
| **Real character, three outfits** | `farm-people.js` | A rigid-part human (~30 meshes): head, face, hair (6 styles), skin (6), build (5), arms/legs with elbows/knees, walk / jog / idle animation driven by speed. Outfits: **stable wear** (akubra, work shirt, jeans, boots), **riding gear** (helmet, polo, breeches, tall boots, gloves), **race day** (jacket in your colour, white breeches, helmet with silk cover). Saved in `C.player` (v4 field that already existed). |
| **First / third person** | `farm.js` | **V** swaps. Third person: orbit camera behind and above with **pull-in** (marches from the full distance inwards and takes the first spot that is not inside a building, under the ground, or outside the room), eases back out in the open. First person: eye at 1.62 m, wider view (72°), figure hidden, a small cross-hair. The choice is remembered (`ff_person`) and is the default in Settings. |
| **Mouse look** | `farm.js`, Settings | Drag to look, or click to capture the mouse (Esc releases it and opens the pause menu); ← → also turn; wheel zooms in third person. Sensitivity (Slow … Fast) and the capture option are in **Settings → Farm**. |
| **Pause menu** | `farm.js` | Esc: Resume / Career (stable, training, records) / Main menu. Nothing moves while it is open. |
| **Farmhouse interior** | `farm-house.js` | Press E at the front steps → fade → a 10 × 8 m room with its own scene and lights: a **race-calendar board** (cork board with this month's grid — race days marked, today ringed, the booked race circled — and a card for the next race), a **desk with the stable ledger** (opens the Office), a **trophy cabinet** (your trophies appear on its shelves; opens the Trophy Room), a **wardrobe with a mirror**, sofa, rug, bookshelf, kitchen, windows, pictures, pendant lights. Walls, furniture and the cabinet are solid; going in and out leaks nothing. Coming back from the Office / Trophy Room puts you back inside the house where you stood. |
| **Calendar and booking** | `farm-ui.js`, `career.js` (`calendarData / horsesFor / book / cancelBooking / booking / startBooked`) | E at the board opens the **Race Calendar**: month grid (browse months), upcoming races, the selected race's date, time of day, venue, distance, forecast and prize, and **your horses with who is qualified and why not**. *Book* saves `C.booking` (race, horse, date). Only the **current championship round** can be booked (later rounds say "Opens after the previous round"); optional races can be booked when they fall before the next round. A booking can be cancelled or replaced. The objective line at the top tells you what to do next. |
| **Wardrobe** | `farm-ui.js` | E at the mirror: outfit, skin, hair style/colour, face, build, shirt/trousers/boots colours. Changes apply to the character at once (the camera swings round to show you) and save to the career as you click. |
| **Loading up and driving off** | `farm-trip.js`, `farm-build.js` (the float + ute are now their own group with a hinged ramp) | At the float with a race booked the prompt reads "Load *Horse* and leave for *Race*". E → fade to the hardstand → you lead the real horse model up the ramp → the ramp is raised → you walk round the float to the ute → the rig drives east down the farm drive to the road gate with a chase camera → fade to black "Travelling to *Venue*…" → the booked race starts through the normal entry code (`CAREER.startBooked`). **Space / Enter / E / Esc skips it.** In this phase it is a short cutscene; leading the horse yourself comes with the horse interactions (Phase 6) and the full transport flow (Phase 13). |
| **Back from the race** | `index.html`, `career.js` (`returnHome`) | The results button now reads **Return to the Farm** and puts you by the float; the round result, prize and points are recorded exactly as before. |

**Not changed:** race physics, timing, starting, horse attributes, results, commentary, Quick Race rules and the save format (the only data added is `C.booking`, which older builds ignore; `C.player` already existed).

## Test report — Phase 5 (risk-based; touches the menu, the frame loop, the results bridge and career entry — NOT race physics; every number came from running the test on the final code)

**Executed (Tier 1 + Tier 2 + the shared screens Phase 5 touched):**
| Test | Result |
|---|---|
| `node tests/career-core.js` | 128 / 128 |
| `tests/farm-flow-browser.js` (new) | **73 / 73** — menu over the property (no save created), Quick Race horse on show, Settings controls, Quick Race still works and releases the farm, first career creates a horse then lands on the farm, existing career lands on the farm, W/Shift movement, V first/third person (eye 1.62 m, fov 72, saved), mouse look + sensitivity ×2 + drag, pitch limits, camera pull-in never inside solid geometry, pause menu (Resume / Main menu / Career hub), farmhouse in/out, walls + furniture solid, ledger and trophy cabinet and Back (return to the same spot), calendar panel, booking (only the open round bookable; refused cases), cancel, wardrobe saved to the career, geometry stable over 4 more house visits, float prompt (nothing booked / booked), the whole load-up → drive-off sequence in order and the booked race starting with the right horse, Return to the Farm after the race (round recorded), Space skips, character persists after reload, no page errors |
| `tests/farm-browser.js` | **34 / 34** (was 33; the interaction-point checks were updated for the house door/desk; budget measured **249 draw calls** at the whole-property overview, budget 250, and 261k triangles, budget 500k) |
| `tests/scenes-browser.js` | **38 / 38** (updated: the farm is the menu background, Esc pauses, E at the float needs a booking, 9 farm listeners instead of 7) |
| `tests/career-browser.js` | **114 / 114** (Career Mode now lands on the farm, so the three places that clicked the menu button to reach the hub now open the hub with `CAREER.open()`; every hub assertion unchanged) |
| `tests/single-browser.js` (single-file build) | 8 / 8 |
| Racing smoke: `steering-browser` 70/70 · `start-browser` 8/8 · `replay-lunge-browser` 9/9 | all pass |
| `tests/presentation-browser.js` | 11 / 11 |

**Failures along the way, all fixed and re-run:** farm budget measured 263 then 251 draw calls (the float rig was split into its own group; rebuilt in one batch cell and with fewer materials → 249); scenes test expected exactly 7 farm listeners (now 9 by design). The final runs above are after those fixes.

**Deferred (not run, with reason):** the full racing regression suite (`field`, `chaos`, `avoid`, `pileup`, `pushfall`, `riding`, `randwick`, `flemington`, `season_balance`, `progression`, `longrace-browser`, `auto-quality-browser`, voice/eleven tests) — race physics, timing, starting, horse attributes and results logic were **not changed**, and the racing smoke tests above passed. `tests/mp-*.js` — not run, multiplayer disabled by design.

## Known issues / limits after Phase 6
- The horse in the drive is hidden once loaded (the float is closed); the float and ute drive as ONE rigid body (no articulated trailer).
- Training drills map the sim's progress onto the farm oval; the sim's own bends are not the farm's bends (the horse leans level). Scores are scaled against the sim's own measures and an ideal run of the same horse; drill balance (rewards 0.15–0.5 points) will be revisited in Phase 9.
- Care changes composure/fitness/readiness only; none of it affects racing until Phase 9 wires condition into `toDef`.
- Quality feed costs $250 through the ledger (a Phase 7 rebalance may revisit it). Optional races still pay nothing.
- Paddocks are still empty and horses do not graze (not part of Phase 6).
- Leaving a race mid-way after entering still advances the date (unchanged from Phase 2).

## Known issues / limits after Phase 5
- **The drive-off is a cutscene**, not interactive (by design for this phase): you do not lead the horse out of its box yourself yet, and the race venue is not shown arriving. Phases 6 and 13 deepen it.
- **No horse leaves the box visually in the menu showcase** and the paddocks are still empty (Phase 6).
- **One booking at a time**; booking a different race replaces it. Optional races are bookable only when they fall before the next open championship round (so the date can never skip a round).
- **The character is rigid-part** (like the parade strappers): readable and animated, not a skinned model. Faces are simple.
- **The first entry builds the farmhouse (~50 ms) and the property (~1 s)**; the menu background builds the property ~60 ms after the page loads, so a very slow machine may show the old background for a moment.
- Pointer capture needs a user click (browser rule); if it is refused the game falls back to drag-to-look.
- Time of day and weather are still not applied to the farm (Phase 12).

