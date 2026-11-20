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
