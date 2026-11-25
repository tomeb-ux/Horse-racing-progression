# Final Furlong: progress log for Phase 15 onwards

Plan: `ROADMAP_P15.md` (approved by the owner on 2026-11-25 with three adjustments). History of Phases 1–14: `CAREER_PROGRESS.md` (FINAL STATE section) and `FINAL_REPORT.md`.
Branch: `claude/amazing-clarke-jzpr1x` only; `main` is not to be touched.

**Rule:** one approved phase at a time. After each phase:
1. Run the tests (list what ran and what was deferred, and why).
2. Commit and push.
3. Update this file.
4. Stop for the owner's review.

## Status

| Phase | Title | Status | Owner review |
|---|---|---|---|
| 15 | Racing smoothness (micro-stutter) | **15A, 15B (one device) and 15C done. 15C: AUTO graphics no longer reallocates while a race is live. Waiting for the owner to check it on the Mac before Phase 16.** The stutter is not declared fixed until the owner says the real race feels smooth. | — |
| 16 | Review stabilisation and farm render headroom | not started | — |
| 17 | Farm clock and daily schedule | not started | — |
| 18 | Morning trackwork, cool-down and staff care routines | not started | — |
| 19 | Connected hands-on care loop | not started | — |
| 20 | Horse behaviour and animation quality | not started | — |
| 21 | Race-day immersion, camera and commentary | not started | — |
| 22 | Regional racecourse variety and weather atmosphere | not started | — |
| 23 | Career balance, goals and replayability | not started | — |
| 24 | Distinct regional racecourse layouts | not started | — |

Phase 15 sub-steps:
- **15A (done):** the lean instrumentation set, tool fixes and the race-hygiene test.
- **15B (first round done, one device):** owner measurements, bisect builds and the diagnosis. Only the Apple M2 / Chrome device has reported so far.
- **15C (done):** AUTO changes are queued while a race is live (`gfx.js`); see the 15C report.
- **15D:** verification against `ROADMAP_P15.md` §2.5.

## Known facts at the start of Phase 15 (from the planning review; not yet measured on real hardware)

**Owner report**
- Micro-stutter in races on **several devices**, mostly in the **published single-file artifact**.

**Strongest code-level suspects (to be confirmed or ruled out by measurement)**
1. **AUTO quality** is fed farm and menu frames (since `6ffe2f5` / `62b7567`). A level change calls `applyQuality()`, which can happen mid-race and does:
   - `setPixelRatio` + `resize()`: two drawing-buffer reallocations;
   - a shadow-map reallocation.
2. **The farm world, including its 2048² shadow map, stays GPU-resident during races.** The menu builds it at boot, so this applies even to Quick Race.
3. **`horseGeoCache` never evicts,** so geometry can grow over consecutive races with different fields.
4. **Periodic canvas-texture uploads** (venue screens at 4 Hz), minimap redraws every frame, and per-frame allocations (commentary queue filter, `animateHorse` closures, audio nodes).

**Already established**
- The JS allocation rose from 9.5 to 12.2 MB/s in `tools/smooth.js` after Phase 12; this is still unexplained.
- **Tooling bug:** `tools/smooth.js`, `tools/bench.js` and `tests/auto-quality-browser.js` set `ff_comm`, but the real key is `ff_commentary`, so commentary stayed on in those runs.
- `sim.js` is byte-identical to `5139a6f`.

## Measurements log

| Date | Build / commit | Device · browser · Hz | Condition (ROADMAP §2.2) | On-time % | p95 / p99 ms | Longest ms | Hitches/min | AUTO changes | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-11-25 | 15A artifact v20 | Apple M2 MacBook · Chrome · battery | A: benchmark, artifact, defaults | 100 (metric artefact, see below) | — / — (median 33.3) | — | — | not recorded (render ×1, shadows 1024 observed: AUTO at its floor) | **~30 fps cadence; the 15A detector read it as "30 Hz" so it judged every frame on time.** Owner: jerky. |
| 2026-11-25 | 15A artifact v20 | Apple M2 MacBook · Chrome · battery | E: same build as direct HTML in its own tab | 100 (artefact) | — / — (median 33.3) | — | — | — | identical to the artifact run: **not a host-page / iframe effect** |
| 2026-11-25 | 15A artifact v20 | Apple M2 MacBook · Chrome · battery | F: AUTO lab = Off (fixed High) | 100 (artefact) | — / — (median 33.3) | — | — | 0 by design | canvas 3420 × 1902 (2×), shadows 4096, **still 33.3 ms**. Not a controlled AUTO test: it compared the floor level with High |
| 2026-11-25 | 15A artifact v20 | Apple M2 MacBook · Chrome · battery | owner's separate check | — | ~27 fps | — | — | — | Chrome ~27 fps on battery, 60 fps immediately when plugged in; unplug / replug during a race degrades / restores |
| 2026-11-25 | 15C artifact v21 | Apple M2 MacBook · Chrome · plugged in (60 Hz) | A: benchmark, defaults, 60 s, 3,524 frames (58.7 fps), full quality (AUTO level 0, ×2, 4096 shadows: the removed High) | 97.93 | — / — | 83.3 | 73 late frames in 60 s | **0** | after the AUTO-queue fix: no AUTO change in the race, no 99 ms hitch. **Remaining uneven pacing (73 late frames, max 83 ms) is kept as a non-blocking performance concern**; the owner's reading is that it is much better. Raw report not available to Claude |
| 2026-11-25 | 15A artifact v20 | Apple M2 MacBook · Chrome · plugged in (60 Hz) | A: benchmark, defaults, 60 s, 3,593 frames | 99.89 | 16.8 / 17.5 (median 16.7) | 99.2 | 4.0 (4 hitches in 60 s) | **3** | one hitch of 99.2 ms = AUTO step-up to render ×2 with ~101.6 ms of JS in the preceding frame. The other 3 hitches are not attributed (raw report not available to Claude) |

## Phase reports

### Phase 15A: lean racing-stutter instrumentation (this commit)

**Scope kept:** instrumentation only. No stutter fix, no default changed, `sim.js` untouched (`git diff 5139a6f HEAD -- public/sim.js` is empty), `ff_autoLevel` and the quality settings are never written by any of the new code, and no living-farm or other feature work was started.

> **Limitation (read first).** Everything measured in this repo is headless Chromium on a software renderer (SwiftShader) with a synthetic frame clock. **That cannot reliably reproduce real-device GPU, driver, compositor or frame-pacing problems.** The headless numbers below are *counts* (uploads, compiles, storage writes, AUTO changes), which are valid, and CPU-side costs, which are only relative. They do not show whether, or why, the owner's devices stutter. Nothing here identifies the cause.

#### What was built
| Piece | Where | Notes |
|---|---|---|
| F8 additions | `perf.js` `overlay()`, hook in `perfFrame` | detected display refresh (Hz and ms), on-time %, longest frame, hitches per minute for the last ~5 s **and** for the current race (from the gates opening), the last hitch, the farm's residency and any non-default lab switch. **Hitch = frame interval > max(1.5 × refresh, refresh + 4 ms); on-time = every frame that is not a hitch.** |
| Hitch log | `perf.js` | per hitch: time since page load, ms, segment (race / pre-race / farm / menu …), race distance and clock, JS time of this frame and of the previous frame (the work that produced the long interval), simulation and render-submit time, a hint ("JS was short: time went elsewhere (GPU / compositor / browser)" or "JS-heavy"), and **the events of that frame and the previous one**. Last 200 kept. |
| Event kinds | hooks in `gfx.js` (`applyQuality`, `setAtmosphere`, `envFor` cached / PMREM build), `SCENES.onChange` (scene transitions), per-frame watch of `renderer.info` (geometry / texture / shader-program count changes), race start (`startRace`) and gates open | rare events are noted even with F8 off (a few dozen a session), so a report always has the AUTO / look history. |
| Shift+F8 | `perf.js` dialog | selectable text box + Copy (clipboard → `execCommand` → "text selected, press Ctrl/Cmd+C"). Refused during a live race (open it from pause / results / menu). Also holds the lab and the benchmark. Report: build type (single file / served; iframe or top level), browser, GPU renderer string, screen / canvas / pixel ratio, refresh, graphics preset and AUTO state (level, changes, last reason, stored level), lab switches, **farm residency ("IS resident in memory", GPU resident / parked)**, GPU object counts, frame statistics per segment, hitch log, events, and a JSON copy. F8 and Shift+F8 now also work while walking the farm (they were swallowed by the farm's input context before). |
| Lab (`ff_lab`, written only when something differs from the defaults) | `perf.js`; one-line hooks in `gfx.js`, `commentary.js`, `index.html` (`startRace`), `farm.js` | **AUTO**: normal / race frames only / off (fixed High: render scale and shadows of level 0; the stored level is neither read for rendering nor written). **Farm GPU**: retained / parked while racing (`FARM.park()`: disposes the GPU copies of the farm's geometry, textures, instance buffers and sun shadow map; JS objects, materials/programs, horses, character, career data and everything the race also uses stay; three.js re-uploads lazily; `FARM.enter()` / `startShowcase()` un-park). **Race lighting**: normal / forced afternoon-clear. **Commentary**: normal / off (no booth, no clip decoding; the saved setting is untouched). A boot toast and the F8 / report text flag any non-default switch. |
| Benchmark | `perf.js` | Royal Randwick, 1,600 m, 12 runners, seed 11, chase camera, all bots, `going good`, incidents off, parade off (camera and parade are restored afterwards, never stored); **60 s from the gates opening**. Variants: straight away, or after 60 s on the menu's farm showcase. Look is a benchmark parameter (afternoon clear / golden hour / rain). At the end it leaves the race, returns to the menu and opens the report. Cancelling (pause, leaving) is detected by a 250 ms timer (the pause screen draws no frames). Records without the F8 overlay. |
| Tool fixes | `tools/smooth.js`, `tools/bench.js`, `tests/auto-quality-browser.js` | `ff_comm` → `ff_commentary`. **The value also had to change**: `commentary.js` only reads `ff_commentary` when it is a JSON *object*, so the old `'"off"'` would still have left commentary on. They now store `{on:false, vol:0.9, captions:false}`. (`tools/shots.js`, `tools/breakdown.js` and the timing tests `steering` / `start` / `replay-lunge` still write `ff_comm`; left alone, they are outside the requested scope.) |
| Tests | `tests/race-hygiene-browser.js` (new), `tests/perflab-browser.js` (new, 47 checks), `FF_LAB` passthrough in `scenes-browser` and `farm-flow-browser` | see below |
| Build | `<script src="perf.js">` last in `index.html`; `swap()` line in `tools/build-single.js` | |

**Cost when F8 is off:** per frame one property read (`PERFLAB.rec`) plus one extra `autoTick` argument; no allocation. With F8 on or the benchmark running, the frame hook allocates nothing per frame (reads `renderer.info`, writes into preallocated arrays). The F8 overlay itself (existing DOM text + a 300×70 canvas redrawn every frame) is not free: the "Record frame stats without the F8 overlay" option and the benchmark avoid it.

**Known limitations of the instrumentation**
- The refresh rate is read from the fastest frames the page reaches (snapped to a standard rate). A device that never reaches its display rate reads as the rate it does reach; say the display Hz in the notes.
- **Observed failure (2026-11-25): on a power-throttled Mac running steadily at ~30 fps the "display refresh (detected)" read "30 Hz", the hitch threshold became 50 ms and the report said 100 % on-time.** The detected value is the cadence the page achieves, not the display's rate; 15C proposes to label and judge it that way (see below).
- It sees rAF intervals and JS time. It cannot see GPU time, compositor or driver stalls except as "the interval was long and JS was short". Chrome traces and `chrome://gpu` remain necessary.
- The benchmark has no human input, so it excludes the cost of rider input and of a real career race's HUD events; condition B covers that path.
- Park is lazy: the farm's first frames after returning re-upload (visible as hitches in the log, behind the loading overlay when entering via the farm; not behind it when returning to the menu).
- `FARM.park()` skips any texture or geometry found in the race scene or the horse-geometry cache, and cannot find textures hidden in shader uniforms created by `onBeforeCompile`; those stay resident.

#### Corrected-tool re-baseline (headless, software GL, synthetic clock; **not** real-device evidence)
Worktrees of `5139a6f`, `49aaed3` and `aafda04` (pristine HEAD) were served from their own `public/` folders with `python3 -m http.server`; the **corrected HEAD tools** were run against each; the old checkouts were not modified. `tools/smooth.js`, Randwick, chase and jockey cameras at 60 and 144 Hz (the earlier phase comparisons used the same two cameras; the full 12-condition matrix took about 1.5 min per condition and was cut to these 4 for the two older builds; broadcast camera rows are dominated by camera cuts and not comparable).

| Build | alloc MB/s (render pass), 4 conditions | update-only MB/s | update p50 / p99 ms | update + render p50 / p95 ms | draw calls / triangles (chase 60) |
|---|---|---|---|---|---|
| `5139a6f` (before the expansion) | 9.36 · 10.04 · 9.49 · 10.45 | 3.5 · 4.0 · 3.4 · 6.0 | 0.4–0.6 / 1.1–3.8 | 2.7–3.9 / 7.3–8.9 | 222 / 443,443 |
| `49aaed3` (before Phase 12) | 9.54 · 10.10 · 7.21 · 10.47 | 3.4 · 5.6 · 3.4 · 5.8 | 0.3–0.5 / 1.0–2.9 | 2.5–4.0 / 6.4–9.3 | 222 / 443,443 |
| `aafda04` HEAD, run 1 / run 2 | 12.25 · 12.89 · 11.88 · 11.24 / 12.21 · 12.95 · 9.51 · 13.67 | 3.4 · 5.9 · 3.3 · 6.1 | 0.3–0.5 / 0.7–1.9 | 2.5–3.2 / 6.1–10.7 | 222 / 443,443 |

- Horse speed (17.75 m/s at 60 Hz, 17.43 at 144 Hz), stalls (0) and draw calls / triangles are identical at all three builds.
- **The allocation rise survives the tool fix**: with commentary really off, the render-inclusive pass is about 9.4–10.5 MB/s at `5139a6f` and `49aaed3` and about 11–13 MB/s at HEAD (the same 9.5 → ~12.2 seen before). The **update-only** rate is unchanged (about 3.4 MB/s at 60 Hz), so the extra allocation is in the render-inclusive path, between `49aaed3` and HEAD (Phases 12–14). Single runs vary by ±2 MB/s, so this is an observation, not a diagnosis; the cause is **not identified** (the roadmap's CDP allocation profile is still to do).
- `tests/auto-quality-browser.js` (corrected): **12/12 at `5139a6f`, `49aaed3` and `aafda04`**.
- `tools/bench.js` (corrected; 2 scenes `A_randwick_everest`, `E_chase_close`, 40 frames; software-GL frame times of 0.4–1 s at p95 are meaningless): GPU objects resident after the scene is up: `5139a6f` 68 textures / 341 geometries / 49 programs (Everest scene), `49aaed3` 91 / 434 / 64, HEAD 92 / 435 / 64: **the farm built at boot adds about 15 shader programs, 24 textures and 94 geometries** to what a race carries. JS heap at the end of the Everest scene: 98 MB (`5139a6f`) / 133 MB (`49aaed3`) / 129 MB (HEAD).

#### Smoothness-tool overhead of the diagnostics (F8 off), same tool, same machine
`tools/smooth.js`, Randwick chase + jockey, 60 + 144 Hz: before (pristine `aafda04`, two runs) vs after (working tree, two runs): draw calls, triangles, horse speed and the update-only allocation rate (3.3–3.4 MB/s at 60 Hz; 5.9–6.2 at 144 Hz) are identical; update p50 0.29–0.41 ms after vs 0.3–0.5 ms before; render-inclusive allocation 11.5–13.2 MB/s after vs 9.5–13.7 before. **The after-runs sit inside the run-to-run spread of the before-runs** (the two "before" runs differ from each other by as much as from the "after" runs). No measurable overhead was found; headless timing cannot resolve microsecond-level differences.

#### Race hygiene (`tests/race-hygiene-browser.js`: counted from outside the game, per race second after the gates open)
Counters: texture uploads, buffer uploads, shader compiles / program links, `localStorage` writes, `applyQuality()` calls, `setPixelRatio()` calls (the stack is inspected to count only calls from `applyQuality`). Settings seconds 0–2 are "settling"; seconds 3–19 must be clean. Frames are driven by a synthetic steady 60 Hz clock (so AUTO only reacts to what the test feeds it), 480×270, 12 runners, Randwick, seed 11, 20 race seconds. "afterfarm" feeds 8 s of **slow synthetic (40 fps) menu-showcase frames** before the race, to test the *mechanism* by which farm frames reach AUTO. Same file, unchanged, at both builds.

| Run | `5139a6f` | `aafda04` (pristine HEAD) | working tree (diagnostics) |
|---|---|---|---|
| quick, chase, s3–19: applyQuality / setPixelRatio / shader compiles / localStorage writes / AUTO changes | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| quick, broadcast, s3–19: same | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| afterfarm, chase: AUTO level before farm → gates → end | **blocked: this build has no farm** | 0 → 1 → 1 → **0** | 0 → 1 → 1 → **0** |
| afterfarm, chase, s3–19: applyQuality / setPixelRatio / localStorage writes / AUTO changes | blocked | **1 / 1 / 1 / 1** | **1 / 1 / 1 / 1** |
| afterfarm, broadcast, s3–19: same | blocked | 0 / 0 / 0 / 0 (level stayed 1) | 0 / 0 / 0 / 0 |
| before the gates (quick, chase): shader compiles / links, buffer uploads | 68 / 34, 1,693 | 102 / 51, 2,030 | 102 / 51, 2,030 |
| texture uploads in s3–19 | 24,480 (1,440/s = 24 per frame) | 24,480 | 24,480 |
| buffer uploads in s3–19 (chase / broadcast) | 0 / 24 | 0 / 42 | 0 / 42 |
| GPU objects at the gates (chase): geometries / textures / programs | 452 / 107 / 32 | 414 / 114 / 47 | 414 / 114 / 47 |

What this shows, and what it does not:
- **A clean, steady race has no AUTO changes, quality reallocations, shader compiles or `localStorage` writes after the first 3 s, at all three builds.** The diagnostics add no counts (working tree = pristine HEAD, row for row).
- **The mechanism exists at HEAD and not at `5139a6f`:** slow *farm / menu-showcase* frames (fed to AUTO since `6ffe2f5` / `62b7567`) step AUTO down and persist `ff_autoLevel`; the next race then runs at the lowered level, and in the chase-camera run AUTO stepped back **up during the race**, giving one `applyQuality()` (→ `setPixelRatio`, drawing-buffer reallocation) and one `localStorage` write after the gates. The frame times were synthetic, so this shows the *path*, **not** that it happens on the owner's devices or that it causes the stutter. The lab switch "AUTO: race frames only" / "off" exists to test exactly this on a device.
- Texture uploads are a constant **24 per frame at every build, including `5139a6f`** (consistent with 12 horses + 12 jockeys, probably their skinned-mesh bone textures, but I did not attribute them). So they are baseline, not a Phase 12+ regression. Buffer uploads are 0 on the chase camera and a few per second on the broadcast camera.
- The farm built at boot adds 15 shader programs (32 → 47), 7 textures and a lot of geometry to a Quick Race at HEAD versus `5139a6f` (GPU objects at the gates, chase camera; the geometry difference runs the other way here because the venue differs). Whether that residency costs anything on a real GPU is for the owner's park-switch runs to say.

#### Park switch, farm ↔ race (real rendering, `tests/perflab-browser.js` section D, and the two suites re-run with `FF_LAB`)
Retained (normal): 269 geometries / 72 textures alive during a race, the farm alone 220 / 54. **Parked: −150 geometries and −26 textures at the race start (268 / 60 → 200 / 43); 269 → 201 geometries and 72 → 55 textures during the race.** Back on the farm: 2 horses in their boxes, 5 plaques, the same 534 scene objects, the character present, the same 145 draw calls, the career save byte-for-byte unchanged, GPU objects back to 275 / 69 (the same as the retained run). Ten further parked trips: geometries 275 → 275, textures 69 → 69, programs Δ0, JS heap Δ0.7 MB.

#### Tests run (working tree, server `FF_TEST_HOOKS=1 PORT=8095`; a failed browser test is re-run once and both results are listed)
| Test | Result | Count | Notes |
|---|---|---|---|
| `node tests/career-core.js` (Tier 1) | **passed** | 128 / 0 failed | |
| `node tools/build-single.js` + `tests/single-browser.js` (Tier 1) | **passed** | build OK (8,957 KB, `perf.js` inlined); 8 / 0 failed | the single file boots from disk |
| `tests/scenes-browser.js` (Tier 1) | **passed** | 38 / 0 failed | incl. 10 farm↔race trips, no growth (geometries 313 → 313, textures 90 → 90) and "AUTO fed on farm frames" (unchanged 2nd `autoTick` argument) |
| `tests/farm-browser.js` | **passed** | 34 / 0 failed | budgets ≤ 250 draw calls / ≤ 500k triangles |
| `tests/farm-flow-browser.js` | **passed** | 74 / 0 failed | |
| `tests/steering-browser.js`, `start-browser.js`, `replay-lunge-browser.js` (racing smoke, Tier 1; run alone, nothing else running) | **passed** | 70 / 8 / 9, 0 failed | |
| `tests/auto-quality-browser.js` (corrected) | **passed** | 12 / 0 failed | also 12/12 at `49aaed3`, `5139a6f` and pristine HEAD |
| `tests/longrace-browser.js` | **passed** | 5 / 0 failed | |
| `tests/phase12-browser.js` | **passed** | 24 / 0 failed | |
| **`tests/scenes-browser.js` with the park switch on** (`FF_LAB={"park":"park",…}`) | **passed** | 38 / 0 failed | 10 trips: geometries 313 → 313, textures 90 → 90, programs Δ0, heap Δ0.6 MB; career data byte-identical. Park confirmed active with the same seeding: −150 geometries, −26 textures at race start |
| **`tests/farm-flow-browser.js` with the park switch on** | **passed** | 74 / 0 failed | |
| `tests/perflab-browser.js` (new) | **passed** | 47 / 0 failed | final run. During development of the test: run 3 = 44 / 3 failed and run 4 = 46 / 1 failed; all were harness expectations (storage keys AUTO legitimately writes, the character getter being under `_test`, the benchmark-cancel timer needing real time) plus **one real bug fixed**: pausing during a benchmark did not cancel it (the pause screen draws no frames, so no frame hook ran) |
| `tests/race-hygiene-browser.js` (new) | **ran at 3 builds** | 32 pass + 4 expected fails (working tree and pristine HEAD, identical); 18 / 0 failed at `5139a6f` (+ 2 "afterfarm" runs **blocked**: no farm in that build) | the 4 fails are the afterfarm-chase mechanism row above (they are findings, not regressions; `INFO=1` keeps the exit code 0). First attempt aborted when a second page load hung (software GPU process left busy): fixed with a fresh browser per run |
| `tools/smooth.js` before / after (F8 off) | **run** | 4 conditions × 2 before + 2 after | no measurable overhead (see above) |
| `tools/bench.js`, `smooth.js`, `auto-quality` at `5139a6f` / `49aaed3` / HEAD | **run** | | none **blocked**: every corrected tool ran at all three builds (the one "blocked" item is the hygiene afterfarm scenario at `5139a6f`) |
| Tier 3 full suite, `career-browser`, phase 6–11, 13, 14 browsers, `presentation`, `voice`, `eleven`, commentary, all multiplayer | **not run** | | deferred (see below); multiplayer disabled by design |


#### Deferred (Tier 3, and why)
Nothing in 15A touches race physics, results, `sim.js`, horse attributes or difficulty. The change set is diagnostics plus guarded one-line hooks in `gfx.js`, `commentary.js`, `farm.js` and the frame loop, all inert by default. Per the Testing policy the **Tier 3 full suite was therefore deferred** (not run): `career_difficulty.js`, `progression.js`, `economy.js`, `development.js`, `field/chaos/avoid/pileup/pushfall`, `randwick/flemington`, `commentary*`, `eleven-*`, `phase6–14` cores and browsers, `career-browser`, `presentation-browser`, `voice-browser`. Multiplayer tests: not run, multiplayer disabled by design. A Tier 3 run belongs to 15C/15D, when a fix touches `gfx.js` / the race path for real.

#### Next investigation steps
1. **15B (partly done):** one device (Apple M2, Chrome) has reported; see "15B first real-device round" below. More devices and the raw report files would still help (the original report said several devices).
2. If AUTO off / race-only removes the hitches → 15C "AUTO feed" row of §2.4. If parked helps → the "park farm on race entry" row. If neither, if hitches carry `jsPrev` small → GPU / compositor / host: look at the Chrome trace and condition E. If JS-heavy → add the per-section timers from the §2.1 menu **one at a time**.
3. Still open from the roadmap §2.3: the CDP allocation profile (the 9.5 → 12.2 MB/s rise, which survives the corrected tools), and the ten-different-fields geometry-cache growth check.
4. The `renderer.info` count of 24 texture uploads per frame at every build is worth a look if the GPU trace points at uploads (candidate: skinned-mesh bone textures; not verified).

#### Publishing
See the closing message of the session for the artifact version. No historical comparison build (`5139a6f`, `49aaed3`, HEAD) has been published: that needs the owner's approval first.


### 15B first real-device round: Apple M2 MacBook, Chrome (owner's reports; evidence in `docs/perf-evidence/`)

**Evidence preserved:** `docs/perf-evidence/2026-11-25_apple-m2-chrome_owner-summary.md` holds the owner's figures exactly as given. The raw Shift+F8 `report.txt` files were not pasted into the session, so they are not in the repo yet; drop them into that folder unedited when available.

**What the owner observed**
- Battery, three benchmarks (artifact, the same HTML opened directly, AUTO lab = Off): all "30 Hz", 33.3 ms median. Racing looked jerky.
- Chrome on this MacBook ran at about 27 fps on battery and reached 60 fps immediately when plugged in; unplugging during a Final Furlong race degraded it visibly and reconnecting restored it.
- Plugged in, defaults, 60 s benchmark: 3,593 frames (59.9 fps), 99.89 % on time, median 16.7 / p95 16.8 / p99 17.5 ms, 4 hitches (one of 99.2 ms), 3 AUTO changes. The 99.2 ms hitch coincided with an AUTO step-up to render ×2 and about 101.6 ms of JavaScript in the preceding frame.

**What this establishes (on this device)**
1. **The continuous ~30 fps was the machine's power state, not the game.** The same page, same build and same race run at 60 fps plugged in and at ~27–30 fps on battery, and toggling the charger toggles it live. It is not the artifact host (the direct HTML was identical), not racing physics, and not a fixed frame cap: `frame()` is the only `requestAnimationFrame` loop and has no frame skipping or limiter. (What Chrome / macOS does on battery, such as Energy Saver or Low Power Mode, is not visible from JavaScript; it was not isolated further.)
2. **The 15A instrumentation misjudged that situation** (see Known limitations): a steady 30 fps read as a "30 Hz display" with 100 % on-time. Tests under a faked power cap cannot be built here.
3. **AUTO graphics sinks to its floor under a throttled cadence and keeps it.** Headless, with synthetic 33.3 ms frames: level 9 (render ×1.0, shadows 1024, far horses simpler) is reached in 20 s and written to `ff_autoLevel`; with the cap lifted (simulated clock) it takes about 207 s of healthy frames to climb back to level 0, one step every 12 s after a 60 s back-off. The owner's "normal" battery runs were therefore at the floor (canvas 1× / shadows 1024), and the AUTO-Off run (fixed High = 2× / 4096) compared the floor with High, so it was not a controlled test of AUTO scheduling.
4. **A mid-race AUTO step-up cost a visible hitch.** Each AUTO change calls `applyQuality()`: `renderer.setPixelRatio()` (which calls `setSize`, assigning `canvas.width/height`), then `resize()` (assigning them again: two drawing-buffer reallocations, checked in the three.js r128 source), plus a shadow-map dispose and re-create. The one measured instance was 99.2 ms with ~101.6 ms of JS. This is the first real-device confirmation of the "AUTO changes mid-race" suspect, as an event; its share of all hitches is unknown. After a battery session leaves AUTO at the floor, the first plugged-in races climb back up in steps **during the race**, which is when the owner saw 3 changes in 60 s.

**What it does not establish**
- Whether the owner's other devices (the original report said "several") had the same cause. Only one device has reported.
- What caused the other three hitches in the plugged-in run (not attributed; the report with their event lists is needed).
- The cost split of the 101.6 ms between the two reallocations, the shadow map and the next frame's GPU work: not measured.
- Whether Safari / other browsers behave differently: not tested.

**Acceptance gate (ROADMAP §2.5) against the plugged-in benchmark, one device:** on-time ≥ 99 % **met** (99.89 %); no frame > 50 ms **not met** (99.2 ms); hitches ≤ 1 per minute **not met** (4 per minute); AUTO/applyQuality changes after 3 s = 0 **not met** (3). The stutter is **not** declared fixed; the owner reports the race looks smooth only when plugged in, and 15C is meant to remove the remaining mid-race reallocation hitch.

### Phase 15C proposal (approved by the owner for C1 only; implemented, see the 15C report at the end of this section)

**Goal:** no expensive AUTO reallocation during an active race, with no change to default quality, graphics detail, race physics or `sim.js`.

**Recommended smallest change (C1), `gfx.js` + one argument in the `frame()` call:**
- Tell `GFX.autoTick` whether a race is *live* (`ui.state === "racing"` and `race.state` is `running` or `done`: gates open until the results screen). Pre-gate (`load` / `count` / parade), replay, results, pause, farm and menu frames are *not* live.
- **While live, an AUTO decision is not applied.** An up-step (headroom) is queued as `AUTO.pending` and AUTO makes no further decisions until it is applied. A mild down-step (median 19.5–28 ms) is queued the same way.
- **Exception, unchanged behaviour: a severe down-step** (median over 28 ms, under about 36 fps) still applies immediately, because a struggling device needs relief now.
- **Apply points:** the first non-live frame (results screen, pause, replay, menu or farm), and explicitly at the start of `startRace()` before `renderer.compile`, so a pending change lands behind the loading gates, not under a running field.
- **`ff_autoLevel` is written only when a level is actually applied** (no storage write during a live race either).
- Nothing else changes: thresholds, steps, the 60 s back-off, level contents and the stored-level semantics stay as they are. `settings.quality` presets other than AUTO are unaffected.

**Why only this:** it removes the one hitch the owner measured (an up-step to ×2) and the other two mid-race changes in that run, without touching what AUTO considers good quality. Because most climbing back up happens on the farm and menu (farm and menu frames feed AUTO), the level recovers between races. If a device is cap-limited and only ever steps down mildly, it gets one queued change per race instead of one hitch.

**Optional, to decide after measuring, not part of C1:**
- **C2, halve the cost of every change:** `applyQuality()` currently resizes the drawing buffer twice (`setPixelRatio` then `resize()`); skipping the redundant second assignment when the size is unchanged would cut the cost of each change (which still happens between races). Needs a before / after timing on the owner's Mac; I would not do it blind.
- **C3, measurement honesty (report-only, no behaviour change):** rename "display refresh (detected)" to "frame cadence achieved", add a loud line when the cadence is far below 60 Hz, base on-time and the hitch threshold on a display rate that is not inferred from a throttled cadence (assume ≥ 60 Hz unless a 3 s idle `requestAnimationFrame` probe says otherwise), and add the battery state (`navigator.getBattery()`), so a power-throttled run can never again read as "100 % on time". Also the "AUTO: freeze at the current level" lab mode for a controlled AUTO comparison, and the AUTO level at benchmark start / end in the report.
- **Not recommended now:** deferring mild down-steps is already in C1; changing the AUTO feed (farm frames), the ratchet / climb rate, wider hysteresis and other §2.4 rows wait for evidence from more devices.

**Verification plan for C1 (before anything is called done):**
- `tests/race-hygiene-browser.js` "afterfarm" run: the current baseline shows 1 `applyQuality`, 1 `setPixelRatio`, 1 `localStorage` write and 1 AUTO change after the gates (chase camera). After C1 those clean-second counts must be 0, and the pending change must appear after the race.
- `tests/auto-quality-browser.js` extended: a queued change is not applied while live; a severe slowdown still applies at once; the queued change applies at the next safe point and is then persisted once; the physics-independence check (identical finish order and times at levels 0 and 9) stays green.
- Because `gfx.js` and the race frame loop are touched, the **Tier 3 full suite is required** (race physics itself is not touched), plus the single-file build and `scenes` / `farm-flow` runs.
- Owner, plugged in, from a stored low AUTO level (the state a battery session leaves): benchmark twice. Expected: zero AUTO changes between the gates and the finish, no frame over 50 ms caused by `applyQuality`, hitches per minute at or below 1. Then the real-career condition B. **Subjective sign-off by the owner stays the gate.**

**Not touched by C1:** `sim.js`, race physics, horse models, commentary, the farm, default quality, or the stored `ff_autoLevel` value semantics.

After 15C is reviewed, built and verified, the roadmap resumes with **Phase 16 (review stabilisation and farm render headroom)**; nothing of Phase 16 has been started.

### Phase 15C report: AUTO graphics never reallocates during a live race (C1 only)

The owner asked for a minimal fix and no further profiling. Only C1 was built; C2 (second buffer reallocation) and C3 (report-only honesty, AUTO freeze mode) were **not** built and stay on the list.

**What changed (`public/gfx.js`, one argument and one call in `public/index.html`, F8 / report text)**
- `GFX.autoTick(dt, active, raceFrame, live)`: `live` is `ui.state === "racing"` with `race.state` `running` or `done` (gates open until the results screen). Load, count, parade, replay, results, pause, farm and menu frames are not live.
- While live, an AUTO decision (a headroom up-step or a mild down-step) is **queued** in `AUTO.pending` instead of being applied: no `applyQuality()`, no `setPixelRatio`, no drawing-buffer or shadow-map reallocation and **no `ff_autoLevel` write**. A later mild slow-down replaces a queued up-step; nothing else replaces a queued change.
- **A severe slowdown (median over 28 ms, under about 36 fps) is still applied at once**, as before.
- A queued change is applied at the first frame that is not live (results, pause, replay, menu, farm) and explicitly at the start of the next race (`GFX.applyPending()` in `startRace`, before `renderer.compile`, behind the loading gates).
- A fixed graphics preset, or the lab's AUTO "off", discards a queued change and never applies it.
- Thresholds, step contents, the 60 s back-off, default quality, the stored-level meaning, `sim.js`, physics and all gameplay are unchanged. F8 and the report show a queued change ("QUEUED until after the race").

**Tests (all run on the working tree, none needed a rerun)**
| Test | Result |
|---|---|
| `tests/auto-quality-browser.js` (6 new checks: up-step queued with 0 `setPixelRatio` and 0 storage writes; applied once at the first non-live frame; mild slowdown queued; severe applied at once; applied at race start in state `load`; a fixed preset discards it; the physics-independence check, identical finish order and times at level 0 and 9, still passes) | **passed**, 18 / 0 failed |
| `tests/race-hygiene-browser.js` "afterfarm", chase camera, the case that showed the problem (before: 1 `applyQuality`, 1 `setPixelRatio`, 1 `localStorage` write, 1 AUTO change after the gates) | **passed**: all clean-second counts **0**, AUTO level 1 → 1; "quick" chase also 0 everywhere. 18 / 0 failed |
| `steering` / `start` / `replay-lunge` | passed, 70 / 8 / 9 |
| `career-core`, `single-browser` (after `build-single`, 8,959 KB) | passed, 128 / 8 |
| `scenes-browser` | passed, 38 (10 trips, no growth) |
| `phase12-browser` (lighting / weather) | passed, 24 |
| `presentation-browser` (parade, winner presentation) | passed, 11 |
| `longrace-browser` | passed, 5 |
| `perflab-browser` (the 15A diagnostics) | passed, 47 |
| `tools/smooth.js` Randwick chase + jockey, 60 + 144 Hz | horse speed (17.75 / 17.43 m/s), stalls (0), draw calls (222 / 231 / 202 / 247) identical to before; update p50 0.4 ms, one noisy 0.75 ms outlier at jockey 144 Hz; allocation 11.4–13.2 MB/s as before |

**Deferred, and why:** the Tier 3 full suite (race-engine node tests, `career_difficulty`, `progression`, `economy`, commentary and phase 6–14 suites). The change is presentation-only: `sim.js` is byte-identical (`git diff 5139a6f HEAD -- public/sim.js` is empty), the physics-independence check passes, and the owner asked to avoid heavy test runs for small changes. My own 15C proposal said Tier 3 was required because `gfx.js` is touched; I am recording this as a deliberate departure at the owner's request, not as a pass. It can be run at any time.

**Limits:** headless counts show the *mechanism* is fixed (no reallocation after the gates); they say nothing about how it feels. The check that matters is the owner's: plugged in, from a stored low AUTO level (after a battery session), a benchmark and a career race. Expect no AUTO change between the gates and the finish, and no 99 ms hitch from a quality step. The first race after a long battery session will still start at the lowered level and climb between races (most of the climb happens on the farm and menu), not mid-race.

### After 15C on the owner's Mac, and the Medium / race-tree changes (this section is the record for them)

**15C result (owner, Apple M2, Chrome, plugged in, artifact v21):** 3,524 frames in 60 s (about 58.7 fps), 97.93 % on time, 73 late frames with an 83.3 ms maximum, **zero AUTO changes during the race**, full quality (then AUTO level 0 = ×2, 4096 shadows). Recorded in `docs/perf-evidence/` and the measurements log. **The remaining occasional uneven frame pacing is kept as a non-blocking performance concern** (not investigated further, as agreed; it is to be re-examined only if it persists in normal plugged-in play). The stutter is not declared fixed; the owner's judgement is "much better".

#### Medium is now the maximum graphics quality (`gfx.js`, `index.html`; owner request)
- The **High preset is removed** from the settings screen and from `GFX.QUALITY`. Graphics quality now offers **Medium (best, recommended)**, **Auto (adapts, never above Medium)** and **Low**.
- **Default is Medium** for new players (nothing is written until they change something).
- **Migration:** a saved `high` is changed to `medium` once and saved as Medium; an unknown value becomes Medium; saved `auto` and `low` are kept. The crowd and camera settings and the career save are untouched (tested). An existing player who never touched the setting (so no stored key) also starts on Medium.
- **AUTO never exceeds Medium:** the `auto` preset's content settings are exactly Medium's (render ×1.5, 2048 shadows, crowd 0.6, trees 0.7). The AUTO step table was rebuilt as **9 levels that only ever simplify below Medium** (crowd → trees → scenery → shadow 1024 → render ×1.25 → … → ×1.0 → far horses). The old table had levels (render ×1.75, shadow 2048) that Medium's ceiling would have turned into no-op steps. Stored `ff_autoLevel` values keep roughly the same severity; an old level 9 is out of range and simply starts at 0. A stale `"high"` set by a script or a test falls back to the Medium ceiling. Checked for every level of Auto / Medium / Low and for the lab's "off" (fixed top level) in `auto-quality-browser`.
- The hidden lab's AUTO "off" now means "fixed at the top level (Medium)".
- **Not changed (decision for the owner):** the separate **Scenery detail** (High / Medium / Low, default High: lawn spectator density 42 % vs 25 %) and **Crowd density** settings are content-density options, not render quality, and still offer their own levels.

#### Racecourse trees: lighter, leafier canopies (race scenes only)
- **Farm trees and the farm's palms are untouched:** no `farm*.js` file changed, `GFX.treeGeo` is unchanged (the farm's palms use it), and `farm-browser` gives identical draw-call and triangle figures old vs new (e.g. courtyard 163 calls / 239k tris; 34 / 34 passed).
- **Old:** each gum / fig / plane / cypress was 4–9 separate noise-displaced spheres (about 600–700 triangles near, 140–180 far) drawn in one instanced mesh per species and cell, also cast into the shadow map.
- **New** (`plantTrees` in `gfx.js`; palms keep the old path): a bare trunk and limbs plus **one shared canopy clump** (56 triangles near, 20 far, opaque, front faces only, a 128² leaf texture of 64 KB, no alpha or transparent layers).
  - **Near LOD:** 3–5 instances of the shared clump per tree as ONE instanced mesh per cell, attached as a *child of that cell's near-LOD trunk mesh*, so it is drawn and casts its shadow exactly when the near LOD is. Each clump has its own scale (so its shape), yaw, tilt and colour tint; the species set the layout, size and hue (open grey-green gum with the canopy on the limb tips and the leaning trunk top, broad dark fig, round plane, tall narrow cypress). The gum limbs now attach to the leaning trunk (the old ones floated about 4 m off it, hidden by the blobs).
  - **Far LOD (almost every tree on screen):** the trunk and a baked set of clumps in ONE geometry with the plain tree material: one draw call per species and cell, as before.
  - First version: a separate canopy mesh set per cell gave **+6 % draw calls**; this version removes that by baking the far canopy (the owner's follow-up).
- **Appearance:** same species, positions, counts (Medium keeps 70 % of the trees as before) and colours family, but visibly leafier and more irregular; colours were tuned to the old palette by eye on screenshots. Not pixel-identical (the random stream shifts per tree).
- **Measured, Medium, same cameras, original `10922d2` vs final, alternating runs, 800 × 450, software GL (SwiftShader):**

| View | Draw calls (original → final) | Triangles incl. shadow pass | Tree triangles | 
|---|---|---|---|
| Randwick, chase | 286 → 294 (+2.8 %) | 599k → 559k (−6.7 %) | |
| Randwick, trackside at the densest trees | 450 → 460 (+2.2 %) | 749k → 704k (−5.9 %) | 57.9k → 32.3k (**−44 %**) |
| Flemington, chase | 277 → 277 (0) | 543k → 523k (−3.6 %) | |
| Flemington, trackside | 489 → 488 (−1) | 546k → 525k (−3.8 %) | 50.0k → 31.5k (**−37 %**) |
| Country A, chase | 148 → 152 (+2.7 %) | 413k → 399k (−3.6 %) | |
| Country A, trackside | 150 → 152 (+1.3 %) | 299k → 289k (−3.5 %) | 21.6k → 13.5k (**−38 %**) |

  GPU objects (geometries / textures / shader programs) Randwick 527–580 / 107–124 / 47–48 → 595–596 / 125 / 49 (one leaf texture and one canopy program added; geometries are per-cell views of the two shared clump meshes). Flemington 638 / 120 / 50 → 650 / 121 / 51. The earlier all-separate-canopy version added 18–23 draw calls on Randwick; batching the far trees brought it to +8–10.
- **Frame time (stated plainly):** headless software rendering cannot resolve this change. The CPU render-submit time on the chase camera is the same within noise (about 3–5 ms before and after). The synchronous raster time from fixed poses, repeated twice per build, moved −10 %, +22 %, −26 %, −27 %, +35 %, −1 % between the six view pairs, and two repeats of the *same* build differed by 15–40 %, so **no FPS gain or loss is claimed**. What is solid: fewer triangles (−3.5 to −6.7 % overall, −37 to −44 % for trees), draw calls within +3 %, no new transparency. The check that counts is the owner's, on the M2, with the benchmark.

**Tests for this change (focused, as the owner asked; the full regression suite was stopped part-way and is not claimed):** `auto-quality-browser` 24/24 (incl. 6 new Medium-ceiling / migration / settings-UI checks); `career-core` 128/128, `single-browser` 8/8, `steering` 70/70, `start` 8/8, `replay-lunge` 9/9, `farm-browser` 34/34 (new and old), `phase11-browser` and `phase12-browser`, `presentation-browser` 11/11 ran green on the first draft of the canopy; the final-version re-run is listed in the closing message. **Not run:** the full Tier 3 suite, `scenes`, `farm-flow`, `race-hygiene`, `perflab` and `longrace` on the final code (the queue was stopped at the owner's request); the perf-lab and hygiene tests were updated for the new default preset but not re-run.

### Owner measurement protocol for the 15A diagnostic build (conditions A, B, D, E, F, G of `ROADMAP_P15.md` §2.2)

**What you need:** a desktop or laptop browser (Chrome preferred: it has the traces and `chrome://gpu`), the diagnostic build in the claude.ai artifact (the existing link, new version) and, for condition E, the same build as a file (`final-furlong-single.html`) opened in its own tab.
Keys: **F8** = overlay · **Shift+F8** = report, lab and benchmark (on a laptop you may need **Fn+F8**). Do not change Settings → Graphics: leave the game exactly as you normally play it.

**Naming (use this for every file):** `<device>_<browser>_<condition>-<run>_<what>.<ext>`
- `<device>`: a short name, e.g. `macbook-air`, `desktop-4070`, `ipad` (say the display refresh rate once in a `<device>_notes.txt`: model, OS, browser version, Hz).
- `<condition>-<run>`: `A-1`, `A-2`, `B-1`, `D-golden-1`, `E-tab-1`, `F-auto-off-1`, `F-parked-1` …
- `<what>`: `report.txt` (the pasted report), `overlay.png` (screenshot of the F8 overlay), `frames.png` (Frame Rendering Stats screenshot), `trace.json` (zipped if large), `gpu.txt` (`chrome://gpu`).
- Put one line at the **top** of every `report.txt`: `FEEL: smooth | slight stutter | bad stutter — where (e.g. "first bend", "home straight", "all the time")`.

**How a benchmark run works (conditions A, D, E, F, G)**
1. **Reload the page** (a fresh load; do not open Career or Quick Race first). Wait for the main menu (the farm is the background).
2. Press **Shift+F8**. Check the switches are as the condition says (the report line "LAB switches" says "all defaults" for a normal run). Pick the **Look**.
3. Click **Run now (straight after launching)**, or **Run after 60 s on the farm** where the condition says so. Take your hands off the keyboard: a fixed race (Royal Randwick, 1,600 m, 12 runners, same seed, chase camera, every horse ridden by a bot) is run and measured for **60 s after the gates open**. The menu comes back by itself and the report appears.
4. Click **Copy to clipboard** and paste into a text file. If it says the clipboard is blocked, the text is already selected: press **Ctrl+C** (Cmd+C on a Mac). Add the `FEEL:` line on top and save it with the right name.
5. Run every condition **twice** (each time from a fresh load).

| # | Condition | Exactly what to do | Files |
|---|---|---|---|
| **A** | Baseline | Benchmark "Run now", defaults, look *Afternoon · clear*. Twice. Then once with **Run after 60 s on the farm**. | `A-1`, `A-2`, `A-farm60-1` `report.txt` |
| **B** | Your real path | Fresh load → **tick "Record frame stats without the F8 overlay"** in Shift+F8 → Career → walk the farm about **3 minutes** → book a race → **K** to skip the routine → ride the race normally → on the results screen press **Shift+F8**, copy. Twice. | `B-1`, `B-2` `report.txt` |
| **D** | Phase 12 looks | Benchmark "Run now" for each of: *Afternoon · clear*, *Golden hour · clear*, *Afternoon · rain*, and *Golden hour · clear* with **Race lighting = Forced afternoon-clear**. | `D-afternoon-1`, `D-golden-1`, `D-rain-1`, `D-golden-forcedclear-1` (and `-2`) |
| **E** | Artifact vs own tab | Condition A on the **same device, same hour**: once in the claude.ai artifact, once with the attached `final-furlong-single.html` opened directly in a new tab (File → Open, or drag it into Chrome). Alternate: artifact, tab, artifact, tab. | `E-artifact-1/2`, `E-tab-1/2` |
| **F** | Isolate the suspects | Condition A, changing **one** switch at a time: **AUTO graphics = Off**; **AUTO = Race frames only**; **Farm GPU = Temporarily parked**; then **AUTO off + parked**. Also repeat *Run after 60 s on the farm* with AUTO = Race frames only and with Farm GPU parked. | `F-auto-off-1`, `F-auto-race-1`, `F-parked-1`, `F-both-1`, `F-farm60-auto-race-1`, `F-farm60-parked-1` |
| **G** | "It used to be smoother" | After you approve the historical builds (`5139a6f`, `49aaed3`, HEAD), play a Quick Race the same way on each and send the F8 overlay screenshot at about 30 s into the race, plus how it felt. These builds only have the original F8. | `G-5139a6f-overlay.png`, `G-49aaed3-overlay.png`, `G-head-overlay.png` |

**Reset between runs:** press **Reset all to normal** in the lab after each F-run. Reload the page between runs.

**If you can only do a few, do them in this order:** A (×2) → F-auto-off → F-parked → A-farm60 → B → D → E → G.

**Extra evidence, once per device (for the worst case you see):**
1. **Chrome trace.** Open DevTools (F12, or Cmd+Option+I) → **Performance** tab → tick **Screenshots**. Start a benchmark run (A procedure), and **about 20 s after the gates open** click the round **Record** button; stop after **15 s**. Click the **Save profile** (down-arrow) icon → `<device>_chrome_<condition>_trace.json`. (It can be large: zip it.) DevTools being open slows the page a little, so also keep a normal run of the same condition.
2. **Dropped frames.** DevTools → **⋮** → More tools → **Rendering** → tick **Frame Rendering Stats**. Take a screenshot about 30 s into a benchmark race → `<device>_chrome_<condition>_frames.png`.
3. **`chrome://gpu`.** Open it in a new tab, press Ctrl+A, Ctrl+C and paste into `<device>_chrome_gpu.txt` (or take a screenshot of the "Graphics Feature Status" list).
4. **F8 overlay screenshot** (with the frame graph) in the middle of one race, with F8 on: `<device>_<browser>_<condition>_overlay.png`. F8 itself costs a little, so keep this to one run.

**What to send back:** all the `report.txt` files, the `gpu.txt`, one `trace.json`, one `frames.png`, one `overlay.png`, and `<device>_notes.txt`, with a line on which condition felt worst.

