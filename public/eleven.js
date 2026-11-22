'use strict';
/* =====================================================================
   FINAL FURLONG — ELEVENLABS COMMENTARY PLAYBACK (eleven.js)
   The race call in the commentator voice the player chose on ElevenLabs ("Commentator", voice ID MTGAJpjryOZn2Xr8FOtm),
   played from recordings that ship with the game:

   Mode A · "ElevenLabs — recorded" (default)
     794 clips generated once with that voice (assets/audio/commentary/, manifest.json): every phrase in the caller's
     phrase bank (calls.js) at its own delivery energy — calm mid-race, lively, building, urgent, screaming — plus every
     horse name of the Quick Race field, the career rival pool and the choosable career names, each in three
     deliveries (before a phrase mid-race, excited in the straight, screamed at the finish). The commentary director
     (commentary.js) decides WHAT to say from the live race; this module plays exactly those phrases and names, so the
     caption is what you hear. No network, no API key, no credits during play.

   Mode B · "ElevenLabs — enhanced"
     Mode A, plus the game server's /api/tts endpoint (API key in the server's environment, never in the browser): before
     the gates open it generates the names the recordings lack (your own custom horse names), in the same three
     deliveries, and caches them on the server and in this browser. Nothing is generated during the race.

   Playback is asynchronous and light: the clips stay compressed in memory and each line's clips are decoded just before
   it is spoken (a few milliseconds), then scheduled sample-accurately on the Web Audio clock — no gaps from timers,
   no overlapping lines (a new line always stops the previous one), and an urgent call cuts a stale one at once.
   Nothing here touches the simulation.
   ===================================================================== */
const ELEVEN = (() => {
  const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  const VOICE_ID = "MTGAJpjryOZn2Xr8FOtm", VOICE_NAME = "Commentator";
  const BASE = "assets/audio/commentary/";
  const SET = { mode: "eleven", nameFallback: "local" };     // mode: eleven | eleven_plus | local | off
  if (inBrowser) try { const s = JSON.parse(localStorage.getItem("ff_eleven") || "null"); if (s && typeof s === "object") { if (s.mode) SET.mode = s.mode; if (s.nameFallback) SET.nameFallback = s.nameFallback; } } catch (e) {}
  const save = () => { try { localStorage.setItem("ff_eleven", JSON.stringify(SET)); } catch (e) {} };
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const CTX_ORDER = { s: ["s", "x", "c"], x: ["x", "s", "c"], c: ["c", "x", "s"] };

  /* ---------- the library ---------- */
  let manifest = null, byId = new Map(), names = new Map(), libErr = null, libLoading = null;
  function index(m) {
    manifest = m; byId.clear(); names.clear();
    for (const c of m.clips) { byId.set(c.id, c); if (c.name) names.set(norm(c.name) + "|" + c.ctx, c.id); }
  }
  function loadLibrary() {
    if (manifest) return Promise.resolve(manifest);
    if (libLoading) return libLoading;
    libLoading = (async () => {
      try {
        if (inBrowser && !window.__FF_COMM_LIB) {                                                 // the packed library (one file)
          try { const r = await fetch("assets/audio/commentary-lib.json"); if (r.ok) window.__FF_COMM_LIB = await r.json(); } catch (e) {}
        }
        if (inBrowser && window.__FF_COMM_LIB) index(window.__FF_COMM_LIB.manifest);              // single-file build / pack
        else { const r = await fetch(BASE + "manifest.json", { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status); index(await r.json()); }
        return manifest;
      } catch (e) { libErr = "commentary recordings not found (" + e.message + ")"; libLoading = null; return null; }
    })();
    return libLoading;
  }
  // the clip for a horse's name in a delivery (falling back to the nearest delivery the library has)
  function nameId(name, ctx) { const k = norm(name); for (const c of CTX_ORDER[ctx] || CTX_ORDER.c) { const id = names.get(k + "|" + c); if (id) return id; } return null; }
  const display = h => (h && h.def && (h.def.say || h.def.name)) || "";

  /* ---------- audio: compressed in memory, decoded just in time ---------- */
  let ctx = null, outGain = null;
  const bytes = new Map(), decoded = new Map(), decoding = new Map(), DYN = new Map();
  const DECODED_MAX = 160;                                   // a few hundred KB each: keep the most recent ones
  function ensureCtx() {
    if (ctx || !inBrowser) return ctx;
    try { const AC = window.AudioContext || window.webkitAudioContext; try { ctx = new AC({ sampleRate: 24000, latencyHint: "interactive" }); } catch (e) { ctx = new AC(); }
      outGain = ctx.createGain(); outGain.gain.value = vol(); outGain.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }
  function vol() { return typeof COMM !== "undefined" ? COMM.settings.vol : 0.9; }
  async function clipBytes(id) {
    if (bytes.has(id)) return bytes.get(id);
    const c = byId.get(id); if (!c) throw new Error("no clip " + id);
    let ab;
    if (inBrowser && window.__FF_COMM_LIB && window.__FF_COMM_LIB.data[c.file]) { const b = atob(window.__FF_COMM_LIB.data[c.file]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); ab = a.buffer; }
    else { const r = await fetch(BASE + c.file); if (!r.ok) throw new Error("HTTP " + r.status); ab = await r.arrayBuffer(); }
    bytes.set(id, ab); return ab;
  }
  function decode(ab) { return new Promise((res, rej) => { try { const p = ctx.decodeAudioData(ab.slice(0), res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } }); }
  function load(id) {
    if (decoded.has(id)) { const b = decoded.get(id); decoded.delete(id); decoded.set(id, b); return Promise.resolve(b); }   // LRU touch
    if (decoding.has(id)) return decoding.get(id);
    const p = (async () => { if (!ensureCtx()) return null; const b = await decode(await clipBytes(id)); decoded.set(id, b); decoding.delete(id);
      while (decoded.size > DECODED_MAX) decoded.delete(decoded.keys().next().value); return b; })().catch(() => { decoding.delete(id); return null; });
    decoding.set(id, p); return p;
  }

  /* ---------- the optional server (Mode B) ---------- */
  const srv = { status: null, checked: 0, used: 0, perRace: 0, errors: 0, lastErr: null, latency: [] };
  async function serverStatus(force) {
    if (!inBrowser || location.protocol === "file:") return null;
    if (!force && srv.status && performance.now() - srv.checked < 60000) return srv.status;
    try { const r = await fetch("/api/tts/status", { cache: "no-store" }); srv.status = r.ok ? await r.json() : { configured: false, reason: "HTTP " + r.status }; }
    catch (e) { srv.status = { configured: false, reason: "no game server (single-file / offline)" }; }
    srv.checked = performance.now(); return srv.status;
  }
  const DYN_CACHE = "ff-eleven-dyn-v2", DYN_MAX = 300;
  async function dynFetch(text, kind, timeoutMs) {
    const key = kind + ":" + text;
    if (DYN.has(key)) return DYN.get(key);
    let ab = null, cache = null;
    try { cache = await caches.open(DYN_CACHE); const hit = await cache.match("/tts/" + encodeURIComponent(key)); if (hit) ab = await hit.arrayBuffer(); } catch (e) {}
    if (!ab) {
      const st = await serverStatus(); if (!st || !st.configured) return null;
      const ac = new AbortController(), t0 = performance.now(), to = setTimeout(() => ac.abort(), timeoutMs || 8000);
      try {
        const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, kind }), signal: ac.signal });
        if (!r.ok) { const j = await r.json().catch(() => ({})); srv.errors++; srv.lastErr = j.error || ("HTTP " + r.status); return null; }
        ab = await r.arrayBuffer(); srv.used++; srv.latency.push(performance.now() - t0); if (srv.latency.length > 20) srv.latency.shift();
        if (cache) { try { await cache.put("/tts/" + encodeURIComponent(key), new Response(ab.slice(0), { headers: { "content-type": "audio/mpeg" } })); const ks = await cache.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - DYN_MAX))) await cache.delete(k); } catch (e) {} }
      } catch (e) { srv.errors++; srv.lastErr = e.name === "AbortError" ? "timeout" : e.message; return null; } finally { clearTimeout(to); }
    }
    if (!ensureCtx()) return null;
    try { const b = await decode(ab); DYN.set(key, b); if (DYN.size > 120) DYN.delete(DYN.keys().next().value); return b; } catch (e) { return null; }
  }

  /* ---------- race preparation (before the gates open) ---------- */
  let prepTask = null, prepDone = false;
  function prepare(race) { prepDone = false; prepTask = prepare0(race).finally(() => { prepDone = true; }); return prepTask; }
  async function prepare0(race) {
    if (!active()) return;
    const lib = await loadLibrary(); if (!lib || !ensureCtx()) return;
    // this field's names in all three deliveries + the opening calls are decoded now; everything else on demand
    const ids = [];
    for (const h of race.horses) for (const c of ["c", "x", "s"]) { const id = nameId(display(h), c); if (id) ids.push(id); }
    for (const c of manifest.clips) if (/^(intro|loading|away|start_|early_)/.test(c.id)) ids.push(c.id);
    await Promise.all([...new Set(ids)].map(load));
    // fetch all the compressed bytes too (served build: a few MB over a local connection) so nothing waits on the network
    if (!(inBrowser && window.__FF_COMM_LIB)) Promise.all(manifest.clips.filter(c => !c.name).map(c => clipBytes(c.id).catch(() => null)));
    if (SET.mode === "eleven_plus") {                       // names the recordings lack: generated now, before the start
      srv.perRace = 0;
      for (const h of race.horses) { if (nameId(display(h), "c") || srv.perRace >= 12) continue; srv.perRace++;
        for (const c of ["c", "x", "s"]) await dynFetch(display(h), "name_" + c, 9000); }
    }
  }

  /* ---------- speaking a line ---------- */
  let seq = 0, playing = [], endTimer = null;
  function stopAll() { seq++; for (const s of playing) { try { s.stop(); } catch (e) {} } playing = []; if (endTimer) { clearTimeout(endTimer); endTimer = null; } if (typeof COMM !== "undefined" && COMM.cancelLocal) COMM.cancelLocal(); }
  const stats = { lines: 0, voiced: 0, local: 0, dyn: 0, missing: 0, decodeMs: [] };
  let lastPlan = null;
  // resolve a line's parts to playable pieces: recordings, server-generated names, local-voice names, pauses
  async function resolve(parts) {
    const out = [];
    for (const p of parts) {
      if (p.pause != null) { out.push({ pause: p.pause }); continue; }
      if (p.id) { out.push({ id: p.id, p: load(p.id) }); continue; }
      if (p.name != null) {
        const id = nameId(p.name, p.ctx || "c");
        if (id) { out.push({ id, p: load(id), name: true }); continue; }
        const d = DYN.get("name_" + (p.ctx || "c") + ":" + p.name) || DYN.get("name_c:" + p.name);
        if (d) { out.push({ buf: d, dyn: true, name: true }); continue; }
        out.push(SET.nameFallback === "local" ? { say: p.name, ctx: p.ctx } : { skip: true });
      }
    }
    for (const o of out) if (o.p) o.buf = await o.p;
    return out;
  }
  // the gap between two pieces: none inside a phrase-name pair, a breath between sentences (shorter when excited)
  function gapBetween(a, b, I) { if (!b) return 0; if (b.pause != null) return b.pause * (I >= 4 ? 0.45 : I >= 3 ? 0.7 : 1); if (a.name && b.name) return I >= 4 ? 0.02 : 0.06; return a.name || b.name ? 0.015 : 0.03; }
  function speak(text, prm, onEnd, info) {
    stopAll(); const my = seq; let done = false;
    const finish = () => { if (done || my !== seq) return; done = true; if (endTimer) { clearTimeout(endTimer); endTimer = null; } onEnd && onEnd(); };
    const est = 0.8 + String(text).split(/\s+/).length / 2.9;
    if (!ensureCtx() || !manifest || !info || !info.parts) { endTimer = setTimeout(finish, est * 1000); return; }
    if (info.cat === "intro" && prepTask && !prepDone) { prepTask.then(() => { if (my === seq && !done) speak(text, prm, onEnd, info); }); endTimer = setTimeout(finish, 5000); return; }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    outGain.gain.value = vol();
    const t0 = performance.now();
    endTimer = setTimeout(finish, (est * 2 + 3) * 1000);       // safety net
    resolve(info.parts).then(pieces => {
      if (my !== seq || done) return;
      stats.decodeMs.push(performance.now() - t0); if (stats.decodeMs.length > 50) stats.decodeMs.shift();
      // a line whose audio took too long to prepare is stale: drop it rather than describe the past
      if (performance.now() - t0 > (info.I >= 3.5 ? 450 : 1200)) { stats.missing++; finish(); return; }
      stats.lines++;
      const playable = pieces.filter(p => p.buf || p.say);
      if (!playable.length) { stats.missing++; if (endTimer) clearTimeout(endTimer); endTimer = setTimeout(finish, est * 650); return; }
      stats.voiced++; if (pieces.some(p => p.say)) stats.local++; if (pieces.some(p => p.dyn)) stats.dyn++;
      lastPlan = { text, parts: pieces.map(p => p.say ? "local:" + p.say : p.dyn ? "api" : p.pause != null ? "pause" : p.id || "?") };
      playFrom(pieces, 0, my, finish, info.I || 2);
    });
  }
  // schedule recordings back to back on the audio clock; a local-voice name splits the line into two runs
  function playFrom(pieces, i, my, finish, I) {
    if (my !== seq) return;
    let t = ctx.currentTime + 0.02, last = null, prev = null;
    for (; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.skip) continue;
      if (p.pause != null) { if (prev) t += gapBetween(prev, p, I); prev = null; continue; }
      if (p.say) {                                            // finish what is scheduled, then the local voice, then continue
        const rest = i + 1, wait = Math.max(0, t - ctx.currentTime) * 1000;
        setTimeout(() => { if (my !== seq) return; if (typeof COMM !== "undefined" && COMM.sayLocal) COMM.sayLocal(p.say + (p.ctx === "c" ? "," : "!"), I, () => playFrom(pieces, rest, my, finish, I)); else playFrom(pieces, rest, my, finish, I); }, wait);
        return;
      }
      if (!p.buf) continue;
      if (prev) t += gapBetween(prev, p, I);
      const src = ctx.createBufferSource(); src.buffer = p.buf; src.connect(outGain); src.start(t);
      playing.push(src); last = src; t += p.buf.duration; prev = p;
    }
    if (!last) { finish(); return; }
    last.onended = () => { playing = playing.filter(x => x !== last); finish(); };
    if (endTimer) clearTimeout(endTimer); endTimer = setTimeout(finish, (t - ctx.currentTime + 1.5) * 1000);
  }

  function active() { return inBrowser && (SET.mode === "eleven" || SET.mode === "eleven_plus") && !libErr && typeof COMM !== "undefined" && COMM.settings.on && COMM.settings.vol > 0; }

  /* ---------- voice test (Settings) ---------- */
  // plays a line given as parts (phrase texts / names) and reports which backend actually spoke
  async function test(parts, I) {
    stopAll();
    const lib = await loadLibrary(); if (!lib) return { backend: "unavailable", detail: libErr };
    if (!ensureCtx()) return { backend: "unavailable", detail: "Web Audio not available" };
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const t0 = performance.now(), my = ++seq; outGain.gain.value = vol();
    const missing = parts.filter(p => p.name != null && !nameId(p.name, p.ctx || "c")).map(p => p.name);
    if (missing.length && SET.mode === "eleven_plus") for (const n of missing) for (const c of ["c", "x", "s"]) await dynFetch(n, "name_" + c, 9000);
    const pieces = await resolve(parts);
    playFrom(pieces, 0, my, () => {}, I || 3);
    const labels = pieces.filter(p => !p.skip && p.pause == null).map(p => p.say ? "local" : p.dyn ? "api" : "recorded");
    const backend = labels.includes("api") ? "ElevenLabs API (your voice, generated for this name)" : labels.every(l => l === "recorded") ? "ElevenLabs recorded (your voice)" : labels.includes("recorded") ? "ElevenLabs recorded + local voice for the name" : "Local voice";
    return { backend, firstMs: performance.now() - t0, parts: labels, missingName: missing[0] || null };
  }

  return {
    VOICE_ID, VOICE_NAME, norm,
    get settings() { return SET; },
    set(k, v) { SET[k] = v; save(); if (k === "mode" && !(v === "eleven" || v === "eleven_plus")) stopAll(); },
    active, loadLibrary, prepare, speak, cancel: stopAll, test, serverStatus,
    get ready() { return !!manifest; }, get error() { return libErr; },
    hasName: n => !!nameId(n, "c"), get nameCount() { return new Set([...names.keys()].map(k => k.split("|")[0])).size; }, get clipCount() { return byId.size; },
    get stats() { const d = stats.decodeMs.slice().sort((a, b) => a - b); return Object.assign({ server: Object.assign({}, srv), decodeMed: d.length ? d[d.length >> 1] : null }, stats); },
    get lastPlan() { return lastPlan; }, get decoded() { return decoded.size; },
    _index: index, _nameId: nameId,
  };
})();
if (typeof window !== "undefined" && typeof document !== "undefined") setTimeout(() => { if (ELEVEN.settings.mode === "eleven" || ELEVEN.settings.mode === "eleven_plus") ELEVEN.loadLibrary(); }, 0);   // index the recordings at start-up
if (typeof module !== "undefined" && module.exports) module.exports = ELEVEN;
