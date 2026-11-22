#!/usr/bin/env python3
"""Final Furlong — build the prerecorded commentary library (v2) from ElevenLabs batch recordings.

Voice: "Commentator" (voice ID MTGAJpjryOZn2Xr8FOtm, the account owner's chosen commentator voice), model eleven_v4.
The phrases are the ones in public/calls.js (the same list the commentary director chooses from); the batch plan comes
from tools/commentary-batches.js: one delivery tag per batch + lines separated by blank lines. This script
  1. splits each batch master at its pauses (the N-1 longest silences for N lines) and REFUSES a batch whose pauses are
     ambiguous (the shortest cut must be clearly longer than the longest pause inside a line),
  2. checks every clip's speaking rate against its text (a dropped or garbled word shows up as an implausible rate),
  3. trims, fades, sets the loudness by delivery energy (a calm call sits lower than a screamed finish) with a peak limit,
  4. encodes mono MP3 (24 kHz, 48 kbps — small enough to embed the library in the single-file build) and writes
     manifest.json (+ qc.json with the measurements).
  python3 tools/commentary-library.py batches.json <dir with <batch>.mp3 masters> public/assets/audio/commentary
No API calls are made here; re-running costs nothing."""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
spec = importlib.util.spec_from_file_location("va", os.path.join(os.path.dirname(__file__), "voice-analyse.py")); va = importlib.util.module_from_spec(spec); spec.loader.exec_module(va)
import numpy as np

VOICE_ID, VOICE_NAME, MODEL, VERSION = "MTGAJpjryOZn2Xr8FOtm", "Commentator", "eleven_v4", 2
# target loudness of the voiced part (dBFS RMS) by delivery energy: the excitement is in the voice AND the level
TIER_DB = {1: -21.0, 2: -20.0, 3: -19.0, 4: -17.5, 5: -16.5}
# the recordings come out at much the same speaking rate whatever the delivery; urgency also needs pace, so the
# urgent and screamed takes are tightened a little (pitch-preserving)
TIER_TEMPO = {1: 1.0, 2: 1.0, 3: 1.03, 4: 1.06, 5: 1.12}
NAME_TIER = {"c": 2, "x": 4, "s": 5}

def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)
def dur(f): return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.strip())
def silences(f, noise, d):
    e = run(["ffmpeg", "-hide_banner", "-i", f, "-af", "silencedetect=noise=%ddB:d=%s" % (noise, d), "-f", "null", "-"]).stderr
    return list(zip([float(x) for x in re.findall(r"silence_start: ([0-9.]+)", e)], [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", e)]))

def cut_points(f, n, T, texts):
    """the n-1 cut points: of all the pauses found, the set whose segment lengths best match each line's expected length
    (from its syllable count), preferring longer pauses — a dynamic-programming alignment, so a long pause INSIDE an
    excited line can't steal a cut. Returns (score, cuts, mean |log(actual/expected)|, worst)."""
    cand = {}
    for noise, d in ((-35, 0.06), (-30, 0.05), (-40, 0.08), (-26, 0.05)):
        for a, b in silences(f, noise, d):
            if a > 0.12 and b < T - 0.05:
                k = round((a + b) / 2, 2)
                if not any(abs(k - q) < 0.05 for q in cand): cand[k] = (a, b)
    C = sorted(cand.values())
    if len(C) < n - 1: return None
    syl = [max(1, va.syllables(t)) for t in texts]; tot = sum(syl)
    gaps_est = 0.42 * (n - 1)
    kk = max(0.05, (T - gaps_est) / tot)
    lead = 0.0
    INF = 1e18
    m = len(C)
    # best[i][j]: line i ends at candidate j (i = 0..n-2)
    best = [[INF] * m for _ in range(n - 1)]; back = [[-1] * m for _ in range(n - 1)]
    def seg_cost(i, t0, t1, gap):
        d = max(0.05, t1 - t0); e = syl[i] * kk + 0.15
        return (np.log(d / e)) ** 2 * 3.0 - min(gap, 0.9) * 1.6
    for j in range(m):
        a, b = C[j]; best[0][j] = seg_cost(0, lead, a, b - a)
    for i in range(1, n - 1):
        for j in range(i, m):
            a, b = C[j]; bj = INF; bk = -1
            for k in range(i - 1, j):
                if best[i - 1][k] >= INF: continue
                v = best[i - 1][k] + seg_cost(i, C[k][1], a, b - a)
                if v < bj: bj, bk = v, k
            best[i][j] = bj; back[i][j] = bk
    fin = INF; fj = -1
    if n == 1: return (0, [], 0, 0)
    for j in range(n - 2, m):
        if best[n - 2][j] >= INF: continue
        v = best[n - 2][j] + seg_cost(n - 1, C[j][1], T, 0.5)
        if v < fin: fin, fj = v, j
    if fj < 0: return None
    idx = [fj]
    for i in range(n - 2, 0, -1): idx.append(back[i][idx[-1]])
    cuts = [C[j] for j in reversed(idx)]
    b = [0.0] + [c[1] for c in cuts]; e = [c[0] for c in cuts] + [T]
    dev = [abs(np.log(max(0.05, e[i] - b[i]) / (syl[i] * kk + 0.15))) for i in range(n)]
    return (fin, cuts, float(np.mean(dev)), float(max(dev)))

def main(plan_file, src, dst):
    plan = json.load(open(plan_file))
    manifest = {"version": VERSION, "voice": {"id": VOICE_ID, "name": VOICE_NAME, "provider": "ElevenLabs", "model": MODEL},
                "format": "audio/mpeg (MP3, mono, 24 kHz, 48 kbps)",
                "licence": "Generated on the account owner's ElevenLabs plan with the owner's own cloned voice — see ASSETS.md.",
                "clips": []}
    qc, problems = [], []
    for b in plan:
        f = os.path.join(src, b["name"] + ".mp3")
        if not os.path.exists(f): problems.append(b["name"] + " (no master)"); continue
        T = dur(f); n = len(b["items"])
        cp = cut_points(f, n, T, [re.sub(r"[^A-Za-z' ]", " ", it["text"]) for it in b["items"]])
        if cp is None: problems.append("%s (not enough pauses)" % b["name"]); continue
        margin, cut = cp[2], cp[1]
        if cp[3] > 1.1: problems.append("%s (a segment is %.1fx off its expected length)" % (b["name"], np.exp(cp[3])))
        x = va.pcm(f)
        for i, it in enumerate(b["items"]):
            a = 0.0 if i == 0 else max(0, cut[i - 1][1] - 0.06)
            z = T if i == n - 1 else cut[i][0] + 0.08
            m = va.analyse(x[int(a * va.SR): int(z * va.SR)], re.sub(r"[^A-Za-z' ]", " ", it["text"]))
            tier = NAME_TIER[b["names"]] if b.get("names") else (5 if "screaming" in b["tag"] else 4 if "urgent" in b["tag"] or "triumphant" in b["tag"] else 3 if "building" in b["tag"] else 2 if "lively" in b["tag"] else 1)
            gain = TIER_DB[tier] - m["rms_db"] if m["rms_db"] > -60 else 0
            rel = it["id"] + ".mp3"; out = os.path.join(dst, rel); os.makedirs(os.path.dirname(out), exist_ok=True)
            af = ("atrim=%.3f:%.3f,asetpts=PTS-STARTPTS,silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,"
                  "%svolume=%.2fdB,alimiter=limit=0.89:attack=2:release=40,afade=t=in:d=0.01,areverse,afade=t=in:d=0.03,areverse") % (a, z, ("atempo=%.2f," % TIER_TEMPO[tier]) if TIER_TEMPO[tier] != 1 else "", gain)
            r = run(["ffmpeg", "-hide_banner", "-y", "-i", f, "-af", af, "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "48k", out])
            if r.returncode: problems.append(rel); continue
            d = round(dur(out), 3); rate = m.get("syl_per_s", 0)
            flag = (rate and (rate < 1.6 or rate > 9.5) and va.syllables(it['text']) > 2) or d < 0.15
            q = dict(id=it["id"], batch=b["name"], text=it["text"], dur=d, rate=rate, f0=m["f0_med"], f0_range=m["f0_range_st"], rms=m["rms_db"], tier=tier, margin=round(margin, 2), flag=bool(flag))
            qc.append(q)
            if flag: problems.append("%s (rate %.1f syl/s, %.2f s)" % (rel, rate, d))
            clip = {"id": it["id"], "file": rel, "duration": d, "text": it["text"], "tier": tier, "batch": b["name"], "voice_id": VOICE_ID, "version": VERSION}
            if it.get("name"): clip["name"] = it["name"]; clip["ctx"] = b["names"]
            manifest["clips"].append(clip)
        print("%-24s %2d lines %6.1f s  length fit %.2f (worst %.2f)" % (b["name"], n, T, cp[2], cp[3]))
    json.dump(manifest, open(os.path.join(dst, "manifest.json"), "w"), indent=0, ensure_ascii=False)
    json.dump(qc, open(os.path.join(dst, "qc.json"), "w"), indent=0)
    tot = sum(c["duration"] for c in manifest["clips"]); size = sum(os.path.getsize(os.path.join(dst, c["file"])) for c in manifest["clips"])
    print("clips: %d, %.1f s of audio, %.0f KB; problems: %s" % (len(manifest["clips"]), tot, size / 1024, problems or "none"))

if __name__ == "__main__": main(sys.argv[1], sys.argv[2], sys.argv[3])
