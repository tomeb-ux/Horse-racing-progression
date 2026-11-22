# Final Furlong — change log

## Update: a race caller who tells the story of the race, in your new ElevenLabs commentator voice
- **New commentary director**: instead of announcing the leader over and over, the caller watches the whole race —
  margins and whether they are growing or coming back, the groups, the pace, horses improving, boxed in, wide or under
  pressure, battles anywhere in the field — and chooses what is worth saying by significance and freshness, with memory
  and cooldowns so nothing is repeated without something having changed. Once a horse has opened up a big break the
  call moves to the chasers, the battle for second and the horses making moves (lines about the leader alone fell from
  45% to 19% of mid-race calls in testing), and comes back to the leader when the margin really changes or it starts to
  come back to them. Calm, conversational mid-race with short deliberate silences; anticipates the home turn; urgent from
  the 600; rapid-fire in a close finish; emphatic and celebratory for a runaway. Predictions only when the race is
  decided; the winner only from the official result.
- **New voice**: every phrase and name re-recorded with "Commentator" (ID MTGAJpjryOZn2Xr8FOtm); the old voice's clips are
  gone. 794 clips: 410 phrases each in its own delivery (calm → lively → building → urgent → screaming) and all 128 horse
  names in three deliveries (mid-race, excited, screamed). Delivery chosen from four test recordings measured for
  pitch, level and speaking rate; captions are exactly what is said.
- **Playback**: clips decoded just in time and scheduled on the audio clock (tight joins, no overlaps, stale lines
  dropped); median 3 ms from the caller's decision to sound.
- **Commentary test** in Settings: seven real calls (start, mid-race story, home turn, close finish, your horse, photo
  finish, runaway winner).
- **Enhanced mode** generates custom names in the same three deliveries. Credits: about 19,800 used of 32,319 this
  month; 12,502 left (details in docs/COMMENTARY.md).
- Tests: `tests/commentary-scenarios.js` (160 races: packed field, wire-to-wire, runaway caught late, midfield
  finisher, little movement, three-horse battle, photo finish — every call checked against the race), new
  `tests/eleven-plan.js` (library completeness and delivery), `tests/eleven-browser.js` (real decoding and playback).

## Update: smarter pack racing, immersive cameras, a better jockey, a Flemington infield worth looking at
- **AI jockeys with personalities**: every rival is a front-runner, stalker, rail rider or closer (shown under each
  name in the Tab stats panel). Front-runners press on early; stalkers sit handy; rail riders hug the fence and wait
  for a gap; closers drop out and come wide and late. Riders actively tuck in behind a horse for cover, stay on the
  rail to save ground, and make mistakes: some kick too early and empty out, some wait too long. Horses that are
  boxed in genuinely cannot go until a gap opens (yours included). Measured over 60 simulated races, mid-race:
  horses racing in cover 12.5% → 15.0%, horses held up 7.1% → 8.5%, the field slightly more compact.
- **Chase camera**: closer and lower behind your horse with a narrower lens, so the horse fills the frame; the
  camera eases away on a surge and drifts to show a rival sliding back as you pass it (or coming past you). Through
  the home turn it lifts and looks further ahead to reveal the straight and the stands; in the last 250 m it drops
  lower behind the horse with a subtle widening of the view.
- **Jockey camera**: the horse's neck and ears in view, with motion synced to the gallop but stabilised like a real
  rider's head (steadier when the horse is settled, more ragged when it tires), a small forward surge each stride,
  a lean into acceleration. No added shake; steering is never affected by the camera.
- **Jockey model**: a proper skull cap with peak and pompom, goggles with lenses and strap, a face with nose, chin and
  ears, a hair line at the nape, broader chest and shoulders, slimmer forearms and gloves, knees in the riding
  breeches, and a silk sheen on the colours.
- **Flemington infield**: mown stripes across the whole lawn, 18 tree groves (plane trees, gums, figs, cypress
  windbreaks), the lake with fountain and roses, an avenue of trees and clipped hedges on the promenades, a training
  centre (three stable barns, a horse walker, a round yard), an inner sand training track, picnic lawns with café
  umbrellas, flag lines and light towers.
- **Replays**: some of the crowd wave and clap in the replay and the winner's celebration (still static during the
  race itself).
- **Feature-race tiles removed** from the title screen: The Everest and the Melbourne Cup are reached through Career.
- **Parade ring at Randwick**: the horses were walking below the lawn (sunken ring); the ring is now level.

## Update: static crowd, screen-relative steering, more emotional race calls in your voice, name list, new menus
- **Crowd is static**: one fixed pose per spectator (no per-frame animation) with a much cheaper shader; the simpler
  spectator models take over sooner. Finish-straight crowd ~270–365k triangles (was ~475k last update, >2M originally).
- **Steering**: D always moves your horse to its right (right of the screen when riding forwards), A to its left, on
  every course. At Randwick D therefore goes towards the rail. 70 steering checks.
- **No more static**: the continuous wind / crowd-hiss / pack-rumble noise beds are muted.
- **Career horse names** are chosen from a list of 19 names, all recorded in your ElevenLabs voice (excited and shouted).
  Rivals only ever get recorded names (and never one of yours) — every name in a career race is now said in your voice.
- **Commentary**: 77 new clips in your voice (227 total): big-race colour, the turn, stride-for-stride battles, the
  crowd on its feet, emotional winner calls pitched to the margin, more lead-ins, shouted names for the climax, the 13
  new names. Calls come more often mid-race and empty moments are filled with colour calls.
- **Menus**: a new title screen (feature-race tiles for The Everest and the Melbourne Cup); Select Horse moved into
  Quick Race ("Your horse · Change horse").

## Update: steering fix, smoother racing, Flemington grandstand repair, your ElevenLabs commentator
- **Multiplayer temporarily disabled** (menu button hidden; all online code kept — `?mp=1` re-enables it for testing).
- **Steering at Royal Randwick**: the horse, rider and HUD were drawn as if every course were left-handed. At a
  right-handed course D moved the horse outwards (correct — the outside rail is on your left there) while the horse
  leaned and turned its head towards the rail, horses leaned OUT of bends, and the radar showed the rail on the wrong
  side. All presentation is now rail-relative on both kinds of course (A = towards the rail, D = wider); the radar
  mirrors on right-handed courses; a start hint explains it. Simulation unchanged. 70 steering checks.
- **Flemington Club Stand repaired**: a real podium/concourse under the floors, full-height floors (no see-through
  slits), double-sided slabs, end cores and a column line; the same see-through causes fixed in every stand (thin roofs,
  open seating ends and undersides). No spectators on the barrier: staff stand on the ground; crowd spots are checked
  against the racing surface and building interiors.
- **Performance**: rail posts, trees, roses and spectators are culled in cells with detail by on-screen size; new
  simple spectators (≈130/56/24 triangles); three horse/rider detail levels; tighter shadow volume; buildings batched
  per material; HUD blur off during races; the original course's CPU-animated crowd replaced. **AUTO graphics**
  (default) with hysteresis and cooldowns; **F8** performance overlay.
- **ElevenLabs commentary** in your voice (ID OQt0mf8rKBYkweCSQ9d4): 150 recorded clips (starts, stages, markers, photo
  finishes, winners, lead-ins, 115 horse names) played by a clip planner that follows the live race call; optional
  server-side "enhanced" mode generates missing names with your voice before the race (key in an environment variable,
  cached, rate- and budget-limited). Commentary test with six situations, backend shown, comparison with the local
  voice. Modes: ElevenLabs recorded · ElevenLabs enhanced · Local voice · Off.

## Update: Flemington, rebuilt racecourses, realistic horses and jockeys, race-day presentation, neural commentary voice
- **Flemington** (left-handed, 2312 m, 450 m straight, pear shape, sweeping home turn from the 1200 m) with the real
  **Straight Six** (1000–1200 m races run dead straight: no bend loading, no ground lost for width, no "final bend")
  and the **Melbourne Cup** route (start up the straight course, past the post at 888 m, a full lap). Career races at
  Flemington now run there; Quick Race has the course too. Fixed a latent AI bug (an early "check" never expired).
- **Racecourses rebuilt** (`gfx.js`, `venues.js`): image-based lighting from a procedural sky, a new turf shader (mowing
  stripes, relief, worn running line), five tree species with wind, a GPU-animated crowd that watches and reacts to the
  race, rails that follow the geometry exactly. Royal Randwick: the five-level grandstand with its translucent fabric
  roof, the Theatre of the Horse, Owners' Pavilion, heritage stand, Kensington track, Sydney skyline. Flemington: the
  Club Stand with its petal bands, the Grandstand and Hill Stand, roses along the straight, the mounting yard, the
  river, Melbourne skyline. Graphics quality presets (High / Medium / Low).
- **Horses**: athletic thoroughbred barrel and underline, coat shading with sheen and tone, a mane of real locks and a
  tail with loose strands, both moving in the wind; a walking gait. **Jockeys**: proper short-iron racing crouch (knees
  forward, flat back), anatomical body, face, gloves, boots, satin silks with folds that flutter.
- **Broadcast director**: long-lens coverage that frames the leaders and your horse (towers, tracking camera, head-on
  down the straight, finish camera), smoothly panned and zoomed.
- **Race day**: Australian-style barrier unit with split doors and attendants; optional, skippable **parade ring**
  before feature races; **winner presentation** with the official time and margin and a trophy for feature races.
- **Enhanced commentary voice** (optional, free, local): Kokoro neural TTS (or the faster Piper) in a Web Worker, a
  one-time download stored in the browser, streaming playback with lookahead, late lines dropped rather than played
  stale, a broadcast audio chain; automatic fallback to the system voice when the computer is too slow. New **voice
  test** in Settings with four samples and the measured speed.

## Update: 3D racing stable, new horse creator, faster development, persistent rivals, a real race-caller, and Royal Randwick
**A 3D Australian racing stable** (`public/stable3d.js`). Career screens now sit inside a timber-and-steel stable block:
concrete aisle, five loose boxes with grilles and sliding doors, straw beds, buckets and hay nets, a tack wall (saddle racks,
bridles, rugs, feed bins, hay), a trophy corner, and a rubber-floored grooming bay lit by daylight through the open doors.
The horses are the game's real procedural models (same anatomy, coat shading, markings, silks and skeleton as in a race).
Orbit the horse by dragging, zoom with the wheel / pinch / buttons, presets for full body, head, legs, silks and rear, and a
reset. Click a box to open that horse; click a trophy to inspect it. Indoor exposure keeps light coats detailed.
- **Horse creator, rebuilt in five steps** (appearance → silks → ability → potential → review), side panel over the live 3D
  bay, free movement between steps. Eight coats, six face markings, **white markings chosen leg by leg** (coronet / sock /
  stocking), sliders for build, muscularity, neck length, neck thickness, head size, mane and tail length, mane and tail
  colour, 16 silk colours × 9 patterns (the jockey mounts up to show them), and an optional **"commentator says it as"**
  pronunciation. Every change rebuilds the real model instantly (render caches are now keyed by the full appearance — the
  old name-only cache could show a stale look). Cosmetic changes are allowed after creation; abilities are not.
- **Stronger starters + chosen potential**: attributes start at 54 with 136 points to spend (max 84) → rating ≈ 71; a
  separate **168-point potential budget** sets each attribute's lifetime ceiling (≥ current, ≤ 98). The projected profile
  ("Elite sprint potential", "Limited staying potential", "Suitable distance 1000–1400 m") comes from the real attributes.
- **Faster training**: XP → training points at 1 per 2 XP; cheaper early upgrades; costs still rise steeply near the top.
  The training screen shows current / potential / next cost / the real engine effect of each upgrade (e.g. "+0.14 km/h
  top speed"), upgrades apply immediately with an animated bar and an undo. Older horses get a **one-time potential
  redistribution** (total unchanged). Measured with the real engine: rating ≈73 after 3 races, ≈80 by race 12, ≈84 by
  races 17–20 when ridden well; a badly ridden horse still loses.
- **Five-box stable overview** (one horse per box, names on plaques, bottom strip of cards), horse profiles (stats, form,
  majors, current/potential bars, prev/next), and a **3D trophy room** with real career trophies.
- **Persistent rivals** (`season.js` v3): 93 named AI horses in 31 stables, each with its own attributes, potential and
  development rate. Grade bands: Provincial ~55–63, Metropolitan ~64–72, Feature Series ~72–80 plus a few established stars.
  Rivals improve only through their own races (never scaled to the player), eventually retire at their peak and are
  replaced by new prospects. The other two championships race on in the background, so every rival has a real career.
  Optional-race fields are grade-matched from the whole population. **Head-to-head** records per pair (meetings, who
  finished ahead, closest finish, recent meetings) feed a **Rivals** screen and a rival profile (shown in the grooming bay).
- **Pre-race form guide** on every event: rating, last-5 form, wins/starts, majors, best distance, strengths, trip
  suitability (Excellent/Good/Fair/Poor from the distance model) and head-to-head — contenders marked, no favouritism.
- **Commentary rebuilt as a continuous race call** (diagnosis in docs/WORKLOG-P2.md): instead of isolated sentences each
  ending in "!", the caller links 2–3 clauses per line ("…still leads, but X is improving on the outside, and Y is
  travelling nicely in fourth"), calls the field from leader to last mid-race, then chains short bursts through the straight
  with the distance markers folded in. Long names are shortened after first mention; the pronunciation override is used;
  rivalries are mentioned only when your saved head-to-head history supports it. Pace rises gently (0.97 → ~1.16) and
  pitch barely moves. Measured on the same races: speaking 83 % of the race (was 63 %), longest silence in the last 25 s
  0.4 s (was 3.8 s), 2.9 clauses per line (was 1.5). If speech fails to play, captions keep a natural pace.
- **Track engine** (`sim.js`): courses defined by curvature segments with clothoid easements, integrated to an arc-length
  table and solved to close at the published circumference; each race runs on a route (with chute support). Bend load,
  balance, ground lost wide, AI turn anticipation, gates, markers, cameras, replays, minimap and photo finish all use the
  real geometry. The original oval keeps its exact formulas (multiplayer + every balance test unchanged).
- **Royal Randwick** (right-handed, 2224 m, 410 m straight, 28 m wide, sprint chute for 1200/1400 m): its own venue
  (`venues.js`) — modern glass grandstand with a cantilevered canopy, heritage and lawn stands, finish post / judge's box /
  gantry, infield trees, service roads and sheds, big screen, boundary trees and city skyline, landmark boards (THE RISE,
  HOME TURN, KENSINGTON END), crowd sized to the meeting. Every Career race at a Randwick venue runs there (The Everest,
  Doncaster, Derby, Spring Sprint, Chairman's, Kingsford, Maiden…); Quick Race has a Course option. Exact bend radii and
  chute angles aren't published in a usable form, so they are estimates documented in sim.js.
- **Fixes**: online, the caller could name the wrong winner when a "finished" flag arrived before the official time (now
  only timed finishers count); v2 saves gave a stable's sprinter and stayer the same id (resolved in migration).
- Save schema **v3** with automatic migration from v1/v2 (backup copy kept in localStorage before migrating).

## Update: Australian championship seasons, optional races, qualification and live spoken commentary
**Career Mode is now a real championship.**
- **Three tiered championships with promotion**: Provincial (10 rounds) → Metropolitan (10 rounds) → Group 1 Feature
  Series (12 rounds incl. The Everest, Cox Plate, Caulfield Cup, Melbourne Cup). Top 3 promoted. Each round has a venue,
  distance, grade, going and prize; the original career races are all kept (same ids, so old history still counts).
- **Stable vs recurring AI stables**: one runner per stable per round; points 15-12-10-8-6-5-4-3-2-1 from real results;
  tie-breakers wins → seconds → best feature result → fixed order. AI stables keep their names, silks and horses
  season after season (stable and horse ids stored for the rival systems planned next).
- **Skip a round** (with a clear warning): no points, AI result recorded from a seeded model, can't be claimed later.
- **Optional races** any time: experience/records only — never points, trophies or season progress. XP is reduced
  when the field is far weaker than your horse, so farming easy races isn't the quickest route.
- **Qualification** for feature races from your horse's own results (sprint/staying qualifiers, recent form, rating);
  the event screen explains every requirement per horse.
- **Dashboard**: season, round, position, points, next event (venue, distance, going, grade, prize), standings,
  recent results, upcoming feature; plus Season Calendar, Standings, Championship History and season-end screens.
- **Post-race championship update**: "CHAMPIONSHIP POSITION: 4TH → 2ND · +12 POINTS · 6 POINTS BEHIND …" on the
  results screen. Each official result (round result, points, AI standings, horse XP, qualification history, calendar)
  is committed once, in a single save; reloading or re-running the hook awards nothing twice.
- **Faster development** (at your request): new horses start at ~70 rating (was ~65) with a higher, still uneven,
  potential ceiling; every race now converts XP into training points; cheaper early upgrades. Existing horses keep
  their attributes and benefit from the faster training.
- **Chaos fix**: career races previously inherited the Quick Race Chaos setting. Official and optional career races now
  build their own config with chaos, the kick, stamina assist and experimental options forced off.
- **Removed** the separate stock-horse "Championship" menu mode — Career is the championship now.
- DNF in a career race is now recorded (it previously skipped the career result and the Continue button).
- Save schema v2 with automatic migration of v1 careers (horses, looks, attributes, potential, training, trophies,
  wins and history kept).

**Live spoken race commentary** (new `public/commentary.js`), in every mode including online races:
- Event-driven calls (break, slow starts, early pattern, leader changes, movers, traffic, wide runs, bunching, falls,
  halfway, home turn, 600/400/300/200/100 m, challenges, fight-backs, the finish) with a varied phrase library.
- Excitement model (1–5) from distance to go + gap to second + number of horses in contention + race prestige; it
  drives speaking rate, pitch, volume, call frequency and crowd level. Runaway winners are not called as close.
- Lines are written at the moment they are spoken from the current race state, expire if stale, never overlap, never
  repeat; urgent news interrupts. Silent as the gates open. Photo finishes wait for the timing before naming a winner.
- Settings: commentary on/off, volume, captions, voice (Australian voice chosen automatically when available).
  Ambience ducks slightly while the caller speaks; feature-race crowds lift with the call. Stops on pause, quit,
  restart, replays and results.
- Online: each browser calls the race from the authoritative snapshots it already receives — nothing is sent, the
  simulation and results are untouched.

## Update: Career Mode, custom horses & the Australian feature-race ladder
A full single-player Career Mode, built on the real racing engine (a career horse becomes a normal race entry, so the
physics, starts, stamina, rhythm sprint, chaos and incidents all apply unchanged). Everything saves to the browser.
- **Create your own horse.** Name it, then choose coat (7 types incl. palomino), face marking (star/stripe/blaze/snip),
  socks, build, mane and tail colour, and jockey silks — primary + secondary colour and a pattern (hoops, sash,
  quartered, stars, chevrons, braces, diamond, crossbelts). A live 3D preview updates as you change it; it uses the
  game's own horse/silk rendering, so your horse looks like any other on the track, HUD, leaderboard and replays.
- **Attribute allocation.** Every new horse spends a fixed development budget across the eight real simulation
  attributes (top speed, acceleration, endurance, sprint, recovery, temperament, agility, starting). You can raise,
  lower and reset before confirming; the predicted racing style (sprinter / front-runner / stayer / closer / tactical /
  all-rounder) updates as you go. New horses are deliberately inexperienced and improve by racing.
- **Develop through racing.** Each career run earns XP from the race's tier, the opponents' strength and your finish —
  placing in a hard race can beat winning an easy one, so there's no farming the softest event. XP gives levels and
  training points. The **Training** screen spends points on attributes with **diminishing returns** (85→90 costs far
  more than 60→65), capped by each horse's **individual potential** (a fixed, uneven ceiling set at creation — talents
  and limits, so no horse maxes everything and you can't re-roll a perfect one).
- **A stable of horses.** Start with one; winning features unlocks more slots (up to five). Each horse keeps its own
  look, attributes, potential, level, training points and race record — train one and the others are untouched.
- **Australian feature races.** A laddered, fictional season from a Maiden Plate up through Listed/Group races to the
  Group 1 majors — Golden Slipper, Newmarket Handicap, Doncaster Mile, Golden Eagle, Australian Derby, Caulfield Cup,
  Cox Plate — and the two crown jewels, **The Everest** (1200 m) and the **Melbourne Cup** (3200 m). Races unlock as
  you win and require a minimum horse rating; the field gets stronger each tier. A rookie can win maidens; only an
  elite, well-trained, well-ridden specialist takes a crown jewel — and a sprinter won't win the Cup, nor a stayer the
  Everest. Wins fill a **Trophy Cabinet**.
- **Quick Race, Championship, Multiplayer and Chaos are unchanged** and still selectable on their own.
- **Removed:** the "unlimited stamina / top speed" experimental option and the extreme 5000 m / 30000 m distances
  (the 3200 m Stayers trip remains — it's the Melbourne Cup distance).

## Update: chaos pack is a narrow column, and a missed kick isn't wasted
- **The chaos AI now runs as a tight column near the rail** — bunched up behind each other, 3–4 horses wide (about a
  3-lane span) over roughly 20 m, instead of stacking into a short wide block. Each AI horse eases toward the rail when
  it has room, and the traffic rules keep them from overlapping, so they form a column; the field fans out to sprint in
  the last 220 m. Measured at ~3.3-lane span / ~3.9 abreast in chaos vs ~9.7 lanes / 2.6 abreast normally. Winning time
  is barely changed (~1 s over 1000 m).
- **A missed kick no longer uses up your kick.** The one kick is spent only when it actually knocks a horse over; if
  nobody is in reach you get "No horse in reach — kick still ready" and can try again.

## Update: tighter chaos pack, bigger fallen hitbox, no last-second miracles
- **Chaos pack rides closer together.** A gentle, bounded speed regulator (≤10%, off in the final 220 m) pulls the AI
  field into a tight bunch — about 10 m front to back into the final bend of a 1000 m race, down from ~50 m — so a kick
  in the pack can bring most of it down. The winning time is barely affected (~1.4 s slower over 1000 m).
- **Fallen-horse hitbox enlarged** so a running horse that clearly reaches a body trips over it more reliably. It still
  tracks the visible body (checkable with the F9 collider view), just with a little more margin.
- **Normal mode: no reacting from right behind.** A horse on the same path and within 40 m of a fall when it happens is
  now committed — it does not steer around the body or pull up, because there is no time, and it runs into it. Horses
  further back or off the line still try to avoid, as before.

## Update: realistic contact-based chaos and better falls
This replaces the earlier chaos "domino" behaviour. Chaos is now a normal race plus one deliberate knockdown; pile-ups
only grow through genuine collisions, never an area-of-effect.
- **Chaos is a normal race again.** No more faster rider horses, no squeezed AI pack and no speed regulators — the
  physics, speeds, stamina and AI are identical to a normal race. The only differences are the kick and the fallen-horse
  rule below.
- **One kick per rider per race.** P (hold A/D or the arrows for the side) kicks the horse immediately alongside. It
  connects only against a horse in real reach — level along the track and 1.0–2.1 m to the chosen side. A connected
  kick always brings the target down; a miss (or wrong side / too far) still spends the kick. A HUD chip shows KICK
  READY / KICK USED.
- **No automatic chain reaction.** Removed the old radius/distance knockdown and the "tangle everyone nearby" code. The
  kick affects only its target. Every further fall now comes from a horse physically overlapping a falling or fallen
  body — real collision rectangles along the track, tested each 120 Hz step (≈0.15 m of travel, so contacts are not
  skipped). A horse that misses the body by enough stays up.
- **Fallen horses are solid from the first instant** of the fall, not only once flat, and stay on the track for the rest
  of the race — including a lap later on 2000 m+ trips (world-position collisions, not lap-relative). The hitbox grows
  from the standing shape to the lying one and tracks the body; the thrown jockey is a second, smaller obstacle.
- **Chaos removes the dodge.** AI jockeys no longer steer around or brake for a fallen horse in chaos — they hold their
  lines, so pile-ups come from contact alone. **Normal mode keeps the dodge:** jockeys avoid a faller when they have
  time and room, but a horse boxed in right behind it still collides.
- **Falls animate by cause.** A kick/shove pitches the horse over sideways; running into a body trips it forward over
  its front legs; losing its own footing buckles and rolls it. The ragdoll clip is pinned to the simulation's slide so
  the visible body, the hitbox and the cameras agree throughout.
- **Highlights show every fall.** A chain of falls close in time is grouped into one continuous pile-up clip that runs
  until the last horse is down; isolated falls and the kick get their own clips. Replays use recorded state only — no
  fall is invented on replay — and the photo finish is unchanged.
- **Developer collider view (F9):** draws every collision rectangle and contact point; off in normal play.

## Update: Chaos mode, the P kick, and spectating the leader
- **Chaos mode** (Quick Race / Championship setup, and a host setting in the online lobby):
  - The riders' horses are about 6% quicker, with a little more acceleration.
  - The AI horses race as one tight pack: they ease off when ahead of it, push on when behind, keep their legs, and squeeze in towards the rail until the home straight.
  - Into the final bend of a 1000 m race the pack measured about 10.5 m front to back and about 6 lanes across, against about 52 m and about 10 lanes normally. The winning time is unchanged (56.1 s against 56.5 s).
  - Falls go through the pack like dominoes: every faller tangles its neighbours, nobody within 60 m behind can avoid it, and any contact with a body brings a horse down.
  - Pushing the front horse of the pack over in the final bend brought down 97% of the AI horses behind it (every race lost at least 90%).
  - Chaos races with no pushing had no falls at all (0 of 30).
  - Chaos turns incidents to Full.
- **P: kick.**
  - In chaos mode the jockey lashes out with a boot at the horse right alongside, which goes down and starts the dominoes. The jockey's leg kicks out on screen.
  - There are 2.5 s between kicks. With nobody in reach you get "Nobody alongside to kick".
  - Online, the server decides who is in reach.
  - The kicker swerves clear of the horses tangled beside them, but can still gallop into bodies ahead.
- **Everyone down online:** if every rider falls before anyone finishes, the race runs on until an AI horse wins. Everyone spectates the leading horse ("SPECTATING THE LEADER").
- **Spectating an AI horse:** its stamina and sprint-reserve bars are hidden, because the server doesn't send them for AI horses.

## Update: bigger pile-ups and more lifelike falls
- **Pile-ups.**
  - Any runner within 30 m behind a horse when it falls is too close to react: no emergency pull-up, no swerve.
  - A fallen horse's thrashing body and legs now cover about 1.5 lanes either side.
  - Measured over 60 forced falls: 89% of horses 0–15 m behind and 94% at 15–30 m went down (about 91% overall). About 18% at 30–50 m still fell, and nobody further back.
- **Falls look alive, not limp.**
  - **Horse:** the ragdoll has muscle tone. The neck stays in front of the shoulders (no more head folding back along the body), the legs stay mostly straight and can't tuck under the belly, and the four legs don't bunch together.
  - **Once down, it struggles:** its legs paddle in diagonal pairs and its head lifts twice, as if trying to get up, before it settles.
  - **Jockey:** arms and legs no longer fold right up.
  - The jockey still lands about 2.7 m ahead and about ⅔ of a lane to the side, which is where the simulation treats them as an obstacle.

## Update: bigger rooms, spectating and real pile-ups
- **Up to 6 riders per private room.**
  - AI runners fill the rest of the field. The host picks the total number of runners, and the lobby shows how many will be AI.
  - Everyone must pick a different horse and be Ready before the host can start.
  - If the host leaves, the next rider becomes host.
  - Every rider gets a ★ name tag, a highlighted row in the running order and a blue dot on the map.
  - The results line lists everyone in finishing order.
- **Spectating.**
  - If your horse falls in an online race, you watch the fall for about 3 seconds. Then the camera follows a rider who is still racing, with a "SPECTATING ★ name" banner.
  - **A / D** (or ← / →) switches between riders, with a camera cut.
  - The speed and stamina panel shows the rider you're watching, and your riding controls are hidden.
- **Crashes (incidents Full):**
  - Shove into a horse until you fall, and the horse you were shoving goes down with you.
  - A horse that falls brings down a horse tangled right beside it.
  - Galloping into a fallen horse **or its jockey** brings a horse down. Before, it slammed to a near-stop and stumbled. The jockey now counts as an obstacle where the ragdoll lands.
  - AI riders far enough back see the crash and pull up as hard as a horse can, or steer round it. Before, the normal "follow the horse in front" logic could cancel their braking.
  - Measured over 60 forced falls: about 81% of horses 0–15 m behind went down, about 48% at 15–30 m, and almost none further back.
- **Ragdoll fix:** in some falls (e.g. about 12 m/s, rolling one way) the jockey could shoot several metres into the air a few seconds after landing. The rider's joint limits no longer add energy, and body parts have a speed cap.
- Online races now default to incidents **Full**.

---

## Update: private online two-player races
- **Multiplayer menu.**
  - **Create Private Race** gives a 6-character room code, with Copy Code and Copy Link buttons.
  - **Join Private Race** works from the code or the link; `?join=CODE` fills the code in.
  - Errors are clear: no such room, room full, race already started, invalid code, connection failed, server not available.
- **Lobby.**
  - Shows both names, horses and Ready state.
  - A horse your friend has taken is greyed out.
  - Only the host can change the settings: distance, going, AI runners (4–10), AI skill and incidents.
  - Changing a horse or a setting un-readies both players. The race starts only when both are ready and the host presses Start.
  - After the race, **Back to Lobby** gives a rematch in the same room.
- **The server is the referee.**
  - A small Node + `ws` server runs the same simulation file as single-player, at a fixed 120 Hz. It owns the clock, gate timing, physics, AI, starts, collisions, incidents, falls, results, margins and the replay recording.
  - Clients send only their controls. They render interpolated snapshots (~20 Hz), with a display delay that adapts to the measured network jitter.
- **The simulation is split out.**
  - `sim.js` is now its own file.
  - The rider controls (`applyRiderInput`) and the Space presses (`riderPress`) are now shared functions, so single-player and the server apply identical rules.
  - The race supports two human horses.
- **Fair starts.**
  - Reaction time is measured against the gate opening on each rider's own screen. The latency allowance is capped at 0.6 s, and a late-arriving launch is caught up (at most 0.5 s).
  - The start mini-game is judged against the sweet spot as each rider saw it. The marker position a client reports is accepted only within a small window around the server's own.
- **In the race.**
  - Your friend gets a ★ name tag over their horse, a highlighted row in the running order and a blue dot on the map.
  - Both screens show the same order.
  - An online race can't be paused.
  - Unlimited stamina, top speed and steering assist are off.
- **Results.**
  - Identical official results on both screens, with a line such as "ALICE (YOU) — 11TH · BOB — 6TH". DNFs and AI-ridden finishes are marked.
  - The full race recording is sent to both players, and each controls their own replay.
- **Disconnects.**
  - Automatic reconnect uses a server-issued token for that seat.
  - Lobby seats are held for 90 s.
  - In a race, the other rider is told. A rider gone for more than 20 s has an AI jockey ride their horse home.
  - Rooms are cleaned up when idle.
- **Security.**
  - Crypto-random codes and tokens.
  - Message size cap, per-connection rate limit, per-IP connection cap, validation of every field, a 2-player room limit and a WebSocket origin check.
- **Deployment.** README instructions, `render.yaml`, `Dockerfile`, and `npm run build:single` for a one-file single-player build.

---


## Update: ragdoll falls
- **Physics ragdolls:** a fall now uses a real Verlet ragdoll for both the horse and the jockey, replacing the scripted fall.
  - **Horse:** 37 particles at the joints and on the body surface. The torso and head are held rigid. The neck, legs and tail are chains with joint ranges, and hinge limits stop knees, hocks, elbows and fetlocks bending the wrong way.
  - **Rider:** 15 particles (torso, head, arms and legs, with knee and elbow hinges).
  - **Physics:** gravity, ground contact, sliding friction and a little bounce for the rider.
- **How the fall plays out:**
  - The forelegs catch and buckle, the quarters keep coming, and the body rolls to the side.
  - The rider is pitched over the shoulder with the heels flipping up, then tumbles and lands near the horse.
  - The horse rolls, legs flailing, and comes to rest on its side. Nothing is graphic.
- **Driving the models:** the particles drive the existing skeletons. Every bone is aimed at its child particle, so the detailed skinned horse and jockey meshes bend naturally.
- **Same fall everywhere:** the fall is simulated once, at a fixed 1/120 s step, from the exact pose and speed at the moment it happens. It is stored as a 4.5 s clip at 60 frames per second, so the live view, the fall replay and the highlights all show the identical fall, including when you scrub. The one-off simulation takes about 70 ms in headless software; it's much less on a normal PC.
- **Camera:** the fall camera now closes in from the infield and swings round the ragdoll. Highlights follow the ragdoll's body, not the old horse position.
- **Unchanged:** the incident rules and balance tuning. Re-tested: fall, DNF results, fall replay, highlights, and a restart that fully resets the skeleton, with no console errors.
- **Limitation:** rival horses steer round a faller but don't collide with the ragdoll, so one can still occasionally pass visually over the fallen horse or rider.

---

## Update: racing incidents, falls, contact and race highlights
Built on the previous version, with horse knacks and the unlimited-stamina/top-speed options. Everything else is preserved. The simulation still has no rendering or DOM code, so it stays suitable for a future multiplayer conversion.

### How incident risk is determined
Every horse has a **stability** value from 0 to 1, updated each simulation step (1/120 s).

**Load and capacity**
- **Lateral load** = the bend's centripetal load (v² / radius of the horse's lane) + the steering load (the change in lateral speed, scaled with speed) + a term for sideways speed. It is smoothed over 0.35 s, so single frames never matter.
- **Capacity** = 3.6 + 2.8 × agility (m/s²), reduced on soft and heavy ground, by fatigue (up to −22%), and when already unsettled.

**What drains stability**
Each source is multiplied by a ground factor, by (1.5 − 0.8 × agility), and by up to 1.5× for fatigue.
- load above capacity;
- restraining (Q) mid-bend at speed;
- leaning on a horse alongside;
- steering hard while stumbling.

**One-off knocks**
- heavy contact;
- clipping heels.

**Recovery**
With no stress, stability recovers at (0.1 + 0.22 × temperament) per second. It recovers faster at lower effort, so straightening up and easing off works.

**Incidents only below thresholds**
- Minor stumble below 0.60.
- Major stumble below 0.36.
- Fall below 0.15, and only while the horse is still under stress or after a heavy knock. Falls require *Full incidents*.

The chance per second grows with how far below the threshold the horse is. It is drawn from the race's seeded random generator, so replays are exact. The **warning always comes first**: DANGEROUS TURN, UNBALANCED (below 0.72), LOSING STRIDE (below 0.5), and a Balance chip that appears below 0.88. Speed alone adds nothing. At experimental speeds, risk is computed as if the horse were doing 19.5 m/s, a top racehorse's pace, so it stays predictable and never produces invalid values.

### What happens
- **Minor stumble:** −4% speed, 0.5 s of weak acceleration and steering.
- **Major stumble:** −14% speed, 1.4 s off-stride, 1.6 s of much reduced steering. The rhythm streak is lost and the horse gets keener.
- **Fall (DNF):**
  - **On the track:** the horse buckles, pitches, goes down on its side and slides clear of the racing lanes. The jockey is thrown clear (shown procedurally on the same skeletons, with nothing graphic). The camera cuts to a wider view.
  - **In the race:** the fallen horse leaves the AI and all collision checks immediately, so there is no invisible obstacle, and nearby bots steer around the incident. The race finishes normally.
  - **In the results:** a fallen horse never gets a time or a place.
  - **Your fall:** you see DNF with the distance and cause, any earlier warning signs, *Watch the Fall*, highlights, Race Again or Menu.
  - **Championship:** a fall scores 0 points and shows as "DNF". The season continues.
- **Contact:** horses still can never overlap.
  - **Assisted steering** still refuses to push into a horse alongside.
  - **Advanced steering** can force the issue. That gives real contact: the aggressor loses momentum (0.18–0.55 × impact speed) and balance, the other horse gets a small nudge, and nobody ever gains speed. Holding the steer into a rival counts as leaning on it.
- **AI:** bots never start a manoeuvre while unbalanced. Experienced riders don't snatch up mid-bend at speed. They steer round a faller, and keep their existing gap prediction and personalities.
- **Racing incidents setting:** Off · Stumbles only (default) · Full incidents. It applies to every runner in the race. The old race simulation and tests use Off.

### Horses
- **Individual looks:** each horse now has chosen markings, socks, build, neck, head size, carriage and mane. For example, Hopewell Rock is a big grey with a blaze and hind socks, and Goodie Two Shoes has a blaze and two white front socks.
- **Stumbling:** the horse visibly loses coordination (leg jitter, nose down, body lurch, rider pitched forward), then returns to its gait. Checked, settled and driven horses keep their existing poses.

### Race highlights
- **What it shows:** *Watch Race Highlights* on the results screen plays a montage of about 20–40 seconds. It always includes the start, the final 450 m and the finish (in the photo-finish view). It adds up to four of the most significant logged events: falls, big stumbles, heavy contact or clipped heels, big moves (3+ places in 8 s), lead changes, and your passes.
- **Cameras:** each clip has its own camera (high start view, chase, side-on from the infield, a wide view in slow motion for incidents, and the photo view). Space skips to the next clip; Esc closes.
- **Accuracy:** it plays only what was recorded. A new 20 Hz recording of the whole race (about 4 MB) holds every horse's state, including stumble and fall. Clips never overlap or repeat, and nothing is invented.
- **Photo finish:** the photo-finish replay is unchanged and still exact (gap = official margin; visible nose on the timed nose).

### Tests (headless Node simulation and Playwright)
| Test | Result |
|---|---|
| 160 all-bot races, Full incidents, all goings and distances | 0 stumbles, 0 major stumbles, 0 falls; 0.12 heavy contacts per race; 0 overlaps |
| 560 all-bot races, incidents Off (regression) | 0 overlaps or emergency corrections; 36% of finishes within 0.5 s |
| Player: flat out with no steering, or normal racing (good and heavy) | 0 incidents: speed alone is safe |
| Player: one lane change per bend | lowest stability 0.8–0.9, no falls |
| Player: weave for 2 s on a bend, then straighten | recovers every time (0 incidents, even on heavy) |
| Player: weave hard on every bend (good) | stumbles and major stumbles; falls in 1–2 of 8 races |
| Player: weave hard on every bend (heavy) | falls in 8 of 8 |
| Player: snatch up (Q) mid-bend repeatedly | stability down to 0.5; stumbles for less agile horses on heavy ground |
| Player: force into a horse alongside | contact; finishes 1–2 places worse than normal riding (no speed gain); occasional falls for the less agile horse |
| Incident setting, weaving on heavy (12 races each) | Off: 0 incidents · Stumbles only: 134 stumbles, **0 falls** · Full: 12 falls |
| Browser | fall camera; DNF results; fall replay; highlights (6 clips, 33 s); restart resets the rider; championship DNF (0 points, "DNF" shown, next race works); 450 km/h with Full incidents (no invalid values); menus, flows and photo finish: no console errors |

### Limitations
- **The fall is simple:** the horse goes down on its side and the rider lands clear. There is no ragdoll physics. Other horses steer round a faller but don't collide with it, so one can occasionally pass visually close to or over the fallen horse while it slides clear.
- **Only advanced steering can force contact.** Assisted steering stops you short of a rival, by design.
- **Highlights are capped at about 5.5 minutes of race time** (the length of the full recording). That covers every distance at normal speeds.
- **Bots never stumble in normal racing.** Incidents come from risky riding, and the AI rides safely.
- **Lead changes:** about 1.7 per race, down from about 3. This started with the previous update's evened-out stamina, not with this one.

---

## Update: detailed horses, better jockeys, a photo finish you can study
The race simulation is untouched: the sim block is byte-for-byte identical to the previous build, so results, AI and balance are exactly as before.

### Horses
- **More detail and a finer silhouette.**
  - Every cross-section of the body, neck, head and legs is now interpolated into a smooth curve, with 2–3× more rings and 40–56 points around each ring.
  - The model has about 3× the vertices: about 14,500 per horse with the rider, against about 4,100 for the horse alone before.
- **Surface anatomy:** shaped into the mesh, and lit by the coat's sheen.
  - **Forehand:** triceps behind the elbow, the muscles either side of the shoulder blade with the groove of its spine, the point of shoulder, the girth line and a split breast.
  - **Barrel:** a hint of ribs and the hollow of the flank.
  - **Hindquarters:** the point of hip, the top of the quarters, biceps femoris and semitendinosus with the hamstring groove between them, and the stifle.
  - **Neck:** the jugular groove, crest and splenius.
  - Muscular horses (sprinters) show more relief.
- **Thoroughbred shape:** a deeper girth, a tucked-up flank and a slimmer barrel.
- **Head and face:**
  - a round cheek, a bony rim over the eye with the hollow above it, and the facial crest;
  - the nasal bone, and the channel under the jaw;
  - flared, dark nostrils, the line of the lips, and the chin;
  - glossy eyeballs that catch the light.
- **Ears:** they now have their own bones. They prick forward while cruising, flick now and then, flop out when settled or tired, and pin back when driven hard.
- **Tack:** a racing bridle (headpiece, cheekpieces, noseband, bit rings). Some horses wear a white sheepskin noseband.
- **Legs and joints:** forearm and gaskin muscles, a flat-fronted knee with the accessory carpal bone behind, the point of hock, flexor tendons and their groove, fetlock and ergot, coronet band and chestnuts. Joints blend over a tighter window, so knees, hocks and fetlocks stay crisp.
- **Coat, mane and tail:** a glossy coat with a clear coat layer, and streaked hair in the mane and tail.

### Movement
- **Joint curves through the stride:**
  - **Front leg:** the elbow lifts, the knee folds hard and late, and the fetlock flips the hoof up. The knee then snaps straight and the toe reaches forward to land.
  - **Hind leg:** stifle and hock fold together to tuck the hoof under, then reach.
  - The curves are smooth splines rather than a single fold.
- **In stance:** the fetlock sinks under load, the hock absorbs, and the hoof breaks over the toe at lift-off.
- **Hoof contact** was re-measured on the new gait at 6–17.5 m/s:

| | Result |
|---|---|
| Mid-stance slip | ≤ 9 mm |
| Sinking | none |
| Float | ≤ 3.6 cm |

  The extra movement at the edges of stance on the front feet is the new break-over, where the heel lifts as the hoof rolls over the toe.

### Jockeys
- **Shape:** smoother, rounder limbs (4× finer rings, 22–26 around), broader shoulders and a racing-vest torso.
- **Racing colours:** each horse's owner has real-style racing colours that stay the same every race, in a satin finish:
  - a pattern (hoops, sash, quartered, stars, chevrons, braces, diamond, cross-belts or plain) in a contrasting second colour;
  - a collar;
  - sleeves that are plain, hooped, contrast or with armbands;
  - a silk cap that is plain, contrast, quartered or spotted, with a pompom and a peak.
- **Face and boots:** a nose, goggles with strap, a chinstrap and varied skin tones; black boots with tan tops.

### Photo finish and replay
- **Moving through the replay:**
  - **Space** plays or pauses.
  - **← / →** step frame by frame, at 1/240 s of race time, interpolated from the 60 Hz recording. **Shift** steps 0.1 s.
  - A **timeline** lets you scrub.
  - **L** (or the *At line* button) jumps to the instant the first of the pair reaches the line.
  - Playback speed runs from 1× down to 0.04×.
  - **Enter** or **Esc** closes the replay. Space no longer skips, because it now pauses.
- **Zoom:** scroll, + or − zooms up to 16×, towards the pointer. Drag to pan.
  - It enlarges the photo itself: the camera's view is cropped and re-rendered at full resolution, so it stays sharp.
  - A photo finish leans in to 2.5× automatically.
- **Measure (M):**
  - a dashed line through each horse's nose, with how far it is from the line ("8 cm to the line", "ON THE LINE", "12 cm past");
  - the gap between the two noses in cm or metres, lengths and seconds, for example "YOU LEAD BY 8 cm · 0.03 L · 0.005 s".
- **The photo shows the timing truth:**
  - In the replay, each horse is nudged so its visible nose sits exactly on the recorded nose. A test measured 0.0000 m error.
  - The measured gap at the line equals the official margin: 0.083 m against 0.083 m in a 0.005 s finish.
  - The near finish post is hidden in the side-on view, because it stood between the camera and the noses.

### Tests
| Test | Result |
|---|---|
| Sim block vs previous build | identical, so earlier race and balance results still apply |
| Hoof contact (Playwright) | table above |
| Photo finish (Playwright, real key, wheel and drag input) | measured gap = official margin; visible nose on the timed nose; 5 frames = 20.8 ms; Shift-step 100 ms; wheel zoom to 11×; drag pan; scrub; play; Esc closes and clears the zoom |
| Browser flows | menus, settings, How to Play, pause, cameras, championship and points (unchanged by replays), restart, quit, results: pass, no console errors |
| Start mechanic | unchanged outcomes |
| Cost | horse animation 0.2–0.5 ms per frame for 12 horses; about 1.05M triangles in a 10-horse race on High (was 0.8M); draw calls about 340 |

### Limitations
- **Relief is in the shape only:** the muscle relief is built into the geometry, not a normal map, so fine skin detail such as veins and hair direction isn't modelled.
- **Not checked on a real GPU:** visuals were checked in headless software rendering.
- **Triangle count:** it rises by about 30% with the detailed horses. On a weaker machine, Crowd off or Scenery Low saves more than that.

---

## Update: racing, visual and immersion upgrade
Built directly on the previous build (smooth jockey, whip, head fix). Everything earlier is kept: roster, distances, stamina/fatigue/sprint reserve, efficiency zones, AI personalities, every control, all cameras, rhythm sprint and streaks, radar, gates, menus, results/telemetry, photo finish, horse select, championship and settings. Still a single file; still only Three.js r128 and two Google Fonts. All new scenery is procedural, so there are no new asset files to license.

### 1. A new start: get ready, then react
The repeated-tapping break is gone. The start now has two parts:

1. **Get ready.** While the horses load and the countdown runs, a green sweet spot drifts unpredictably along the start meter.
   - **Hold** Space to raise your marker; **release** to let it sink. The marker has a little momentum.
   - Keeping the marker in the green builds **Readiness**; drifting out drains it.
   - A calmer horse (temperament) gives a wider green.
2. **React.** The gates open after a random pause of 0.6–1.8 s after the countdown, with a bell, a crash of doors and a lift from the crowd.
   - Press Space the moment you see **GATES OPEN**.
   - A press faster than a human could react counts as a guess.
   - Never pressing leaves you in the gate: the horse goes on its own at 1.1 s.

| Outcome | How you get it | Effect (measured, same horse and seeds vs a GOOD break) |
|---|---|---|
| **PERFECT BREAK** | Ready, and reacted in under about 0.3 s | **+1.0 to +1.8 lengths** at 100 m |
| **GOOD BREAK** | A decent mix of readiness and reaction | baseline |
| **SLOW AWAY** | No preparation, or a slow reaction | **−3.4 to −4.4 lengths**; about 9th of 10 at 100 m |
| **MISSED THE START** | Unready and late, or never reacted | stumbles; **−11 to −13 lengths**, last at 100 m |

- **What a start changes:** reaction delay and initial acceleration only. There's no teleporting and no top-speed penalty.
- **Starts matter more in sprints:** a missed start costs about 3.5–4 finishing places at 1,000 m and 1.3–2 at 3,200 m.
- **Horse effects:** starting ability and temperament adjust the result.
- **Rival starts:** rivals get their own start from starting ability, skill, aggression, consistency and luck. Across 660 bot starts: 23% perfect, 48% good, 26% slow, 4% missed. Favourites can miss too.
- **Presentation:**
  - a pulsing "GATES OPEN — PRESS SPACE!" prompt;
  - a result toast with your reaction time;
  - a camera kick (pull-back plus a wider field of view);
  - the jockey crouches and gives the horse its head while it quickens.
- **Where it's shown:** the results screen shows the break type and reaction time, and the race summary comments on it. How to Play is updated.
- **Start effort:** W/S before the off still works as before.

### 2. Speed and acceleration feel
- **Chase camera:**
  - It's left behind by real acceleration, not just speed. Lag grows with the horse's actual m/s².
  - It catches up as the horse settles into its speed.
  - The field of view widens on hard acceleration (the launch, a kick, a momentum surge), capped at 70°.
- **Final 220 m "rush":**
  - the camera drops lower;
  - extra field of view, more vibration and louder wind;
  - faint radial speed streaks on screen (chase and jockey cameras; off with the "Turf particles" setting).
- **Audio:**
  - **Passing:** a stereo-panned whoosh when you pass a rival, or one passes you, at a speed difference.
  - **Doppler:** an exaggerated pitch shift on rival hoofbeats, sharper when a rival is closing and duller as one drops away.
  - **Crowd:** it now reacts to the race itself, rising for a tight battle for the lead in the straight even when you're not in it.
- **Trackside cues:** new goose-neck rail posts every 3 m and the furlong markers give strong parallax.
- **Physics:** the race physics multipliers were not changed.

### 3. Positioning tactics and feedback
- **Inside rail:** the shorter way round, by geometry. Each lane out costs about 6 m per 180° bend: lane 4 gives away about 24 m, roughly 10 lengths.
- **Ground counter:** the HUD shows the metres you have given away ("+N m wide"), and the results show the total.
- **New calls:**
  - INSIDE BLOCKED — POCKETED ON THE RAIL;
  - OUTSIDE CLEAR;
  - GAP OPENING (inside/outside);
  - RIVAL CLOSING;
  - LOSING GROUND WIDE (with metres).
- **Race phases:** a HUD tag shows Opening, Mid-race, Final bend, Home straight and Final 200 m, with announcements at the bend and the straight.
- **Home-turn tactics for rival riders:** each rider decides once, at the home turn, whether to hold the rail and wait, angle out for a clear run, or follow a rival's move into the straight.
  - The decision weighs pocket risk (room ahead, a horse outside, being on the rail), position, and the rider's tactics, risk, patience and follow traits.
  - Difficulty adds misjudgement.
  - Over 1,440 rides:

| Choice | Share | Places gained from 760 m | Seconds blocked | Win % |
|---|---|---|---|---|
| Hold the rail | 68% | −0.21 | 0.7 | 13.2 |
| Angle out | 19% | +0.50 | 2.5 | 3.6 |
| Follow a move | 13% | +0.35 | 2.6 | 2.7 |

  - Easy riders hold the rail more (82%) and get pocketed; hard riders angle out more (32% vs 7%).
  - The win rate is highest for holders because leaders hold. Horses from behind gain places by angling or following.
- **Pack safety fix:** riders no longer shut the door on a much faster horse closing on their inside. The check now accounts for closing speed. This removed the only overlap found in the new 560-race runs.

### 4. Horse and jockey animation
- **Hooves now stay planted.** Before, the stance sweep could not cover the ground the horse travelled while a hoof was down. Hind hooves slid 15–30 cm mid-stance, and the arc of the leg lifted hooves up to 0.2 m off the turf at touchdown and lift-off.
  - **Stance fitted to the stride:** stance length now follows the stride geometry. A longer stride gives a shorter stance, as in a real gallop, and the sweep is linear in ground distance.
  - **Ground lock (horses within 55 m of the camera):** each planted hoof is pinned where it landed by correcting the shoulder or hip angle. The limb lengthens or shortens slightly with the load, so the hoof never floats or sinks.
  - **Measured at 6–17.5 m/s, fresh and tired (Playwright):**

| | Before | After |
|---|---|---|
| Mid-stance hoof slip | 5–30 cm | **1–8 mm** |
| Sinking | up to 3.6 cm | **0** |
| Float | up to 20 cm | **≤ 3.4 cm** (one case 5.6 cm at full speed, fatigued) |

- **Acceleration is obvious.**
  - The hinds drive deeper and reach further.
  - The body crouches, pitches forward, and the neck drops and stretches.
- **Jockey responses:**
  - crouches lower and further forward with hands pushed forward when accelerating;
  - leans into the bend with the head held level;
  - works harder and more raggedly when the horse is tiring.
  - The existing settle, check, urge and drive postures and the whip are unchanged.
- **Animation cost:** about 0.47 ms per frame for 12 horses including the ground lock, up from 0.2 ms.

### 5. A major race-day venue
"Final Furlong Park" is fictional, built in the style of a major Australian course. It uses no real names, branding or logos. Repeated items are instanced, so whole crowds, rows of trees and car parks each take one draw call.

- **Main grandstand** (245 m, centred on the finish):
  - an open stepped lower terrace;
  - a concourse with a glazed bar;
  - a corporate-box level with glass balustrades and tinted glazing;
  - a gold fascia and an upper tier with green seats and aisles;
  - a cantilevered roof with masts, tie cables, a sponsor fascia and flags that wave.
- **Members' stand:** older in style, cream with arched windows, a cast-iron verandah, a green roof, and a clock tower with a copper spire and flag.
- **Lawn and rail:**
  - a mown lawn, path, box hedges and roses along the fence;
  - umbrellas and marquees;
  - a standing crowd packed along the rail near the post;
  - a winners' stall with a gold arch.
- **Crowd:** about 3,600 seated plus 1,500 standing on high, in race-day dress, fascinator hats and varied skin tones. Spectators cheer as the field comes home.
- **Infield:**
  - a big video screen with a live leaderboard (top 5, metres to go, result);
  - a tote board;
  - the pond with shade trees;
  - an infield car park.
- **Around the course:**
  - TV camera towers under the broadcast camera positions on the bends;
  - a mounting yard (parade ring with rail, tiered viewing steps, roofed stalls);
  - stable blocks, maintenance sheds, a water tower;
  - horse floats and parked cars.
- **Rails:** white goose-neck running rails, with posts standing back from the track and arching over to the rail.
- **Landscaping and distance:**
  - pale-trunked gums, Moreton Bay figs, and palm avenues behind the stands;
  - a distant hazy city skyline and layered hills;
  - drifting clouds.
- **Broadcast cameras:** they now film the home straight from the infield, with the stands and crowd as the backdrop. The new rail-side crowd would otherwise have blocked the shot.
- **New "Scenery detail" setting (High / Medium / Low):** controls trees, vehicles, lawn crowd, clouds and skyline, alongside the existing crowd-density setting.
  - **Draw calls:** menu about 108; racing 336–354, against about 250 before. Horses and shadows dominate this, which is why the setting changes it little.
  - **Triangles:** about 0.82M on High with the full crowd, 0.66M on Low, and 0.27–0.32M with the crowd off.

### Tests on the final build
| Test | Result |
|---|---|
| 560 all-bot races (`tests/field.js`) | **0 overlaps, 0 emergency corrections**; 35% of finishes within 0.5 s, 10% within 0.15 s; 3.0 lead changes and 8.7 plan changes per race; every style wins |
| Start outcomes (`tests/start.js`) | perfect +1.0–1.8 L, slow −3.4–4.4 L, missed −11–13 L at 100 m (table above); sprints affected most |
| Start as played (Playwright, Space hold/release with a 0.15 s human lag) | good tracking + 0.18–0.30 s reaction → PERFECT; 0.5 s → GOOD; no tracking → SLOW; never reacting → MISSED; guessing → GOOD/SLOW |
| Home-turn tactics (`tests/pack.js`, 144 races) | table above; 19% of rides boxed for more than 2 s from the home turn |
| Hoof contact (Playwright) | table above |
| Riding techniques (`tests/riding.js`) | unchanged behaviour: settle while flat-out = flat-out exactly; check spam costs 2.7 s; checking when closing is neutral; 0 emergencies |
| Start effort | 1,000 m: bold start 3.6th at 12 s vs 8.9th soft; 2,400 m: bold start 1.5 s slower |
| Steering through traffic | assisted and advanced, 36 races: never overlapped, 8.2–8.4 overtakes per race |
| Sprint momentum | perfect −1.71 s, good −1.41 s, average −0.71 s; spent horse only −0.29 s (unchanged) |
| Difficulty, competent rider | average place easy 2.25, medium 2.67, hard 4.00 |
| Pacing strategies (512 races) | reactive best in 9 of 16 horse/trip cases, steady in 7 |
| Browser flows (Playwright) | menus, settings, How to Play, pause/resume, cameras, championship and points, restart, quit, results with auto-replay off, keyboard start: all pass, no console errors |

### Limitations
- **Ground lock range:** it only runs for horses within 55 m of the camera. Distant horses keep the fitted-stance gait, which slips about 5–15 cm.
- **Leg-length correction:** this can visibly lower the shoulder or quarters by up to 15 cm at the very start or end of a stance.
- **Untested on a real GPU:** visuals were checked in headless software rendering, so I couldn't measure frame rate on a real graphics card.
- **Draw calls:** about 100 above the previous build.
- **No false start:** pressing Space before the gates open no longer counts as one, because Space is the tracking control. Anticipating is instead punished as a guess when you press right as the gates open.
- **Following is less common:** it happens in 13% of home turns, mostly when there's a horse directly ahead to track.
- **Launch acceleration:** a PERFECT launch peaks around 9 m/s² in the first second. That's brisk but short; top speed is unaffected.

---


## Update: jockey, whip and head
- **The jockey is now one smooth, continuous figure.**
  - It's built like the horse: a single skinned mesh made of smooth cross-sections, with silks, cap, white breeches and gloves, black boots and goggles painted on.
  - It has ten bones (torso, head, upper arms, forearms, thighs, shins), with blended joints so the hips, knees, elbows and neck bend smoothly.
  - The bones are posed every frame so the feet stay in the irons and the hands stay on the reins.
- **Whip.**
  - It's carried in one hand, angled down across the shoulder.
  - When a rider urges, drives (Shift), or builds momentum in the final drive, it makes a full stroke in time with the stride: raised up and back, then brought down onto the hindquarters. A gap between strokes keeps it measured.
  - You hear the crack for your rider, and quieter for rivals beside you.
  - It also shows in the finish replays. The whip is visual and audio only; urging and driving already carry their gameplay cost.
- **The head is back.**
  - The Jockey camera used to *hide* your rider's head, helmet and goggles, and they stayed hidden in replays and results after you'd used that camera. Nothing is hidden any more.
  - The Jockey camera was also smoothed, so at speed it trailed about a metre behind its target, inside the rider's head. It's now fixed rigidly at the rider's eyes, slightly raised, looking out over the horse's ears.
- Draw calls dropped from about 500 to about 250, because the jockey was previously around 20 separate meshes per horse.


**Play:** open `final_furlong.html` in a desktop browser. It's still a single file; the only downloads are Three.js r128 and two Google Fonts, the same as before. No new asset files and nothing to credit.

## 1. Horse models (custom procedural geometry)
**Why not an external model:** the best-known free option, the `Horse.glb` from the Three.js examples, is a low-poly, flat-shaded model animated by blending between fixed shapes rather than a skeleton. Its gallop can't be retimed per leg, it has no jockey, and no licence is stated alongside the file. I didn't use an asset whose licence I couldn't verify, or one that could break the game.

**What replaced it:** each horse is now **one continuous, smooth-shaded skinned mesh** built from anatomical cross-sections:
- **Body:** 16 cross-sections from buttock to breast: muscular hindquarters, loin, a deep girth, withers higher than the croup, a sloping shoulder. Body length is about equal to the height at the withers.
- **Neck and head:** an arched neck with a crest. The head has a deep jowl and defined jaw, a straight profile, a longer muzzle with dark nostrils, high-set eyes and pricked ears.
- **Legs:** forelegs with forearm, flat knee, tendoned cannon, fetlock, sloping pastern and flared hoof. Hind legs have proper stifle–hock angulation.
- **Mane, forelock and tail:** the mane lies to one side, and the tail has a dock and a full, tapering fall of hair.
- **Skeleton:** 26 bones: a spine split at the loin so the back can round and extend, three neck/head bones, four bones per leg and four tail bones.
- **Colouring:** painted into the mesh. Bay and brown horses have black legs, mane and tail; greys are dappled; chestnuts have a self-coloured or flaxen mane. There are white socks, stars, stripes, blazes and snips.
- **Per-horse variety:** sprinters are more muscular and stayers leaner. Neck length, head size, mane length, tail length, head carriage and stride length all vary slightly, and each horse is generated from its name, so it looks the same in every race, the menu, the replays and the results.

**Gallop:** a rotary gallop with correct footfall order and a suspension phase. In stance, each leg sweeps back by an angle worked out from the actual stride length and speed, so hooves stay planted. In swing, the knee, hock, elbow, stifle and fetlock fold and the leg reaches forward. Movement includes:
- the spine rounding and extending;
- the head and neck pumping with the stride;
- the tail lifting and streaming, each segment lagging the one before;
- leaning into lane changes;
- a longer stride under a full drive, and a lower head and shorter stride when tired.

**Jockey:** rebuilt with smooth limbs:
- **Two-joint limb solving:** the feet stay in the irons and the hands stay on the reins, so the rider's knees and elbows absorb the horse's motion. Reins run to the bit.
- **Postures:** cruise crouch; quiet low hands when settling; pumping when urging; a flatter, scrubbing drive; sitting down and back with hands pulled back when restraining.
- **Tack:** a numbered saddle cloth, saddle and girth.

**Performance:** geometry is built once per horse and shared, with one shared horse material. Measured per frame: 0.2 ms to animate and pose 12 horses and jockeys, 0.09 ms of simulation. Geometry and texture counts stay flat across repeated race restarts, so there is no leak.

## 2. Riding controls
| Key | Action |
|---|---|
| W / S | Effort; also sets your **start effort** while the horses load |
| A / D | **Continuous steering** (hold); release to hold your line |
| Space | Break reaction at the gates, then the break slider; mid-race urge; final-drive rhythm |
| Shift | Sustained drive |
| **E** | **Settle** (hold) |
| **Q** | **Check / restrain** (hold) |
| **R** | **Look behind** (hold) |
| C · Tab · Esc | Camera · stats · pause |

- **Settle (E):** the horse relaxes over 2–4 s. Calm horses settle faster, hot ones slower, and cover in front helps. Relaxed travel is up to 10% more efficient and it stops a keen horse pulling. The cost: while relaxed the horse won't quicken above its comfortable pace, responds more slowly, gets less from urging and driving, and takes about 0.6 s to wake when you ask for more. Settling only works at a sensible pace; E while asking for 100% does nothing.
- **Keenness (new):** in traffic, or when checked too much, a horse with low temperament **pulls**. It wastes energy without running any faster. The HUD shows a "Keen" bar and prompts you to settle.
- **Check (Q):** a firm, controlled deceleration (2.2 m/s², versus easing off at 0.75). It costs the momentum you lose, which takes energy to rebuild. Holding it too long makes a hot horse fight, and the horse is briefly unbalanced on release.
- **HUD:** chips for Settled, Keen, Checking and "No room outside/inside". The jockey visibly changes posture for each.

## 3. Steering and collision avoidance
- **Movement:** lateral speed builds and eases off (it never snaps), and the horse turns slightly towards its path and leans, as does the rider. Fast lateral moves at speed cost a little energy.
- **Gaps:** the existing soft lateral limits still stop horses overlapping, so you fit between two horses only if the gap is at least two horse-widths.
- **Assisted mode** (default): gentler, and it refuses to steer into a horse alongside.
- **Advanced mode:** quicker and more precise, and you judge the gaps yourself. It's set in Settings.
- **Following safety:** horses now anticipate a horse ahead that is checking. That fixed the one overlap the new check mechanic initially caused.
- **Bots:** they steer to the centre of the gap they've chosen, not to fixed lanes.

## 4. Tactical pack racing
- **Momentum:** accelerating now costs energy, so braking and re-accelerating or weaving is wasteful, and a smooth line is rewarded.
- **Following:** sitting behind a horse gives a small efficiency gain (5%), halves keenness and settles the horse 1.5× faster.
- **Boxed in:** speed is capped behind slower horses. You can settle while you wait, check to drop in, or steer out.
- **Bots:** they settle keen horses (patient riders also settle when tracking cover), check by actually restraining, and won't check with a horse tight behind them.

## 5. Cameras
- **Chase:**
  - drifts sideways to keep a horse alongside in frame, and widens slightly;
  - rises a little when you're boxed in so the gaps ahead are readable;
  - keeps its earlier anti-clipping;
  - keeps a fixed horizon.
- **Look behind (R):** swings smoothly over the rider to a rear view while your controls stay live.
- **Jockey:** from the rider's eye line between the horse's ears, with the rider's own head hidden and gentler sway.
- **Broadcast:** keeps the side-on tracking shot for close finishes. The photo-finish replay camera is unchanged.

## 6. Starting
- **Start effort:** set it while loading. A bold start gains early position at a stamina cost; a soft one saves energy but gets shuffled back.
- **Reaction:** the horse breaks when you press Space; it goes by itself at 0.9 s if you don't react. Pressing early is still a false start, with a 0.55 s delay.
- **Bots:** each has a break style from aggression, conservation, starting ability and the trip.

## 7. Environment and audio
- **Environment:**
  - **Lighting and sky:** filmic tone mapping, a gradient sky dome with matching haze, and re-balanced light.
  - **Turf:** a new mown checkerboard texture with blades, divots and colour variation.
  - **Crowd:** spectators now have heads in varied skin tones and some hats. The heads previously never rendered because of a missing helper library.
  - **Turf kick-back:** reacts to the going, with more and darker clods on soft and heavy ground.
- **Audio:**
  - **Hoofbeats:** two alternating hoof sounds, deeper and harder at speed, and duller on soft ground.
  - **Breathing:** once per stride, louder with effort and laboured when tired.
  - **Ground and jockey:** a low rumble from the pack, and jockey calls when urging or driving.
  - **Restraint and replay:** a sound when you check, and a shutter click on the photo-finish freeze.

## Test results (all on the final build)
| Test | Result |
|---|---|
| 560 all-bot races (`tests/field.js`) | 0 overlaps or emergency corrections; 34% of finishes within 0.5 s, 14% within 0.15 s; 2.8 lead changes per race; all 7 styles win |
| Riding techniques (`tests/riding.js riding`) | E while flat-out = flat-out exactly (no exploit); spamming Q costs 2.7 s (no free energy); checking only when closing is neutral |
| Settle over a trip | 2,400 m: 0.13 s faster with 3% more stamina; 3,200 m: 0.48 s faster, average place 2.5 → 2.1 |
| Keenness, unsettled midfield horse, by temperament | Stormline (55) 13.6 s, Sable Rocket (62) 11.3 s, Iron Cadence (92) 1.2 s |
| Start (`tests/riding.js start`) | 1,000 m: bold start 3.6th at 12 s versus 9.7th for a soft one, and fastest overall; 2,400 m: bold start is 1.1 s slower; a late reaction costs about 0.6 s |
| Steering through traffic | Assisted and advanced, 36 races: 0 overlaps, 8–9 overtakes per race |
| Sprint momentum (unchanged system) | perfect −1.74 s, good −1.44 s, average −0.78 s; spent horse only −0.30 s |
| Difficulty, competent rider | average place easy 2.6, medium 3.1, hard 4.0 |
| Browser (Playwright) | controls, settle, check, steering, look-behind, cameras, gates, close-finish replay, championship, restart and quit all pass with no console errors |

## Remaining limitations
- **Close-up seams:** the horse is built from overlapping surfaces, so faint lines are visible at very close range where the neck and legs meet the body. They are not noticeable at racing or replay distance.
- **No key rebinding:** bindings can't be customised. None of the new keys conflict, so I didn't add it.
- **Graphics performance:** I couldn't measure frame rate on a real graphics card; tests ran with software rendering. CPU cost per frame is low. The GPU load is about 500 draw calls and about 490k triangles, with the crowd setting as the main lever.
- **Easy-going scripted riders:** riding plans that stay below the horse's comfort pace over a mile finish with stamina unused, so settling only shows a time gain over longer trips or when riders spend the energy they save.
