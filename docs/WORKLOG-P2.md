# Prompt 2 worklog (stable, creator, progression, rivals, commentary, track engine, Randwick)

Git checkpoint: `git log` in ffmp/ — commit "Checkpoint: Prompt 1 build". Commit after each phase.
New artifact (P1, owned this session): https://claude.ai/artifact/RUnGGeTzSHw7XxG5iESe6G — publish from /home/user/ffmp-extract/final-furlong.html (copy of dist build).
Tests need: server `FF_TEST_HOOKS=1 PORT=8095 node server/index.js`; node_modules/playwright* deleted (use preinstalled).

## Phase 1 findings
- Save: localStorage `ff_career` schema v2 (P1): {v:2, seed, stable, horses[], active, trophies[], wins, history[], season{n,div,seed,cur,closed,stables[],rounds[]}}.
  Horse: id,name,look{type,coat,face,socks[4],maneCol,tailCol,build},silk,silk2,silkPat,attrs,pot,xp,xpFrac,trainPts,lvl,races,wins,places,podiums,offRaces,offWins,champPts,history[{raceId,name,place,field,dnf,t,dist,tier,off,season}].
  AI stables in season.stables: {sid,name,q,silk,silk2,silkPat,horses:[{hid,name,type,style,role,coat,shape}]} — rating normalised per race (rateDef) → NOT persistent strength. Phase 4 replaces with real rivals.
- Horse render caches keyed by def.name only: horseLookCache, horseGeoCache, jockeyGeoCache, horseMatCache (index.html ~1353-1890). Live editing needs a full appearance key + disposal of preview builds.
- Look params available: face (none/star/stripe/blaze/snip/starsnip), socks[FL,FR,HL,HR] 0..3 (SOCK_H heights), build (chest/quarters/barrel), neck (length), head (size), maneLength, tail, carriage, maneCol, tailCol, type (bay/brown/black/chestnut/grey/flaxen). Add: neckG (girth), headW, muscle.
- Track: sim.js T={L:450,R:120,W:26}, trackPoint/isTurn/lapDelta/racePhase(HOME_STRAIGHT,FINAL_BEND). Sim call sites: Horse.update bend load (490-491), integrate ground loss (567-576), bot turnSoon (908,920), restrain (824), Race ctor startD (947,966). index.html: 44 trackPoint, 22 T.W, 14 T.lap, 32 startD (rendering/world/cameras/minimap/replay).
- Commentary diagnosis (P1 commentary.js): (1) discrete self-contained sentences, every one ending "!" → TTS resets prosody each utterance, falling "announcement" intonation; (2) sparse: quiet-period reports only every 6.5–10.5 s early, gapAfter 2.2 s, nothing between markers in non-close straights (11 s silences seen); (3) no running-order "call through the field", few connectives (still/now/but/and); (4) excitement mostly via rate/pitch → strained not exciting; (5) separate utterances add ~0.2–0.5 s engine latency each; (6) voice: only system voices (Siri voices not exposed to Web Speech); compact voices sound robotic; Enhanced/Premium must be downloaded by user.

## Decisions
- Generic oval stays analytic & bit-identical (MP + balance tests). Randwick = table-based arc-length track (0.5 m samples), curvature piecewise-linear (clothoid easements), closure solved by adjusting two straights.
- Per-race route: race.route.point(progress, off, out); chute table for starts off the loop. Ground loss factor 1/(1+kIn*off).
- MP stays on generic track (server/client both use sim.js; track id in cfg for future).

## Status (after phases 2–4)
- P2 done: public/stable3d.js (STABLE3D: enter/leave/setBayHorse/setStalls/setTrophies/preset/zoom/setViewShift/onPick/frame/info). index.html frame() renders it when ui.state starts "c_" and !race; show() leaves it. horseKey() cache keys; def._preview builds are disposed. Look params added: muscle, neckG, tailLen (+ existing build, neck, head, maneLen).
- career.js rebuilt (v3): BASE 54 / START_POOL 136 / START_CAP 84 / POT_POOL 168 / POT_CAP 98. 5-step creator (sidePage + camBar), stable overview (bottom strip), profile, training (immediate +1, undo, effect text, flash), one-time potential redistribution (old horses: !potSet && !potRedist), trophy room (3D shelves), rivals list + rival profile (rival shown in bay), form guide in event view.
- season.js v3: persistent rivals C.rivals (world C.world[div] stables → rival ids), bands Prov 55-63 / Metro 64-72 / Feature 72-80 + 3 stars 83-86, per-run development at own rate, retirement at peak, optionalField (grade-matched, C.optN), background divisions season.others, h2h C.h2h["horseId|rivalId"], formGuide/suitability, xpFor/upgCost/XP_PER_PT=2 shared.
- Balance (tests/progression.js, real engine): well ridden rating 73→77→80→84 (r17-20)→87; first 3 races win ~60% top3 ~72%; flat-out riding wins ~0. Rivals identical between good/poor careers.
- Tests: tests/season.js 64/64, tests/commentary.js OK, tests/progression.js.
- TODO P8: update tests/career-browser.js for the new creator UI (uses old selectors #cAttrs .car-arow etc.).

## Status (after phases 5–7)
- P5 commentary: continuous caller (Booth.nextLine stages early/mid/turn/straight/final; orderCall; linked clauses; news folding; markers; nmShort/nmFull + def.say; rivalry from cfg.career.rivalry). Continuity metric: 83% speaking, last-25 s max gap 0.4 s (old: 63%, 3.8 s).
- P6 track engine in sim.js: TRACKS.generic (analytic, bit-identical), buildTableTrack (clothoid segments, arc-length tables, Newton closure), route(dist) with chute; race.trk/race.route; racePhase(…, trk); Race.lapD. index.html: all race positions via route.point; buildGates(route), buildMarkers(route), buildShots(trk), minimap fit per track, replay/highlight cams on route.
- P7 Randwick: TRACK_DEFS.randwick (2224 lap, 410 straight, W 28, cw, runout 110, top turn r≈162, back 377 + 12° dogleg, chute join, home turn r≈177, sprint chute for 1200/1400). public/venues.js (VENUES.use/update): turf/rails/chute/infield/trees/skyline/stands (QEII-style glass + canopy, heritage stand, lawn stand)/finish/landmarks/crowd by event. VENUE_GENERIC group in index. Quick Race "Course" chip; career competitiveCfg track by venue /randwick/i. MP stays generic.
- tests/randwick.js 41/41.
