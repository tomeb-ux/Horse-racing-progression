'use strict';
/* =====================================================================
   FINAL FURLONG — KOKORO TTS CORE (voice-core.js)
   The environment-neutral heart of the enhanced commentary voice: text normalisation → eSpeak NG phonemes → Kokoro
   tokens → ONNX inference → 24 kHz audio. The same function runs inside the browser Web Worker (voice.js builds the
   worker from this source) and in Node for the automated tests and the sample generator (tools/voice-samples.mjs).
   Model: Kokoro-82M v1.0 (Apache-2.0, hexgrad), int8 ONNX export (onnx-community). Normalisation and phoneme fixes are
   ported from kokoro-js (Apache-2.0, hexgrad / Xenova). Phonemes: the `phonemizer` package (eSpeak NG compiled to WASM).
   ===================================================================== */
function kokoroCore(ort, phonemize) {
  const VOCAB = {";":1,":":2,",":3,".":4,"!":5,"?":6,"—":9,"…":10,"\"":11,"(":12,")":13,"“":14,"”":15," ":16,"̃":17,"ʣ":18,"ʥ":19,"ʦ":20,"ʨ":21,"ᵝ":22,"ꭧ":23,"A":24,"I":25,"O":31,"Q":33,"S":35,"T":36,"W":39,"Y":41,"ᵊ":42,"a":43,"b":44,"c":45,"d":46,"e":47,"f":48,"h":50,"i":51,"j":52,"k":53,"l":54,"m":55,"n":56,"o":57,"p":58,"q":59,"r":60,"s":61,"t":62,"u":63,"v":64,"w":65,"x":66,"y":67,"z":68,"ɑ":69,"ɐ":70,"ɒ":71,"æ":72,"β":75,"ɔ":76,"ɕ":77,"ç":78,"ɖ":80,"ð":81,"ʤ":82,"ə":83,"ɚ":85,"ɛ":86,"ɜ":87,"ɟ":90,"ɡ":92,"ɥ":99,"ɨ":101,"ɪ":102,"ʝ":103,"ɯ":110,"ɰ":111,"ŋ":112,"ɳ":113,"ɲ":114,"ɴ":115,"ø":116,"ɸ":118,"θ":119,"œ":120,"ɹ":123,"ɾ":125,"ɻ":126,"ʁ":128,"ɽ":129,"ʂ":130,"ʃ":131,"ʈ":132,"ʧ":133,"ʊ":135,"ʋ":136,"ʌ":138,"ɣ":139,"ɤ":140,"χ":142,"ʎ":143,"ʒ":147,"ʔ":148,"ˈ":156,"ˌ":157,"ː":158,"ʰ":162,"ʲ":164,"↓":169,"→":171,"↗":172,"↘":173,"ᵻ":177};
  // --- text normalisation (numbers, money, abbreviations) — ported from kokoro-js
  function year(e) { if (e.includes(".")) return e; if (e.includes(":")) { const [a, t] = e.split(":").map(Number); return t === 0 ? `${a} o'clock` : t < 10 ? `${a} oh ${t}` : `${a} ${t}`; }
    const a = parseInt(e.slice(0, 4), 10); if (a < 1100 || a % 1000 < 10) return e; const t = e.slice(0, 2), r = parseInt(e.slice(2, 4), 10), n = e.endsWith("s") ? "s" : "";
    if (a % 1000 >= 100 && a % 1000 <= 999) { if (r === 0) return `${t} hundred${n}`; if (r < 10) return `${t} oh ${r}${n}`; } return `${t} ${r}${n}`; }
  function money(e) { const a = e[0] === "$" ? "dollar" : "pound"; if (isNaN(Number(e.slice(1)))) return `${e.slice(1)} ${a}s`; if (!e.includes(".")) { const t = e.slice(1) === "1" ? "" : "s"; return `${e.slice(1)} ${a}${t}`; }
    const [t, r] = e.slice(1).split("."), n = parseInt(r.padEnd(2, "0"), 10); return `${t} ${a}${t === "1" ? "" : "s"} and ${n} ${e[0] === "$" ? (n === 1 ? "cent" : "cents") : (n === 1 ? "penny" : "pence")}`; }
  function point(e) { const [a, t] = e.split("."); return `${a} point ${t.split("").join(" ")}`; }
  function normalise(e) {
    return e.replace(/[‘’]/g, "'").replace(/«/g, "“").replace(/»/g, "”").replace(/[“”]/g, '"').replace(/\(/g, "«").replace(/\)/g, "»").replace(/[^\S \n]/g, " ").replace(/  +/, " ")
      .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor").replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister").replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss").replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs").replace(/\betc\.(?! [A-Z])/gi, "etc")
      .replace(/\b(y)eah?\b/gi, "$1e'a").replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, year).replace(/(?<=\d),(?=\d)/g, "")
      .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, money).replace(/\d*\.\d+/g, point).replace(/(?<=\d)-(?=\d)/g, " to ").replace(/(?<=\d)S/g, " S")
      .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S").replace(/(?<=X')S\b/g, "s").replace(/(?:[A-Za-z]\.){2,} [a-z]/g, m => m.replace(/\./g, "-")).replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-").trim();
  }
  const PUNCT = ';:,.!?¡¿—…"«»“”(){}[]', PRE = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]+\\s*)+`, "g");
  async function toPhonemes(text, british) {
    const t = normalise(text), parts = []; let last = 0;
    for (const m of t.matchAll(PRE)) { if (last < m.index) parts.push({ p: false, s: t.slice(last, m.index) }); if (m[0].length) parts.push({ p: true, s: m[0] }); last = m.index + m[0].length; }
    if (last < t.length) parts.push({ p: false, s: t.slice(last) });
    const lang = british ? "en" : "en-us";
    let ph = (await Promise.all(parts.map(async x => x.p ? x.s : (await phonemize(x.s, lang)).join(" ")))).join("");
    ph = ph.replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ").replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ").replace(/ʲ/g, "j").replace(/r/g, "ɹ").replace(/x/g, "k").replace(/ɬ/g, "l").replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ").replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z");
    if (!british) ph = ph.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
    return ph.trim();
  }
  function tokens(ph) { const ids = [0]; for (const ch of ph) { const v = VOCAB[ch]; if (v != null) ids.push(v); if (ids.length >= 511) break; } ids.push(0); return ids; }
  let session = null;
  return {
    VOCAB, normalise, toPhonemes, tokens,
    async load(modelBytes, opts) { session = await ort.InferenceSession.create(modelBytes, Object.assign({ executionProviders: ["wasm"], graphOptimizationLevel: "all" }, opts || {})); return session; },
    get ready() { return !!session; },
    // voice: Float32Array [510 × 256] style table; speed: 0.5–2 (Kokoro's own duration control, not playback-rate)
    async synth(text, voice, speed, british) {
      const ph = await toPhonemes(text, british), ids = tokens(ph);
      const k = Math.min(Math.max(ids.length - 2, 0), 509), style = voice.slice(256 * k, 256 * k + 256);
      const feeds = { input_ids: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), style: new ort.Tensor("float32", style, [1, 256]), speed: new ort.Tensor("float32", new Float32Array([speed || 1]), [1]) };
      const out = await session.run(feeds);
      return { audio: out.waveform.data, phonemes: ph, tokens: ids.length, sampleRate: 24000 };
    },
  };
}
if (typeof module !== "undefined" && module.exports) module.exports = { kokoroCore };
