# Final Furlong — project handoff

Paste this file's contents into a new Claude Code chat to continue work. All the code is in this project folder (`ffmp/`).

## What it is
A browser-based 3D horse-racing game (Three.js) with a realistic skill-based racing engine. Single-player ships as one self-contained HTML file; an optional Node server adds online multiplayer. Procedural horses/jockeys/track, no external assets.

## File map (this folder)
- `public/index.html` — the game: menus, rendering, HUD, cameras, replays, Quick Race, Championship, Chaos, and all single-player logic. Large file.
- `public/sim.js` — the shared race simulation (`Horse`, `Race`, `Bot`, `ROSTER`, `DISTANCES`, `DIST_LABEL`, `scaleDef`, `riderKick`, …). **Loads both as a browser script AND as a Node module** (`module.exports` at the end). Used by the browser and the server — keep both working.
- `public/mp.js` — online multiplayer client (lobby, snapshot interpolation, reconnect, spectate, kick).
- `public/season.js` — championship core (pure logic, browser global `SEASON` + Node module): 3 divisions/calendars, optional races, AI stables (`makeStables`, deterministic from the career seed), `runners`, `simulateRound` (AI-only results), `standings` (+tie-breakers), `commitRound`/`skipRound`/`closeSeason`, `eligibility`, `migrate` (save v1→v2).
- `public/commentary.js` — live spoken commentary (global `COMM` + Node module): `Booth` (event detection + priority queue, DOM-free), speech via `speechSynthesis`, settings in `localStorage` `ff_commentary`. Hooked in `startRace` (`COMM.begin`), the frame loop (`COMM.update`), `show()` (silence when not racing) and finishRace (`COMM.holdMs`).
- `public/career.js` — Career Mode UI (dashboard, event/horse select, calendar, standings, optional races, skip, season end, history, create, stable, training, trophies; saves to `localStorage` key `ff_career`, schema v2).
- `public/vendor/three.min.js` — three.js r128 CDN fallback.
- `server/index.js` — HTTP static + WebSocket server. `PORT` env (default 8080). `FF_TEST_HOOKS=1` enables test-only commands (e.g. `debugFall`). Has a WebSocket origin check.
- `server/rooms.js` — private rooms (up to 6 players), room codes, reconnect tokens, cleanup.
- `server/race-server.js` — authoritative race, fixed 120 Hz, snapshots (~20 Hz), results, binary replay, kick handling.
- `server/protocol.js` — code/token/input validation, `DISTANCES`, `DEFAULT_SETTINGS`.
- `tests/` — see commands below.
- `tools/build-single.js` — inlines `sim.js` + `season.js` + `commentary.js` + `mp.js` + `career.js` into `dist/final-furlong-single.html`.
- `README.md`, `CHANGES.md`, `Dockerfile`, `render.yaml`, `package.json`.

## Published artifact (single-player)
`https://claude.ai/artifact/RAaRKXBdFPoBWac8EW8WZQ` (updated with the Prompt 1 build: championship + commentary). Its source is the single-file build (`dist/final-furlong-single.html`). To update: build, copy to the artifact's `index.html`, publish to the same URL, keep the title "Final Furlong".

## Deploy / ship
- **Single-player:** `node tools/build-single.js` → `dist/final-furlong-single.html` (one offline file).
- **Online:** hosted via a private GitHub repo ("Furlong") → Render.com free web service (build `npm install`, start `npm start`, uses `PORT`). To update: upload the contents of the project folder to GitHub; Render auto-redeploys. Free tier sleeps after ~15 min idle. Online **cannot** go on static hosting — it needs Node.

## Architecture essentials
- Horse attributes: `{top, acc, end, spr, rec, tem, agi, sta}` → `vmax`, `A`, `endN`, … in the `Horse` constructor.
- `Race` cfg accepts `playerDef` (a full custom horse def, for Career), `oppDefs` (exact opponent defs — the AI stable runners; tagged `_sid`/`_hid`) and `oppScale` (legacy scaling; `scaleDef` is exported). Career builds its own config with `chaos:false, assist:false, unlimited:false`.
- Rendering honors custom looks: `horseLook(def)` reads `def.look` (coat type, face, socks, mane/tail colour, build); jockey silks read `def.silk2` + `def.silkPat`. `setMenuHorse(idxOrDef)` accepts a def for the live preview.
- `mp.js` and `career.js` are classic scripts loaded **after** the main inline script and rely on its top-level `const`/`function` via shared global scope. `build-single.js` inlines them in the same order. `season.js` and `commentary.js` load right after `sim.js`.

## Features in this build
1. **Online multiplayer** — authoritative server, 2–6 players, private room links, reconnect, spectate after a fall / spectate the leader when all fall, identical official results on every screen.
2. **Chaos Mode** — one kick per race (`P`, hold `A`/`D` for side), **spent only on a successful knockdown**; pile-ups are **contact-only** (no area-of-effect); AI runs as a tight 3–4-wide column near the rail; no AI dodging of fallen horses in chaos; in normal mode AI avoids a faller when it has room, but any horse on the same path within **40 m** when it falls can't react.
3. **Realistic ragdoll falls** by cause (`trip`/`side`/`balance`); fallen hitboxes match the visible body; **F9** toggles a developer collider view.
4. **Career Mode** — details below.
5. **Removed** the "unlimited stamina / top speed" option and the extreme 5000 m / 30000 m races. `DISTANCES = [1000,1200,1400,1600,2000,2400,3200]` (3200 Stayers = Melbourne Cup distance).

## Career Mode & championship (Prompt 1 of 5 — done)
- Divisions: Provincial (10 rounds, field 10, 9 AI stables) → Metropolitan (10, field 12, 11 stables) → Group 1 Feature Series (12, field 12; Everest + Melbourne Cup are crown jewels). Top 3 promoted. Round `str` = target AI rating (Prov 59–65, Metro 67–74, Feature 74–79).
- Balance (real engine, AI-ridden player, `tests/season_balance.js`): fresh 70-rated horse wins ~40% in Provincial; 74 wins ~45% in Metro; Feature: 82 → ~22%, 86 → ~46%; crown jewels need specialists.
- Creation: `FLOOR 48, POOL 176 (≈70 rating), CREATE_CAP 82, HEADROOM 170`. Training points = XP/6 per race; `upgCost` 1/2/3/4/6/9 by band; XP reduced vs much weaker fields; optional races ×0.9.
- Points 15-12-10-8-6-5-4-3-2-1; ties wins → 2nds → best major → sid. Official result commit is one save; `commitRound` refuses anything but the open current round.
- Optional races: `SEASON.OPTIONAL` (fields from the Metropolitan stables), XP/records only. Trophies only from official feature wins + championship titles.
- Qualification (`req` on rounds): rating / sprint index / stamina index / result (top-N, tier, distance, within last N runs) / form.
- Save v2 adds `seed, season, history`; horse adds `offRaces, offWins, champPts, xpFrac`; history entries add `dist, tier, off, season`.
- Removed the stand-alone stock-horse Championship mode (user request).

## Live commentary (Prompt 1)
- Browser `speechSynthesis` only (no files/keys). Voice auto-pick prefers en-AU (Lee, then Karen), Enhanced/Premium variants; novelty voices excluded. Excitement 1–5 → rate 0.98–1.28, pitch 1.0–1.2, volume, call gaps, crowd lift (majors), ambience duck.
- Tested in Node against real races (`tests/commentary.js`: winner always correct, 0 stale leader claims, no overlaps/repeats, silent gates, photo waits for timing) and in the browser with a speech stub (`tests/career-browser.js`). Real audible output can't be verified headless — test on the Mac.

## Next stages (from the user's plan)
2. Horse creator, training speed, chosen potential, persistent rivals, head-to-head (stable/horse ids are already stored).
3. Royal Randwick + track-engine refactor. 4. Flemington. 5. Major-event atmosphere, export/import saves, final polish.

## Build & test commands (run in the project folder)
```
node tools/build-single.js
PORT=8095 node server/index.js            # add FF_TEST_HOOKS=1 for multiplayer tests
node tests/season.js
node tests/commentary.js 36
node tests/season_balance.js 10
PORT=8095 node tests/career-browser.js    # server up
node tests/field.js public/sim.js 112
node tests/chaos.js public/sim.js
node tests/avoid.js public/sim.js
node tests/pileup.js public/sim.js full 60
node tests/pushfall.js public/sim.js
node tests/mp-protocol.js                 # server up with FF_TEST_HOOKS=1
PORT=8095 node tests/mp-e2e.js            # add LAT=120 JIT=80 for simulated lag
node tests/mp-spectate.js
node tests/mp-leader.js
node tests/mp-chaos.js
```
**Headless gotchas:** after `npm install`, delete `node_modules/playwright*` so tests use the preinstalled Chromium. software GL is too slow for two pages — stub `renderer.render = () => {}` in test pages, route `cdnjs.cloudflare.com` → `public/vendor/three.min.js`, and run the server at `nice -n -5` with tests at `nice -n 15`.

## Status
Prompt 1 (championship seasons + live commentary) complete. All modes working; all sim, season, commentary, career-browser, multiplayer + chaos + avoid suites passing; single-player runs offline with no errors. Not yet deployed to a public URL (user self-hosts on Render). Known limits: online needs a Node host; career saves per-browser (no accounts); no matchmaking/chat/rankings; lag only simulation-tested.
