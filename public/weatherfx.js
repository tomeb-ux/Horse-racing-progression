// Phase 22: weather you can see on the track and on the farm. Presentation only: nothing here reads or changes the simulation's results.
//  - wet-track spray: a short spray of droplets kicked up behind the runners on a wet or raining day. ONE Points draw for the whole field (8 particles per runner), created before
//    the gates open and only moved afterwards (no upload of new geometry mid-race: the position buffer is rewritten in place).
//  - cloud shadows: soft dark patches drifting over the track on a partly cloudy or clear day (ONE large transparent quad that follows the camera; the pattern is anchored to the world).
//  - farm puddles: a scatter of glossy puddles on the courtyard and yard when it has rained (ONE instanced mesh).
const WEATHERFX = (() => {
  const K = 8, MAXH = 24;
  let spray = null, cloud = null, cloudTex = null, sprayData = null, clock = 0, race0 = null, pud = null, pudScene = null;
  const atmo = () => { try { return GFX.atmo || null; } catch (e) { return null; } };
  const wetOf = a => a ? Math.max(a.wet || 0, a.rain || 0) : 0;
  const isNight = a => a && (a.tod === "dusk" || a.tod === "evening");
  function cloudTexture() {
    if (cloudTex) return cloudTex; const N = 256, c = document.createElement("canvas"); c.width = c.height = N; const x = c.getContext("2d"), im = x.createImageData(N, N), TAU = Math.PI * 2;
    const waves = []; let s = 1234567; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; for (let i = 0; i < 9; i++) waves.push([1 + (r() * 3 | 0), 1 + (r() * 3 | 0), r() * TAU, 0.5 + r()]);   // integer frequencies: the texture tiles
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { let v = 0, wsum = 0; for (const [fx, fy, ph, w] of waves) { v += Math.sin(TAU * (fx * i / N + fy * j / N) + ph) * w; wsum += w; } v = v / wsum * 0.5 + 0.5; const a = Math.max(0, Math.min(1, (v - 0.55) / 0.25)); const k = (j * N + i) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 0; im.data[k + 3] = Math.round(a * a * (3 - 2 * a) * 255); }
    x.putImageData(im, 0, 0); cloudTex = new THREE.CanvasTexture(c); cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.repeat.set(5, 5); return cloudTex;
  }
  function dropSpray() { if (spray) { try { spray.parent && spray.parent.remove(spray); spray.geometry.dispose(); spray.material.dispose(); } catch (e) {} spray = null; sprayData = null; } }
  function dropCloud() { if (cloud) { try { cloud.parent && cloud.parent.remove(cloud); cloud.geometry.dispose(); cloud.material.dispose(); } catch (e) {} cloud = null; } }
  // called when a race is set up (before the gates open)
  function begin(race) {
    dropSpray(); dropCloud(); race0 = race; clock = 0; if (!race || typeof world === "undefined") return; const a = atmo(), wet = wetOf(a);
    if (wet > 0.3) {
      const n = Math.min(MAXH, race.horses.length) * K, geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3).fill(-500); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      spray = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfeaf2, size: 0.26, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true })); spray.frustumCulled = false; spray.name = "wetSpray"; world.add(spray);
      sprayData = { n, life: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n), next: new Int32Array(MAXH) };
    }
    const wx = a && a.wx, k = wet > 0.2 || isNight(a) ? 0 : wx === "partly_cloudy" ? 0.26 : wx === "clear" ? 0.1 : 0;
    if (k > 0) {
      const mat = new THREE.MeshBasicMaterial({ map: cloudTexture(), transparent: true, opacity: k, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      cloud = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), mat); cloud.rotation.x = -Math.PI / 2; cloud.frustumCulled = false; cloud.renderOrder = 2; cloud.name = "cloudShadows"; world.add(cloud);
    }
  }
  function hide() { if (spray) spray.visible = false; if (cloud) cloud.visible = false; }
  // each frame while racing (noSpray: replays and parades only move the clouds)
  function update(dt, race, noSpray) {
    clock += dt; if (typeof camera === "undefined") return;
    if (cloud) { cloud.visible = true; const p = camera.position, w = [2.2, 1.1]; cloud.position.set(p.x, 0.07, p.z); const t = cloudTex; t.offset.set(p.x / 300 - 2.5 - w[0] * clock / 300, -p.z / 300 - 2.5 - w[1] * clock / 300); }
    const live = !!(spray && sprayData && !noSpray && race && race === race0 && race.state === "running"); if (spray) spray.visible = live; if (!live) return;
    const pa = spray.geometry.attributes.position, A = pa.array, D = sprayData, hs = race.horses, cam = camera.position;
    for (let i = 0; i < Math.min(MAXH, hs.length); i++) {
      const h = hs[i]; if (!h || h.fallen || h.finished || !(h.v > 8) || !h.pos) continue; const dx = h.pos.x - cam.x, dz = h.pos.z - cam.z; if (dx * dx + dz * dz > 14400) continue;       // beyond 120 m nobody sees it
      const rate = Math.min(1, h.v / 16) * dt * 40; let m = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      while (m-- > 0) { const j = i * K + (D.next[i]++ % K), back = 1.5 + Math.random() * 0.8, sp = h.v * (0.1 + Math.random() * 0.14);
        A[j * 3] = h.pos.x - (h.hx || 0) * back + (Math.random() - 0.5) * 0.7; A[j * 3 + 1] = 0.12 + Math.random() * 0.15; A[j * 3 + 2] = h.pos.z - (h.hz || 0) * back + (Math.random() - 0.5) * 0.7;
        D.vx[j] = -(h.hx || 0) * sp + (Math.random() - 0.5) * 1.6; D.vy[j] = 1.6 + Math.random() * 2.2; D.vz[j] = -(h.hz || 0) * sp + (Math.random() - 0.5) * 1.6; D.life[j] = 0.45 + Math.random() * 0.4; }
    }
    for (let j = 0; j < D.n; j++) { if (D.life[j] <= 0) { if (A[j * 3 + 1] > -400) A[j * 3 + 1] = -500; continue; } D.life[j] -= dt; D.vy[j] -= 9 * dt; A[j * 3] += D.vx[j] * dt; A[j * 3 + 1] = Math.max(0.03, A[j * 3 + 1] + D.vy[j] * dt); A[j * 3 + 2] += D.vz[j] * dt; }
    pa.needsUpdate = true;
  }
  // ---------------------------------------------------------------- the farm
  function farmPuddles(scene, heightAt, on) {
    if (!scene) return; if (pudScene !== scene) { farmDispose(); pudScene = scene; }
    if (!pud) {
      const geo = new THREE.CircleGeometry(1, 20); geo.rotateX(-Math.PI / 2); const N = 16; pud = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.78, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), N);
      let s = 987; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, d = new THREE.Object3D();
      for (let i = 0; i < N; i++) { const yard = i < 11, x = yard ? -16 + r() * 32 : 96 + r() * 12, z = yard ? -17 + r() * 24 : 0 + r() * 8, sc = 0.7 + r() * 1.5; d.position.set(x, heightAt(x, z) + 0.035, z); d.rotation.set(0, r() * 6.28, 0); d.scale.set(sc * (1 + r() * 0.8), 1, sc); d.updateMatrix(); pud.setMatrixAt(i, d.matrix); }
      pud.instanceMatrix.needsUpdate = true; pud.frustumCulled = false; pud.receiveShadow = false; pud.name = "puddles"; scene.add(pud);
    }
    pud.visible = !!on;
  }
  function farmDispose() { if (pud) { try { pud.parent && pud.parent.remove(pud); pud.geometry.dispose(); pud.material.dispose(); pud.dispose && pud.dispose(); } catch (e) {} pud = null; } pudScene = null; }
  function dispose() { dropSpray(); dropCloud(); farmDispose(); if (cloudTex) { cloudTex.dispose(); cloudTex = null; } race0 = null; }
  return { begin, update, hide, dispose, farmPuddles, farmDispose, get spray() { return spray; }, get cloud() { return cloud; }, get puddles() { return pud; } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = WEATHERFX;
