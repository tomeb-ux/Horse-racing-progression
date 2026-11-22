'use strict';
/* =====================================================================
   FINAL FURLONG — THE RACE CALLER'S PHRASE BANK (calls.js)
   Every phrase the commentary director can say. The same list is
     • what the director (commentary.js) chooses from — so the caption always matches the audio,
     • what tools/commentary-library.py records with the ElevenLabs commentator voice (one clip per phrase),
     • what the local/system voice reads when ElevenLabs is off.
   A phrase is one of four forms:
     full — a complete sentence, no name ("They're well strung out behind the leader.")
     post — follows a horse's name ("[name] has opened up a big break.")
     pre  — leads into a name ("Here comes [name]!")
     conn — a short link in a run of names ("leads from", "then", "and")
   tier = delivery energy 1–5 (1 a calm mid-race caller … 5 screaming the finish), stage = when it is used (for
   prefetching audio), and optional facts the director must check before using it (margin, rank, marker, venue, race).
   Phrases never state anything the race data doesn't show: the director only picks one when its condition is true.
   ===================================================================== */
const CALLS = (() => {
  const U = [];
  const add = (topic, form, tier, stage, list, extra) => { for (const t of list) U.push(Object.assign({ topic, form, tier, stage, text: t }, extra || {})); };

  /* ---------- before the start ---------- */
  add("intro", "full", 2, "pre", [
    "Welcome to the races, and the field is making its way to the barriers.",
    "Good afternoon, and the runners are about to load up for this one.",
    "We're just about ready to go here, they're loading them now.",
  ]);
  add("intro", "full", 2, "pre", ["Welcome to Flemington, and they're loading up for this one.", "Good afternoon from Flemington, the field is going into the gates."], { venue: "flemington" });
  add("intro", "full", 2, "pre", ["Welcome to Royal Randwick, and they're going into the barriers.", "A beautiful day here at Randwick, and the field is loading now."], { venue: "randwick" });
  add("intro", "full", 2, "pre", ["Welcome to Furlong Park, and they're nearly ready to go.", "Good afternoon from Furlong Park, the runners are going in."], { venue: "generic" });
  add("intro", "full", 3, "pre", ["Welcome to Flemington for the Melbourne Cup, the race that stops a nation!", "It's Melbourne Cup day, and the whole country is watching!", "A massive crowd here at Flemington, and the Cup field is loading!"], { race: "cup" });
  add("intro", "full", 3, "pre", ["Welcome to Royal Randwick for The Everest, the richest race on turf!", "It's Everest day at Randwick, and what a field we've got!"], { race: "everest" });
  add("intro", "full", 3, "pre", ["A big race here today, and the crowd is buzzing.", "There's a real buzz around the course for this feature race."], { race: "major" });
  add("loading", "full", 2, "pre", ["They're all in, and ready to go.", "The last of them is in.", "All set, and waiting on the starter."]);

  /* ---------- the start ---------- */
  add("away", "full", 4, "early", ["And they're away!", "They jump, and they're racing!", "The gates crash open, and they're off!", "And away they go!", "They're off and racing!", "And they've jumped away cleanly!"]);
  add("away", "full", 4, "early", ["And they're off in the Melbourne Cup!"], { race: "cup" });
  add("away", "full", 4, "early", ["And The Everest is underway!"], { race: "everest" });
  add("start_slow", "post", 3, "early", ["has missed the start badly.", "was slow to begin.", "has stumbled at the start."]);
  add("start_good", "post", 3, "early", ["has jumped beautifully.", "is quickest away."]);
  add("start_clean", "full", 3, "early", ["They've all jumped well together.", "A clean start for the field."]);

  /* ---------- the early stages ---------- */
  add("early_lead", "post", 2, "early", ["goes straight to the front.", "shows good early speed to lead.", "is happy to take them along.", "has crossed to the lead.", "is the leader as they settle.", "is up there setting the pace."]);
  add("early_tussle", "full", 2, "early", ["There's a bit of a tussle for the lead.", "A couple of them want to lead here.", "There's plenty of speed early, they're all going for the front."]);
  add("early_tussle", "post", 2, "early", ["is keen to get across.", "won't give up the lead without a fight."]);
  add("settle", "full", 1, "early", ["They're starting to settle into their positions.", "The field begins to sort itself out.", "It's a bit busy in the early stages.", "Plenty of jostling for positions early.", "They're finding their spots now."]);
  add("early_back", "post", 2, "early", ["has been eased back to the tail.", "has found the rail.", "is caught wide early."]);

  /* ---------- running order (a run through the field) ---------- */
  add("order", "conn", 2, "mid", ["leads from", "then", "followed by", "and then", "back to", "and last of all,"]);

  /* ---------- the leader, mid-race ---------- */
  add("lead_hold", "post", 1, "mid", ["leads them along.", "is still in front.", "continues to lead.", "is setting the pace.", "takes them along at a steady clip.", "is still the leader, travelling well.", "holds the lead.", "is out in front, nice and relaxed."]);
  add("lead_new", "post", 2, "mid", ["has taken over in front.", "now leads.", "has gone to the lead.", "has hit the front."]);
  add("margin", "post", 1, "mid", ["leads by a length."], { margin: 1 });
  add("margin", "post", 1, "mid", ["leads by two lengths."], { margin: 2 });
  add("margin", "post", 1, "mid", ["is three lengths clear."], { margin: 3 });
  add("margin", "post", 1, "mid", ["is four lengths clear."], { margin: 4 });
  add("margin", "post", 2, "mid", ["is five lengths clear."], { margin: 5 });
  add("margin", "post", 2, "mid", ["is six lengths clear."], { margin: 6 });
  add("margin", "post", 2, "mid", ["is eight lengths clear."], { margin: 8 });
  add("margin", "post", 2, "mid", ["is ten lengths clear."], { margin: 10 });
  add("margin", "post", 2, "mid", ["is a long way clear."], { margin: 14 });
  // the breakaway: first noticed, then the story around it
  add("breakaway", "post", 2, "mid", ["has opened up a big break.", "has kicked clear of the field.", "has gone out boldly in front.", "is running away from them.", "is bowling along in front, all on its own."]);
  add("breakaway", "full", 1, "mid", ["The leader has opened up a big break.", "It's a big gap back to the rest of the field.", "The leader has stolen a march on them.", "They're giving the leader a lot of rope.", "That's a bold front-running ride.", "The leader has gone out boldly, and they've let it go."]);
  add("gap_growing", "full", 1, "mid", ["And the gap is getting bigger.", "The lead is growing all the time.", "The leader is still extending.", "They're not making any impression on the leader."]);
  add("gap_growing", "post", 1, "mid", ["is extending the margin.", "keeps piling it on in front."]);
  add("gap_closing", "full", 2, "mid", ["The leader is starting to come back to them.", "The margin is coming down now.", "They're starting to reel in the leader.", "That lead is shrinking.", "The chasers are closing the gap."]);
  add("gap_closing", "post", 2, "mid", ["is starting to come back to the field.", "is beginning to tire in front."]);
  add("chasers_idle", "full", 1, "mid", ["Nothing's going after the leader just yet.", "The chasing pack are happy to sit and wait.", "Someone will have to go after the leader soon.", "The rest are content to bide their time."]);
  add("chasers_go", "full", 2, "mid", ["The chasers are starting to respond.", "The pack is beginning to wind up.", "They're going after the leader now."]);
  add("chase_lead", "post", 1, "mid", ["heads the chasing pack.", "leads the rest of them.", "is the nearest pursuer.", "is second, chasing the leader.", "leads the next group."]);
  add("battle_second", "full", 2, "mid", ["There's a battle developing for second.", "The fight for the minor placings is heating up.", "They're scrapping for second behind the leader."]);

  /* ---------- the shape of the race ---------- */
  add("strung", "full", 1, "mid", ["They're well strung out behind the leader.", "The field is spread right out.", "There's daylight between them all.", "They're well strung out, it's a solid tempo."]);
  add("bunched", "full", 1, "mid", ["They're bunched up tightly.", "Only a few lengths covers the whole field.", "There's not much between them at all.", "It's a tight pack, and room is at a premium.", "They're all in a big bunch, this could get messy."]);
  add("pace_fast", "full", 1, "mid", ["That's a fast pace, they'll be feeling it later.", "The pace is on, and it's taking its toll.", "They're going a genuine gallop."]);
  add("pace_steady", "full", 1, "mid", ["It's a solid tempo up front.", "It's a steady pace, nothing too fast."]);
  add("pace_slow", "full", 1, "mid", ["They're not going too quickly, this could turn into a sprint.", "It's a muddling pace up front.", "The slow pace will suit those on the speed."]);
  add("halfway", "full", 1, "mid", ["Halfway, and the race is starting to take shape.", "They've passed the halfway mark.", "There's still a long way to go."]);
  add("long_race", "full", 1, "mid", ["Plenty of running left in this one.", "It's a long way yet, they'll need to save something.", "No need to rush, there's a long way to go."]);
  add("quiet", "full", 1, "mid", ["Not much has changed down the back.", "They're holding their positions for now.", "It's settled into a rhythm.", "Nobody wants to move too early."]);

  /* ---------- individual horses ---------- */
  add("mover", "post", 2, "mid", ["is improving out wide.", "is starting to make ground.", "is beginning to improve.", "is making a forward move.", "is going forward three wide.", "is improving along the rail.", "has moved into contention.", "is creeping closer.", "is starting to wind up.", "is on the move."]);
  add("travel", "post", 1, "mid", ["is travelling beautifully.", "is going well within itself.", "is sitting pretty.", "is cruising just behind the leaders.", "is nicely placed.", "is relaxed and travelling sweetly."]);
  add("pressure", "post", 2, "mid", ["is under pressure.", "is being pushed along.", "is struggling to keep up.", "is starting to feel the pinch.", "is under the pump.", "is getting tired.", "is beaten.", "is dropping out."]);
  add("traffic", "post", 2, "mid", ["is looking for a run.", "is held up for room.", "is pocketed on the rail.", "needs a gap.", "is boxed in.", "is stuck behind runners."]);
  add("traffic", "full", 2, "mid", ["There's a wall of horses in front.", "There's traffic everywhere.", "It's getting crowded in there."]);
  add("gap_found", "post", 3, "turn", ["has found a gap!", "has got clear!", "is out, and running!", "finds daylight!"]);
  add("wide", "post", 1, "mid", ["is caught three wide.", "is covering extra ground out wide.", "has no cover out wide.", "is wide on the track."]);
  add("rail", "post", 1, "mid", ["is saving ground on the rail.", "has a lovely run on the fence.", "is tucked away on the rail."]);
  add("back", "post", 1, "mid", ["is at the tail of the field.", "is giving them a start.", "has a lot of work to do.", "is last, biding its time."]);
  add("pos", "post", 1, "mid", ["is second."], { rank: 2 }); add("pos", "post", 1, "mid", ["is third."], { rank: 3 }); add("pos", "post", 1, "mid", ["is fourth."], { rank: 4 });
  add("pos", "post", 1, "mid", ["is fifth."], { rank: 5 }); add("pos", "post", 1, "mid", ["is sixth."], { rank: 6 }); add("pos", "post", 1, "mid", ["is seventh."], { rank: 7 });
  add("pos", "post", 1, "mid", ["is eighth."], { rank: 8 }); add("pos", "post", 1, "mid", ["is ninth."], { rank: 9 }); add("pos", "post", 1, "mid", ["is tenth."], { rank: 10 });
  add("pos", "post", 1, "mid", ["is eleventh."], { rank: 11 }); add("pos", "post", 1, "mid", ["is twelfth."], { rank: 12 });
  add("pos_zone", "post", 1, "mid", ["is handy, just behind the leaders."], { zone: "handy" });
  add("pos_zone", "post", 1, "mid", ["is in midfield."], { zone: "mid" });
  add("pos_zone", "post", 1, "mid", ["is back in the pack."], { zone: "back" });

  /* ---------- distance markers ---------- */
  add("marker", "full", 1, "mid", ["A thousand metres to go."], { marker: 1000 });
  add("marker", "full", 2, "mid", ["Eight hundred to go.", "Coming to the eight hundred."], { marker: 800 });
  add("marker", "full", 3, "turn", ["Six hundred to go!", "Passing the six hundred, and they're winding up!", "Six hundred metres left, the race is on!"], { marker: 600 });
  add("marker", "full", 4, "straight", ["Four hundred to go!", "Four hundred metres left!", "Four hundred to run, and they're all out!"], { marker: 400 });
  add("marker", "full", 4, "straight", ["Three hundred to go!"], { marker: 300 });
  add("marker", "full", 4, "straight", ["Two hundred to go!", "Two hundred metres left!"], { marker: 200 });
  add("marker", "full", 5, "straight", ["Two hundred to go, and it's on!"], { marker: 200, close: true });
  add("marker", "full", 4, "straight", ["A hundred metres left!"], { marker: 100 });
  add("marker", "full", 5, "straight", ["A hundred to go!", "Hundred metres!"], { marker: 100, close: true });
  add("marker", "full", 5, "straight", ["Fifty to go!", "Fifty metres!"], { marker: 50 });

  /* ---------- the home turn (anticipation, then the turn itself) ---------- */
  add("turn_near", "full", 2, "turn", ["They're coming up to the home turn.", "Not far now to the turn, this is where it gets interesting.", "The home turn is approaching, the jockeys are getting ready.", "They're nearing the turn, and the big moves are coming.", "Getting closer to the turn, and the tempo is lifting."]);
  add("turn_on", "full", 3, "turn", ["Around the home turn they come!", "They're sweeping around the turn!", "The jockeys are getting busy!", "They're fanning out across the track!", "It's on for young and old!", "Somebody's got to make a move now!", "They're starting to quicken!", "The whips are starting to crack!"]);
  add("turn_bunched", "full", 3, "turn", ["Here they come around the turn, and they're bunching up!", "They're coming wide around the turn!"]);
  add("turn_lead", "post", 3, "turn", ["leads them around the turn!", "still holds them on the turn!"]);
  add("turn_clear", "post", 3, "turn", ["is still well clear rounding the turn!"]);
  add("turn_move", "post", 3, "turn", ["is winding up out wide!", "is starting to make a move!", "is coming around them!"]);
  add("turn_pressure", "post", 3, "turn", ["is under pressure on the turn!", "is being pushed along on the turn!"]);
  add("turn_runaway", "full", 3, "turn", ["Can anything catch the leader?", "The rest have got a lot of work to do!", "They'll need to sprout wings to catch the leader!"]);

  /* ---------- the straight ---------- */
  add("straighten", "full", 3, "straight", ["And they straighten for home!", "Into the straight they come!", "They turn for home!", "And here we go, into the straight!"]);
  add("straighten", "full", 3, "straight", ["Into the Flemington straight!"], { venue: "flemington" });
  add("straighten", "full", 3, "straight", ["Into the Randwick straight!"], { venue: "randwick" });
  add("straighten", "full", 4, "straight", ["They turn for home in the Melbourne Cup!"], { race: "cup" });
  add("straighten", "full", 4, "straight", ["They straighten for home in The Everest!"], { race: "everest" });
  add("straight_six", "full", 3, "straight", ["Down the Straight Six they come!", "Into the business end now!"]);
  add("lead_new_late", "post", 4, "straight", ["hits the front!", "has taken over!", "takes the lead!", "sweeps to the front!"]);
  add("lead_new_tight", "post", 5, "straight", ["gets the nose in front!", "just edges ahead!"]);
  add("lead_fight", "post", 4, "straight", ["is fighting on!", "is holding on!", "is trying to hang on!", "is still in front!", "kicks again!", "finds more!", "won't give in!", "has still got them covered!"]);
  add("lead_wilt", "post", 4, "straight", ["is starting to wilt!", "is beginning to tire!"]);
  add("challenge", "pre", 4, "straight", ["Here comes", "And here comes", "Charging down the outside is", "Up the inside comes", "Flying home is", "Coming hard is"]);
  add("challenge", "post", 4, "straight", ["is coming hard!", "is charging down the outside!", "is flying home!", "is finishing strongly!", "is making a big run!", "is closing in!", "is gaining with every stride!", "is coming from a long way back!", "is surging!", "is running on strongly!"]);
  add("margin_late", "post", 4, "straight", ["is two lengths clear!"], { margin: 2 });
  add("margin_late", "post", 4, "straight", ["is three lengths clear!"], { margin: 3 });
  add("margin_late", "post", 4, "straight", ["is four lengths clear!"], { margin: 4 });
  add("margin_late", "post", 4, "straight", ["is five lengths clear!"], { margin: 5 });
  add("margin_late", "post", 4, "straight", ["is six lengths clear!"], { margin: 6 });
  add("margin_late", "post", 4, "straight", ["is eight lengths clear!"], { margin: 8 });
  add("margin_late", "post", 4, "straight", ["is ten lengths clear!"], { margin: 10 });
  add("margin_late", "post", 4, "straight", ["is right out on its own!"], { margin: 14 });
  add("battle", "full", 5, "straight", ["They're locked together!", "Stride for stride!", "Neck and neck!", "Nothing between them!", "They won't give an inch!", "What a battle!", "They're fighting it out!", "Head to head!", "They're going at it, hammer and tongs!", "Side by side, nothing in it!"]);
  add("battle", "conn", 5, "straight", ["and"]);
  add("three_way", "full", 5, "straight", ["Three of them in a line!", "It's a three-way battle!", "Three across the track, nothing in it!", "They're coming from everywhere!"]);
  add("runaway_late", "full", 4, "straight", ["This is a demolition!", "Nothing's going to catch this one!", "It's a procession!", "They're running for the places!", "The rest are battling for second!", "It's all over bar the shouting!"]);
  add("runaway_late", "post", 4, "straight", ["is out on its own!", "is running them ragged!", "is in a class of its own!", "has got them all off the bit!"]);
  add("caught_late", "full", 4, "straight", ["The leader is coming back to them!", "That big lead is disappearing!", "They're swallowing up the leader!", "The leader is stopping!", "Can the leader hang on?", "It's going to be close now!"]);
  add("caught_late", "post", 5, "straight", ["is being swallowed up!", "is stopping!", "is out on its feet!", "is getting run down!"]);
  add("crowd", "full", 4, "straight", ["The crowd is roaring!", "The crowd is on its feet!", "Listen to this crowd!"]);
  add("crowd", "full", 4, "straight", ["Flemington is roaring!"], { venue: "flemington" });
  add("crowd", "full", 4, "straight", ["Randwick is on its feet!"], { venue: "randwick" });
  add("placings", "full", 4, "straight", ["The fight for second is fierce.", "There's a great battle for the placings."]);
  add("line", "full", 5, "finish", ["They hit the line together!", "On the line!", "Who got there?", "It's too close to call!", "It's a photo!", "We'll need the photo!", "Couldn't split them!", "They're locked together on the line!"]);

  /* ---------- the result (only after the official finish) ---------- */
  add("win_pre", "pre", 5, "finish", ["And the winner is", "It's", "And it's"]);
  add("win_pre_photo", "pre", 5, "finish", ["On the photo, it's", "The photo says it's"]);
  add("win_dominant", "post", 4, "finish", ["wins in a canter!", "wins by the length of the straight!", "has toyed with them!", "wins it by a street!", "has absolutely demolished them!", "is a superstar!"], { tag: "triumphant" });
  add("win_clear", "post", 4, "finish", ["has won it comfortably!", "was far too strong!", "wins it well!", "has proved too good!", "has done it in style!"], { tag: "triumphant" });
  add("win_close", "post", 5, "finish", ["holds them off!", "just holds on!", "has done it!", "gets there!", "has prevailed!", "wins a thriller!"]);
  add("win_photo", "post", 5, "finish", ["by a nose!", "by a short head!", "by a whisker!", "by a head!", "by a neck!"]);
  add("win_late", "post", 5, "finish", ["has swooped late!", "came from nowhere!", "got up in the final strides!", "has run them down!"]);
  add("win_wire", "post", 4, "finish", ["has led all the way!", "has led from start to finish!", "was never headed!"], { tag: "triumphant" });
  add("after_close", "full", 5, "finish", ["What a finish!", "Unbelievable!", "What a race!", "You won't see a better finish than that!", "Absolutely incredible!", "That's why we love racing!"]);
  add("after_dominant", "full", 4, "finish", ["What a dominant display!", "That was a champion's performance!", "Too good, by a long way!", "A performance to remember!"], { tag: "triumphant" });
  add("after_clear", "full", 3, "finish", ["That was a decisive win.", "Plenty in hand at the finish.", "A very good win, that."]);
  add("after_major", "full", 5, "finish", ["What a Melbourne Cup!", "A Melbourne Cup to remember!", "What a way to win the Cup!"], { race: "cup" });
  add("after_major", "full", 5, "finish", ["What an Everest!", "What a way to win The Everest!"], { race: "everest" });

  /* ---------- incidents ---------- */
  add("fall", "full", 4, "any", ["There's been a fall!", "Oh, there's trouble, a horse is down!", "There's a pile-up, several horses are down!"]);
  add("fall", "post", 4, "any", ["has gone down!", "has fallen!", "is down!"]);

  // stable ids from the words (a changed phrase is a new recording, never a mismatched one)
  const seen = new Set();
  for (const u of U) {
    let id = u.topic + "/" + u.text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 44);
    let k = id, n = 2; while (seen.has(k)) k = id + "_" + n++; seen.add(k); u.id = k;
  }
  const byTopic = new Map(); for (const u of U) { if (!byTopic.has(u.topic)) byTopic.set(u.topic, []); byTopic.get(u.topic).push(u); }
  // how each delivery energy is asked for (eleven_v4 audio tags; chosen from test recordings — see docs/COMMENTARY.md)
  const TIER_TAGS = { 1: "[calm race caller]", 2: "[lively race caller]", 3: "[building excitement]", 4: "[urgent, fast and loud]", 5: "[screaming with excitement, very fast]", triumphant: "[triumphant and loud]" };
  // a horse's name is recorded in three deliveries: before a phrase mid-race, excited in the straight, screamed at the climax
  const NAME_CTX = { c: { tier: 2, tag: "[lively race caller]", punct: "," }, x: { tier: 4, tag: "[urgent, fast and loud]", punct: "!" }, s: { tier: 5, tag: "[screaming with excitement, very fast]", punct: "!" } };
  return { units: U, byTopic, byId: new Map(U.map(u => [u.id, u])), TIER_TAGS, NAME_CTX };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CALLS;
