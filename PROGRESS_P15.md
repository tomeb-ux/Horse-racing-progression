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

**Tests for this change (focused, as the owner asked; none needed a rerun), on the final code:** `auto-quality-browser` **24/24** (18 AUTO checks incl. the 15C queue + 6 new: Medium is the maximum for every level of Auto / Medium / Low, a stale "high" and the lab's fixed level; new players start on Medium; a saved High migrates to Medium with other settings and the career save kept; the settings screen offers no High); `single-browser` 8/8 (after `build-single`, 8,970 KB); `steering` 70/70; `start` 8/8; `phase11-browser` 11/11 (the country venues, which use the new trees); `phase12-browser` 24/24 (lighting and weather). Earlier on the first draft of the canopy (the farm and shared code were not touched afterwards): `career-core` 128/128, `replay-lunge` 9/9, `presentation-browser` 11/11, `farm-browser` 34/34 on both the old and new builds with identical budgets.
**Not run on the final code (the full regression queue was stopped at the owner's request):** the Tier 3 full suite, `scenes`, `farm-flow`, `race-hygiene`, `perflab`, `longrace`, `career-browser`, and the commentary / phase 6–10, 13, 14 suites. `race-hygiene-browser.js` and `perflab-browser.js` were edited to select the Auto preset explicitly (the default is now Medium) but have **not** been re-run since.

### Phase 16: farm draw-call headroom and a regression sweep

**Goal.** Give the farm rendering headroom (it was the busiest scene: 250 main-pass draw calls in the overview) without changing how it looks, and re-run the farm-facing tests after the Phase 15 work.

**What changed (rendering only).** `farm-ground.js`: the instanced scatter (grass tufts, flowers, stones, shrubs) is chunked into larger cells (120/120/180/90 m instead of 90/90/120/60 m) and its near-LOD radius is 46 m. Fewer, larger cells means fewer instanced draws; the same instances are drawn. `farm.js` gains `FARM.shadowStats()` (counts the sun's shadow pass, which `renderer.info` does not include). `tests/farm-browser.js` budget: `worstCalls <= 210` (was a looser figure).

**Measured (SwiftShader counts; these are COUNTS, not FPS: software GL timings say nothing about a real GPU).**

| view | main-pass draw calls before | after | triangles |
|---|---|---|---|
| overview | 250 | 201 | +8-9% (more of the scatter is in the near LOD) |
| courtyard | 163 | 130 | +8-9% |
| training oval | 179 | 146 | +8-9% |

The shadow pass is separate: about 127 extra draws in the overview, not part of the table (the budget test does not count them either; `FARM.shadowStats()` does). I did **not** measure frame time on a real device for this change, so I make no FPS claim for it.

**Decision for the owner.** A "Scenery detail" cap (fewer scatter instances on Medium) would lower the count further but visibly thins the grass. I did **not** apply it. Say if you want it.

**Regression sweep (this commit's queue).** farm-browser, farm-flow, phase6, phase8, phase9, phase13, scenes, phase12: all exit 0 (single run each, no reruns needed).

**Career bug sweep.** No new defects were found in the Phase 9-14 career rules by the existing core suites (career-core 128, phase9-core 44, phase12-core 36, phase6-core 43, phase8-core 37 all pass). I did not run a long playthrough: the sweep is test-based, not exploratory.

### Phase 17: the farm clock and the daily schedule

**What you see.** The farm now has a time of day: **05:30 → 19:00 in about ten real minutes**, shown in the HUD next to the weather ("07:42 · Overcast"). The light follows it (sky, sun, fog, exposure blend between the existing time-of-day looks; the environment map steps to the nearest one). Horses are no longer parked in their boxes all day: at the times the schedule says, a **stable hand opens the box, leads the horse on a rope across the yard to its paddock gate and lets it go**; later a hand walks into the paddock, clips the rope on and **brings it back and shuts it in**. Two hands do this (the existing one plus a second). Inspect on a horse shows a **Today** line (where it is now, trackwork, paddock times, why it is kept in). The farm map shows horses where they actually are and the farm time.

**It never rushes you.** The clock runs only while you are free outdoors. It holds during any panel or the map, a lead, a drill, the house, a trip, the pause menu, race-day activity and while the pause menu is open. It never advances the calendar: the day ends only when you end it. The pause menu has **Farm clock: Normal / Slow / Paused**, **Skip to the next activity** and **Skip to the evening** (the clock only moves forward). At 19:00 it stops and says so. On race day the farm keeps the race's own time of day and shows no clock (the stable stays quiet).

**Where the schedule comes from (`CORE.farmDay`, pure, tested).** Nothing about the day is stored. It is derived from the career: training plan and intensity, soreness, a booked race (race day and the day before: the booked horse stays in), heavy rain (kept in), light rain (short turn-out), age (youngsters out for less, veterans for longer), a horse that raced yesterday (longer turn-out), paddock = horse number mod 3, and a 15-minute stagger per horse. `CORE.sessionFor` replays exactly the rule `autoDay` used to decide whether a session ran, so the picture and the career never disagree.

**Rules for the player.** Staff act at transitions only (a horse becoming due out/in). A horse you are leading, a horse you turned out or brought in by hand and a horse in a drill are left alone until that horse's schedule changes. Only turn-outs you make by hand are saved with the career (as before); the staff's turn-outs are derived again when you come back. Starting a drill with a horse that is out on trackwork or with a hand calls it back to its box first. Entering the farm, or skipping, snaps every horse to what the schedule says and cancels any half-finished job.

**Not changed.** `sim.js`, racing, Career rules, Quick Race, Chaos, saves (the running clock lives in memory only: it is never written into the career, so walking about or scene changes never edit your save; reloading the page starts the farm day at 05:30), lighting at the racecourses and the existing farm care actions.

**Behaviour change to flag.** The farm's time-of-day used to be a seeded draw per calendar day; it now follows the farm clock (every day opens at dawn), so `phase12-browser` 'ordinary farm days differ' now requires 4 looks in 40 days instead of 8 (weather still varies). Race lighting is unchanged.

**Tests.** `tests/phase17-core.js` (46 checks on the pure schedule, clock and the atmosphere blend) and `tests/phase17-browser.js` (clock start, advance, holds on map / lead / Paused, Slow at half speed, skips, a full turn-out job with door, rope and paddock, a full bring-in, the player-is-never-overridden rules, race day, new day, leave and return).

### Phase 18: morning trackwork, cool-down, the horse walker and the wash

**What you see.** A horse that has a training session today (the same rule the calendar used when the day began: `CORE.sessionFor`) is no longer sitting in its box while it "trains". About 06:15 (staggered 15 min per horse) the box opens, a **work rider is up** (the horse's own jockey mesh, shown), it is ridden to the exercise oval, does **one lap** (light: a light canter; normal: a steady canter; hard: a steady canter with a quicker last 120 m), is ridden back to the courtyard and the rider hands it over. It is **steaming** (a few soft puffs above the back) and a stable hand **cools it out**: led once round the courtyard on a rope, or, once the **Recovery facility is level 1 or more, on the horse walker** (a post with 2/3/4 arms at level 1/2/3 that turns while the horse circles on it). Then the hand leads it to the **wash bay** and washes it, and it goes back to its box. Inspect shows where the horse is in that sequence and, afterwards, **"Work this morning: one lap in 54.2 s"** (the trainer's stopwatch).

**No new rewards.** This is presentation of what the calendar already did. Nothing here edits the career (the test compares the career data before and after a whole morning). Staff care rewards stay exactly as `CORE.staffDaily` defined them; the wash the hand gives is not the player's wash and gives no composure.

**Rules.** The hands are the same two that do turn-out; if both are busy the horse waits at the courtyard for one. A horse you start leading is released from its job. Skipping into the work window puts the horse straight onto the oval; skipping past it puts it in its box. Horses with no session (rest plan, Sunday, sore, race taper, too tired) never leave their boxes for work.

**Known simplifications.** The oval is one lap at constant speeds (no timing against anything); the stopwatch is a time reading in Inspect, not a prop; the horse walker stands in the courtyard at a fixed spot; sweat is shown as steam only (the coat does not darken).

**Tests.** `tests/phase18-browser.js` (31 checks: the whole morning stage by stage, canter speed, steam, hand takes over, wash, back in the box, career data unchanged across the morning, the walker built at Recovery 2 and its arm turning, skipping in and out of the work window).

**Test status at this commit (honest list).** Passed: phase17-core 46, career-core 128, phase12-core 36, phase9-core 44, phase17-browser 43, phase18-browser 31, phase13-browser 23, phase8-browser 26 (its 'hand' count test was updated for the second hand), scenes-browser 38, farm-flow-browser 74, farm-browser, phase9-browser, single-browser 8. **Flaky, and it predates Phases 17-18 (corrected):** `phase6-browser` 'sprint rhythm' (the sprint drill's result is read after the drill has already dismounted). I first blamed the farm clock; that was wrong: the Phase 16 commit `745e600`, with no farm clock at all, fails the same check in 4 of 5 runs. It is a test-timing problem in the drill result read, not caused by trackwork. Not fixed. `phase12-browser` 'the rain costs one draw call' fails intermittently (25 extra calls) on the Phase 16 commit as well (1 of 3 runs there), so it predates this work.



### Phase 19: the hands-on care loop (optional)

**What you see.** At the wash bay the wash is no longer a timer: **E** starts a rinse loop with five regions (neck, shoulder, barrel, hindquarters, legs). Choose a region (**A/D**, **1-5** or click), **hold Space** (or the on-screen button) and a spray of water runs from your hand to that part of the horse; each region takes about a second of holding; finishing the last one completes the wash. The groom in the box menu is the same with brushing (neck, back, belly, rump, legs). At every step you can **press Enter to hand it to a stable hand** (done at once) or **Esc to leave it for later** (nothing lost). When a wash or groom is done, a short **post-work card** shows what the horse has had today, how much it recovers overnight and what is still on offer; the same lines are in the Inspect card.

**No balance change.** The rewards are the unchanged `CORE.wash` (+3 composure, +1 fitness) and `CORE.groom` (+4 composure), once per horse per day, whoever does them (you, the hand-over, or the groom's daily routine). `CORE.postWork` is read-only (it does not even create the care record). Skipping costs exactly the edge it lists. Care touches composure and fitness only, so doing the loop daily or never gives identical attributes after 30 days (tested).

**What I did not do.** The wash does not darken or wet the coat (no material clones, so nothing to leak); the sweat/steam from trackwork is the visual. The groom has no sheen. The cool-down walk is the Phase 18 routine or your own lead; it is not a scored step. No feeding mini-game, no farrier/vet interactions (deferred in the roadmap).

**Test status at this commit.** Passed (single run each unless noted): phase19-core 11, phase19-browser 21, career-core 128, farm-flow 74, phase8 26, farm-browser, phase17-browser, phase18-browser, phase13, phase9, scenes, single-browser 8, phase6 (2 of 3 runs; the failing one is the pre-existing 'sprint rhythm' flake). `phase6-browser` now hands the groom over with Enter.

**Tests.** `tests/phase19-core.js` (11) and `tests/phase19-browser.js` (21: the full wash by hand region by region, held-time progress, Esc and Enter at every step, the groom, the post-work card, five loops leave nothing behind, no page errors). `phase8-browser` now hands the wash over with Enter.

### Phase 20: horse behaviour and the trot

**Added.**
- **A trot** (`PRESENT.animateTrot`): a two-beat diagonal gait (front-left with hind-right, then front-right with hind-left, stance 46 %), a springier body, the head steadier, the rider posed to match. A `jig` option makes a keen horse jog on the spot (shorter, higher, head up, tossing). Used by: the parade (a keen horse, `eager` above about 0.55, now jig-jogs round the ring while the others walk), the work rider taking a horse out to the oval (Phase 18), and available to anything else.
- **Blowing** after the race: the winner's walk-back breathes hard (flank heave, nodding head) and settles over about 14 s.
- **Farm behaviour** (`public/farm-idle.js`, farm only): each horse has a small random event machine whose odds come from its own temperament attribute and the time of day. Nervous horses toss their heads and paw more; horses paw more at feed times (06:00-06:40 and 16:00-16:50 on the farm clock); tails swish more in the southern summer (Dec-Feb). A horse in its box **looks over the door at you** as you come up (head and neck turn toward you, ears already flick by themselves). In the paddock horses sometimes **doze on three legs** (head hanging, a hind leg rested on its toe) and, rarely, **roll** (down onto one side, legs kicking, back up; one horse at a time).

**Not done (listed in the roadmap for Phase 20, left out on purpose).** Sweating-up visuals for fractious horses (needs a per-horse material change; I would not do it blind), steam on cold days, the jockey standing in the irons when pulling up, the late look-round, and hands-and-heels versus whip posture. Those live in the race jockey rig (`poseJockey`/`jockeyPoints`), which every race frame runs; I judged them too risky to change without a real-device frame-time check. `sim.js` is untouched and the race animation path is untouched.

**Tests.** `tests/phase20-browser.js` (13): the trot's diagonal pairs and finite poses, the idle events, the look-over, doze, roll and recovery (upright, `XYZ` rotation order restored, nothing left rolling), no page errors. Race-facing regressions: `presentation-browser`, `replay-lunge-browser`, `race-hygiene-browser` (see the status table at the end of Phase 21).

### Phase 21: race-day immersion and commentary (the parts that could be done safely)

**Commentary: the 14 regional towns are named.** The caller now opens a country meeting with the town ("Welcome to Dubbo, and they're loading up for this one.", "Good afternoon from Muswellbrook, the runners are going into the gates.") and uses "Tamworth is on its feet!" in the straight. 14 towns, 42 new phrases, recorded in the owner's "Commentator" voice (eleven_v4, one take each, three batch recordings split at their pauses): **2,225 ElevenLabs credits** (848 + 988 + 389; the owner approved spending credits). The splitter `tools/commentary-split-simple.js` needs only ffmpeg and node (the old one needs scipy); every batch cut cleanly (margin 0.19-0.27 s over the next-longest pause, speaking rates 4.8-6.4 syllables a second, clip lengths uniform per batch). I could not listen to them; the lengths and rates are consistent with the words. The venue key is now the town's slug for those 14 venues; other country venues keep the neutral intros. `tests/phase21-core.js` (88) runs a real simulated race for each town and checks the key, the intros and the crowd line; `tests/eleven-plan.js` confirms every phrase has a recording.

**Race day.**
- **A betting board** in the mounting yard (feature races at Randwick and Flemington): the runners with prices from their ratings (favourite first, your horse highlighted, a bookmaker's margin). Display only: there is no betting.
- **Floodlight towers** for evening meetings (dusk or evening atmosphere): 8-10 towers outside the rail round the back of the course, clear of the stands and the finish: one instanced pole, one instanced lamp head, one additive halo point cloud = **3 draws, only when it is evening**, nothing by day. Built once per venue before the gates open, so no mid-race upload or compile (the atmosphere is set before the venue is chosen and never changes during a race).
- **A high finish-line camera**: the finish shot alternates between the side-on camera and a high one.
- **An official race now has its own small trophy** on a table by the post (the Cup and The Everest keep their dais).

**Not done.** Crowd audio layers: the crowd noise beds were deliberately muted in an earlier phase ("read as static on most speakers", `audio.roar` returns at once) and making new crowd audio needs sound effects I have no tool to record, so I left it. The float arrival and a separate mounting-yard scene (the parade already is the mounting yard), new replay angles, "return to scale", and a trophy tier by grade beyond the one above.

**Test status at this commit.** Passed: phase20-browser 13, phase21-core 88, phase21-browser 10, eleven-plan 9, commentary 164, presentation-browser, replay-lunge-browser, phase12-browser, farm-browser, farm-flow, phase8, phase17, phase18, phase19 (21; one timing-sensitive step was made deterministic), scenes. **Not run for these two phases:** `race-hygiene-browser` (I stopped it after 14 minutes to free the machine; it is re-run at the end of Phase 22, which changes the venue and race scene more), `smooth.js` before/after (the race animation loop was not changed, so there is nothing for it to compare).

**Tests.** `tests/phase21-core.js`, `tests/phase21-browser.js` (10: the board, price order, display-only, floodlights at evening and dusk but not midday or golden hour, three renderable objects).

### Phase 22: regional venue looks and weather you can see

**Six country looks** (was two). `venues.js buildCountry` takes a look from a table: tablelands, provincial, coastal, western district, plains, river. A look sets the turf / infield / ground tints, the stand length, seat colour, back wall and tote material, roof colour, the name-board colour, the tree mix (gum, plane, fig, cypress) and count, and the hills' colour and height. Coastal and river meetings also get **picnic bunting** along the stand fascia (one instanced mesh); the river course has a **lake** in the infield (one mesh). `SEASON.venueStyle` now gives each of the 22 regional venues a fixed look by region (e.g. Tamworth, Muswellbrook, Mudgee, Scone tablelands; Grafton, Port Macquarie, Casino, Gosford, Wyong, Newcastle, Kembla Grange coastal; Hamilton, Warrnambool, Ballarat, Geelong western district; Dubbo, Moree plains; Wagga Wagga, Echuca river; Toowoomba, Bendigo, Kyneton provincial). The crowd is a little bigger at a Cup, a picnic meeting or a carnival. The course geometry is still the generic oval, so physics is unchanged.

**Weather on the track** (`public/weatherfx.js`, presentation only). **Wet-track spray**: on a wet or rainy day a spray of droplets is kicked up behind each runner above 8 m/s (8 particles per runner, one `Points` draw, created before the gates open and rewritten in place, nothing beyond 120 m from the camera is simulated). **Cloud shadows**: on a clear (faint) or partly cloudy (stronger) daytime race, soft shadows drift over the ground (one large transparent quad that follows the camera, the pattern anchored to the world); none in the rain, under overcast or at night. **On the farm**: puddles (one instanced mesh of 16) appear in the yard and by the gate when it is raining or wet.

**Budget.** From a fixed camera pose the two original looks cost 63 and 72 draw calls; the six now cost 66, 73, 75, 74, 66 and 77 (at most +7 %; the roadmap allowed 10 %). Built looks stay cached and hidden (the venue cache, as before): building all six adds about 330 geometries; four rainy races in a row leak none.

**Not done.** Per-town backdrops beyond the region look (a town is its region's look), tote/marquee variants beyond the wall/tote material swap, and any layout change (Phase 24).

**Test status at this commit.** `race-hygiene-browser`: **36 passed, 0 failed** (nothing uploaded, compiled or stored mid-race; the Phase 22 venue and weather objects are all built before the gates open). phase22-browser 25, phase11-core and phase11-browser (updated for six looks), phase12-browser, presentation-browser, phase21-browser, single-browser 8 all pass. Race-hygiene and the farm/career suites were run before Phase 23's goals card was added to the hub; `phase23-core` 14, `phase23-browser` 6 and `career-core` 128 pass after it.

**Tests.** `tests/phase22-browser.js` (25), `phase11-core` (looks 0-5 all used; towns named by the caller) and `phase11-browser` updated for six looks.

### Phase 23: season goals (the part that does not need an owner play-through)

The roadmap's Phase 23 is "retuning from the owner's play-test notes" plus goals, client horses, rival storylines and difficulty presets. **I have no play-test notes**, and retuning the economy blind would be a guess, so I did **not** retune purses, fees, pace or regional pressure, and I did not build client horses (the roadmap itself flags exploit risk), rival storylines, difficulty presets or "new career+". Those wait for your notes.

**What was built: season goals.** The career hub has a **Season goals** card: run 3 starts ($1,500), win a race ($3,000), finish in the first three 5 times ($4,000), win 3 races ($6,000), earn $60,000 in prize money ($5,000), race in a championship round ($2,500) and, once you have two horses, win with two different horses ($5,000): at most $27,000 a season, small next to prize money. `CORE.goalsOf` computes progress from the horses' own race histories for the current season (read-only); `CORE.claimGoals` pays each completed goal once, through the ledger with the key `goal:s<season>:<id>`, so it cannot be paid twice however often it runs. After a race the results panel names any goal just paid. Goals never gate anything.

**Tests.** `tests/phase23-core.js` (14, including a fuzz of 300 random careers: no goal paid twice, ledger healthy) and `tests/phase23-browser.js` (6). `career-core` 128 unchanged. I did **not** re-run `tests/economy.js` / `development.js` / `career_difficulty.js` simulations with the goal income: it adds at most $27,000 a season and I did not measure its effect on the difficulty bands.

### Phase 25: a lived-in farm (owner request)

**You asked for other horses walking around the farm and things happening that you can interact with.** This adds, in `public/farm-ambient.js` (one group, removed on leaving the farm; no effect on the career or the sim):

- **Five resident horses** in the paddocks, none of them yours: Dolly (a retired barrier-trial mare), Jasper (a neighbour's hack, boarding), Duke (the old stock horse), and Clover with her foal Pip. They graze, wander (keeping clear of each other and of your horses), doze on three legs, flick their ears, toss their heads, and **come over to the fence when you walk past** (head up, ears forward, turning to watch you). **E pats them**: a short pat animation and a line about that horse. The foal skips about near its mother at a trot.
- **Biscuit the farm dog**: wanders round the yard, **trots out to meet you** when you are within about 18 m, follows at a few metres, **sits when you stop** and wags; **E pats him**. He stays at home when you are far away.
- **Seven hens** scratching about by the feed shed (one instanced mesh); they peck, wander, and **scatter when you run at them**.
- **Visitors, on the farm clock** (their positions are a pure function of the clock and the date, so skipping time or re-entering puts them in the right place): a **hay truck** on Monday and Thursday mornings (07:30 arrives, 07:48-08:24 parked at the feed shed with the driver unloading, gone by 08:42; **E helps unload**), a bigger stack of bales in the shed for the days after; a **neighbour riding past** (Banjo, with Kath up) on Tuesday, Friday and Saturday afternoons (15:30-16:18, trotting from the gate towards the oval and back; **E says g'day**).
- **The people will chat** (**E** next to a stable hand, the groom, the trainer or the vet): they talk about today's real situation, picking from lines that use the weather, whose turn-out or trackwork is when, a horse's form, whether a race is booked. The two hands are now Sam and Kerry.

**Cost.** Residents are drawn only within 85 m of the camera, the dog and hens within 55 m, and animated only within 75 m, so the whole-property overview stays inside the farm's draw-call budget (overview 202 calls against the budget of 210). I measured no real-device frame time.

**Not done.** The farrier/vet visit, the horse that arrives on the float, foals growing up over the seasons, and anything that changes with the seasons beyond the weather. Residents do not interact with your horses (no sniffing over a fence).

**Test status at this commit.** Passed: phase25-browser 34, farm-browser (34; overview 202 draw calls), farm-flow, phase8, phase17, phase18, phase19, phase20, scenes, single-browser 8. Race-facing suites were not re-run for this phase (nothing in the race path changed).

**Tests.** `tests/phase25-browser.js` (34): the residents and where they wander, a horse coming to the fence and the pat, the dog following and sitting, hens scattering, the truck's day and hour (Monday yes, Wednesday no) with the driver, unloading and leaving, the rider's days and hours, staff chat, nothing left behind after three more visits. `farm-browser`'s idle-animation test now counts only the stall horses; its budget (overview ≤ 210) still holds.

### Phase 24: distinct regional course layouts (owner approved the `sim.js` edit)

**What changed in `sim.js` (additive only).** Five new table tracks in `TRACK_DEFS`, built by the same machinery as Randwick and Flemington (`solveCourse` closes each loop exactly at its stated length), plus two read-only fields on the built track (`country`, `character`). Nothing that existed was edited: the generic oval, Randwick and Flemington are byte-identical in behaviour (their own suites, below, are unchanged and pass).

| id | course | direction | lap | home straight | tightest bend | width |
|---|---|---|---|---|---|---|
| `c_tight` | tight, turning circuit | anticlockwise | 1,150 m | 200 m | about 91 m | 24 m |
| `c_long` | long-straight galloping course | clockwise | 2,100 m | 520 m | about 123 m | 26 m |
| `c_pear` | pear-shaped: tight top turn, long sweeping home turn | anticlockwise | 1,850 m | 330 m | 100 m | 24 m |
| `c_dogleg` | kink on the back straight | clockwise | 1,700 m | 380 m | about 97 m | 24 m |
| `c_sweep` | wide, sweeping | anticlockwise | 2,000 m | 300 m | about 172 m | 28 m |

(The original oval: 1,654 m lap, 450 m straight, 120 m radius, 26 m wide.) These are **estimates in the spirit of small provincial courses, not surveys of real tracks.** Each width is at least the 22.6 m the twelfth lane needs. Starts have no chutes: a country course races from the lap.

**Where they are used.** `SEASON.TOWN_LAYOUT` gives each of the 22 regional venues a layout (tight: Moree, Muswellbrook, Casino, Mudgee, Kyneton, Gosford; long-straight: Dubbo, Wagga Wagga, Toowoomba; pear: Warrnambool, Echuca, Grafton, Port Macquarie; dog-leg: Tamworth, Scone, Bendigo, Wyong, Ballarat; sweeping: Geelong, Newcastle, Kembla Grange, Hamilton), and a career race there is run on it (`competitiveCfg`). The Phase 22 look (palette, stand, trees) is independent of the layout, so a town keeps its look. The country venue kit is laid out along the layout's own route (`VENUES.use` builds it per look and layout and caches it, so a second visit builds nothing). The calendar's event screen and the departure panel now say what the course is like ("Course: tight, turning 1,150 m circuit, 200 m straight"). The minimap fits any course, the broadcast shots are built from the course's own geometry, and the caller names the town as before. The roadmap's "horses develop course preferences" is not built.

**Measured.** `tests/country-tracks.js` (154 checks, 70 races): every layout closes smoothly, is the right handedness, has smooth curvature and exact route lengths for every start distance 1,000-2,400 m, gates square across the direction of racing, lane-width ground loss exact; the five differ (five laps, five straights, radii 91-172 m, both directions); full-incident AI races on every course at every distance: no horse leaves the surface or crosses a rail, no teleports, no hung race, and winning times stay within 7 % of the original oval's (same physics); the last 400 m of one race takes measurably different times on the tight and the long-straight courses. In the game (`tests/phase24-browser.js`, 21 checks) each course is built along its route (draw calls 74-96 from a fixed pose), the minimap fits, 18-22 camera positions are generated, a field of eight finishes (winner 67-68 s for 1,200 m) and a second visit to every course builds nothing.

**Not done.** Genuine rises and falls (the engine's route model is flat), AI tuning per layout (none was needed in the tests), and the course-preference display. I did not run the multiplayer suites (online racing is hidden and still uses only the original oval).

### Phase 26: a training board beside each box, and slightly harder career races (owner request)

**Training board.** Each box now has a small board on the wall beside its door ("TRAINING", the horse's points to spend, its name; one mesh and one texture for all five, refreshed when points change). **E** beside it opens a **training panel on the farm** (no Esc, no hub): the eight attributes with bars to potential, what each does, the cost of the next point, **+1** buttons, and **Undo last**. It is the Training screen's own logic exposed as `CAREER.training` (`view`, `up`, `undo`, `points`): same `SEASON.upgCost` costs, same potential ceilings, same per-horse undo session, same `save()`; the earning of points is untouched. (I read "the slowed training point like it was before" as "the same training point system as before"; tell me if you meant something else.) The farm overview went from 202 to 203 draw calls (budget 210).

**Harder races.** Non-final career fields are lifted a little further over your horse (`CAREER_HARDER` = 0.55 lengths for the three strongest rivals, 70 % of that for the rest of the strong end, 60 % for the depth of the field; `season.js`). Finals, the crown races, the major-race ceiling and Quick Race are unchanged. Measured with the real race engine, 160 races per condition, the Hard AI jockey riding your horse:

| race | win % before → after | avg place before → after |
|---|---|---|
| new horse · maiden | 27 → 24 | 3.9 → 3.9 |
| new horse · country cup | 28 → 18 | 3.9 → 4.3 |
| new horse · midweek 1600 | 20 → 19 | 3.9 → 4.0 |
| 6th start · Newcastle Mile | 23 → 19 | 4.0 → 4.0 |
| metro · Kingsford Mile | 24 → 23 | 4.2 → 4.3 |
| new horse · Picnic Maiden | 23 → 15 | 3.3 → 3.7 |
| new horse · 3yo Maiden | 28 → 21 | 3.2 → 3.5 |
| 2nd start · Country Maiden Plate | 34 → 29 | 3.3 → 3.5 |
| 3rd start · Country Cup (Scone) | 18 → 12 | 4.4 → 4.7 |
| 5th start · Benchmark 58 Mile | 31 → 32 | 3.3 → 3.3 |
| 8th start · Kyneton Cup | 21 → 21 | 4.3 → 4.3 |

Across those races the average win rate drops from 23 % to 19.5 % and the average finishing place goes from 4.0 to 4.1: a nudge, still a field a well-ridden horse beats about one time in five. If you want it a touch harder or easier, `CAREER_HARDER` in `season.js` is the single knob (0.55 now; 0 restores the old fields). I did not re-run `economy.js` / `progression.js`.

**Tests.** `tests/phase26-browser.js` (16).

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

