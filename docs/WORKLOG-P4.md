# Prompt 4 — steering, performance, Flemington grandstand, ElevenLabs commentary: work log

## 0. Multiplayer parked
Menu button hidden, `?join=` auto-join disabled (`FF_FEATURES.multiplayer`, `?mp=1` re-enables it for a session).
No online code was deleted or changed (mp.js only gained the guard; server rooms/protocol/race-server untouched).

## 1. Steering at Royal Randwick
**Finding.** The simulation's steering was already rail-relative: D raises `laneF` (distance from the inside rail) on
every course, and the track engine's outward normal is correct for clockwise and anticlockwise courses (checked: D →
further from the rail in world metres at Randwick, Flemington and the generic course). The reversal was in the
*presentation*, which had been written for the original left-handed course only:
- body roll into a bend (`rollT = -curv…`) leaned towards the horse's left — at a right-handed course that is OUT of the
  bend;
- the lateral lean, head turn, tail and the jockey's weight shift for a lane change used the same hard-wired side, so
  pressing D at Randwick made the horse visibly turn and lean towards the rail while it slid outwards;
- the nose-follows-the-diagonal yaw had the opposite sign error on left-handed courses (nose turned inwards when moving
  out);
- the HUD radar always drew RAIL on the left; the chaos kick and jockey-camera roll had the same assumption.
**Fix.** `placeHorseMesh` computes `sideS = sign(bodyRight · outwardNormal)` from the course frame at the horse's
position (+1 on left-handed courses, −1 on right-handed). `animateHorse` converts every rail-relative input (curvature,
lateral speed, fall direction) to body-relative with it; the yaw, kick, jockey camera roll and radar use it too. Keys
are unchanged (A = towards the rail, D = wider) and the simulation is untouched (multiplayer authority unaffected).
At a right-handed course the rail is on the rider's right, so D still moves the horse to the LEFT of the screen —
that is towards the outside rail; a race-start hint and the HUD key line say so.
**Tests.** `tests/steering-browser.js` — 70 checks over 8 cases (Randwick straight / bend / home turn, Flemington back
straight / home turn / Straight Six, generic straight / bend) through the real key path; the pre-fix build fails 20 of
them, the fixed build passes all.

## 2. Flemington Club Stand and the barrier "spectators"
**Club Stand.** Five glazed levels started 6.3 m up; behind the seating (top row 4.4 m) nothing filled the space below
the first floor, the floor slabs and petal bands were one-sided sheets (invisible from below), and every floor's glass
stopped 0.5 m short of the next slab with nothing behind the slit — so trees showed through under and between the
floors. Rebuilt: a podium (concourse) filling the footprint behind the bowl with a glazed shopfront and timber soffit,
structural slabs to the rear wall, full-height floor volumes, opaque spandrels, double-sided petal/slab surfaces,
stair/lift cores closing both ends, and a column line carrying the floors to the podium. Then batched: 52 → 13 meshes.
**Same class of defect elsewhere, fixed at the source:** every `sheet()` surface is now double-sided (Owners' Pavilion
roof, heritage stand roof, canopies); every seating block (`tiers`) has an underside and end walls (upper tiers seen
from below, stands seen along their length); Randwick grandstand: concourse block under level 2.
**Barrier staff.** The gate builder placed 8 crowd figures at the barrier's roof height. They are now uniformed staff
on the ground behind the stalls and at the ends. Crowd placement for venues now validates every spot against the
racing surface (course + chutes, rail to rail + 1 m) and building exclusion zones registered by the stands.

## 3. Performance
See the implementation report for the before/after tables (`tools/bench.js`, `tools/breakdown.js`).
- Rail posts, trees, roses: chunked instancing with correct bounds (three r128 culls an InstancedMesh by its geometry's
  sphere — whole-course instanced meshes were drawn and shadow-cast in full) + low-detail twins by on-screen size.
- Crowd: three simple figures (≈130 / 56 / 24 triangles instead of 240 / 60), 80 m cells, screen-size LOD, shuffled
  order so part-full meetings thin evenly; the generic course's CPU-animated crowd (5 full-course instanced meshes
  re-uploaded every frame) replaced by the same GPU crowd.
- Horses/jockeys: three LODs from the same lofts (20.3k / 9.5k / 4.0k and 14.5k / 4.1k / 1.2k triangles), same
  skeleton and colours; jockeys now frustum-culled with generous bounds.
- Shadows: shadow camera depth 650 m → 230 m around the action; only near chunks cast.
- Buildings: static batching per material (Randwick grandstand 81 → 19, Flemington stands 87 → 10 each).
- HUD: backdrop-filter blur disabled while the 3D view is live (each blurred panel is re-blurred every frame).
- AUTO quality (default) + F8 overlay.

## 4. ElevenLabs
Voice found in the connected account: "mw_e-sports-commentator_The Aussie Companion", ID OQt0mf8rKBYkweCSQ9d4 (Free
plan, 10,000 credits/month; 1,205 used before this work). 13 batch generations with eleven_v4 (3,694 credits) → 150 clips
after splitting at the pauses. Hosts used: the ElevenLabs connector (generation) and elevenlabsusercontent.com (download,
added to this environment's allowed hosts with the user's approval). elevenlabs.io (pricing / terms pages) and
api.elevenlabs.io were not reachable from the build environment, so the server endpoint was tested against a mock.
