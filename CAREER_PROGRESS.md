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
- Development runs one approved phase at a time. After each phase: tests, a git commit, a playable build (artifact +
  GitHub zip) and an update of this file.
- Prize money for optional races stays at nothing (as before); championship rounds pay places 1–5. Real purse and
  entry-fee balancing happens in Phase 7 (decided while implementing Phase 2 so that cash cannot be farmed before there is
  anything to spend it on).

## Status by phase

| Phase | Status |
|---|---|
| 1 — Existing project audit | **Done.** Findings are in `CAREER_PLAN.md` §1 |
| 2 — Career data architecture + save migration | **Done — awaiting the owner's review** (details below) |
| 3 — Scene separation | **Next.** Not started — do not begin until Phase 2 is approved |
| 4 — Farm environment | Not started |
| 5 — Third-person character | Not started |
| 6 — Farm interactions | Not started |
| 7 — Finances | Not started |
| 8 — Staff and facilities | Not started |
| 9 — Long-term horse development | Not started |
| 10 — Horse marketplace | Not started |
| 11 — Racing calendar expansion | Not started |
| 12 — Time of day and weather | Not started |
| 13 — Transport transitions | Not started |
| 14 — Balance and full testing | Not started |

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
- **Venues are cached forever** (`venues.js` `use`) — Phase 3 must measure memory across repeated transitions.
- **The career frame path skips diagnostics** (`perfFrame`, `GFX.autoTick` don't run on career screens) — the farm branch must call both.
- **GitHub zip not regenerated** (the user's upload zip is a build output; this phase was delivered as a git push + the artifact).

## Exactly what Phase 3 requires (from `CAREER_PLAN.md`; do not start until the owner approves Phase 2)
1. **`public/scenes.js`** (new; add a `swap()` line in `tools/build-single.js` and a `<script>` tag after `stable3d.js`):
   a `SCENES` manager with `current ∈ {menu, farm, office, stable, race}`, `enter/leave` hooks, a loading overlay, a resource
   ledger and leak check (`renderer.info.memory`, `performance.memory`), and **input contexts** `SCENES.input = "race" | "farm" | "ui"`.
   Race keydown actions and `handlePlayerInput` must require `input === "race"`; the farm reads only its own keys; held keys
   are cleared on every context switch (like the existing `blur` handler).
2. **Placeholder farm scene** with its own `THREE.Scene` + camera sharing `renderer` (pattern: `STABLE3D`): ground, five boxes
   and one interaction point "travel to race", so transitions can be tested before art.
3. **Clean enter/leave:** entering the farm → `race = null`, `clearRaceMeshes()`, `COMM.stop()`, audio stop, race scene not
   rendered; entering a race → farm horses disposed (`disposeHorse`), farm not updated, farm input detached.
4. Farm branch in the frame loop must run `perfFrame` + `GFX.autoTick`.
5. **Tests:** new `tests/scenes-browser.js` — 10 farm ↔ race round trips with `renderer.info.memory.geometries/textures`
   back at baseline (± small) and bounded heap growth (`--enable-precise-memory-info`); farm keys never move `riderInput` and
   race keys are inert on the farm; commentary stops on leaving a race. Run `PORT=8095 node tools/smooth.js` **before and after**
   (this is the first phase that touches the frame loop) and report any regression. Plus the full regression list.
6. Career data must be untouched by scene changes: reuse `CAREER.data` + `CORE`, never write cash except via `CORE.apply`.
7. When done: update this file and HANDOFF.md, commit, build (`node tools/build-single.js`), publish to the existing artifact, then STOP.
