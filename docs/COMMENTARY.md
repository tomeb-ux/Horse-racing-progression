# Final Furlong — the race caller

How the commentary works, how the ElevenLabs recordings were made, what they cost, and how to extend them.
Real transcripts from seven kinds of race: [`COMMENTARY-SCENARIOS.md`](COMMENTARY-SCENARIOS.md).

## 1. The director (`public/commentary.js`)

The caller is a director that reads the race (it never changes it) four times a second and decides what is worth
saying, rather than announcing the race state on a timer.

**Race view.** Running order; the leader's margin and its trend over the last 8 s; the groups the field has split into
(a new group wherever there is ≥ 1.6 lengths of daylight); how tight the leading eight are; the pace (the leader's speed
against its top speed); for every horse: places gained or lost in the last 4–8 s, speed against the leader, how long it
has been boxed in, wide or on the rail, effort and stamina; battles anywhere in the field; who led at the 600 and the
200 and by how much; whether the eventual leader has led all the way.

**Observations.** Each possible call is a candidate with a significance score: a lead change, a breakaway, the margin
growing or coming back, the chasing pack, the battle for second, a horse improving (out wide / on the rail), under
pressure, boxed in, finding a gap, caught wide, saving ground, travelling well, the pace, the shape of the field,
halfway, markers, a run through the field, the rider's horse; in the straight: battles, three-way finishes, challengers,
a horse flying from behind, the leader fighting on or wilting, a runaway, a big leader being swallowed up.

**Memory and repetition rules.**
- every topic has a cooldown, per horse where it is about a horse (a horse "improving" isn't called again for 14 s, a
  margin isn't updated for 24 s and only when it has changed by two bands, the pace and the shape of the field once);
- once a breakaway is called, the leader is no longer narrated: the margin is only updated when it really changes, and
  the story moves to the chasers, the battle for second, horses making moves and whether the leader is coming back;
- a new leader resets the breakaway story; a big leader caught before the straight is told as that story ("They're
  swallowing up the leader! X has hit the front!");
- each phrase is used at most once per race while alternatives remain (and the least-used phrase across the session
  wins a tie), and no sentence is ever said twice in a race;
- a second, related observation can join the same breath mid-race ("…, and Midnight Legend is improving out wide"),
  but never about the same horse twice.

**Pacing.** Mid-race the caller needs a score of ≥ 3.9 to break a silence and may stay quiet for up to 5.5 s (calm,
conversational, 1.1–2.3 s between lines); approaching the turn the threshold drops and the caller anticipates the turn
("They're coming up to the home turn…") before it happens; from the 600 the gaps shrink to 0.2–0.45 s; inside the last
230 m the caller never pauses for more than about a second and calls in short bursts (marker + the main call, names
screamed in a close finish).

**Excitement** (1 calm … 5 frantic) comes from the stage and the race data: + when the top two are within a length or
three are within 1.5 lengths after the 520; 5 when it is within 0.6 lengths in the last 260 m; capped at 3.7 for a
runaway (an emphatic call, never a manufactured thriller); a little higher for feature races. It chooses which
recordings are used (each phrase has its own delivery) and which take of a horse's name (mid-race / excited / screamed).

**Truth rules.**
- a line is built at the moment it is spoken from the current race; a "who leads" line is never spoken once wrong
  (an urgent event — a late lead change, a fall, the finish — cuts a stale line short);
- battle language only when the top two really are within a length; runaway language only when the margin is there;
  "the leader is coming back" only when the margin has actually come down;
- predictions ("Nothing's going to catch this one!", "It's all over bar the shouting!") only when the race is
  effectively decided (≥ 6 lengths inside the last 200 m with the leader not slowing);
- the winner is named only from the official timing; a photo finish waits until both have crossed; the winning call
  matches the margin (dominant ≥ 5 lengths, clear ≥ 2, close, photo by a nose / short head / head / neck), and the story
  (led all the way, swooped late).

## 2. The phrase bank (`public/calls.js`)

410 phrases in four forms: full sentences, phrases that follow a name ("…has opened up a big break."), lead-ins before
a name ("Here comes…") and links in a run through the field ("leads from", "then"). Each has a delivery tier (1–5), a
stage, and any fact it requires (a margin band, a position, a marker, a venue, a race). The same list is what the
director chooses from, what was recorded, and what the local voice reads — so the caption is always exactly what you
hear.

## 3. The recordings

**Voice:** "Commentator", ID `MTGAJpjryOZn2Xr8FOtm` (cloned voice in the account owner's ElevenLabs workspace; male,
Australian English). The previous voice (OQt0mf8rKBYkweCSQ9d4) is no longer used or shipped.

**Delivery experiments (before recording anything at scale).** The same four lines (calm mid-race → home turn → 200 m →
photo finish) were generated four ways and measured with `tools/voice-analyse.py` (pitch, pitch range, loudness,
speaking rate, brightness per line):

| variant | median pitch, line 1 → 4 | notes |
|---|---|---|
| eleven_v4, emotion tags `[warmly]` / `[excited]` / `[shouting]` | 170 → 286 → 314 → 314 Hz | good build, flat at the top |
| eleven_v3, same tags | 262 → 281 → 296 → 333 Hz | calm line already raised: little contrast |
| eleven_v4, no tags (punctuation and capitals only) | 225 → 291 → 314 Hz | lines 3–4 ran together |
| **eleven_v4, descriptive tags** `[calm race caller]` / `[building excitement]` / `[urgent, fast and loud]` / `[screaming with excitement, very fast]` | **156 → 286 → 308 → 348 Hz** | widest, steadiest build: chosen |

So the library uses eleven_v4 with five delivery tags (plus `[lively race caller]` and `[triumphant and loud]`). One
batch was transcribed with ElevenLabs Scribe to check the words: an exact match, no tag read aloud.

**Measured result across the library** (median pitch of the phrase clips): calm 216 Hz → lively 286 → building 302 →
urgent 314 → screaming 327 Hz; names 250 → 271 → 296 Hz. The recordings came out at much the same speaking rate whatever
the delivery, so the builder tightens the urgent and screamed takes a little (pitch-preserving, ×1.06 / ×1.12) and sets
their level higher (−21 dBFS calm → −16.5 dBFS screaming, peak-limited): screamed clips play about 8 % faster in
syllables per second than calm ones. Most of the rise in excitement is in pitch and level rather than tempo.

**Batching.** 47 recordings of up to 22 lines each, one delivery tag per batch, lines separated by blank lines (no
`[pause]` tags — they are billed as characters: this saved about 3,000 credits). `tools/commentary-library.py` splits each
batch by aligning the pauses to each line's expected length (from its syllable count) with dynamic programming, so a
long pause inside an excited line can't steal a cut; it refuses a batch whose cuts don't fit, flags any clip with an
implausible speaking rate, trims, fades, levels and encodes mono MP3 at 24 kHz / 48 kbps (small enough to embed the
whole library in the single-file build: 5.4 MB, 794 clips, 884 s of audio). No clip was flagged.

**Names.** 128 names (Quick Race field, career rival pool, the 19 choosable career names), each in three deliveries:
`c` mid-race ("Name," before a phrase), `x` excited ("Name!" in the straight), `s` screamed ("Name!" at the finish).

## 4. Playback (`public/eleven.js`)

The clips stay compressed in memory; each line's clips are decoded just before it is spoken and scheduled
sample-accurately on the Web Audio clock (no timer gaps; 15–60 ms joins between a phrase and a name, a breath between
sentences that shortens as the excitement rises). The field's names and the opening calls are decoded before the
gates open; at most 160 decoded clips are kept. Measured in Chromium: decision → sound median 3 ms, worst 160 ms (the
first intro). A new line always stops the previous one (no overlaps); a line whose audio took too long to prepare is
dropped rather than describing the past.

## 5. Credits

| | credits |
|---|---|
| balance at the start (Starter plan, monthly) | 32,929 limit, 610 used → 32,319 available |
| delivery experiments (4 × ~350 characters) | 1,415 |
| one Scribe transcription check (the estimate said 11; it cost 202 — so no more were made) | 202 |
| the library: 47 batches (410 phrases + 128 names × 3) | about 18,200 by the account's usage counter (19,280 estimated beforehand) |
| **left this period** | **12,502** |

Every request was priced with `estimate_only` first or from the measured 1 credit per character (tags included). New
names in Enhanced mode cost ~120 credits each (three deliveries), once — the remaining balance covers about 100 of them.

## 6. Adding phrases or names

1. Add the phrase to `public/calls.js` (topic, form, tier, stage, facts) and use its topic in the director.
2. `node tools/commentary-batches.js > tools/commentary-batches.json` (prints the credit estimate). Generate only the new
   batches with the ElevenLabs connector (eleven_v4, voice MTGAJpjryOZn2Xr8FOtm, one take), save each as
   `<batch name>.mp3` in a folder with the existing masters.
3. `python3 tools/commentary-library.py tools/commentary-batches.json <masters> public/assets/audio/commentary`
Listen to a whole race call without the game: `node tools/render-race-call.js <race index> out.mp3` (a scenario-harness race,
clips laid out at the times the director spoke them; an interrupting call is placed after the line it cut short).

4. `node tests/eleven-plan.js` (every phrase and name recorded), `node tests/commentary-scenarios.js 160`.
The director picks from the bank whatever voice is active; a phrase without a recording would play as a caption only,
which is why `tests/eleven-plan.js` fails if any phrase lacks one.
