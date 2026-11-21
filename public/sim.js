'use strict';
/*@sim-begin*/
/* =====================================================================
   SIMULATION CORE — pure logic, no DOM / Three.js. Runs at a fixed step
   (SIM_DT) so race physics never depend on frame rate. The presentation
   layer talks to a race only through cfg.hooks (msg, toast, gate, …).
   ===================================================================== */

/* ---------- Track geometry ---------- */
const T = { L: 450, R: 120, W: 26 };               // straight length, turn radius (inside rail), track width (m)
T.lap = 2 * T.L + 2 * Math.PI * T.R;               // ≈ 1654 m
const FINISH_D = T.L - 55;                          // finish post position on home straight
const LANE_W = 1.9, LANE0 = 1.7, NLANES = 12;

function trackPoint(d, off, out) {
  d = ((d % T.lap) + T.lap) % T.lap;
  const { L, R } = T; out = out || {};
  let x, z, hx, hz, nx, nz, turn = false;
  if (d < L) { x = -L / 2 + d; z = R; hx = 1; hz = 0; nx = 0; nz = 1; }
  else if (d < L + Math.PI * R) {
    const th = (d - L) / R; turn = true;
    x = L / 2 + R * Math.sin(th); z = R * Math.cos(th);
    hx = Math.cos(th); hz = -Math.sin(th); nx = Math.sin(th); nz = Math.cos(th);
  } else if (d < 2 * L + Math.PI * R) {
    const t = d - L - Math.PI * R; x = L / 2 - t; z = -R; hx = -1; hz = 0; nx = 0; nz = -1;
  } else {
    const th = (d - 2 * L - Math.PI * R) / R; turn = true;
    x = -L / 2 - R * Math.sin(th); z = -R * Math.cos(th);
    hx = -Math.cos(th); hz = Math.sin(th); nx = -Math.sin(th); nz = -Math.cos(th);
  }
  out.x = x + nx * off; out.z = z + nz * off;
  out.hx = hx; out.hz = hz; out.nx = nx; out.nz = nz; out.turn = turn;
  return out;
}
// race phases (by distance remaining): the home turn ends where the straight to the post begins
const HOME_STRAIGHT = FINISH_D, FINAL_BEND = HOME_STRAIGHT + Math.PI * T.R;
function racePhase(progress, remain, dist, trk) {
  const hs = trk ? trk.homeStraight : HOME_STRAIGHT, fb = trk ? trk.finalBend : FINAL_BEND;      // trk: a race route (preferred) or a track
  if (remain <= 0) return "finished";
  if (progress < Math.min(260, dist * 0.22)) return "opening";
  if (remain <= 200) return "final 200";
  if (remain <= hs) return "home straight";
  if (remain <= fb + 40) return "final bend";
  return "middle";
}
// shortest along-track distance between two progress values: a fallen horse blocks its WORLD position, so a runner
// coming round again a lap later (2000 m+ races) meets it at progress difference ≈ one lap
const lapDelta = d => { d = ((d % T.lap) + T.lap) % T.lap; return d >= T.lap / 2 ? d - T.lap : d; };
const isTurn = d => { d = ((d % T.lap) + T.lap) % T.lap; return (d >= T.L && d < T.L + Math.PI * T.R) || d >= 2 * T.L + Math.PI * T.R; };
const laneOff = lane => LANE0 + lane * LANE_W;

/* =====================================================================
   TRACK ENGINE — every course is a closed inside-rail reference line, parametrised by true arc length.
   A race runs on a ROUTE: progress 0 at the start, `dist` at the winning post. The route maps progress to a world
   position + heading + outward normal (lane offsets are measured outward from the inside rail), the inward curvature
   (used for the bend's centripetal load, horse balance and the extra ground covered by running wide), and the loop
   coordinate (for lap-later contacts with fallen horses). A route may begin in a CHUTE: a separate straight that joins
   the course proper tangentially.
     • generic — the original oval, kept on its exact analytic formulas (multiplayer and all balance tests unchanged)
     • randwick — Royal Randwick course proper, built from straights, arcs and clothoid easements (see TRACK_DEFS)
   ===================================================================== */
const lapDeltaL = (d, lap) => { d = ((d % lap) + lap) % lap; return d >= lap / 2 ? d - lap : d; };
const TRACKS = {};
TRACKS.generic = {
  id: "generic", name: "Furlong Park", lap: T.lap, W: T.W, finishD: FINISH_D, homeStraight: HOME_STRAIGHT, finalBend: FINAL_BEND, cw: false, analytic: true,
  point: trackPoint, isTurn, kIn: d => isTurn(d) ? 1 / T.R : 0, isHome: d => (((d % T.lap) + T.lap) % T.lap) < T.L,
  route(dist) {
    const startD = ((FINISH_D - dist) % T.lap + T.lap) % T.lap;
    return { trk: this, dist, startD, chuteLen: 0, homeStraight: HOME_STRAIGHT, finalBend: FINAL_BEND, straightRace: false,
      point: (p, off, out) => { out = trackPoint(startD + p, off, out); out.k = isTurn(startD + p) ? 1 / T.R : 0; return out; },
      isTurn: p => isTurn(startD + p),
      kIn: p => isTurn(startD + p) ? 1 / T.R : 0,
      scale: (p, off) => { const d = ((startD + p) % T.lap + T.lap) % T.lap; return isTurn(d) ? T.R / (T.R + off) : 1; },
      bendAcc: (p, off, v) => isTurn(startD + p) ? v * v / (T.R + off) : 0,
      railScale: p => isTurn(((startD + p) % T.lap + T.lap) % T.lap) ? T.R / (T.R + LANE0) : 1,
      inFinalBend: p => { const d = ((startD + p) % T.lap + T.lap) % T.lap; return d >= 2 * T.L + Math.PI * T.R; },
      loopD: p => ((startD + p) % T.lap + T.lap) % T.lap,
      inChute: () => false };
  },
};
// ---- table-based tracks: curvature segments → arc-length samples ----
const TRK_DS = 0.5;
function integrateTrack(segs, cw) {
  // curvature (1/m, positive towards the inside) varies linearly within each segment; heading φ integrates it
  const sg = cw ? 1 : -1, sub = 4, h = TRK_DS / sub;
  let len = 0; for (const s of segs) len += s.len;
  const n = Math.ceil(len / TRK_DS) + 2, X = new Float64Array(n), Z = new Float64Array(n), P = new Float64Array(n), K = new Float64Array(n);
  let x = 0, z = 0, ph = 0, si = 0, s0 = 0, i = 0;
  const kAt = s => { while (si < segs.length - 1 && s > s0 + segs[si].len) { s0 += segs[si].len; si++; } const g = segs[si], u = Math.min(1, Math.max(0, (s - s0) / g.len)); return g.k0 + (g.k1 - g.k0) * u; };
  for (i = 0; i < n; i++) {
    const s = i * TRK_DS; X[i] = x; Z[i] = z; P[i] = ph; K[i] = kAt(Math.min(len, s));
    for (let j = 0; j < sub; j++) { const sm = s + (j + 0.5) * h, k = kAt(Math.min(len, sm)), pm = ph + sg * k * h * 0.5; x += Math.cos(pm) * h; z += Math.sin(pm) * h; ph += sg * k * h; }
  }
  return { X, Z, P, K, len, n };
}
function tableSampler(tb, cw, closed) {
  const lap = tb.len;
  return function (d, off, out) {
    out = out || {};
    if (closed) d = ((d % lap) + lap) % lap; else d = Math.max(0, Math.min(lap, d));
    const f = d / TRK_DS, i = Math.min(tb.n - 2, Math.floor(f)), u = f - i;
    const x = tb.X[i] + (tb.X[i + 1] - tb.X[i]) * u, z = tb.Z[i] + (tb.Z[i + 1] - tb.Z[i]) * u, ph = tb.P[i] + (tb.P[i + 1] - tb.P[i]) * u;
    const hx = Math.cos(ph), hz = Math.sin(ph), nx = cw ? hz : -hz, nz = cw ? -hx : hx;      // outward normal: away from the infield
    out.x = x + nx * off; out.z = z + nz * off; out.hx = hx; out.hz = hz; out.nx = nx; out.nz = nz;
    out.k = tb.K[i] + (tb.K[i + 1] - tb.K[i]) * u; out.turn = out.k > 1 / 900;
    return out;
  };
}
// expand a compact course description into curvature segments
function courseSegments(spec) {
  const segs = [];
  for (const s of spec) {
    if (s.straight) segs.push({ len: s.straight, k0: 0, k1: 0, tag: s.tag });
    else if (s.bend) { const k = 1 / s.r, e = s.ease || 0, arc = s.r * s.ang - e; // clothoid in, arc, clothoid out: total turn = ang
      if (e) segs.push({ len: e, k0: 0, k1: k, tag: s.tag }); segs.push({ len: Math.max(1, arc), k0: k, k1: k, tag: s.tag }); if (e) segs.push({ len: e, k0: k, k1: 0, tag: s.tag }); }
  }
  return segs;
}
// solve a course's free parameters so the loop closes exactly with the published circumference
function solveCourse(def) {
  const v = def.free.map(f => f.init);
  const build = vv => { const spec = def.spec(vv); return integrateTrack(courseSegments(spec), def.cw); };
  const resid = vv => { const tb = build(vv), e = tb.n - 1; const L = tb.len; const fx = tb.X[0] + 0, fz = tb.Z[0];
    // position after exactly one lap (interpolated) must return to the start; length must equal the circumference
    const f = L / TRK_DS, i = Math.floor(f), u = f - i, xe = tb.X[i] + (tb.X[Math.min(e, i + 1)] - tb.X[i]) * u, ze = tb.Z[i] + (tb.Z[Math.min(e, i + 1)] - tb.Z[i]) * u;
    return [xe - fx, ze - fz, L - def.lap]; };
  for (let it = 0; it < 30; it++) {
    const r0 = resid(v); if (Math.hypot(...r0) < 1e-4) break;
    const J = def.free.map((f, j) => { const vv = v.slice(); vv[j] += f.step; const r1 = resid(vv); return r1.map((x, k) => (x - r0[k]) / f.step); });   // J[j][k] = d r_k / d v_j
    // solve J^T dv = -r (3x3)
    const A = [0, 1, 2].map(k => [J[0][k], J[1][k], J[2][k]]), b = r0.map(x => -x);
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(A); if (!D) break;
    for (let j = 0; j < 3; j++) { const Aj = A.map((row, k) => row.map((x, c) => c === j ? b[k] : x)); v[j] += det(Aj) / D * 0.9; }
  }
  return v;
}
function buildTableTrack(def) {
  const v = solveCourse(def), spec = def.spec(v), segs = courseSegments(spec), tb = integrateTrack(segs, def.cw);
  const lap = tb.len, point = tableSampler(tb, def.cw, true);
  // named positions along the loop (s from the winning post, which is s = 0)
  const marks = {}; { let s = 0; for (const p of spec) { const L = p.straight || (p.r * p.ang + (p.ease || 0)); if (p.tag && marks[p.tag] == null) marks[p.tag] = s; if (p.tag) marks[p.tag + "_end"] = s + L; s += L; } }
  const K = d => { d = ((d % lap) + lap) % lap; const f = d / TRK_DS, i = Math.min(tb.n - 2, Math.floor(f)), u = f - i; return tb.K[i] + (tb.K[i + 1] - tb.K[i]) * u; };
  const finishD = 0, homeStraight = def.homeStraight, finalBend = homeStraight + (marks.homeTurn_end - marks.homeTurn);
  const trk = { id: def.id, name: def.name, lap, W: def.W, finishD, homeStraight, finalBend, cw: def.cw, analytic: false, def, solved: v, spec, marks, tb,
    point, kIn: K, isTurn: d => K(d) > 1 / 900, isHome: d => { d = ((d % lap) + lap) % lap; return d > lap - homeStraight - 30 || d < (marks.runout_end || 0); },
    chutes: {}, starts: def.starts };
  // chutes: straight extensions behind a point of the loop, joining it tangentially
  for (const c of def.chutes || []) {
    const js = marks[c.joinAt] != null ? marks[c.joinAt] : c.joinS, jp = point(js, 0, {});
    trk.chutes[c.id] = { id: c.id, joinS: js, x: jp.x, z: jp.z, hx: jp.hx, hz: jp.hz, nx: jp.nx, nz: jp.nz, straightCourse: !!c.straightCourse, len: c.len || 0 };
  }
  trk.route = function (dist) {
    const st = def.starts[dist], sLoop = ((finishD - dist) % lap + lap) % lap;
    const ch = st && st.chute ? trk.chutes[st.chute] : null;
    const toPost = ch ? ((finishD - ch.joinS) % lap + lap) % lap || lap : 0;      // loop distance from the join to the post
    const chuteLen = ch ? dist - toPost - (dist > lap ? lap * Math.floor((dist - toPost) / lap) : 0) : 0;
    const useChute = ch && chuteLen > 0;
    const startD = useChute ? ch.joinS - chuteLen : sLoop;                         // unwrapped: loop coordinate of progress 0
    // a race run wholly on a straight course (Flemington's Straight Six) has no final bend at all
    const straightRace = !!(useChute && ch.straightCourse && dist <= chuteLen + toPost + 1e-6 && toPost <= homeStraight + 1e-6);
    const R = { trk, dist, startD, chuteLen: useChute ? chuteLen : 0, chute: useChute ? ch : null, straightRace,
      homeStraight, finalBend: straightRace ? homeStraight : finalBend,
      inChute: p => useChute && p < chuteLen,
      point(p, off, out) {
        if (useChute && p < chuteLen) {                                           // in the chute: a straight line ending at the join
          const back = chuteLen - p; out = out || {};
          out.x = ch.x - ch.hx * back + ch.nx * off; out.z = ch.z - ch.hz * back + ch.nz * off; out.hx = ch.hx; out.hz = ch.hz; out.nx = ch.nx; out.nz = ch.nz; out.k = 0; out.turn = false; return out;
        }
        return point(startD + p, off, out);
      },
      kIn: p => useChute && p < chuteLen ? 0 : K(startD + p),
      isTurn: p => (useChute && p < chuteLen ? 0 : K(startD + p)) > 1 / 900,
      scale: (p, off) => { const k = useChute && p < chuteLen ? 0 : K(startD + p); return k > 1e-6 ? 1 / (1 + k * off) : 1; },
      bendAcc: (p, off, v) => { const k = useChute && p < chuteLen ? 0 : K(startD + p); return k > 1e-6 ? v * v * k / (1 + k * off) : 0; },
      railScale: p => { const k = useChute && p < chuteLen ? 0 : K(startD + p); return k > 1e-6 ? 1 / (1 + k * LANE0) : 1; },
      inFinalBend: p => { if (straightRace || (useChute && p < chuteLen)) return false; const rem = dist - p; return rem <= finalBend && rem > homeStraight; },
      loopD: p => (((startD + p) % lap) + lap) % lap };
    return R;
  };
  return trk;
}
/* Royal Randwick (course proper), right-handed. Published figures: circumference 2224 m, home straight 410 m, 28 m wide
   at the winning post; chute starts for the shorter sprints (the 1200 m chute leads into the long home turn); the 2000 m
   start is just past the post with a short run to the first turn; the rise ~400 m from home. Exact bend radii, the
   back-straight dogleg and chute angles are not published in a form available here, so they are estimated to match the
   overall shape of the course diagram and solved so the loop closes at exactly 2224 m. Coordinates: s = 0 at the post. */
const TRACK_DEFS = {
  randwick: {
    id: "randwick", name: "Royal Randwick", cw: true, lap: 2224, W: 28, homeStraight: 410,
    free: [{ init: 350, step: 0.5 }, { init: 172, step: 0.2 }, { init: 178, step: 0.2 }],      // back-straight length, top-turn radius, home-turn radius
    spec: v => [
      { straight: 110, tag: "runout" },                                          // winning post → the first (Kensington-end) turn
      { bend: true, r: v[1], ang: 174 * Math.PI / 180, ease: 45, tag: "topTurn" },
      { straight: v[0], tag: "back" },                                           // the back straight
      { bend: true, r: 420, ang: 12 * Math.PI / 180, ease: 30, tag: "dogleg" },  // the gentle kink where the sprint chutes join
      { straight: 64, tag: "chuteJoin" },
      { bend: true, r: v[2], ang: 174 * Math.PI / 180, ease: 70, tag: "homeTurn" }, // the long sweeping home turn
      { straight: 410, tag: "home" },                                            // the 410 m straight to the post
    ],
    chutes: [{ id: "sprint", joinAt: "chuteJoin" }],
    starts: { 1000: {}, 1100: {}, 1200: { chute: "sprint" }, 1400: { chute: "sprint" }, 1600: {}, 2000: {}, 2400: {}, 3200: {} },
    rise: 400,
  },
  /* Flemington (course proper + the straight course), left-handed. Published figures: circumference 2312 m, home straight
     450 m, a pear shape whose long sweeping home turn runs from the 1200 m to the 450 m mark, and the 1200 m "Straight
     Six": a dead-straight course that continues the line of the home straight back past the junction with the home turn.
     Straight races (1000–1200 m) are run entirely on it; the Melbourne Cup (3200 m) starts on it 888 m from the post, runs
     past the post once and then completes a full lap. ESTIMATES: the first-turn radius (125 m), the 2000 m chute, and the
     run-out/back-straight lengths and first-turn angle (solved so the loop closes at exactly 2312 m). */
  flemington: {
    id: "flemington", name: "Flemington", cw: false, lap: 2312, W: 30, homeStraight: 450,
    free: [{ init: 250, step: 0.5 }, { init: 165, step: 0.05 }, { init: 350, step: 0.5 }],    // run-out, first-turn angle (°), back straight
    spec: v => { const a1 = v[1] * Math.PI / 180, a3 = (360 - v[1]) * Math.PI / 180; return [
      { straight: v[0], tag: "runout" },                                          // past the post towards the first turn
      { bend: true, r: 125, ang: a1, ease: 40, tag: "topTurn" },                  // the narrow end of the pear
      { straight: v[2], tag: "back" },                                           // the back of the course (river side), converging
      { bend: true, r: (750 - 90) / a3, ang: a3, ease: 90, tag: "homeTurn" },     // the broad sweeping home turn: 1200 m → 450 m
      { straight: 450, tag: "home" },                                            // the 450 m straight to the post
    ]; },
    chutes: [{ id: "straight", joinAt: "home", straightCourse: true, len: 1200 - 450 + 20 },   // the Straight Six
             { id: "c2000", joinAt: "back", len: 300 }],                                         // a short chute so the 2000 m start is not on a bend
    starts: { 1000: { chute: "straight" }, 1100: { chute: "straight" }, 1200: { chute: "straight" }, 1400: {}, 1600: {}, 2000: { chute: "c2000" }, 2400: {}, 2500: {}, 3200: { chute: "straight" } },
  },
};
function getTrack(id) {
  if (!id || id === "generic") return TRACKS.generic;
  if (!TRACKS[id] && TRACK_DEFS[id]) TRACKS[id] = buildTableTrack(TRACK_DEFS[id]);
  return TRACKS[id] || TRACKS.generic;
}

/* ---------- Roster ---------- */
// attrs 0–100: top (top speed), acc, end (endurance), spr (sprint power), rec (recovery),
// tem (temperament), agi (agility), sta (starting ability)
// Each horse's knack: the race phases where it is at its best, and the way it must be ridden to show it.
// Up to ~3.5% extra speed (and a little less stamina burnt) while both line up — learn the horse and it runs to its best.
const PHASE_KEYS = ["opening", "middle", "final bend", "home straight", "final 200"];
const KNACK = {
  "Ka Ying Rising":      { ph: [1, 0.2, 0.3, 0.6, 1],   cond: "cover",   tip: "Jump well, tuck in behind a horse, then pounce late" },
  "Willow's Pride":      { ph: [0.2, 1, 0.8, 0.4, 0.2], cond: "even",    tip: "Ride an even, unbroken rhythm — no sudden surges" },
  "Quiet Thunder":       { ph: [0, 0.2, 0.4, 1, 0.8],   cond: "settled", tip: "Settle him (E) early and save the run for the straight" },
  "Tempted":             { ph: [1, 0.6, 0.35, 0.25, 0.15],   cond: "lead",    tip: "Let her bowl along in front — she hates being held up" },
  "Bay Majesty":         { ph: [0.5, 0.6, 0.6, 0.6, 0.5], cond: "any",   tip: "Forgiving all-rounder — fine ridden any way" },
  "Half Yours":          { ph: [0, 0.3, 0.8, 1, 0.6],   cond: "back",    tip: "Ride him cold in the back half, then wind him up from the bend" },
  "Point Of Law":        { ph: [0.3, 1, 1, 0.5, 0.2],   cond: "even",    tip: "Set a steady effort and leave it — he's a metronome" },
  "Trust Your Instinct": { ph: [0.3, 0.4, 1, 0.8, 0.4], cond: "rail",    tip: "Stay on the rail and slip through the gaps round the bend" },
  "Yes Yes Yes":         { ph: [0, 0.1, 0.3, 0.8, 1],   cond: "back",    tip: "Drop him out in the back half and wait — one explosive late burst" },
  "Hopewell Rock":       { ph: [0.4, 0.8, 0.7, 0.5, 0.3], cond: "lead",    tip: "Go to the front and make it a test from halfway" },
  "Goodie Two Shoes":    { ph: [0.6, 0.6, 0.6, 0.6, 0.6], cond: "any",   tip: "Honest and easy — runs her race however you ride" },
  "Soul Of Spain":       { ph: [0.2, 0.4, 1, 0.8, 0.6], cond: "settled", tip: "Settle her (E) early so the fire is there for the bend" },
};
const ROSTER = [
  { name: "Ka Ying Rising",      role: "Champion sprinter", style: "stalk",  coat: 0x7a4a28, silk: "#e86a17", bio: "A brilliant, cool-headed speedster. Jumps cleanly, travels sweetly just off the pace and has a devastating turn of foot. Unbeatable over a sprint, found out over a long trip.",
    attrs: { top: 92, acc: 95, end: 69, spr: 92, rec: 67, tem: 86, agi: 82, sta: 92 } },
  { name: "Willow's Pride", role: "Stayer",       style: "steady", coat: 0x6b4226, silk: "#2e8b57", attrs: { top: 82, acc: 60, end: 85, spr: 55, rec: 77, tem: 82, agi: 64, sta: 55 } },
  { name: "Quiet Thunder",  role: "Finisher",     style: "closer", coat: 0x3c2a1a, silk: "#7a4fd1", attrs: { top: 88, acc: 72, end: 79, spr: 96, rec: 72, tem: 76, agi: 72, sta: 50 } },
  { name: "Tempted",             role: "Free-going leader", style: "aggro", coat: 0x96522c, silk: "#d62828", bio: "Can't help herself. Pings the gates and wants to lead at a fierce clip; hot and keen if she's restrained. Gets brave when left alone in front, but a long trip finds her out.",
    attrs: { top: 88, acc: 88, end: 75, spr: 66, rec: 66, tem: 54, agi: 70, sta: 94 } },
  { name: "Bay Majesty",    role: "All-rounder",  style: "mid",    coat: 0x7a4a28, silk: "#2457c5", attrs: { top: 84, acc: 76, end: 79, spr: 74, rec: 72, tem: 78, agi: 75, sta: 70 } },
  { name: "Half Yours",          role: "Grinding stayer", style: "closer", coat: 0x5d3a22, silk: "#e63946", bio: "Slow to warm up, sits towards the back and grinds. Never stops once he gets going; the further the race, the better he gets. Needs a strong pace up front.",
    attrs: { top: 87, acc: 68, end: 84, spr: 88, rec: 76, tem: 80, agi: 64, sta: 52 } },
  { name: "Point Of Law",        role: "Metronome",    style: "steady", coat: 0x26201b, silk: "#6e7f8d", bio: "Precise and unflappable. Gallops at the same relentless rhythm every time, never pulls, never panics in traffic. Rarely brilliant, rarely beaten far.",
    attrs: { top: 82, acc: 66, end: 83, spr: 62, rec: 76, tem: 96, agi: 62, sta: 64 } },
  { name: "Trust Your Instinct", role: "Tactician",    style: "stalk",  coat: 0xc89a5b, silk: "#d9a521", bio: "Clever and nimble. Finds the gaps others can't, sits handy behind the leaders and pounces at the right moment. Adapts to any race shape.",
    attrs: { top: 86, acc: 82, end: 77, spr: 78, rec: 70, tem: 78, agi: 96, sta: 76 } },
  { name: "Yes Yes Yes",         role: "Explosive closer", style: "closer", coat: 0x221a16, silk: "#f26419", bio: "All about the finish. Settles last, switches off, then explodes with the fastest closing sprint in the field. Can leave it too late if the leaders get away.",
    attrs: { top: 90, acc: 74, end: 79, spr: 99, rec: 72, tem: 74, agi: 70, sta: 54 } },
  { name: "Hopewell Rock",       role: "Iron front-runner", style: "front", coat: 0xb9b3aa, silk: "#1d3557", bio: "A big, powerful grey built like the cliffs he's named after. Goes straight to the front and makes it a stamina test; tough as teak, hard to pass, but no quick change of gear.",
    attrs: { top: 84, acc: 78, end: 80, spr: 56, rec: 70, tem: 84, agi: 58, sta: 86 } },
  { name: "Goodie Two Shoes",    role: "Honest trier", style: "mid",    coat: 0x8c4f2a, silk: "#e75480", bio: "Kind, willing and perfectly behaved. Always jumps on terms, settles anywhere and runs straight and true. Gives everything she has every single time.",
    attrs: { top: 83, acc: 76, end: 79, spr: 74, rec: 74, tem: 98, agi: 76, sta: 90 } },
  { name: "Soul Of Spain",       role: "Fiery stayer", style: "stalk",  coat: 0x4a2a18, silk: "#c8102e", bio: "Proud, passionate and full of heart. Races with real fire, travels strongly on the shoulder of the leaders and fights all the way to the line. Hot-blooded, so settle her early.",
    attrs: { top: 84, acc: 72, end: 80, spr: 78, rec: 72, tem: 62, agi: 74, sta: 70 } },
];
const DISTANCES = [1000, 1200, 1400, 1600, 2000, 2400, 3200];
const DIST_LABEL = { 1000: "Short Sprint", 1200: "Sprint", 1400: "Ext. Sprint", 1600: "Mile", 2000: "Middle", 2400: "Classic", 3200: "Stayers" };

/* Ground conditions: the same physics for everyone, slower and more draining when soft */
const GOING = {
  firm:  { label: "Firm",  v: 1.000, drain: 0.96, slip: 0.95 },
  good:  { label: "Good",  v: 0.990, drain: 1.00, slip: 1.0 },
  soft:  { label: "Soft",  v: 0.972, drain: 1.08, slip: 1.15 },
  heavy: { label: "Heavy", v: 0.950, drain: 1.17, slip: 1.32 },
};

const SIM_DT = 1 / 120;
const RHYTHM_AT = 450;    // metres from home: the final-drive rhythm mechanic arms here
const BREAK_WINDOW = 3.2; // (legacy) — the start is now track-the-sweet-spot + reaction, see Race.trackStart / Race.launch
// start outcomes: extra reaction delay, break power (launch strength 0..1), stumble seconds
const START_CATS = { PERFECT: { label: "PERFECT BREAK", delay: 0.0, bp: 1.0, stumble: 0 }, GOOD: { label: "GOOD BREAK", delay: 0.07, bp: 0.6, stumble: 0 },
  SLOW: { label: "SLOW AWAY", delay: 0.3, bp: 0.25, stumble: 0 }, MISSED: { label: "MISSED THE START", delay: 0.32, bp: 0.0, stumble: 0.5 } };
function startCategory(q) { return q >= 0.78 ? "PERFECT" : q >= 0.55 ? "GOOD" : q >= 0.32 ? "SLOW" : "MISSED"; }
const HORSE_LEN = 2.5;    // nose-to-tail body length (m)
const LEN_M = 2.4;        // one racing "length" for margins (m)
const LAT_SEP = 0.92;     // minimum side-by-side spacing, in lanes (≈1.75 m centre to centre)
const BEAT_PHASE = 0.5;   // kept for stats
const RHYTHM_PERIOD = 1.6; // seconds for one full left→right→left sweep of the sprint meter
const BEAT = RHYTHM_PERIOD / 2; // one tap window per pass through the green
const NOSE_OFF = 1.90;     // the sim position is the horse's nose; the mesh origin sits this far behind it
// final-drive momentum: consecutive good taps → sprint state
const MOM_LEVELS = [0, 0.3, 0.3, 0.55, 0.55, 0.8, 0.8, 1.0];
const MOM_NAMES = ["", "FINDING RHYTHM", "FINDING RHYTHM", "STRONG DRIVE", "STRONG DRIVE", "POWERFUL FINISH", "POWERFUL FINISH", "PERFECT RHYTHM"];
function momLevel(streak) { return streak <= 0 ? 0 : streak <= 2 ? 1 : streak <= 4 ? 2 : streak <= 6 ? 3 : 4; }
// footfall phase per leg for the rotary gallop: trailing hind, leading hind, trailing fore, leading fore
const FOOT = { hindTrail: 0.08, hindLead: 0.18, foreTrail: 0.40, foreLead: 0.50 };

const ZONES = [[0.40, "Holding back"], [0.60, "Relaxed"], [0.75, "Cruising"], [0.85, "Pushing"], [0.95, "Driving"], [1.01, "MAX EFFORT"]];
function zoneName(e) { for (const z of ZONES) if (e < z[0]) return z[1]; return "MAX EFFORT"; }
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function nameSeed(s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; }
function shuffle(a, rng) { rng = rng || Math.random; a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); }
// effort → fraction of available top speed. Deliberately concave: the last 20% of effort buys
// only a few % of speed but (see drainRate) costs a great deal of energy.
function speedCurve(e) { return 0.42 + 0.58 * Math.pow(Math.max(0, e), 0.55); }

/* =====================================================================
   HORSE — physical model
   effort      : what the rider is asking for (W/S, 0..1)
   eAct        : what the horse is actually delivering (lags, capped by condition)
   S stamina   : recoverable aerobic energy
   F fatigue   : accumulated, never recovers in-race; erodes speed, accel & response
   SR reserve  : anaerobic finishing burst, unlocked by high effort / urging / driving
   ===================================================================== */
class Horse {
  constructor(def, lane, isPlayer, raceDist, diffKey, going, rng, assistOn) {
    this.def = def; this.lane = lane; this.isPlayer = isPlayer; this.raceDist = raceDist;
    this.going = going || GOING.good; this.rng = rng || Math.random;
    const a = def.attrs;
    this.vmax = 15.8 + a.top / 100 * 3.8;            // 56.9–70.6 km/h
    this.knack = KNACK[def.name] || null; this.kB = 0; this.kC = 0; this.kn = { relaxT: 0, effA: 0.6, effV: 0, back600: null };
    this.A = 2.0 + a.acc / 100 * 2.0;                // base accel m/s²
    this.accN = a.acc / 100; this.endN = a.end / 100; this.sprintPow = a.spr / 100;
    this.recov = a.rec / 100; this.temper = a.tem / 100; this.agil = a.agi / 100; this.startAb = a.sta / 100;
    // individual gait character (deterministic per horse)
    const r0 = mulberry32(nameSeed(def.name));
    this.strideK = 0.96 + r0() * 0.08;
    this.lead = r0() < 0.5 ? 1 : -1;
    this.gaitVar = r0();
    // hidden efficiency zone: endurance and temperament let a horse travel harder within itself
    this.comfort0 = 0.515 + 0.18 * this.endN + 0.05 * this.temper + 0.03 * this.recov;
    // optional, explicit accessibility setting (off by default): never applied silently by difficulty
    const assist = isPlayer && assistOn ? 0.85 : 1;
    this.assist = assist;
    this.drainScale = (1.30 - 0.60 * this.endN) * this.going.drain * assist;
    // state
    this.progress = 0; this.distRun = 0; this.v = 0;
    this.effort = isPlayer ? 0.55 : 0.6; this.eAct = 0.5;
    this.S = 100; this.F = 0; this.SR = 100;
    this.laneF = lane; this.targetLane = lane; this.latV = 0; this.latMin = 0; this.latMax = NLANES - 1;
    this.phase = this.rng();
    this.finished = false; this.finishTime = 0;
    this.started = false; this.reactDelay = 0; this.botBreakQ = 0.4;
    this.urgeT = 0; this.urgeHeat = 0; this.drive = false;
    this.mom = 0; this.streak = 0; this.missRun = 0; this.tapQ = 0.5; this.lastBeatT = -9;
    this.rhythmT = 0; this.lastTapT = -9; this.penT = 0; this.combo = 0;
    this.breakT = 0; this.breakPow = 0.5; this.stumbleT = 0; this.startCat = null;
    // riding: settle (E) relaxes the horse, restrain (Q) checks it; keenness is a horse pulling against the rider
    this.settle = false; this.restrain = false; this.relax = 0; this.keen = 0; this.restrainHeat = 0; this.postCheckT = 0; this.restrainLvl = 0;
    this.steerIn = null; this.steerAssist = true; this.sideBlocked = 0;
    // balance & incidents (see Horse.balance): 1 = perfectly balanced
    this.stab = 1; this.stress = 0; this.aDem = 0; this.latMsPrev = 0; this.ctrlT = 0; this.incCool = 0; this.stumV = 0; this.contactCool = 0; this.lean = 0;
    this.fallen = false; this.dnf = false; this.fallT = 0; this.fallDir = 1; this.incidents = []; this.lowStab = 1;
    this.blocked = false; this.blockedTime = 0; this.blockCap = null; this.front = null; this.frontGap = 99; this.draft = false;
    this.groundLost = 0; this.accel = 0; this.vTfree = 0; this.access = 0; this.boost = 0; this.vPrev = 0; this.rank = 1;
    this.pos = { x: 0, z: 0, hx: 1, hz: 0, nx: 0, nz: 1 };
    this.bot = isPlayer ? null : new Bot(this, diffKey, this.rng);
    this.stat = { maxV: 0, sumV: 0, n: 0, maxEffT: 0, hiEffT: 0, finishV: 0, goodTaps: 0, badTaps: 0, extraTaps: 0,
      startQ: "", breakSum: 0, breakN: 0, urges: 0, t800: null, t400: null, t200: null, overtakes: 0, lost: 0, blockedT: 0, syncSum: 0, syncN: 0,
      maxStreak: 0, okTaps: 0, r400: null, r100: null, leadAt100: false, peakMom: 0, settledT: 0, keenT: 0, checks: 0, reactT: null };
  }
  rhythmPin() { const u = (this.rhythmT / (RHYTHM_PERIOD / 2)) % 2; return u < 1 ? u : 2 - u; }
  // accuracy of a tap right now: 1 = pin dead centre, 0 = outside the green
  tapAccuracy() { return Math.max(0, 1 - Math.abs(this.rhythmPin() - 0.5) / 0.3); }
  // one final-drive tap of quality a (0..1). Momentum builds over consecutive good taps; it is never instant.
  tap(a, clock) {
    if (clock - this.lastTapT < 0.35) { this.stat.extraTaps++; return "extra"; }   // mashing does nothing
    this.lastTapT = clock; this.lastBeatT = clock;
    this.tapQ = this.tapQ * 0.6 + a * 0.4;
    if (a >= 0.5) {                       // good: extends the streak
      this.streak++; this.missRun = 0; this.combo = this.streak; this.stat.goodTaps++;
      this.stat.maxStreak = Math.max(this.stat.maxStreak, this.streak);
      if (this.momFuel() > 0.3) this.urgeT = Math.max(this.urgeT, 0.3);   // a spent horse is not pushed harder by it
      return a > 0.85 ? "perfect" : "good";
    }
    if (a > 0.12) {                       // slightly early/late: keeps the streak, dents momentum a little
      this.mom = Math.max(0, this.mom - 0.05); this.missRun = 0; this.stat.okTaps++;
      return "ok";
    }
    this.missRun++; this.stat.badTaps++;  // in the grey: breaks the streak; repeated misses unbalance the horse
    this.streak = Math.floor(this.streak / 2); this.combo = this.streak;
    this.mom = Math.max(0, this.mom - 0.18);
    if (this.missRun >= 2) this.penT = 0.6;
    return "miss";
  }
  // how much finishing power the horse can still convert from momentum (fresh & strong ≈ 1, spent ≈ 0.1–0.3)
  momFuel() {
    return Math.max(0.12, Math.sqrt(clamp(this.SR / 30, 0, 1)) * (1 - 0.75 * Math.pow(this.F / 100, 1.2)) * (this.S > 5 ? 1 : 0.35 + 0.13 * this.S));
  }
  comfort() { return this.comfort0 - 0.10 * (this.F / 100) - (this.S < 30 ? (30 - this.S) / 30 * 0.06 : 0); }
  // highest effort the horse can physically deliver right now
  capacity() {
    let c = 1 - 0.40 * Math.pow(this.F / 100, 1.3);
    if (this.S < 20) c -= (20 - this.S) / 20 * 0.33;
    return clamp(c, 0.35, 1);
  }
  // stamina units per second at effort e (before urging/drafting/steering modifiers)
  drainRate(e, cf) {
    if (cf == null) cf = this.comfort();
    const over = Math.max(0, e - cf) / (1 - cf);
    return this.drainScale * (0.08 + 0.52 * e * e + 2.0 * over * over);
  }
  vmaxEff() {
    let f = 1 - 0.20 * Math.pow(this.F / 100, 1.4);
    if (this.S < 10) f *= 0.93 + 0.007 * this.S;
    return this.vmax * f * this.going.v * (1 + this.kB);
  }
  // how well the horse is being ridden to its knack right now (0..1), and the resulting bonus
  updateKnack(dt, race) {
    const K = this.knack, kn = this.kn; if (!K || !this.started || this.finished) { this.kB = 0; return; }
    const remain = this.raceDist - this.progress, field = race.horses.length;
    kn.effA += (this.effort - kn.effA) * Math.min(1, dt * 0.5); kn.effV += (Math.abs(this.effort - kn.effA) - kn.effV) * Math.min(1, dt * 0.4);
    if (this.relax > 0.5 && remain > 500) kn.relaxT += dt;
    if (kn.back600 == null && remain < 650) kn.back600 = this.rank > field / 2;
    let c;
    switch (K.cond) {
      case "lead": c = race.leaderProgress - this.progress < 1.6 ? 1 : 0; break;
      case "cover": c = this.draft || (this.frontGap < 6 && this.rank > 1) ? 1 : (remain < 300 ? 0.7 : 0); break;
      case "settled": c = clamp(kn.relaxT / 7, 0, 1); break;
      case "even": c = clamp(1 - (kn.effV - 0.015) / 0.06, 0, 1) * (this.restrain || this.drive && remain > 400 ? 0 : 1); break;
      case "back": c = kn.back600 != null ? (kn.back600 ? 1 : 0.2) : (this.rank > field / 2 ? 1 : 0); break;
      case "rail": c = clamp(1 - (this.laneF - 0.8) / 2, 0, 1); break;
      default: c = 0.75;
    }
    this.kC += (c - this.kC) * Math.min(1, dt * 1.2);
    const ph = K.ph[PHASE_KEYS.indexOf(racePhase(this.progress, remain, this.raceDist, race.route || race.trk))] || 0;
    this.kB = (K.cond === "settled" || K.cond === "back" ? 0.06 : 0.04) * ph * this.kC;   // patient rides earn a bigger late reward
  }
  // how much of the finishing burst the horse can still produce (0..1)
  sprintAvail() { return Math.min(1, this.SR / 25) * (1 - 0.7 * Math.pow(this.F / 100, 1.2)) * (this.S > 2 ? 1 : 0.35); }
  strideLen() { return (4.4 + 0.2 * this.v) * this.strideK * (1 - 0.10 * Math.pow(this.F / 100, 1.2)); }

  step(dt, race) {
    if (this.fallen) {                                          // down: slides to a halt and is carried clear of the racing lanes
      this.fallT += dt; this.v *= Math.exp(-dt / 0.85); if (this.v < 0.15) this.v = 0; this.eAct = 0; this.drive = false; this.urgeT = 0; this.mom = 0;
      this.latV = 0;                                             // it lies where it went down: an obstacle for the runners behind
      this.integrate(dt, race); this.phase -= dt * this.v / this.strideLen() * 0.6;
      return;
    }
    if (this.finished) { // ease down past the post
      this.drive = false; this.urgeT = 0;
      this.eAct = Math.max(0.25, this.eAct - 0.4 * dt);
      this.v = Math.max(5.5, this.v - 1.3 * dt);
      this.latV *= 0.95;
      this.integrate(dt, race);
      return;
    }
    if (!this.started) {
      if (race.clock >= this.reactDelay) this.started = true;
      else { this.integrate(dt, race); return; }
    }
    const remainM = this.raceDist - this.progress;
    const inFinal = remainM <= RHYTHM_AT;

    // --- 1. rider's request → what the horse actually gives ---
    let eT = this.effort;
    const urging = this.urgeT > 0;
    if (urging) { this.urgeT -= dt; eT = Math.min(1, eT + 0.12); }
    if (this.drive) eT = Math.max(eT, 0.97);
    const cf0 = this.comfort();
    // keenness: traffic, being held back, or being checked makes a hot horse pull; cover in front and settling calm it
    let near = 0;
    for (const o of race.horses) { if (o === this || o.finished) continue; const dp = o.progress - this.progress; if (dp > -2 && dp < 7 && Math.abs(o.laneF - this.laneF) < 2.2) near++; }
    let keenT = Math.min(1, near * 0.35) * (this.effort < cf0 + 0.03 ? 1 : 0.5) * (1.25 - this.temper) * 1.6 + 0.5 * clamp(this.restrainHeat - 1.5, 0, 1.5) * (1.2 - this.temper);
    if (this.draft) keenT *= 0.5;
    keenT = clamp(keenT, 0, 1);
    this.keen += (keenT > this.keen ? 0.15 : -0.12) * dt; this.keen = clamp(this.keen - this.relax * 0.35 * dt, 0, 1);
    // settling: relaxes towards travelling within itself — only possible at a sensible pace
    const canSettle = this.settle && !this.restrain && this.effort <= cf0 + 0.06 && !this.drive && !urging;
    if (canSettle) this.relax = Math.min(1, this.relax + (0.06 + 0.36 * this.temper) * (this.draft ? 1.5 : 1) * dt);
    else this.relax = Math.max(0, this.relax - (this.effort > cf0 + 0.06 || this.drive || urging ? 1.6 : 0.45) * dt);
    if (this.relax > 0) eT = Math.min(eT, lerp(1, cf0 + 0.06, this.relax));       // a relaxed horse won't quicken until woken
    // restraint: a firm, controlled check — momentum is lost, a hot horse resents too much of it
    if (this.restrain) { eT = Math.min(eT, 0.45); this.restrainHeat += dt; if (!this.wasRestrain) this.stat.checks++; }
    else { this.restrainHeat = Math.max(0, this.restrainHeat - 0.25 * dt); if (this.wasRestrain) this.postCheckT = 0.8; }
    this.wasRestrain = this.restrain;
    this.restrainLvl += ((this.restrain ? 1 : 0) - this.restrainLvl) * Math.min(1, dt * 6);
    if (this.postCheckT > 0) this.postCheckT -= dt;
    if (this.relax > 0.5) this.stat.settledT += dt;
    if (this.keen > 0.4) this.stat.keenT += dt;
    eT = Math.min(eT, this.capacity());
    const sour = clamp((this.urgeHeat - 3.5) / 5, 0, 1);       // over-urged horses resent it
    let rUp = (0.16 + 0.26 * this.accN + 0.12 * this.temper) * (1 - 0.55 * this.F / 100) * (1 - 0.5 * sour);
    if (urging) rUp *= 1.9;
    if (this.drive) rUp *= 1.5;
    if (inFinal) rUp *= 1 + 0.6 * this.mom;
    if (this.S < 15) rUp *= 0.45 + this.S / 27;
    rUp *= 1 - 0.4 * this.relax;                               // slower to pick up when relaxed
    if (eT > this.eAct) this.eAct = Math.min(eT, this.eAct + rUp * dt);
    else this.eAct = Math.max(eT, this.eAct - (this.restrain ? 1.4 : 0.4) * dt);   // eases off; a check takes it back quickly
    const e = this.eAct;
    this.urgeHeat = Math.max(0, this.urgeHeat - (0.3 + 0.3 * this.relax) * dt);
    if (this.penT > 0) this.penT -= dt;
    if (inFinal) {
      this.rhythmT += dt;
      // a skipped beat loosens the rhythm; momentum chases the level the streak has earned
      if (this.lastBeatT < 0) this.lastBeatT = race.clock;
      if (race.clock - this.lastBeatT > BEAT * 1.6) { this.streak = Math.max(0, this.streak - 1); this.combo = this.streak; this.lastBeatT += BEAT; }
      const target = MOM_LEVELS[Math.min(7, this.streak)] * (0.2 + 0.8 * Math.pow(this.tapQ, 1.4));
      const k = target > this.mom ? 1 - Math.exp(-dt / 0.9) : 1 - Math.exp(-dt / 0.6);
      this.mom += (target - this.mom) * k;
    } else this.lastBeatT = -1;

    // --- 2. energy ---
    const cf = this.comfort();
    let drain = this.drainRate(e, cf);
    if (urging) drain *= 1.12;
    if (this.drive) drain *= 1.14;
    drain *= 1 + 0.25 * Math.abs(this.latV) * (0.6 + 0.4 * Math.min(1, this.v / 16));   // steering at speed costs energy
    if (this.draft) drain *= 0.95;                             // tracking a rival: steady rhythm, less wasted effort
    drain *= 1 - 3 * this.kB;                                  // a horse in its element travels more economically
    if (this.knack && this.started) {                            // horses that like to be ridden quietly save real energy doing it
      if (this.knack.cond === "settled" && this.relax > 0.5) drain *= 0.88;
      if (this.knack.cond === "back" && this.kn.back600 == null && this.rank > race.horses.length / 2) drain *= 0.9;
    }
    drain *= 1 + 0.25 * sour;
    if (this.relax > 0 && e <= cf + 0.06) drain *= 1 - 0.1 * this.relax;    // travelling relaxed is more efficient
    drain *= 1 + 0.22 * this.keen;                             // fighting the rider: head up, pulling — energy wasted, no extra speed
    if (race.clock > 6) drain += Math.max(0, this.accel) * 0.25 * this.drainScale;   // accelerating costs energy: braking and re-accelerating is wasteful
    if (race.clock < 6) drain *= 1 + 0.4 * Math.max(0, this.effort - 0.7);   // a hard break from the gates is expensive
    this.S = Math.max(0, this.S - drain * dt);
    if (e < cf - 0.08) {                                       // travelling within itself: partial recovery
      const ceil = 100 - 0.7 * this.F;
      if (this.S < ceil) this.S = Math.min(ceil, this.S + (0.4 + 1.3 * this.recov) * ((cf - 0.08 - e) / (cf - 0.08)) * (1 - this.F / 130) * dt);
    }
    const over = Math.max(0, e - cf) / (1 - cf);
    let fG = 0.012 + 1.5 * Math.pow(over, 1.6) * (1.25 - 0.5 * this.endN);
    if (this.S < 25) fG += (25 - this.S) * 0.03 * (1.2 - 0.4 * this.endN);
    if (this.S <= 0.5) fG += 1.0 * e;
    if (this.drive) fG *= 1.25;
    if (urging) fG *= 1.08;
    fG *= 1 + 0.5 * sour;
    this.F = Math.min(100, this.F + fG * this.assist * dt);

    // --- 3. sprint reserve: improves ACCESS to the horse's remaining performance ---
    let access = e > 0.85 ? (e - 0.85) / 0.15 : 0;
    if (this.drive) access = Math.max(access, 0.9);
    if (urging) access = Math.max(access, 0.45);
    access = Math.min(1, access) * (1 - 0.6 * this.relax);
    const effic = (inFinal ? 0.28 + 0.52 * this.mom : 0.45) * (this.penT > 0 ? 0.6 : 1);
    this.access = access;
    this.boost = (0.03 + 0.04 * this.sprintPow) * access * this.sprintAvail() * effic;
    // sprint momentum: rhythm timing lets the horse access what it has left. Scaled by its remaining fuel.
    const momB = inFinal ? this.mom * this.momFuel() : 0;
    this.momB = momB;
    this.boost += momB * (0.045 + 0.04 * this.sprintPow);
    if (access > 0 && this.SR > 0) {
      this.SR = Math.max(0, this.SR - (access * (4 + 2.5 * (1 - this.sprintPow)) * (1.45 - 0.65 * effic) + momB * 1.0) * dt);
    } else if (e < cf - 0.05 && remainM > 600) {
      const ceil = 100 - 0.5 * this.F;
      if (this.SR < ceil) this.SR = Math.min(ceil, this.SR + (0.15 + 0.35 * this.recov) * dt);
    }

    // --- 4. speed ---
    this.updateKnack(dt, race);
    let vT = this.vmaxEff() * speedCurve(e) * (1 + this.boost);
    if (this.isPlayer && e < 0.15) vT *= e / 0.15;               // your horse: ease right off and it pulls up to a stop at 0%
    vT = Math.min(vT, this.vmax * 1.09 * this.going.v);        // a hard physical ceiling, whatever the riding
    if (this.penT > 0) vT *= 0.985;                            // unbalanced by a wild tap
    if (this.restrain) vT = Math.min(vT, this.v - 1.8);       // the check itself
    // chaos: the AI field runs as a tight bunch — a horse off the back of the pack is let roll a little quicker, one
    //  off the front is held a little, so gaps close up. Small and bounded (≤6%), so it's still a proper race; off in
    //  the final 250 m where they can sprint for the line.
    if (race.chaos && this.bot && race.packP != null && race.dist - this.progress > 220) {
      vT *= clamp(1 - 0.0045 * (this.progress - race.packP), 0.97, 1.03);   // mild: keeps the bunch together front-to-back without stacking it wide
    }
    this.vTfree = vT;
    if (this.blockCap != null && vT > this.blockCap) vT = this.blockCap;
    this.blocked = this.blockCap != null && this.vTfree > this.blockCap + 0.25;
    this.blockedTime = this.blocked ? this.blockedTime + dt : 0;
    let resp = (1 - 0.45 * this.F / 100) * (this.S < 10 ? 0.55 + 0.045 * this.S : 1);
    if (urging) resp *= 1.15;
    if (this.drive) resp *= 1.2;
    resp *= (1 - 0.15 * this.relax) * (this.postCheckT > 0 ? 0.82 : 1);
    if (race.clock < 7) {                                      // jumping from the gates and getting into stride
      const bq = this.breakPow, fade = clamp(1 - (race.clock - 3.5) / 3.5, 0, 1);
      resp *= 1 + ((0.25 + 0.5 * this.startAb + 1.25 * bq) * (0.75 + 0.5 * this.effort)) * fade;
    }
    if (this.stumbleT > 0) { this.stumbleT -= dt; resp *= 0.4; }       // a missed break: off balance for a moment
    const superK = this.isPlayer ? Math.max(1, this.vmax / 20) : 1;          // unlimited mode: a faster horse also accelerates harder
    const aMax = this.A * resp * superK * superK * (1 + 0.8 * momB) * (0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - this.v / (this.vmax * 1.09))));
    const checking = this.blockCap != null && vT < this.v - 0.05;
    const dMax = (checking ? (this.obsBrake ? 6.0 : 4.0) : this.restrain ? 2.2 : this.isPlayer && this.effort < 0.15 ? 3.5 : 0.75) * superK;
    const a = clamp((vT - this.v) * (checking || this.restrain ? 2.6 : 0.9), -dMax, aMax);
    this.accel = a;
    this.v = Math.max(0, this.v + a * dt);

    // --- 5. steering: gradual, diagonal, never through a rival ---
    const vf = Math.min(1, this.v / 7);
    let maxLat = (0.5 + 0.45 * this.agil) * vf;                // lanes per second
    let latA = (1.0 + 0.9 * this.agil) * Math.max(0.3, vf);
    if (this.ctrlT > 0) { this.ctrlT -= dt; maxLat *= 0.35; latA *= 0.5; }   // still finding its feet after a stumble
    const latV0 = this.latV;
    let want;
    if (this.steerIn != null) {
      // continuous steering: hold to drift, release to hold the line. Assisted is gentler and refuses unsafe moves.
      const adv = !this.steerAssist;
      maxLat *= adv ? 1.15 : 0.85; latA *= adv ? 1.5 : 1.15;
      want = this.steerIn * maxLat;
      this.sideBlocked = 0;
      if (this.steerIn !== 0 && this.steerAssist) {
        const probe = this.laneF + Math.sign(this.steerIn) * 0.55;
        if (!race.corridorClear(this, probe, HORSE_LEN + 0.8, HORSE_LEN + 0.8)) { if (race.incMode === "off") want = 0; this.sideBlocked = Math.sign(this.steerIn); }
      }
      this.targetLane = this.laneF;
    } else {
      // ease in, ease out: never ask for more lateral speed than can be shed before the target or a rival's flank
      want = clamp((this.targetLane - this.laneF) * 1.5, -maxLat, maxLat);
    }
    const roomR = Math.max(0, this.latMax - this.laneF), roomL = Math.max(0, this.laneF - this.latMin);
    // a rider forcing the issue (advanced steering) doesn't ease off before a rival's flank — they make contact
    const forcing = this.steerIn != null && this.steerIn !== 0 && (!this.steerAssist || race.incMode !== "off");
    if (!forcing) want = clamp(want, -Math.sqrt(2 * latA * roomL), Math.sqrt(2 * latA * roomR));
    this.latV += clamp(want - this.latV, -latA * dt, latA * dt);
    let nl = this.laneF + this.latV * dt, impact = 0, hitSide = 0;
    if (nl > this.latMax && this.latV > 0) { if (this.latMax < NLANES - 1) { impact = this.latV * LANE_W; hitSide = 1; } nl = Math.max(this.laneF, this.latMax); this.latV *= this.latMax < NLANES - 1 ? 0.15 : 0.5; }
    if (nl < this.latMin && this.latV < 0) { if (this.latMin > 0) { impact = -this.latV * LANE_W; hitSide = -1; } nl = Math.min(this.laneF, this.latMin); this.latV *= this.latMin > 0 ? 0.15 : 0.5; }
    this.laneF = clamp(nl, 0, NLANES - 1);
    // leaning: holding the steer into a horse alongside
    this.lean = forcing && ((this.steerIn > 0 && roomR < 0.05 && this.latMax < NLANES - 1) || (this.steerIn < 0 && roomL < 0.05 && this.latMin > 0)) ? this.lean + dt : 0;
    this.balance(dt, race, (this.latV - latV0) * LANE_W / dt, impact, hitSide);
    if (this.fallen) { this.integrate(dt, race); return; }

    const prevP = this.progress;
    this.integrate(dt, race);
    const fwdV = (this.progress - prevP) / dt;
    const r1 = this.raceDist - this.progress;
    const crossT = m => race.clock - (m - r1) / Math.max(0.1, fwdV);
    if (this.stat.t800 == null && r1 <= 800) this.stat.t800 = crossT(800);
    if (this.stat.t400 == null && r1 <= 400) this.stat.t400 = crossT(400);
    if (this.stat.t200 == null && r1 <= 200) this.stat.t200 = crossT(200);
    if (this.stat.r400 == null && r1 <= 400) this.stat.r400 = this.rank;
    if (this.stat.r100 == null && r1 <= 100) { this.stat.r100 = this.rank; this.stat.leadAt100 = this.rank === 1; }
    if (r1 <= 0 && !this.finished) {                            // finish time interpolated within the step
      this.finished = true;
      this.finishTime = crossT(0);
      this.stat.finishV = this.v;
      race.onFinish(this);
    }
    const st = this.stat;
    st.maxV = Math.max(st.maxV, this.v); st.sumV += this.v * dt; st.n += dt;
    if (e > 0.85) st.hiEffT += dt;
    if (remainM < 300) st.minEffLate = Math.min(st.minEffLate == null ? 1 : st.minEffLate, this.effort);
    if (e > 0.95 || this.drive) st.maxEffT += dt;
    if (this.blocked) st.blockedT += dt;
    if (inFinal) { st.syncSum += this.mom * dt; st.syncN += dt; st.peakMom = Math.max(st.peakMom, this.mom); }
  }
  /* Balance. Stability (stab, 1 = balanced) drains under real physical stress and recovers when the horse is ridden
     sensibly. Stress comes from the lateral load of cornering plus steering (relative to what this horse can handle on
     this ground), sudden checks in a bend, contact with rivals and clipping heels. Incidents only become possible once
     stability is genuinely low, so a warning always comes first; how quickly it recovers depends on temperament. */
  balance(dt, race, aSteer, impact, hitSide) {
    const mode = race.incMode;
    this.incCool -= dt; this.contactCool -= dt;
    this.stumV = Math.max(0, this.stumV - dt * 0.7);
    if (mode === "off" || !this.started || this.finished) { this.stab = Math.min(1, this.stab + dt); this.stress = 0; if (impact > 0.05) this.contact(race, impact, hitSide, false); return; }
    const vS = Math.min(this.v, 19.5);                                  // experimental speeds are treated like a top racehorse's
    const off = laneOff(this.laneF), onBend = race.route.isTurn(this.progress);
    const aC = race.route.bendAcc(this.progress, off, vS);              // the bend's own centripetal load (from the real local curvature)
    const aS = -aSteer * Math.min(1.25, vS / 16);                       // steering load, + towards the rail; harder at a gallop
    const latMs = Math.abs(this.latV * LANE_W);
    const dem = Math.abs(aC + (Number.isFinite(aS) ? aS : 0)) + 0.6 * latMs * vS / 17;
    this.aDem += (dem - this.aDem) * Math.min(1, dt / 0.35);
    const gK = this.going.slip || 1;
    const cap = (3.6 + 2.8 * this.agil) / Math.sqrt(gK) * (1 - 0.22 * this.F / 100) * (0.8 + 0.2 * this.stab);
    let stress = Math.max(0, this.aDem - cap) / cap * 3.2;
    this.cap = cap; this.onBend = onBend;
    if (stress > 0) this.cause = onBend ? "turning too sharply on the bend" : "swerving at speed";
    if (this.restrain && this.v > 12 && onBend) this.cause = "snatching up in the bend";
    if (this.lean > 0.25) this.cause = "leaning on a rival";
    if (impact > 0.75) this.cause = "heavy contact with a rival";
    if (this.restrain && this.v > 12) stress += onBend ? 2.2 * (vS / 17) * (vS / 17) : 0.25;      // snatching up mid-bend
    if (this.lean > 0.15) stress += 2.2 + 1.5 * Math.min(1, this.lean / 2);                        // shoving into a rival with no room
    if (this.stumbleT > 0 && Math.abs(aSteer) > 2) stress += 0.4;                                 // steering hard while stumbling
    if (impact > 0.05) this.contact(race, impact, hitSide, true);
    // clipping the heels of the horse in front
    if (this.front && this.frontGap - HORSE_LEN < 0.3 && this.v - this.front.v > 1 && this.contactCool <= 0) {
      const cl = this.v - this.front.v; this.contactCool = 0.6; this.v = Math.min(this.v, this.front.v); this.stab -= 0.12 * cl * gK;
      this.logInc(race, "heels", cl);
    }
    stress *= Math.sqrt(gK) * (1.5 - 0.8 * this.agil) * (1 + 0.5 * this.F / 100);
    this.stress = stress;
    if (stress > 0.01) this.stab -= stress * 0.2 * dt;
    else this.stab += (0.1 + 0.22 * this.temper) * (1.45 - 0.7 * this.eAct) * dt;                 // easing off and straightening helps
    this.stab = clamp(this.stab, mode === "full" ? 0 : 0.16, 1);
    this.lowStab = Math.min(this.lowStab, this.stab);
    // incidents: only below clear thresholds, more likely the deeper the trouble (seeded race RNG: replays are exact)
    if (this.incCool <= 0) {
      const r = race.rng();
      if (mode === "full" && this.stab < 0.15 && (stress > 0.15 || this.stumbleT > 0 || impact > 0.3 || this.lean > 0.15) && (r < (0.15 - this.stab) * 14 * dt + (impact > 1.1 && this.stab < 0.2 ? 0.35 : 0) || (this.stab <= 0.03 && (this.lean > 0.15 || stress > 0.5)))) this.fall(race, hitSide || (this.lean > 0.15 ? Math.sign(this.steerIn || 0) : 0) || Math.sign(this.latV) || 1, 0, this.lean > 0.15 || impact > 0.75 ? "side" : "balance");
      else if (this.stab < 0.36 && r < (0.36 - this.stab) * 3.2 * dt) this.stumble(race, 2);
      else if (this.stab < 0.6 && r < (0.6 - this.stab) * 2.2 * dt) this.stumble(race, 1);
    }
  }
  contact(race, impact, side, withStab) {
    if (this.contactCool > 0) return;
    this.contactCool = 0.35;
    const heavy = impact > 0.75;
    this.v = Math.max(0, this.v - (heavy ? 0.55 : 0.18) * impact);                 // the aggressor always loses momentum
    if (withStab) this.stab -= (heavy ? 0.14 : 0.06) * impact * (this.going.slip || 1) * (1.2 - 0.4 * this.agil) + (this.lean > 0.15 ? 0.04 : 0);
    // the horse that was struck: a nudge to its balance, never a speed gain for either
    for (const o of race.horses) {
      if (o === this || o.fallen || o.finished) continue;
      if (Math.abs(o.progress - this.progress) < HORSE_LEN + 0.5 && (o.laneF - this.laneF) * side > 0 && Math.abs(o.laneF - this.laneF) < LAT_SEP + 0.25) {
        o.v = Math.max(0, o.v - 0.08 * impact); if (withStab && race.incMode !== "off") o.stab -= (heavy ? 0.06 : 0.02) * impact; o.contactCool = Math.max(o.contactCool, 0.2);
        this.logInc(race, heavy ? "heavy contact" : "contact", impact, o); break;
      }
    }
  }
  logInc(race, type, mag, other) {
    this.incidents.push({ t: race.clock, type, at: Math.round(this.progress) });
    race.event(type, this, other, mag);
  }
  stumble(race, lv) {
    this.incCool = lv === 2 ? 2.2 : 1.2;
    if (lv === 2) { this.v *= 0.86; this.stumbleT = Math.max(this.stumbleT, 1.4); this.stab -= 0.1; this.ctrlT = 1.6; this.mom = 0; this.streak = 0; this.keen = Math.min(1, this.keen + 0.2); this.stumV = 1; }
    else { this.v *= 0.96; this.stumbleT = Math.max(this.stumbleT, 0.5); this.stab -= 0.05; this.ctrlT = Math.max(this.ctrlT, 0.4); this.stumV = Math.max(this.stumV, 0.6); }
    this.stab = Math.max(this.stab, race.incMode === "full" ? 0 : 0.16);
    this.logInc(race, lv === 2 ? "major stumble" : "stumble");
  }
  // gen: 0 = went down by itself; 1+ = fell over another faller's body.
  // kind drives the animation: "trip" (front legs strike a body on the ground), "side" (kicked / pushed over sideways),
  // "balance" (lost its own footing). Defaults from the cause.
  fall(race, dir, gen, kind) {
    this.fallen = true; this.dnf = true; this.fallT = 0; this.fallDir = dir >= 0 ? 1 : -1; this.stumV = 1; this.vFall = this.v;
    this.fallGen = gen || 0; this.pushing = this.lean > 0.15 || /leaning|heavy contact/.test(this.cause || "");
    this.fallKind = kind || (this.pushing ? "side" : "balance");
    this.fallCause = this.cause || "losing balance";
    this.drive = false; this.restrain = false; this.settle = false;
    this.logInc(race, "fall");
    race.onFall(this);
  }
  integrate(dt, race) {
    const off = laneOff(this.laneF);
    const scale = race.route.scale(this.progress, off);                               // wide on a bend = more ground (true curvature)
    const lat = this.latV * LANE_W;
    const fwd = Math.sqrt(Math.max(0, this.v * this.v - lat * lat));               // diagonal running costs forward ground
    this.progress += fwd * dt * scale;
    this.distRun += this.v * dt;
    if (scale < 1 && !this.finished) this.groundLost += fwd * dt * (race.route.railScale(this.progress) - scale);   // metres given away by running wide
    if (race.route.inFinalBend(this.progress) && !this.finished) this.stat.bendExtra = (this.stat.bendExtra || 0) + fwd * dt * (race.route.railScale(this.progress) - scale);
    this.phase += dt * this.v / this.strideLen();
    race.route.point(this.progress, off, this.pos);
  }
}

/* =====================================================================
   BOT JOCKEYS — same physics as the player. Difficulty changes judgement,
   never horsepower: reaction time, pacing accuracy, kick timing, traffic
   sense, finishing rhythm.
   Each jockey has a personality (stable identity per horse + a little
   per-race variation) and a plan that it re-evaluates as the race unfolds.
   ===================================================================== */
const DIFF = {
  easy:   { iq: 0.2,  react: [1.0, 1.6],  pacingErr: 0.36, kickErr: 280, consistency: 0.42, rhythm: 0.2,  hold: 0 },
  medium: { iq: 0.46, react: [0.65, 1.1], pacingErr: 0.2,  kickErr: 160, consistency: 0.64, rhythm: 0.42, hold: 0 },
  hard:   { iq: 0.88, react: [0.3, 0.55], pacingErr: 0.06, kickErr: 60,  consistency: 0.88, rhythm: 0.72, hold: 0.0 },
};
// a style is only a starting preference: pos 0 = lead … 1 = last
const STYLE = {
  front:  { pos: 0.02, aggr: 0.7,  pat: 0.3,  kick: 520, early: 0.92, risk: 0.55, follow: 0.7,  cons: 0.2,  rail: 0.9 },
  aggro:  { pos: 0.12, aggr: 0.92, pat: 0.15, kick: 560, early: 0.93, risk: 0.85, follow: 0.95, cons: 0.1,  rail: 0.6, surge: true },
  stalk:  { pos: 0.26, aggr: 0.55, pat: 0.55, kick: 450, early: 0.84, risk: 0.55, follow: 0.75, cons: 0.4,  rail: 0.8 },
  mid:    { pos: 0.46, aggr: 0.45, pat: 0.55, kick: 430, early: 0.79, risk: 0.45, follow: 0.55, cons: 0.5,  rail: 0.75 },
  steady: { pos: 0.4,  aggr: 0.35, pat: 0.7,  kick: 480, early: 0.78, risk: 0.3,  follow: 0.35, cons: 0.55, rail: 0.85 },
  closer: { pos: 0.8,  aggr: 0.4,  pat: 0.85, kick: 410, early: 0.72, risk: 0.6,  follow: 0.3,  cons: 0.8,  rail: 0.6, wide: true },
  cons:   { pos: 0.7,  aggr: 0.2,  pat: 0.9,  kick: 350, early: 0.7,  risk: 0.15, follow: 0.25, cons: 0.9,  rail: 0.9 },
};
// where each role likes to sit, as metres behind the leader (scaled with trip)
const ROLE_GAP = { lead: [0, 0], press: [1.5, 5], stalk: [4, 10], mid: [8, 16], hold: [12, 22], late: [16, 30] };
const ROLES = ["lead", "press", "stalk", "mid", "hold", "late"];
function roleFor(pos) { return pos < 0.1 ? "lead" : pos < 0.24 ? "press" : pos < 0.42 ? "stalk" : pos < 0.6 ? "mid" : pos < 0.78 ? "hold" : "late"; }
function makeJockey(def, diffKey, rng) {
  const st = STYLE[def.style] || STYLE.mid, d = DIFF[diffKey] || DIFF.medium;
  const id = mulberry32(nameSeed(def.name + "/jockey"));       // the same rider every time this horse runs
  const iv = s => (id() - 0.5) * s, rv = s => (rng() - 0.5) * s;
  const j = {
    aggression: clamp(st.aggr + iv(0.3) + rv(0.16), 0, 1),
    patience:   clamp(st.pat + iv(0.3) + rv(0.16), 0, 1),
    tactics:    clamp(d.iq + iv(0.18) + rv(0.08), 0.05, 1),
    risk:       clamp(st.risk + iv(0.3) + rv(0.14), 0, 1),
    prefPos:    clamp(st.pos + iv(0.16) + rv(0.24), 0, 1),
    react:      lerp(d.react[0], d.react[1], id()) * (0.85 + 0.3 * rng()),
    follow:     clamp(st.follow + iv(0.3) + rv(0.16), 0, 1),
    passConf:   clamp(0.25 + 0.55 * st.risk + iv(0.3) + rv(0.12), 0, 1),
    kickBias:   iv(0.6) + rv(0.8),
    conserve:   clamp(st.cons + iv(0.3) + rv(0.14), 0, 1),
    adapt:      clamp(0.2 + 0.55 * d.iq + iv(0.3) + rv(0.12), 0, 1),
    finish:     clamp(d.rhythm + iv(0.24) + rv(0.1), 0.05, 0.97),
    consistency: clamp(d.consistency + iv(0.14), 0.2, 1),
  };
  // a named riding personality (shapes decisions all race, shown in the race stats): aggressive front-runners push
  // for the lead, rail riders save ground and sit in the pocket, stalkers take cover behind the leaders, closers
  // conserve at the back and sweep wide late
  j.persona = j.prefPos < 0.26 && j.aggression > 0.45 ? "front-runner" : j.prefPos > 0.58 ? "closer" : (st.rail || 0) > 0.55 && j.patience > 0.62 ? "rail rider" : "stalker";
  return j;
}
class Bot {
  constructor(h, diffKey, rng) {
    this.h = h; this.d = DIFF[diffKey] || DIFF.medium; this.st = STYLE[h.def.style] || STYLE.mid; this.rng = rng;
    const j = this.jk = makeJockey(h.def, diffKey, rng);
    this.react = j.react; this.rhythmSkill = j.finish;
    this.judgeErr = (rng() * 2 - 1) * this.d.pacingErr;         // persistent misreading of its own horse
    this.margin = lerp(2.4, 0.5, j.passConf);                    // clearance it wants before moving into a gap
    // how hard this rider breaks: aggressive riders and sprint trips jump; patient riders over a trip settle into a rhythm
    this.breakAggro = clamp(0.25 + 0.55 * j.aggression - 0.3 * j.conserve + (h.raceDist <= 1400 ? 0.25 : h.raceDist >= 2400 ? -0.15 : 0) + 0.2 * (h.startAb - 0.7), 0, 1);
    this.role = this.role0 = roleFor(j.prefPos);
    this.timer = rng() * 0.4; this.mode = "early"; this.kickPoint = null; this.kick0 = null;
    this.coverT = 0; this.checkT = 0; this.digT = 0; this.digCool = 8; this.followCool = 4; this.surgeT = 3 + rng() * 6; this.surgeE = 0;
    this.laneCool = 1 + rng(); this.defendCool = 4; this.urgeCool = 0; this.noise = 0; this.seen = {};
    this.nextReview = 250 + rng() * 150; this.trapped = 0; this.wideBias = 0; this.tapT = rng() * BEAT;
    this.log = []; this.changes = 0; this.fb = null; this.fbOut = 0;
    this.persona = j.persona; this.coverCool = 2 + rng() * 3;
    // riders are not perfect: a weaker one sometimes goes for home too soon, or leaves the run too late
    this.misjudge = rng() < (1 - this.d.iq) * 0.45 ? (rng() < 0.5 ? "early" : "late") : null;
  }
  // the home turn is a tactical moment: hold the rail and wait for a gap, angle out for a clear run, or follow a move.
  // Judgement depends on the rider (tactics/risk/patience) and difficulty: weaker riders misread it more often.
  finalBend(race, remain, cur) {
    const h = this.h, j = this.jk;
    if (this.fb == null) {
      const roomIn = race.roomAheadPred(h, cur, 40), outside = race.horses.some(o => o !== h && !o.finished && Math.abs(o.progress - h.progress) < 3.5 && o.laneF > h.laneF + 0.5 && o.laneF < h.laneF + 1.6);
      const boxRisk = (roomIn < 14 ? 0.5 : 0) + (outside ? 0.35 : 0) + (cur <= 1 ? 0.15 : 0);
      let sAngle = boxRisk * (0.6 + 0.6 * j.tactics) + 0.25 * (1 - j.patience) + (this.st.wide ? 0.3 : 0) - (h.rank <= 2 ? 0.4 : 0);
      let sHold = (1 - boxRisk) * 0.6 + 0.35 * j.risk + 0.25 * j.patience + (cur <= 1 ? 0.2 : 0);
      const lead = race.horses.some(o => o !== h && !o.finished && o.progress - h.progress > HORSE_LEN && o.progress - h.progress < 9 && Math.abs(o.laneF - h.laneF) < 1.2 && o.rank < h.rank);
      let sFollow = 0.5 * j.follow + (lead ? 0.35 : 0) + (h.rank > 2 && roomIn < 25 ? 0.22 : 0) - (h.rank <= 2 ? 0.3 : 0);   // a horse to track into the straight
      const err = (1 - this.d.iq) * 0.9;                                   // misjudging the situation
      sAngle += (this.rng() - 0.5) * err; sHold += (this.rng() - 0.5) * err; sFollow += (this.rng() - 0.5) * err;
      this.fb = sAngle > sHold && sAngle > sFollow ? "angle" : sFollow > sHold ? "follow" : "hold";
      this.note(this.fb === "angle" ? "angles out off the home turn" : this.fb === "follow" ? "tracks a rival into the straight" : "holds the inside into the straight", race);
    }
    if (this.laneCool > 0) return false;
    if (this.fb === "angle" && this.fbOut < 2 + (this.st.wide ? 1 : 0) && race.roomAheadPred(h, cur, 40) < 22 && cur < NLANES - 1 && race.canMove(h, cur + 1, this.margin)) {
      h.targetLane = cur + 1; this.fbOut++; this.laneCool = 1.4; return true;
    }
    if (this.fb === "follow") {
      let best = null, bd = 1e9;
      for (const o of race.horses) { if (o === h || o.finished) continue; const dp = o.progress - h.progress;
        if (dp > HORSE_LEN && dp < 9 && Math.abs(o.laneF - h.laneF) < 2.2 && o.accel > 0.15 && dp < bd) { bd = dp; best = o; } }
      if (best) { const L = Math.round(best.targetLane); if (L !== cur && Math.abs(L - cur) <= 1 && race.canMove(h, L, this.margin)) { h.targetLane = L; this.laneCool = 1.2; return true; } }
    }
    return this.fb === "hold";                                              // holders don't drift off the rail now
  }
  note(s, race) { this.log.push((race ? Math.round(race.dist - this.h.progress) + "m: " : "") + s); if (this.log.length > 10) this.log.shift(); this.lastNote = s; }
  setRole(r, why, race) { if (r !== this.role) { this.role = r; this.changes++; this.note(why, race); } }
  // race plan from distance, the horse, and how it measures up against this field
  plan(race) {
    const h = this.h, st = this.st, j = this.jk, fs = race.fieldStats;
    let pos = j.prefPos;
    if (j.tactics > 0.4 && fs) {
      const w = j.tactics;
      const stayEdge = h.endN - fs.end, kickEdge = h.sprintPow - fs.spr;
      if (stayEdge > 0.08 && kickEdge < 0 && h.raceDist >= 1600) pos -= 0.22 * w;   // make it a test of stamina
      if (kickEdge > 0.08 && stayEdge < 0) pos += 0.14 * w;                         // save it for the finish
      if (h.endN < 0.55 && h.raceDist >= 2000) pos += 0.16 * w;                     // a non-stayer nursed over a trip
      if (h.endN > 0.85 && h.raceDist <= 1200) pos -= 0.1 * w;                      // a stayer can't wait in a sprint
    }
    this.role = this.role0 = roleFor(clamp(pos, 0, 1));
    const dScale = Math.sqrt(clamp(h.raceDist / 1600, 0.6, 2));
    let k = (st.kick + (h.sprintPow - 0.7) * 160 + (h.endN - 0.65) * 120 + j.kickBias * 170) * dScale;
    k += (this.rng() * 2 - 1) * this.d.kickErr;
    if (this.misjudge === "early") k *= 1.3; else if (this.misjudge === "late") k *= 0.72;
    this.kickPoint = this.kick0 = clamp(k, 170, Math.min(h.raceDist * 0.6, 950));
    this.earlyUntil = Math.max(150, Math.min(420, h.raceDist * 0.14)) * (0.8 + 0.4 * this.rng());
  }
  costTo(e, metres) {
    const h = this.h, v = Math.max(8, h.vmaxEff() * speedCurve(e));
    return h.drainRate(e) * Math.max(0, metres) / v;
  }
  affordable(metres, reserve, S) {
    const avail = S - reserve;
    for (let e = 0.96; e > 0.45; e -= 0.02) if (this.costTo(e, metres) <= avail) return e;
    return 0.45;
  }
  // react to what rivals are doing: follow moves, go with a leader who quickens, cover the player
  perceive(race, remain) {
    const h = this.h, j = this.jk, remainFrac = remain / h.raceDist;
    for (const o of race.horses) {
      if (o === h) continue;
      const ahead = o.progress > h.progress, was = this.seen[o.id];
      if (was === false && ahead && o.progress - h.progress < 8 && o.v > h.v + 0.5 && this.mode === "cruise" && this.followCool <= 0) {
        const p = j.follow * (0.35 + 0.35 * j.tactics) * (remainFrac < 0.6 ? 1 : 0.3) * (o.isPlayer ? 1.2 : 1);
        if (this.rng() < p) { this.coverT = 2.5 + 3 * j.aggression; this.followCool = 9 + 6 * this.rng(); this.note("follows " + o.def.name + "'s move", race); }
      }
      // a rival coming alongside to pass: some riders refuse to yield
      const dp = o.progress - h.progress, dl = Math.abs(o.laneF - h.laneF);
      if (dl > 0.6 && dl < 1.8 && dp > -1 && dp < HORSE_LEN && o.v > h.v + 0.15 && remainFrac < 0.65 && this.digCool <= 0
          && this.rng() < j.aggression * 0.35) { this.digT = 1.8 + 2.2 * j.aggression; this.digCool = 14 + 8 * this.rng(); this.note("refuses to yield to " + o.def.name, race); }
      this.seen[o.id] = ahead;
    }
    const L = race.leader;
    if (L && L !== h && this.mode === "cruise" && remainFrac < 0.5 && race.leaderV > h.v + 0.8 && race.leaderProgress - h.progress < 20
        && this.coverT <= 0 && this.rng() < j.follow * 0.35) { this.coverT = 2 + 2 * j.aggression; this.note("goes with the leader", race); }
    const P = race.player;
    if (P && P !== h && !P.finished && Math.abs(P.progress - h.progress) < 18) {
      if (race.playerSurge && this.mode === "cruise" && this.rng() < j.follow * j.tactics * 0.8) { this.coverT = Math.max(this.coverT, 2 + 2 * j.aggression); this.note("covers the player's move", race); }
      // an aggressive rider goes with the player's sprint
      if (this.mode !== "kick" && P.mom > 0.45 && remain < this.kickPoint * 1.6 && h.SR > 30 && this.rng() < j.follow * j.aggression * 0.6) {
        this.mode = "kick"; this.note("goes with the player's sprint", race);
      }
    }
  }
  // re-plan at intervals: the style was a starting preference, not an instruction
  review(race, remain, Sest) {
    const h = this.h, j = this.jk;
    if (h.progress < this.nextReview || this.mode === "kick") return;
    this.nextReview = h.progress + 140 + this.rng() * 120;
    if (this.rng() > j.adapt) return;
    const L = race.leader, rank = h.rank, n = race.horses.length;
    const leaderHot = L && L !== h && L.eAct > L.comfort() + 0.05;
    const leaderSlow = L && L.eAct < L.comfort() - 0.1 && race.clock > 12;
    const pressers = race.horses.filter(o => o.bot && o !== h && (o.bot.role === "lead" || o.bot.role === "press") && race.leaderProgress - o.progress < 6).length;
    const ROLE_I = ROLES.indexOf(this.role);
    // 1. a front runner who finds the early pace too hot settles in behind
    if ((this.role === "lead" || this.role === "press") && rank > 1 && (leaderHot || pressers >= 2) && j.aggression < 0.8
        && this.rng() < 0.4 + 0.5 * j.tactics) { this.setRole("stalk", "settles behind a hot pace", race); return; }
    // 2. nobody is making it: even a patient rider may take it up
    if (leaderSlow && ROLE_I >= 2 && remain > this.kickPoint + 350 && this.rng() < 0.18 + 0.3 * j.tactics + 0.2 * (1 - j.patience)) {
      this.setRole(ROLE_I >= 4 && this.rng() < 0.5 ? "press" : "lead", "takes it up — the pace is too slow", race); return;
    }
    // 3. a closer sees the leaders dawdling: go early
    if ((this.role === "hold" || this.role === "late") && leaderSlow && remain < this.kickPoint + 450 && this.rng() < 0.3 * j.aggression + 0.35 * j.tactics) {
      this.kickPoint = clamp(remain - 30, this.kickPoint, 760); this.changes++; this.note("goes for home early", race); return;
    }
    // 4. a midfield horse travelling well attacks sooner than planned
    if ((this.role === "mid" || this.role === "stalk") && remain < this.kickPoint + 320 && Sest > this.costTo(0.96, remain) * 0.95
        && this.rng() < 0.12 + 0.35 * j.aggression) { this.kickPoint = Math.max(this.kickPoint, remain - 15); this.changes++; this.note("kicks earlier than expected", race); return; }
    // 5. trapped in traffic: either switch out wide or sit and wait for a gap
    if (this.trapped > 3.5) {
      if (j.patience < 0.55 || this.rng() < 0.35) { this.wideBias = 2; this.note("switches out wide after getting trapped", race); }
      else { this.kickPoint = Math.max(170, this.kickPoint - 60); this.note("sits and waits for a gap", race); }
      this.changes++; this.trapped = 0; return;
    }
    // 6. running low: drop back a role and delay the kick
    if (Sest < 30 && remain > this.kickPoint * 1.6 && ROLE_I < 5) { this.setRole(ROLES[ROLE_I + 1], "drops back to save energy", race); this.kickPoint = Math.max(170, this.kickPoint * 0.85); }
  }
  think(race, dt) {
    const h = this.h, st = this.st, d = this.d, j = this.jk;
    if (this.kickPoint == null) this.plan(race);
    const remain = h.raceDist - h.progress, rank = h.rank;
    const Sest = clamp(h.S * (1 + this.judgeErr) + (this.rng() - 0.5) * d.pacingErr * 20, 0, 100);
    this.digCool -= dt; this.followCool -= dt;
    this.perceive(race, remain);
    this.review(race, remain, Sest);
    // ---- mode changes ----
    if (this.mode === "early" && h.progress > this.earlyUntil) this.mode = "cruise";
    if (this.mode !== "kick") {
      if (remain <= this.kickPoint) { this.mode = "kick"; this.note("launches the finishing run", race); }
      else if (remain < this.kickPoint * 1.7 && this.mode === "cruise") {
        if (Sest > this.costTo(0.97, remain) + 10 && this.rng() < 0.3 * j.tactics) { this.mode = "kick"; this.note("full of running — goes now", race); }
        const L = race.leader;
        if (this.mode !== "kick" && L && L !== h && L.v < L.vPrev - 0.1 && (L.F > 45 || L.S < 20) && race.leaderProgress - h.progress < 25
            && this.rng() < 0.5 * j.tactics + 0.2 * j.risk) { this.mode = "kick"; this.note("pounces on a tiring leader", race); }
      }
      if (remain < 260) this.mode = "kick";                       // nobody dawdles inside the last 260 m
    }
    if (this.mode === "kick" && this.kickAt == null) this.kickAt = remain;
    // ---- effort ----
    let e;
    if (this.mode === "early") {
      e = st.early + clamp((1400 - h.raceDist) / 1400, -0.6, 0.4) * 0.1 + (this.role === "lead" ? 0.03 : this.role === "late" ? -0.04 : 0) + 0.06 * (this.breakAggro - 0.45);
      if (this.checkT > 0) this.checkT -= dt;                     // a check taken early runs out too (it used to persist through a long early phase)
    } else if (this.mode === "cruise") {
      const kickCost = this.costTo(0.98, this.kickPoint) * 1.05 + 3;
      const aff = this.affordable(remain - this.kickPoint, kickCost, Sest);
      const gapL = race.leaderProgress - h.progress, sc = clamp(h.raceDist / 1600, 0.75, 1.5);
      let want = aff;
      if (this.role === "lead") {
        if (rank > 1) want += 0.04 + 0.08 * j.aggression * (gapL < 12 ? 1 : 0.5);   // go and get the lead
        else {
          const second = race.order[1], lead = second ? h.progress - second.progress : 99;
          if (lead > 8) want += j.aggression > 0.6 && j.tactics < 0.65 ? 0.03 : -0.04 * j.conserve;   // clear: a bold rider keeps kicking on, a clever one dictates
          else if (lead < 2.5 && j.aggression > 0.5) want += 0.03;                     // duel for the lead
        }
      } else {
        const [g0, g1] = ROLE_GAP[this.role];
        if (gapL > g1 * sc) want += clamp((gapL - g1 * sc) * 0.008, 0, 0.09) * (0.6 + 0.6 * (1 - j.conserve));
        else if (gapL < g0 * sc && rank > 1) want -= clamp((g0 * sc - gapL) * 0.012, 0, 0.07) * (0.5 + j.patience);
        // keep in touch with the horse directly ahead: packs form instead of a strung-out field
        const ahead = race.order[rank - 2];
        if (ahead) { const g = ahead.progress - h.progress - HORSE_LEN; if (g > 6 && g < 30) want += 0.025 * (1 - 0.6 * j.conserve); }
      }
      const slack = 0.02 + 0.09 * j.aggression * (1.25 - j.tactics);   // how far over budget this rider will stray
      e = Math.min(want, aff + slack);
      if (st.surge) {                                                  // aggressive riders make wasteful moves
        this.surgeT -= dt;
        if (this.surgeT <= 0) { this.surgeT = 5 + this.rng() * 9; this.surgeE = this.rng() < 0.45 * j.aggression + 0.1 ? 0.1 + 0.05 * this.rng() : 0; }
        e += this.surgeE; this.surgeE = Math.max(0, this.surgeE - dt * 0.03);
      }
      if (this.coverT > 0) { this.coverT -= dt; e = Math.max(e, Math.min(0.95, aff + 0.08 + 0.1 * j.aggression)); }
      if (this.digT > 0) { this.digT -= dt; e = Math.max(e, Math.min(0.95, h.eAct + 0.05)); }
      if (this.checkT > 0) this.checkT -= dt;
    } else {
      e = 1.0;
      if (h.S < 3 && h.SR < 5 && j.tactics > 0.5) e = 0.9;           // keep an empty horse balanced rather than flog it
      if (this.checkT > 0) this.checkT -= dt;
    }
    let tight = false;
    for (const o of race.horses) if (o !== h && !o.finished && Math.abs(o.laneF - h.laneF) < LAT_SEP && h.progress - o.progress > 0 && h.progress - o.progress < HORSE_LEN + 4) tight = true;
    h.restrain = this.checkT > 0 && remain > 150 && this.mode !== "kick" && !tight && !(race.incMode !== "off" && (h.stab < 0.8 || h.v > 13) && race.route.isTurn(h.progress));   // experienced riders ease rather than snatch up mid-bend
    h.settle = this.mode !== "kick" && !h.restrain && remain > this.kickPoint + 60 &&
      ((j.patience > 0.3 && (h.keen > 0.2 || (h.draft && this.role !== "lead" && this.coverT <= 0))) || (h.keen > 0.45 && j.tactics > 0.35));
    if (remain < 300) e = Math.max(e, 0.85);                         // sanity: never ease right off near the finish
    this.noise = this.noise * 0.6 + (this.rng() - 0.5) * (1 - j.consistency) * 0.14;
    h.effort = clamp(e + this.noise - d.hold, 0.3, 1 - d.hold * 0.6);
    if (remain < 300) h.effort = Math.max(h.effort, 0.84);
    // ---- finishing tools ----
    h.drive = this.mode === "kick" && h.SR > 6 && remain < this.kickPoint * (0.45 + 0.3 * j.risk);
    if (this.mode === "kick") {
      this.urgeCool -= dt;
      if (this.urgeCool <= 0 && h.SR > 3 && h.urgeHeat < 2.5 + 2 * (1 - j.tactics) && remain > RHYTHM_AT) {
        h.urgeT = 0.6; h.urgeHeat += 1; this.urgeCool = 0.9 + this.rng() * 1.4 * (1.2 - j.risk);
      }
    }
    if (h.blocked) this.trapped += dt;
    this.steer(race, dt, remain);
  }
  // the same rhythm mechanic as the player, ridden with this jockey's finishing skill (called every sim step)
  rhythm(dt, race) {
    const h = this.h, j = this.jk;
    if (h.finished || this.mode !== "kick" || h.raceDist - h.progress > RHYTHM_AT) return;
    this.tapT -= dt; if (this.tapT > 0) return;
    this.tapT = BEAT * (0.94 + 0.12 * this.rng());
    const sd = 0.12 + 0.32 * (1 - j.consistency);
    let a = j.finish + (this.rng() + this.rng() - 1) * sd * 1.6;
    if (this.rng() < 0.1 * (1 - j.finish)) a = 0.02;                 // the occasional fumble
    h.tap(clamp(a, 0, 1), race.clock);
  }
  steer(race, dt, remain) {
    const h = this.h, st = this.st, j = this.jk;
    if (h.stab < 0.72 && race.incMode !== "off") return;              // straighten up and let the horse find its feet
    // CHAOS: the field runs bunched up behind each other near the rail — a tight column 3–4 horses wide, not a broad
    // line across the track. Each AI horse eases toward the rail when it has room; the traffic rules stop them
    // overlapping, so they stack into a narrow bunch. Lifted in the last 220 m so they can fan out and sprint.
    if (race.chaos && remain > 220) {
      this.laneCool -= dt;
      if (this.laneCool <= 0) {
        const cur = Math.round(h.targetLane);
        if (cur > 0 && race.canMove(h, cur - 1, this.margin * 0.4)) { h.targetLane = cur - 1; this.laneCool = 0.7 + 0.5 * this.rng(); }
        else this.laneCool = 0.4;
      }
      return;                                                         // hold the rail line: no wide tactical moves in the bunch
    }
    if (!race.chaos) for (const o of race.dnfs) {                      // normal racing: steer around a faller ahead (once seen — never in chaos)
      const dp = race.lapD(o.progress - h.progress);
      if (o.noAvoid && o.noAvoid.has(h)) continue;                     // was too close behind to react — committed to its line
      if (race.clock - o.stat.dnfT < this.react * 0.8) continue;
      if (dp > 0 && dp < 50 && Math.abs(o.laneF - h.laneF) < 2.2) {
        const cur = Math.round(h.targetLane), away = o.laneF < h.laneF ? cur + 1 : cur - 1;
        if (away >= 0 && away < NLANES && race.canMove(h, away, this.margin)) { h.targetLane = away; this.laneCool = 1.0; return; }
      }
    }
    this.laneCool -= dt; this.defendCool -= dt;
    const cur = Math.round(h.targetLane);
    const patT = (this.mode === "kick" ? lerp(0.25, 1.1, j.patience) : lerp(0.6, 4.5, j.patience)) * (this.persona === "rail rider" ? 1.5 : this.persona === "front-runner" ? 0.6 : 1);
    // stuck behind a slower horse: sitting in is fine for a while (it saves energy), then look for room
    if (h.blocked && h.blockedTime > patT) {
      const best = this.findGap(race, cur, this.mode === "kick" ? 10 : 6);
      if (best != null) { h.targetLane = best; this.laneCool = 1.2; this.checkT = 0; return; }
      if (h.blockedTime > patT + 1.2 && this.checkT <= 0 && this.rng() < 0.3 + 0.5 * j.tactics) this.checkT = 0.4 + 0.4 * this.rng();
      return;
    }
    // getting into the clear before launching the finishing run
    if ((this.mode === "kick" || (this.mode === "cruise" && remain < this.kickPoint * 1.35)) && this.laneCool <= 0 && race.roomAhead(h, h.laneF, 30) < 12) {
      const best = this.findGap(race, cur, 14);
      if (best != null) { h.targetLane = best; this.laneCool = 1.5; return; }
    }
    const rFB = race.route ? race.route.finalBend : FINAL_BEND, rHS = race.route ? race.route.homeStraight : HOME_STRAIGHT;
    if (remain < rFB + 40 && remain > rHS - 60 && this.finalBend(race, remain, cur)) return;
    if (this.laneCool > 0) return;
    if (this.wideBias > 0 && cur < NLANES - 1 && race.canMove(h, cur + 1, this.margin)) { h.targetLane = cur + 1; this.wideBias--; this.laneCool = 1.1; return; }
    // shut the door on a rival trying to come through on the inside (only before they get alongside)
    if (this.defendCool <= 0 && j.risk > 0.4 && cur > 0 && this.mode !== "early") {
      for (const o of race.horses) {
        if (o === h || o.finished) continue;
        const dp = o.progress - h.progress;
        if (dp < -(HORSE_LEN + 1.2 + Math.max(0, o.v - h.v) * 1.6) && dp > -11 && o.laneF < h.laneF - 0.6 && o.laneF > h.laneF - 1.6 && o.v > h.v + 0.2
            && race.corridorClear(h, cur - 1, HORSE_LEN + 0.6, HORSE_LEN + 1.2, false) && this.rng() < 0.35 * j.risk) {
          h.targetLane = cur - 1; this.defendCool = 7; this.laneCool = 1.5; return;
        }
      }
    }
    // find cover: stalkers, rail riders and closers would rather sit behind a horse (sheltered, settled) than race in
    // clear air — so the field forms packs and pockets instead of spreading evenly across the track
    this.coverCool -= dt;
    if (this.coverCool <= 0 && this.mode !== "kick" && this.persona !== "front-runner" && remain > rFB + 60 && !h.blocked) {
      this.coverCool = 1.1 + this.rng() * 1.3;
      if (race.roomAhead(h, cur, 14) > 10 && this.rng() < 0.5 + 0.4 * j.patience) {
        let best = null, bd = 1e9;
        for (const o of race.horses) { if (o === h || o.finished || o.fallen) continue; const dp = o.progress - h.progress, L = Math.round(o.laneF);
          if (dp > HORSE_LEN + 1 && dp < 10 && Math.abs(L - cur) === 1 && dp < bd) { bd = dp; best = L; } }
        if (best != null && (best < cur || this.persona !== "rail rider") && race.canMove(h, best, this.margin)) { h.targetLane = best; this.laneCool = 1.4; this.note("tucks in for cover", race); return; }
      }
    }
    // save ground by getting to the rail (more urgent before a bend); wide closers late prefer clear running
    if (cur > 0 && this.wideBias <= 0 && !(st.wide && this.mode === "kick")) {
      const turnSoon = race.route.isTurn(h.progress + 40);
      const p = st.rail * (turnSoon ? 0.9 : 0.4) * (0.5 + 0.5 * j.tactics) * (this.persona === "rail rider" ? 1.8 : this.persona === "stalker" ? 1.25 : this.persona === "closer" ? 0.8 : 1);
      if (this.rng() < p && race.canMove(h, cur - 1, this.margin) && race.roomAhead(h, cur - 1, 20) > 9) { h.targetLane = cur - 1; this.laneCool = 1.0; }
    }
  }
  // choose a lane with real running room, predicting whether the gap will still be there on arrival
  findGap(race, cur, minRoom) {
    const h = this.h, j = this.jk;
    let best = null, bs = -1e9;
    const opts = j.tactics > 0.5 ? [-1, 1, -2, 2] : [-1, 1];
    if (this.wideBias > 0 || this.st.wide) opts.push(3);
    const curRoom = race.roomAheadPred(h, cur, 40);
    const turnSoon = race.route.isTurn(h.progress + 30);
    const need = minRoom * (1.3 - 0.6 * j.passConf);
    for (const dl of opts) {
      const L = cur + dl;
      if (L < 0 || L > NLANES - 1) continue;
      if (!race.canMove(h, L, this.margin)) continue;
      const room = race.roomAheadPred(h, L, 40);
      if (room < need || room <= curRoom + 2) continue;
      const s = room - Math.abs(dl) * 4 - (dl > 0 ? (turnSoon ? 6 : 2) : 0) + (this.rng() - 0.5) * 10 * (1 - j.tactics);
      if (s > bs) { bs = s; best = L; }
    }
    return best == null ? null : race.gapCentre(h, best);
  }
}

/* =====================================================================
   RACE CONTROLLER
   ===================================================================== */
class Race {
  constructor(cfg) {
    this.cfg = cfg; this.dist = cfg.distance; this.hooks = cfg.hooks || {};
    this.incMode = cfg.incidents || "off";            // racing incidents: off · stumbles · full — the same rules for every runner
    this.events = []; this.dnfs = [];
    this.seed = cfg.seed != null ? cfg.seed : (Math.random() * 1e9) | 0;
    this.rng = mulberry32(this.seed);
    this.goingKey = GOING[cfg.going] ? cfg.going : "good";
    this.going = GOING[this.goingKey];
    this.trk = getTrack(cfg.track); this.route = this.trk.route(this.dist);
    this.startD = this.route.startD;                     // loop coordinate of the start (unwrapped; negative = in a chute)
    this.clock = 0; this.state = "load";  // load → count → running → done
    this.finishOrder = []; this.horses = [];
    const lanes = shuffle([...Array(cfg.field).keys()], this.rng);
    // riders: one (single-player) or several (multiplayer) humans first, AI jockeys fill the rest of the field
    // the human horse(s): roster index, or a full custom def (career mode) via cfg.playerDef
    const humanIdx = cfg.humans && cfg.humans.length ? cfg.humans.slice(0, 12) : [cfg.playerHorse];
    const humanDefs = cfg.playerDef ? [cfg.playerDef] : humanIdx.map(i => ROSTER[i]);
    const nh = cfg.allBots ? 0 : humanDefs.length;
    // opponents: from the roster, optionally scaled for a career difficulty tier (cfg.oppScale) so early fields are
    // beatable and feature-race fields are elite. A custom player isn't in the roster, so nothing is excluded for it.
    // cfg.oppDefs (career championship): the exact opponent horses — each AI stable's runner, already rated for the race
    let opps = Array.isArray(cfg.oppDefs) && cfg.oppDefs.length ? cfg.oppDefs.slice(0, cfg.field - humanDefs.length)
      : pickOpponents(cfg.playerDef ? [] : humanIdx, cfg.field - humanDefs.length, cfg.fixedOpponents, this.rng);
    if (!cfg.oppDefs && cfg.oppScale && cfg.oppScale !== 1) opps = opps.map(d => scaleDef(d, cfg.oppScale));
    const defs = humanDefs.concat(opps);
    defs.forEach((def, i) => {
      const h = new Horse(def, lanes[i], i < nh, this.dist, cfg.diff, this.going, this.rng, !!cfg.assist && i === 0 && !cfg.humans);
      h.id = i; h.cloth = i + 1;
      this.route.point(0, laneOff(h.laneF), h.pos);
      this.horses.push(h);
    });
    this.player = this.horses[0];
    this.humans = this.horses.slice(0, nh);
    /* CHAOS MODE: a completely normal race with one extra ability — each rider may kick the horse immediately
       alongside them over, once per race (P, with A/D choosing the side). The other difference is how riders treat a
       fallen horse: in chaos nobody steers or brakes around one (contact alone decides who comes down), while in a
       normal race the AI jockeys try to avoid the accident when they have time and room. Physics, speeds, stamina and
       AI strength are identical to a normal race. */
    this.chaos = !!cfg.chaos;
    if (cfg.unlimited && cfg.topSpeed && !this.player.bot && !cfg.humans) this.player.vmax = cfg.topSpeed / 3.6;   // unlimited mode (single-player only)
    const avg = f => this.horses.reduce((s, h) => s + f(h), 0) / this.horses.length;
    this.fieldStats = { end: avg(h => h.endN), spr: avg(h => h.sprintPow), vmax: avg(h => h.vmax) };
    this.emerg = 0; this.minSep = 99;
    this.initRec();
    this.gateCount = Math.max(...lanes) + 1;
    this.order = this.horses.slice();
    this.loadT = 0; this.countT = 0; this.breakDelay = 0; this.gatesOpen = false; this.falseStart = false;
    this.meter = { active: false }; this.meterT = 0;
    // start: a drifting sweet spot the rider tracks (hold Space = marker up), then a reaction to the gates
    const ph1 = this.rng() * 6, ph2 = this.rng() * 6;          // the same drifting sweet spot for every rider
    this.horses.forEach(h => { if (h.isPlayer) h.st = { z: 0.5, m: 0.35, mv: 0, R: 0.3, hold: false, t: 0, ph1, ph2, open: false, launched: false, rt: null, q: null, cat: null,
      zone: 0.085 + 0.05 * h.temper, aligned: false, alignedT: 0, trackT: 0 }; });
    this.st = this.horses[0].st || { z: 0.5, m: 0.35, R: 0, open: false, launched: true, ph1, ph2, t: 0 };
    this.msg450 = false; this.msg200 = false; this.msg400 = false;
    this.endT = 0;
    this.leader = null; this.leaderProgress = 0; this.leaderV = 0; this.leadChangeT = 0; this.leadChanges = 0;
    this.telT = 0; this.vT = 0;
    this.tel = { t: [], prog: this.horses.map(() => []), rank: this.horses.map(() => []), v: [], S: [], F: [], e: [], cmd: [] };
    this.pAhead = this.horses.map(() => false); this.playerSurge = false;
  }
  emit(type, a, b) { const f = this.hooks[type]; if (f) f(a, b, this); }
  lapD(d) { return this.trk.analytic ? lapDelta(d) : lapDeltaL(d, this.trk.lap); }
  rankOf(h) { return h.rank; }
  // is the path sideways into `lane` free right now (and not about to be cut off)?
  corridorClear(h, lane, ahead, behind, predictive) {
    if (lane < 0 || lane > NLANES - 1) return false;
    ahead = ahead == null ? HORSE_LEN + 0.6 : ahead; behind = behind == null ? HORSE_LEN + 0.6 : behind;
    const lo = Math.min(h.laneF, lane) - LAT_SEP + 0.05, hi = Math.max(h.laneF, lane) + LAT_SEP - 0.05;
    for (const o of this.horses) {
      if (o === h || o.finished || (o.fallen && this.chaos)) continue;   // chaos: riders don't path around fallen bodies
      if (Math.abs(o.laneF - h.laneF) < 0.5 && Math.abs(o.laneF - lane) >= LAT_SEP) continue;  // directly in line: not in the way
      if (o.laneF <= lo || o.laneF >= hi) continue;
      const dp = o.progress - h.progress;
      if (dp < ahead && dp > -behind) return false;
      if (predictive !== false && dp <= -behind && dp > -behind - 6 && o.v > h.v + 0.6) return false;
    }
    return true;
  }
  laneFree(h, lane) { return this.corridorClear(h, lane); }
  // predictive version for steering decisions: is there still a horse-sized gap in `lane` by the time we get there?
  canMove(h, lane, margin) {
    if (lane < 0 || lane > NLANES - 1) return false;
    if (!this.corridorClear(h, lane)) return false;
    margin = margin == null ? 1.0 : margin;
    const maxLat = (0.5 + 0.45 * h.agil) * Math.min(1, h.v / 7);
    const tMove = Math.abs(lane - h.laneF) / Math.max(0.25, maxLat) + 0.3;
    for (const o of this.horses) {
      if (o === h || o.finished || (o.fallen && this.chaos) || Math.abs(o.laneF - lane) >= LAT_SEP) continue;
      const dp = o.progress - h.progress, dpF = dp + (o.v - h.v) * tMove;
      if (dp >= 0) { if (Math.min(dp, dpF) < HORSE_LEN + margin) return false; }       // the gap ahead would close
      else if (Math.max(dp, dpF) > -(HORSE_LEN + margin)) return false;                  // a rival arriving from behind
    }
    return true;
  }
  // aim for the middle of the space around `lane` among the horses near us (continuous positioning, not lane centres)
  gapCentre(h, lane) {
    let lo = -1e9, hi = 1e9;
    for (const o of this.horses) {
      if (o === h || o.finished) continue;
      const dp = o.progress - h.progress; if (dp < -HORSE_LEN - 1 || dp > 9) continue;
      if (o.laneF <= lane && o.laneF > lo) lo = o.laneF; if (o.laneF > lane && o.laneF < hi) hi = o.laneF;
    }
    let t = lane;
    if (lo > -1e8 && hi < 1e8 && hi - lo >= 2 * LAT_SEP + 0.1) t = (lo + hi) / 2;
    else if (lo > -1e8) t = Math.max(lane, lo + LAT_SEP + 0.1);
    else if (hi < 1e8) t = Math.min(lane, hi - LAT_SEP - 0.1);
    return clamp(t, 0, NLANES - 1);
  }
  // running room in a lane, allowing for the horses ahead coming back to (or away from) us over the next 2 s
  roomAheadPred(h, lane, range) {
    let m = range || 40;
    for (const o of this.horses) {
      if (o === h || o.finished || Math.abs(o.laneF - lane) >= LAT_SEP) continue;
      const dp = o.progress - h.progress;
      if (dp > 0 && dp < range + 10) m = Math.min(m, Math.max(0, dp - HORSE_LEN + (o.v - h.v) * 2));
    }
    return m;
  }
  roomAhead(h, lane, range) {
    let m = range || 40;
    for (const o of this.horses) {
      if (o === h || o.finished) continue;
      if (Math.abs(o.laneF - lane) >= LAT_SEP) continue;
      const dp = o.progress - h.progress;
      if (dp > 0 && dp < m) m = dp;
    }
    return m;
  }
  startCountdown() { this.state = "count"; this.countT = 3.6; this.breakDelay = 0.6 + this.rng() * 1.2; }
  // the sweet spot drifts smoothly and unpredictably; holding Space lifts the marker, releasing lets it sink
  trackStart(dt) { for (const h of this.humans) if (!h.bot && h.st) this.trackOne(h.st, dt); }
  trackOne(S, dt) {
    S.t += dt;
    const zAt = t => clamp(0.5 + 0.26 * Math.sin(t * 0.95 + S.ph1) + 0.1 * Math.sin(t * 2.2 + S.ph2), 0.14, 0.86);
    S.z = zAt(S.t);
    S.mv += (S.hold ? 2.7 : -2.4) * dt; S.mv *= Math.pow(0.02, dt);                  // responsive, with a little momentum
    S.m += S.mv * dt;
    if (S.m < 0) { S.m = 0; S.mv = Math.max(0, S.mv); } if (S.m > 1) { S.m = 1; S.mv = Math.min(0, S.mv); }
    // online, the rider sees the sweet spot a little late; judge them against the one on their screen (bounded by the server)
    // and against the marker on their screen, which network jitter can put slightly off ours — trusted only within ±0.1
    // (jittery arrival of Space presses lets our copy drift; it's eased back toward theirs at a capped rate)
    if (S.mSeen != null) { const d = S.mSeen - S.m; if (Math.abs(d) > 0.06) S.m = clamp(S.m + clamp(d, -0.35 * dt, 0.35 * dt), 0, 1); }
    const mSeen = S.mSeen != null ? clamp(S.mSeen, S.m - 0.12, S.m + 0.12) : S.m;
    S.aligned = Math.abs(mSeen - (S.zLag ? zAt(S.t - S.zLag) : S.z)) < S.zone;
    S.R = clamp(S.R + (S.aligned ? 0.5 : -0.2) * dt, 0, 1);
    S.trackT += dt; if (S.aligned) S.alignedT += dt;
  }
  // outcome of a break from its quality q (0..1) and the time the horse was asked to go
  applyStart(h, q, rt) {
    const cat = startCategory(q), C = START_CATS[cat];
    h.startCat = cat; h.stat.startQ = C.label; h.stat.startScore = q; h.stat.reactT = rt;
    h.reactDelay = rt + C.delay; h.breakPow = C.bp; h.stumbleT = C.stumble;
    return cat;
  }
  // the rider's launch: reaction time since the gates opened, combined with how ready the horse was
  // rtIn: the rider's reaction time measured at their own screen (multiplayer), already bounded by the server
  launch(auto, h, rtIn) {
    const p = h || this.player, S = p.st; if (!S || S.launched || p.bot) return;
    S.launched = true; S.rt = rtIn != null ? rtIn : this.clock;
    const react = auto ? -0.5 : S.rt < 0.1 ? 0.15 : clamp(1 - (S.rt - 0.12) / 0.55, 0, 1);   // faster than a human can react = a guess; never reacting = left in the gate
    S.q = clamp(0.5 * S.R + 0.5 * react + 0.12 * (p.startAb - 0.7) + 0.05 * (p.temper - 0.7), 0, 1);
    S.cat = this.applyStart(p, S.q, S.rt);
    if (p === this.player) this.emit("start", S.cat, S.rt); else this.emit("startOther", S.cat, p);
    // network lag compensation: the horse leaves at its true reaction time, not when the message arrived
    if (rtIn != null && this.clock > p.reactDelay) {
      const lag = Math.min(0.5, this.clock - p.reactDelay); let n = Math.round(lag / SIM_DT);
      while (n-- > 0) p.step(SIM_DT, this);
    }
  }
  openGates() {
    this.gatesOpen = true; this.state = "running"; this.clock = 0;
    this.emit("gate");
    this.horses.forEach(h => {
      if (h.isPlayer) h.reactDelay = 99;                               // waits for the rider's launch (Race.launch)
      else {
        // rival riders get their own start: starting ability, skill, aggression, consistency — and luck
        const b = h.bot, j = b.jk, cons = j.consistency;
        const noise = (this.rng() + this.rng() + this.rng() - 1.5) * 0.42 * (1.25 - cons);
        let q = clamp(0.4 + 0.35 * (h.startAb - 0.5) + 0.25 * j.finish + 0.12 * b.breakAggro + 0.08 * (h.temper - 0.7) + noise, 0, 1);
        if (this.rng() < 0.015 + 0.06 * (1 - h.startAb) * (1.25 - cons)) q *= 0.3;     // anyone can miss the kick, favourites included
        const rt = 0.14 + 0.2 * (1 - h.startAb) + this.rng() * 0.12 * (1.3 - cons);
        const cat = this.applyStart(h, q, rt);
        h.botBreakQ = h.breakPow;
        if (cat === "MISSED" || cat === "SLOW") b.note(cat === "MISSED" ? "misses the break" : "slowly away", this);
      }
    });
    this.st.open = true; for (const h of this.humans) if (h.st) h.st.open = true;
    this.emit("msg", this.player.bot ? "THEY'RE OFF!" : "GO!", 1.0);
  }
  meterPin() { const u = this.meterT / 0.75; return 1 - Math.abs(1 - (u % 2)); }
  event(type, h, other, mag) {
    this.events.push({ t: this.clock, type, h, other: other || null, mag: mag || 0, at: Math.round(h.progress), rank: h.rank });
    this.emit("incident", type, h, other);
  }
  onFall(h) {
    this.dnfs.push(h); h.stat.dnfAt = Math.round(h.progress); h.stat.dnfT = this.clock;
    // a horse directly behind the fall and within 40 m when it happens has no time to react — it can't steer round or
    // pull up, just as in real life. It stays committed to its line and runs into the body (normal mode only; chaos
    // never avoids anyway). "Same path" = its body line crosses the fallen body's lateral extent.
    const fp = this.fallenFootprint(h);
    h.noAvoid = new Set(this.horses.filter(o => {
      if (o === h || o.fallen || o.finished || !o.started) return false;
      const dp = this.lapD((h.progress - NOSE_OFF) - (o.progress - NOSE_OFF));   // how far o is behind the body (+ = behind)
      if (dp <= 0 || dp > 40) return false;
      const dlm = (h.laneF - o.laneF) * LANE_W;
      return dlm + Math.max(fp.sTo, fp.sAway) > -0.55 && dlm + Math.min(fp.sTo, fp.sAway) < 0.55;   // o's line meets the body
    }));
    this.emit("fall", h);
    if (this.incMode === "full") this.bringDown(h);
  }
  /* The only fall that spreads without a new collision: a horse that goes down while physically leaning on the horse
     beside it takes that one horse over with it (they were already in contact — that contact caused the fall).
     Everything else comes from obstacles(): real overlap between a runner and a falling or fallen body. */
  bringDown(F) {
    if (!F.pushing) return;
    const side = F.fallDir;
    for (const o of this.horses) {
      if (o === F || o.fallen || o.finished || !o.started) continue;
      const dl = o.laneF - F.laneF;
      if (Math.abs(this.lapD(o.progress - F.progress)) > HORSE_LEN + 0.6) continue;   // bodies overlapping side by side
      if (dl * side > 0 && Math.abs(dl) < LAT_SEP + 0.35) {
        o.cause = "pushed over by " + F.def.name; o.stab = 0;
        this.event("collision", o, F, Math.max(1, o.v - F.v));
        o.fall(this, side, F.fallGen + 1, "side");
        return;                                                        // only the one horse being leaned on
      }
    }
  }
  // where a faller's jockey is: thrown clear over the shoulder, landing ≈2.7 m beyond the horse and ≈⅔ lane to the other side
  riderSpot(F) {
    const k = Math.min(1, F.fallT / 0.9);
    return { p: F.progress - NOSE_OFF + 2.7 * k, lane: clamp(F.laneF - F.fallDir * 0.65 * k, 0, NLANES - 1) };
  }
  activeCount() { return this.horses.length - this.dnfs.length; }
  /* Collision geometry (track coordinates, metres): every horse occupies a rectangle along the track — its length
     about its body centre and a lateral width about its lane line. A falling horse is solid from the first instant
     of its fall: its footprint grows from the standing shape to the lying one as the body goes down and rolls towards
     fallDir (legs out on that side), and it keeps sliding with the body. The thrown jockey becomes a second, smaller
     obstacle where they land. The simulation steps at 120 Hz, so a horse moves ≈0.15 m per step at racing speed —
     far less than any collider dimension — which makes the per-step overlap test effectively a swept test. */
  fallenFootprint(F) {
    const k = F.fallen ? Math.min(1, F.fallT / 0.9) : 0;              // how far the fall has developed
    return {
      c: F.progress - NOSE_OFF,                                        // body centre along the track
      q: HORSE_LEN / 2 + 0.45 * k,                                     // half length (sprawls out a bit more)
      sTo: (0.5 + 1.1 * k) * F.fallDir,                                // lateral extent towards the fall side: legs well out
      sAway: -(0.5 + 0.35 * k) * F.fallDir,                            // and a little past the body line the other way
    };
  }
  obstacles() {
    if (!this.dnfs.length) return;
    const HW = 0.45;                                                   // a running horse's half width (body + legs)
    for (const F of this.dnfs) {
      const fp = this.fallenFootprint(F), R = this.riderSpot(F);
      const sLo = Math.min(fp.sTo, fp.sAway), sHi = Math.max(fp.sTo, fp.sAway);
      for (const h of this.horses) {
        if (h === F || h.fallen || h.finished || !h.started) continue;
        const dp = this.lapD(fp.c - (h.progress - NOSE_OFF));           // body centre to body centre, even a lap later
        const dlm = (F.laneF - h.laneF) * LANE_W;                      // lateral centre distance in metres (+ = F on my outside)
        const hit = (h.hitObs && h.hitObs.includes(F)) ? 2 : 0;
        // 1. genuine contact with the body (at any point of the fall — it is solid from the first frame)
        if (!hit && Math.abs(dp) < fp.q + HORSE_LEN / 2 && dlm + sHi > -HW && dlm + sLo < HW) { this.hitFallen(h, F, false); continue; }
        // 2. genuine contact with the thrown jockey — once they're actually on the turf (≈0.75 s into the fall), and
        //    only for a horse whose front reaches them: a body landing behind your girth can't trip you forward
        const dR = this.lapD(R.p - (h.progress - NOSE_OFF)), dRl = (R.lane - h.laneF) * LANE_W;
        if (!hit && F.fallT > 0.75 && dR > -0.3 && dR < 0.85 + HORSE_LEN / 2 && Math.abs(dRl) < 0.3 + HW) { this.hitFallen(h, F, true); continue; }
        // 3. a hazard ahead — NORMAL RACING ONLY. In chaos nobody brakes or checks for a body: contact alone decides.
        if (this.chaos) continue;
        if (F.noAvoid && F.noAvoid.has(h)) continue;                   // too close behind when it fell: no time to pull up
        if (dp <= 0 || dp > 70 || dlm + sHi < -HW - 0.35 || dlm + sLo > HW + 0.35) continue;   // not in my path
        const seen = h.isPlayer ? false : this.clock - F.stat.dnfT > (h.bot ? h.bot.react * 0.8 : 0.6);
        if (!seen) continue;                                           // hasn't had time to react yet
        h.obsAhead = F;
        const cap = Math.sqrt(F.v * F.v + 2 * 4.2 * Math.max(0, dp - 6));   // pulling up as hard as a galloping horse can to stop short of it
        h.obsBrake = true;
        if (h.blockCap == null || cap < h.blockCap) { h.blockCap = cap; if (dp < h.frontGap) { h.front = F; h.frontGap = dp + HORSE_LEN; } }
      }
    }
  }
  hitFallen(h, F, rider) {
    (h.hitObs = h.hitObs || []).push(F);
    const rel = h.v - (rider ? 0 : F.v), side = Math.sign(h.laneF - F.laneF) || -F.fallDir || 1;
    h.cause = rider ? "galloping into " + F.def.name + "'s fallen jockey" : "running into " + F.def.name + " on the ground";
    this.event("collision", h, F, rel);
    // real contact at speed trips the horse: the front legs strike the body and it pitches over it
    if (this.incMode === "full" && rel > 0.5) { h.stab = 0; h.fall(this, side, (F.fallGen || 0) + 1, "trip"); }
    else if (this.incMode === "full") h.v = Math.min(h.v, F.v);        // barely moving faster: shoulders into it, no fall
    else if (this.incMode !== "off") { h.v = Math.min(h.v * 0.35, F.v + 3); h.stab = Math.max(0.16, h.stab - 0.5); h.stumble(this, 2); }
    else h.v = Math.min(h.v, F.v + 4);
  }
  onFinish(h) {
    this.finishOrder.push(h);
    if ((h.isPlayer && this.humans.every(x => x.finished || x.dnf || x === h)) || (this.cfg.allBots && this.finishOrder.length === 1) || (this.finishOrder.length === 1 && this.humans.length && this.humans.every(x => x.dnf))) this.rec.stopT = Math.min(this.rec.stopT, h.finishTime + 3.2);
    // photo finish: the horse just ahead crossed within a whisker
    const prev = this.finishOrder[this.finishOrder.length - 2];
    if (prev && h.finishTime - prev.finishTime < 0.06 && (this.finishOrder.length <= 3 || h.isPlayer || prev.isPlayer)) this.emit("photo", prev, h);
    this.emit("finish", h);
  }
  // traffic: lateral bounds (no merging into a rival) + following distance (no running through one)
  resolveTraffic() {
    const hs = this.horses, n = hs.length;
    for (const h of hs) { h.obsBrake = false; h.latMin = 0; h.latMax = NLANES - 1; h.blockCap = null; h.front = null; h.frontGap = 99; h.draft = false; }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = hs[i], b = hs[j];
      if (a.fallen || b.fallen) continue;
      const dp = b.progress - a.progress;
      let dl = b.laneF - a.laneF;
      const adp = Math.abs(dp), adl = Math.abs(dl);
      const win = HORSE_LEN + 0.5 + 0.35 * Math.abs(a.v - b.v);   // look slightly ahead/behind when closing
      if (adp < win) {
        if (adl < 1e-4) dl = a.id < b.id ? 1e-4 : -1e-4;
        if (dl > 0) { a.latMax = Math.min(a.latMax, Math.max(a.laneF, b.laneF - LAT_SEP)); b.latMin = Math.max(b.latMin, Math.min(b.laneF, a.laneF + LAT_SEP)); }
        else { a.latMin = Math.max(a.latMin, Math.min(a.laneF, b.laneF + LAT_SEP)); b.latMax = Math.min(b.latMax, Math.max(b.laneF, a.laneF - LAT_SEP)); }
        if (adl < LAT_SEP - 0.02 && adp < HORSE_LEN) {        // fallback only: ease apart if somehow overlapping
          if (!a.finished && !b.finished) { this.emerg++; this.emergLat = (this.emergLat || 0) + 1; this.minSep = Math.min(this.minSep, adl); if (this.dbg) this.dbg.push(["lat", Math.round(this.clock*10)/10, a.def.name, b.def.name, +dp.toFixed(2), +dl.toFixed(2), +a.latV.toFixed(2), +b.latV.toFixed(2), a.targetLane, b.targetLane]); }
          const push = 1.2 * SIM_DT;
          if (dl > 0) { a.laneF = Math.max(0, a.laneF - push); b.laneF = Math.min(NLANES - 1, b.laneF + push); }
          else { a.laneF = Math.min(NLANES - 1, a.laneF + push); b.laneF = Math.max(0, b.laneF - push); }
        }
      }
      if (adl < LAT_SEP) {
        const back = dp > 0 ? a : b, fr = dp > 0 ? b : a;
        if (adp < back.frontGap && !fr.finished) { back.frontGap = adp; back.front = fr; }
        if (adp > 2.6 && adp < 7 && adl < 0.6) back.draft = true;
      }
    }
    this.obstacles();
    for (const h of hs) {
      if (!h.front) continue;
      const gap = h.frontGap - HORSE_LEN;                     // clear space nose-to-tail
      // closing on a horse: the rider checks progressively, sooner the faster we are closing
      const closing = Math.max(0, h.v - h.front.v), look = 3.5 + closing * 2.2;
      const fv = h.front.v + Math.min(0, h.front.accel) * 0.7;   // anticipate a horse ahead that is checking
      if (gap < look + Math.max(0, -h.front.accel)) { const c = Math.max(0, fv + Math.max(0, gap - 0.9) * 0.9 - (gap < 0.9 ? (0.9 - gap) * 1.5 : 0)); h.blockCap = h.blockCap == null ? c : Math.min(h.blockCap, c); }   // never undoes braking for a faller
    }
  }
  enforceSpacing() {
    // hard guarantee: nobody's nose ends up inside the horse in front
    const hs = this.horses, n = hs.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = hs[i], b = hs[j];
      if (a.fallen || b.fallen) continue;
      if (Math.abs(a.laneF - b.laneF) >= LAT_SEP - 0.02) continue;
      const dp = b.progress - a.progress, adp = Math.abs(dp);
      if (adp >= HORSE_LEN - 0.05 || adp < 0.9) continue;     // only a genuine overlap; level horses are handled laterally
      const back = dp > 0 ? a : b, fr = dp > 0 ? b : a;
      if (back.finished) continue;
      this.emerg++; this.emergLon = (this.emergLon || 0) + 1; if (this.dbg) this.dbg.push(["lon", Math.round(this.clock*10)/10, back.def.name, fr.def.name, +dp.toFixed(2), +(b.laneF-a.laneF).toFixed(2), +back.v.toFixed(2), +fr.v.toFixed(2)]);
      back.progress = fr.progress - HORSE_LEN; back.v = Math.min(back.v, fr.v);
    }
  }
  updateOrder() {
    const fo = this.finishOrder;
    this.order = this.horses.slice().sort((a, b) => {
      if (a.dnf || b.dnf) return (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || b.progress - a.progress;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.progress - a.progress;
    });
    this.order.forEach((h, i) => h.rank = i + 1);
    const L = this.order[0];
    this.leaderProgress = L.progress; this.leaderV = L.v;
    if (L !== this.leader) {
      const prev = this.leader; this.leader = L;
      if (prev && this.clock > 6 && this.clock - this.leadChangeT > 2.5 && !L.finished) { this.leadChanges++; this.leadChangeT = this.clock; this.emit("lead", L, prev); this.events.push({ t: this.clock, type: "lead", h: L, other: prev, at: Math.round(L.progress) }); }
    }
  }
  telemetry(dt) {
    this.telT += dt;
    if (this.telT < 0.25) return;
    this.telT -= 0.25;
    const tl = this.tel, p = this.player;
    tl.t.push(this.clock);
    this.horses.forEach((h, i) => { tl.prog[i].push(h.progress); tl.rank[i].push(h.rank); });
    tl.v.push(p.v); tl.S.push(p.S); tl.F.push(p.F); tl.e.push(p.eAct); tl.cmd.push(p.effort);
    // overtakes made / places lost by the player
    for (const hp of this.humans.length ? this.humans : [p]) {
      const pa = hp.pAhead || (hp.pAhead = this.horses.map(() => false));
      if (this.clock > 3 && !hp.finished && !hp.dnf) {
        this.horses.forEach((o, i) => {
          if (o === hp || o.finished) return;
          const ah = hp.progress > o.progress;
          if (ah && !pa[i]) { hp.stat.overtakes++; if (this.clock > 8) this.events.push({ t: this.clock, type: "pass", h: hp, other: o, at: Math.round(hp.progress) }); }
          else if (!ah && pa[i]) hp.stat.lost++;
          pa[i] = ah;
        });
      } else this.horses.forEach((o, i) => pa[i] = hp.progress > o.progress);
    }
    this.pAhead = p.pAhead || this.pAhead;
    const k = tl.t.length;
    this.playerSurge = k > 16 && tl.rank[0][k - 17] - p.rank >= 2;
    // a big move: any horse gaining 3+ places in 8 s (one event per horse per 15 s)
    if (k > 32) this.horses.forEach((h, i) => {
      if (h.finished || h.dnf || (h.surgeT || -99) > this.clock - 15) return;
      if (tl.rank[i][k - 33] - h.rank >= 3) { h.surgeT = this.clock; this.events.push({ t: this.clock, type: "surge", h, at: Math.round(h.progress), mag: tl.rank[i][k - 33] - h.rank }); }
    });
    if (!this.finalEv && this.leader && this.dist - this.leader.progress <= RHYTHM_AT) { this.finalEv = true; this.events.push({ t: this.clock, type: "final", h: this.leader }); }
    if (k % 2 === 0) for (const h of this.horses) h.vPrev = h.v;
  }
  simStep(dt) {
    this.clock += dt;
    if (this.chaos) {                 // centre of the AI bunch, for the gentle pack regulator in Horse.step
      let sp = 0, n = 0;
      for (const h of this.horses) if (h.bot && h.started && !h.fallen && !h.finished) { sp += h.progress; n++; }
      this.packP = n ? sp / n : null;
    }
    if (this.cfg.unlimited && !this.player.bot) { const p = this.player; p.S = 100; p.F = 0; p.SR = 100; }   // setup option: your horse never tires
    for (const h of this.horses) if (h.bot && !h.finished && !h.fallen) {
      h.bot.timer -= dt;
      if (h.bot.timer <= 0) { const iv = h.bot.react * (0.8 + 0.4 * this.rng()); h.bot.timer = iv; h.bot.think(this, iv); }
    }
    for (const h of this.horses) if (h.bot) {
      h.bot.rhythm(dt, this);
      if (!h.finished && !h.fallen && this.dist - h.progress < 310) h.effort = Math.max(h.effort, 0.84);   // hard guarantee: nobody eases off near the line
    }
    this.resolveTraffic();
    for (const h of this.horses) h.step(dt, this);
    this.enforceSpacing();
    this.updateOrder();
    this.telemetry(dt);
    this.record();
  }
  /* ---- replay recorder: a 60 Hz circular buffer of every horse's state. Read-only: never touches the sim. ---- */
  initRec() {
    const cap = 60 * 20, H = this.horses.length;
    this.rec = { cap, n: 0, head: 0, k: 0, t: new Float64Array(cap), d: new Float64Array(cap * H * REC_F), stopT: Infinity };
    const capF = 20 * 330;
    this.recFull = { cap: capF, n: 0, k: 0, t: new Float32Array(capF), d: new Float32Array(capF * H * REC_F) };
  }
  record() {
    const R = this.rec;
    if (this.clock > R.stopT) return;
    R.k ^= 1; if (R.k) return;
    const i = R.head; R.t[i] = this.clock;
    let o = i * this.horses.length * REC_F;
    for (const h of this.horses) {
      const d = R.d;
      d[o] = h.progress; d[o + 1] = h.laneF; d[o + 2] = h.latV; d[o + 3] = h.v; d[o + 4] = h.phase;
      d[o + 5] = h.eAct; d[o + 6] = h.F; d[o + 7] = rideLevel(h); d[o + 8] = h.mom; d[o + 9] = h.accel; d[o + 10] = h.restrainLvl; d[o + 11] = h.relax;
      d[o + 12] = h.stumV; d[o + 13] = h.fallen ? h.fallT : 0;
      o += REC_F;
    }
    R.head = (i + 1) % R.cap; if (R.n < R.cap) R.n++;
    // the whole race at 20 Hz (Float32): highlights are cut from this, so they show exactly what happened
    const F = this.recFull; F.k = (F.k + 1) % 3;
    if (F.k === 0 && F.n < F.cap) {
      F.t[F.n] = this.clock; const H = this.horses.length;
      F.d.set(R.d.subarray(i * H * REC_F, (i + 1) * H * REC_F), F.n * H * REC_F); F.n++;
    }
  }
  fullSample(t, hi, out) {
    const F = this.recFull, H = this.horses.length; if (!F.n) return null;
    let lo = 0, h2 = F.n - 1;
    if (t <= F.t[0]) h2 = 0; else if (t >= F.t[F.n - 1]) lo = h2 = F.n - 1;
    else while (h2 - lo > 1) { const m = (lo + h2) >> 1; if (F.t[m] <= t) lo = m; else h2 = m; }
    const ta = F.t[lo], tb = F.t[h2], u = tb > ta ? (t - ta) / (tb - ta) : 0, oa = (lo * H + hi) * REC_F, ob = (h2 * H + hi) * REC_F;
    for (let f = 0; f < REC_F; f++) out[f] = F.d[oa + f] + (F.d[ob + f] - F.d[oa + f]) * u;
    return out;
  }
  recRange() { const R = this.rec; if (!R.n) return null; const first = (R.head - R.n + R.cap) % R.cap; return [R.t[first], R.t[(R.head - 1 + R.cap) % R.cap]]; }
  // linearly interpolated state of horse hi at race time t
  recSample(t, hi, out) {
    const R = this.rec, H = this.horses.length; out = out || new Float64Array(REC_F);
    if (!R.n) return null;
    const first = (R.head - R.n + R.cap) % R.cap, at = j => (first + j) % R.cap;
    let lo = 0, hi2 = R.n - 1;
    if (t <= R.t[at(0)]) hi2 = 0; else if (t >= R.t[at(R.n - 1)]) lo = hi2 = R.n - 1;
    else while (hi2 - lo > 1) { const m = (lo + hi2) >> 1; if (R.t[at(m)] <= t) lo = m; else hi2 = m; }
    const ia = at(lo), ib = at(hi2), ta = R.t[ia], tb = R.t[ib], u = tb > ta ? (t - ta) / (tb - ta) : 0;
    const oa = (ia * H + hi) * REC_F, ob = (ib * H + hi) * REC_F;
    for (let f = 0; f < REC_F; f++) out[f] = R.d[oa + f] + (R.d[ob + f] - R.d[oa + f]) * u;
    return out;
  }
  step(dt) {
    if (this.state === "load" || this.state === "count") this.trackStart(dt);
    if (this.state === "load") { this.loadT += dt; if (this.loadT > 2.6) this.startCountdown(); return; }
    if (this.state === "count") {
      this.meterT += dt;
      const prev = Math.ceil(this.countT);
      this.countT -= dt;
      const now = Math.ceil(this.countT);
      if (now !== prev && now > 0) { this.emit("msg", String(now), 0.9); this.emit("tick"); }
      if (this.countT <= 0) { this.breakDelay -= dt; if (this.breakDelay <= 0) this.openGates(); }
      return;
    }
    if (this.state !== "running") return;
    for (const h of this.humans) if (!h.bot && h.st && !h.st.launched && this.clock >= 1.1 + (h.lagAllow || 0)) this.launch(true, h);   // never reacted: the horse goes late on its own
    const p = this.player;
    if (!p.finished && !this.cfg.humans) {
      const rem = this.dist - p.progress;
      if (!this.msg450 && rem <= RHYTHM_AT) { this.msg450 = true; if (!p.bot) this.emit("msg", "FINAL DRIVE!", 1.6); }
      else if (!this.msg400 && rem <= 400) { this.msg400 = true; this.emit("toast", "FINAL 400M", "info"); }
      else if (!this.msg200 && rem <= 200) { this.msg200 = true; this.emit("msg", "FINAL FURLONG!", 1.2); }
    }
    this.simStep(dt);
    const allDone = this.finishOrder.length === this.activeCount();
    let humansDone = this.humans.length && this.humans.every(h => h.finished || h.dnf);
    // online, every rider down before the line: the race goes on (they spectate the leader) until an AI horse wins it
    if (humansDone && this.cfg.humans && !this.humans.some(h => h.finished) && !this.finishOrder.length && this.activeCount() > 0) humansDone = false;
    if (humansDone || (this.cfg.allBots && this.leader && this.leader.finished)) {
      this.endT += dt;
      const anyDnf = this.humans.some(h => h.dnf);
      if (this.endT > (anyDnf ? 4.2 : 2.6) || (allDone && !anyDnf)) this.complete();
    }
  }
  // after the player is home, run the rest of the field to the line off-screen for exact times
  complete() {
    let guard = 0;
    while (this.finishOrder.length < this.activeCount() && guard++ < 120 * 300) this.simStep(SIM_DT);
    this.horses.filter(h => !h.finished && !h.dnf).sort((a, b) => b.progress - a.progress).forEach(h => {
      h.finished = true; h.finishTime = this.clock + (this.dist - h.progress) / Math.max(h.v, 6); this.finishOrder.push(h);
    });
    this.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
    this.state = "done";
    this.emit("done");
  }
}
const REC_F = 14;   // progress, laneF, latV, v, phase, eAct, F, ride, mom, accel, restraint, relax, stumble (visual), fall time
// jockey posture 0 settle · 1 cruise · 2 urge · 3 drive (continuous), from what the rider is doing
function rideLevel(h) {
  let r;
  if (h.drive) r = 3;
  else if (h.urgeT > 0) r = 2.2;
  else if (h.eAct > 0.86) r = 2 + (h.eAct - 0.86) / 0.14 * 0.6;
  else if (h.eAct > 0.6) r = 1 + (h.eAct - 0.6) / 0.26;
  else r = h.eAct / 0.6;
  if (h.mom > 0.25 && h.raceDist - h.progress < RHYTHM_AT) r = Math.max(r, 2.2 + 0.8 * h.mom);
  return r;
}
// margin between two finishers (a ahead of b): seconds, metres (at b's finishing speed) and racing terms
function finishGap(a, b) {
  const dt = b.finishTime - a.finishTime, m = dt * Math.max(8, b.stat.finishV || b.v);
  return { dt, m, text: marginText(m), lengths: m / LEN_M };
}
// scale an opponent's attributes toward/away from elite, keeping its identity (name, look, style) — for career tiers
function scaleDef(def, k) {
  const a = def.attrs, out = {};
  for (const key in a) out[key] = Math.max(30, Math.min(99, Math.round(a[key] * k)));
  return Object.assign({}, def, { attrs: out, name: def.name });
}
function pickOpponents(playerIdx, n, fixed, rng) {
  const ex = Array.isArray(playerIdx) ? playerIdx : [playerIdx];
  const pool = ROSTER.map((r, i) => i).filter(i => !ex.includes(i));
  const chosen = fixed ? fixed.filter(i => !ex.includes(i)).slice(0, n) : shuffle(pool, rng).slice(0, n);
  return chosen.map(i => ROSTER[i]);
}
// distance between horses → racing terminology
function marginText(m) {
  const L = Math.abs(m) / LEN_M;
  if (L < 0.04) return "a nose";
  if (L < 0.09) return "a short head";
  if (L < 0.17) return "a head";
  if (L < 0.32) return "a neck";
  if (L < 0.62) return "half a length";
  if (L < 0.87) return "three-quarters of a length";
  if (L < 1.15) return "a length";
  if (L > 20) return "a distance";
  const q = Math.round(L * 4) / 4, whole = Math.floor(q), fr = q - whole;
  return (whole ? whole : "") + (fr === 0.25 ? "¼" : fr === 0.5 ? "½" : fr === 0.75 ? "¾" : "") + " lengths";
}

/* =====================================================================
   BALANCE TESTS — pure simulation, no rendering. In the browser console:
   runBalanceTests() · runFieldTests({n}) · runSprintTests({n}) · runStrategyTests({n})
   ===================================================================== */
// scripted riding for the "player" horse: effort plan by metres remaining
const PACING = {
  // every plan is expressed relative to the horse's efficiency zone (the band a player sees on the HUD)
  flatOut:     () => ({ e: 1, drive: true }),
  steady:      (rem, dist, h) => ({ e: h.comfort() + 0.02, drive: rem < 180 }),
  lateKick:    (rem, dist, h) => rem <= 400 ? { e: 1, drive: rem < 250 } : { e: h.comfort() - 0.04 },
  earlyAttack: (rem, dist, h) => rem > dist * 0.7 ? { e: h.comfort() + 0.12 } : rem <= 300 ? { e: 1, drive: rem < 200 } : { e: h.comfort() - 0.04 },
  midAttack:   (rem, dist, h) => rem <= dist * 0.5 ? (rem < 250 ? { e: 1, drive: true } : { e: h.comfort() + 0.1 }) : { e: h.comfort() - 0.05 },
  gradual:     (rem, dist, h) => ({ e: Math.min(1, h.comfort() - 0.1 + 0.3 * Math.pow(1 - rem / dist, 1.4)), drive: rem < 200 }),
  reactive:    (rem, dist, h, r) => {                     // sit close to the leader, cover moves, kick at 350 m
    if (rem <= 350) return { e: 1, drive: rem < 220 };
    const gap = r.leaderProgress - h.progress;
    return { e: clamp(h.comfort() + (gap > 6 ? 0.08 : gap < 1.5 ? -0.05 : 0.01) + (r.leaderV > h.v + 0.5 ? 0.06 : 0), 0.5, 0.93) };
  },
  tooLate:     (rem, dist, h) => rem <= 140 ? { e: 1, drive: true } : { e: h.comfort() - 0.1 },
};
// tap accuracy profiles for the final drive (null = never taps)
const TAPPING = {
  none: null,
  poor: rng => rng() * 0.45,
  average: rng => clamp(0.55 + (rng() + rng() - 1) * 0.5, 0, 1),
  good: rng => clamp(0.82 + (rng() + rng() - 1) * 0.28, 0, 1),
  perfect: () => 1,
};
// one complete race, start to last finisher. opts: distance, horse, diff, going, seed, field, pacing, tapping, opponents
function simRace(opts) {
  const scripted = !!opts.pacing;
  const r = new Race({ distance: opts.distance, field: opts.field || 10, diff: opts.diff || "medium", playerHorse: opts.horse || 0,
    seed: opts.seed, going: opts.going || "good", allBots: !scripted, fixedOpponents: opts.opponents || null, incidents: opts.incidents || "off" });
  r.state = "count"; r.openGates();
  const p = r.player, pace = scripted ? (typeof opts.pacing === "function" ? opts.pacing : PACING[opts.pacing]) : null;
  const tapF = scripted && opts.tapping ? TAPPING[opts.tapping] : null, trng = mulberry32((opts.seed || 1) ^ 0x5bd1e995);
  if (scripted) {
    if (opts.startEffort != null) p.effort = opts.startEffort;
    r.st.launched = true; r.applyStart(p, opts.startQ != null ? opts.startQ : 0.65, opts.react != null ? opts.react : 0.25);
  }
  let nextTap = 0, steerT = 0;
  while (r.finishOrder.length < r.horses.length && r.clock < 600) {
    if (scripted && !p.finished) {
      const rem = r.dist - p.progress, sp = pace(rem, r.dist, p, r);
      p.effort = sp.e; p.drive = !!sp.drive && p.started; p.settle = !!sp.settle; p.restrain = !!sp.restrain && p.started;
      if (sp.steer != null) { p.steerIn = sp.steer; p.steerAssist = opts.steerMode !== "advanced"; }
      if (tapF && rem <= RHYTHM_AT && r.clock >= nextTap) { p.tap(tapF(trng), r.clock); nextTap = r.clock + BEAT; }
      // basic human-like steering: come off a slower horse, and get clear before the drive
      if (opts.steer !== false && r.clock >= steerT) {
        steerT = r.clock + 0.3;
        const cur = Math.round(p.targetLane), wantOut = (p.blocked && p.blockedTime > 0.4) || (rem < 520 && r.roomAheadPred(p, cur, 30) < 10);
        if (wantOut && pace.steers !== true) {
          let best = null, bs = -1e9;
          for (const dl of [1, -1, 2, -2]) { const L = cur + dl; if (L < 0 || L >= NLANES || !r.canMove(p, L, 0.6)) continue; const room = r.roomAheadPred(p, L, 40) - Math.abs(dl) * 3 - (dl > 0 ? 1 : 0); if (room > bs) { bs = room; best = L; } }
          if (best != null && bs > 6) p.targetLane = best;
        }
      }
    }
    r.simStep(SIM_DT);
  }
  r.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
  return r;
}
// which of the brief's race situations actually emerged in this race (read from telemetry and jockey decisions)
function raceScenarios(r) {
  const tl = r.tel, k = tl.t.length, n = r.horses.length, fo = r.finishOrder, place = h => fo.indexOf(h) + 1;
  const sc = {};
  let duel = 0, frontFade = false;
  for (let i = 0; i < k; i++) {
    const pr = r.horses.map((h, j) => tl.prog[j][i]).sort((a, b) => b - a);
    if (pr[0] < r.dist * 0.45 && pr[0] - pr[1] < 1.5 && tl.t[i] > 8) duel++;
  }
  sc.earlyDuel = duel >= 24;                                                          // ≥ 6 s side by side for the early lead
  for (const h of r.horses) {
    const j = r.horses.indexOf(h);
    for (let i = 0; i < k; i++) {
      const prog = tl.prog[j][i]; if (prog < r.dist * 0.3 || prog > r.dist * 0.75) continue;
      let second = -1e9; for (let o = 0; o < n; o++) if (o !== j) second = Math.max(second, tl.prog[o][i]);
      if (prog - second > 3 * LEN_M && place(h) >= 4) { frontFade = true; break; }
    }
  }
  sc.leaderFaded = frontFade;                                                        // clear leader (3+ lengths) mid-race, finished 4th or worse
  const bots = r.horses.filter(h => h.bot), notes = bots.map(h => h.bot.log.join("|")).join("|");
  sc.slowStartRecovered = bots.some(h => h.bot.log.some(x => x.includes("slowly away")) && place(h) <= 4);
  sc.midfieldEarlyAttack = bots.some(h => (h.bot.role0 === "mid" || h.bot.role0 === "stalk") && h.bot.kickAt > h.bot.kick0 + 60);
  sc.closerFrom600 = bots.some(h => (h.def.style === "closer" || h.bot.role0 === "late" || h.bot.role0 === "hold") && h.bot.kickAt >= 560);
  sc.followedAMove = notes.includes("follows") || notes.includes("goes with");
  sc.refusedToYield = notes.includes("refuses to yield");
  sc.changedPlanInTraffic = notes.includes("switches out wide") || notes.includes("sits and waits");
  const kicks = bots.map(h => h.bot.kickAt).filter(x => x != null), km = kicks.reduce((a, b) => a + b, 0) / kicks.length;
  sc.kickSpreadM = Math.sqrt(kicks.reduce((a, b) => a + (b - km) * (b - km), 0) / kicks.length);
  const fast200 = r.horses.slice().sort((a, b) => (a.finishTime - a.stat.t200) - (b.finishTime - b.stat.t200))[0];
  sc.strongButTooLate = (fast200.def.style === "cons" || fast200.def.style === "closer" || (fast200.bot && (fast200.bot.role0 === "hold" || fast200.bot.role0 === "late"))) && place(fast200) >= 2 && place(fast200) <= 4;
  sc.sideBySideFinish = fo[1].finishTime - fo[0].finishTime < 0.15;
  sc.minLateEffort = Math.min(...bots.map(h => h.stat.minEffLate == null ? 1 : h.stat.minEffLate));
  return sc;
}
function raceStats(r) {
  const fo = r.finishOrder, w = fo[0], g12 = finishGap(fo[0], fo[1]);
  return {
    winner: w.def.name, style: w.def.style, role: w.bot ? w.bot.role0 : "player",
    margin: g12.dt, close015: g12.dt < 0.15, close05: g12.dt < 0.5, spread: fo[fo.length - 1].finishTime - w.finishTime,
    leadChanges: r.leadChanges, emerg: r.emerg, minSep: r.minSep,
    avgS: r.horses.reduce((s, h) => s + h.S, 0) / r.horses.length,
    changes: r.horses.reduce((s, h) => s + (h.bot ? h.bot.changes : 0), 0),
    playerPlace: fo.indexOf(r.player) + 1, playerTime: r.player.finishTime,
    sc: raceScenarios(r),
  };
}
function summarise(rows) {
  const n = rows.length, cnt = k => { const o = {}; rows.forEach(r => o[r[k]] = (o[r[k]] || 0) + 1); return o; };
  const pct = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v / n * 1000) / 10 + "%"]));
  const mean = k => rows.reduce((s, r) => s + r[k], 0) / n;
  return {
    races: n, winByHorse: pct(cnt("winner")), winByStyle: pct(cnt("style")), winByStartRole: pct(cnt("role")),
    avgWinMarginS: +mean("margin").toFixed(3), closeUnder015s: Math.round(rows.filter(r => r.close015).length / n * 100) + "%",
    closeUnder05s: Math.round(rows.filter(r => r.close05).length / n * 100) + "%", avgFieldSpreadS: +mean("spread").toFixed(1),
    avgLeadChanges: +mean("leadChanges").toFixed(2), avgStaminaLeft: +mean("avgS").toFixed(1),
    avgStrategyChangesPerRace: +mean("changes").toFixed(1),
    emergencyCorrectionsPerRace: +mean("emerg").toFixed(2), racesWithAnyCorrection: rows.filter(r => r.emerg > 0).length,
    minLateralSeparation: Math.min(...rows.map(r => r.minSep)).toFixed(2),
    scenarioFrequency: rows[0].sc ? Object.fromEntries(Object.keys(rows[0].sc).filter(k => typeof rows[0].sc[k] === "boolean").map(k => [k, Math.round(rows.filter(r => r.sc[k]).length / n * 100) + "%"])) : null,
    avgKickPointSpreadM: rows[0].sc ? +(rows.reduce((s, r) => s + r.sc.kickSpreadM, 0) / n).toFixed(0) : null,
    lowestBotEffortInFinal300m: rows[0].sc ? Math.min(...rows.map(r => r.sc.minLateEffort)).toFixed(2) : null,
  };
}
function runFieldTests(opts) {
  opts = opts || {};
  const rows = [], N = opts.n || 4;
  for (const diff of opts.diffs || ["easy", "medium", "hard"]) for (const dist of opts.dists || [1000, 1600, 2400, 3200])
    for (const going of opts.goings || ["good"]) for (let s = 0; s < N; s++)
      rows.push(Object.assign({ diff, dist, going }, raceStats(simRace({ distance: dist, horse: s % 12, diff, going, seed: 1000 + s * 17 + dist * 3 + diff.length }))));
  const out = summarise(rows);
  if (typeof console !== "undefined" && !opts.quiet) console.log(out);
  return out;
}
// same seed, same field, same pacing — only the rider's rhythm timing changes
function runSprintTests(opts) {
  opts = opts || {};
  const N = opts.n || 6, horse = opts.horse != null ? opts.horse : 4, dist = opts.dist || 1600, pacing = opts.pacing || "lateKick";
  const res = {};
  for (const tk of Object.keys(TAPPING)) {
    let t = 0, pl = 0, wins = 0;
    for (let s = 0; s < N; s++) { const r = simRace({ distance: dist, horse, diff: opts.diff || "medium", seed: 500 + s * 31, pacing, tapping: tk }); t += r.player.finishTime; pl += r.finishOrder.indexOf(r.player) + 1; if (r.finishOrder[0] === r.player) wins++; }
    res[tk] = { avgTime: +(t / N).toFixed(2), avgPlace: +(pl / N).toFixed(2), wins };
  }
  for (const k in res) res[k].vsNone = +(res[k].avgTime - res.none.avgTime).toFixed(2);
  if (typeof console !== "undefined" && !opts.quiet) console.table(res);
  return res;
}
function runStrategyTests(opts) {
  opts = opts || {};
  const N = opts.n || 4, out = [];
  for (const [hi, label] of opts.types || [[0, "Sprinter"], [4, "All-rounder"], [2, "Finisher"], [1, "Stayer"]])
    for (const dist of opts.dists || [1000, 1600, 2400, 3200]) {
      const row = { horse: label, dist };
      const sc = Object.keys(PACING).map(k => {
        let pl = 0, t = 0;
        for (let s = 0; s < N; s++) { const r = simRace({ distance: dist, horse: hi, diff: opts.diff || "medium", seed: 900 + s * 13 + dist, pacing: k, tapping: "average" }); pl += r.finishOrder.indexOf(r.player) + 1; t += r.player.finishTime; }
        return { k, pl: pl / N, t: t / N };
      }).sort((a, b) => a.t - b.t);
      sc.forEach((x, i) => row[x.k] = (i === 0 ? "★ " : "") + x.pl.toFixed(1));
      row.best = sc[0].k; out.push(row);
    }
  if (typeof console !== "undefined" && !opts.quiet) console.table(out);
  return out;
}
// solo time trials (no traffic): what each pacing plan is worth on its own
function timeTrial(horseIdx, dist, strat, going) {
  const r = new Race({ distance: dist, field: 1, diff: "hard", playerHorse: horseIdx, fixedOpponents: [], seed: 7, going: going || "good" });
  const h = r.horses[0];
  r.state = "running"; h.reactDelay = 0.15; h.breakT = 2; h.breakPow = 0.6;
  let nextTap = 0;
  while (!h.finished && r.clock < 900) {
    const rem = dist - h.progress, sp = strat(rem, dist, h, r);
    h.effort = sp.e; h.drive = !!sp.drive;
    if (rem <= RHYTHM_AT && r.clock >= nextTap) { h.tap(0.75, r.clock); nextTap = r.clock + BEAT; }
    r.simStep(SIM_DT);
  }
  return { t: h.finishTime, S: h.S, F: h.F, SR: h.SR };
}
function runBalanceTests(opts) {
  opts = opts || {};
  const types = opts.types || [[0, "Sprinter"], [4, "All-rounder"], [2, "Closer"], [1, "Stayer"]];
  const dists = opts.dists || [1000, 1600, 2400, 3200];
  const rows = [];
  for (const [hi, label] of types) for (const dist of dists) {
    const res = Object.entries(PACING).map(([k, f]) => ({ k, ...timeTrial(hi, dist, f) })).sort((a, b) => a.t - b.t);
    const best = res[0].t;
    const row = { horse: label, dist };
    res.forEach(r => row[r.k] = (r.t - best < 0.005 ? "★ " : "+") + (r.t - best).toFixed(2) + "s S" + r.S.toFixed(0));
    rows.push(row);
  }
  if (typeof console !== "undefined" && console.table && !opts.quiet) console.table(rows);
  return rows;
}
// settle / check / steer / start: does each technique matter, and can any of them be exploited?
function runRidingTests(opts) {
  opts = opts || {};
  const N = opts.n || 8, out = {};
  const base = PACING.reactive;
  const variants = {
    reactive: base,
    reactiveSettled: (rem, dist, h, r) => { const sp = base(rem, dist, h, r); sp.settle = rem > 400 && sp.e <= h.comfort() + 0.04; return sp; },
    midfieldThenKick: (rem, dist, h, r) => rem <= 450 ? { e: 1, drive: rem < 260 } : { e: h.comfort() - 0.02 },
    midfieldSettledThenKick: (rem, dist, h, r) => rem <= 450 ? { e: 1, drive: rem < 260 } : { e: h.comfort() - 0.02, settle: rem > 520 },
    pressingUnsettled: (rem, dist, h, r) => rem <= 400 ? { e: 1, drive: rem < 250 } : { e: h.comfort() + 0.05 },
    pressingSettled: (rem, dist, h, r) => rem <= 400 ? { e: 1, drive: rem < 250 } : { e: h.comfort() + 0.05, settle: rem > 480 },
    midfieldKick550: (rem, dist, h, r) => rem <= 550 ? { e: 1, drive: rem < 300 } : { e: h.comfort() - 0.02 },
    midfieldSettledKick550: (rem, dist, h, r) => rem <= 550 ? { e: 1, drive: rem < 300 } : { e: h.comfort() - 0.02, settle: rem > 640 },
    settleWhileFlatOut: (rem, dist, h, r) => ({ e: 1, drive: true, settle: true }),
    flatOut: () => ({ e: 1, drive: true }),
    checkSpam: (rem, dist, h, r) => { const sp = base(rem, dist, h, r); sp.restrain = rem > 400 && (r.clock % 3) < 0.4; return sp; },
    checkWhenClosing: (rem, dist, h, r) => { const sp = base(rem, dist, h, r); sp.restrain = rem > 300 && h.front && h.frontGap - HORSE_LEN < 1.6 && h.v > h.front.v + 0.4; return sp; },
  };
  const horses = opts.horses || [0, 4, 9, 6];
  for (const [k, f] of Object.entries(variants)) {
    let t = 0, pl = 0, S = 0, keen = 0, n = 0, em = 0;
    for (const hi of horses) for (let s = 0; s < N; s++) {
      const r = simRace({ distance: opts.dist || 1600, horse: hi, diff: "medium", seed: 3100 + s * 37 + hi, pacing: f, tapping: "average" });
      t += r.player.finishTime; pl += r.finishOrder.indexOf(r.player) + 1; S += r.player.S; keen += r.player.stat.keenT; em += r.emerg; n++;
    }
    out[k] = { avgTime: +(t / n).toFixed(2), avgPlace: +(pl / n).toFixed(2), staminaLeft: +(S / n).toFixed(1), keenSeconds: +(keen / n).toFixed(1), emergencies: em };
  }
  for (const k in out) out[k].vsReactive = +(out[k].avgTime - out.reactive.avgTime).toFixed(2);
  if (typeof console !== "undefined" && !opts.quiet) console.table(out);
  return out;
}
/* ---------- Rider controls ----------
   What a rider can ask of their horse. Single-player calls these with the keyboard; the multiplayer server calls them
   with each player's network input — the same rules for both. inp: { effort 0..1 (target), steer -1|0|1, settle,
   check, drive, hold (Space held before the off), adv (advanced steering) } */
function applyRiderInput(race, h, inp, dt) {
  if (!h || h.bot || h.fallen) return;
  if (h.st) h.st.hold = !!inp.hold && (race.state === "load" || race.state === "count");
  if (inp.effort != null && Number.isFinite(inp.effort)) {          // effort moves at the same rate as holding W/S
    const want = clamp(inp.effort, 0, 1);
    h.effort += clamp(want - h.effort, -0.6 * dt, 0.5 * dt);
  }
  h.drive = !!inp.drive && h.started && !h.finished;
  h.settle = !!inp.settle && !inp.check;
  h.restrain = !!inp.check && h.started && !h.finished;
  h.steerAssist = !inp.adv;
  h.steerIn = race.state === "running" && h.started && !h.finished ? clamp(inp.steer | 0, -1, 1) : 0;
}
// Space: the reaction at the gates, then urging, then the final-drive rhythm taps. tSeen: the race time the rider was
// looking at when they pressed (multiplayer); rt: their reaction at the gates as measured on their screen.
/* CHAOS MODE kick (P, with A/D or the arrows choosing the side): the rider lashes out with a boot at the horse
   immediately alongside. ONE kick per rider per race — used whether it lands or misses. It connects only against a
   horse genuinely in reach of a jockey's leg: bodies overlapping along the track (|Δprogress| ≤ 1.2 m) and the right
   lateral distance away (1.0–2.1 m centre to centre; horses race no closer than ≈1.75 m apart). A horse too far
   ahead, too far behind, too wide or on the wrong side is a miss. The kick touches nobody but the target: anything
   that happens afterwards comes from other horses physically hitting the falling body. */
const KICK_LONG = 1.2, KICK_LAT_LO = 1.0, KICK_LAT_HI = 2.1;   // metres
function riderKick(race, h, side) {
  if (!race.chaos || !h || h.bot || h.fallen || h.finished || !h.started || race.state !== "running") return null;
  if (h.kickUsed) return { ok: false, why: "used" };
  side = side > 0 ? 1 : side < 0 ? -1 : 0;                      // 0 = no side held: either side counts
  let best = null, bs = 1e9;
  for (const o of race.horses) {
    if (o === h || o.fallen || o.finished || !o.started) continue;
    const dp = o.progress - h.progress, dlm = (o.laneF - h.laneF) * LANE_W;
    if (Math.abs(dp) > KICK_LONG) continue;                     // not alongside: the boot can't reach ahead or behind
    if (Math.abs(dlm) < KICK_LAT_LO || Math.abs(dlm) > KICK_LAT_HI) continue;
    if (side !== 0 && Math.sign(dlm) !== side) continue;        // wrong side
    const sc = Math.abs(dlm) + Math.abs(dp);
    if (sc < bs) { bs = sc; best = o; }
  }
  if (!best) { race.event("kickMiss", h, null, 0); race.emit("kick", h, null); return { ok: false, why: "miss", side }; }   // no horse in reach: the kick is NOT used up
  h.kickUsed = true;                                            // it connected — this was the rider's one kick
  const dir = Math.sign(best.laneF - h.laneF) || 1;             // knocked over away from the kicker
  best.cause = "kicked over by " + h.def.name; best.stab = 0;
  race.event("kick", best, h, 1);
  race.emit("kick", h, best);
  best.fall(race, dir, 0, "side");                              // a connected kick always brings the target down
  return { ok: true, target: best, side: dir };
}
function riderPress(race, h, opt) {
  opt = opt || {};
  if (!h || h.bot || h.fallen || race.state !== "running") return null;
  if (h.st && !h.st.launched) { h.st.hold = false; race.launch(false, h, opt.rt); return { kind: "launch", cat: h.st.cat, rt: h.st.rt }; }
  if (race.clock < 1.6) return null;                                   // no urging while the horse jumps
  if (!h.finished && h.started && (race.dist - h.progress) <= RHYTHM_AT) {
    const back = opt.tSeen != null ? clamp(race.clock - opt.tSeen, 0, h.rhythmT) : 0;
    const pinT = h.rhythmT - back, u = (pinT / (RHYTHM_PERIOD / 2)) % 2, pin = u < 1 ? u : 2 - u;
    const a = Math.max(0, 1 - Math.abs(pin - 0.5) / 0.3), lv0 = momLevel(h.streak);
    const res = h.tap(a, race.clock - back);
    return { kind: "tap", res, a, lv0, lv: momLevel(h.streak), streak: h.streak, missRun: h.missRun };
  }
  if (!h.finished && h.started) { h.urgeT = 0.7; h.urgeHeat += 1; h.stat.urges++; return { kind: "urge", heat: h.urgeHeat }; }
  return null;
}
const SIM_EXPORTS = { runRidingTests, simRace, raceStats, summarise, runSprintTests, runStrategyTests, PACING, TAPPING, finishGap, rideLevel, makeJockey, BEAT, NOSE_OFF, momLevel, MOM_NAMES };
/*@sim-end*/
// Node (multiplayer server, tests): export the simulation. In a browser this file is a plain script and the
// declarations above are shared globals.
if (typeof module !== "undefined" && module.exports) module.exports = { Race, Horse, Bot, ROSTER, DISTANCES, GOING, DIFF, SIM_DT, REC_F, RHYTHM_AT, RHYTHM_PERIOD, HORSE_LEN, NOSE_OFF: typeof NOSE_OFF !== "undefined" ? NOSE_OFF : null, START_CATS, KNACK, rideLevel, finishGap, momLevel, applyRiderInput, riderPress, riderKick, scaleDef, DIST_LABEL, clamp, SIM_EXPORTS, racePhase, isTurn, LEN_M, HOME_STRAIGHT, FINAL_BEND, marginText, TRACKS, TRACK_DEFS, getTrack, trackPoint, laneOff, T, FINISH_D, NLANES, LANE_W };
