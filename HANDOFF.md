# Final Furlong — project handoff

Paste this file's contents into a new Claude Code chat to continue work. All the code is in this project folder (`ffmp/`).
Detailed notes of the last updates: `docs/WORKLOG-P2.md`, `docs/WORKLOG-P3.md`, `docs/WORKLOG-P4.md`.

**Current direction (user): single-player only. Multiplayer is parked (hidden, code kept: `FF_FEATURES.multiplayer`, `?mp=1`) — do not spend time keeping online in sync with new features.** Asset/licence manifest: `ASSETS.md`.

## What it is
A browser-based 3D horse-racing game (Three.js r128) with a realistic skill-based racing engine. Single-player ships as one
self-contained HTML file; an optional Node server adds online multiplayer. Procedural horses/jockeys/tracks/stable, no assets.

## File map
- `public/index.html` — the game: menus, rendering, generic venue ("Furlong Park"), HUD, cameras, replays, Quick Race, audio.
- `public/sim.js` — shared race simulation **and the track engine** (`TRACKS.generic` analytic oval; `TRACK_DEFS` + `buildTableTrack` for real courses; `getTrack(id)`; each `Race` has `race.trk` and `race.route` — use `race.route.point(progress, off, out)`, `kIn`, `scale`, `bendAcc`, `loopD`, `inChute`). Loads in the browser AND as a Node module (server + tests) — keep both working.
- `public/season.js` — career core (pure): divisions/calendar, **persistent rivals** (`C.rivals`, `C.world[div]` stables), optional fields, background divisions, standings/tie-breakers, commit/skip/close season, qualification, form guide, head-to-head (`C.h2h`), XP/upgrade costs, save migration (v1/v2 → v3).
- `public/commentary.js` — live race call: `Booth` (DOM-free; continuous call composer `nextLine` + scheduler), browser speech layer (`COMM`).
- `public/gfx.js` — graphics kit: AUTO quality controller (`GFX.AUTO`, `autoTick`), screen-size LOD + chunked instancing (`GFX.chunked`, `GFX.LODS`), quality presets, IBL sky/environment, turf shader, procedural trees, GPU-animated crowd, rails, PBR materials.
- `public/venues.js` — Royal Randwick and Flemington scenery built from the track geometry (`VENUES.use(trk, cfg)`, `VENUES.parade()`).
- `public/eleven.js` — ElevenLabs commentary (`ELEVEN`): recorded library (`public/assets/audio/commentary/` + manifest), clip planner (`plan(clip)` — the Booth attaches a `clip` hint to every line), Web Audio playback, Mode B names via `server/tts.js` (`/api/tts`, key in `ELEVENLABS_API_KEY`).
- Horse/rider LOD: `buildHorseGeometry(def, lod)` / `buildJockeyGeometry(def, lod)` (LOFT_Q), switched in `horseLOD()`; presentation is rail-relative via `mesh.userData.sideS` (+1 left-handed, −1 right-handed course).
- `public/presentation.js` — parade ring (pre-race, skippable), winner presentation, walking gait (`PRESENT`).
- `public/voice-core.js` + `public/voice.js` — enhanced commentary voice: Kokoro/Piper in a Web Worker via ONNX Runtime Web,
  Cache Storage downloads (checksum), streaming speaker with lookahead + stale-line dropping (`VOICE`). `tools/fetch-voices.js`
  copies the Kokoro files into `public/voices/` (git-ignored) for self-hosting.
- `public/stable3d.js` — the 3D racing stable (`STABLE3D`): grooming bay, five boxes, trophy room, orbit camera, picking.
- `public/career.js` — Career UI: hub, creator (5 steps), stable/profile/training, rivals, form guide, events, championship screens, results bridge.
- `public/mp.js` — online client. `server/` — authoritative server (race-server.js, rooms.js, protocol.js, index.js).
- `tools/build-single.js` — inlines sim, season, commentary, mp, venues, stable3d, career into `dist/final-furlong-single.html`.
- Script order in index.html: sim.js → season.js → commentary.js → voice-core.js → voice.js → (main inline) → eleven.js → gfx.js → mp.js → venues.js → presentation.js → stable3d.js → career.js.

## Published artifact (single-player)
`https://claude.ai/artifact/RUnGGeTzSHw7XxG5iESe6G` — publish from `/home/user/ffmp-extract/final-furlong.html` (a copy of
`dist/final-furlong-single.html`; same path → same URL). The older link `RAaRKXBdFPoBWac8EW8WZQ` still holds the pre-Prompt-1 build.

## Deploy
Single-player: `node tools/build-single.js`. Online: user uploads the folder to the private GitHub repo "Furlong" → Render
auto-redeploys (`npm install`, `npm start`, `PORT`). Online needs Node (no static hosting). Online races use the generic course.
The server sends cross-origin-isolation headers on HTML (multi-threaded neural voice); `FF_COI=0` or `?coi=0` turns them off.

## Key numbers
- Creation: BASE 54, START_POOL 136, START_CAP 84 (rating ≈ 71); POT_POOL 168, POT_CAP 98. XP_PER_PT 2; upgCost 1/2/3/4/6 by band (<70/78/85/91).
- Rival bands: Provincial 55–63, Metropolitan 64–72, Feature 72–80 + 3 stars 83–86; growth 3–11 points; per-run rate 0.03–0.10.
- Balance (tests/progression.js, AI-ridden): rating 73 (r1-3) → 77 → 80 → 84 (r17-20); first 3 races win ~60%; flat-out riding ~0%.
- Randwick: lap 2224, straight 410 (post at s = 0), runout 110, top turn r≈162, back 377 + 12° kink, chute join, home turn r≈177, W 28, cw. 1200/1400 from the sprint chute (118/318 m).
- Flemington: lap 2312, straight 450, ccw, run-out 129, first turn r 125, back 579, home turn r≈196 (1200→450 m), W 30. Straight Six chute
  joins at the 450 m: 1000–1200 m are `straightRace`; Cup 3200 starts 438 m up the straight course (passes post at 888 m).
- Save: `localStorage.ff_career` v3 (`seed, stable, horses[], active, trophies[], wins, history[], season{n,div,seed,cur,closed,rounds[],others{}}, world[3][stables], rivals{}, h2h{}, optN, rivalSeq`).

## Tests (run in the project folder)
```
node tools/build-single.js
FF_TEST_HOOKS=1 PORT=8095 node server/index.js      # for browser + multiplayer tests
node tests/season.js                                # 64 checks: championship, rivals, H2H, retirement, migration
node tests/commentary.js 36                         # 162 checks + continuity metrics
node tests/commentary-scenarios.js 160              # 7 race shapes, every call checked against the race (~1,860 checks)
node tests/eleven-plan.js ; PORT=8095 node tests/eleven-browser.js   # recordings complete; real playback in Chromium
node tests/randwick.js 2                            # 41 checks: geometry, routes, chutes, navigation, AI races
node tests/flemington.js 2                          # 46 checks: pear shape, Straight Six, Cup route, AI races
node tools/fetch-voices.js && PORT=8095 node tests/voice-browser.js   # enhanced voice end to end (slow: ~15 min here)
PORT=8095 node tests/presentation-browser.js        # parade ring, barriers, winner presentation
node tools/shots.js <outDir> [shots.json]           # real in-game screenshots (see the file for options)
node tests/progression.js 2 24                      # balance + development speed (real engine)
PORT=8095 node tests/career-browser.js              # 86 checks: stable/creator/camera/training/rivals/Randwick/commentary in the browser
node tests/field.js public/sim.js 112 ; node tests/chaos.js public/sim.js ; node tests/avoid.js public/sim.js
node tests/pileup.js public/sim.js full 60 ; node tests/pushfall.js public/sim.js
node tests/mp-protocol.js ; PORT=8095 node tests/mp-e2e.js ; node tests/mp-spectate.js ; node tests/mp-leader.js ; node tests/mp-chaos.js
```
Gotchas: after `npm install`, delete `node_modules/playwright*` (use the preinstalled Chromium). Headless has no speech
voices (tests stub `speechSynthesis`). The build container has no outbound web access (reference sites were unreachable).

## Status
Commentary overhaul (latest): director in `public/commentary.js` (race view → scored observations → memory/cooldowns →
pacing), phrase bank `public/calls.js` (410 phrases), recordings in the "Commentator" voice MTGAJpjryOZn2Xr8FOtm (794 clips,
`tools/commentary-batches.js` + `tools/commentary-library.py`), playback `public/eleven.js`. Design and credits:
`docs/COMMENTARY.md`; transcripts: `docs/COMMENTARY-SCENARIOS.md`. ElevenLabs credits left this period: 12,502.

Round 6 (latest): AI personas + cover-seeking + mistakes (`sim.js` makeJockey/Bot), chase/jockey camera rework
(`updateCamera` in index.html: `cam.reveal`, `cam.sprint`, overtake drift), jockey head/body rebuild
(`buildJockeyGeometry`), Flemington infield (`flemingtonInfield` in venues.js), replay crowd gestures
(`GFX.setCrowdAnim`), feature-race tiles removed, Randwick parade ring level.

Prompts 1–3 done. Prompt 3: Flemington (+ Straight Six, Cup route), venue rebuild for Randwick and Flemington, graphics kit,
horse/jockey overhaul, broadcast director, barriers, parade ring, winner presentation, neural commentary voice with test
screen. Next (user's plan): Prompt 5 (major-event atmosphere polish, export/import saves, final polish). Known limits:
neural voice speed depends on the CPU (the live caller only uses it when it measures faster than real time); WebGPU
inference not implemented; venue architecture is an approximation; online uses the generic course; saves are per browser.
