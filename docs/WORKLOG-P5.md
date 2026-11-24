# Phase 5 work log — the property becomes the heart of the game

Owner's direction (after the Phase 4 review): the main menu sits over the horse property; Career Mode lands on it; you walk into the
farmhouse, use a calendar board to pick the race, swap first/third person; booking a race puts the horse in the float and you drive off.

## Decisions
- **One world, two uses.** The Phase 4 farm scene is reused as the menu background (`FARM.startShowcase`) and as the walkable game scene (`FARM.enter`). The race world is untouched; the menu still prepares it (`VENUES.use`, `buildShots`) because Quick Race starts from there.
- **The menu never creates a save.** Its stalls come from `CAREER.farmStalls()` only when `CAREER.hasSave()`; otherwise five roster horses.
- **The interior is its own THREE.Scene** (`FARMHOUSE`), built the first time you go in and kept; fades hide the swap. Colliders reuse the farm's circle-vs-AABB resolver.
- **Booking is data on the career** (`C.booking`), not UI state: the board, the objective line and the float prompt all read it; `CAREER.startBooked()` runs the same entry code as the hub's buttons (`enterOfficial` / `enterOptional`), so race rules, prize and points are untouched.
- **Only the current championship round is bookable** (plus optional races that fall before it): booking can never skip a round silently.
- **The drive-off is a cutscene** (skippable). The float + ute were split out of the world batches into their own group with a hinged ramp so they can move.
- **After a career race you go back to the farm** (`CAREER.returnHome`), not the hub.

## Tests
`tests/farm-flow-browser.js` (new) covers the whole flow; `farm-browser.js` / `scenes-browser.js` / `career-browser.js` were updated only where the behaviour changed by design (Esc pauses instead of leaving; E at the float needs a booking; the farmhouse door goes inside; Career Mode lands on the farm; the farm is the menu background). No check was weakened or deleted.
