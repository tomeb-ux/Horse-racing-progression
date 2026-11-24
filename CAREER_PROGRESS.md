# Career Mode expansion — progress

Master specification: `CAREER_EXPANSION_SPEC.md` (saved verbatim; refer to it rather than asking for it again).
Implementation plan (approved): `CAREER_PLAN.md`.

## Decisions on record
- The championship divisions (Provincial → Metropolitan → Group 1 Feature Series) are kept. Their rounds get real dates
  on an August–July racing season, alongside many more optional races.
- Commentary reuses the existing recorded clips for now: country venues use neutral lines and auction horses use the
  128 recorded names. New venue intros (and any extra names) will be priced first and recorded only with the owner's
  approval.
- The first build phase is the spec's **Phase 2: career data architecture + save migration**.
- Multiplayer is to be hidden and disabled during the expansion, with its code kept (part of Phase 2).
- Development runs one approved phase at a time. After each phase: tests, a git commit, a playable build (artifact +
  GitHub zip) and an update of this file.

## Status by phase

| Phase | Status |
|---|---|
| 1 — Existing project audit | **Done.** Findings are in `CAREER_PLAN.md` §1 |
| 2 — Career data architecture + save migration | **Next.** Waiting for the owner's go-ahead |
| 3 — Scene separation | Not started |
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

No game files have been changed for the expansion yet. The game is as of commit `91d8c2f`, with multiplayer still
enabled until Phase 2 hides it.

## Known issues found during the audit (to address in the phases noted)
- **Commentary intro at unknown venues.** A career race at a venue other than Randwick or Flemington picks the
  generic intro "Welcome to Furlong Park…" (`commentary.js` `venueKey` / intro choice). Fix in Phase 11 with neutral
  existing lines.
- **Prize money is record-only.** `career.js` `onResult` parses the race's prize string and adds 60/20/10 % to
  `h.prize`. Nothing is spendable yet; it becomes real money through the ledger in Phase 2.
- **Venues are cached forever.** They are built lazily and never disposed (`venues.js` `use`). Acceptable (they are
  not rendered or updated off-race), but Phase 3 must measure memory across repeated transitions and add an optional
  dispose path.
- **The career frame path skips diagnostics.** `perfFrame` and AUTO quality (`GFX.autoTick`) do not run in career
  screens. The farm branch must call both (Phase 3/4).
- **Stale handoff note.** `HANDOFF.md` mentions a `?mp=1` switch that no code reads. Correct it when multiplayer is
  hidden in Phase 2.

## Exactly what Phase 2 requires (from `CAREER_PLAN.md`)
1. Hide multiplayer: set `FF_FEATURES.multiplayer = false` (index.html). This hides the menu item and disables
   `?join=` and auto-rejoin (already guarded in `mp.js`). Keep server, `mp.js` and the multiplayer tests. Update
   README and HANDOFF.
2. New `public/career-core.js`: pure logic that also runs in Node, like `season.js`, and is registered in
   `tools/build-single.js` and in an index.html script tag before `career.js`. Contents:
   - save schema v4 with `migrate` (chained after `SEASON.migrate`; backup `ff_career_v3_backup`) and `fresh()`;
   - calendar day model (season Aug 1 – Jul 31, horses age on 1 August), date formatting, `advance` with skip
     warnings;
   - ledger with idempotent transaction keys (no duplicates, no negative balance from UI bugs);
   - prize schedule by grade (places 1–5);
   - fitness, recovery, age and growth data plus rules (effects switched on in Phase 9);
   - deterministic dated placement of championship rounds and optional races, with stored time of day and forecast
     per event.
3. `career.js`:
   - `load` → `CORE.migrate`;
   - `onResult` credits prize money once through the ledger (key per race + horse), records the date and post-race
     fitness;
   - entering a round sets the date to its scheduled day.
4. Minimal UI: date, cash and an "Office" panel in the career hub (ledger, dated calendar, export/import save with
   backup).
5. Tests:
   - new `tests/career-core.js` (migration fixtures v1/v2/v3, prize applied once across replay and reload, ledger
     guards, calendar maths, deterministic schedule, export/import round trip);
   - extend `tests/career-browser.js`;
   - full regression list (`CAREER_PLAN.md` §4).
6. Playable checkpoint: the existing career plays exactly as before, plus date, cash and the office. Then commit,
   build, publish to the artifact and update the GitHub zip.
