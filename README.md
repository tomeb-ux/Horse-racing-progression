# Final Furlong

A 3D horse-racing game for the browser (three.js). Single-player runs anywhere, including from one HTML file.

> **Multiplayer is temporarily disabled** while single-player is being polished. All the online code (`public/mp.js`,
> `server/rooms.js`, `server/race-server.js`, `server/protocol.js`) is kept unchanged; the menu button is hidden and
> shared `?join=` links are ignored. Developers can switch it back on for a session with `?mp=1` in the page URL, or
> permanently with `FF_FEATURES.multiplayer = true` in `public/index.html`. The sections below about online races
> describe that parked code.

**Private online races** (parked) let 2–6 friends ride against each other, with AI runners filling the rest of the field. They need the small Node
server in this project, because the server runs the race.

```
public/            what the browser loads
  index.html       the game (menus, rendering, audio, HUD, replays, single-player)
  sim.js           the race simulation — shared by the browser (single-player) and the server (online races)
  season.js        career core: divisions, calendar, persistent rivals, points, standings, qualification, form guide, XP
  commentary.js    live spoken race call (continuous call composer, scheduler, speech synthesis)
  eleven.js        ElevenLabs commentary: recorded library playback, clip planner, optional server-generated names
  assets/audio/commentary/   150 clips in your ElevenLabs voice + manifest.json (category, phrase, file, duration…)
  gfx.js           graphics kit: AUTO quality, LOD + chunked instancing, sky/IBL, turf, trees, rails, GPU crowd
  venues.js        real racecourse scenery (Royal Randwick) built from the track engine's geometry
  stable3d.js      the 3D racing stable: grooming bay, five boxes, trophy room, orbit camera
  career.js        Career Mode screens (creator, stable, training, rivals, championship) and the bridge to the race engine
  mp.js            online client: lobby, connection, snapshot interpolation, input sending
  vendor/three.min.js   fallback copy of three.js r128 if the CDN is unreachable
server/
  index.js         HTTP static server + WebSocket endpoint (/ws), rate limits, origin check
  rooms.js         private rooms: codes, seats, horses, ready/start, reconnect, cleanup
  race-server.js   the authoritative race: fixed-step simulation, inputs, starts, snapshots, results, replay
  protocol.js      codes, tokens, validation of everything a client sends
  tts.js           optional ElevenLabs endpoint (/api/tts): key from the environment, disk cache, limits
tests/             simulation tests, headless protocol test, browser end-to-end and spectate tests, latency proxy
tools/build-single.js   builds dist/final-furlong-single.html (single-player, one file, no server)
Dockerfile, render.yaml  deployment configs
```

## Career Mode (single-player)

Your own racing yard in a **3D Australian racing stable**: create thoroughbreds in the grooming bay (drag to orbit, zoom,
head / legs / silks views), keep up to five in their own boxes, train them, and race them through three tiered
championships — **Provincial** (10 rounds) → **Metropolitan** (10) → **Group 1 Feature Series** (12, with The Everest,
Cox Plate, Caulfield Cup and Melbourne Cup) — against **persistent rivals**. Top 3 are promoted.
- **Creator** — five steps: appearance (coat, face, each leg's white markings, build, muscle, neck, head, mane, tail),
  silks, starting ability (54 base + 136 points, max 84 → rating ≈ 71), **potential** (a separate 168-point budget for
  each attribute's ceiling, max 98) and review. Every change updates the real 3D model at once.
- **Training** — races earn training points (more for strong fields and good finishes); upgrades apply at once, show
  their real engine effect, get dearer near the top and stop at the horse's potential.
- **Rivals** — 93 named AI horses in 31 stables with their own abilities, potential and growth; they develop through
  their own racing (never matched to yours) and retire at their peak. Head-to-head records, rival profiles, and a
  **form guide** before every race.
- **Championship** — one runner per stable per round; points 15-12-10-8-6-5-4-3-2-1; skip a round (no points); optional
  races any time (experience only); qualification for the features from your horse's own results; permanent history.
- **Always a normal race** — Chaos, the kick, stamina assist and other Quick Race options are forced off in career races.
- **Real competition all career** — every career jockey rides at Hard, and rival stables bring their runners primed to
  your horse (race-day only, never weakened; `season.js raceField`): a new horse is fighting for a place, the field rises
  as your horse improves, and finals are as hard as Quick Race on Hard. The form guide shows the race-day ratings.
- Races at a Randwick venue run on **Royal Randwick**; other venues use the original course until their tracks exist.
- Saves in the browser (`localStorage` key `ff_career`, schema v3; v1/v2 saves migrate automatically, with a backup copy).

## Royal Randwick and the track engine

Courses are defined by curvature (straights, arcs, clothoid easements), integrated to an arc-length table and solved to
close at the published circumference. A race runs on a route (with chute support), and the bend load, balance, extra
ground for running wide, AI turn anticipation, gates, markers, cameras, replays, photo finish and minimap all use that
same geometry. Royal Randwick: right-handed, 2224 m, 410 m straight, 28 m wide, 1200/1400 m starts from the sprint chute.
Bend radii, the back-straight kink and the chute angle are estimates (the official course diagram could not be consulted
from the build environment) — see `TRACK_DEFS` in `public/sim.js`. Choose it in Quick Race → Course. Online races use the
original course.

## Flemington, venues and presentation
Royal Randwick and Flemington are built from their real course geometry (see `HANDOFF.md` for the figures and which
are estimates). Flemington has the Straight Six and the Melbourne Cup route. Settings → Graphics quality (High /
Medium / Low), Parade ring (Feature races / Every race / Off), Winner presentation (On / Off).

## AI jockeys and cameras
Rival riders have personalities (front-runner, stalker, rail rider, closer — shown under each name in the Tab stats
panel) that shape where they race, when they look for cover, whether they save ground on the rail or go wide, and when
they kick; they also make mistakes (kicking too early, waiting too long). The chase camera sits close behind your
horse, drifts to show a rival you are passing, lifts through the home turn to reveal the straight and drops lower for
the last 250 m; the jockey camera shows the horse's neck and ears with stabilised, gait-synced motion.

## Graphics: AUTO quality and the performance overlay
Settings → Graphics quality: **Auto (recommended, default)** · High (fixed) · Medium · Low. AUTO starts from the High
look and, only if frames are *consistently* slow, steps down in this order: distant crowd detail → distant trees/roses →
shadow map 2048 → scenery detail → shadow map 1024 → render scale 1.75 → 1.5 → 1.25 → 1.0 (far horses a touch simpler
only at the last step). It steps back up when there is headroom. Decisions use 1.5 s medians (spikes ignored), need
two bad windows (one when badly slow) or eight good ones, and wait 3–6 s after each change; a level that failed is not
retried for 60 s (then 120 s…). The level is remembered. Graphics never touch the simulation.
Press **F8** in a race for the performance overlay (FPS, average / median / p95 / p99 frame time and spike counts, a
frame-time graph, CPU per frame split into simulation / render submit, draw calls, triangles, horse LOD, spectators
drawn by detail level, shadow map, render size, preset and AUTO state). With the overlay on, **F7** switches motion
interpolation off and on, to compare.

**Smooth motion.** The simulation runs at a fixed 120 steps per second, independent of the display. Every drawn frame
shows each horse (and so the cameras) at its exact position between the last two steps, so the motion is even at 60,
75, 90, 120 or 144 Hz without changing the physics or adding any input delay. `PORT=8095 node tools/smooth.js` measures
it in the real game with a synthetic display clock.
F9 is still the collider view.

## The race caller (ElevenLabs commentator voice)
The commentary is a **director** that watches the whole race and tells its story (`public/commentary.js`): it tracks
margins and whether they are growing or shrinking, the groups the field has split into, the pace, horses improving or
going backwards, traffic, wide runs, battles anywhere in the field and a breakaway leader coming back. Every possible
call is scored by how significant and how fresh it is; memory and cooldowns stop it repeating itself (no sentence is
said twice in a race, and once a breakaway is established it moves on to the chasers, the battle for second, the
horses making moves — instead of "X still leads" again). Mid-race it is calm and conversational and allows itself
short silences; it anticipates the home turn, gets more urgent from the 600 and calls a close finish in rapid bursts.
A ten-length winner gets an emphatic, celebratory call; a three-way go gets a frantic one; predictions ("nothing's
going to catch this one") are only made when the race is effectively decided; the winner is named only from the
official result. See `docs/COMMENTARY.md` and real transcripts in `docs/COMMENTARY-SCENARIOS.md`.

Settings → Race commentary voice:
* **ElevenLabs · recorded** (default) — 794 clips recorded with your ElevenLabs voice **"Commentator"** (voice ID
  `MTGAJpjryOZn2Xr8FOtm`, model eleven_v4): every one of the 410 phrases the director can use, each in its own delivery
  (calm mid-race → lively → building → urgent → screaming), and all 128 horse names the game can field (Quick Race,
  career rivals, the 19 choosable career names) in three deliveries each. The captions are exactly what you hear. No
  API key, no internet, no credits. Names that aren't recorded (very old saves with free-text names) are said by the
  local voice (or left to the captions — your choice).
* **ElevenLabs · enhanced** — the same, plus the game server generates missing names *in the same three deliveries
  with your voice* before each race (cached on the server and in the browser, paid for once).
* **Local voice** — your computer's voices or the optional local neural voices (Kokoro / Piper); same director, same
  words. **Off** — no speech.
Use **Commentary test** (seven real calls, from the start to a photo finish and a runaway winner, + "compare with the
local voice"); it shows which backend actually spoke.

### Enabling "ElevenLabs · enhanced" (server-side key — never in the browser)
1. In ElevenLabs: Profile → API keys → create a key (you can restrict it to Text to Speech).
2. On Render: your service → Environment → add `ELEVENLABS_API_KEY` = your key (and optionally the others below) →
   Save (Render redeploys). Locally: `ELEVENLABS_API_KEY=… node server/index.js`. Never commit the key.
3. Settings → Race commentary voice → ElevenLabs · enhanced shows "Enhanced: connected" when it works.

| Variable | Default | Meaning |
|---|---|---|
| `ELEVENLABS_API_KEY` | *(none)* | required for Enhanced mode; without it the endpoint answers `not-configured` and the game uses the recordings |
| `ELEVENLABS_VOICE_ID` | `MTGAJpjryOZn2Xr8FOtm` | the voice ("Commentator") |
| `ELEVENLABS_MODEL` | `eleven_v4` | the model the library was made with; falls back to `eleven_multilingual_v2` if refused |
| `ELEVENLABS_DAILY_CHARS` | `2000` | server-wide daily character cap (about 15 new horse names in three deliveries) |
| `ELEVENLABS_CACHE_MB` | `50` | disk cache size (oldest clips evicted) |

Cost: one credit per character (delivery tags included). The library cost about 18,200 credits to record once (plus
about 1,600 for voice tests and one transcription check); a new horse name in Enhanced mode costs about 120 credits for
its three deliveries, once. The library is rebuilt from the batch recordings with `tools/commentary-batches.js` (the
plan and prompts) + `tools/commentary-library.py` (split, check, level — no API calls).

## Enhanced commentary voice (optional)
Settings → Commentary voice engine: *Standard* (your system's voices), *Enhanced · Kokoro* (most natural; one-time
~105 MB download) or *Fast · Piper* (lighter). After the download everything runs locally. Use **Commentary voice
test** to hear four samples and see how fast the voice generates on your computer — the live race call only uses a
neural voice when it is faster than real time. Self-hosting: `node tools/fetch-voices.js` puts the Kokoro files in
`public/voices/` so your server provides them. Licences: `ASSETS.md`.

## Live race commentary
The same director (above) calls every race in every mode, whichever voice speaks it. Settings: on/off, volume,
captions, voice. With **Local voice** the browser's speech synthesis reads the director's lines (an Australian voice is
picked automatically when the system has one — on a Mac, Lee or Karen); voice quality then depends on the voices
installed on the device.

## Play single-player (no server)

Use either of these:

```bash
npm run build:single
```

Then open `dist/final-furlong-single.html` in a browser. Or run the server locally (below) and open the page it serves.
In the single-file build, the Multiplayer screen explains that online races need the hosted version.

## Run the online version locally

You need Node.js 18 or newer.

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:8080 → **Multiplayer** → enter a name → **Create Private Race**. Open a second
browser window (or a private window) and paste the join link to get a second player on the same machine.
To play with a friend on your home network, give them `http://<your-computer's-LAN-IP>:8080/?join=CODE`.
Over the internet, deploy the server as described below.

## Deploy it so a friend can join from anywhere

The server is one long-running Node process that serves the game **and** the WebSocket on the same URL.
That means it **cannot** go on a static-only host (GitHub Pages, Netlify/Vercel static sites, an S3 bucket,
the Claude artifact page): those serve files but can't keep a WebSocket server running. Use a host that runs Node
web services with WebSocket support. Any of these work:

### Option A — Render.com (simplest; has a free tier)
1. Put this folder in a GitHub repository (the `.gitignore` already leaves out `node_modules` and `dist`).
2. On render.com: **New → Blueprint**, pick the repository. `render.yaml` sets it up: a Node web service with
   build `npm install --omit=dev`, start `npm start`, health check `/healthz`.
   (Or **New → Web Service** and enter those two commands by hand.)
3. When the deploy finishes, Render shows the service URL at the top of its page, of the form
   `https://<service-name>.onrender.com`. That is the game; nothing else needs configuring.
   Render sets `PORT` itself, and WebSockets work on the same URL (`wss://…/ws`).
4. Free instances go to sleep after about 15 minutes with no traffic. The next visit takes up to a minute to wake,
   so open the page a minute before you race. A paid instance doesn't sleep.

### Option B — any Docker host (Fly.io, Railway, Google Cloud Run, a VPS)
```bash
docker build -t final-furlong .
```

```bash
docker run -p 8080:8080 final-furlong
```

On Fly.io, run `fly launch` in this folder (it detects the Dockerfile; set the internal port to 8080), then `fly deploy`.
On Railway, use **New Project → Deploy from GitHub repo**; it uses the Dockerfile and provides `PORT`.
Cloud Run supports WebSockets, but cap the instance count at 1 (see “One server process” below).

### Environment variables
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on (hosts usually set this for you) |
| `HOST` | `0.0.0.0` | Interface to bind |
| `ALLOWED_ORIGINS` | *(empty)* | Extra comma-separated web origins allowed to open a WebSocket, e.g. `https://mygame.example.com`. The page's own host is always allowed. Only needed if the page is served from a different domain than the server. |

The only secret is the optional `ELEVENLABS_API_KEY` (see "ElevenLabs commentary"), which stays on the server.
The browser code contains nothing private.

### One server process
Rooms live in the server's memory. Run **one instance** (the default on Render/Railway/Fly free tiers). With
several instances behind a load balancer, two players could land on different instances and the code wouldn't be found.
Restarting or redeploying the server ends any race in progress and clears all rooms.

### Serving the page from somewhere else
If the game page is hosted separately (say, on a static host) and the server elsewhere, open the page with
`?server=wss://your-server-host/ws` and set `ALLOWED_ORIGINS` on the server to the page's origin.

## How player 2 joins

1. Player 1 opens the deployed URL → **Multiplayer** → name → **Create Private Race**. A 6-character room code appears,
   with **Copy Code** and **Copy Link** buttons.
2. They send the link (`https://…/?join=ABC123`) or just the code to up to 5 friends.
3. Each friend opens the link (the code is filled in) or opens the site → **Multiplayer** → types the code → **Join Race**.
4. Everyone picks a different horse. The host chooses distance, going, number of runners (AI fill the places the riders
   don't), AI skill and incidents. Everyone presses **Ready**, then the host presses **Start Race**. Changing a horse or
   a setting un-readies everyone. If the host leaves, the next rider becomes host.
5. If your horse falls, the camera follows a rider who is still racing. Press **A / D** (or **← / →**) to switch
   between them.
6. After the race, everyone sees the same official result. Each player can watch the replay independently, then press
   **Back to Lobby** for a rematch in the same room.

## Controls

| Key | Function |
|---|---|
| W / S | In the stalls: keep the horse balanced (weight forward / sit back). In the race: effort (tap = 5% step, hold = smooth) |
| A / D | Steer left / right (D always moves your horse to its right, on every course); a tap nudges ¼ lane, holding moves decisively |
| Space | Press the instant the gates open (no countdown; early = the horse anticipates), then tap with the first four strides to push into stride. Mid-race: urge (a nudge). Final drive: tap on the rhythm |
| Shift | Drive — all-out; strongest in the finish, wasteful early or for too long |
| E / Q | Settle (relax, keep rhythm, save energy) / check (a firm pull for traffic — loses momentum) |
| C | Camera |
| Tab | Race stats |
| P | Chaos mode only: your ONE kick of the race — knocks over the horse right beside you (hold A/D for the side) |
| Esc | Pause (single-player only — an online race can't be paused) |

## How the online race works

- **The server is the referee.** It runs the same simulation file (`public/sim.js`) as single-player, at a fixed
  120 steps per second. Race clock, gate timing, physics, AI jockeys, start outcomes, collisions, falls,
  stamina, sprint momentum, results, margins and the replay recording are all computed there. Clients send only
  **controls** (effort target, steering, settle/check/drive, Space presses). Positions, times, stamina and results
  from a client are never accepted.
- **Clients render** about 20 snapshots a second, interpolated, and show the race slightly in the past. The display
  delay adapts to the measured network jitter (from about 100 ms, up to 450 ms on a poor connection), so horses move
  smoothly instead of jumping. Your own effort bar and start marker respond to your keys immediately.
- **Fair starts.** Each rider's reaction time is measured against when the gates opened *on their own screen*. The
  server allows for that rider's measured latency, capped at 0.6 s. A horse that launches late because the message
  was in transit is moved forward by the lag (at most 0.5 s), so a slower connection isn't penalised. The start
  mini-game is also judged against the sweet spot as the rider saw it. The marker position a client reports is
  only trusted within ±0.12 of the server's own copy.
- **No host advantage.** The host only creates the room and chooses settings. Every player connects to the same server
  the same way. Unlimited stamina, the top-speed slider and steering assist are single-player only.
- **Disconnects.**
  - In the lobby, a dropped player keeps their seat for 90 s and can rejoin.
  - In a race, the other riders are told. The race carries on, because it can't pause for one player. The dropped
    player has 20 s to come back; after that, an AI jockey rides their horse home, marked in the results.
  - Reloading the page or a network drop reconnects automatically, using a reconnect token the server issued for
    that seat (kept in the tab's sessionStorage).
  - If a player leaves for good, the others can still finish the race.
- **Falls** (incidents set to Full, the default online):
  - Keep shoving into a horse alongside and you can fall, and the horse you were pushing goes down with you.
  - A horse that falls brings down a horse tangled right beside it.
  - Any horse that gallops into a fallen horse **or its jockey** falls as well. AI riders who are far enough back see
    the crash and either pull up hard or steer round it.
  - Runners within 30 m behind when it happens are too close to react. In tests, about 90% of them went down. AI riders
    30–50 m back mostly pull up or steer round it (about 1 in 5 still fall), and nobody further back falls.
  - The race ends when every rider has finished or fallen. If every rider falls before anyone has finished, the race runs
    on until an AI horse wins it, and everyone spectates the leader.
- **Normal mode** (incidents Stumbles/Full, chaos off) is the opposite for fallers: AI jockeys *do* try to avoid a
  fallen horse when they have the time and room — steering off their line or checking. But a horse that is **on the
  same path and within 40 m of the fall when it happens has no time to react** — it cannot steer round or pull up and
  runs into the body, just as in real life. Horses further back, or whose line misses the body, can still get out of
  the way.
- Falls animate by how they happened: a kick or shove pitches the horse over sideways, a horse that runs into a body
  trips forward over its front legs, and a horse that loses its own footing buckles and rolls. The thrown jockey is
  unseated in every case.
- Developer tool: press **F9** in a race to show the collision rectangles (green standing, orange mid-fall, red on the
  ground, blue the thrown jockey) and red rings at each registered contact. Off by default.
- **Chaos mode** (single-player setup, or the host's lobby setting online; it turns incidents to Full) races like a
  normal event but with the AI bunched up tight, one extra ability and one changed rule:
  - **The AI field runs as a tight column near the rail** — bunched up behind each other, only 3–4 horses wide (about a
    3-lane span) and roughly 20 m front to back, against a field spread right across the track over ~50 m in a normal
    race. Same overall pace; it fans out to sprint in the last 220 m. A connected kick in that column can bring down
    the horses stacked behind it.
  - **One kick per rider per race.** Press **P** (hold **A**/**D**, or the arrows, to choose the side) to kick the
    horse immediately alongside you. It connects only against a horse genuinely in reach of a boot — level with you
    along the track and about 1–2 m to the side, on the chosen side. A connected kick always brings that horse down.
    The kick is spent **only when it actually knocks a horse over** — a miss (nobody in reach) leaves it ready to try
    again. A small HUD chip reads **KICK READY** or **KICK USED**.
  - **No automatic chain reaction.** The kick touches nobody but the target. There is no shockwave and no
    area-of-effect: every further fall comes from a horse *physically running into* a falling or fallen body.
  - **No dodging in chaos.** AI jockeys do not steer around or brake for a fallen horse — they hold their normal
    racing lines. A pile-up builds only where horses actually collide; a horse whose line misses the body races on.
  - A fallen horse is a solid obstacle from the first instant of its fall (not only once it is flat), and stays on the
    track for the rest of the race — even a lap later on the longer trips. Its hitbox matches the visible body.
- **Rooms** are removed 5 minutes after everyone leaves, or after 45 minutes of inactivity. The server holds at
  most 400 rooms.

## Security limits
- Room codes are 6 characters from a 31-symbol alphabet (no 0/O/1/I/L), from a cryptographic RNG.
  That gives about 887 million possible codes.
- Reconnect tokens are 144-bit random values, compared per seat.
- Every message is size-capped (4 KB), rate-limited per connection (token bucket, ~80/s sustained) and validated.
  Names are cleaned and limited to 16 characters. Settings must come from fixed lists, and only the host may change them.
- Each room holds at most 6 players. Each IP may hold at most 12 connections.
- The WebSocket only accepts browser connections from the game's own origin, plus any in `ALLOWED_ORIGINS`.
- There are no accounts, chat or public matchmaking. Only someone you give the code to can join.

## Tests
```bash
node tests/season.js            # championship + rivals: seasons, points, tie-breakers, skips, H2H, retirement, migration
node tests/randwick.js 2        # track engine + Royal Randwick: geometry, route lengths, chutes, navigation, AI races
node tests/progression.js 2 24  # beginner balance + development speed with the real engine (good vs bad riding)
node tests/commentary.js 36     # commentary checked line by line against 36 real simulated races
node tests/commentary-scenarios.js 160   # seven kinds of race (packed, wire-to-wire, caught late, midfield run, static, three-way, photo)
node tests/eleven-plan.js        # every phrase and horse name recorded in the new voice
node tests/season_balance.js 10 # division balance with the real race engine (multi-process)
node tests/career_difficulty.js 100 3   # career difficulty vs Quick Race Hard (new horse, normal, finals)
node tests/riding-control.js     # the start, riding actions, steering, personalities, final drive and the lunge
PORT=8095 node tests/career-browser.js   # (server running) career, chaos isolation, save migration and spoken commentary in a real browser
npm run test:protocol
```
A headless run against a real server. It fills a room to 6 riders, turns away a 7th, and has two leave. The other 4
then race. It also covers lobby errors (no such room, horse taken, host-only, not ready, bad token), identical
results for all four, per-rider snapshot detail, the replay download and rejoin.

```bash
npm start
```

With the server running, in another terminal:

```bash
PORT=8080 npm run test:mp
```

Two real browser sessions (Playwright) play a race through the UI. Add `LAT=120 JIT=80` to route the second player
through a laggy proxy. The test checks that the two screens agree, that movement is smooth, the start outcomes, a
mid-race disconnect and reconnect, identical results, results lines, replays and the return to the lobby.

With the server started as `FF_TEST_HOOKS=1 npm start`:

```bash
PORT=8080 node tests/mp-spectate.js
```

Three browsers race; one rider is made to fall (a test-only command that only works with `FF_TEST_HOOKS=1`, so never
set that on a public server). The test checks spectating, switching riders with D, the results lines and that all
three see the same order.

With the server started as `FF_TEST_HOOKS=1 npm start`, `node tests/mp-chaos.js` checks the online chaos setting, the
one-kick rule, that the kick causes no field-wide collapse, and a race where both riders fall (it must run on to an AI
winner). `node tests/mp-leader.js` checks in two browsers that both riders spectate the leading horse.

```bash
npm run test:sim
```
112 simulated races checking balance and incidents. `node tests/pileup.js public/sim.js full 60` shows who goes down
behind a faller, by distance. `node tests/pushfall.js public/sim.js` checks that shoving a horse into a fall takes it down too. `node tests/chaos.js public/sim.js` runs the chaos scenario suite (kick reach and the one-kick rule, that only the
target falls, contact-only chains, bodies solid mid-fall, horses passing clear, lap persistence).
`node tests/avoid.js public/sim.js` checks that normal mode avoids a faller when it can but not when boxed in, and that
chaos never applies that avoidance.
