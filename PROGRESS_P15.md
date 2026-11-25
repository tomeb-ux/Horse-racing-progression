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
| 15 | Racing smoothness (micro-stutter) | **Next: 15A not started** | — |
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
- **15A:** the lean instrumentation set, tool fixes and the race-hygiene test.
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
(Append one section per phase here: what was built, the tests run with their counts, what was deferred and why, the measurements, and the commit hash.)
