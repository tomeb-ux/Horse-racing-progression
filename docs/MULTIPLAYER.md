# Online races (private rooms) — how to play and how to deploy

## Playing
1. The host opens the **hosted** game (your Render URL — the single-file build has no server) and presses **MULTIPLAYER**.
2. Enter a name → **CREATE RACE**. You get a 6-letter room code and an invite link (`…/?join=ABC123`). Send either to up to five friends.
3. Everyone picks a horse in the lobby:
   - **★ Career horses** — your own horses from Career Mode with their *real* ratings: trained attributes, fitness and age as they stand today. Your training, facilities and
     staff all feed in because they raise the horse's attributes. Quick Race horses are always available too. Nobody can pick the same horse twice.
   - The host sets distance, going, difficulty, incidents, field size (the rest of the field is AI) and chaos.
4. Everyone presses **READY**; the host presses **START**. The server runs the race (same `sim.js` as single-player); your browser interpolates the snapshots,
   so every screen shows the same race. Reconnecting mid-race is supported (20 s grace).
5. **Results**: official order on every screen, photo-finish/highlight replays, race call. **REMATCH** returns you to the lobby already ready with the same horse; **Back to
   Lobby** lets you change horse/settings first.

## What online racing does for your career
- Every online run goes on the career horse's **online record** (runs, wins, places, last 10 results).
- **Prize money** goes into the career bank: 1st $5,000 · 2nd $3,000 · 3rd $1,800 · 4th $1,000 · 5th $600 · other finishers $300, scaled up with the number of human riders
  (×1.0 for 2 … ×1.5 for 6) and the distance (0.7–1.3×). A **solo** run or a fallen horse pays nothing; each race pays once (ledger key = race seed + horse); capped at $20,000 per
  horse per career day.
- **Online milestones** (total online wins across your stable): 1 → $2,500 · 5 → $8,000 · 10 → $15,000 · 25 → $40,000, each paid once.
- Online races give **no** experience, training points, career starts or championship points — those stay a single-player (Career) achievement, so friends can't farm the season.
- Career data is saved in the browser (`localStorage`), with export/import in the Office tab. A friend's career horse never touches your save.
- The server validates every career horse (attributes clamped 30–99, names sanitised) — it cannot be used to cheat the race itself.

## Deploying on Render (web service)
1. Push this repo (branch `claude/amazing-clarke-jzpr1x`, or whichever branch you choose) to GitHub.
2. Render → **New → Web Service** → connect the repo → choose the branch. `render.yaml` in the repo pre-fills everything:
   Runtime **Node**, Build `npm install --omit=dev`, Start `npm start`, Health check `/healthz`.
3. Pick the region nearest your players (e.g. **Singapore** for Australia). Create the service. WebSockets work on the same URL (`wss://<service>.onrender.com/ws`) — no extra setup.
4. Optional: add `ELEVENLABS_API_KEY` (and `ELEVENLABS_VOICE_ID`) under Environment for live commentary names.
5. Open `https://<service>.onrender.com/` → MULTIPLAYER → create a room → send the code/link.

Notes: rooms live in the server's memory, so run **one instance**. The free tier sleeps after ~15 min idle (the first visit wakes it in ~30–60 s; open the page before your friends join) and a
restart ends open rooms. For smooth racing prefer a paid always-on instance; keep every player in the same region if you can.

## Local test
```
npm install
npm start                      # http://localhost:8080
FF_TEST_HOOKS=1 PORT=8095 node server/index.js   # for tests
PORT=8095 node tests/mp-protocol.js && PORT=8095 node tests/mp-e2e.js && PORT=8095 node tests/mp-career.js
node tests/online-rewards-core.js
```
