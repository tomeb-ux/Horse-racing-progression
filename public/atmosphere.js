'use strict';
/* =====================================================================
   FINAL FURLONG — ATMOSPHERE (Phase 12): time of day and weather as plain data
   One table of looks for the seven times of day (plus the lit "evening" of the big courses) and five kinds of weather. `ATMO.params(tod, wx)` blends them into a single set of
   numbers — sun direction / colour / strength, sky and haze colours, ambient light, exposure, fog, how wet the turf is, how hard it rains — that both 3D scenes (the race, in
   gfx.js, and the farm, in farm.js) apply to their own lights and sky. The default (afternoon, clear) reproduces the game's original look exactly, so a Quick Race is unchanged.
   Pure data and maths: loads in the browser (global ATMO) and in Node (tests/phase12-core.js). The time of day and weather come from the stored calendar event, so the race you
   book looks exactly as the forecast said.
   ===================================================================== */
const ATMO = (() => {
  const TODS = ["early_morning", "mid_morning", "midday", "afternoon", "late_afternoon", "golden_hour", "dusk", "evening"];
  const WXS = ["clear", "partly_cloudy", "overcast", "light_rain", "rain"];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const grey = c => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  // el / az: sun elevation and azimuth in degrees; sun: light colour (linear) and strength; zen / mid / hor: the sky dome (linear); hemi: ambient sky / ground colour (sRGB hex) and strength; fill: the cool fill light;
  // expo: renderer exposure; fog: haze colour (linear) and how far you can see (1 = the original); glow: warm band round the sun low on the horizon; lights: the stadium lights are on
  const T = {
    early_morning:  { el: 9,  az: 100, sun: [1.0, 0.70, 0.50], light: [1.0, 0.82, 0.68], sunI: 1.15, zen: [0.075, 0.15, 0.40], mid: [0.30, 0.36, 0.62], hor: [0.92, 0.64, 0.50], hemi: [0xc9d0e8, 0x4e5a45, 0.34], fill: 0.10, expo: 0.84, fog: [0.86, 0.72, 0.64], fogMul: 0.75, glow: 0.6, lights: false },
    mid_morning:    { el: 36, az: 90,  sun: [1.0, 0.90, 0.76], light: [1.0, 0.95, 0.86], sunI: 2.15, zen: [0.10, 0.23, 0.56], mid: [0.29, 0.47, 0.74], hor: [0.70, 0.78, 0.86], hemi: [0xd6e6ff, 0x56703f, 0.32], fill: 0.12, expo: 0.82, fog: [0.70, 0.79, 0.86], fogMul: 1.0, glow: 0.0, lights: false },
    midday:         { el: 78, az: 120, sun: [1.0, 0.96, 0.88], light: [1.0, 0.98, 0.94], sunI: 2.55, zen: [0.09, 0.22, 0.58], mid: [0.27, 0.46, 0.76], hor: [0.66, 0.78, 0.88], hemi: [0xe0eeff, 0x5a7442, 0.34], fill: 0.12, expo: 0.80, fog: [0.68, 0.78, 0.87], fogMul: 1.0, glow: 0.0, lights: false },
    afternoon:      { el: 50, az: 56,  sun: [1.0, 0.86, 0.66], light: [1.0, 0.941, 0.839], sunI: 2.3,  zen: [0.105, 0.245, 0.56], mid: [0.30, 0.48, 0.74], hor: [0.70, 0.78, 0.84], hemi: [0xd9e9ff, 0x56703f, 0.32], fill: 0.12, expo: 0.82, fog: [0.70, 0.78, 0.84], fogMul: 1.0, glow: 0.0, lights: false },
    late_afternoon: { el: 27, az: 245, sun: [1.0, 0.78, 0.52], light: [1.0, 0.87, 0.70], sunI: 2.0,  zen: [0.11, 0.22, 0.52], mid: [0.34, 0.46, 0.70], hor: [0.84, 0.74, 0.66], hemi: [0xe6dcc8, 0x5c6a3e, 0.30], fill: 0.10, expo: 0.83, fog: [0.82, 0.74, 0.66], fogMul: 0.95, glow: 0.25, lights: false },
    golden_hour:    { el: 11, az: 262, sun: [1.0, 0.58, 0.28], light: [1.0, 0.70, 0.42], sunI: 1.55, zen: [0.09, 0.17, 0.44], mid: [0.36, 0.40, 0.62], hor: [1.00, 0.58, 0.30], hemi: [0xf0c9a0, 0x5a5a3a, 0.30], fill: 0.08, expo: 0.88, fog: [0.92, 0.66, 0.42], fogMul: 0.85, glow: 1.0, lights: false },
    dusk:           { el: 2,  az: 276, sun: [1.0, 0.40, 0.22], light: [1.0, 0.56, 0.40], sunI: 0.55, zen: [0.035, 0.06, 0.20], mid: [0.20, 0.17, 0.36], hor: [0.78, 0.36, 0.28], hemi: [0x9aa0c8, 0x4a4f48, 0.42], fill: 0.09, expo: 0.98, fog: [0.52, 0.34, 0.34], fogMul: 0.7, glow: 0.9, lights: true },
    evening:        { el: -7, az: 285, sun: [0.55, 0.62, 1.0], light: [0.62, 0.70, 1.0], sunI: 0.12, zen: [0.012, 0.022, 0.085], mid: [0.045, 0.06, 0.15], hor: [0.20, 0.17, 0.26], hemi: [0x7f8fc8, 0x3a4240, 0.50], fill: 0.08, expo: 0.98, fog: [0.14, 0.14, 0.22], fogMul: 0.6, glow: 0.15, lights: true },
  };
  // cloud: how grey and flat the sky is; sun: the share of direct sun that gets through; fog: visibility; wet: how wet the turf looks; rain: how hard it falls
  const W = {
    clear:         { cloud: 0.0,  sun: 1.0,  fog: 1.0,  wet: 0.0, rain: 0.0 },
    partly_cloudy: { cloud: 0.35, sun: 0.8,  fog: 0.97, wet: 0.0, rain: 0.0 },
    overcast:      { cloud: 0.8,  sun: 0.34, fog: 0.8,  wet: 0.05, rain: 0.0 },
    light_rain:    { cloud: 0.92, sun: 0.2,  fog: 0.62, wet: 0.6, rain: 0.45 },
    rain:          { cloud: 1.0,  sun: 0.1,  fog: 0.42, wet: 1.0, rain: 1.0 },
  };
  const isLit = (venue, tier) => /randwick|flemington/i.test(String(venue || "")) && (tier | 0) >= 3;
  // the blended look for a time of day and weather; unknown inputs fall back to the original afternoon (clear)
  function params(tod, wx) {
    const t = T[tod] || T.afternoon, w = W[wx] || W.clear, c = w.cloud, el = t.el * Math.PI / 180, az = t.az * Math.PI / 180;
    const sunDir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    const sky = {}; for (const k of ["zen", "mid", "hor"]) { const col = t[k], g = grey(col) * (0.88 - 0.22 * c * (k === "zen" ? 1 : 0.5)); sky[k] = mix3(col, [g, g * 1.02, g * 1.06], clamp(c * 0.88, 0, 0.9)).map(v => v * (1 - 0.18 * w.rain)); }
    const fogBase = mix3(t.fog, [grey(t.fog) * 0.92, grey(t.fog) * 0.95, grey(t.fog) * 1.0], clamp(c * 0.8, 0, 0.85));
    const sunI = t.sunI * w.sun;
    return { tod: T[tod] ? tod : "afternoon", wx: W[wx] ? wx : "clear", sunDir, sunColor: t.sun, sunLight: t.light, sunI: Math.max(0, sunI), lightDir: tod === "evening" ? [0.22 / 0.96685, 0.92 / 0.96685, 0.2 / 0.96685] : sunDir, lightI: tod === "evening" ? 1.35 * (1 - 0.5 * c) : Math.max(0, sunI), sky,
      hemiSky: t.hemi[0], hemiGround: t.hemi[1], hemiI: t.hemi[2] + 0.1 * c, fillI: t.fill * (1 - 0.4 * c), expo: t.expo - 0.05 * c * (tod === "evening" || tod === "dusk" ? 0 : 1), fogColor: fogBase.map(v => v * (1 - 0.1 * w.rain)), fogMul: t.fogMul * w.fog,
      glow: t.glow * (1 - c * 0.85), cloud: c, wet: w.wet, rain: w.rain, lights: t.lights, hotSun: sunI > 0.9 && c < 0.55, key: (T[tod] ? tod : "afternoon") + (c >= 0.6 ? "-grey" : c >= 0.2 ? "-part" : "-clear") };
  }
  // the weather on an ordinary day at the farm, seeded by the career and the date so it is the same every time you look: month-weighted, like the race calendar
  const SEASONAL = { 1: [0.50, 0.22, 0.14, 0.09, 0.05], 2: [0.50, 0.22, 0.14, 0.09, 0.05], 3: [0.55, 0.22, 0.12, 0.08, 0.03], 4: [0.55, 0.22, 0.12, 0.08, 0.03], 5: [0.45, 0.22, 0.17, 0.11, 0.05], 6: [0.35, 0.22, 0.22, 0.14, 0.07], 7: [0.35, 0.22, 0.22, 0.14, 0.07], 8: [0.35, 0.22, 0.22, 0.14, 0.07], 9: [0.40, 0.24, 0.20, 0.11, 0.05], 10: [0.45, 0.24, 0.17, 0.10, 0.04], 11: [0.50, 0.23, 0.14, 0.09, 0.04], 12: [0.50, 0.22, 0.14, 0.09, 0.05] };
  const DAYPARTS = ["early_morning", "mid_morning", "midday", "afternoon", "late_afternoon", "golden_hour"], DAYW = [0.12, 0.2, 0.2, 0.2, 0.16, 0.12];
  function pick(r, keys, w) { let s = 0; for (const x of w) s += x; let a = r * s; for (let i = 0; i < keys.length; i++) { a -= w[i]; if (a <= 0) return keys[i]; } return keys[keys.length - 1]; }
  function hash(str) { let x = 2166136261; str = String(str); for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  const frac = h => (h % 100000) / 100000;
  function dayWeather(seed, day, month) { return pick(frac(hash(seed + "/wx/" + day)), WXS, SEASONAL[month] || SEASONAL[1]); }
  function dayPart(seed, day) { return pick(frac(hash(seed + "/tod/" + day)), DAYPARTS, DAYW); }
  // ---- Phase 17: the farm clock's continuous light. The hour (05:30 → 19:00) is blended between the neighbouring day-part looks (same weather); everything numeric is interpolated, colours in RGB.
  // `tod` / `envFrom` name the NEAREST day part (the cached environment map is built from that look: it changes at day-part boundaries only, never per frame).
  const KEYH = [["early_morning", 5.5], ["mid_morning", 8.5], ["midday", 12], ["afternoon", 15], ["late_afternoon", 16.8], ["golden_hour", 18], ["dusk", 19]];
  const lerpV = (a, b, u) => typeof a === "number" ? a + (b - a) * u : Array.isArray(a) ? a.map((v, i) => lerpV(v, b[i], u)) : a && typeof a === "object" ? Object.keys(a).reduce((o, k) => (o[k] = lerpV(a[k], b[k], u), o), {}) : (u < 0.5 ? a : b);
  const hexMix = (a, b, u) => { const c = sh => Math.round((a >> sh & 255) * (1 - u) + (b >> sh & 255) * u); return (c(16) << 16) | (c(8) << 8) | c(0); };
  const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  function blend(hour, wx) {
    const h = clamp(+hour || KEYH[0][1], KEYH[0][1], KEYH[KEYH.length - 1][1]); let i = 0; while (i < KEYH.length - 2 && h >= KEYH[i + 1][1]) i++;
    const [ta, ha] = KEYH[i], [tb, hb] = KEYH[i + 1], u = clamp((h - ha) / (hb - ha), 0, 1), A = params(ta, wx), B = params(tb, wx), o = u >= 1 ? lerpV(B, B, 0) : lerpV(A, B, u);
    o.hemiSky = hexMix(A.hemiSky, B.hemiSky, u); o.hemiGround = hexMix(A.hemiGround, B.hemiGround, u); o.sunDir = norm3(o.sunDir); o.lightDir = norm3(o.lightDir);
    o.tod = u < 0.5 ? ta : tb; o.wx = A.wx; o.key = (u < 0.5 ? A : B).key; o.live = true; o.hour = h; o.envFrom = u < 0.5 ? A : B; return o;
  }
  return { TODS, WXS, T, W, params, blend, KEYH, isLit, dayWeather, dayPart, DAYPARTS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = ATMO;
