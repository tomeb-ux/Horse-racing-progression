#!/usr/bin/env python3
"""Final Furlong — acoustic check of commentary recordings (no listening required to compare takes).
For each file (or each segment between pauses when --split N is given) prints: duration, speaking rate (syllables/s,
from the expected text when given), loudness (RMS dBFS of voiced frames), peak, median pitch (Hz) and pitch range
(10th–90th percentile, semitones), spectral centroid (Hz; rises with a raised, shouted voice) and the share of the
segment that is voiced. Used to pick model/tag settings and to QC the library (excitement must rise from the calm
mid-race calls to the final-200 calls).
  python3 tools/voice-analyse.py file.mp3 [--split N] [--text "line1|line2|…"]"""
import subprocess, sys, json, re
import numpy as np
SR = 16000
def pcm(f, a=None, z=None):
    cmd = ["ffmpeg", "-v", "error"] + (["-ss", str(a), "-to", str(z)] if a is not None else []) + ["-i", f, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, dtype=np.float32)
def syllables(t):
    n = 0
    for w in re.findall(r"[a-zA-Z']+", t.lower()):
        v = re.findall(r"[aeiouy]+", w); k = len(v)
        if w.endswith("e") and k > 1 and not w.endswith("le"): k -= 1
        n += max(1, k)
    return n
def f0(frame):
    frame = frame - frame.mean()
    if np.sqrt((frame ** 2).mean()) < 0.01: return None
    ac = np.correlate(frame, frame, "full")[len(frame) - 1:]
    lo, hi = SR // 400, SR // 70
    if ac[0] <= 0: return None
    seg = ac[lo:hi]; i = int(np.argmax(seg)) + lo
    return SR / i if ac[i] / ac[0] > 0.35 else None
def analyse(x, text=None):
    d = len(x) / SR; hop, win = 160, 640
    fr = [x[i:i + win] for i in range(0, len(x) - win, hop)]
    rms = np.array([np.sqrt((f ** 2).mean()) + 1e-9 for f in fr]) if fr else np.array([1e-9])
    voiced = rms > max(0.02, rms.max() * 0.1)
    p = [f0(f) for f, v in zip(fr, voiced) if v]; p = np.array([q for q in p if q])
    spec = np.abs(np.fft.rfft(x[: len(x) // 2048 * 2048].reshape(-1, 2048) * np.hanning(2048), axis=1)) if len(x) >= 2048 else None
    freqs = np.fft.rfftfreq(2048, 1 / SR)
    cen = float((spec * freqs).sum(1).sum() / spec.sum()) if spec is not None and spec.sum() > 0 else 0
    out = dict(dur=round(d, 2), rms_db=round(float(20 * np.log10(np.sqrt((rms[voiced] ** 2).mean()))) if voiced.any() else -99, 1),
               peak_db=round(20 * np.log10(np.abs(x).max() + 1e-9), 1), voiced=round(float(voiced.mean()), 2),
               f0_med=round(float(np.median(p)), 0) if len(p) > 5 else None,
               f0_range_st=round(float(12 * np.log2(np.percentile(p, 90) / np.percentile(p, 10))), 1) if len(p) > 5 else None,
               centroid=round(cen))
    if text: active = (rms > 0.008).mean() * d; out["syl_per_s"] = round(syllables(text) / max(0.1, active), 2); out["text"] = text[:60]
    return out
def gaps(f, noise=-32, dmin=0.25):
    e = subprocess.run(["ffmpeg", "-hide_banner", "-i", f, "-af", f"silencedetect=noise={noise}dB:d={dmin}", "-f", "null", "-"], capture_output=True, text=True).stderr
    st = [float(v) for v in re.findall(r"silence_start: ([0-9.]+)", e)]; en = [float(v) for v in re.findall(r"silence_end: ([0-9.]+)", e)]
    return list(zip(st, en))
if __name__ == "__main__":
    f = sys.argv[1]; n = int(sys.argv[sys.argv.index("--split") + 1]) if "--split" in sys.argv else 1
    texts = sys.argv[sys.argv.index("--text") + 1].split("|") if "--text" in sys.argv else [None] * n
    x = pcm(f); T = len(x) / SR
    if n == 1: print(json.dumps(analyse(x, texts[0]), default=float)); sys.exit()
    g = [q for q in gaps(f) if q[0] > 0.2 and q[1] < T - 0.1]; g = sorted(sorted(g, key=lambda q: q[1] - q[0], reverse=True)[:n - 1])
    b = [0] + [q[0] + 0.05 for q in g]; e = [q[0] + 0.05 for q in g] + [T]; s = [0] + [q[1] - 0.05 for q in g]
    for i in range(min(n, len(s))):
        print(json.dumps(analyse(x[int(s[i] * SR): int(e[i] * SR)], texts[i]), default=float))
