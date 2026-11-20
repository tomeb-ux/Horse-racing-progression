# Final Furlong — project handoff

Paste this file's contents into a new Claude Code chat to continue work. All the code is in this project folder (`ffmp/`).
Detailed notes of the last update (decisions, measurements, diagnosis): `docs/WORKLOG-P2.md`.

## What it is
A browser-based 3D horse-racing game (Three.js r128) with a realistic skill-based racing engine. Single-player ships as one
self-contained HTML file; an optional Node server adds online multiplayer. Procedural horses/jockeys/tracks/stable, no assets.

## File map
- `public/index.html` — the game: menus, rendering, generic venue ("Furlong Park"), HUD, cameras, replays, Quick Race, audio.
- `public/sim.js` — shared race simulation **and the track engine** (`TRACKS.generic` analytic oval; `TRACK_DEFS` + `buildTableTrack` for real courses; `getTrack(id)`; each `Race` has `race.trk` and `race.route` — use `race.route.point(progress, off, out)`, `kIn`, `scale`, `bendAcc`, `loopD`, `inChute`). Loads in the browser AND as a Node module (server + tests) — keep both working.
- `public/season.js` — career core (pure): divisions/calendar, **persistent rivals** (`C.rivals`, `C.world[div]` stables), optional fields, background divisions, standings/tie-breakers, commit/skip/close season, qualification, form guide, head-to-head (`C.h2h`), XP/upgrade costs, save migration (v1/v2 → v3).
- `public/commentary.js` — live race call: `Booth` (DOM-free; continuous call composer `nextLine` + scheduler), browser speech layer (`COMM`).
- `public/venues.js` — real-course scenery from track geometry (`VENUES.use(trk, cfg)`, `VENUES.update`); Royal Randwick.
- `public/stable3d.js` — the 3D racing stable (`STABLE3D`): grooming bay, five boxes, trophy room, orbit camera, picking.
- `public/career.js` — Career UI: hub, creator (5 steps), stable/profile/training, rivals, form guide, events, championship screens, results bridge.
- `public/mp.js` — online client. `server/` — authoritative server (race-server.js, rooms.js, protocol.js, index.js).
- `tools/build-single.js` — inlines sim, season, commentary, mp, venues, stable3d, career into `dist/final-furlong-single.html`.
- Script order in index.html: sim.js → season.js → commentary.js → (main inline) → mp.js → venues.js → stable3d.js → career.js.

## Published artifact (single-player)
`https://claude.ai/artifact/RUnGGeTzSHw7XxG5iESe6G` — publish from `/home/user/ffmp-extract/final-furlong.html` (a copy of
`dist/final-furlong-single.html`; same path → same URL). The older link `RAaRKXBdFPoBWac8EW8WZQ` still holds the pre-Prompt-1 build.

## Deploy
Single-player: `node tools/build-single.js`. Online: user uploads the folder to the private GitHub repo "Furlong" → Render
auto-redeploys (`npm install`, `npm start`, `PORT`). Online needs Node (no static hosting). Online races use the generic course.

## Key numbers
- Creation: BASE 54, START_POOL 136, START_CAP 84 (rating ≈ 71); POT_POOL 168, POT_CAP 98. XP_PER_PT 2; upgCost 1/2/3/4/6 by band (<70/78/85/91).
- Rival bands: Provincial 55–63, Metropolitan 64–72, Feature 72–80 + 3 stars 83–86; growth 3–11 points; per-run rate 0.03–0.10.
- Balance (tests/progression.js, AI-ridden): rating 73 (r1-3) → 77 → 80 → 84 (r17-20); first 3 races win ~60%; flat-out riding ~0%.
- Randwick: lap 2224, straight 410 (post at s = 0), runout 110, top turn r≈162, back 377 + 12° kink, chute join, home turn r≈177, W 28, cw. 1200/1400 from the sprint chute (118/318 m).
- Save: `localStorage.ff_career` v3 (`seed, stable, horses[], active, trophies[], wins, history[], season{n,div,seed,cur,closed,rounds[],others{}}, world[3][stables], rivals{}, h2h{}, optN, rivalSeq`).

## Tests (run in the project folder)
```
node tools/build-single.js
FF_TEST_HOOKS=1 PORT=8095 node server/index.js      # for browser + multiplayer tests
node tests/season.js                                # 64 checks: championship, rivals, H2H, retirement, migration
node tests/commentary.js 24                         # 116 checks + continuity metrics
node tests/randwick.js 2                            # 41 checks: geometry, routes, chutes, navigation, AI races
node tests/progression.js 2 24                      # balance + development speed (real engine)
PORT=8095 node tests/career-browser.js              # 86 checks: stable/creator/camera/training/rivals/Randwick/commentary in the browser
node tests/field.js public/sim.js 112 ; node tests/chaos.js public/sim.js ; node tests/avoid.js public/sim.js
node tests/pileup.js public/sim.js full 60 ; node tests/pushfall.js public/sim.js
node tests/mp-protocol.js ; PORT=8095 node tests/mp-e2e.js ; node tests/mp-spectate.js ; node tests/mp-leader.js ; node tests/mp-chaos.js
```
Gotchas: after `npm install`, delete `node_modules/playwright*` (use the preinstalled Chromium). Headless has no speech
voices (tests stub `speechSynthesis`). The build container has no outbound web access (reference sites were unreachable).

## Status
Prompts 1–2 done (championship + commentary; stable/creator/progression/rivals/commentary overhaul/track engine/Randwick).
All suites above pass. Next (user's plan): **Prompt 4 — Flemington** (add a `TRACK_DEFS.flemington` — anticlockwise, the
straight six chute, ~2312 m lap, ~450 m straight — plus a `venues.js` builder and venue mapping), then Prompt 5 (major-event
atmosphere, export/import saves, final polish). Known limits: speech quality depends on installed system voices; Randwick
bend radii/chute angles are estimates; online uses the generic course; career saves are per browser.
