'use strict';
/* =====================================================================
   FINAL FURLONG — ENHANCED COMMENTARY VOICE (voice.js)
   Free, local neural text-to-speech for the race caller, with the browser's own voices as the fallback.
     • Engines: "kokoro" (Kokoro-82M, int8, 92 MB — the most natural), "piper" (Piper VITS medium, ~65 MB — much faster),
       "system" (window.speechSynthesis — the previous behaviour), or commentary off.
     • Files are downloaded ONCE (on request, from the settings screen) into the browser's Cache Storage and verified;
       after that every line is generated locally in a Web Worker — no speech-generation requests leave the machine,
       no API keys, no per-race cost. Sources, in order: this server's /voices/ folder (if present), the official
       Hugging Face repositories, then a jsDelivr npm mirror. The Kokoro model is checked against its SHA-256 whatever
       the source, so a mirror cannot serve a different file.
     • Live calling: each line is split into clauses; the first clause is synthesised first so speech starts quickly,
       the rest stream behind it. The speaker releases the caller a little before the audio ends ("lookahead") so the
       next line is generated while this one is still being spoken — continuous calling without dead air. A line whose
       first clause isn't ready in time is DROPPED (never played late), and the caller moves on with fresh information.
     • Delivery: intensity (from the caller) raises Kokoro's own speaking speed (its duration model — not a playback
       speed-up), loudness and a little presence; a gentle broadcast chain (high-pass, presence lift, compressor) makes
       it sit like a racecourse PA/TV call. A neural voice still cannot truly shout; that limit is stated in the UI.
   ===================================================================== */
const VOICE = (() => {
  const inBrowser = typeof window !== "undefined";
  const CACHE = "ff-voice-v1";
  const ORT_V = "1.20.1", PHON_V = "1.2.1", KJS_V = "1.2.1";
  const JSD = "https://cdn.jsdelivr.net/npm/", HF = "https://huggingface.co/";
  const KOKORO_SHA = "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478";
  // runtime (shared by both neural engines)
  const RUNTIME = [
    { key: "ort.mjs", urls: ["voices/runtime/ort.wasm.min.mjs", JSD + `onnxruntime-web@${ORT_V}/dist/ort.wasm.min.mjs`], size: 49e3 },
    { key: "ort-glue.mjs", urls: ["voices/runtime/ort-wasm-simd-threaded.mjs", JSD + `onnxruntime-web@${ORT_V}/dist/ort-wasm-simd-threaded.mjs`], size: 25e3 },
    { key: "ort.wasm", urls: ["voices/runtime/ort-wasm-simd-threaded.wasm", JSD + `onnxruntime-web@${ORT_V}/dist/ort-wasm-simd-threaded.wasm`], size: 11.2e6 },
    { key: "phonemizer.js", urls: ["voices/runtime/phonemizer.js", JSD + `phonemizer@${PHON_V}/dist/phonemizer.js`], size: 1.32e6 },
  ];
  const KOKORO_VOICES = {
    am_michael: "Michael — US male (calm, clear)", am_fenrir: "Fenrir — US male (deeper)", am_puck: "Puck — US male (brighter, energetic)",
    bm_george: "George — British male", bm_fable: "Fable — British male", af_heart: "Heart — US female (highest-rated voice)", af_bella: "Bella — US female (lively)", bf_emma: "Emma — British female",
  };
  const PIPER_VOICES = {
    "en_GB-northern_english_male-medium": { label: "Northern English male (medium)", path: "en/en_GB/northern_english_male/medium/" },
    "en_GB-alan-medium": { label: "Alan — British male (medium)", path: "en/en_GB/alan/medium/" },
    "en_US-ryan-high": { label: "Ryan — US male (high; dataset licence is non-commercial)", path: "en/en_US/ryan/high/" },
  };
  const SET = { engine: "system", kokoroVoice: "am_michael", piperVoice: "en_GB-northern_english_male-medium", rate: 1, broadcast: true };
  if (inBrowser) try { Object.assign(SET, JSON.parse(localStorage.getItem("ff_voice") || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem("ff_voice", JSON.stringify(SET)); } catch (e) {} };

  function kokoroFiles(voice) {
    return [
      { key: "kokoro/model_quantized.onnx", sha: KOKORO_SHA, size: 92.4e6, urls: ["voices/kokoro/model_quantized.onnx", HF + "onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx",
        { parts: [0, 1, 2, 3, 4, 5].map(i => JSD + `kokoro-q8-shards@1.0.0/kokoro-q8.part${i}.bin`) }] },
      { key: `kokoro/voices/${voice}.bin`, size: 522e3, urls: [`voices/kokoro/${voice}.bin`, JSD + `kokoro-js@${KJS_V}/voices/${voice}.bin`, HF + `onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${voice}.bin`] },
    ];
  }
  function piperFiles(voice) {
    const v = PIPER_VOICES[voice] || PIPER_VOICES["en_GB-northern_english_male-medium"], base = HF + "rhasspy/piper-voices/resolve/v1.0.0/" + v.path + voice;
    return [{ key: `piper/${voice}.onnx`, size: 63e6, urls: [`voices/piper/${voice}.onnx`, base + ".onnx"] }, { key: `piper/${voice}.onnx.json`, size: 5e3, urls: [`voices/piper/${voice}.onnx.json`, base + ".onnx.json"] }];
  }
  const filesFor = eng => eng === "kokoro" ? RUNTIME.concat(kokoroFiles(SET.kokoroVoice)) : eng === "piper" ? RUNTIME.concat(piperFiles(SET.piperVoice)) : [];
  const ck = key => "https://final-furlong.local/voice/" + key;          // cache keys (never fetched from the network)

  /* ---------- downloads (Cache Storage) ---------- */
  async function cached(key) { try { const c = await caches.open(CACHE); return !!(await c.match(ck(key))); } catch (e) { return false; } }
  async function status(eng) { const fs = filesFor(eng); if (!fs.length) return { ready: true, missing: [] }; const miss = []; for (const f of fs) if (!(await cached(f.key))) miss.push(f.key); return { ready: !miss.length, missing: miss, total: fs.reduce((a, f) => a + f.size, 0) }; }
  async function fetchBytes(url, onBytes) {
    const r = await fetch(url, { mode: "cors" }); if (!r.ok) throw new Error(url + " → HTTP " + r.status);
    if (!r.body || !r.body.getReader) { const b = new Uint8Array(await r.arrayBuffer()); onBytes(b.length); return b; }
    const rd = r.body.getReader(), chunks = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; onBytes(value.length); }
    const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
  }
  async function sha256(bytes) { const d = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join(""); }
  let downloading = null;
  async function download(eng, onProgress) {
    if (downloading) return downloading;
    downloading = (async () => {
      const fs = filesFor(eng), total = fs.reduce((a, f) => a + f.size, 0); let got = 0;
      const c = await caches.open(CACHE);
      for (const f of fs) {
        if (await c.match(ck(f.key))) { got += f.size; onProgress && onProgress(got / total, f.key, "cached"); continue; }
        let bytes = null, err = null, start = got;
        for (const src of f.urls) {
          got = start;
          try {
            if (src.parts) { const parts = []; for (const u of src.parts) parts.push(await fetchBytes(u, n => { got += n; onProgress && onProgress(Math.min(0.999, got / total), f.key); })); const len = parts.reduce((a, p) => a + p.length, 0); bytes = new Uint8Array(len); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; } }
            else bytes = await fetchBytes(src, n => { got += n; onProgress && onProgress(Math.min(0.999, got / total), f.key); });
            if (f.sha) { const h = await sha256(bytes); if (h !== f.sha) throw new Error("checksum mismatch from " + (src.parts ? "mirror" : src)); }
            break;
          } catch (e) { err = e; bytes = null; }
        }
        if (!bytes) throw err || new Error("could not download " + f.key);
        await c.put(ck(f.key), new Response(bytes, { headers: { "content-type": "application/octet-stream", "x-ff-size": String(bytes.length) } }));
        got = start + f.size; onProgress && onProgress(got / total, f.key, "done");
      }
      return true;
    })();
    try { return await downloading; } finally { downloading = null; }
  }
  async function remove(eng) { const c = await caches.open(CACHE); for (const f of filesFor(eng)) if (!RUNTIME.includes(f)) await c.delete(ck(f.key)); if (worker && workerEngine === eng) stopWorker(); }

  /* ---------- the worker (built from source: works in the single-file build too) ---------- */
  function piperCore(ort, phonemize) {
    let sess = null, cfg = null;
    return {
      async load(modelBytes, cfgText) { cfg = JSON.parse(cfgText); sess = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }); },
      async synth(text, voice, speed) {
        const lang = (cfg.espeak && cfg.espeak.voice || "en-us").startsWith("en-gb") || (cfg.espeak && cfg.espeak.voice === "en") ? "en-gb" : "en-us";
        const ph = (await phonemize(text, lang)).join(" "), M = cfg.phoneme_id_map, ids = [...M["^"]];
        for (const ch of ph) if (M[ch]) ids.push(...M[ch], ...M["_"]);
        ids.push(...M["$"]);
        const inf = cfg.inference || {}, r = await sess.run({ input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
          scales: new ort.Tensor("float32", new Float32Array([inf.noise_scale || 0.667, (inf.length_scale || 1) / (speed || 1), inf.noise_w || 0.8]), [3]) });
        const a = r.output.data; let mx = 0; for (let i = 0; i < a.length; i++) mx = Math.max(mx, Math.abs(a[i])); const g = mx > 0 ? 0.92 / mx : 1; const outA = new Float32Array(a.length); for (let i = 0; i < a.length; i++) outA[i] = a[i] * g;
        return { audio: outA, sampleRate: cfg.audio.sample_rate };
      },
    };
  }
  function workerSource() {
    return `
const CACHE = ${JSON.stringify(CACHE)}; const ck = k => ${JSON.stringify(ck(""))} + k;
${typeof kokoroCore === "function" ? kokoroCore.toString() : "function kokoroCore() { throw new Error('kokoro core missing'); }"}
${piperCore.toString()}
async function bytes(key) { const c = await caches.open(CACHE), r = await c.match(ck(key)); if (!r) throw new Error("missing " + key); return new Uint8Array(await r.arrayBuffer()); }
async function blobUrl(key, type) { return URL.createObjectURL(new Blob([await bytes(key)], { type })); }
let eng = null, voice = null, engine = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      const t0 = performance.now();
      const ort = await import(await blobUrl("ort.mjs", "text/javascript"));
      // both files from the local cache, as blob URLs (the loader can't resolve paths relative to a blob: module)
      ort.env.wasm.wasmPaths = { mjs: await blobUrl("ort-glue.mjs", "text/javascript"), wasm: await blobUrl("ort.wasm", "application/wasm") };
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)) : 1;
      const ph = await import(await blobUrl("phonemizer.js", "text/javascript"));
      engine = m.engine;
      if (engine === "kokoro") { eng = kokoroCore(ort, ph.phonemize); await eng.load(await bytes(m.model)); voice = new Float32Array((await bytes(m.voice)).buffer); }
      else { eng = piperCore(ort, ph.phonemize); await eng.load(await bytes(m.model), new TextDecoder().decode(await bytes(m.config))); }
      self.postMessage({ type: "ready", ms: performance.now() - t0, threads: ort.env.wasm.numThreads });
    } else if (m.type === "voice") { voice = new Float32Array((await bytes(m.voice)).buffer); self.postMessage({ type: "voiced" }); }
    else if (m.type === "synth") {
      const t0 = performance.now(), r = await eng.synth(m.text, voice, m.speed, m.british);
      self.postMessage({ type: "audio", id: m.id, audio: r.audio, sampleRate: r.sampleRate || 24000, ms: performance.now() - t0 }, [r.audio.buffer]);
    }
  } catch (err) { self.postMessage({ type: "error", id: m.id, error: String(err && err.message || err) }); }
};`;
  }
  let worker = null, workerEngine = null, workerReady = null, jobSeq = 0, busy = false;
  const pending = new Map();
  // stop the worker and fail everything waiting on it (so nothing hangs when the engine or voice changes)
  function stopWorker() { if (worker) worker.terminate(); worker = null; workerEngine = null; for (const p of pending.values()) p.rej(new Error("voice engine restarted")); pending.clear(); busy = false; }
  function startWorker(eng) {
    if (worker && workerEngine === eng) return workerReady;
    if (worker) stopWorker();
    workerEngine = eng;
    workerReady = new Promise((res, rej) => {
      let w; try { w = new Worker(URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" })), { type: "module" }); } catch (e) { rej(e); return; }
      worker = w;
      w.onmessage = e => { const m = e.data;
        if (m.type === "ready") { stats.initMs = m.ms; stats.threads = m.threads; res(true); }
        else if (m.type === "error" && m.id == null) rej(new Error(m.error));
        else if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.type === "error" ? p.rej(new Error(m.error)) : p.res(m); } };
      w.onerror = e => rej(new Error(e.message || "worker failed"));
      const msg = eng === "kokoro" ? { type: "init", engine: eng, model: "kokoro/model_quantized.onnx", voice: `kokoro/voices/${SET.kokoroVoice}.bin` } : { type: "init", engine: eng, model: `piper/${SET.piperVoice}.onnx`, config: `piper/${SET.piperVoice}.onnx.json` };
      w.postMessage(msg);
    });
    workerReady.catch(() => stopWorker());
    return workerReady;
  }
  const stats = { initMs: 0, threads: 1, lastMs: 0, lastAudio: 0, rtf: null, firstMs: 900, spoken: 0, dropped: 0, lastStartMs: null };
  // one request in flight at a time; live lines (pri 10) always go ahead of background pre-caching (pri 0)
  const queue = [];
  function synth(text, speed, pri) {
    return new Promise((res, rej) => { queue.push({ text, speed, pri: pri || 0, res, rej, t: performance.now() }); pump(); })
      .then(m => { stats.lastMs = m.ms; stats.lastAudio = m.audio.length / m.sampleRate; const r = m.ms / 1000 / Math.max(0.2, stats.lastAudio); stats.rtf = stats.rtf == null ? r : stats.rtf * 0.7 + r * 0.3; return m; });
  }
  function pump() {
    if (busy || !queue.length || !worker) return;
    queue.sort((a, b) => b.pri - a.pri || a.t - b.t);
    const j = queue.shift(), id = ++jobSeq; busy = true;
    pending.set(id, { res: m => { busy = false; j.res(m); pump(); }, rej: e => { busy = false; j.rej(e); pump(); } });
    worker.postMessage({ type: "synth", id, text: j.text, speed: j.speed, british: workerEngine === "kokoro" && SET.kokoroVoice[0] === "b" });
  }
  function dropQueued(minPri) { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].pri >= minPri) { queue[i].rej(new Error("cancelled")); queue.splice(i, 1); } }

  /* ---------- audio output: a gentle broadcast chain ---------- */
  let ctx = null, chain = null;
  function audioCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 110;
    const pres = ctx.createBiquadFilter(); pres.type = "peaking"; pres.frequency.value = 2900; pres.Q.value = 0.9; pres.gain.value = 2;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3.2; comp.attack.value = 0.004; comp.release.value = 0.18;
    const out = ctx.createGain(); out.gain.value = 0.9;
    hp.connect(pres); pres.connect(comp); comp.connect(out); out.connect(ctx.destination);
    chain = { input: hp, pres, out, bypass: ctx.createGain() }; chain.bypass.connect(out);
    return ctx;
  }
  function vol() { return typeof COMM !== "undefined" ? COMM.settings.vol : 0.9; }

  /* ---------- the live speaker (same interface as the browser speaker: speak / cancel) ---------- */
  const CLAUSE_STOCK = ["And they're off", "They're away", "They straighten for home", "Into the straight", "They turn for home", "Coming to the turn", "They're approaching the home turn", "Down to the home turn now",
    "past halfway", "they're well bunched up", "Two hundred to go", "a hundred to go", "fifty metres to go", "It's going to be close!", "here they come", "What a finish!", "It's a photo!"];
  function clauses(text) {
    const raw = text.split(/(?<=[,;!?.])\s+/).map(s => s.trim()).filter(Boolean), out = [];
    for (const c of raw) { if (out.length && out[out.length - 1].split(/\s+/).length < 3) out[out.length - 1] += " " + c; else out.push(c); }
    return out;
  }
  const cache = new Map();                                 // clause → { audio, sampleRate }  (stock phrases and repeats)
  const cKey = (t, sp) => t.toLowerCase().replace(/[^a-z0-9' ]/g, "") + "|" + sp.toFixed(2);
  const speaker = {
    jobs: [], tail: 0, sources: [],
    speedFor(level) { return Math.max(0.9, Math.min(1.32, (0.98 + 0.075 * ((level || 1) - 1)) * (SET.rate || 1))); },
    async clip(text, speed, pri) {
      const k = cKey(text, speed); if (cache.has(k)) return cache.get(k);
      const m = await synth(text, speed, pri == null ? 10 : pri); const v = { audio: m.audio, sampleRate: m.sampleRate }; if (text.split(/\s+/).length <= 6) { cache.set(k, v); if (cache.size > 120) cache.delete(cache.keys().next().value); } return v;
    },
    play(v, at, level) {
      const c = audioCtx(); const b = c.createBuffer(1, v.audio.length, v.sampleRate); b.copyToChannel ? b.copyToChannel(v.audio, 0) : b.getChannelData(0).set(v.audio);
      const s = c.createBufferSource(); s.buffer = b; const g = c.createGain(); g.gain.value = vol() * (0.82 + 0.05 * (level || 1));
      s.connect(g); g.connect(SET.broadcast ? chain.input : chain.bypass);
      if (chain.pres) chain.pres.gain.setTargetAtTime(SET.broadcast ? 1.5 + 0.7 * ((level || 1) - 1) : 0, c.currentTime, 0.2);
      s.start(at); this.sources.push(s); s.onended = () => { this.sources = this.sources.filter(x => x !== s); };
      return at + b.duration;
    },
    speak(text, prm, onEnd) {
      const c = audioCtx(); if (!c || !worker) { onEnd && onEnd(); return; }
      if (c.state === "suspended") c.resume();
      const job = { text, level: prm.level, onEnd, ended: false, cancelled: false, t0: c.currentTime };
      this.jobs.push(job);
      const speed = this.speedFor(prm.level), parts = clauses(text), lead = Math.min(2.2, Math.max(0.25, stats.firstMs / 1000 * 1.15));
      const maxWait = this.noDeadline ? 600 : 1.5 + Math.max(0, this.tail - c.currentTime);   // drop a line that can't start within ~1.5 s of when it's due
      const release = () => { if (job.ended) return; job.ended = true; this.jobs = this.jobs.filter(j => j !== job); job.onEnd && job.onEnd(); };
      const tp0 = performance.now();
      // the first clause must be ready within maxWait — if not, the line is dropped at once (never played late)
      const deadline = setTimeout(() => { if (job.started || job.cancelled) return; job.cancelled = true; stats.dropped++; if (this.onDrop) this.onDrop(text); release(); }, maxWait * 1000);
      (async () => {
        let at = null, i = 0;
        for (const part of parts) {
          if (job.cancelled) return;
          const t1 = performance.now();
          let v; try { v = await this.clip(part, speed, 10); } catch (e) { clearTimeout(deadline); release(); return; }
          if (job.cancelled) return;
          if (i === 0) stats.firstMs = stats.firstMs * 0.6 + (performance.now() - t1) * 0.4;
          const now = c.currentTime;
          if (at == null) {
            clearTimeout(deadline); job.started = true; stats.spoken++;
            at = Math.max(now + 0.03, this.tail + 0.12); stats.lastStartMs = performance.now() - tp0 + (at - now) * 1000;
            const delay = Math.max(0, (at - now) * 1000); setTimeout(() => { if (!job.cancelled && typeof COMM !== "undefined" && COMM._caption) COMM._caption(text, prm.level, true); }, delay);
            if (typeof audio !== "undefined" && audio.commDuck) setTimeout(() => !job.cancelled && audio.commDuck(1, prm.level || 1), delay);
          } else if (now > at + 0.8) break;                                                              // the rest arrived too late: stop here
          at = this.play(v, Math.max(at, now + 0.02), prm.level) + (/[,;]$/.test(part) ? 0.05 : 0.1);
          this.tail = Math.max(this.tail, at);
          i++;
        }
        // early release: let the caller compose the next line while this one is still being spoken
        const tick = () => { if (job.cancelled || job.ended) return; if (audioCtx().currentTime >= this.tail - lead) { release(); setTimeout(() => { if (!this.jobs.length && audioCtx().currentTime >= this.tail - 0.05 && typeof audio !== "undefined" && audio.commDuck) audio.commDuck(0, 1); }, Math.max(0, (this.tail - audioCtx().currentTime) * 1000 + 80)); } else setTimeout(tick, 40); };
        tick();
      })();
    },
    cancel() { dropQueued(10); for (const j of this.jobs) j.cancelled = true; this.jobs = []; for (const s of this.sources) { try { s.stop(); } catch (e) {} } this.sources = []; this.tail = ctx ? ctx.currentTime : 0; if (typeof audio !== "undefined" && audio.commDuck) audio.commDuck(0, 1); },
  };

  /* ---------- public API ---------- */
  async function ensureEngine() {
    const eng = SET.engine; if (eng !== "kokoro" && eng !== "piper") return false;
    const st = await status(eng); if (!st.ready) return false;
    await startWorker(eng); return true;
  }
  let activeOK = false;
  // can this engine call a LIVE race on this computer? It must generate faster than real time with some headroom.
  const LIVE_RTF = 0.85;
  async function calibrate() { if (stats.rtf != null) return stats.rtf; try { await synth("They're racing, and Desert Comet leads them.", 1.1, 5); } catch (e) {} return stats.rtf; }
  async function warm() { try { activeOK = await ensureEngine(); if (activeOK) await calibrate(); if (activeOK && !warm.done) { warm.done = true; for (const p of CLAUSE_STOCK) speaker.clip(p, speaker.speedFor(3), 0).catch(() => {}); } } catch (e) { activeOK = false; console.warn("Enhanced voice unavailable — using the standard voice", e); } return activeOK; }
  if (inBrowser && (SET.engine === "kokoro" || SET.engine === "piper")) setTimeout(warm, 1500);
  return {
    get settings() { return SET; }, KOKORO_VOICES, PIPER_VOICES, stats, cacheSize: () => cache.size,
    set(k, v) { SET[k] = v; save(); if (k === "engine" || k === "kokoroVoice" || k === "piperVoice") { activeOK = false; stats.rtf = null; stats.firstMs = 900; warm.done = false; dropQueued(0); stopWorker(); cache.clear(); } },
    status, download, remove, warm,
    supported: () => inBrowser && typeof Worker !== "undefined" && !!(window.AudioContext || window.webkitAudioContext) && typeof caches !== "undefined" && !!(crypto && crypto.subtle),
    // the speaker the race caller should use right now (null = use the browser voice)
    speaker: () => activeOK && worker && workerEngine === SET.engine && stats.rtf != null && stats.rtf <= LIVE_RTF ? speaker : null,
    // why the enhanced voice isn't calling the race (null when it is)
    liveIssue: () => (SET.engine !== "kokoro" && SET.engine !== "piper") ? null : !activeOK ? "not downloaded" : stats.rtf == null ? "still measuring" : stats.rtf > LIVE_RTF ? `too slow on this computer (${(1 / stats.rtf).toFixed(1)}× real time)` : null,
    LIVE_RTF,
    // the voice test: no drop deadline (a sample always plays); reports when speech started and the generation speed
    async sample(text, level) { const ok = await warm(); if (!ok) return null; speaker.cancel(); stats.lastStartMs = null; speaker.noDeadline = true;
      await new Promise(res => speaker.speak(text, { level, rate: 1, pitch: 1 }, res)); speaker.noDeadline = false;
      return { firstMs: stats.lastStartMs, rtf: stats.rtf, threads: stats.threads }; },
    get engineLabel() { return SET.engine === "kokoro" ? "Kokoro (local neural)" : SET.engine === "piper" ? "Piper (local neural)" : SET.engine === "off" ? "Off" : "System voice"; },
    _workerSource: workerSource, _clauses: clauses, _speaker: speaker,
  };
})();
