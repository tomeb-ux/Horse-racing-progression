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
| 15 | Racing smoothness (micro-stutter) | **15A done (instrumentation, headless counters, tool fixes); 15B waits for the owner's device reports. No stutter fix has been made.** | — |
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
- **15B:** owner measurements, bisect builds and the diagnosis. **Stop.**
- **15C:** fixes for confirmed causes only.
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
| — | — | — | — | — | — | — | — | — | (first rows come from Phase 15A/15B) |

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
@@TESTS@@

#### Deferred (Tier 3, and why)
Nothing in 15A touches race physics, results, `sim.js`, horse attributes or difficulty. The change set is diagnostics plus guarded one-line hooks in `gfx.js`, `commentary.js`, `farm.js` and the frame loop, all inert by default. Per the Testing policy the **Tier 3 full suite was therefore deferred** (not run): `career_difficulty.js`, `progression.js`, `economy.js`, `development.js`, `field/chaos/avoid/pileup/pushfall`, `randwick/flemington`, `commentary*`, `eleven-*`, `phase6–14` cores and browsers, `career-browser`, `presentation-browser`, `voice-browser`. Multiplayer tests: not run, multiplayer disabled by design. A Tier 3 run belongs to 15C/15D, when a fix touches `gfx.js` / the race path for real.

#### Next investigation steps
1. **15B (needs you):** run the protocol below on your devices, send the files, and I will tabulate them in the measurements log. Priorities: A ×2, then F-auto-off and F-parked, A-farm60, B, D, E, G.
2. If AUTO off / race-only removes the hitches → 15C "AUTO feed" row of §2.4. If parked helps → the "park farm on race entry" row. If neither, if hitches carry `jsPrev` small → GPU / compositor / host: look at the Chrome trace and condition E. If JS-heavy → add the per-section timers from the §2.1 menu **one at a time**.
3. Still open from the roadmap §2.3: the CDP allocation profile (the 9.5 → 12.2 MB/s rise, which survives the corrected tools), and the ten-different-fields geometry-cache growth check.
4. The `renderer.info` count of 24 texture uploads per frame at every build is worth a look if the GPU trace points at uploads (candidate: skinned-mesh bone textures; not verified).

#### Publishing
See the closing message of the session for the artifact version. No historical comparison build (`5139a6f`, `49aaed3`, HEAD) has been published: that needs the owner's approval first.

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

