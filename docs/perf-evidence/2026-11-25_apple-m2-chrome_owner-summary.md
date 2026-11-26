# Real-device evidence: Apple M2 MacBook, Chrome (Phase 15A diagnostic build, artifact version 20)

**Source:** the owner's own account, copied from the chat on 2026-11-25. These are the figures the owner stated; the raw `report.txt` files from the Shift+F8 dialog were **not** pasted into the session, so they are not reproduced here. If you hold them, drop them in this folder unedited (naming: `<device>_<browser>_<condition>-<run>_report.txt`, see `PROGRESS_P15.md`). Nothing below has been re-measured or corrected by Claude.

## 1. Battery runs: three benchmarks (owner's words, summarised from the chat)
1. Normal Claude artifact: 30 Hz "detected", 33.3 ms median, 100 % on-time.
2. Direct `final-furlong-single.html` in Chrome: identical 30 Hz and 33.3 ms frame times.
3. AUTO lab switch = Off: still 30 Hz and 33.3 ms, with the canvas at 3420 × 1902 and shadows 4096 (the two runs before it had render ×1 and shadows 1024).
- Owner's feel: "the racing still looks noticeably jerky, similar to when the old dirt-particle effects caused lag".
- Later, separately measured by the owner: Chrome on this MacBook ran at **about 27 FPS on battery** and **reached 60 FPS immediately when plugged in**. During Final Furlong racing, **unplugging caused visible degradation and reconnecting restored smoothness.**

## 2. Clean plugged-in benchmark, all Phase 15A lab settings at defaults (owner's figures)
| Item | Value |
|---|---|
| Frames over the 60 s benchmark | 3,593 (about 59.9 FPS) |
| On-time frames | 99.89 % |
| Frame time median / p95 / p99 | 16.7 / 16.8 / 17.5 ms |
| Hitches | 4, including one frame of **99.2 ms** |
| AUTO graphics changes during racing | 3 |
| The 99.2 ms hitch | coincided with an **AUTO quality increase to render scale 2×**, with about **101.6 ms of JavaScript work in the preceding frame** |

## 3. What the owner concluded
MacBook power management (battery state) was the primary cause of the apparent continuous 30 FPS regression, rather than a fundamental problem with racing physics or rendering.

## Arithmetic check by Claude (not a re-measurement)
4 hitches / 3,593 frames = 0.111 % (consistent with 99.89 % on-time); 4 hitches in 60 s = about 4 per minute.

## 4. After the 15C AUTO-queue build (artifact version 21), plugged in, all lab switches at defaults (owner's figures)
| Item | Value |
|---|---|
| Frames over the 60 s benchmark | 3,524 (about 58.7 FPS) |
| On-time frames | 97.93 % |
| Late frames | 73, maximum 83.3 ms |
| Graphics | full quality at the time: AUTO level 0, 2× render scale, 4096 shadows (the now-removed High) |
| AUTO quality changes during the race | 0 |
| Owner's reading | the 30 FPS power issue is substantially understood, AUTO changes now appear to be deferred correctly; occasional uneven frame pacing remains and overall performance is much better |
