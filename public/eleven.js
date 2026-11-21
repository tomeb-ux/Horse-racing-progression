'use strict';
/* =====================================================================
   FINAL FURLONG — ELEVENLABS COMMENTARY (eleven.js)
   The race call in the player's own ElevenLabs voice ("mw_e-sports-commentator_The Aussie Companion",
   voice ID OQt0mf8rKBYkweCSQ9d4), as a hybrid:

   Mode A · "ElevenLabs — recorded" (default)
     150 clips generated once with that voice and shipped with the game (assets/audio/commentary/, manifest.json):
     starts, settling, mid-race, home turn, 600/400/200/100 m, photo finishes, winners, lead-in phrases ("And there's a
     new leader,") and the horse names of the Quick Race field and the career rival pool. No network, no API key, no
     credits during play. The live commentary engine (commentary.js) still decides WHAT is said from the real race state;
     this module turns each line into recorded phrases + the right horse names ("And there's a new leader," → "Desert
     Comet!"). Lines it cannot voice from recordings stay on screen as captions (and, if chosen, a name the library
     lacks is spoken by the local voice — never labelled as ElevenLabs).

   Mode B · "ElevenLabs — enhanced"
     Mode A, plus a small endpoint on the game's own server (/api/tts) that holds the ElevenLabs API key in an environment
     variable (never in the browser). Before the gates open it fetches the names the library lacks (your own horses,
     generated rival names) so nothing is generated during the race; results are cached on the server and in the
     browser. Optional "live lines" asks for a few calm mid-race lines in full, each dropped if it is not back in time.

   Nothing here touches the simulation: it only reads the race through the commentary engine.
   ===================================================================== */
const ELEVEN = (() => {
  const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  const VOICE_ID = "OQt0mf8rKBYkweCSQ9d4", VOICE_NAME = "mw_e-sports-commentator_The Aussie Companion";
  const BASE = "assets/audio/commentary/";
  const SET = { mode: "eleven", liveLines: false, nameFallback: "local" };     // mode: eleven | eleven_plus | local | off
  if (inBrowser) try { const s = JSON.parse(localStorage.getItem("ff_eleven") || "null"); if (s && typeof s === "object") Object.assign(SET, s); } catch (e) {}
  const save = () => { try { localStorage.setItem("ff_eleven", JSON.stringify(SET)); } catch (e) {} };
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  /* ---------- the clip planner (pure: also used by the Node tests) ----------
     clip: the structured hint the commentary engine attaches to each line (what kind of call, who leads, markers…)
     has(id): is that recorded clip available? nameOf(h): the clip id for a horse's name, or null.
     Returns [{ id } | { say: "text" }] — recorded clips in order; a { say } is a name the library doesn't have. */
  const PICK = {};
  function pick(key, ids, rng) { const used = PICK[key] || (PICK[key] = []); let opt = ids.filter(i => !used.includes(i)); if (!opt.length) { used.length = 0; opt = ids; } const c = opt[Math.floor((rng || Math.random)() * opt.length)]; used.push(c); if (used.length >= ids.length) used.shift(); return c; }
  function plan(clip, ctx) {
    const rng = ctx.rng || Math.random, has = ctx.has, nm = h => { if (!h) return null; const id = ctx.nameOf(h); return id ? { id, name: true } : { say: ctx.display(h), name: true }; };
    // no parroting: a phrase isn't repeated within 10 s, nor the same lead-in + name within 9 s
    const R = ctx.recent || null, now = ctx.now || 0, fresh = (k, s) => !R || !R.has(k) || now - R.get(k) > s;
    const P = (key, ids) => { const ok = ids.filter(id => has(id) && fresh(id, 10)); return ok.length ? { id: pick(key, ok, rng) } : null; };
    const call = (lead, h) => { if (!h) return []; const a = P("lead_" + lead, [].concat(lead)) || (has([].concat(lead)[0]) ? { id: [].concat(lead)[0] } : null), n = nm(h); if (!n) return [];
      if (!fresh((a ? a.id : "") + "|" + ctx.display(h), 9)) return []; return a ? [a, n] : [n]; };
    if (!clip) return [];
    const k = clip.kind, out = [];
    const push = x => { if (x) out.push(x); };
    switch (k) {
      case "intro": {
        const n = norm(clip.race);
        if (/everest/.test(n)) push(P("intro_e", ["major-events/everest"]));
        else if (/melbourne cup/.test(n)) push(P("intro_c", ["major-events/melbourne_cup"]));
        else push(P("intro", ["major-events/welcome_generic"]));
        break;
      }
      case "away": push(P("away", ["start/away_1", "start/away_2", "start/away_3"])); break;
      case "early": push(P("early", ["early/settle_1", "early/settle_2"])); break;
      case "order": out.push(...call(clip.same ? "transitions/still_leads" : "transitions/takes_over", clip.leader)); break;
      case "mid": {
        if (!clip.same) out.push(...call(pick("mid_new", ["transitions/new_leader", "transitions/takes_over"], rng), clip.leader));
        else if (clip.mover) out.push(...call(clip.moverWide ? "transitions/out_wide" : "transitions/big_run", clip.mover));
        else if (clip.trapped) out.push(...call("transitions/trapped", clip.trapped));
        else if (clip.gapL > 4) out.push(...call("transitions/clear", clip.leader));
        else if ((ctx.midN = (ctx.midN || 0) + 1) % 2) push(P("mid_fill", clip.long ? ["middle/tempo_1", "middle/tempo_2", "middle/back_1"] : ["middle/tempo_1", "middle/back_1"]));
        else out.push(...call("transitions/still_leads", clip.leader));
        break;
      }
      case "turn": push(P("turn", ["home-turn/approach", "home-turn/around"])); out.push(...(clip.closer ? call("transitions/big_run", clip.closer) : call(clip.same ? "transitions/still_leads" : "transitions/takes_over", clip.leader))); break;
      case "turn2": push(clip.marker === 600 ? P("m600", ["final-600/winding"]) : P("turn2", ["home-turn/around"]));
        out.push(...(clip.closer ? call("transitions/big_run", clip.closer) : [])); if (!out.length) out.push(...call(clip.same ? "transitions/still_leads" : "transitions/takes_over", clip.leader)); break;
      case "straight": {
        if (clip.first) push(P("str", ["home-turn/straighten"]));
        else if (clip.marker === 600) push(P("m600", ["final-600/winding"]));
        else if (clip.marker === 400) push(P("m400", clip.bunched ? ["final-400/four_2"] : ["final-400/four_1", "final-400/four_2"]));
        else if (clip.marker === 200) push(P("m200", clip.gapL < 1.5 ? ["final-200/two_2"] : ["final-200/two_1"]));
        else if (clip.marker === 100) push(P("m100", clip.gapL < 1 ? ["final-100/hundred_1"] : ["final-100/hundred_2"]));
        // then ONE name call about the leader or the danger (short: the finish moves fast)
        if (!clip.same) out.push(...call(pick("s_new", ["transitions/new_leader", "transitions/takes_over"], rng), clip.leader));
        else if (clip.gapL > 4) out.push(...call("transitions/clear", clip.leader));
        else if (clip.closing && clip.second) out.push(...call("transitions/big_run", clip.second));
        else if (clip.closer) out.push(...call("transitions/big_run", clip.closer));
        else if (!out.length || clip.final) out.push(...call("transitions/still_leads", clip.leader));
        break;
      }
      case "lead": out.push(...call(clip.tight ? "transitions/new_leader" : pick("late_new", ["transitions/new_leader", "transitions/takes_over"], rng), clip.leader)); break;
      case "photo": push(clip.tight ? P("photo_t", ["photo-finish/line_together"]) : null); push(P("photo", ["photo-finish/photo_1", "photo-finish/photo_2"])); break;
      case "win": {
        // the official result only (the engine never sends this before the timing has decided it)
        out.push(...call("winners/winner_is", clip.winner));
        if (clip.gapL > 4) push(P("w_big", ["winners/extraordinary"]));
        else if (clip.gapL > 2) push(P("w_easy", ["winners/plenty_in_hand"]));
        else if (clip.photo || clip.gapL < 0.5) push(P("w_close", ["photo-finish/what_a_finish"]));
        break;
      }
      default: break;                                        // falls and other rare calls: caption (+ local voice if chosen)
    }
    return out;
  }

  /* ---------- the library ---------- */
  let manifest = null, byId = new Map(), names = new Map(), libErr = null, libLoading = null;
  function index(m) { manifest = m; byId.clear(); names.clear(); for (const c of m.clips) { const id = c.file.replace(/\.mp3$/, ""); byId.set(id, c); if (c.category === "horse-names") names.set(norm(c.phrase), id); } }
  function loadLibrary() {
    if (manifest) return Promise.resolve(manifest);
    if (libLoading) return libLoading;
    libLoading = (async () => {
      try {
        if (inBrowser && window.__FF_COMM_LIB) index(window.__FF_COMM_LIB.manifest);                // single-file build: embedded
        else { const r = await fetch(BASE + "manifest.json", { cache: "no-cache" }); if (!r.ok) throw new Error("HTTP " + r.status); index(await r.json()); }
        return manifest;
      } catch (e) { libErr = "commentary recordings not found (" + e.message + ")"; libLoading = null; return null; }
    })();
    return libLoading;
  }
  const nameClip = h => { const d = h && h.def; if (!d) return null; return names.get(norm(d.say || d.name)) || null; };
  const display = h => (h && h.def && (h.def.say || h.def.name)) || "";

  /* ---------- audio ---------- */
  let ctx = null, outGain = null, buffers = new Map(), loading = new Map();
  const DYN = new Map();                                     // decoded server-generated clips this session (text → AudioBuffer)
  function ensureCtx() {
    if (ctx || !inBrowser) return ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); outGain = ctx.createGain(); outGain.gain.value = vol(); outGain.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }
  function vol() { return typeof COMM !== "undefined" ? COMM.settings.vol : 0.9; }
  async function clipBytes(id) {
    const c = byId.get(id); if (!c) throw new Error("no clip " + id);
    if (inBrowser && window.__FF_COMM_LIB && window.__FF_COMM_LIB.data[c.file]) { const b = atob(window.__FF_COMM_LIB.data[c.file]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; }
    const r = await fetch(BASE + c.file); if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer();
  }
  function decode(ab) { return new Promise((res, rej) => { try { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); } }); }
  function load(id) {
    if (buffers.has(id)) return Promise.resolve(buffers.get(id));
    if (loading.has(id)) return loading.get(id);
    const p = (async () => { if (!ensureCtx()) return null; const b = await decode(await clipBytes(id)); buffers.set(id, b); loading.delete(id); trim(); return b; })().catch(() => { loading.delete(id); return null; });
    loading.set(id, p); return p;
  }
  // memory cap: every phrase stays decoded (≈40 clips); horse names beyond the 80 most recent are released
  const nameUse = [];
  function trim() { const nm = [...buffers.keys()].filter(k => k.startsWith("horse-names/")); if (nm.length <= 80) return; nm.sort((a, b) => nameUse.indexOf(a) - nameUse.indexOf(b)); for (const k of nm.slice(0, nm.length - 80)) buffers.delete(k); }

  /* ---------- the optional server (Mode B) ---------- */
  const srv = { status: null, checked: 0, used: 0, perRace: 0, errors: 0, lastErr: null, latency: [] };
  async function serverStatus(force) {
    if (!inBrowser || location.protocol === "file:") return null;
    if (!force && srv.status && performance.now() - srv.checked < 60000) return srv.status;
    try { const r = await fetch("/api/tts/status", { cache: "no-store" }); srv.status = r.ok ? await r.json() : { configured: false, reason: "HTTP " + r.status }; }
    catch (e) { srv.status = { configured: false, reason: "no game server (single-file / offline)" }; }
    srv.checked = performance.now(); return srv.status;
  }
  const DYN_CACHE = "ff-eleven-dyn-v1", DYN_MAX = 300;
  async function dynFetch(text, kind, timeoutMs) {
    const key = kind + ":" + text;
    if (DYN.has(key)) return DYN.get(key);
    let bytes = null, cache = null;
    try { cache = await caches.open(DYN_CACHE); const hit = await cache.match("/tts/" + encodeURIComponent(key)); if (hit) bytes = await hit.arrayBuffer(); } catch (e) {}
    if (!bytes) {
      const st = await serverStatus(); if (!st || !st.configured) return null;
      const ac = new AbortController(), t0 = performance.now(), to = setTimeout(() => ac.abort(), timeoutMs || 8000);
      try {
        const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, kind }), signal: ac.signal });
        if (!r.ok) { const j = await r.json().catch(() => ({})); srv.errors++; srv.lastErr = j.error || ("HTTP " + r.status); return null; }
        bytes = await r.arrayBuffer(); srv.used++; srv.latency.push(performance.now() - t0); if (srv.latency.length > 20) srv.latency.shift();
        if (cache) { try { await cache.put("/tts/" + encodeURIComponent(key), new Response(bytes.slice(0), { headers: { "content-type": "audio/mpeg" } })); const ks = await cache.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - DYN_MAX))) await cache.delete(k); } catch (e) {} }
      } catch (e) { srv.errors++; srv.lastErr = e.name === "AbortError" ? "timeout" : e.message; return null; } finally { clearTimeout(to); }
    }
    if (!ensureCtx()) return null;
    try { const b = await decode(bytes); DYN.set(key, b); if (DYN.size > 120) DYN.delete(DYN.keys().next().value); return b; } catch (e) { return null; }
  }

  /* ---------- race preparation: everything decoded BEFORE the gates open ---------- */
  let prepared = null, prepTask = null, prepDone = false;
  function prepare(race) { prepDone = false; prepTask = prepare0(race).finally(() => { prepDone = true; }); return prepTask; }
  async function prepare0(race) {
    if (!active()) return;
    const lib = await loadLibrary(); if (!lib || !ensureCtx()) return;
    const ids = [...byId.keys()].filter(id => !id.startsWith("horse-names/"));
    const field = race.horses.map(h => nameClip(h)).filter(Boolean);
    await Promise.all(ids.concat(field).map(load));
    for (const id of field) { const i = nameUse.indexOf(id); if (i >= 0) nameUse.splice(i, 1); nameUse.push(id); }
    prepared = race;
    if (SET.mode === "eleven_plus") {                       // names the recordings lack: generated now, before the start
      srv.perRace = 0;
      for (const h of race.horses) { if (nameClip(h) || srv.perRace >= 24) continue; srv.perRace++; await dynFetch(display(h) + "!", "name", 9000); }
    }
  }

  /* ---------- speaking a line ---------- */
  let seq = 0, playing = [], endTimer = null;
  function stopAll() { seq++; for (const s of playing) { try { s.stop(); } catch (e) {} } playing = []; if (endTimer) { clearTimeout(endTimer); endTimer = null; } if (typeof COMM !== "undefined" && COMM.cancelLocal) COMM.cancelLocal(); }
  const live = { n: 0, lastT: -1e9 };
  function speak(text, prm, onEnd, info) {
    stopAll(); const my = seq; let done = false;
    const finish = () => { if (done || my !== seq) return; done = true; if (endTimer) { clearTimeout(endTimer); endTimer = null; } onEnd && onEnd(); };
    const est = 0.8 + String(text).split(/\s+/).length / 2.9;
    if (!ensureCtx() || !manifest) { endTimer = setTimeout(finish, est * 1000); return; }
    if (info && info.clip && info.clip.kind === "intro" && prepTask && !prepDone) { prepTask.then(() => { if (my === seq && !done) speak(text, prm, onEnd, info); }); endTimer = setTimeout(finish, 4000); return; }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    outGain.gain.value = vol();
    const now = performance.now() / 1000, items = plan(info && info.clip, { has: id => buffers.has(id), nameOf: nameClip, display, rng: Math.random, recent, now });
    // remember what was said (phrases, and lead-in + name pairs) for the no-repeat rule
    for (let i = 0; i < items.length; i++) { const it = items[i]; if (it.id && !it.id.startsWith("horse-names/")) recent.set(it.id, now); if (it.name) recent.set((items[i - 1] && items[i - 1].id ? items[i - 1].id : "") + "|" + (it.say || (byId.get(it.id) || {}).phrase || ""), now); }
    if (recent.size > 200) for (const [k, t] of recent) if (now - t > 30) recent.delete(k);
    // resolve each item: a decoded recording, a server-generated name (Mode B), or the local voice for a missing name
    const parts = [];
    for (const it of items) {
      if (it.id) { const b = buffers.get(it.id); if (b) { parts.push({ buf: b }); if (it.id.startsWith("horse-names/")) { const i = nameUse.indexOf(it.id); if (i >= 0) nameUse.splice(i, 1); nameUse.push(it.id); } } }
      else if (it.say) { const d = DYN.get("name:" + it.say + "!"); if (d) parts.push({ buf: d, dyn: true }); else if (SET.nameFallback === "local") parts.push({ say: it.say }); }
    }
    stats.lines++; if (parts.length) stats.voiced++; if (parts.some(p => p.say)) stats.local++; if (parts.some(p => p.dyn)) stats.dyn++;
    lastPlan = { text, items: items.map(i => i.id || ("say:" + i.say)), parts: parts.map(p => p.say ? "local:" + p.say : p.dyn ? "elevenlabs-api" : "recorded") };
    if (!parts.length) {
      // nothing recorded for this line: Mode B "live lines" may ask for it in full (calm moments only, dropped if late)
      if (SET.mode === "eleven_plus" && SET.liveLines && info && info.I < 2.2 && live.n < 8 && performance.now() - live.lastT > 6000) {
        live.n++; live.lastT = performance.now(); const t0 = performance.now();
        dynFetch(text, "line", 2200).then(b => { if (my !== seq || done) return; if (!b || performance.now() - t0 > 2400) { finish(); return; } stats.dyn++; play([{ buf: b }], 0, my, finish); });
        endTimer = setTimeout(finish, 2600 + est * 1000); return;
      }
      endTimer = setTimeout(finish, est * 650); return;      // caption-only pacing
    }
    play(parts, 0, my, finish);
    const tot = parts.reduce((t, p) => t + (p.buf ? p.buf.duration + 0.06 : 1.2), 0);
    endTimer = setTimeout(finish, (tot + 2.5) * 1000);        // safety net if an ended event never arrives
  }
  function play(parts, i, my, finish) {
    if (my !== seq) return;
    if (i >= parts.length) { finish(); return; }
    const p = parts[i];
    if (p.say) { if (typeof COMM !== "undefined" && COMM.sayLocal) COMM.sayLocal(p.say + "!", 3, () => play(parts, i + 1, my, finish)); else play(parts, i + 1, my, finish); return; }
    const src = ctx.createBufferSource(); src.buffer = p.buf; src.connect(outGain);
    src.onended = () => { playing = playing.filter(x => x !== src); setTimeout(() => play(parts, i + 1, my, finish), 45); };
    playing.push(src); src.start();
  }
  const stats = { lines: 0, voiced: 0, local: 0, dyn: 0 };
  const recent = new Map();
  let lastPlan = null;

  function active() { return inBrowser && (SET.mode === "eleven" || SET.mode === "eleven_plus") && !libErr && typeof COMM !== "undefined" && COMM.settings.on && COMM.settings.vol > 0; }

  /* ---------- voice test (Settings) ---------- */
  // plays a short sequence of recordings (by id) and/or a server-generated phrase; reports which backend actually spoke
  async function test(ids, opts) {
    opts = opts || {}; stopAll();
    const lib = await loadLibrary(); if (!lib) return { backend: "unavailable", detail: libErr };
    if (!ensureCtx()) return { backend: "unavailable", detail: "Web Audio not available" };
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const parts = [], labels = [], t0 = performance.now();
    for (const id of ids) { const b = await load(id); if (b) { parts.push({ buf: b }); labels.push("recorded"); } }
    if (opts.name) {
      const id = names.get(norm(opts.name));
      if (id) { const b = await load(id); if (b) { parts.push({ buf: b }); labels.push("recorded"); } }
      else if (SET.mode === "eleven_plus") { const b = await dynFetch(opts.name + "!", "name", 9000); if (b) { parts.push({ buf: b, dyn: true }); labels.push("api"); } else { parts.push({ say: opts.name }); labels.push("local"); } }
      else { parts.push({ say: opts.name }); labels.push("local"); }
    }
    for (const id of opts.tail || []) { const b = await load(id); if (b) { parts.push({ buf: b }); labels.push("recorded"); } }
    const my = ++seq; outGain.gain.value = vol();
    play(parts, 0, my, () => {});
    const backend = labels.includes("api") ? "ElevenLabs API (your voice, generated now)" : labels.every(l => l === "recorded") ? "ElevenLabs recorded (your voice)" : labels.includes("recorded") ? "ElevenLabs recorded + local voice for the name" : "Local voice";
    return { backend, firstMs: performance.now() - t0, parts: labels, missingName: opts.name && !names.has(norm(opts.name)) };
  }

  return {
    VOICE_ID, VOICE_NAME, plan, norm,
    get settings() { return SET; },
    set(k, v) { SET[k] = v; save(); if (k === "mode" && !(v === "eleven" || v === "eleven_plus")) stopAll(); },
    active, loadLibrary, prepare, speak, cancel: stopAll, test, serverStatus,
    get ready() { return !!manifest; }, get error() { return libErr; },
    hasName: n => names.has(norm(n)), get nameCount() { return names.size; }, get clipCount() { return byId.size; },
    get stats() { return Object.assign({ server: Object.assign({}, srv, { latencyMed: srv.latency.length ? srv.latency.slice().sort((a, b) => a - b)[srv.latency.length >> 1] : null }) }, stats); },
    get lastPlan() { return lastPlan; }, get decoded() { return buffers.size; },
    _index: index,
  };
})();
if (typeof window !== "undefined" && typeof document !== "undefined") setTimeout(() => { if (ELEVEN.settings.mode === "eleven" || ELEVEN.settings.mode === "eleven_plus") ELEVEN.loadLibrary(); }, 0);   // index the recordings at start-up
if (typeof module !== "undefined" && module.exports) module.exports = ELEVEN;
