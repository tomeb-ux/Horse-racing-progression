# Prompt 3 — realism, racecourses, presentation, commentary voice: work log

## Audit findings (before)
- Horses: careful procedural skinned model, but a wide "inflated" barrel (~0.73 m), deep belly, plastic clearcoat, a
  solid fin-like mane. The gallop animation was already detailed (speed/fatigue/acceleration/suspension) and was kept.
- Jockeys: one skinned figure, but the stirrups were long — thighs near-vertical, knees dropped onto the saddle cloth,
  tube limbs, a mannequin head.
- Broadcast camera: shots placed beside the rail at 42–48° FOV → horses tiny in a lot of grass.
- Venues: flat saturated turf, lollipop trees, box buildings, a generic stand; Lambert materials, no reflections.
- Commentary: good wording, but browser/system voices only.
- Latent sim bug found while testing the Cup: an AI "check" taken in the opening phase never timed out; on a long
  opening (the Cup's 888 m run to the post) a horse could be held until it stopped. Fixed (one line); all sim suites pass.

## Flemington geometry (sim.js `TRACK_DEFS.flemington`)
- Published: 2312 m, 450 m straight, left-handed, pear shape, sweeping home turn from the 1200 m to the 450 m,
  the 1200 m Straight Six continuing the line of the home straight, Cup start in the straight (888 m from the post).
- Built: run-out → tight first turn (r 125 m, estimated) → back straight (solved 579 m) → home turn (r ≈ 196 m,
  200°, exactly 1200→450 m) → 450 m straight; first-turn angle/run-out/back length solved so the loop closes at
  exactly 2312 m.
- Routes: 1000/1100/1200 m on the Straight Six (`straightRace`: zero curvature, no final-bend phase, no ground lost
  for width); 3200 m starts 438 m beyond the junction, passes the post after 888 m, then a full lap; 2000 m uses a
  short estimated chute so the start is not on the turn; 1400/1600/2400/2500 on the course proper.
- Tests: `tests/flemington.js` (46 checks).

## Graphics kit (gfx.js) and venues (venues.js)
- IBL: procedural sky rendered into a PMREM environment map; shader sky dome; fog matched to the horizon.
- Turf: world-space detail (two scales) + macro variation, normal map, mowing bands across the course, mower passes
  along it, a worn running line by the rail; lawns get diagonal mowing checks.
- Trees: eucalypt, Moreton Bay fig, plane, cypress, palm — merged procedural geometry, instanced, per-instance tint,
  wind sway in the vertex shader.
- Crowd: one instanced person mesh (~200 triangles) per ~110 m cell (frustum-culled); clothing/skin/hair/hats per
  instance; seated/standing; heads (and a little of the body) turn to follow the leader; clapping, arms raised,
  jumping — all in the vertex shader from two uniforms (excitement, a "roar" after the finish). No per-frame CPU work.
- Randwick: course + sprint chute, inner Kensington track and sand track; five-level grandstand (lower bowl, two glass
  levels with timber soffits, upper tier, top glass level, segmented translucent fabric roof on masts and ties),
  stair cores, double-sided tiers facing the Theatre of the Horse (sunken amphitheatre parade ring), Owners' Pavilion
  (aluminium fins + floating roof), heritage members' stand, lawn stand, marquees, winning post + judge's tower,
  infield big screen, figs/gums/palms, terracotta suburbs, Sydney skyline with a needle-and-turret tower.
- Flemington: course + Straight Six + 2000 m chute; Club Stand (five levels with scalloped "petal" bands, roof garden
  canopies), Grandstand and Hill Stand (curved metal roofs on arched trusses), roses along the straight's fence and
  round the mounting yard, the hill, Maribyrnong River with river red gums, infield marquees, Melbourne skyline with a
  gold-crowned tower, STRAIGHT SIX boards.
- Rails: goose-neck posts + rounded rail; rails at chute junctions stop exactly where the course and the chute
  separate (computed), so no rail stands across a racing surface.

## Horses and jockeys
- Horse: barrel/chest width −13 %, tucked-up underline, darker topline / lighter underside, coat shader (tonal
  variation in bind space, gloss variation, sheen, lower clearcoat), mane as individual locks, tail with loose strands,
  mane/tail flutter at speed. Tack narrowed to fit.
- Jockey: short irons, seat higher and further back, knees forward against the saddle flaps, flatter back, head up;
  new lofts (vest under silks, broad shoulders, loose sleeves, gloved hands, muscular thighs, thin racing boots with
  tan tops); a face (jaw, chin, nose, ears) under the skull cap; satin silks with fold relief and wind flutter.
  Settling/checking/driving/whip/fall systems unchanged (same bones, same IK).
- Walk gait (four-beat lateral sequence) for the parade and the winner presentation; jockey salute pose.

## Cameras and presentation
- Broadcast director: towers (outside bends / infield), infield tracking vehicle, head-on long lens from beyond the
  post, side-on finish camera; zoom computed to fit the leaders and your horse; spring-damped position/aim/zoom.
- Barriers: mobile barrier unit — padded partitions, white tubular frame, walkway with attendants, wheels, numbered
  plates, split front doors opening outwards at the simulation's start.
- Parade ring (optional, default: feature races at Randwick/Flemington; skippable): horses walk the ring with
  strappers; name cards for your runner and the main dangers.
- Winner presentation (feature races and your wins; skippable): winner walks back past the stands, jockey salutes,
  crowd roars; card with the official time and margin from the race result; trophy on a dais for feature races
  (three-handled cup for the Melbourne Cup).

## Commentary voice
See the implementation report. Engines: Kokoro (int8, 92 MB), Piper (optional), system voice. Measured here (2.1 GHz
shared Xeon, no GPU): Kokoro 0.33× real time single-thread, 0.55× with 3 threads (cross-origin isolated); Piper
2.5–4× real time. The live caller uses a neural engine only when it measures faster than real time with headroom
(rtf ≤ 0.85); otherwise it says so and uses the standard voice.
