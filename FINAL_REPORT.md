# Final Furlong — Career Mode overhaul: final report

Branch: `claude/amazing-clarke-jzpr1x` (nothing was merged to `main`). Single-file build: `node tools/build-single.js` → `dist/final-furlong-single.html` (published as the shared artifact). Detail for each phase is in `CAREER_PROGRESS.md`; how to continue is in `HANDOFF.md`.

Everything below was measured by running the code. Where something is not done, **Known limitations** says so plainly.

---

## 1. The 3D farm

**Layout** (`farm-world.js` → `FARMWORLD.L` is the single source of truth). A rolling Australian property: a stable block with **five loose boxes** and a courtyard, the **farmhouse** (office, race calendar board, wardrobe mirror, a sofa for "Rest a day"), a feed shed, a vet building, three fenced **paddocks** (east, north, west), a **wash bay**, the **exercise oval** (two straights and two bends, 1,200 m of race-distance training) with a **starting-gate unit**, the **float and ute** on the hardstand, a gravel drive down to the **road gate**, trees, hills and a sky. Built procedurally (textures with normal maps, instanced trees and plants); an overview camera budget of 250 draw calls is respected (measured 77–250 depending on the view, ≤ 261k triangles).
A **farm map** (`M`) draws a top-down plan from the same layout and colliders: paddocks, courtyard, house, sheds, oval, float, gate, fences, the horses in their boxes (the booked one marked) and you.

**Character.** A rigged, skinned humanoid (`farm-people.js`): a 23-bone skeleton driving **one skinned mesh** (one draw call, ~7,900 triangles) — shaped shoulders and arms, hands with fingers that curl to grip, a real face (brow, eyes with lids and irises, nose, lips, chin, ears) in five shapes, six hair styles that follow the skull, an akubra or riding helmet, work shirt with rolled sleeves / polo / race-day jacket, jeans or breeches, work boots or tall riding boots, belt, gloves. Procedural animation on the bones: walk, run, a breathing idle with looks and weight shifts, and the horse-work poses (brush, feed, pat, inspect, tack, lead, wave, drive). The wardrobe (outfit, skin, hair, face, build, shirt / trousers / boots colours) saves with the career. It is **procedural, not an imported model** (no network access to fetch one here); it is also the cheapest way to keep appearance customisation and the single-file build.

**Controls and camera.** W A S D walk, Shift run, mouse look, V first / third person, E interact, K skip the race-day routine, M map, R reset the rig while driving, Esc pause. Third-person: a smooth follow camera that does not clip through walls; first-person: eye-height with the figure hidden. Farm keys never reach the racing controls and race keys are inert on the farm (verified: `scenes-browser`).

**Interaction system.** Context prompts ("E — …") from interaction points built from the real layout; menus for each horse (inspect, groom, feed, tack up, lead out, training plan); guidance lines on the ground (A* over the real colliders) and an objective panel (Full / Subtle / Off in Settings).

**Horse stalls.** Five boxes with hinged doors (one instanced mesh); each stall shows its horse, a plaque (rating, age, condition, form) and the next booked race; an empty unlocked box opens the horse market; boxes unlock with career wins.

**Horse activities.** Inspect (the real eight attributes, potential, fitness, composure, readiness, development, training load), groom, feed (two tiers, paid), tack up for training or racing, lead a horse on a rope (it follows), put it back, **turn out** to a paddock (it grazes and wanders; a booked horse is brought in), **wash** it, plus a weekly **training plan** (all-round, speed, stamina, starts, acceleration, sprint, agility, rest).

**Training area.** Six hands-on drills on the real race simulation, drawn on the farm oval: starting-gate practice, acceleration, a measured 400 m sprint, a 1,200 m endurance run, settling, and agility (five cone gates, steer with A / D). You **walk to the horse, mount, ride, pull up to a walk and dismount**. A results screen shows what moved, progress to the next point, remaining potential and the training load. Drills count once a day per horse and at most four a week (no grinding).

**Farmhouse office.** The race calendar board (book a race: eligibility explained, entry fee and cash shown), the wardrobe mirror, the ledger / Office screen (finances, facilities and staff, the horse market, the Hall of Fame, save and backups), the trophy cabinet, a sofa to rest a day (weekly bills reported).

**People and life.** A stable hand always works; a hired groom, trainer and vet appear at their stations (drawn only within 48 m, no shadows); facility signs with level pips stand at the facilities.

**Race day.** Book → stall → prepare → lead out → float → load (a cutscene) → get in the ute → **preparation summary** → drive it yourself to the gate (a kinematic vehicle with collisions) → "Travelling to <venue>" → race. K (or the booking panel's "go now") takes the quick route with the same summary.

---

## 2. Economy

**Starting finances:** $150,000 (an existing career gets a modest credit for past success, capped at $250,000).

**Income:** prize money for places 1–5 (race face-value purses scaled by tier: Provincial 0.30, Metropolitan 0.18, Group 1 0.06, Everest / Cup 0.05; e.g. the Maiden Plate's "$40,000" pays $12,000, first place $7,200), the regional circuit's modest purses ($3.6k–$7.5k), **sponsorship** from reputation ($250–$2,500 a week), **milestone bonuses** (first win $2,000 … first Group 1 $50,000, once each), the retirement tribute, selling horses, and a stable-club advance ($8,000, once a season, only when cash is under $3,000; half of each prize repays it).

**Expenses:** entry fees (4 % of the purse, minimum $400; trials free), **one weekly bill** charged as the calendar moves (feed and care $600 per horse, the property $400, $150 per facility level, staff wages), quality feed, facility purchases, staff recruitment (two weeks' wages), custom-horse fees, horse purchases. Cash can never go negative; an unpayable bill becomes club debt.

**Facility costs:** seven facilities, levels 1–3, $15,000–$220,000 (training equipment, exercise track surface, recovery, starting-gate practice, vet bay, groom's quarters, comfort). Their effects are modest and explicit, and **the total training boost is capped at ×1.25**.

**Staff:** trainer, groom, vet — tiers 1–3, weekly wages, a speciality; a better trainer also narrows the ranges you see at the horse market, and a vet reveals a horse's health there.

**Horse prices (market):** young prospects $19–27k, developing $22–42k, race-ready $36–88k, late bloomers $12–31k, established horses $92–357k (valuation from ability — steeply —, potential for the young, age, record, condition). Selling pays the valuation less 10 % and a ±5 % market mood; a custom horse costs $14k / $26k / $42k / $64k as the stable grows (the first is free).

**Balancing** (simulation with the real race engine, `tests/economy.js`): a competent early-career stable ends its first season in profit (net $65–69k) and has a surplus towards a first upgrade; a poor stable is squeezed but the balance never goes negative and the club advance always lets it enter the next round; no key is ever paid twice and cash always equals the ledger. The regional circuit is **not** a money machine (expected prize ≈ $1,000 per start against a $400 entry fee and ≈ $2,000 a week of bills — it pays in experience). Anti-exploit rules: a prize race entered from the hub moves the calendar to its dated meeting, a horse runs at most once a day, the start of a race is all or nothing, every payment has an idempotent ledger key.

---

## 3. Horse development

**Long-term progression.** Each horse has fractional progress per attribute, so one session never moves a whole point. Daily sessions from a **weekly plan** (light / normal / hard, a rest day each week, a taper before a booked race) run as days pass. The rate = base × plan weight × **age curve** (the young build fast, veterans slowly) × **diminishing returns** near potential × current **training load** × a capped facility / staff boost × the source (riding it yourself is worth 0.5–1.4 by how well you ride; automatic sessions are ×0.7 without a trainer). Racing experience builds a horse more slowly than before. Measured (`tests/development.js`): a well-managed horse closes ~34 % of its headroom in season 1, ~80 % by season 3, ~93 % by season 4 and never passes potential; racing alone 18 / 36 / 50 / 64 / 75 %; hard training gets more sore spells and no faster development.

**Potential.** Eight attributes each with a ceiling; the creator's budgets are unchanged; a horse bought at the market arrives with its true attributes and ceilings (you only ever see ranges before buying).

**Fitness and recovery.** A race costs fitness by distance, going and endurance; recovery per day depends on the horse's recovery attribute, the recovery facility and the vet. A tired horse races **up to 6 % below its ratings**; a fresh, fit, unloaded horse "peaking" gets about +2 % — explained on the care card and the departure summary. Hard training raises a load bar and can make a horse sore (2–4 days off).

**Ageing.** Horses age on 1 August with an individual curve (early / average / late developer; peak around 4–6, a gradual decline from about 7–9).

**Retirement and the Hall of Fame.** Retire by choice (Market → Sell tab) or automatically past 12 at the turn of the season; never your last horse or a booked one. The whole record (look, silks, results, prize money, feature wins, trophies, last runs) is kept for good in `C.hof` and shown in the Hall of Fame; a small tribute is paid once.

---

## 4. Racing calendar

**New race schedule.** Ten championship rounds per season, dated, plus **66 dated open meetings** (22 open races × 3 meetings, spread evenly: at most 4 on any day, never a two-week gap). The ladder is maidens → country class races → provincial → metropolitan benchmark / listed → Group 3 / 2 / 1 → the championship finals, The Everest and the Melbourne Cup, with their qualifications intact.

**Country racing venues.** Fourteen new regional towns (Muswellbrook, Moree, Mudgee, Tamworth, Dubbo, Wagga Wagga, Hamilton, Echuca, Kyneton, Warrnambool, Toowoomba, Grafton, Port Macquarie, Casino) and the older provincial courses race on **two cheap country looks** built on the generic course (a short stand under a tin roof with the town's name, a tote building, gums or poplars, low hills, a modest crowd; ~115 meshes against the flagships'). Randwick and Flemington keep their own rigs. The commentator uses **neutral intros** at any course that is not Randwick / Flemington / Furlong Park — never "Furlong Park".

**Race eligibility.** Rating minimums (as before) plus three new explained rules: **age** limits (two-year-olds, three-year-olds and under), **maiden** (no wins) and **benchmark class** caps (rating 70–76). A new horse can always enter a dozen or more races.

**Winnable early races.** Two new pressure profiles: grassroots races (maidens, trials, age races) start the strongest rival ≈ 2.4 lengths above you; country class races ≈ 3.4 (metropolitan 5.0, first starts 6.0, finals 4.5). Measured with `tests/career_difficulty.js` (100 races each, a Hard-jockey proxy for a well-ridden horse): **maidens 25–29 % wins** (top-3 58–64 %), **country class 22–27 %** (top-3 51–59 %), against 11 % for Quick Race Hard; metropolitan / Group / crown races are unchanged (Kingsford Mile 21 %, Spring Final 11 %, Group 1 5 %, Everest 0 %, Melbourne Cup 0 %).

**Time-of-day lighting.** Eight times of day (early morning, mid-morning, midday, afternoon, late afternoon, **golden hour**, dusk, and the lit evening at Randwick / Flemington for the big races) as one table (`atmosphere.js`): sun direction and colour, sky dome, warm horizon glow, stars at dusk, ambient, exposure, haze. The default (afternoon, clear) is **exactly the game's original look**, so a Quick Race is unchanged. The race and the farm both use it: the calendar's stored time of day is what the race runs with and what the farm shows on race day.

**Weather and track conditions.** Clear, partly cloudy, overcast, light rain, rain, by month and consistent with the going the calendar stores (heavy going only with wet weather). Cloud greys the sky and softens the sun, visibility shortens, rain falls as streaks (one draw call) and wets and darkens the turf. The going keeps using the existing physics. Forecasts are shown on the calendar and the departure summary.

**Results update the calendar and stable.** Prize money, experience, fitness, records, rivals and head-to-heads are committed once per race instance (idempotent keys), then the farm shows the new date.

---

## 5. Technical architecture

**Scenes.** `scenes.js` owns the current scene (menu / stable / office / farm / race), the input context and a loading overlay. The farm has its own scene, camera, lights and sky; the race has its own. The main-menu background is the farm in showcase mode.

**Scene transitions.** Farm → race is the departure chain above (summary → verified save → drive → "Travelling…" → race). After a result, *Back to the farm* arrives at the hardstand with a fade up from black and a welcome-home note, both horses in their boxes and the ute parked.

**Shared career data.** One save (`ff_career`, schema v4) migrated from v1 / v2 / v3 without touching attributes, potential, look or records; the ledger (idempotent keys, cash never negative, audited), calendar, farm care and development records, market, Hall of Fame, staff, facilities and the player's appearance all live in it.

**Asset loading and resource unloading.** The farm loads without any racecourse assets; leaving it disposes the farm's horses, plaques and listeners; a race never builds the farm. Environment maps are cached (at most five, LRU-disposed), country venues are built on first use and kept hidden otherwise.

**Input separation.** The farm attaches its own key listeners only while active and consumes the keys; the riding controls are inert while walking and vice versa.

**Memory management and performance results** (all measured in the headless software-GL environment):
* Ten farm ↔ race round trips: geometries 348 → 348, textures 97 → 97, programs Δ0, JS heap Δ0.6 MB (`scenes-browser`).
* Farm: ≤ 250 draw calls and ≤ 261k triangles in eight camera positions (budgets 250 / 500k); the character costs one draw call.
* Race: a country venue costs 205–217 draw calls (the Furlong Park generic course is similar); rain adds exactly one; 24 atmosphere changes leak nothing (textures 91 → 91, geometries 371 → 371); a look already seen is re-applied in about 7 ms.
* A Melbourne Cup run to the finish (11,800 frames, 197 s of race): no heap growth trend (92 → 94 MB), per-frame CPU does not worsen, commentary runs throughout (`longrace-browser`).
* Smoothness (`tools/smooth.js`, Randwick, cameras 0 and 1, 60 Hz) before and after the atmosphere / market / venue work: see section 7.

---

## 6. Compatibility

* **Existing career migration:** v3 saves migrate with a byte-for-byte backup first; ages, fitness, growth curves, dates and starting funds are added; nothing is removed (`career-core`, `career-browser`, `single-browser`).
* **Existing horse saves:** attributes, potential, look, silks, records and history are preserved; the creator's budgets are unchanged.
* **Existing championship progress:** rounds, standings, rivals and trophies are unchanged; the dated calendar is laid over them.
* **Existing race physics, commentary and racing controls:** `sim.js` was never edited. The race-day opponent lift only changed for the new grassroots and country profiles; `chaos`, `avoid`, `riding-control`, `randwick`, `flemington` and the 1,881-check commentary scenarios all pass unchanged.
* **Single-player regression:** see section 7.

---

## 7. Tests

See `RESULTS_TABLE` below (filled from the last full run).

## 8. Known limitations (stated plainly)

* **Multiplayer is hidden by design** (the code is kept): the `tests/mp-*.js` suites were **not run — multiplayer disabled by design**.
* The character is **procedural**, not an imported, hand-modelled asset: it is smooth and detailed but has no blink or lip animation, and the hands do not have individual finger joints beyond one curl bone and a rigid thumb.
* **No floodlight towers are modelled** at Randwick / Flemington for the lit evening: the evening is lit by a directional "floodlight" and stars, with no tower geometry.
* The farm's **farmhouse interior** and the farm's turf do not change with time of day or rain (the farm sky, lighting, fog and rain streaks do).
* The two **country venues** are cheap by design: two looks shared by 22 towns, no parade ring, no per-town landscape.
* The commentator has **no venue-specific recorded intros** for the new towns (neutral recorded lines are used); no new audio was recorded or priced.
* The **horse market** has no 3D preview of a listing and no live auction; the bidding is the capped counter-offer model; a horse you buy takes your first horse's silks.
* The regional purses and the market prices are **first-pass balance** values backed by the simulations above, not a long play test with real players.
* `longrace-browser` fails on a loaded machine (commentary-line counting is timing-sensitive); it passes 5 / 5 when run alone.
* Performance figures are from a **software renderer**: they prove relative cost and the absence of leaks, not frame rate on real hardware.
