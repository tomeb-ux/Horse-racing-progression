'use strict';
/* =====================================================================
   FINAL FURLONG — PERFLAB: lean racing-smoothness diagnostics (Phase 15A; ROADMAP_P15.md §2.1, log in PROGRESS_P15.md)
   Hidden, off by default, and it changes nothing about how the game plays or looks. It exists to gather evidence about the racing micro-stutter on real devices.

   • F8 overlay (existing) gains: the detected display refresh interval, on-time frame %, longest frame, hitches per minute (this window and this race), the last hitch.
     A HITCH is a frame interval longer than max(1.5 × refresh interval, refresh interval + 4 ms); "on-time" = every frame that is not a hitch.
   • HITCH LOG: every hitch with the time, the race distance, JS / simulation / render-submit time of that frame and the one before (a long interval whose JS time
     was short means the time went elsewhere: GPU, compositor, browser), and the events of the frame: AUTO / applyQuality() changes, scene transitions,
     setAtmosphere / envFor, and changes in the GPU geometry / texture / shader-program counts.
   • SHIFT+F8: performance report as selectable text (Copy button; if the clipboard is blocked in the artifact sandbox the text is selected for Ctrl/Cmd+C) with the hidden lab and benchmark.
   • LAB (ff_lab; defaults = the normal game; nothing here touches the saved quality settings or ff_autoLevel):
       AUTO graphics: normal / race frames only / off (fixed High)      Farm GPU resources: retained / parked while racing
       Race lighting: normal / forced afternoon-clear                  Commentary: normal / off
   • BENCHMARK: a fixed all-bot race (Randwick · 1,600 m · 12 runners · seed 11 · chase camera), measured for 60 s after the gates open; straight away, or after 60 s on the
     farm showcase. The look (afternoon clear / golden hour / rain) is a benchmark parameter.
   Cost: with F8 and the benchmark off, the per-frame cost is ONE property read (PERFLAB.rec); the rare events (a quality change, a look change, a scene change) are noted either way.
   ===================================================================== */
const PERFLAB = (() => {
  const BUILD = "15A";
  const T0 = performance.now();
  const DEF = { auto: "normal", park: "retain", light: "normal", comm: "normal" };
  const CHOICES = { auto: ["normal", "race", "off"], park: ["retain", "park"], light: ["normal", "clear"], comm: ["normal", "off"] };
  const lab = Object.assign({}, DEF);
  try { const s = JSON.parse(localStorage.getItem("ff_lab") || "null"); if (s && typeof s === "object") for (const k in DEF) if (CHOICES[k].includes(s[k])) lab[k] = s[k]; } catch (e) {}
  const labActive = () => Object.keys(DEF).filter(k => lab[k] !== DEF[k]);
  // only written when something differs from the defaults (so a player who never opens the lab never gets a key)
  function saveLab() { try { if (labActive().length) localStorage.setItem("ff_lab", JSON.stringify(lab)); else localStorage.removeItem("ff_lab"); } catch (e) {} }
  function applyLab() {
    if (typeof GFX === "undefined") return;
    const was = GFX.AUTO.lab; GFX.AUTO.lab = lab.auto;
    if (was !== lab.auto && (lab.auto === "off" || was === "off")) { try { GFX.applyQuality(); } catch (e) {} }   // "off" = fixed High: apply the render scale / shadows at once (and back again)
  }
  try { if (typeof GFX !== "undefined") GFX.AUTO.lab = lab.auto; } catch (e) {}                    // a plain property: safe while this file is still initialising

  // ------------------------------------------------------------------ small helpers
  const $q = id => document.getElementById(id);
  const num = (v, d) => (v == null || !isFinite(v)) ? "—" : v.toFixed(d == null ? 1 : d);
  const sgn = v => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v);
  const sinceLoad = () => (performance.now() - T0) / 1000;
  const raceDist = () => { try { return race && race.player ? Math.round(race.player.progress) : null; } catch (e) { return null; } };
  const gpuNow = () => { try { const i = renderer.info; return { geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs ? i.programs.length : 0 }; } catch (e) { return { geo: 0, tex: 0, prog: 0 }; } };
  const farmState = () => { try { return typeof FARM === "undefined" ? { built: false, parked: false } : { built: !!FARM.built, parked: !!FARM.parked, active: !!FARM.active, showcase: !!FARM.showcase }; } catch (e) { return { built: false, parked: false }; } };

  // ------------------------------------------------------------------ event log (rare events: always noted; ≤ a few dozen a session)
  const EV = [], EC = {};                                   // EC = counters per kind
  function ev(kind, info) {
    EC[kind] = (EC[kind] || 0) + 1;
    EV.push({ t: performance.now(), f: typeof frameN === "number" ? frameN : 0, k: kind, s: info || "", d: raceDist() });
    if (EV.length > 400) EV.splice(0, 100);
  }

  // ------------------------------------------------------------------ display refresh estimate
  const STD_HZ = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  const scratch = new Float32Array(300);
  let refresh = 0;                                           // ms; 0 until estimated (then the thresholds assume 60 Hz)
  // the refresh interval is read from the FASTEST frames the page manages (the lower-middle of the sorted intervals), snapped to a standard rate when within 4 %.
  // Limitation: a device that never reaches its display rate reads as the rate it does reach.
  function estimateRefresh() {
    const n = PERF.fn; if (n < 60) return;
    const a = scratch.subarray(0, n); a.set(PERF.ft.subarray(0, n)); a.sort();
    let lo = 0; while (lo < n && a[lo] < 3) lo++;
    const m = n - lo; if (m < 40) return;
    const est = a[(lo + Math.floor(m * 0.05) + lo + Math.floor(m * 0.45)) >> 1], hz = 1000 / est;
    let r = est; for (const h of STD_HZ) if (Math.abs(hz - h) / h < 0.04) { r = 1000 / h; break; }
    refresh = r;
  }
  const ref = () => refresh || 16.667;
  const thresh = () => Math.max(1.5 * ref(), ref() + 4);
  const hzLabel = () => refresh ? `${(1000 / refresh).toFixed(0)} Hz (${refresh.toFixed(2)} ms)` : "measuring…";

  // ------------------------------------------------------------------ segments: stats per race (from the gates opening), per farm / menu stretch
  const CAP = 18000;
  let seg = null; const HIST = [];
  const HL = [];                                             // the hitch log
  let prevJs = 0, lg = -1, lt = -1, lp = -1, hz4 = 0;
  function keyNow() {
    const st = ui.state;
    if (typeof PRESENT !== "undefined" && PRESENT.mode) return "presentation";
    if (st === "racing" && race) return race.state === "running" ? "race" : race.state === "done" ? "finish" : "pre-race";
    if (st === "farm") return "farm";
    if (st === "replay") return "replay";
    if (typeof FARM !== "undefined" && FARM.showcase && !race) return "menu";
    return "other";
  }
  function openSeg(key) {
    seg = { key, n: 0, secs: 0, hit: 0, over50: 0, max: 0, maxAt: null, gaps: 0, ft: new Float32Array(CAP), raceRef: key === "race" ? race : null, at: sinceLoad(),
      clk0: key === "race" ? race.clock : null, d0: raceDist(), auto0: autoChanges(), ec0: Object.assign({}, EC), gpu0: gpuNow(), farm0: farmState(), look: null };
    if (key === "race") { try { seg.look = race.cfg.career && race.cfg.career.tod ? race.cfg.career.tod + "/" + race.cfg.career.wx : "afternoon/clear (Quick Race)"; } catch (e) {} }
  }
  const autoChanges = () => { try { return GFX.AUTO.changes; } catch (e) { return 0; } };
  function summary(sg, lite) {
    const m = Math.min(sg.n, CAP), a = lite ? null : sg.ft.slice(0, m).sort(), q = p => (m && a) ? a[Math.min(m - 1, Math.floor(m * p))] : 0;
    const ec = {}; for (const k in EC) { const d = EC[k] - (sg.ec0[k] || 0); if (d) ec[k] = d; }
    const gpu1 = sg.gpu1 || gpuNow();
    return { segment: sg.key, look: sg.look || null, startedAtS: +sg.at.toFixed(1), seconds: +sg.secs.toFixed(1), frames: sg.n, onTimePct: sg.n ? +(100 * (sg.n - sg.hit) / sg.n).toFixed(2) : null,
      hitches: sg.hit, hitchesPerMin: sg.secs > 1 ? +(sg.hit * 60 / sg.secs).toFixed(2) : null, longestMs: +sg.max.toFixed(1), longestAtM: sg.maxAt, framesOver50ms: sg.over50, medianMs: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), p99Ms: +q(0.99).toFixed(2),
      gaps: sg.gaps, autoLevelChanges: autoChanges() - sg.auto0, events: ec, gpuAtStart: sg.gpu0, gpuAtEnd: gpu1, raceDistFromM: sg.d0 };
  }
  function closeSeg() { if (!seg) return; seg.gpu1 = gpuNow(); if (seg.n > 30) { HIST.push(summary(seg)); if (HIST.length > 14) HIST.shift(); } seg = null; }

  // ------------------------------------------------------------------ per-frame recording (only while P.rec)
  function frame(rawDt, jsMs) {
    const ms = rawDt * 1000;
    if ((hz4 -= rawDt) <= 0) { hz4 = 0.25; estimateRefresh(); }
    const k = keyNow(), thr = thresh();
    if (!seg || seg.key !== k || (k === "race" && seg.raceRef !== race)) { closeSeg(); openSeg(k); if (k === "race") ev("race", "gates open"); }
    if (ms > 1500 || document.hidden) { seg.gaps++; prevJs = jsMs; return; }       // tab was in the background / the browser stalled for seconds: not a frame to judge
    // watch the GPU counts (geometries, textures, shader programs): a change at a given frame is logged as an event of that frame
    const mi = renderer.info, g = mi.memory.geometries, t = mi.memory.textures, pg = mi.programs ? mi.programs.length : 0;       // (no allocation per frame)
    if (lg >= 0 && (g !== lg || t !== lt || pg !== lp)) ev("gpu", `geometries ${sgn(g - lg)} · textures ${sgn(t - lt)} · shader programs ${sgn(pg - lp)}  (now ${g} / ${t} / ${pg})`);
    lg = g; lt = t; lp = pg;
    seg.ft[seg.n % CAP] = ms; seg.n++; seg.secs += rawDt;
    if (ms > seg.max) { seg.max = ms; seg.maxAt = raceDist(); }
    if (ms > 50) seg.over50++;
    if (ms > thr) { seg.hit++; hitch(ms, jsMs, k); }
    prevJs = jsMs;
    if (B.on) benchTick();
  }
  function hitch(ms, jsMs, k) {
    const f = typeof frameN === "number" ? frameN : 0, es = [];
    for (let i = EV.length - 1; i >= 0 && EV[i].f >= f - 1; i--) es.push(EV[i].k + ": " + EV[i].s + (EV[i].f < f ? " (previous frame)" : ""));
    es.reverse();
    let clk = null; try { if (race && k === "race") clk = +race.clock.toFixed(1); } catch (e) {}
    HL.push({ at: +((performance.now() - T0) / 1000).toFixed(2), ms: +ms.toFixed(1), seg: k, dist: raceDist(), clock: clk, js: +jsMs.toFixed(1), jsPrev: +prevJs.toFixed(1), sim: +PERF.sim.toFixed(1), render: +PERF.render.toFixed(1),
      hint: prevJs < ms * 0.4 ? "JS was short: time went elsewhere (GPU / compositor / browser)" : "JS-heavy frame", events: es });
    if (HL.length > 200) HL.shift();
  }

  // ------------------------------------------------------------------ F8 overlay lines
  function overlay(lines) {
    const n = PERF.fn; if (!n) return;
    const thr = thresh(); let sum = 0, hit = 0, mx = 0;
    for (let i = 0; i < n; i++) { const v = PERF.ft[i]; sum += v; if (v > thr) hit++; if (v > mx) mx = v; }
    const secs = sum / 1000, L = [];
    L.push(`display ${hzLabel()} · hitch = frame > ${thr.toFixed(1)} ms`);
    L.push(`last ${secs.toFixed(1)} s: on-time ${(100 * (n - hit) / n).toFixed(1)} %   hitches ${hit} (${(hit * 60 / Math.max(0.5, secs)).toFixed(1)}/min)   longest ${mx.toFixed(1)} ms`);
    if (seg && seg.n > 1) {
      const s = summary(seg, true), where = seg.key === "race" ? `this race (gates +${num(race.clock, 0)} s @ ${raceDist()} m)` : seg.key === "pre-race" ? "before the gates" : seg.key;
      L.push(`${where}: ${s.seconds} s · on-time ${num(s.onTimePct)} % · hitches ${s.hitches}${s.hitchesPerMin != null ? " (" + s.hitchesPerMin + "/min)" : ""} · longest ${s.longestMs} ms · >50 ms: ${s.framesOver50ms}`);
    }
    const h = HL[HL.length - 1]; if (h) L.push(`last hitch: ${h.ms} ms at ${num(h.at, 1)} s${h.dist != null ? " · " + h.dist + " m" : ""} [${h.seg}]${h.events.length ? " — " + h.events.map(e => e.split(":")[0]).filter((x, i, a) => a.indexOf(x) === i).join(", ") : ""}`);
    const f = farmState(); L.push(`farm: ${f.built ? (f.parked ? "built, GPU resources PARKED" : "built, GPU resources resident") : "not built"}${labActive().length ? "   ⚠ LAB: " + labActive().map(k => k + "=" + lab[k]).join(" ") : ""}   (Shift+F8: report)`);
    if (lab.auto === "off") L.push("AUTO is OFF by the lab switch: fixed High");
    lines.splice(1, 0, ...L);
  }

  // ------------------------------------------------------------------ benchmark
  const B = { on: false, phase: "", variant: "", look: "afternoon", t0: 0, farmLeft: 0, timer: 0, saved: null, result: null, raceRef: null, secs: 60, farmSecs: 60, startedAtS: 0, parkedAtStart: null };
  const LOOKS = { afternoon: { tod: "afternoon", wx: "clear", label: "afternoon · clear (the Quick Race look)" }, golden: { tod: "golden_hour", wx: "clear", label: "golden hour · clear" }, rain: { tod: "afternoon", wx: "rain", label: "afternoon · rain" } };
  let banner = null;
  function say(t) {
    if (t === (banner && !banner.hidden ? banner.textContent : "")) return;
    if (!t) { if (banner) banner.hidden = true; return; }
    if (!banner) { banner = document.createElement("div"); banner.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9400;padding:8px 14px;border-radius:8px;background:rgba(8,12,10,.9);border:1px solid rgba(232,195,90,.6);color:#f2efe6;font:600 13px system-ui,sans-serif;pointer-events:auto"; document.body.appendChild(banner); }
    banner.hidden = false; banner.textContent = t;
  }
  const setRec = () => { const on = !!(PERF.on || B.on || recBg); if (on && !P.rec) { lg = -1; seg = null; } P.rec = on; };
  let recBg = false;
  function runBench(variant) {
    if (B.on) return;
    if (ui.state !== "menu") { try { toast("Benchmark: start it from the main menu", "info", 3); } catch (e) {} return; }
    close();
    B.on = true; B.variant = variant; B.result = null; B.startedAtS = sinceLoad(); setRec(); clearInterval(B.watch); B.watch = setInterval(benchWatch, 250);
    if (variant === "farm") {
      B.phase = "farm"; B.farmLeft = B.farmSecs; say(`Benchmark: ${B.farmLeft} s on the farm, then the race starts by itself`);
      B.timer = setInterval(() => { if (ui.state !== "menu") return benchAbort("left the menu"); if (--B.farmLeft <= 0) { clearInterval(B.timer); benchStart(); } else say(`Benchmark: ${B.farmLeft} s on the farm, then the race starts by itself`); }, 1000);
    } else benchStart();
  }
  function benchStart() {
    try {
      const L = LOOKS[B.look] || LOOKS.afternoon;
      B.saved = { cam: settings.cam, parade: settings.parade };                         // in-memory only: restored when the benchmark ends, never written to storage
      settings.cam = 0; settings.parade = "off";
      try { audio.ensure(); if (typeof COMM !== "undefined") COMM.prime(); } catch (e) {}
      B.farmSecondsBefore = B.variant === "farm" ? B.farmSecs : 0; B.phase = "wait-gates"; B.t0 = performance.now();
      startRace({ distance: 1600, field: 12, diff: "medium", playerHorse: 4, champ: false, fixedOpponents: null, going: "good", assist: false, incidents: "off", chaos: false, track: "randwick", seed: 11, allBots: true,
        career: { name: "Benchmark", exhibition: true, tod: L.tod, wx: L.wx } });
      B.raceRef = race; say("Benchmark running — gates opening… (Esc cancels)");
    } catch (e) { console.error(e); benchAbort("could not start: " + e.message); }
  }
  function benchTick() {
    if (B.phase === "wait-gates") {
      if (ui.state !== "racing" || race !== B.raceRef) return benchAbort("the race was left");
      if (race.state === "running") { B.phase = "run"; B.gatesAtS = sinceLoad(); }
      else if (performance.now() - B.t0 > 40000) return benchAbort("the gates did not open within 40 s");
    } else if (B.phase === "run") {
      if (ui.state !== "racing" || race !== B.raceRef) return benchAbort("the race was left");
      say(`Benchmark: ${Math.max(0, B.secs - Math.floor(race.clock))} s left`);
      if (race.clock >= B.secs || race.state === "done") benchFinish();
    }
  }
  function benchRestore() { if (B.saved) { settings.cam = B.saved.cam; settings.parade = B.saved.parade; B.saved = null; } clearInterval(B.timer); clearInterval(B.watch); say(""); }
  // the pause screen draws no frames (so no frame hook runs): a slow timer notices that the race was left
  function benchWatch() { if (!B.on) return; if ((B.phase === "wait-gates" || B.phase === "run") && (ui.state !== "racing" || race !== B.raceRef)) benchAbort("the race was left"); }
  function benchAbort(why) { const was = B.on; B.on = false; B.phase = ""; benchRestore(); setRec(); if (was) { try { toast("Benchmark cancelled: " + why, "info", 3); } catch (e) {} } }
  function benchFinish() {
    B.phase = "done"; const s = seg && seg.key === "race" ? summary(seg) : null; const look = (LOOKS[B.look] || LOOKS.afternoon).label;
    B.result = { variant: B.variant === "farm" ? "after 60 s on the farm showcase" : "straight after launching", look, race: "Royal Randwick · 1,600 m · 12 runners · seed 11 · chase camera · all-bot", seconds: B.secs, startedAtS: +B.startedAtS.toFixed(1), farmSecondsBefore: B.farmSecondsBefore || 0,
      parkedAtStart: B.parkedAtStart, stats: s, targets: { onTimePct: ">= 99", longestMs: "<= 50", hitchesPerMin: "<= 1" } };
    if (s) B.result.meets = { onTime: s.onTimePct >= 99, noFrameOver50: s.framesOver50ms === 0, hitches: s.hitchesPerMin != null && s.hitchesPerMin <= 1 };
    closeSeg(); const text = build(true); B.on = false; benchRestore(); setRec();
    setTimeout(() => { try { quitToMenu(); } catch (e) { console.error(e); } setTimeout(() => open(text), 400); }, 0);
  }

  // ------------------------------------------------------------------ race hook (index.html startRace) and farm parking
  let raceN = 0, lastRace = null;
  function protectSet() {
    const prot = new Set(), add = t => { if (t && t.isTexture) prot.add(t); };
    for (const k in horseGeoCache) { const o = horseGeoCache[k]; if (o && o.geo) prot.add(o.geo); }
    scene.traverse(o => { if (o.geometry) prot.add(o.geometry); for (const m of [].concat(o.material || [])) { if (!m) continue; for (const k in m) add(m[k]); if (m.uniforms) for (const k in m.uniforms) add(m.uniforms[k] && m.uniforms[k].value); } });
    add(scene.environment); add(scene.background);
    return prot;
  }
  function raceStart(cfg) {
    raceN++; const f = farmState(), before = gpuNow(); let park = null;
    if (lab.park === "park" && f.built && !f.active) { try { park = FARM.park(protectSet()); } catch (e) { console.error(e); } }
    const after = gpuNow();
    lastRace = { n: raceN, atS: +sinceLoad().toFixed(1), what: `${cfg.track || "generic"} ${cfg.distance} m, ${cfg.field} runners${cfg.career ? ", " + cfg.career.name : ""}`, farmBuilt: f.built, farmGpuParked: !!park, parkRemoved: park, gpuBeforePark: before, gpuAfterPark: after };
    B.parkedAtStart = lastRace.farmGpuParked;
    ev("race", `start #${raceN}: ${lastRace.what} · farm ${f.built ? "built" : "not built"}${park ? " · PARKED (−" + park.geo + " geometries, −" + park.tex + " textures, −" + park.shadow + " shadow map)" : " · GPU resident"}`);
  }

  // ------------------------------------------------------------------ report
  function context() {
    const out = {};
    try { const gl = renderer.getContext(), x = gl.getExtension("WEBGL_debug_renderer_info"); out.gpuRenderer = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); out.gpuVendor = x ? gl.getParameter(x.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR); out.webgl = gl.getParameter(gl.VERSION); } catch (e) { out.gpuRenderer = "unavailable"; }
    out.userAgent = navigator.userAgent; out.devicePixelRatio = devicePixelRatio; out.screen = `${screen.width}×${screen.height}`; out.viewport = `${innerWidth}×${innerHeight}`;
    const cv = renderer.domElement; out.canvas = `${cv.width}×${cv.height} @ ${renderer.getPixelRatio().toFixed(2)}×`;
    let emb = false; try { emb = window.top !== window; } catch (e) { emb = true; }
    out.build = `${BUILD} · ${window.FF_STANDALONE ? "single-file build" : "served build"}${emb ? " · inside an iframe/host page" : " · top-level page"}`;
    out.hardwareConcurrency = navigator.hardwareConcurrency || null; out.deviceMemoryGB = navigator.deviceMemory || null;
    return out;
  }
  function build(withBench) {
    const c = context(), i = renderer.info, A = GFX.AUTO, R = GFX.runtimeParams(), gp = gpuNow(), pm = performance.memory, f = farmState();
    let stored = null; try { stored = localStorage.getItem("ff_autoLevel"); } catch (e) {}
    const J = { report: "Final Furlong performance report", phase: BUILD, generatedAt: new Date().toISOString(), secondsSincePageLoad: +sinceLoad().toFixed(1), context: c,
      display: { refreshMs: refresh ? +refresh.toFixed(2) : null, hz: refresh ? Math.round(1000 / refresh) : null, hitchThresholdMs: +thresh().toFixed(2) },
      graphics: { preset: settings.quality, autoLevel: A.level, autoLevelNote: GFX.AUTO_STEPS[A.level].note, autoChangesThisSession: A.changes, autoLast: A.last, storedAutoLevel: stored, labAuto: A.lab, renderScale: R.pr, shadow: R.shadow, shadowsSetting: settings.shadows, crowd: settings.crowd, scenery: settings.scenery },
      lab: Object.assign({}, lab), labDefaults: labActive().length === 0,
      farm: { residentInMemory: f.built, gpuResources: f.built ? (f.parked ? "parked" : "resident") : "n/a", showcaseRunning: !!f.showcase, walking: !!f.active, note: "the farm is built at boot for the main menu, so it is resident even in a Quick Race straight after loading" },
      gpuCounts: { geometries: gp.geo, textures: gp.tex, shaderPrograms: gp.prog, drawCallsLastFrame: i.render.calls, trianglesLastFrame: i.render.triangles }, horseGeoCacheEntries: Object.keys(horseGeoCache).length, envMapCache: GFX.atmosphere.env.size,
      heapMB: pm ? +(pm.usedJSHeapSize / 1048576).toFixed(1) : null, lastRaceStart: lastRace, currentSegment: seg && seg.n > 1 ? summary(seg) : null, previousSegments: HIST.slice(-10), eventCounts: Object.assign({}, EC), benchmark: B.result,
      hitchLog: HL.slice(-60), events: EV.slice(-80).map(e => ({ at: +((e.t - T0) / 1000).toFixed(2), kind: e.k, info: e.s, raceM: e.d })) };
    const L = [];
    L.push(`FINAL FURLONG — PERFORMANCE REPORT (Phase ${BUILD} diagnostics)`, `generated ${J.generatedAt}   ·   ${J.secondsSincePageLoad} s since the page loaded`);
    L.push(`build: ${c.build}`, `browser: ${c.userAgent}`, `GPU: ${c.gpuRenderer} (${c.gpuVendor || "?"}) · ${c.webgl}`, `screen ${c.screen} · viewport ${c.viewport} · devicePixelRatio ${c.devicePixelRatio} · canvas ${c.canvas} · CPU threads ${c.hardwareConcurrency} · memory ${c.deviceMemoryGB || "?"} GB`);
    L.push(`display refresh (detected): ${hzLabel()}   ·   hitch = a frame longer than ${thresh().toFixed(1)} ms   ·   on-time = every frame that is not a hitch`);
    L.push(`graphics: preset ${settings.quality}${settings.quality === "auto" ? ` · AUTO level ${A.level}/${GFX.AUTO_STEPS.length - 1} (${J.graphics.autoLevelNote}) · changes this session ${A.changes}${A.last ? " · last: " + A.last : ""} · stored ff_autoLevel ${stored}` : ""} · render ×${R.pr} · shadows ${R.shadow || "off"}`);
    L.push(`LAB switches: AUTO=${lab.auto} · farm GPU=${lab.park === "park" ? "PARKED while racing" : "retained"} · race lighting=${lab.light === "clear" ? "FORCED afternoon-clear" : "normal"} · commentary=${lab.comm}${labActive().length ? "   ⚠ not the normal game" : "   (all defaults)"}`);
    L.push(`FARM: world ${f.built ? "IS resident in memory" : "is not built"} (it is built at boot for the main menu, so also during a Quick Race straight after loading)${f.built ? " · GPU resources " + (f.parked ? "PARKED" : "resident") : ""}${f.showcase ? " · menu showcase running" : ""}${f.active ? " · player is walking it" : ""}`);
    L.push(`GPU objects now: ${gp.geo} geometries · ${gp.tex} textures · ${gp.prog} shader programs · last frame ${i.render.calls} draw calls / ${(i.render.triangles / 1e6).toFixed(2)} M triangles · horse geometry cache ${J.horseGeoCacheEntries} · env-map cache ${J.envMapCache}${pm ? " · JS heap " + J.heapMB + " MB" : ""}`);
    if (lastRace) L.push(`last race start: #${lastRace.n} at ${lastRace.atS} s — ${lastRace.what}; farm ${lastRace.farmBuilt ? "built" : "not built"}, ${lastRace.farmGpuParked ? "GPU PARKED (−" + lastRace.parkRemoved.geo + " geometries, −" + lastRace.parkRemoved.tex + " textures)" : "GPU resident"}; GPU objects before/after ${lastRace.gpuBeforePark.geo}/${lastRace.gpuBeforePark.tex} → ${lastRace.gpuAfterPark.geo}/${lastRace.gpuAfterPark.tex}`);
    const segLine = s => `  ${s.segment.padEnd(12)} ${String(s.seconds).padStart(6)} s · ${String(s.frames).padStart(5)} frames · on-time ${num(s.onTimePct)} % · hitches ${s.hitches} (${s.hitchesPerMin == null ? "—" : s.hitchesPerMin}/min) · longest ${s.longestMs} ms${s.longestAtM != null ? " @ " + s.longestAtM + " m" : ""} · >50 ms ${s.framesOver50ms} · median/p95/p99 ${s.medianMs}/${s.p95Ms}/${s.p99Ms} ms · AUTO changes ${s.autoLevelChanges}${s.look ? " · " + s.look : ""}`;
    L.push("", "FRAME STATISTICS (recorded only while F8 or the benchmark was on; a race counts from the gates opening)");
    if (J.currentSegment) L.push("  now:", segLine(J.currentSegment));
    if (HIST.length) { L.push("  earlier:"); HIST.slice(-8).forEach(s => L.push(segLine(s))); }
    if (!J.currentSegment && !HIST.length) L.push("  nothing recorded yet — press F8 (or run the benchmark) BEFORE the race starts, then press Shift+F8 afterwards.");
    if (withBench && B.result) { const r = B.result, s = r.stats;
      L.push("", "BENCHMARK RESULT", `  ${r.race}`, `  look: ${r.look} · variant: ${r.variant} · started ${r.startedAtS} s after page load${r.farmSecondsBefore ? " · " + r.farmSecondsBefore + " s on the farm first" : ""} · farm GPU parked at the start: ${r.parkedAtStart ? "yes" : "no"}`);
      if (s) L.push(segLine(s), `  targets (ROADMAP §2.5): on-time ≥ 99 % [${r.meets.onTime ? "met" : "NOT met"}] · no frame > 50 ms [${r.meets.noFrameOver50 ? "met" : "NOT met"}] · hitches ≤ 1/min [${r.meets.hitches ? "met" : "NOT met"}]`); else L.push("  no race frames were recorded"); }
    else if (B.result) L.push("", "(a benchmark result is stored: use Refresh in the dialog)");
    L.push("", `HITCH LOG (last ${Math.min(40, HL.length)} of ${HL.length}; "js" = this frame's JavaScript time, "prev" = the frame before, whose work produced the long interval)`);
    if (!HL.length) L.push("  none recorded");
    HL.slice(-40).forEach(h => L.push(`  ${String(h.at).padStart(8)} s  ${String(h.ms).padStart(6)} ms  [${h.seg}${h.dist != null ? " @ " + h.dist + " m" : ""}${h.clock != null ? ", gates+" + h.clock + " s" : ""}]  js ${h.js} (prev ${h.jsPrev}) · sim ${h.sim} · render-submit ${h.render} — ${h.hint}${h.events.length ? "\n             events: " + h.events.join(" | ") : ""}`));
    L.push("", `EVENTS (last ${Math.min(60, EV.length)}; counts: ${Object.keys(EC).map(k => k + " " + EC[k]).join(", ") || "none"})`);
    EV.slice(-60).forEach(e => L.push(`  ${String(((e.t - T0) / 1000).toFixed(2)).padStart(8)} s  ${e.k.padEnd(14)} ${e.s}${e.d != null ? "  @ " + e.d + " m" : ""}`));
    L.push("", "--- JSON (for pasting back) ---", JSON.stringify(J));
    return L.join("\n");
  }

  // ------------------------------------------------------------------ the dialog: lab switches, benchmark, report text
  let dlg = null, ta = null, stat = null;
  function setStatus(t) { if (stat) stat.textContent = t || ""; }
  function open(text) {
    if (ui.state === "racing") { try { toast("Performance report: open it from the pause screen, the results screen or the menu — not during a race", "info", 3.2); } catch (e) {} return; }
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
    if (!dlg) makeDialog();
    dlg.hidden = false; refreshDlg(text);
  }
  function close() { if (dlg) dlg.hidden = true; }
  function refreshDlg(text) {
    for (const k in DEF) { const el = $q("pl_" + k); if (el) el.value = lab[k]; }
    const lk = $q("pl_look"); if (lk) lk.value = B.look; const rb = $q("pl_rec"); if (rb) rb.checked = recBg;
    ta.value = text || build(true); ta.scrollTop = 0; setStatus(text ? "Benchmark finished — the report is below." : "");
  }
  function makeDialog() {
    dlg = document.createElement("div"); dlg.id = "perfLab"; dlg.hidden = true;
    dlg.style.cssText = "position:fixed;inset:0;z-index:9500;background:rgba(4,8,6,.82);display:flex;align-items:center;justify-content:center;font:13px/1.45 system-ui,sans-serif;color:#e9efe9";
    const sel = (id, opts) => `<select id="pl_${id}" style="background:#16211b;color:#f2efe6;border:1px solid #3d5646;border-radius:5px;padding:4px 6px;font:inherit">${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("")}</select>`;
    const btn = (id, t) => `<button id="${id}" style="cursor:pointer;background:#1c2a22;color:#f2efe6;border:1px solid rgba(232,195,90,.6);border-radius:6px;padding:6px 11px;font:600 12px system-ui,sans-serif">${t}</button>`;
    dlg.innerHTML = `<div style="width:min(820px,94vw);max-height:92vh;overflow:auto;background:#0d1511;border:1px solid #3d5646;border-radius:10px;padding:14px 16px;box-shadow:0 12px 50px rgba(0,0,0,.6)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:15px;color:#e8c35a;letter-spacing:.04em">PERFORMANCE LAB &amp; REPORT <span style="font-weight:400;color:#9db0a3">· Phase ${BUILD} diagnostics</span></b>${btn("pl_x", "Close (Esc)")}</div>
      <div style="color:#9db0a3;margin-bottom:8px">Hidden experiments for finding the racing stutter. Defaults are the normal game. Nothing here changes your saved graphics settings or your AUTO level. Switches apply from the next race (AUTO applies at once).</div>
      <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
        <tr><td style="padding:3px 8px 3px 0">AUTO graphics</td><td>${sel("auto", [["normal", "Normal — farm, menu and races all feed AUTO"], ["race", "Race frames only"], ["off", "Off — fixed High, nothing stored"]])}</td></tr>
        <tr><td style="padding:3px 8px 3px 0">Farm GPU resources</td><td>${sel("park", [["retain", "Retained (normal)"], ["park", "Temporarily parked before racing"]])}</td></tr>
        <tr><td style="padding:3px 8px 3px 0">Race lighting</td><td>${sel("light", [["normal", "Normal — the event's own look"], ["clear", "Forced afternoon-clear"]])}</td></tr>
        <tr><td style="padding:3px 8px 3px 0">Commentary</td><td>${sel("comm", [["normal", "Normal"], ["off", "Off (saved setting untouched)"]])} ${btn("pl_reset", "Reset all to normal")}</td></tr>
      </table>
      <div style="border-top:1px solid #26382d;padding-top:8px;margin-bottom:8px"><b>Benchmark race</b> <span style="color:#9db0a3">— Royal Randwick · 1,600 m · 12 runners · fixed seed · chase camera · every horse ridden by a bot · measured for 60 s after the gates open. Start it from the main menu.</span>
        <div style="margin-top:6px">Look: ${sel("look", [["afternoon", "Afternoon · clear (Quick Race look)"], ["golden", "Golden hour · clear"], ["rain", "Afternoon · rain"]])}
        ${btn("pl_b1", "Run now (straight after launching)")} ${btn("pl_b2", "Run after 60 s on the farm")}</div></div>
      <div style="border-top:1px solid #26382d;padding-top:8px"><label style="cursor:pointer"><input type="checkbox" id="pl_rec"> Record frame stats without the F8 overlay <span style="color:#9db0a3">(lowest overhead; the report still gets the numbers)</span></label>
        <div style="margin:8px 0 4px">${btn("pl_ref", "Refresh report")} ${btn("pl_copy", "Copy to clipboard")} ${btn("pl_sel", "Select all")} <span id="pl_stat" style="color:#e8c35a;margin-left:6px"></span></div>
        <textarea id="pl_ta" readonly spellcheck="false" style="width:100%;height:36vh;background:#070c09;color:#cfe8d4;border:1px solid #3d5646;border-radius:6px;padding:8px;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre;resize:vertical"></textarea></div></div>`;
    document.body.appendChild(dlg); ta = $q("pl_ta"); stat = $q("pl_stat");
    dlg.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); else if (e.key === "F8" && e.shiftKey) { e.preventDefault(); close(); } }, false);
    dlg.addEventListener("keyup", e => e.stopPropagation(), false);
    dlg.addEventListener("mousedown", e => { if (e.target === dlg) close(); });
    $q("pl_x").onclick = close;
    for (const k in DEF) $q("pl_" + k).onchange = e => { lab[k] = e.target.value; saveLab(); applyLab(); setStatus(k === "auto" ? "Saved. AUTO applies now." : "Saved. Applies from the next race."); refreshReportOnly(); };
    $q("pl_reset").onclick = () => { Object.assign(lab, DEF); saveLab(); applyLab(); refreshDlg(); setStatus("All switches back to normal."); };
    $q("pl_look").onchange = e => { B.look = e.target.value; };
    $q("pl_rec").onchange = e => { recBg = !!e.target.checked; setRec(); setStatus(recBg ? "Recording frame stats (overlay hidden)." : "Recording off unless F8 is on."); };
    $q("pl_b1").onclick = () => runBench("now"); $q("pl_b2").onclick = () => runBench("farm");
    $q("pl_ref").onclick = () => { ta.value = build(true); setStatus("Refreshed."); };
    $q("pl_sel").onclick = () => { ta.focus(); ta.select(); setStatus("Selected — press Ctrl+C (Cmd+C on a Mac)."); };
    $q("pl_copy").onclick = () => {
      ta.value = build(true); const txt = ta.value;
      const fallback = () => { ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (e) {} setStatus(ok ? "Copied." : "The clipboard is blocked here — the text is selected: press Ctrl+C (Cmd+C on a Mac)."); };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => setStatus("Copied to the clipboard."), fallback); else fallback(); } catch (e) { fallback(); }
    };
  }
  const refreshReportOnly = () => { if (ta) ta.value = build(true); };

  // ------------------------------------------------------------------ keys: F8 (overlay, as before — now also on the farm) and Shift+F8 (report), caught before any other handler
  addEventListener("keydown", e => {
    if (e.key !== "F8") return;
    e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat) return;
    if (e.shiftKey) { if (dlg && !dlg.hidden) close(); else open(); return; }
    PERF.on = !PERF.on; $q("perfOv").hidden = !PERF.on; PERF.t = 0; if (PERF.cv) PERF.cv.style.display = PERF.on ? "block" : "none"; setRec();
  }, true);

  // scene transitions (menu ↔ farm ↔ race …) are events too
  try { SCENES.onChange((to, from) => ev("scene", from + " → " + to)); } catch (e) {}
  setTimeout(applyLab, 0);                                   // after initialisation (applyQuality() reports to PERFLAB, which does not exist until this file has finished)
  // a switch left on from an earlier session is reported once, so it cannot be forgotten
  if (labActive().length) setTimeout(() => { try { toast("Performance lab: " + labActive().map(k => k + "=" + lab[k]).join(", ") + " (Shift+F8 to change)", "info", 4); } catch (e) {} }, 2500);

  const P = { rec: false, lab, ev, frame, overlay, raceStart, open, close, report: () => build(true), runBench, BUILD, get benchmark() { return B; }, get hitches() { return HL; }, get events() { return EV; }, get segment() { return seg; }, get history() { return HIST; }, labDefaults: DEF, setLab(k, v) { if (CHOICES[k] && CHOICES[k].includes(v)) { lab[k] = v; saveLab(); applyLab(); } }, get refresh() { return refresh; } };
  return P;
})();
