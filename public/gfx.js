'use strict';
/* =====================================================================
   FINAL FURLONG — GRAPHICS KIT (gfx.js)
   Shared, purely visual building blocks used by every venue (the simulation never reads any of this):
     • quality presets (High / Medium / Low): pixel ratio, shadow resolution, crowd density, tree counts
     • image-based lighting: a procedural daylight sky rendered once into a prefiltered environment map, so every
       physically based material (glass, steel, coats, silks, turf) picks up believable sky reflections and fill light
     • a shader sky dome (gradient, sun glow) that matches the environment map and the fog
     • racing turf: world-space detail + macro variation (no visible tiling), a normal map for blade relief, mowing
       stripes along the course, a worn running line near the rail
     • procedural trees (eucalypt, fig, plane, palm, cypress) with instanced variation and a gentle wind sway
     • a GPU-animated crowd: one instanced mesh, every spectator varied (clothing, skin, hair, hats, height, posture),
       heads that follow the race, cheering / clapping / jumping driven by race excitement — no per-frame CPU work
     • running rails on goose-neck posts that follow the course geometry exactly
   All textures are generated at load time (no downloaded images, nothing to license).
   ===================================================================== */
const GFX = (() => {
  const QUALITY = {
    auto:   { pr: 2,   shadow: 4096, crowd: 1.0,  trees: 1.0,  grassDetail: 1, label: "Auto" },   // High content; AUTO trims runtime cost
    high:   { pr: 2,   shadow: 4096, crowd: 1.0,  trees: 1.0,  grassDetail: 1, label: "High" },
    medium: { pr: 1.5, shadow: 2048, crowd: 0.6,  trees: 0.7,  grassDetail: 1, label: "Medium" },
    low:    { pr: 1,   shadow: 0,    crowd: 0.32, trees: 0.45, grassDetail: 0, label: "Low" },
  };
  const q = () => QUALITY[settings.quality] || QUALITY.auto;
  const uTime = { value: 0 };
  const rand = s => mulberry32(s);

  /* ---------- quality ---------- */
  /* AUTO graphics: presentation only (the simulation, AI, clock and results never read any of this). Starting from the
     High look, sustained slow frames step DOWN one stage at a time in this order: distant crowd detail → distant
     trees/roses → shadow resolution → other scenery detail → shadow resolution again → modest render-resolution steps
     (2× → 1.75× → 1.5× → 1.25× → 1×) → far horses/riders a touch coarser. Sustained headroom steps back UP. Anti-
     oscillation: decisions use the median frame time of 1.5 s windows (a single GC pause or shader compile is ignored),
     a step down needs 2 bad windows in a row (one, and two steps at once, when it is badly slow: under ~36 fps), a step
     up needs 8 good ones (12 s), every change is followed by a 3–6 s cooldown, and a level that had to be abandoned is not retried for 60 s (doubling each time it fails again). The level
     reached is remembered for the next session. */
  const AUTO_STEPS = [
    { note: "full quality" },
    { crowd: 1.7, note: "distant crowd simpler" },
    { crowd: 1.7, trees: 1.7, note: "distant trees and roses simpler" },
    { crowd: 1.7, trees: 1.7, shadow: 2048, note: "shadow map 2048" },
    { crowd: 2.4, trees: 2.4, rails: 2, shadow: 2048, note: "scenery detail reduced" },
    { crowd: 2.4, trees: 2.4, rails: 2, shadow: 1024, note: "shadow map 1024" },
    { crowd: 2.4, trees: 2.4, rails: 2, shadow: 1024, pr: 1.75, note: "render scale 1.75" },
    { crowd: 2.4, trees: 2.4, rails: 2, shadow: 1024, pr: 1.5, note: "render scale 1.5" },
    { crowd: 2.8, trees: 2.8, rails: 2.4, shadow: 1024, pr: 1.25, note: "render scale 1.25" },
    { crowd: 3, trees: 3, rails: 2.4, shadow: 1024, pr: 1, horses: 1.35, note: "render scale 1.0, far horses simpler" },
  ];
  const AUTO = { level: 0, win: [], winT: 0, bad: 0, good: 0, cool: 0, hold: 0, fails: {}, last: "", changes: 0, ms: 0, fps: 0, enabled: false };
  try { const l = +localStorage.getItem("ff_autoLevel"); if (l >= 0 && l < AUTO_STEPS.length) AUTO.level = l; } catch (e) {}
  const kindBias = { crowd: 1, trees: 1, shrubs: 1, "rail-posts": 1 };
  let horseBias = 1;
  function runtimeParams() {
    const Q = q(), st = settings.quality === "auto" || !QUALITY[settings.quality] ? AUTO_STEPS[AUTO.level] : {};
    return { pr: Math.min(Q.pr, st.pr || 9), shadow: Q.shadow ? Math.min(Q.shadow, st.shadow || 1e9) : 0, crowd: st.crowd || 1, trees: st.trees || 1, rails: st.rails || 1, horses: st.horses || 1 };
  }
  function applyQuality() {
    const R = runtimeParams();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, R.pr));
    const want = R.shadow > 0 && settings.shadows, was = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = want; sun.castShadow = want;
    if (R.shadow && sun.shadow.mapSize.x !== R.shadow) { sun.shadow.mapSize.set(R.shadow, R.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    // a wider shadow frustum at higher resolution keeps a whole bunched field (and the rails) shadowed; the depth range is
    // only what matters around the action (the sun sits ~263 m from the focus), not a 650 m corridor of distant scenery
    const ext = R.shadow >= 4096 ? 85 : R.shadow >= 2048 ? 70 : 55, sc = sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 150; sc.far = 380; sc.updateProjectionMatrix();
    kindBias.crowd = R.crowd; kindBias.trees = kindBias.shrubs = R.trees; kindBias["rail-posts"] = R.rails; horseBias = R.horses;
    resize();
    if (was !== want) scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  }
  // called every frame with the real frame interval (seconds) while a race, replay or presentation is on screen
  function autoTick(dt, active) {
    if (settings.quality !== "auto" || !active || document.hidden) { AUTO.win.length = 0; AUTO.winT = 0; AUTO.enabled = settings.quality === "auto"; return; }
    AUTO.enabled = true;
    if (AUTO.hold > 0) { AUTO.hold -= dt; return; }                     // just started / just changed: let it settle
    if (dt <= 0 || dt > 0.5) return;
    AUTO.win.push(dt * 1000); AUTO.winT += dt;
    if (AUTO.winT < 1.5) return;
    const a = AUTO.win.slice().sort((x, y) => x - y), med = a[a.length >> 1]; AUTO.ms = med; AUTO.fps = 1000 / med; AUTO.win.length = 0; AUTO.winT = 0;
    const now = performance.now() / 1000;
    if (med > 19.5) { AUTO.bad++; AUTO.good = 0; } else if (med < 17.6) { AUTO.good++; AUTO.bad = 0; } else { AUTO.bad = 0; AUTO.good = Math.max(0, AUTO.good - 1); }
    const severe = med > 28;                                       // under ~36 fps: don't spend a whole race getting there
    if ((AUTO.bad >= 2 || (severe && AUTO.bad >= 1)) && AUTO.level < AUTO_STEPS.length - 1) {
      AUTO.fails[AUTO.level] = { until: now + 60 * Math.pow(2, (AUTO.fails[AUTO.level] && AUTO.fails[AUTO.level].n) || 0), n: ((AUTO.fails[AUTO.level] && AUTO.fails[AUTO.level].n) || 0) + 1 };
      const to = Math.min(AUTO_STEPS.length - 1, AUTO.level + (severe ? 2 : 1));
      setAuto(to, `slow (${med.toFixed(1)} ms) → ${AUTO_STEPS[to].note}`, severe ? 3 : 4);
    } else if (AUTO.good >= 8 && AUTO.level > 0) {
      const f = AUTO.fails[AUTO.level - 1];
      if (!f || now > f.until) setAuto(AUTO.level - 1, `headroom (${med.toFixed(1)} ms) → trying ${AUTO_STEPS[AUTO.level - 1].note}`); else AUTO.good = 0;
    }
  }
  function setAuto(l, why, hold) {
    AUTO.level = l; AUTO.bad = 0; AUTO.good = 0; AUTO.hold = hold || 6; AUTO.last = why; AUTO.changes++;
    try { localStorage.setItem("ff_autoLevel", String(l)); } catch (e) {}
    applyQuality();
  }
  function autoReset(secs) { AUTO.hold = Math.max(AUTO.hold, secs || 2.5); AUTO.win.length = 0; AUTO.winT = 0; }

  /* ---------- sky + environment ---------- */
  const SUN_DIR = new THREE.Vector3(180, 260, 120).normalize();
  const SKY_FRAG = `
    uniform vec3 sunDir; uniform float uEnv; varying vec3 vW;
    void main() {
      vec3 d = normalize(vW); float y = d.y;
      vec3 zen = vec3(0.105, 0.245, 0.56), mid = vec3(0.30, 0.48, 0.74), hor = vec3(0.70, 0.78, 0.84);
      vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, y)); c = mix(c, zen, smoothstep(0.18, 0.95, y));
      float sd = max(dot(d, sunDir), 0.0);
      c += vec3(1.0, 0.86, 0.66) * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.45);
      if (y < 0.0) c = mix(hor * 0.92, uEnv > 0.5 ? vec3(0.17, 0.22, 0.11) : hor * 0.85, smoothstep(0.0, 0.08, -y));
      if (uEnv > 0.5) c += vec3(26.0, 23.0, 18.0) * smoothstep(0.9992, 0.9998, sd);   // the sun disc: a sharp specular source
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;
  const SKY_VERT = `varying vec3 vW; void main() { vW = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
  let skyMesh = null, envRT = null;
  function buildSky() {
    // replace the old vertex-coloured dome with a shader dome (same look family, with a sun glow) that matches the env map
    scene.children.filter(o => o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.radius === 2100).forEach(o => { scene.remove(o); o.geometry.dispose(); o.material.dispose(); });
    const m = new THREE.ShaderMaterial({ uniforms: { sunDir: { value: SUN_DIR }, uEnv: { value: 0 } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2100, 48, 24), m); skyMesh.renderOrder = -10; skyMesh.frustumCulled = false;
    skyMesh.onBeforeRender = (r, s, cam) => skyMesh.position.copy(cam.position);
    scene.add(skyMesh);
    scene.background = null;
    scene.fog.color.setRGB(0.70, 0.78, 0.84).convertLinearToSRGB();   // the haze matches the horizon (fog colour is in output space)
    // environment: render the same sky (with a ground hemisphere and a hot sun disc) into a prefiltered cube map
    const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
    const em = new THREE.ShaderMaterial({ uniforms: { sunDir: { value: SUN_DIR }, uEnv: { value: 1 } }, vertexShader: `varying vec3 vW; void main() { vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false });
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), em));
    const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    envRT = pm.fromScene(es, 0.0, 0.1, 100); renderer.toneMapping = tm;
    scene.environment = envRT.texture; pm.dispose(); em.dispose();
    // with sky light coming from the environment, the flat hemisphere fill can come down
    hemi.intensity = 0.32; fill.intensity = 0.12; sun.intensity = 2.3; renderer.toneMappingExposure = 0.82;
  }

  /* ---------- tileable procedural noise for textures ---------- */
  function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function pnoise(x, y, per, s) {           // value noise that tiles every `per` units
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const w = k => ((k % per) + per) % per;
    const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, per, s, oct) { let t = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < (oct || 4); o++) { t += a * pnoise(x * f, y * f, per * f, s + o * 17); n += a; a *= 0.5; f *= 2; } return t / n; }
  function dataTex(w, h, fill, opts) {
    const data = new Uint8Array(w * h * 4); fill(data, w, h);
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    if (opts && opts.srgb) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true; return t;
  }
  // height field → tangent-space normal map
  function normalFromHeight(H, w, h, strength) {
    return dataTex(w, h, (d) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const l = H[y * w + ((x - 1 + w) % w)], r = H[y * w + (x + 1) % w], u = H[((y - 1 + h) % h) * w + x], dn = H[((y + 1) % h) * w + x];
        let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
        const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    });
  }

  /* ---------- turf ---------- */
  const TEX = {};
  function turfTextures() {
    if (TEX.turf) return TEX;
    const N = 512, H = new Float32Array(N * N);
    // fine grass: many short blades (a height field of streaks) over soft clumps
    const rng = rand(91);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = fbm(x / 32, y / 32, N / 32, 3, 3) * 0.6;
    for (let k = 0; k < 26000; k++) {
      const x0 = rng() * N, y0 = rng() * N, len = 2 + rng() * 5, ang = rng() * Math.PI * 2, h = 0.35 + rng() * 0.65;
      for (let t = 0; t < len; t += 0.7) { const x = Math.round(x0 + Math.cos(ang) * t * 0.35) & (N - 1), y = Math.round(y0 + Math.sin(ang) * t) & (N - 1); H[y * N + x] = Math.max(H[y * N + x], h * (1 - t / len * 0.6)); }
    }
    TEX.turfN = normalFromHeight(H, N, N, 2.2);
    TEX.turf = dataTex(N, N, (d) => {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x, h = H[i], n = fbm(x / 64, y / 64, N / 64, 11, 3), dry = Math.pow(fbm(x / 128, y / 128, N / 128, 23, 2), 3);
        // greens of a well-watered turf: brighter on blade tips, darker in the thatch; a few dry straw blades
        let r = 38 + 34 * h + 16 * n + 62 * dry, g = 80 + 62 * h + 22 * n + 36 * dry, b = 40 + 28 * h + 10 * n + 12 * dry;
        const k = i * 4; d[k] = Math.min(255, r); d[k + 1] = Math.min(255, g); d[k + 2] = Math.min(255, b); d[k + 3] = 255;
      }
    }, { srgb: true });
    // macro variation: broad patches of slightly different green, very low frequency (sampled in world space)
    TEX.macro = dataTex(256, 256, (d) => { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = fbm(x / 32, y / 32, 8, 41, 4), k = (y * 256 + x) * 4; d[k] = d[k + 1] = d[k + 2] = v * 255; d[k + 3] = 255; } });
    return TEX;
  }
  // three's perturbNormal2Arb, but with our own (world-space) texture coordinates
  const PERTURB = `
    vec3 ffPerturb(vec3 eye_pos, vec3 surf_norm, vec3 mapN, vec2 st) {
      vec3 q0 = vec3(dFdx(eye_pos.x), dFdx(eye_pos.y), dFdx(eye_pos.z)), q1 = vec3(dFdy(eye_pos.x), dFdy(eye_pos.y), dFdy(eye_pos.z));
      vec2 st0 = dFdx(st), st1 = dFdy(st); vec3 N = surf_norm; vec3 q1perp = cross(q1, N), q0perp = cross(N, q0);
      vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y; float det = max(dot(T, T), dot(B, B));
      float scale = (det == 0.0) ? 0.0 : inversesqrt(det); return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + N * mapN.z);
    }`;
  // kind: "track" (stripes along the course, worn running line), "lawn" (diagonal mowing checks), "ground"
  function turfMaterial(kind, tint) {
    const T = turfTextures();
    const m = new THREE.MeshStandardMaterial({ color: tint || (kind === "track" ? 0xd8e6c8 : kind === "lawn" ? 0xd4e2c0 : 0xc8d4b0), roughness: 0.92, metalness: 0, map: T.turf, normalMap: T.turfN });
    m.normalScale.set(0.9, 0.9);
    const U = { uMacro: { value: T.macro }, uStripe: { value: kind === "track" ? 1 : 0 }, uLawn: { value: kind === "lawn" ? 1 : 0 } };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP; uniform sampler2D uMacro; uniform float uStripe, uLawn;" + PERTURB)
        .replace("#include <map_fragment>", `
          vec2 wuv = vWP.xz / 3.2;
          vec4 tA = mapTexelToLinear(texture2D(map, wuv)), tB = mapTexelToLinear(texture2D(map, vWP.xz / 11.0 + vec2(0.37, 0.71)));
          float mac = texture2D(uMacro, vWP.xz / 240.0).r, mac2 = texture2D(uMacro, vWP.xz / 61.0 + 0.5).r;
          vec3 tcol = mix(tA.rgb, tB.rgb, 0.45) * (0.80 + 0.30 * mac + 0.12 * mac2);
          float band = 0.0;
          #ifdef USE_UV
          if (uStripe > 0.5) {
            band = step(0.5, fract(vUv.x * 12.0 / 16.0)) * 2.0 - 1.0;                     // mown bands across the course every 8 m
            float lane = step(0.5, fract(vUv.y * 1.333)) * 2.0 - 1.0;                     // and the mower's passes along it
            float rail = smoothstep(0.55, 0.0, vUv.y);                                    // the worn running line by the rail
            tcol *= (1.0 + 0.11 * band + 0.035 * lane) * mix(1.0, 0.84, rail);
            tcol = mix(tcol, tcol * vec3(1.08, 1.0, 0.86), rail * 0.5);
          }
          #endif
          if (uLawn > 0.5) { vec2 r = vWP.xz / 9.0; band = step(0.5, fract((r.x + r.y) * 0.5)) * 2.0 - 1.0; tcol *= 1.0 + 0.06 * band; }
          diffuseColor.rgb *= tcol;`)
        .replace("#include <normal_fragment_maps>", `
          vec3 mapN = texture2D(normalMap, wuv).xyz * 2.0 - 1.0; mapN.xy *= normalScale;
          normal = ffPerturb(-vViewPosition, normal, mapN, wuv);`);
    };
    m.customProgramCacheKey = () => "ffturf";
    return m;
  }

  /* ---------- geometry helpers ---------- */
  function merge(geos) {                     // merge indexed/non-indexed BufferGeometries with position/normal/color
    const pos = [], nor = [], col = [], idx = [], uvs = []; let base = 0; const allUV = geos.every(g => g.attributes.uv);
    for (const g0 of geos) {
      const g = g0; const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, UV = g.attributes.uv;
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); if (C) col.push(C.getX(i), C.getY(i), C.getZ(i)); else col.push(1, 1, 1); if (allUV) uvs.push(UV.getX(i), UV.getY(i)); }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i);
      base += P.count; g0.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    if (allUV) out.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    out.setIndex(idx); out.computeBoundingSphere(); return out;
  }
  function paint(g, fn) { const P = g.attributes.position, N = g.attributes.normal, c = []; const C = new THREE.Color(); for (let i = 0; i < P.count; i++) { fn(C, P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i)); c.push(C.r, C.g, C.b); } g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); return g; }
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

  /* ---------- level of detail + chunked instancing ----------
     three r128 culls an InstancedMesh by its geometry's bounding sphere, so one InstancedMesh spread over a whole
     racecourse is either always drawn (and always shadow-cast) or wrongly culled. Repeated scenery (rail posts, trees,
     roses, spectators) is therefore split into ~100–160 m cells, each with bounds that cover its own instances, so the
     camera and the sun's shadow camera only draw the cells they can see. Each cell can also carry lower-detail twins
     that share its instance data; the LOD is chosen by how tall the object would appear on screen (pixels), which
     accounts for distance, lens (a long broadcast lens sees far objects big) and render resolution. */
  function shareGeo(g, sphere) { const n = new THREE.BufferGeometry(); for (const k in g.attributes) n.setAttribute(k, g.attributes[k]); if (g.index) n.setIndex(g.index); n.boundingSphere = sphere; n.userData.shared = true; return n; }
  const LODS = [];
  let lodBias = 1;                                  // > 1 switches to lower detail sooner (AUTO quality raises it)
  function addLOD(levels, px, size, sphere, kind) { const L = { lv: levels, px, size, c: sphere.center, r: sphere.radius, cur: 0, kind: kind || "" }; levels.forEach((m, i) => m.visible = i === 0); LODS.push(L); return L; }
  function updateLODs() {
    if (!LODS.length) return;
    const cp = camera.position, H = renderer.domElement.height || 720, k = H / (2 * Math.tan((camera.fov || 45) * Math.PI / 360));
    for (let i = LODS.length - 1; i >= 0; i--) {
      const L = LODS[i]; if (!L.lv[0].parent) { LODS.splice(i, 1); continue; }
      const d = Math.max(1, cp.distanceTo(L.c) - L.r), px = L.size * k / d;
      const bias = lodBias * (kindBias[L.kind] || 1);
      let lv = L.lv.length - 1; for (let j = 0; j < L.px.length && j < L.lv.length - 1; j++) if (px > L.px[j] * bias) { lv = j; break; }
      if (lv !== L.cur) { const t = L.px[Math.min(lv, L.cur)] * bias; if (Math.abs(px - t) < t * 0.1) lv = L.cur; }   // hysteresis: no flicker at a boundary
      if (lv !== L.cur) { L.lv[L.cur].visible = false; L.lv[lv].visible = true; L.cur = lv; }
    }
  }
  // items: [{ m: Matrix4, x, y, z }]; geos: [hi, mid?, lo?]; attrs: { name: [itemSize, Float32Array] } per-instance data
  function chunked(group, items, geos, mat, o) {
    const cell = o.cell || 120, cells = new Map(), out = [];
    items.forEach((it, i) => { const k = Math.floor(it.x / cell) + "," + Math.floor(it.z / cell); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); });
    for (const idx of cells.values()) {
      let cx = 0, cy = 0, cz = 0; for (const i of idx) { cx += items[i].x; cy += items[i].y || 0; cz += items[i].z; } cx /= idx.length; cy /= idx.length; cz /= idx.length;
      let r = 0; for (const i of idx) r = Math.max(r, Math.hypot(items[i].x - cx, (items[i].y || 0) - cy, items[i].z - cz));
      const sphere = new THREE.Sphere(new THREE.Vector3(cx, cy + (o.cy || 0), cz), r + (o.rad || 2));
      const im = new THREE.InstancedBufferAttribute(new Float32Array(idx.length * 16), 16);
      idx.forEach((i, j) => items[i].m.toArray(im.array, j * 16));
      const shared = {};
      if (o.attrs) for (const k in o.attrs) { const [sz, src] = o.attrs[k], a = new Float32Array(idx.length * sz); idx.forEach((i, j) => { for (let t = 0; t < sz; t++) a[j * sz + t] = src[i * sz + t]; }); shared[k] = new THREE.InstancedBufferAttribute(a, sz); }
      let col = null; if (o.colors) { const a = new Float32Array(idx.length * 3); idx.forEach((i, j) => { a[j * 3] = o.colors[i * 3]; a[j * 3 + 1] = o.colors[i * 3 + 1]; a[j * 3 + 2] = o.colors[i * 3 + 2]; }); col = new THREE.InstancedBufferAttribute(a, 3); }
      const ms = [].concat(mat);
      const levels = geos.map((g, li) => {
        const geo = shareGeo(g, sphere); for (const k in shared) geo.setAttribute(k, shared[k]);
        const m = new THREE.InstancedMesh(geo, ms[Math.min(li, ms.length - 1)], idx.length); m.instanceMatrix = im; if (col) m.instanceColor = col;
        m.castShadow = li === 0 ? o.shadow !== false : !!o.shadowLo; m.receiveShadow = !!o.receive; if (o.name) m.name = o.name + (li ? "-lod" + li : ""); group.add(m); return m; });
      if (levels.length > 1) addLOD(levels, o.px, o.size, sphere, o.name);
      out.push({ levels, idx, sphere, n: idx.length });
    }
    return out;
  }

  /* ---------- trees ---------- */
  const TREE = {};
  let TLO = false;                                   // building a far-away (low-detail) tree
  function blob(r, sx, sy, sz, seed, leaf, dark, lo) {
    const g = new THREE.SphereGeometry(r, TLO ? 5 : lo ? 6 : 8, TLO ? 3 : lo ? 4 : 6), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = fbm(x * 0.9 + seed, y * 0.9 + z * 0.7, 1e6, seed | 0, 2); const k = 0.72 + 0.6 * n; P.setXYZ(i, x * k * sx, y * k * sy, z * k * sz); }
    g.computeVertexNormals();
    return paint(g, (C, x, y, z, nx, ny) => { const t = clamp(0.5 + ny * 0.5, 0, 1); C.copy(dark).lerp(leaf, 0.35 + 0.65 * t); const s = hash(Math.round(x * 7), Math.round(y * 7 + z * 13), seed | 0); C.multiplyScalar(0.86 + 0.28 * s); });
  }
  function trunk(r0, r1, h, bark, x, z, lean) {
    const g = new THREE.CylinderGeometry(r1, r0, h, TLO ? 4 : 7, TLO ? 1 : 3, true); g.translate(0, h / 2, 0);
    const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i); P.setX(i, P.getX(i) + (lean || 0) * y * y / h); }
    g.translate(x || 0, 0, z || 0); g.computeVertexNormals();
    return paint(g, (C, X, y) => { C.copy(bark).multiplyScalar(0.8 + 0.25 * hash(Math.round(y * 3), Math.round(X * 9), 5)); });
  }
  function treeGeo(species, lo) {
    const key = species + (lo ? "_lo" : "");
    if (TREE[key]) return TREE[key];
    TLO = !!lo;
    const parts = [], r = rand(species.length * 977);
    if (species === "gum") {             // eucalypt: tall, pale smooth trunk, open irregular canopy in grey-green clumps
      const bark = lin(0xcfc4ae), leaf = lin(0x8a9a6a), dark = lin(0x3c4a2c);
      parts.push(trunk(0.45, 0.22, 11, bark, 0, 0, 0.6));
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + r(), b = trunk(0.2, 0.08, 6, bark, 0, 0, 0); b.rotateZ(0.6 + r() * 0.3); b.rotateY(a); b.translate(0.4, 8 + k, 0); parts.push(b); }
      for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = 1.5 + r() * 3.2; const b = blob(2.2 + r() * 1.4, 1.2, 0.7, 1.1, k * 3.1, leaf, dark); b.translate(Math.cos(a) * d + 0.8, 11 + r() * 5, Math.sin(a) * d); parts.push(b); }
    } else if (species === "fig") {      // Moreton Bay fig: short buttressed trunk, broad dense dark dome
      const bark = lin(0x8d8577), leaf = lin(0x4b6a35), dark = lin(0x1d2e16);
      parts.push(trunk(1.3, 0.7, 5, bark));
      for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28 + r() * 0.4, d = k ? 3.5 + r() * 3.5 : 0; const b = blob(4.2 + r() * 1.5, 1.25, 0.72, 1.25, k * 7.7, leaf, dark); b.translate(Math.cos(a) * d, 8.5 + r() * 2.5 - d * 0.18, Math.sin(a) * d); parts.push(b); }
    } else if (species === "plane") {    // London plane / elm: straight trunk, full rounded crown
      const bark = lin(0x9b917c), leaf = lin(0x6a8c3e), dark = lin(0x2a3d1c);
      parts.push(trunk(0.5, 0.3, 7, bark));
      for (let k = 0; k < 6; k++) { const a = r() * 6.28, d = k ? 1.5 + r() * 2.2 : 0; const b = blob(3.2 + r(), 1, 0.95, 1, k * 5.3, leaf, dark); b.translate(Math.cos(a) * d, 9.5 + r() * 3, Math.sin(a) * d); parts.push(b); }
    } else if (species === "cypress") {  // tall narrow conifer screens (boundary plantings)
      const bark = lin(0x5b4a38), leaf = lin(0x3c5a34), dark = lin(0x16261a);
      parts.push(trunk(0.3, 0.2, 3, bark));
      for (let k = 0; k < 4; k++) { const b = blob(1.9 - k * 0.3, 1, 1.6, 1, k * 2.9, leaf, dark); b.translate(0, 4 + k * 2.6, 0); parts.push(b); }
    } else {                             // palm: tall ringed trunk and a crown of arching fronds
      const bark = lin(0x8a7a62), leaf = lin(0x5f8a3a), dark = lin(0x2c4a1c);
      parts.push(trunk(0.42, 0.34, 12, bark, 0, 0, 0.25));
      for (let k = 0; k < 14; k++) {
        const fr = new THREE.PlaneGeometry(5.4, 0.9, TLO ? 3 : 6, 1), P = fr.attributes.position;
        for (let i = 0; i < P.count; i++) { const x = P.getX(i) + 2.7; P.setXYZ(i, x, -0.05 * x * x + 0.18 * x, P.getY(i) * (1 - x / 6)); }
        fr.computeVertexNormals(); paint(fr, (C, x) => C.copy(dark).lerp(leaf, clamp(x / 5, 0, 1)));
        fr.rotateZ(-0.1 + (k % 3) * 0.18); fr.rotateY(k / 14 * 6.28 + r() * 0.2); fr.translate(3, 12, 0); parts.push(fr);
      }
      const head = blob(0.9, 1, 1.1, 1, 3, lin(0x6b5a3a), lin(0x3a2e1c)); head.translate(3, 12, 0); parts.push(head);
    }
    TREE[key] = merge(parts.map(g => g.index ? g : g.toNonIndexed ? g : g)); TLO = false;
    return TREE[key];
  }
  const treeMat = () => TREE.mat || (TREE.mat = (() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => { sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.07;
        #else
        float ph = 0.0;
        #endif
        float sway = max(0.0, transformed.y - 3.0) * 0.012; transformed.x += sin(uTime * 1.3 + ph) * sway; transformed.z += sin(uTime * 0.9 + ph * 1.7) * sway * 0.6;`); };
    m.customProgramCacheKey = () => "fftree"; return m; })());
  // list: [{ x, z, s (scale), sp (species), rot }] → instanced meshes added to group (one per species)
  function plantTrees(group, list) {
    const keep = q().trees, by = {}, dm = new THREE.Object3D(), col = new THREE.Color(), r = rand(list.length + 3);
    list.forEach((t, i) => { if (keep < 1 && hash(i, 7, 3) > keep && !t.keep) return; (by[t.sp || "plane"] = by[t.sp || "plane"] || []).push(t); });
    for (const sp in by) {
      // chunked by ~160 m, each chunk with a low-detail twin (same trees, coarser canopy) used once a tree is under ~70 px tall
      const L = by[sp], items = [], colors = new Float32Array(L.length * 3);
      L.forEach((t, i) => { dm.position.set(t.x, t.y || 0, t.z); dm.rotation.set(0, t.rot != null ? t.rot : r() * 6.28, 0); const s = t.s || 1; dm.scale.set(s * (0.9 + r() * 0.2), s, s * (0.9 + r() * 0.2)); dm.updateMatrix();
        items.push({ m: dm.matrix.clone(), x: t.x, y: t.y || 0, z: t.z }); col.setRGB(0.86 + r() * 0.22, 0.86 + r() * 0.22, 0.82 + r() * 0.2); colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b; });
      chunked(group, items, [treeGeo(sp), treeGeo(sp, true)], treeMat(), { cell: 260, colors, cy: 8, rad: 10, px: [260], size: 14, shadow: true, shadowLo: false, name: "trees" });
    }
  }

  /* ---------- hedges, flower beds, roses ---------- */
  function shrubs(group, list, leafHex, flowerHexes) {
    if (q().trees < 1) list = list.filter((t, i) => hash(i, 3, 9) < q().trees + 0.15);
    // list: [{x, z, s, rot}] — a low clipped shrub with (optional) flowers sprinkled over its top
    const leaf = lin(leafHex || 0x3d5e2c), dark = lin(0x1a2a12), rr = rand(list.length + 11);
    const g = blob(0.6, 1.6, 0.75, 0.9, 4.4, leaf, dark, true); g.translate(0, 0.45, 0);
    const geos = [g];
    if (flowerHexes) for (let k = 0; k < 9; k++) { const f = new THREE.OctahedronGeometry(0.1, 0); const a = rr() * 6.28, d = rr() * 0.75; f.translate(Math.cos(a) * d * 1.5, 0.75 + rr() * 0.22, Math.sin(a) * d * 0.8); paint(f, C => C.setRGB(1, 1, 1)); f.setAttribute("bloom", new THREE.Float32BufferAttribute(new Array(f.attributes.position.count).fill(1), 1)); geos.push(f); }
    geos.forEach(x => { if (!x.attributes.bloom) x.setAttribute("bloom", new THREE.Float32BufferAttribute(new Array(x.attributes.position.count).fill(0), 1)); });
    const pos = [], nor = [], col = [], bl = [], idx = []; let base = 0;
    for (const x of geos) { const P = x.attributes.position, N = x.attributes.normal, C = x.attributes.color, B = x.attributes.bloom;
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(C.getX(i), C.getY(i), C.getZ(i)); bl.push(B.getX(i)); }
      if (x.index) for (let i = 0; i < x.index.count; i++) idx.push(base + x.index.getX(i)); else for (let i = 0; i < P.count; i++) idx.push(base + i); base += P.count; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute("bloom", new THREE.Float32BufferAttribute(bl, 1)); geo.setIndex(idx);
    // far away: the same bush as a coarse blob whose top is tinted with the flower colour (no separate flowers)
    TLO = true; const gl = blob(0.6, 1.6, 0.75, 0.9, 4.4, leaf, dark, true); TLO = false; gl.translate(0, 0.45, 0);
    if (flowerHexes) { const P = gl.attributes.position, b = []; for (let i = 0; i < P.count; i++) b.push(P.getY(i) > 0.78 ? 0.45 : 0); gl.setAttribute("bloom", new THREE.Float32BufferAttribute(b, 1)); }
    else gl.setAttribute("bloom", new THREE.Float32BufferAttribute(new Array(gl.attributes.position.count).fill(0), 1));
    const fl = new Float32Array(list.length * 3), F = (flowerHexes || [0xffffff]).map(lin);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float bloom; attribute vec3 iFlower;").replace("#include <color_vertex>", "#include <color_vertex>\nvColor.xyz = mix(vColor.xyz, iFlower, bloom);"); };
    m.customProgramCacheKey = () => "ffshrub";
    const dm = new THREE.Object3D(), items = [];
    list.forEach((t, i) => { dm.position.set(t.x, t.y || 0, t.z); dm.rotation.set(0, t.rot != null ? t.rot : rr() * 6.28, 0); const s = t.s || 1; dm.scale.set(s, s * (0.85 + rr() * 0.3), s); dm.updateMatrix(); items.push({ m: dm.matrix.clone(), x: t.x, y: t.y || 0, z: t.z }); const c = t.flower != null ? lin(t.flower) : F[(rr() * F.length) | 0]; fl[i * 3] = c.r; fl[i * 3 + 1] = c.g; fl[i * 3 + 2] = c.b; });
    const ch = chunked(group, items, [geo, gl], m, { cell: 160, attrs: { iFlower: [3, fl] }, cy: 0.5, rad: 1.5, px: [30], size: 1.0, shadow: true, shadowLo: false, receive: true, name: "shrubs" });
    return ch[0] && ch[0].levels[0];
  }

  /* ---------- running rails ---------- */
  const RAIL = {};
  function railShared() {
    if (RAIL.post) return RAIL;
    const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0.5, 0.72, 0), new THREE.Vector3(0.44, 0.98, 0), new THREE.Vector3(0.22, 1.1, 0), new THREE.Vector3(0, 1.1, 0)]);
    RAIL.post = new THREE.TubeGeometry(neck, 8, 0.04, 5, false);
    const base = new THREE.CylinderGeometry(0.07, 0.08, 0.12, 6); base.translate(0.5, 0.06, 0);
    RAIL.post = merge([RAIL.post, base]);
    // far away (a post under ~12 px tall): two boxes in the same goose-neck outline
    const lo1 = new THREE.BoxGeometry(0.08, 1.1, 0.08); lo1.translate(0.5, 0.55, 0); const lo2 = new THREE.BoxGeometry(0.5, 0.07, 0.07); lo2.translate(0.25, 1.1, 0);
    RAIL.postLo = merge([lo1, lo2]);
    RAIL.mat = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.32, metalness: 0.0 });
    return RAIL;
  }
  // fn(s, off, out) → point; posts every ~3 m, a smooth rounded rail tube at 1.1 m
  function rail(group, fn, s0, s1, off, closed, outward, opts) {
    const R = railShared(), n = Math.max(4, Math.round(Math.abs(s1 - s0) / 3.0)), dm = new THREE.Object3D(), p = {}, items = [];
    for (let i = 0; i < n; i++) { fn(s0 + (s1 - s0) * i / n, off, p); const ax = outward ? p.nx : -p.nx, az = outward ? p.nz : -p.nz; dm.position.set(p.x, 0, p.z); dm.rotation.set(0, Math.atan2(-az, ax), 0); dm.updateMatrix(); items.push({ m: dm.matrix.clone(), x: p.x, y: 0, z: p.z }); }
    // posts: chunked (culled per ~150 m, only nearby chunks cast shadows), a two-box stand-in once a post is under ~12 px
    chunked(group, items, [R.post, R.postLo], R.mat, { cell: 220, cy: 0.6, rad: 1.5, px: [40], size: 1.1, shadow: true, shadowLo: false, name: "rail-posts" });
    // the rail itself: one tube per ~150 m so it is culled with its posts (a closed loop's last piece ends where it began)
    const len = Math.abs(s1 - s0), nc = Math.max(1, Math.round(len / 220)); let first = null;
    for (let c = 0; c < nc; c++) {
      const a = s0 + (s1 - s0) * c / nc, b = s0 + (s1 - s0) * (c + 1) / nc, m = Math.max(4, Math.round(Math.abs(b - a) / 3)), pts = [];
      for (let i = 0; i <= m; i++) { fn(a + (b - a) * i / m, off, p); pts.push(new THREE.Vector3(p.x, 0, p.z)); }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), m, (opts && opts.r) || 0.075, 6, false), R.mat);
      tube.position.y = 1.1; tube.castShadow = true; tube.name = "rail"; group.add(tube); first = first || tube;
    }
    return first;
  }

  /* ---------- crowd ---------- */
  // One instanced mesh. Each vertex carries a body-part id; each instance carries clothing/skin/hair/hat colours and a
  // behaviour vector. The vertex shader poses everyone: seated or standing, head (and a little of the body) turned
  // towards the race, arms raised / clapping / pumping when excited, small jumps at the climax.
  /* Spectators are three deliberately simple low-poly figures (they are seen at racing-camera distances, often by the
     thousand). Every vertex carries a body-part id, so all three are coloured and posed by the same vertex shader:
       near  (> ~60 px tall)  ≈130 triangles: separate legs, shaped torso, arms with hands, head with hair, optional hat
       mid   (> ~16 px)       ≈ 56 triangles: one leg block (still folds to sit), torso, arms, head, hat brim
       far                     24 triangles: a three-sided figure — trousers, top and head colours; no arms
     (The previous single model was ~240 triangles for everyone, with a 60-triangle box version far away.) */
  let CROWD_GEO = null, CROWD_MID = null, CROWD_FAR = null;
  // rings [[y, rx, rz], ...] → the sides of a low prism around (x, z), bands between consecutive rings; parts per band
  function figBand(acc, sides, rings, x, z, parts, rot0, capTop, capPart) {
    const TW = Math.PI * 2, P = (R, a) => [x + Math.sin(a) * R[1], R[0], z + Math.cos(a) * R[2]], Nn = a => [Math.sin(a), 0, Math.cos(a)];
    for (let b = 0; b < rings.length - 1; b++) {
      const A = rings[b], B = rings[b + 1], pt = [].concat(parts)[Math.min(b, [].concat(parts).length - 1)];
      for (let k = 0; k < sides; k++) {
        const a0 = rot0 + k / sides * TW, a1 = rot0 + (k + 1) / sides * TW;
        const v = [[P(A, a0), Nn(a0)], [P(A, a1), Nn(a1)], [P(B, a1), Nn(a1)], [P(A, a0), Nn(a0)], [P(B, a1), Nn(a1)], [P(B, a0), Nn(a0)]];
        for (const [q, n] of v) { acc.pos.push(...q); acc.nor.push(...n); acc.part.push(pt); }
      }
    }
    if (capTop) { const T = rings[rings.length - 1], c = [x, T[0], z];
      for (let k = 0; k < sides; k++) { const a0 = rot0 + k / sides * TW, a1 = rot0 + (k + 1) / sides * TW; for (const q of [c, P(T, a0), P(T, a1)]) { acc.pos.push(...q); acc.nor.push(0, 1, 0); acc.part.push(capPart != null ? capPart : [].concat(parts).slice(-1)[0]); } } }
  }
  function figGeo(acc) {
    const n = acc.part.length, geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(acc.pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(acc.nor, 3));
    geo.setAttribute("part", new THREE.Float32BufferAttribute(acc.part, 1)); geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    geo.computeBoundingSphere(); geo.boundingSphere.radius = 2.2; return geo;
  }
  function personGeo() {
    if (CROWD_GEO) return CROWD_GEO;
    const A = { pos: [], nor: [], part: [] }, Q4 = Math.PI / 4;
    for (const x of [-0.085, 0.085]) figBand(A, 4, [[0, 0.06, 0.07], [0.43, 0.065, 0.07], [0.86, 0.075, 0.08]], x, 0.01, 0, Q4);              // legs (knee ring at 0.43: they fold to sit)
    figBand(A, 4, [[0.82, 0.2, 0.13], [1.1, 0.19, 0.12], [1.36, 0.24, 0.14], [1.48, 0.13, 0.09]], 0, 0, 1, Q4, true);                       // torso
    for (const [x, pa] of [[-0.215, 2], [0.215, 3]]) figBand(A, 3, [[1.42, 0.05, 0.05], [0.93, 0.045, 0.045], [0.81, 0.036, 0.036]], x, 0, [pa, pa + 10], 0);   // arms, hands
    figBand(A, 5, [[1.53, 0.07, 0.075], [1.63, 0.105, 0.11], [1.72, 0.085, 0.09]], 0, 0.005, [4, 5], 0, true, 5);                               // head, hair on top
    figBand(A, 6, [[1.735, 0.19, 0.19], [1.74, 0.19, 0.19]], 0, 0, 6, 0, true, 6);                                                              // hat brim
    figBand(A, 5, [[1.74, 0.105, 0.105], [1.83, 0.095, 0.095]], 0, 0, 6, 0, true, 6);                                                           // hat crown
    return CROWD_GEO = figGeo(A);
  }
  function personGeoMid() {
    if (CROWD_MID) return CROWD_MID;
    const A = { pos: [], nor: [], part: [] }, Q4 = Math.PI / 4;
    figBand(A, 4, [[0, 0.15, 0.08], [0.43, 0.16, 0.08], [0.86, 0.17, 0.09]], 0, 0.01, 0, Q4);
    figBand(A, 4, [[0.84, 0.21, 0.13], [1.46, 0.2, 0.12]], 0, 0, 1, Q4, true);
    for (const [x, pa] of [[-0.215, 2], [0.215, 3]]) figBand(A, 3, [[1.42, 0.05, 0.05], [0.84, 0.045, 0.045]], x, 0, pa, 0);
    figBand(A, 4, [[1.5, 0.08, 0.085], [1.73, 0.085, 0.09]], 0, 0, 4, Q4, true, 5);
    figBand(A, 4, [[1.74, 0.18, 0.18], [1.745, 0.18, 0.18]], 0, 0, 6, Q4, true, 6);
    return CROWD_MID = figGeo(A);
  }
  function personGeoFar() {
    if (CROWD_FAR) return CROWD_FAR;
    const A = { pos: [], nor: [], part: [] };
    figBand(A, 3, [[0, 0.17, 0.12], [0.43, 0.17, 0.12], [0.86, 0.19, 0.13]], 0, 0, 0, 0);
    figBand(A, 3, [[0.86, 0.24, 0.16], [1.48, 0.22, 0.14]], 0, 0, 1, 0);
    figBand(A, 3, [[1.48, 0.11, 0.1], [1.74, 0.11, 0.1]], 0, 0, 4, 0);
    return CROWD_FAR = figGeo(A);
  }
  const crowdU = { uTime, uExcite: { value: 0 }, uFocus: { value: new THREE.Vector3() }, uRoar: { value: 0 }, uAnim: { value: 0 } };
  function crowdMat() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, crowdU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
        attribute float part; attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iSkin; attribute vec4 iHair; attribute vec4 iBeh;
        uniform float uTime, uExcite, uRoar, uAnim; uniform vec3 uFocus;
        vec3 rotX(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
        vec3 rotY(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
        vec3 rotZ(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
        float aY;
        vec3 ffPose(vec3 p, float isNormal) {
          float pt = part; if (pt >= 10.0) pt -= 10.0;
          float seated = iBeh.y, ph = iBeh.x * 6.2831, keen = iBeh.z, style = iBeh.w;
          vec3 o0 = vec3(0.0); float N = isNormal;
          // seated: thighs forward, shins down; the whole body lowered onto the seat
          if (seated > 0.5 && (pt < 0.5 || (pt > 6.5 && pt < 7.5))) { if (pt < 0.5 && aY > 0.44) p = rotX(p, vec3(0.0, 0.86, 0.0) * (1.0 - N), -1.5708); else if (N < 0.5) p += vec3(0.0, 0.43, 0.43); }
          // STATIC crowd (no per-frame animation — far cheaper and steadier with thousands on screen): a fixed pose per
          // spectator chosen once from its behaviour vector — arms by the side, some clapping-height, a few raised;
          // the head turned a little towards the track
          // replays and the winner presentation (uAnim → 1): the keener half of the crowd comes alive — clapping,
          // arms raised and pumping, a little bounce; during the live race uAnim is 0 and nothing moves
          float live = uAnim * step(0.45, keen);
          if (pt > 1.5 && pt < 3.5) {
            float side = pt < 2.5 ? -1.0 : 1.0; vec3 sh = vec3(0.2 * side, 1.42, 0.0) * (1.0 - N);
            float a = style > 0.9 && keen > 0.6 ? -2.6 : style < 0.25 && keen > 0.5 ? -1.1 : -0.1;
            if (live > 0.0) {
              float clap = step(style, 0.55), raise = 1.0 - clap;
              float an = clap * (-1.2 + 0.18 * sin(uTime * 14.0 + ph)) + raise * (-2.7 + 0.4 * sin(uTime * 6.5 + ph + side));
              a = mix(a, an, live); p = rotZ(p, sh, side * (0.08 + clap * 0.3) * live);
            }
            p = rotX(p, sh, a);
          }
          if (pt > 3.5 && pt < 6.5) p = rotY(p, vec3(0.0), (ph - 3.1416) * 0.06);
          if (N < 0.5 && seated > 0.5) p.y -= 0.42;
          if (N < 0.5 && live > 0.0) p.y += max(0.0, sin(uTime * 7.0 + ph)) * (seated > 0.5 ? 0.03 : 0.1) * live * keen;
          return p;
        }`)
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\naY = position.y; objectNormal = normalize(ffPose(objectNormal, 1.0));")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = ffPose(transformed, 0.0);")
        .replace("#include <color_vertex>", `#include <color_vertex>
          { float pt = part; vec3 c = iShirt;
            if (pt < 0.5) c = iPants; else if (pt > 6.5 && pt < 7.5) c = iPants * 0.35; else if (pt > 9.5) c = iSkin; else if (pt > 3.5 && pt < 4.5) c = iSkin; else if (pt > 4.5 && pt < 5.5) c = iHair.rgb; else if (pt > 5.5 && pt < 6.5) c = mix(iHair.rgb, iShirt, 0.5);
            vColor.xyz = c; }`);
      // hats: collapse the hat for spectators without one
      sh.vertexShader = sh.vertexShader.replace("transformed = ffPose(transformed, 0.0);", "if (part > 5.5 && part < 6.5 && iHair.a < 0.5) transformed = vec3(0.0, 1.66, 0.0); else transformed = ffPose(transformed, 0.0);");
    };
    m.customProgramCacheKey = () => "ffcrowd";
    return m;
  }
  // spots: [{x, y, z, rot, seated, keen}] — returns { mesh, set(frac) }
  const SHIRTS = [0x23262b, 0x2f3d55, 0xf2f2ee, 0x14161a, 0xf4efe6, 0x5a6e8c, 0x8fb8de, 0xe7d9c0, 0x30302e, 0x1d3557, 0x3b4a2f, 0x6b6f75, 0xd8d4cc, 0x1f2a3a, 0xd23a5a, 0x3fae8f, 0xe8c35a, 0x7c5a8a, 0xc96f3b, 0x2c6e8a, 0xf2a7b8, 0xb6332e, 0x9c2f5c];
  const PANTS = [0x1c1f26, 0x2a3245, 0x47403a, 0xd9d2c3, 0x14161a, 0x3d4a5c, 0x6b5a48, 0x1f2a3a];
  const SKINS = [0xf1c8a8, 0xe4b48f, 0xd9a582, 0xb07a52, 0x8a5a3a, 0x5e3c28, 0xf5d3b8];
  const HAIR = [0x1a1410, 0x3b2a1c, 0x6b4a2a, 0xb08850, 0x8a8580, 0xd8c08a, 0x2a1a12];
  // spots: [{x, y, z, rot, seated, keen}] — returns { mesh, n, set(frac) }
  // opts: seed, fancy (carnival colours), always (one never-culled mesh: small moving groups), shirts/pants (uniforms), noHats
  function crowd(group, spots, opts) {
    opts = opts || {};
    const n = spots.length, r = rand(opts.seed || 77), dm = new THREE.Object3D(), c = new THREE.Color();
    const A = { iShirt: new Float32Array(n * 3), iPants: new Float32Array(n * 3), iSkin: new Float32Array(n * 3), iHair: new Float32Array(n * 4), iBeh: new Float32Array(n * 4) };
    const fancy = opts.fancy || 0, items = [];             // carnival days: brighter outfits, more hats and fascinators
    spots.forEach((s, i) => {
      const sc = (s.seated ? 0.95 : 0.92) + r() * 0.16;
      dm.position.set(s.x, s.y || 0, s.z); dm.rotation.set(0, s.rot || 0, 0); dm.scale.set(sc * (0.9 + r() * 0.2), sc, sc); dm.updateMatrix(); items.push({ m: dm.matrix.clone(), x: s.x, y: s.y || 0, z: s.z });
      const pal = opts.shirts ? opts.shirts[(r() * opts.shirts.length) | 0] : fancy && r() < 0.35 * fancy + 0.12 ? [0xe8336b, 0xf4d03f, 0x2e86de, 0xffffff, 0xff8fab, 0x6c5ce7, 0x00b894, 0xe17055, 0x111111][(r() * 9) | 0] : SHIRTS[(r() * SHIRTS.length) | 0];
      c.setHex(pal).convertSRGBToLinear().multiplyScalar(0.85 + r() * 0.25); A.iShirt.set([c.r, c.g, c.b], i * 3);
      const suit = r() < 0.35; c.setHex(opts.pants ? opts.pants[(r() * opts.pants.length) | 0] : suit ? pal : PANTS[(r() * PANTS.length) | 0]).convertSRGBToLinear(); if (suit && !opts.pants) c.multiplyScalar(0.8); A.iPants.set([c.r, c.g, c.b], i * 3);
      c.setHex(SKINS[(r() * SKINS.length) | 0]).convertSRGBToLinear(); A.iSkin.set([c.r, c.g, c.b], i * 3);
      c.setHex(HAIR[(r() * HAIR.length) | 0]).convertSRGBToLinear(); A.iHair.set([c.r, c.g, c.b, !opts.noHats && r() < 0.12 + 0.3 * fancy ? 1 : 0], i * 4);
      A.iBeh.set([r(), s.seated ? 1 : 0, s.keen != null ? s.keen : 0.3 + r() * 0.7, r()], i * 4);
    });
    const mat = crowdMat();
    if (opts.always) {                                     // a small group that moves (strappers in the parade ring, barrier staff)
      const geo = personGeo().clone(), mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      items.forEach((it, i) => mesh.setMatrixAt(i, it.m));
      for (const k in A) geo.setAttribute(k, new THREE.InstancedBufferAttribute(A[k], k === "iHair" || k === "iBeh" ? 4 : 3));
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; group.add(mesh);
      return { mesh, n, parts: [{ levels: [mesh], n }], set(frac) { mesh.count = Math.max(0, Math.min(n, Math.round(n * frac))); } };
    }
    // everyone else: ~70 m cells, each with three detail levels sharing one set of instance data. Within a cell the
    // spectators are in a shuffled order, so a part-full meeting (set(frac)) thins the crowd evenly, not row by row.
    const order = items.map((_, i) => i), rs = rand((opts.seed || 77) + 5); for (let i = order.length - 1; i > 0; i--) { const j = (rs() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    const sItems = order.map(i => items[i]), sAttrs = {};
    for (const k in A) { const sz = k === "iHair" || k === "iBeh" ? 4 : 3, a = new Float32Array(n * sz); order.forEach((i, j) => { for (let t = 0; t < sz; t++) a[j * sz + t] = A[k][i * sz + t]; }); sAttrs[k] = [sz, a]; }
    const parts = chunked(group, sItems, [personGeo(), personGeoMid(), personGeoFar()], mat, { cell: 80, attrs: sAttrs, cy: 1, rad: 2, px: [80, 22], size: 1.7, shadow: false, receive: true, name: "crowd" });
    return { mesh: parts[0] && parts[0].levels[0], parts, n, set(frac) { for (const p of parts) { const k = Math.max(0, Math.min(p.n, Math.round(p.n * frac))); for (const m of p.levels) m.count = k; } } };
  }
  /* ---------- per-frame ---------- */
  let crowdAnimT = 0;                          // 1 in replays / the winner presentation: part of the crowd cheers
  function setCrowdAnim(v) { crowdAnimT = v ? 1 : 0; }
  function update(dt, excite, focus, roar) {
    uTime.value += dt;
    updateLODs();                               // rail posts, trees, roses, spectators: detail by on-screen size
    crowdU.uExcite.value += ((excite || 0) - crowdU.uExcite.value) * Math.min(1, dt * 1.5);
    crowdU.uAnim.value += (crowdAnimT - crowdU.uAnim.value) * Math.min(1, dt * 2);
    crowdU.uRoar.value += ((roar || 0) - crowdU.uRoar.value) * Math.min(1, dt * 3);
    if (focus) crowdU.uFocus.value.lerp(focus, Math.min(1, dt * 4));
  }

  /* ---------- simple PBR material helpers used by the venues ---------- */
  const M = {};
  function mats() {
    if (M.concrete) return M;
    const tex = (w, h, fn, srgb) => { const t = dataTex(w, h, fn, { srgb: srgb !== false }); return t; };
    // concrete: soft blotchy variation
    M.concreteTex = tex(256, 256, d => { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const v = 180 + 40 * fbm(x / 32, y / 32, 8, 3, 4) + 14 * hash(x, y, 9), k = (y * 256 + x) * 4; d[k] = v; d[k + 1] = v * 0.99; d[k + 2] = v * 0.96; d[k + 3] = 255; } });
    M.concrete = new THREE.MeshStandardMaterial({ map: M.concreteTex, color: 0xe2e2de, roughness: 0.86 });
    M.whiteConc = new THREE.MeshStandardMaterial({ map: M.concreteTex, color: 0xffffff, roughness: 0.6 });
    M.whiteConcDS = new THREE.MeshStandardMaterial({ map: M.concreteTex, color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });   // thin slabs seen from above and below
    // timber cladding: vertical boards with grain
    M.timberTex = tex(256, 256, d => { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const b = Math.floor(x / 16), g = fbm(x / 4 + b * 7, y / 40, 1e6, b, 3), seam = x % 16 < 1 ? 0.6 : 1, k = (y * 256 + x) * 4; d[k] = (150 + 60 * g) * seam; d[k + 1] = (98 + 40 * g) * seam; d[k + 2] = (58 + 26 * g) * seam; d[k + 3] = 255; } });
    M.timber = new THREE.MeshStandardMaterial({ map: M.timberTex, roughness: 0.62 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0xc3c8cc, roughness: 0.32, metalness: 0.85 });
    M.steelWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.38, metalness: 0.35 });
    M.dark = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.6 });
    M.membrane = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, emissive: 0x4a4a46, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.93, envMapIntensity: 0.6 });   // translucent fabric: daylight glows through
    M.roofMetal = new THREE.MeshStandardMaterial({ color: 0xe9ebec, roughness: 0.4, metalness: 0.55, side: THREE.DoubleSide });
    M.asphalt = new THREE.MeshStandardMaterial({ map: M.concreteTex, color: 0x6c6f70, roughness: 0.95 });
    M.gravel = new THREE.MeshStandardMaterial({ map: M.concreteTex, color: 0xc7b796, roughness: 1 });
    M.sand = new THREE.MeshStandardMaterial({ map: M.concreteTex, color: 0x9c8462, roughness: 1 });
    M.water = new THREE.MeshStandardMaterial({ color: 0x3d5a5a, roughness: 0.08, metalness: 0.4 });
    M.brick = new THREE.MeshStandardMaterial({ map: tex(256, 128, d => { for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) { const row = Math.floor(y / 8), xx = (x + (row % 2) * 8) % 16, mortar = (y % 8 < 1 || xx < 1), v = fbm(x / 8, y / 8, 32, row, 2), k = (y * 256 + x) * 4; d[k] = mortar ? 200 : 150 + 50 * v; d[k + 1] = mortar ? 195 : 72 + 22 * v; d[k + 2] = mortar ? 185 : 52 + 16 * v; d[k + 3] = 255; } }), roughness: 0.9 });
    M.terracotta = new THREE.MeshStandardMaterial({ color: 0xa85a3c, roughness: 0.75 });
    return M;
  }
  // glass curtain wall: mullions, transoms, slightly varied panes, a little interior (some lit panels)
  const GLASS = {};
  function glassMat(tint, seed) {
    const key = (tint || 0) + "/" + (seed || 0); if (GLASS[key]) return GLASS[key];
    const t = dataTex(256, 256, d => { const r = rand(seed || 5); const panes = []; for (let k = 0; k < 64; k++) panes.push(r());
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const px = Math.floor(x / 32), py = Math.floor(y / 128), mull = (x % 32 < 2) || (y % 128 < 3), v = panes[(px + py * 8) % 64], k = (y * 256 + x) * 4;
        if (mull) { d[k] = 200; d[k + 1] = 204; d[k + 2] = 208; } else { const lit = v > 0.82 ? 1 : 0, l = 30 + 30 * v + lit * 90; d[k] = l * 0.9; d[k + 1] = l * 0.95; d[k + 2] = l * (lit ? 0.8 : 1.05); }
        d[k + 3] = 255; } }, { srgb: true });
    const rough = dataTex(256, 256, d => { for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const mull = (x % 32 < 2) || (y % 128 < 3), k = (y * 256 + x) * 4; d[k] = d[k + 1] = d[k + 2] = mull ? 150 : 14; d[k + 3] = 255; } });
    const m = new THREE.MeshStandardMaterial({ map: t, color: tint || 0xb8c8d4, roughness: 1, roughnessMap: rough, metalness: 0.75, envMapIntensity: 1.25 });
    return GLASS[key] = m;
  }
  // a box whose UVs are in metres / tile (for glass walls and facades)
  function wallBox(w, h, d, tile) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, P = g.attributes.position, N = g.attributes.normal, t = tile || 4;
    for (let i = 0; i < uv.count; i++) { const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)); const a = nx > 0.5 ? P.getZ(i) : P.getX(i), b = ny > 0.5 ? P.getZ(i) : P.getY(i); uv.setXY(i, a / t, b / t); }
    return g;
  }
  return { applyQuality, buildSky, turfMaterial, turfTextures, plantTrees, treeGeo, shrubs, rail, crowd, update, chunked, addLOD, LODS, setCrowdAnim, get lodBias() { return lodBias; }, set lodBias(v) { lodBias = v; }, get horseBias() { return horseBias; }, AUTO, AUTO_STEPS, autoTick, autoReset, setAuto, runtimeParams, mats, glassMat, wallBox, merge, paint, lin, fbm, pnoise, hash, rand, dataTex, QUALITY, q, uTime, crowdU, get envMap() { return envRT && envRT.texture; } };
})();
// start-up: sky + environment lighting, quality preset, and the original course's turf upgraded to the new material
(function gfxInit() {
  try {
    GFX.buildSky(); GFX.applyQuality();
    const track = GFX.turfMaterial("track"), lawn = GFX.turfMaterial("lawn");
    world.traverse(o => { if (!o.isMesh || !o.material || !o.material.map) return; if (o.material.map === turfTex) { o.material = track; o.receiveShadow = true; } else if (o.material.map === infieldTex) o.material = lawn; });
    // the original course's spectators: built here with the shared GPU crowd once this kit exists
    if (typeof crowdAnim !== "undefined" && crowdAnim.pending) { const P = crowdAnim.pending; crowdAnim.pending = null; GFX.crowd(typeof VENUE_GENERIC !== "undefined" ? VENUE_GENERIC : P.parent, P.spots, { seed: 77, fancy: 0.25 }); }
  } catch (e) { console.warn("GFX init failed — keeping the basic look", e); }
})();
