#!/usr/bin/env python3
"""Final Furlong — build the prerecorded commentary library from ElevenLabs batch recordings.

The clips were generated with the ElevenLabs voice "mw_e-sports-commentator_The Aussie Companion"
(voice ID OQt0mf8rKBYkweCSQ9d4, model eleven_v4) in 13 batch recordings: several short lines per recording
separated by pauses (cheaper and more consistent than one request per line). This script splits each batch at its
pauses (ffmpeg silencedetect, the N-1 longest gaps for N lines), trims, fades, normalises each batch to -1 dBFS peak
(keeping the calm/excited/shouting levels relative to each other), encodes mono MP3 and writes manifest.json.

  python3 tools/commentary-library.py <dir with the batch masters (*.mp3)> public/assets/audio/commentary
The prompts below are exactly what was sent; re-running costs nothing (no API calls are made here).
"""
import json, os, re, subprocess, sys

VOICE_ID = "OQt0mf8rKBYkweCSQ9d4"
VOICE_NAME = "mw_e-sports-commentator_The Aussie Companion"
MODEL = "eleven_v4"
VERSION = 1

def L(cat, cid, text, energy, pri, use):
    return dict(category=cat, id=cid, phrase=text, energy=energy, priority=pri, use=use)

ROSTER = ["Ka Ying Rising", "Willow's Pride", "Quiet Thunder", "Tempted", "Bay Majesty", "Half Yours", "Point Of Law",
          "Trust Your Instinct", "Yes Yes Yes", "Hopewell Rock", "Goodie Two Shoes", "Soul Of Spain"]

def career_names():
    src = open(os.path.join(os.path.dirname(__file__), "..", "public", "season.js"), encoding="utf8").read()
    m = re.search(r"const HORSE_NAMES = \[([\s\S]*?)\];", src)
    return re.findall(r'"([^"]+)"', m.group(1))

BATCHES = {
  "p1_calm": ("[warmly] ... [pause] ...", [
    L("major-events", "welcome_generic", "Welcome to the races, and they're loading into the barriers.", 1, 2, "pre-race, any venue"),
    L("early", "settle_1", "The field settles into stride.", 1, 1, "first 25% of the race"),
    L("early", "settle_2", "They're starting to find their rhythm now.", 1, 1, "first 25% of the race"),
    L("middle", "tempo_1", "It's a steady tempo up front.", 1, 1, "middle stage, no incident"),
    L("middle", "tempo_2", "Plenty of running left in this one yet.", 1, 1, "middle stage, races ≥ 1600 m"),
    L("middle", "back_1", "They race down the back, nicely spaced.", 1, 1, "middle stage, field strung out"),
  ]),
  "p2_start": ("[excited]", [
    L("start", "away_1", "And they're away and racing!", 2, 3, "gates open"),
    L("start", "away_2", "They jump, and they're racing!", 2, 3, "gates open"),
    L("start", "away_3", "The gates fly open, and they're off!", 2, 3, "gates open"),
    L("major-events", "everest", "Welcome to Royal Randwick, for The Everest!", 2, 2, "pre-race, The Everest"),
    L("major-events", "melbourne_cup", "Welcome to Flemington. It's the Melbourne Cup, the race that stops a nation!", 2, 2, "pre-race, Melbourne Cup"),
  ]),
  "p3_turn": ("[excited]", [
    L("home-turn", "approach", "They're approaching the home turn!", 2, 2, "entering the final bend"),
    L("home-turn", "around", "Around the turn they come!", 2, 2, "on the final bend"),
    L("home-turn", "straighten", "And they straighten for home!", 2, 3, "turning into the home straight"),
    L("final-600", "winding", "Six hundred to go, and they're winding up!", 2, 2, "600 m mark"),
    L("final-400", "four_1", "Four hundred metres to go!", 2, 3, "400 m mark"),
    L("final-400", "four_2", "Four hundred to run, and the whips are up!", 2, 3, "400 m mark, field bunched"),
  ]),
  "p4_finish": ("[shouting]", [
    L("final-200", "two_1", "Two hundred metres to go!", 3, 3, "200 m mark"),
    L("final-200", "two_2", "Two hundred to run, and it's ON!", 3, 3, "200 m mark, contest close"),
    L("final-100", "hundred_1", "A hundred to go, they're locked together!", 3, 3, "100 m mark, top two within ~1 length"),
    L("final-100", "hundred_2", "Hundred metres to go!", 3, 3, "100 m mark"),
    L("photo-finish", "what_a_finish", "What a finish!", 3, 4, "after the line, margin < 0.5 length"),
    L("photo-finish", "line_together", "They hit the line together!", 3, 4, "at the line, margin < 0.2 length"),
    L("photo-finish", "photo_1", "It's a photo finish!", 3, 4, "after the line, too close to call"),
    L("photo-finish", "photo_2", "Too close to call, we'll need the photo!", 3, 4, "after the line, too close to call"),
  ]),
  "p5_connect": ("[excited]", [
    L("winners", "extraordinary", "An extraordinary performance!", 2, 3, "after the result, winning margin ≥ 3 lengths"),
    L("winners", "plenty_in_hand", "Won that with plenty in hand!", 2, 3, "after the result, comfortable win"),
    L("winners", "winner_is", "And the winner is,", 2, 4, "lead-in to the official winner's name"),
    L("transitions", "new_leader", "And there's a new leader,", 2, 3, "lead-in to a name: lead change"),
    L("transitions", "takes_over", "Taking over in front,", 2, 3, "lead-in to a name: lead change"),
    L("transitions", "big_run", "Here comes a big run from", 2, 3, "lead-in to a name: strong late run"),
    L("transitions", "out_wide", "Making a move out wide,", 2, 2, "lead-in to a name: move on the outside"),
    L("transitions", "still_leads", "Still out in front,", 2, 2, "lead-in to a name: leader holding on"),
    L("transitions", "trapped", "Looking for room on the rail,", 2, 2, "lead-in to a name: blocked runner"),
    L("transitions", "clear", "Clear in front,", 2, 2, "lead-in to a name: leader by ≥ 2 lengths"),
  ]),
}
def name_batch(names):
    return ("[excited]", [L("horse-names", re.sub(r"[^a-z0-9]+", "_", n.lower()).strip("_"), n, 2, 3, "the horse's name, after a lead-in or on its own") for n in names])
BATCHES["names_roster"] = name_batch(ROSTER)
cn = career_names()
for i in range(0, len(cn), 16): BATCHES["n%d" % (i // 16 + 1)] = name_batch(cn[i:i + 16])

def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)
def dur(f): return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.strip())
def gaps(f, noise, d):
    out = run(["ffmpeg", "-hide_banner", "-i", f, "-af", "silencedetect=noise=%ddB:d=%s" % (noise, d), "-f", "null", "-"]).stderr
    st = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", out)]; en = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", out)]
    return list(zip(st, en))

def main(src, dst):
    manifest = {"version": VERSION, "voice": {"id": VOICE_ID, "name": VOICE_NAME, "provider": "ElevenLabs", "model": MODEL},
                "format": "audio/mpeg (MP3, mono, 44.1 kHz, 80 kbps)", "licence": "Generated on the account owner's ElevenLabs plan — see ASSETS.md (Free plan: non-commercial, attribution).",
                "clips": []}
    problems = []
    for b, (tag, lines) in BATCHES.items():
        f = os.path.join(src, b + ".mp3"); T = dur(f); n = len(lines); cut = None
        for noise, d in ((-32, 0.12), (-30, 0.1), (-28, 0.08), (-35, 0.15), (-26, 0.07)):
            g = [x for x in gaps(f, noise, d) if x[0] > 0.15 and x[1] < T - 0.1]
            if len(g) >= n - 1:
                g = sorted(sorted(g, key=lambda x: x[1] - x[0], reverse=True)[:n - 1]); cut = g; break
        if cut is None: problems.append(b); continue
        peak = float(re.search(r"max_volume: (-?[0-9.]+)", run(["ffmpeg", "-hide_banner", "-i", f, "-af", "volumedetect", "-f", "null", "-"]).stderr).group(1))
        gain = -1.0 - peak
        bounds = [0.0] + [None] * (n - 1) + [T]
        segs = []
        for i in range(n):
            a = 0.0 if i == 0 else max(0, cut[i - 1][1] - 0.05)
            z = T if i == n - 1 else cut[i][0] + 0.1
            segs.append((a, z))
        for (a, z), ln in zip(segs, lines):
            os.makedirs(os.path.join(dst, ln["category"]), exist_ok=True)
            rel = "%s/%s.mp3" % (ln["category"], ln["id"]); out = os.path.join(dst, rel)
            fo = max(0.02, min(0.06, (z - a) * 0.1))
            af = "atrim=%.3f:%.3f,asetpts=PTS-STARTPTS,silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,volume=%.2fdB,afade=t=in:d=0.012,areverse,afade=t=in:d=%.3f,areverse" % (a, z, gain, fo)
            r = run(["ffmpeg", "-hide_banner", "-y", "-i", f, "-af", af, "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "80k", out])
            if r.returncode: problems.append(rel); continue
            clip = dict(ln); clip["file"] = rel; clip["duration"] = round(dur(out), 3); clip["batch"] = b; clip["delivery_tag"] = tag.split()[0]
            clip["voice_id"] = VOICE_ID; clip["version"] = VERSION
            manifest["clips"].append(clip)
        print("%-13s %2d lines  %5.1f s  gain %+.1f dB  ok" % (b, n, T, gain))
    json.dump(manifest, open(os.path.join(dst, "manifest.json"), "w"), indent=1, ensure_ascii=False)
    tot = sum(c["duration"] for c in manifest["clips"]); size = sum(os.path.getsize(os.path.join(dst, c["file"])) for c in manifest["clips"])
    print("clips: %d, %.1f s of audio, %.0f KB; problems: %s" % (len(manifest["clips"]), tot, size / 1024, problems or "none"))

if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
