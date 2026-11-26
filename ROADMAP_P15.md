# Final Furlong: post-Phase-14 roadmap (Phase 15 onwards)

**Status:** approved by the owner on 2026-11-25, with three adjustments that are folded in below: a lean Phase 15A, a farm clock that never rushes the player, and real regional track layouts (Phase 24).

- **Running log:** `PROGRESS_P15.md` (status, test reports, performance measurements).
- **Historical 14-phase documents** (`CAREER_PLAN.md`, `CAREER_EXPANSION_SPEC.md`, `CAREER_PROGRESS.md`, `FINAL_REPORT.md`) stay as the record. This file does not replace them.
- **Branch:** `claude/amazing-clarke-jzpr1x` only. Do not merge into `main`.

## Context

- **Where things stand:** all 14 Career Mode phases are on `claude/amazing-clarke-jzpr1x` (HEAD `2a47024`, verified). The owner approved Phases 1–4 only; Phases 5–14 are machine-tested but nobody has played them.
- **The owner's three priorities, in order:**
  1. Remove the racing micro-stutter regression. This blocks all new feature work.
  2. Make the property a living, scheduled Australian training stable.
  3. Connect the existing hands-on care into an optional daily loop.
- **Owner answers in this session:**
  - The stutter happens on **several devices**, mostly in the **published single-file artifact**.
  - The farm clock runs **about 10 real minutes per work day**.
  - Record the roadmap as **a new file plus one-line pointers** in `HANDOFF.md` and `CAREER_PROGRESS.md`.
- **Git rules:**
  - `main` has diverged (two docs-only commits). Nothing is merged and no docs conflicts are resolved without the owner.
  - The historical `CAREER_PLAN.md` / `CAREER_EXPANSION_SPEC.md` stay untouched.

### Owner adjustments at approval (binding)
1. **Phase 15 starts lean.** Begin with the *minimum effective* instrumentation and comparisons needed to identify the stutter. Expand the diagnostics only if the first round is inconclusive. The goal is smooth racing, not a performance laboratory. See §2.1 and §7.
2. **The farm clock must never rush or interrupt the player.** Interactive training, horse care and race preparation stay flexible: the clock pauses or holds while you are busy, never jumps to evening by itself, and routines wait for a horse that is with you. See §3, "Farm clock".
3. **Regional racing must eventually have genuinely different courses:** layouts, bend characteristics and straight lengths, not only visual variations of the generic track. This is recorded as Phase 24 (after Phase 22's visual work).

---

## 1. Assessment of the current game

**Strong foundations to keep and build on**
- A deterministic 120 Hz `sim.js` with render interpolation. It is byte-identical to `5139a6f`.
- A clean split between pure rules and UI: `CORE` and `SEASON` are pure and tested in Node; `CAREER`/`FARM*` are UI.
- An idempotent money ledger, and derived (not stored) race-day state in `FARMDAY.stage()`.
- Scene separation (`SCENES`), plus around 3,000 automated checks.
- The farm is already rich: care, lead-out, turnout, wash bay, staff NPCs, six real-sim drills, transport, and a rigged character in one draw call.

**Weaknesses relevant to the next phases** (from reading the code — these are facts, not guesses)
- **Not proven on real hardware.** Every performance number comes from SwiftShader with a synthetic clock. The owner plays the artifact on several devices, which has never been measured.
- **AUTO quality is shared between scenes.** `GFX.autoTick` is fed farm frames (since Phase 3, `6ffe2f5`) and menu-showcase frames (since Phase 5, `62b7567`).
  - A level change calls `applyQuality()` (`gfx.js:57`). That calls `setPixelRatio` and `resize()`, which reallocates the drawing buffer twice, and reallocates the shadow map.
  - This can happen in the middle of a race. The level is also persisted to `ff_autoLevel`.
- **The farm world stays resident on the GPU during races.** `FARM.leave()`/`stopShowcase()` free only horses and listeners.
  - The world, its textures and its own 2048² shadow map stay allocated.
  - Because the menu builds the farm at boot, *even a Quick Race straight after loading* has the farm resident.
- **`horseGeoCache` never evicts** (`index.html:1591`), and `disposeHorse` frees only bone textures. Geometry and GPU buffers can grow over many races with different fields; this is untested.
- **The farm and race share the environment-map cache** (`GFX.envFor`, LRU of 5), so they can evict each other's maps.
- **Known per-frame costs** (some predate the regression):
  - **Canvas textures and flags:** scoreboard/screen uploads at 4 Hz (`venues.js:743`, `index.html:1322`). The generic venue's flags are rewritten even when that venue is hidden.
  - **HUD:** the minimap canvas is redrawn every frame; the speed-lines CSS transform uses `Math.random()`.
  - **Allocation churn:** commentary `this.q.filter` every frame plus 4 Hz snapshots, closures in `animateHorse`, and audio nodes per footfall.
  - **Race start:** `autoReset(3)` expires before a parade ends, and the ElevenLabs decode burst runs at `COMM.begin` after the parade.
- **Tooling gaps:**
  - `tools/smooth.js`, `bench.js` and `auto-quality-browser` set `ff_comm`, but the real key is `ff_commentary`.
  - F8 averages simulation and render times, so spikes are smoothed away; it cannot see GPU, compositor or GC.
  - There are no "work counters" (uploads, compiles, storage writes per race second).
- **No draw-call headroom on the farm:** the overview camera sits at 250/250, and the breakdown has never been recorded.
  - Each farm horse costs 4 calls (7 tacked) and every mesh casts shadows.
  - No farm LODs are used, though `buildHorseGeometry(def, lod)` exists.
  - Shadow-pass calls are not counted in `renderer.info`.
- **The farm's behaviour code is not ready for schedules:**
  - `FARMLIFE` uses `Math.random`/`performance.now`, so it is not deterministic.
  - Staff walk in straight lines without navigation.
  - `FARMNAV` cannot route into paddocks (closed gates are colliders) and caches no routes.
  - `FARMCARE` supports exactly one led horse.
  - There is no trot gait, and paddock horses and NPCs freeze during drills, driving and the trip.

**Engine verdict:** stay on Three.js r128. Nothing planned needs a newer engine. Five horses and a handful of NPCs fit within `InstancedMesh`, merged batches, LOD and GPU skinning. Upgrading three.js mid-project would risk every shader hook (turf, crowd, sky, horse hair) for no identified gain. Revisit only if a measured limit appears.

---

## 2. Micro-stutter: diagnosis strategy (Phase 15)

**Principles**
- Change one variable per experiment.
- Never claim a cause without a trace or counter that shows it.
- Judge by frame-time *consistency* (on-time %, p99, longest frame, hitches per minute), never by average FPS.
- Horse/jockey quality, scenery and racing gameplay are off-limits unless the evidence proves them to be the cause.

### 2.1 Instrument first (15A): lean by design (owner adjustment 1)

**15A builds only this minimum set:**
1. **F8 additions:** the display refresh interval, on-time %, longest frame, and hitches per minute.
2. **A hitch log:** each slow frame, with the race distance and any of these events in that frame:
   - an AUTO level change or `applyQuality()` call;
   - a scene change;
   - `setAtmosphere`/`envFor`;
   - a change in the program, geometry or texture count.
3. **Shift+F8 "Copy report":** a text box the owner can select and copy.
4. **Four switches** in a small hidden Settings block:
   - AUTO: normal / race frames only / off (fixed High);
   - park the farm's GPU resources before a race: on / off;
   - force the afternoon-clear look: on / off;
   - commentary: on / off.
5. **One benchmark race,** in two variants: straight after loading, and after 60 s on the farm.
6. **The headless counters test** (§2.3) and the corrected tool keys.

**Everything else below is a menu, not a requirement.** Use it only if the first round of owner reports cannot separate the causes:
- per-section timers;
- extra event markers;
- the ×5 variant;
- more switches;
- bisect artifacts beyond baseline / pre-Phase-12 / HEAD.

**Full diagnostics menu** (reference; add items one at a time, only when needed):
- **Extend F8** (`perfFrame`/`perfGraph`, `index.html:4439`):
  - Detect the refresh interval.
  - Show on-time % (frames within 1.5× the refresh interval), missed-vsync count, longest frame, and hitches per minute, over a rolling window and a per-race total.
  - Keep the existing average/median/p95/p99.
- **Per-section CPU timers**, active only while F8 is on: input, sim, interpolation, horse meshes, HUD, commentary, audio, crowd/venue, `GFX.update`, camera, and render submit. Record raw maxima, not 0.1-smoothed averages.
- **Event markers, timestamped and logged next to each hitch:**
  - AUTO level changes and every `applyQuality()` call.
  - `setAtmosphere`, and `envFor` builds.
  - Program-count changes, geometry/texture-count changes, horse LOD swaps.
  - Canvas-texture uploads, toasts, commentary line/clip decodes.
  - Scene transitions.
  - Suspected GC: a drop in `performance.memory` on Chrome.
  - `PerformanceObserver` `long-animation-frame` / `longtask` where the browser supports them.
- **Hitch log:** every frame over max(1.5× refresh, refresh + 4 ms), recorded with race distance, camera, look/venue, the section timings and the events of that frame.
- **Context snapshot:**
  - From the renderer and quality settings: `renderer.info.memory` (geometries, textures, programs), pixel ratio, canvas size, AUTO level and history.
  - From the game state: whether the farm is built, the `horseGeoCache` size, the env-map cache size and the build type (artifact vs served).
- **"Copy report" (Shift+F8):** a summary plus JSON in a selectable text box. Clipboard and download may be blocked in the artifact sandbox, so the text box is the fallback.
- **Performance Lab panel** (Settings → hidden "Performance lab", persisted in `ff_lab`). Defaults equal current behaviour; each switch is one experiment:
  - AUTO: normal / race-only / frozen at level N / off.
  - Farm GPU residency: keep / park before the race.
  - Sky shader: Phase 12 / legacy.
  - Look: force afternoon-clear.
  - Shadow snapping in races: on / off.
  - Speed lines: on / off.
  - Minimap: every frame / 10 Hz.
  - Venue canvases: live / frozen.
  - Commentary: recorded / system / off.
  - Interpolation (the existing F7).
- **Benchmark race (the lab's "Run benchmark" button):** a deterministic Quick Race (fixed venue, field, seed, chase camera, all-bot riding via the existing `allBots`) for 60 s after the gates open. It then shows the report.
  - Variant "after farm": walk-showcase the farm for 60 s first, then run the same race.
  - Variant "×5": five consecutive benchmark races with different fields, which exercises the geometry cache.
  - This makes owner runs repeatable across devices and builds.

### 2.2 Owner measurement protocol (written step by step into `ROADMAP_P15.md`)
Run each condition twice on each device; note the browser, display refresh rate and quality setting.

| # | Condition | Purpose |
|---|---|---|
| A | Benchmark straight after a fresh load | Baseline (farm showcase resident) |
| B | Career: walk the farm ~3 min, book, skip the routine, race | The owner's main complaint path |
| C | The ×5 benchmark, then a real career race | Consecutive-race growth |
| D | Benchmark with the look forced to afternoon-clear vs golden hour vs rain | Phase 12 cost |
| E | Same build in the claude.ai artifact vs the same `dist` HTML opened directly in its own tab | Host-page / iframe effects (the owner plays the artifact) |
| F | Lab: AUTO off/High vs normal; farm parked vs kept | Fast isolation of the two strongest suspects |
| G | Bisect builds (below) under condition A/B | "Used to be smoother" |

- **Chrome trace, once, for the worst case:** in DevTools → Performance, record 15 s mid-race with Screenshots on, and send the trace file.
- **Dropped frames F8 cannot see:** DevTools → Rendering → "Frame Rendering Stats" shows dropped and partially presented frames. Also capture `chrome://gpu` once per device.
- **Bisect builds:** single-file builds of `5139a6f` (before the expansion), `6ffe2f5` (AUTO fed by the farm), `62b7567` (menu showcase), `d34d4bc`, `49aaed3` (before Phase 12), `41c08db` (Phase 12) and HEAD.
  - Built from git worktrees and published as separate private artifacts, with the owner's OK before publishing.
  - Older builds have only the original F8, so compare their p95/p99 and spike counts plus the owner's feel; HEAD-lab numbers are the richer cross-check.
  - Bisect only between the checkpoints that differ.

### 2.3 What Sonnet can establish without a real GPU (deterministic counters in headless Chromium)
- **New `tests/race-hygiene-browser.js`.** Wrap the WebGL context and storage to count, per race second after the gates open:
  - `texImage2D`/`texSubImage2D`, `bufferData`/`bufferSubData` and `compileShader`/`linkProgram` calls;
  - `localStorage.setItem`, `applyQuality` and `setPixelRatio` calls, and forced layouts.
  - Run it at HEAD and at `5139a6f`. Counts are valid under SwiftShader even though timings are not.
- **Allocation:** CDP allocation-sampling profiles of 10 s of racing at HEAD vs `49aaed3`, to explain the 9.5 → 12.2 MB/s rise.
- **Growth:** `renderer.info.memory` across ten races with different fields, after a farm visit (the geometry cache).
- **Tooling fix:** correct `ff_comm` to `ff_commentary` in `tools/smooth.js`, `bench.js` and `auto-quality-browser`, and re-baseline.

### 2.4 Evidence → fix table (15B: implement only the rows the evidence confirms)

| Evidence | Fix (no quality reduction) |
|---|---|
| Hitches coincide with AUTO events, or the level differs between A and B | **AUTO feed:** only race and replay frames feed AUTO; the farm and menu get their own controller state and level key (`ff_autoLevelFarm`). **When changes apply:** never mid-race; pixel-ratio and shadow-map changes are queued for safe points (gates loading, results, replay, next race start). Down-steps still apply at once only under severe sustained slowness. Wider hysteresis. |
| Worse after a farm visit; GPU-bound frames; condition F "park" helps | **Park the farm on race entry:** call `dispose()` on the farm's geometries, textures and shadow-map render target. The JS objects stay; three.js re-uploads on the next farm render. **Re-warm** behind the existing loading overlay with `renderer.compile` plus one hidden render. **Mirror for the race venue** while on the farm. |
| Growth across consecutive races | **Bound `horseGeoCache`:** add an LRU on horse/jockey LOD geometry with real `dispose()`. Keep the roster, the current field and the stable horses pinned. |
| Periodic 4 Hz / 30 Hz spikes | **Venue canvases:** redraw only when their content changes; skip updates for hidden venues (generic flags, screen). **Minimap:** dots canvas at 10–15 Hz. |
| GC sawtooth / major GC in the trace | **Remove the allocation sources the profile names.** Likely: the commentary queue filter, the `animateHorse` closures/arrays, broadcast-camera literals, audio node churn (pool footfall nodes), HUD template strings. |
| First seconds or the parade→race transition | **Pre-upload:** all LOD geometries and venue textures before the gates (`renderer.initTexture`, one off-screen render per LOD). **Decode:** commentary clips before the parade ends. **AUTO grace:** re-arm `autoReset` when the parade ends. |
| Only in the new looks | **Sky shader:** compile the star branch out through a define when `uStars` is 0, and precompute per-look constants. **Shadows:** review the low-sun shadow extent. |
| Shimmering/crawling shadows read as judder | **Snap the race shadow camera to texels**, as the farm already does (`farm.js:373`). |
| Bad only inside the artifact host | **Document it and offer a "Play in its own tab" link.** Still remove main-thread work, since host frames compete for the same budget. |
| Jittery rAF timestamps (VRR / 120 Hz) | **Camera only:** a presentation-only `dt` filter for camera smoothing. The sim keeps using real timestamps; already correct. |

### 2.5 Verification and acceptance (the Phase 15 exit gate)
- **Same devices, same benchmark; before/after reports go into `PROGRESS_P15.md`:**
  - ≥ 99 % of frames on time over the 60 s benchmark at the display's native rate.
  - No frame > 50 ms after the gates open.
  - Hitches per minute ≤ 1.
- **Scenario parity:** B and C are within 10 % of A on p99 and on-time %.
- **The race-hygiene test proves, after the first 3 s:**
  - zero AUTO/`applyQuality` changes, program compiles and `localStorage` writes;
  - no unexpected texture or buffer uploads during a running race (whitelist: only the documented periodic canvases, if they are kept).
- **Allocation** is ≤ the pre-Phase-12 rate (9.5 MB/s on the corrected tool), or the difference is explained.
- **Owner sign-off:** "as smooth as it used to be" on at least two of their devices.
- **Regressions:** Tier 3 full suite + single-file build; `sim.js` diff empty.

---

## 3. Living farm design (Phases 17–18)

**Core idea:** "where is horse h at farm time t" is **derived**, not simulated.
- **Pure scheduler:** `CORE.farmDay(C, day)` (new, in `career-core.js`, tested in Node). It returns, per horse, an ordered list of blocks `{from, to, act, place, handler}`; per staff member, assignments.
- **Inputs:** the existing data only — `fitness`, `composure`, `load`, `sore`, `plan`/intensity, age/growth, `C.booking` and days-to-race, turnout prefs, facilities (walker = recovery level ≥1), hired staff, weather (rain means shorter turnout and a covered walker), and a seeded per-horse temperament from the existing look/attrs (no new stat).
- **One source of truth:** `autoDay` and the scheduler share `CORE.sessionFor(C, day, hid)`. The session you *see* on the oval is the session the calendar applies when the day advances. A consistency test enforces this.

**A typical day** (farm clock 05:00 → 19:00 in ~10 real min, about 43 s per in-game hour)

| Time | Activity |
|---|---|
| 05:00–09:00 | Morning trackwork in two "lots". A worked horse: tacked by a stablehand → led to the oval → staff-ridden warm-up walk/trot → canter or work matching its plan (light, normal, hard or gallop) → pull-up → led back. |
| After work | Cool-down: hot-walking by hand, or on the **walker** if the recovery facility is built (a new visible prop finally gives that facility a purpose). Then the wash bay (hose), sweat scraping, and a groom at the stall. |
| Rest-day / sore / taper horses | Hand-walk or paddock only. A raced-yesterday horse gets a recovery walk plus paddock. The booked horse tapers and stays near the stable on race day. |
| 10:00–15:00 | Paddock turnout and grazing (reusing `FARMLIFE` wander/graze). Young or fractious horses get shorter turnout; older horses longer. Rain means shorter turnout. |
| 15:30–17:30 | Evening stables: horses brought in, feed round (the existing stable hand's bucket run), rugs on cold or wet days. |
| After 19:00 | Horses in their boxes, lights on, a quiet idle. The clock stops at dusk; **the calendar day never auto-advances**. "Rest a day" stays the explicit advance, so no bills or races are ever skipped implicitly. |

**Farm clock: flexible, never rushed (owner adjustment 2)**
- **The clock is ambience, not a timer.** It sets the light and what the *other* horses and staff are doing. It never forces anything on the player.
- **The clock holds** (time stands still) while you are doing anything:
  - a hands-on drill, or mounting and dismounting;
  - a care action (groom, feed, wash, the Phase 19 care loop);
  - leading a horse;
  - any open panel or menu (calendar, wardrobe, Office, Inspect, training plan);
  - inside the farmhouse;
  - the race-day routine from booking to departure, including driving the float;
  - pause.
- **While you just walk around,** it runs at the agreed pace: about 10 real minutes per work day.
- **It never jumps by itself:**
  - The day never advances to evening on its own.
  - Late in the afternoon it slows to a stop at dusk and waits.
  - Only the player's own "Skip to …" choices, Rest a day, or returning from a race move it on.
- **Routines adapt to you, never the other way round:**
  - Any horse that is with you (led, mounted, being cared for, or booked and being prepared) is taken out of the schedule until you put it back.
  - A routine it missed is skipped quietly, or done later by staff, without any penalty.
  - Nothing you start is ever cancelled because the clock reached a block boundary.
- **No activity is time-gated:**
  - Drills, care and race-day departure work at any farm time.
  - The schedule only decides what *staff* do with horses you are not using.
- **Settings → Farm → Clock:** "Normal" (default) / "Slow" (about half speed) / "Paused" (keep the current light and routines frozen).
- **Tests check:**
  - the clock does not move during each listed activity;
  - a led or booked horse is never claimed by the scheduler;
  - the clock never passes dusk without a player action.
- **State:** `C.farm.clock = {day, t}`, so leaving and returning on the same day resumes. Returning from a race sets the time to the race's time of day plus travel. On race day the morning plays out normally before departure.
- **Controls:** "Skip to next activity" and "Skip to evening" on the pause menu and map, plus the existing Rest a day.
- **Lighting:**
  - **Continuous:** the sky uniforms and light colours/intensity are interpolated from `ATMO.params` between day-part keyframes (cheap).
  - **Stepped:** environment maps change only at day-part boundaries. They are pre-built behind the farm's loading overlay and live in a **farm-owned cache** separate from the race cache, so the two scenes never evict each other.
  - The shadow-follow logic is kept.

**Actors and performance (no full AI or physics per horse)**
- **`FARMACTORS` (new `farm-actors.js`).** Each actor (horse, or person with an optional led horse) evaluates its schedule block at farm time t. It produces position and heading along a **cached route** plus an animation state.
  - **Routes:** fixed-station routes (box i ↔ oval gate, wash bay, walker, paddock gate k, feed shed) are computed once with `FARMNAV.find` at farm build and stored.
  - **Paddock gates:** become scripted "gate segments" (open, pass, close), reusing the turnout lerp. Nav does not have to route through colliders.
- **Determinism:** seeded hash noise replaces `Math.random`/`performance.now` in grazing and staff idles, so `_test.step` is reproducible. The existing `FARMLIFE`/`FARMCARE` visuals are refactored to *read* the actor state rather than duplicated.
- **Animation LOD tiers.** Positions always come from the schedule, so far-away and off-screen actors cost almost nothing.

  | Tier | Range | Pose updates | Detail | Shadows |
  |---|---|---|---|---|
  | Near | ≤ 35 m, in frustum | Full `animateHorse`/`animateWalk` every frame | LOD 0 | Yes |
  | Mid | 35–90 m | Every 2nd frame, staggered round-robin | Horse LOD 1 (`buildHorseGeometry(def,1)`) | None |
  | Far | > 90 m, or off-screen | Position only; legs frozen mid-cycle | LOD 2 | None |
  | Hidden | Inside a box when the camera is outside the courtyard, etc. | None | — | — |

- **Hard caps:** at most 3 actors in the "near/full" tier at once (nearest first); the rest drop a tier.
- **Draw-call budget** (enforced by `farm-browser`): the static farm is recovered to **≤ 210** calls at overview, leaving **≤ 40 for actors**. The five-horse maximum stays.
  - **Horses:** 5 × 4 calls when untacked. Ridden horses use a new **merged farm tack + rider** geometry (saddle cloth, saddle, girth, irons and reins merged into one mesh), so a ridden horse costs 6 calls instead of ~14.
  - **People:** at most 6 visible at once, 1 call each.
  - **Props:** walker, hose spray (one line mesh like the rain), rugs (vertex-coloured, part of the tack mesh).
  - **Shadow pass:** actors cast shadows only in the near tier.
- **Frame budget:** farm actor update ≤ 1.0 ms p95 CPU (measured by the extended F8 on the farm).
- **Drills and driving:** no freezing during drills/drive/trip. Actors keep moving (cheap tier rules), and the drill horse temporarily leaves the schedule.

---

## 4. Connected hands-on care (Phase 19): optional, never a chore

**The loop**
1. Walk to the box.
2. Prepare (existing).
3. Lead out (existing).
4. Ride to the oval and mount (existing).
5. Drill (existing six).
6. Dismount (existing).
7. **Cool-down** (new): lead or hot-walk the horse for ~30–40 s of real time; its breathing and sweat visibly settle.
8. **Wash bay** (new interaction): hold the mouse to aim the hose at the horse.
   - The spray is one line-mesh (rain technique).
   - Wet coat: a per-horse cloned material, only while wet. Same program, so no shader compile. It is disposed once the horse is dry.
   - Sweat marks rinse off region by region (neck, shoulder, barrel, quarters, legs), then you scrape.
9. **Groom** (upgraded stall action): brush strokes over highlighted regions. The coat's sheen/roughness lerps on the same cloned material.
10. Paddock or box (existing).

**Rules**
- Every step offers **"Hand to stablehand"**: the routine finishes automatically, off-screen or visibly, under the same rules.
- **The stablehand baseline:** if the player does nothing, staff do the post-work care and the horse gets the standard recovery.
- **The player bonus is small and capped:** about +25 % of the same small effect (load drains a little faster, a slightly better composure/readiness tick), applied once per horse per day.
  - It goes through a new `CORE.postWork(C, hid, quality)` with a daily key, next to `groom`/`wash`.
  - It **never touches attributes directly**; development changes only indirectly, through load and soreness risk.
- **Balance check:** `tests/development.js` and `economy.js` must show at most a few percent faster development for a "player does every loop" profile versus "staff only".
- **No mandatory steps:** guidance shows as *suggestions* in the objective panel (Full/Subtle/Off as now), never as requirements.

---

## 5. Roadmap: Phase 15 onwards

These rules apply to **every phase**:
- Dev branch only.
- Single-file build works and `single-browser` passes.
- Risk-based tiers, as in `CAREER_PROGRESS.md` "Testing policy"; every report lists what ran and what was deferred.
- `race-hygiene-browser` and `farm-browser` budgets stay green.
- Before/after F8 benchmark on the owner's device for anything touching the frame loop.
- Stop for owner review after the phase.
- No feature from Phases 1–14 is removed.

### Phase 15: Racing smoothness (exclusive; nothing else is built)
- **Purpose:** find and remove the micro-stutter regression with evidence.
- **Player-facing:**
  - Races feel smooth again.
  - Hidden diagnostics, kept small: F8 additions, a hitch log, "Copy report", four switches and a benchmark race (§2.1 minimum set).
- **Reuse:** `index.html` (`frame`, `perfFrame`, `startRace`, `updateHUD`, `speedFx`), `gfx.js` (`autoTick`, `applyQuality`, `envFor`, `update`), `farm.js` (`leave`, `dispose`), `scenes.js` hooks, `commentary.js`, `eleven.js`, `venues.js` update, `tools/smooth.js`, `bench.js`, `tests/auto-quality-browser.js`, `scenes-browser.js`, `longrace-browser.js`.
- **Sub-steps:**
  - **15A** the §2.1 minimum set only (default behaviour unchanged).
  - **15B** owner protocol + three bisect builds (`5139a6f`, `49aaed3`, HEAD) + headless counters → a diagnosis written up in `PROGRESS_P15.md`. **Stop for the owner.** Widen the diagnostics only if this round is inconclusive.
  - **15C** fixes only for confirmed rows of §2.4.
  - **15D** verification.
- **Dependencies:** owner measurements on their devices (this blocks 15C).
- **Performance safeguards:** the diagnostics cost nothing when F8 is off; each fix ships behind a lab switch first, then becomes the default once measured.
- **Tests:**
  - New: `race-hygiene-browser.js`, a `scenes-browser` addition (farm parked → GPU memory drops during the race, restored on return), and geometry-cache growth over ten fields.
  - Existing: Tier 3 full suite.
  - **Manual:** owner protocol A–G, before/after.
- **Acceptance:** §2.5.
- **Deferred:** all farm and feature work.

### Phase 16: Review stabilisation and farm render headroom
- **Purpose:** turn "machine-tested" into "played" for Phases 5–14, and create the draw-call room the living farm needs.
- **Player-facing:**
  - Fixes for whatever the owner finds playing a guided **review checklist** of Phases 5–14 (about an hour: new career → care → drill → book → drive → race → return → market → rest a week → season turn).
  - No visual downgrade on the farm.
- **Reuse:** `farm-world.js` `Batch`, `farm-ground.js` cells/LOD, `farm-build.js`, `GFX.chunked`, `buildHorseGeometry(def, lod)`, `tests/farm-browser.js`.
- **Work:**
  - Record the overview draw-call breakdown by category (a new `FARM.stats()` breakdown).
  - Recover ≥ 40 calls without visible loss, using:
    - coarser merge cells for distant static batches;
    - material consolidation (shared atlas/vertex colours for small props);
    - far-tree cells merged;
    - plaques merged into one atlas mesh;
    - signs hidden from overview already.
  - Count shadow-pass calls in the stats and limit shadow casters by distance.
  - Build the merged farm tack + rider geometry (used in 18).
  - Give the farm its own env-map cache, separate from the race.
- **Dependencies:** Phase 15 done.
- **Risks:** merge changes can break colliders and interaction points. Safeguard: colliders stay separate data, and the full `farm-browser`/`farm-flow`/`phase6`/`phase8` set must pass.
- **Tests:** farm-browser with a new target of **≤ 210** static calls and a 40-call actor reserve; screenshot comparisons (`tools/farm-shots.js`) before/after; extended F8 farm benchmark on the owner's device.
- **Acceptance:**
  - The owner's checklist issues are fixed or explicitly deferred.
  - Overview ≤ 210 calls, with the actor reserve documented.
  - No visible regression in owner-reviewed screenshots.
  - Farm frame on-time % ≥ 99 % on the owner's device.
- **Deferred:** routines and new props.

### Phase 17: Farm clock and daily schedule (first visible routines)
- **Purpose:** the day progresses, and horses move between box and paddock on a believable schedule.
- **Player-facing:**
  - Time of day advances while you walk around (~10 min per work day): HUD time, light changes, morning mist and evening light. It **holds** during any activity, panel or race preparation and never jumps to evening by itself (§3, owner adjustment 2).
  - Horses are turned out mid-morning and brought in in the afternoon by a stablehand **on a lead**.
  - The map (**M**) shows where every horse is and what it is doing.
  - "Skip to next activity" / "Skip to evening".
  - The Inspect card shows "Today: …" and a 3-line schedule.
- **Reuse:**
  - Rules and timing: `CORE.autoDay`/`PLANS`/`devRec`/`readiness`/`peaking`/`careStatus` → new `CORE.farmDay`/`sessionFor`; `ATMO.params`/`dayPart`; `farm.js applyAtmosphere`/`sunFollow`.
  - Horse and staff behaviour: `FARMLIFE` (turnout, graze, `C.farm.turnout`), `FARMCARE` (doors, lead-rope follow → generalised to staff-led), `FARMPEOPLE.act("lead")`.
  - Navigation and map: `FARMNAV` (cached routes), `openMap`/`drawMap`.
- **New:**
  - `farm-actors.js` (FARMACTORS: blocks → pose, LOD tiers, staggered updates).
  - `C.farm.clock`.
  - A save field added without a version bump (the migration fills a default; v4 stays readable).
- **Dependencies:** Phase 16 headroom. The booked horse must stay findable (`FARMDAY` depends on it): the scheduler pins it to its box on race day after the morning.
- **Performance risks:** CPU from actor updates, and env-map rebuilds at day-part changes. Safeguards:
  - LOD tiers and the near-tier cap.
  - Env maps pre-built at farm load.
  - A per-frame actor budget assert in tests (≤ 1 ms p95 headless proxy, plus the owner's F8).
- **Tests:**
  - Node: a new `phase17-core.js`:
    - schedule determinism (same seed, day and data → same plan);
    - sore and booked rules;
    - `sessionFor` consistency with `autoDay`;
    - rain and age rules;
    - fuzz.
  - Browser: a new `phase17-browser.js`:
    - simulated-time day via `FARM._test.step`; horses reach paddocks and return;
    - booked horse in its box;
    - leave/return mid-day resumes;
    - no actor draws during races (`scenes-browser`);
    - budgets;
    - 10 farm↔race trips with no growth.
  - Manual: watch a full farm day.
- **Acceptance:**
  - A full day plays with horses moving box → paddock → box via staff, with no teleporting in view.
  - The clock never advances the calendar.
  - Farm on-time ≥ 99 % on the owner's device; draw calls ≤ 250 at every test camera.
- **Deferred:** trackwork, walker, wash routines.

### Phase 18: Morning trackwork, cool-down and staff care routines
- **Purpose:** the "I walk out and my horse is cantering round the oval" moment.
- **Player-facing:**
  - **Trackwork:**
    - Staff-ridden horses walk → **trot** → canter or work on the oval, in lots, matching their plan and intensity. A "gallop day" shows a faster piece of work; a light day is trot/canter only.
    - The trainer (if hired) stands at the rail with a stopwatch; the hut clock shows times.
  - **After work:**
    - Horses return steaming and sweaty, then hot-walk or go on the new **horse walker** (recovery facility ≥ 1).
    - They are hosed at the wash bay by the groom or stablehand, groomed at the box, and rugged on cold days.
  - **Character and conditions:**
    - Activity reflects condition: tired, sore or tapering horses only walk.
    - Young horses play up a little in the paddock; older horses doze.
    - Rain changes the routine.
- **Reuse:**
  - Horse movement on the oval: `FARMTRAIN.ovalAt`/`POINTS`; `animateHorse` without the sim (null-safe `h`, phase advanced by stride length); `PRESENT.animateWalk`.
  - Rider and staff figures: `FARMPEOPLE` jockey/lead poses.
  - Wash and care: `FARMLIFE.wash` hose animation, the facility levels (`FACILITIES`, `buildUpgrades`).
  - Rules: `CORE.staffDaily` (the visible care *represents* rules that already run in `advance()`; no double rewards).
- **New:**
  - A **trot gait** in `animateHorse`; also used in Phase 20 and the parade.
  - The walker prop (one merged mesh plus a rotating arm).
  - The sweat/steam visual: a per-horse uniform on the farm clone material; steam is one small sprite batch.
  - The merged tack/rider from 16.
- **Dependencies:** Phases 16 and 17.
- **Performance risks:** a ridden horse plus rider in view; the hose spray. Safeguards: the merged tack (6 calls); rider pose computed only in the near/mid tiers; the spray shows only near.
- **Tests:**
  - Node: a new `phase18-core.js` — trackwork matches `sessionFor`; no reward is given twice (visible care adds nothing beyond `staffDaily`); taper/sore/rain rules.
  - Browser: a new `phase18-browser.js` — oval lots in simulated time; the walker appears only with the facility; actor budget; screenshots of each activity.
  - `development.js`/`economy.js` unchanged numbers (proves visuals ≠ new rewards).
- **Acceptance:**
  - Over a morning the owner sees at least one horse working on the oval, one grazing and one being led or cooled down.
  - No unbelievable continuous galloping or random wandering.
  - Budgets and frame-time gates hold.
- **Deferred:** player-driven washing/grooming interactions.

### Phase 19: Connected hands-on care loop (optional)
- **Purpose:** §4 — make the existing pieces feel like one satisfying routine.
- **Player-facing:**
  - After a drill: cool-down walk, an **interactive wash** (aim the hose, sweat rinses off by region, scrape) and an **interactive groom** (brush regions, the coat shines).
  - Then turn the horse out or put it away.
  - "Hand to stablehand" at every step.
  - A short "post-work" summary (recovery effect, tomorrow's readiness).
- **Reuse:**
  - Care flow: `FARMCARE` (`startAction`, lead, doors, `stallAnchor`), `FARMLIFE.wash`, `FARMTRAIN` dismount → results flow.
  - Player and guidance: `FARMPEOPLE` acts (brush, hose — a new act on the existing bones), `FARMDAY`-style derived objective hints, `FARMUI` panels.
  - Rules: `CORE.groom`/`wash`.
- **New:** `CORE.postWork` (daily key, capped); wet/sheen material clones.
- **Dependencies:** Phase 18 (staff baseline exists, so the player version is genuinely optional).
- **Risks and safeguards:**
  - **Balance:** caps, plus the development and economy simulations.
  - **Chore creep:** never required, and skippable at every step.
  - **Material clones:** at most 2 at a time, same program, disposed after drying (verified by the leak test).
- **Tests:** a new `phase19-core.js` (caps, once per day, staff vs player effect sizes, fuzz); a new `phase19-browser.js` (full loop, skip at every step, no leaks over 5 loops, no shader compile during wash: counter); `development.js` profiles.
- **Acceptance:**
  - The owner completes the loop and finds it enjoyable and quick (about 3–4 min end to end).
  - Skipping it costs at most a small, explained edge.
  - Development speed for "player every day" vs "staff only" differs by ≤ 5 %.
- **Deferred:** feeding mini-game, farrier/vet interactions.

### Phase 20: Horse behaviour and animation quality (farm + race)
- **Purpose:** horses feel like animals everywhere.
- **Player-facing:**
  - **Farm:** temperament-driven idles (ear flicks toward sounds and people, head toss, pawing at feed time, nickering, looking over the door when you approach, rolling in the paddock, dozing on three legs, tail swishing at flies in summer); the walk ↔ trot ↔ canter transitions are blended.
  - **Race day:** the parade uses the trot and shows keen horses jig-jogging; sweating-up visuals for fractious horses; post-race blowing, steam on cold days, and a jockey standing in the irons when pulling up.
  - **Jockey:** hands-and-heels push vs whip, posture by gait, a look-round late in a race.
- **Reuse:** `animateHorse`, `PRESENT.animateWalk`/`poseStrapper`, `buildJockeyGeometry`, `HORSE_U` shader uniforms, horse look/attrs (temperament = a seeded mapping of existing attrs, e.g. a composure trait, not a new stat), `sim.js` read-only state for race posture.
- **Dependencies:** the trot from 18.
- **Risks:**
  - **CPU in races with up to 24 horses:** new idles are farm-only, or LOD-gated in races to the near tier.
  - **Race regression:** the race animation changes are presentation-only; `sim.js` is untouched.
- **Tests:** Tier 3 (it touches the race render path); race-hygiene; smooth.js before/after; screenshots; `presentation-browser`, `replay-lunge-browser`.
- **Acceptance:** owner review of the behaviours; no race frame-time regression on the owner's benchmark; `sim.js` diff empty.
- **Deferred:** facial rigs, mud/splash particles.

### Phase 21: Race-day immersion, camera and commentary
- **Purpose:** keep racing the most exciting part.
- **Player-facing:**
  - **Before the race:** arrival at the course (the float pulls into the stalls area); a saddling-enclosure and mounting-yard moment (skippable, reusing the parade); a pre-race bookmaker/odds board (display only).
  - **After the race:** return to scale, and a trophy presentation tier by race grade.
  - **Lighting:** floodlight towers for evening meetings (geometry + lights baked into the venue batch).
  - **Sound:** crowd audio layers by meeting size and position (roar building from the 400 m).
  - **Camera:** broadcast camera polish (cut rules, a head-on straight shot, a finish-line high shot) and new replay angles.
  - **Commentary:** town names for the 14 regional courses via recorded clips. This is **priced first; the owner approves the ElevenLabs credits.**
- **Reuse:** `presentation.js` (parade, winner), `updateCamera` broadcast director (`BC`, `buildShots`), `venues.js`, `commentary.js`/`calls.js`/`eleven.js` (the plan/clip pipeline, `tools/commentary-batches.js`), `audio`.
- **Dependencies:** Phase 15 hygiene rules (no mid-race uploads or compiles: new shots and props are pre-warmed).
- **Risks:** extra draw calls at venues (budget: no more than +10 % per venue, measured); new phrases must have recordings (`eleven-plan` test).
- **Tests:** Tier 3; race-hygiene; commentary suites; `presentation-browser`; owner benchmark.
- **Acceptance:** owner review; frame gates hold; commentary checks green.
- **Deferred:** full new metropolitan venues.

### Phase 22: Regional racecourse variety and weather atmosphere
- **Purpose:** country racing feels like a journey around Australia.
- **Player-facing:**
  - **Courses:** a kit-of-parts country venue generator. 2 → about 6 looks: region palettes (NSW tablelands, coastal QLD, Western District VIC); stand/tote/marquee variants; per-town backdrop hills, trees and water; picnic-race bunting; a crowd size that varies with the event.
  - **Weather:** wet-track spray behind runners (GPU particles, one draw call); cloud shadows drifting over the track.
  - **On the farm:** puddles and wet ground.
- **Reuse:** `venues.js buildCountry` (generic track geometry — **physics unchanged**), `GFX.chunked`/LODs, `ATMO`, `GFX.setWet`/`createRain`, `SEASON.venueStyle`.
- **Dependencies:** none beyond 15.
- **Risks:** venue memory (venues are cached and hidden; Phase 15 parking rules apply to unused venues); draw calls ≤ the existing country budget (205–217).
- **Tests:** `phase11-browser` extended (every look builds, budgets); race-hygiene; screenshots.
- **Acceptance:** owner review; per-venue budgets; no frame regression.
- **Deferred to Phase 24:** genuinely different course layouts. Phase 22 is visual and atmospheric only; the owner requires real layout variety later.

### Phase 23: Career balance, goals and replayability (play-test driven)
- **Purpose:** make a long career compelling, tuned by human play, not only by simulation.
- **Player-facing:**
  - **Tuning:** retuning of purses, fees, development pace and regional pressure from the owner's play-test notes.
  - **Goals:** season goals and stable milestones with modest rewards; client horses (train other owners' horses for a fee and a cut of the prize — this adds variety without raising the five-horse limit).
  - **Rivals:** rival trainer storylines (head-to-heads already exist).
  - **Options:** difficulty presets for the career, and a "new career+" with a starting stable choice.
- **Reuse:** `CORE` economy/ledger, `SEASON` `LIFT`/`raceField`, `tests/economy.js`, `development.js`, `career_difficulty.js`, `progression.js`.
- **Dependencies:** an owner play-through, since Phases 5–14 have never been played.
- **Risks:** exploit loops (client horses + prize). Safeguard: ledger keys and once-a-day rules.
- **Tests:** Tier 3 + economy/difficulty tables before/after.
- **Acceptance:** the owner plays a full season and judges the pacing; the simulations stay within the agreed bands.
- **Deferred:** breeding/stud (the spec says "not yet").

### Phase 24: Distinct regional racecourse layouts (owner requirement; scheduled after Phase 22, may move later)
- **Purpose:** country courses that *race* differently, not only look different. Each differs in:
  - lap length, bend radii and tightness, and straight lengths (home and back);
  - direction (clockwise / anti-clockwise), chutes and start positions;
  - track width, cambers, and modest rises and falls where the engine supports them.
- **Player-facing:**
  - Courses where tactics change: a short home straight rewards on-pace horses; a tight, turning track punishes wide runs; a long straight suits finishers.
  - Track character shown on the calendar and the form guide ("tight, turning 1,450 m circuit, 250 m straight").
  - Horses develop course preferences through results; display only at first.
- **Reuse:** the engine already supports real course geometry. `sim.js` `TRACK_DEFS` + `buildTableTrack` + `getTrack(id)` is how Randwick and Flemington are defined (routes, chutes, `bendAcc`, `kIn`, `loopD`). The country venue art (`venues.js buildCountry`, Phase 22 kit) is laid out along `race.route` instead of the generic oval. Plus `SEASON.venueStyle`/`REGIONAL_VENUES`.
- **Work:**
  - Define about 4–6 country layouts as table tracks, assigned to towns.
  - Make the venue kit follow any route.
  - Give the minimap, broadcast shots (`buildShots`) and commentary distance calls the per-course geometry.
  - Re-tune `LIFT` pressure only if the win-rate tables move.
- **Dependencies:** Phase 22 venue kit; Phase 15 hygiene rules.
- **Risks:**
  - **This is the first change to `sim.js` track data since the expansion.** The existing generic, Randwick and Flemington tracks must stay byte-identical in behaviour: new tracks are additive only.
  - **AI and pack-racing behaviour on new bend shapes** (collisions, cover-seeking) needs validation.
  - **Online:** the multiplayer server (hidden) races only the generic course; leave that unchanged.
- **Tests:**
  - **Tier 3 full suite (mandatory).** Per-course geometry tests modelled on `tests/randwick.js` / `flemington.js`: routes, chutes, navigation, AI races.
  - **Race-engine suites** on every new course: `field`, `chaos`, `avoid`, `pileup`, `pushfall`.
  - **Balance and smoothness:** `career_difficulty.js` and `progression.js` before/after; race-hygiene; the owner's benchmark on one new course.
- **Acceptance:**
  - Each new course is measurably different (lap, straight and bend radii documented, sectional times differ).
  - AI races finish with no stuck or overlapping horses.
  - Existing tracks are unchanged (their tests are identical).
  - The owner judges that the courses feel different to ride.
- **Deferred:** undulating 3D terrain beyond what the sim's flat route model supports; metropolitan venues.

### Later backlog (not scheduled)
- Breeding and stud careers.
- Online multiplayer revival (hidden by design).
- A three.js upgrade (only for a measured need).
- Mobile/touch controls.
- Farmhouse interior lighting by time of day.
- More metropolitan venues.

---

## 6. Risks and architectural concerns

1. **The stutter may be environmental** (artifact host iframe, browser, display). Condition E isolates this early. If confirmed, the fix is a "play in its own tab" option plus main-thread reductions; the game itself may be fine.
2. **More than one cause is likely:** an AUTO mid-race change, periodic canvas uploads and GC can all contribute. The hitch log ties each hitch to its events, so fixes can be prioritised by contribution.
3. **The farm budget is genuinely exhausted.** The living farm *depends* on Phase 16 recovering headroom; do not start Phase 17 without it.
4. **Two sources of truth for training:** the visible schedule and `autoDay` must share `sessionFor` (tested), or players will see work that never counts, or counts twice.
5. **Save compatibility:** new fields (`C.farm.clock`, `postWork` keys) go into v4 with defaults, and v1–v4 fixtures are re-run each phase. A schema bump (v5) only if unavoidable, with the existing verified-backup path.
6. **Non-determinism in `FARMLIFE`** must be removed before schedules, or the `_test.step` tests become flaky.
7. **`index.html` is a 4.5k-line monolith** with dense lines. No rewrite: race-path edits stay surgical. Diagnostics go in a new `perf.js` only if they outgrow a few lines (any new script needs a `<script>` tag **and** a `swap()` line in `tools/build-single.js`).
11. **Regional layouts (Phase 24)** are the first edit to `sim.js` track data since the expansion. They must be strictly additive, with existing tracks unchanged, and need the full Tier 3 suite.
8. **Headless tests cannot judge feel or GPU cost.** Every phase that touches rendering needs an owner F8 report on a real device before sign-off.
9. **Unreviewed Phases 5–14** may hide gameplay issues that change priorities. Phase 16's checklist exists to surface them early.
10. **`main` divergence:** keep it untouched. A future merge needs the owner to choose which docs version wins (the dev branch's docs are the maintained ones).

---

## 7. What Sonnet implements first (Phase 15A only)

1. **Read first:** `ROADMAP_P15.md` §2, `HANDOFF.md` §0/§6, and `CAREER_PROGRESS.md` FINAL STATE §E.
2. **Fix the measurement tools first:** the `ff_comm` → `ff_commentary` key in `tools/smooth.js`, `tools/bench.js` and `tests/auto-quality-browser.js`. Re-baseline at HEAD and at `49aaed3` / `5139a6f` via git worktrees, and log the results in `PROGRESS_P15.md`.
3. **Add the §2.1 minimum set and nothing more:**
   - F8 additions;
   - the hitch log with its five event kinds;
   - Shift+F8 copy report;
   - four switches (`ff_lab`, all defaults = current behaviour);
   - the benchmark race (after load / after farm).
   - Hook points are one-line calls, guarded so they cost nothing with F8 off.
4. **Add `tests/race-hygiene-browser.js`** (WebGL/storage/AUTO counters) and run it at HEAD and at `5139a6f`.
5. **Build the single file and hand the owner the protocol** (§2.2, conditions A, B, D, E, F, plus G with three bisect builds).
   - Updating the existing game artifact is fine.
   - Ask the owner before publishing any extra bisect artifacts.
6. **Stop.** Fix nothing until the owner's reports identify the cause. Then do 15C/15D per §2.4/§2.5.
   - If the evidence is inconclusive, add *one* item from the §2.1 menu at a time.

---

## 8. Instructions for every Sonnet implementation session

1. **Start each session by reading,** in order:
   - this file (the phase you are on, plus §6);
   - `PROGRESS_P15.md` (status and the latest report);
   - `HANDOFF.md` §0–§2 and §9 (architecture and file map);
   - `CAREER_PROGRESS.md` "Testing policy".
2. **Scope:**
   - **One phase per session series.** Build only the approved phase. When it is done: tests, commit, push, update `PROGRESS_P15.md`, then **stop for owner review**.
   - Do not start the next phase.
3. **Git:**
   - Commit and push only to `claude/amazing-clarke-jzpr1x`.
   - Never merge into `main`, force-push or resolve the `main` doc divergence without the owner.
4. **Keep existing systems:**
   - Do not remove or rewrite working Phase 1–14 features.
   - Extend the existing modules (`CORE`, `CAREER`, `FARM*`, `GFX`, `VENUES`, `PRESENT`) rather than creating competing ones.
   - No unrelated refactoring.
5. **Rules that are never relaxed:**
   - Money only through `CORE.apply`.
   - Rewards only through the existing once-a-day `CORE` rules.
   - Five-horse maximum.
   - Farm and race scenes stay separate.
   - The single-file build must keep working: every new script needs a `<script>` tag and a `swap()` line.
   - `sim.js` is untouched unless the phase says otherwise (only Phase 24 does).
6. **Testing:**
   - Risk-based tiers as in `CAREER_PROGRESS.md`.
   - From Phase 15 on, `race-hygiene-browser` and the `farm-browser` budgets are always run.
   - A failed browser test is rerun once and **both results are reported**.
   - Never claim a test ran when it did not; list what was deferred and why.
7. **Performance:**
   - Never claim unmeasured performance.
   - Any change to the frame loop, `gfx.js`, `venues.js` or the farm render path needs an F8 benchmark report from the owner's device before sign-off. Headless numbers are supporting evidence only.
8. **Reporting:** put measurements and test results in `PROGRESS_P15.md`, and give the commit hash and the artifact version in the closing message.
