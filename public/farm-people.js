'use strict';
/* =====================================================================
   FINAL FURLONG — PEOPLE (Phase 5): the player's character
   A rigid-part human (the pattern of the parade-ring strappers, upgraded): pelvis, torso, neck, head with face and hair, two-segment
   arms and legs with hands and boots, and three outfits — STABLE (work shirt, jeans, boots, akubra), TRAINING (riding helmet, polo,
   breeches, tall boots, gloves) and RACE DAY (jacket in your colours, white breeches, tall boots, helmet with a silk cover).
   Appearance (saved in C.player): look {head, hair, hairCol, skin, build}, outfit, colours {shirt, trousers, boots}.
   One figure is ~30 small meshes; walk / jog / idle are procedural. Nothing here touches the race.
   ===================================================================== */
const FARMPEOPLE = (() => {
  const SKINS = ["#f1d2b6", "#e0b48c", "#c68e6b", "#a06a48", "#7b4a30", "#523020"], HAIRS = ["#15110d", "#3a2616", "#6b4423", "#a9743a", "#c9a45c", "#8d8a85", "#7a2e1d"];
  const HAIR_STYLES = ["Short crop", "Side part", "Ponytail", "Shoulder length", "Cap of curls", "Bald"], FACES = ["Round", "Oval", "Square", "Narrow", "Broad"];
  const OUTFITS = [["stable", "Stable wear"], ["training", "Riding gear"], ["raceday", "Race day"]];
  const BUILDS = [-1, -0.5, 0, 0.5, 1];
  const DEFAULT = () => ({ look: { head: 1, hair: 0, hairCol: "#3a2616", skin: "#e0b48c", build: 0 }, outfit: "stable", colours: { shirt: "#2e5e8a", trousers: "#3a3a40", boots: "#4a2e1a" } });

  let G = null;                                                     // shared geometries (owned; freed by dispose)
  function geos() {
    if (G) return G; const g = {}, cyl = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s || 10), box = (w, h, d) => new THREE.BoxGeometry(w, h, d), sph = (r, ws, hs) => new THREE.SphereGeometry(r, ws || 14, hs || 10);
    g.thigh = cyl(0.085, 0.07, 0.44); g.thigh.translate(0, -0.22, 0); g.shin = cyl(0.066, 0.05, 0.44); g.shin.translate(0, -0.22, 0); g.boot = box(0.11, 0.09, 0.27); g.boot.translate(0, -0.045, 0.06); g.shaft = cyl(0.062, 0.058, 0.3); g.shaft.translate(0, -0.15, 0);
    g.torso = cyl(0.17, 0.14, 0.56); g.torso.translate(0, 0.28, 0); g.chest = box(0.36, 0.22, 0.2); g.chest.translate(0, 0.44, 0); g.hips = box(0.3, 0.16, 0.19); g.hips.translate(0, 0.02, 0);
    g.uarm = cyl(0.052, 0.045, 0.3); g.uarm.translate(0, -0.15, 0); g.farm = cyl(0.045, 0.036, 0.3); g.farm.translate(0, -0.15, 0); g.hand = sph(0.045, 8, 6); g.hand.translate(0, -0.04, 0);
    g.neck = cyl(0.05, 0.055, 0.1); g.neck.translate(0, 0.05, 0); g.head = sph(0.115, 16, 12); g.nose = box(0.03, 0.04, 0.035); g.ear = sph(0.025, 6, 5); g.eye = sph(0.013, 6, 5);
    const dome = (r, th) => new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * th); g.hairCap = dome(0.124, 0.43); g.hairBack = box(0.2, 0.2, 0.1); g.pony = cyl(0.025, 0.04, 0.26, 6); g.curls = dome(0.135, 0.5);
    g.hatBrim = cyl(0.27, 0.27, 0.012, 20); g.hatCrown = cyl(0.12, 0.135, 0.12, 14); g.hatBand = cyl(0.136, 0.138, 0.025, 14); g.helm = dome(0.135, 0.52); g.peak = box(0.18, 0.012, 0.09);
    g.jacketTail = box(0.34, 0.2, 0.2); g.collar = box(0.2, 0.04, 0.12); g.belt = cyl(0.152, 0.152, 0.035, 12); g.glove = sph(0.05, 8, 6); g.glove.translate(0, -0.04, 0);
    G = g; return g;
  }
  const lam = (hex, rough) => new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).convertSRGBToLinear(), roughness: rough == null ? 0.85 : rough, metalness: 0 });

  function make(app) {
    const A = Object.assign(DEFAULT(), app || {}); A.look = Object.assign(DEFAULT().look, A.look || {}); A.colours = Object.assign(DEFAULT().colours, A.colours || {});
    const g = geos(), root = new THREE.Group(), body = new THREE.Group(), mats = [], parts = {}; root.add(body);
    const M = hex => { const m = lam(hex); mats.push(m); return m; }, mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; (parent || body).add(m); return m; };
    // skeleton: pelvis → hips/torso → neck → head; hip joints → thighs → shins → feet; shoulders → upper arms → forearms
    const pelvis = new THREE.Group(); pelvis.position.y = 0.94; body.add(pelvis);
    const torsoG = new THREE.Group(); torsoG.position.y = 0.04; pelvis.add(torsoG);
    const neckG = new THREE.Group(); neckG.position.y = 0.61; torsoG.add(neckG); const headG = new THREE.Group(); headG.position.y = 0.045; neckG.add(headG);
    const limb = (sx, y) => { const hip = new THREE.Group(); hip.position.set(sx, y, 0); pelvis.add(hip); const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee); return { hip, knee }; };
    const legL = limb(-0.088, -0.02), legR = limb(0.088, -0.02);
    const arm = sx => { const sh = new THREE.Group(); sh.position.set(sx, 0.55, 0); torsoG.add(sh); const el = new THREE.Group(); el.position.y = -0.3; sh.add(el); return { sh, el }; };
    const armL = arm(-0.22), armR = arm(0.22);
    Object.assign(parts, { pelvis, torsoG, neckG, headG, legL, legR, armL, armR });
    const o = { A, root, body, parts, mats, phase: 0, speed: 0, idleT: 0, variant: {} };
    o.dressed = [];                                                // everything that depends on the outfit/appearance (removed and rebuilt by apply)
    o.apply = (app2) => apply(o, app2);
    apply(o, A);
    return o;
  }

  function apply(o, app) {
    const g = geos(), A = o.A; if (app) { A.look = Object.assign(A.look, app.look || {}); A.colours = Object.assign(A.colours, app.colours || {}); if (app.outfit) A.outfit = app.outfit; }
    for (const m of o.dressed) { if (m.parent) m.parent.remove(m); } o.dressed.length = 0; for (const m of o.mats) m.dispose(); o.mats.length = 0;
    const P = o.parts, L = A.look, C = A.colours, out = A.outfit, bld = 1 + (+L.build || 0) * 0.14, skin = L.skin, hair = L.hairCol;
    const M = (hex, r) => { const m = lam(hex, r); o.mats.push(m); return m; }, add = (geo, mat, parent, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (sx) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); m.castShadow = true; parent.add(m); o.dressed.push(m); return m; };
    o.body.scale.set(bld, 1, bld * 0.96);
    const skinM = M(skin, 0.7), hairM = M(hair, 0.9), dark = M("#1a1a1a"), white = M("#f1efe8"), brown = M("#5b3d24"), tan = M("#a98255");
    const shirtHex = out === "raceday" ? C.shirt : out === "training" ? "#f2efe6" : C.shirt, shirtM = M(shirtHex), trouM = M(out === "stable" ? C.trousers : out === "training" ? "#d7c7a0" : "#f4f2ea"), bootM = M(out === "stable" ? C.boots : "#1d1a18", 0.5);
    const jackM = M(C.shirt), trimM = M("#f2efe6");
    // legs (trousers → boots); riding outfits have tall boots
    for (const lg of [P.legL, P.legR]) {
      add(g.thigh, trouM, lg.hip); add(g.shin, trouM, lg.knee);
      if (out === "stable") { add(g.boot, bootM, lg.knee, 0, -0.44, 0); } else { add(g.shaft, bootM, lg.knee, 0, -0.14, 0, 1, 1.0, 1); add(g.boot, bootM, lg.knee, 0, -0.44, 0); }
    }
    // torso + clothing
    add(g.hips, trouM, P.torsoG, 0, 0.0, 0); add(g.torso, shirtM, P.torsoG, 0, 0.04, 0); add(g.chest, shirtM, P.torsoG, 0, 0.04, 0);
    if (out === "stable") { add(g.belt, M("#3a2a1a"), P.torsoG, 0, 0.1, 0); add(g.collar, shirtM, P.torsoG, 0, 0.67, 0.0); }
    if (out === "training") { add(g.collar, M("#c23a3a"), P.torsoG, 0, 0.67, 0.0); }
    if (out === "raceday") { add(g.torso, jackM, P.torsoG, 0, 0.06, 0, 1.06, 1, 1.12); add(g.chest, jackM, P.torsoG, 0, 0.06, 0.0, 1.05, 1, 1.12); add(g.jacketTail, jackM, P.torsoG, 0, -0.06, 0.0); add(g.collar, trimM, P.torsoG, 0, 0.69, 0.02); add(g.belt, M("#2a2a2a"), P.torsoG, 0, 0.1, 0); }
    // arms
    for (const ar of [P.armL, P.armR]) {
      add(g.uarm, out === "raceday" ? jackM : shirtM, ar.sh); add(g.farm, out === "raceday" ? jackM : shirtM, ar.el);
      if (out === "training") add(g.glove, M("#3a3a3a"), ar.el, 0, -0.3, 0); else add(g.hand, skinM, ar.el, 0, -0.3, 0);
    }
    // neck, head, face
    add(g.neck, skinM, P.neckG, 0, 0, 0); const hv = L.head | 0, hs = [[1, 1.02, 1], [0.94, 1.08, 0.98], [1.05, 0.98, 1.0], [0.9, 1.1, 0.95], [1.1, 1.0, 1.02]][hv % 5];
    add(g.head, skinM, P.headG, 0, 0.12, 0, hs[0], hs[1], hs[2]); add(g.nose, skinM, P.headG, 0, 0.115, 0.118 * hs[2]); for (const sx of [-1, 1]) { add(g.eye, dark, P.headG, sx * 0.045, 0.14, 0.1 * hs[2]); add(g.ear, skinM, P.headG, sx * 0.118 * hs[0], 0.12, 0, 1, 1.3, 0.7); }
    // hair (hidden under headgear where it would be)
    const hairStyle = L.hair | 0, covered = out !== "stable" || false;
    if (hairStyle !== 5) {
      add(g.hairCap, hairM, P.headG, 0, 0.13, -0.004, hs[0] * 1.0, 1.0, hs[2] * 1.02);
      if (hairStyle === 1) add(g.hairBack, hairM, P.headG, 0, 0.1, -0.09, 0.9, 0.8, 0.7);
      if (hairStyle === 2) { add(g.hairBack, hairM, P.headG, 0, 0.12, -0.085, 0.7, 0.6, 0.6); const p = add(g.pony, hairM, P.headG, 0, 0.05, -0.15); p.rotation.x = 0.35; }
      if (hairStyle === 3) { add(g.hairBack, hairM, P.headG, 0, 0.0, -0.08, 1.05, 1.5, 0.9); }
      if (hairStyle === 4) add(g.curls, hairM, P.headG, 0, 0.135, -0.01, hs[0] * 0.98, 1.0, hs[2] * 1.0);
    }
    // headgear by outfit
    if (out === "stable") { add(g.hatBrim, brown, P.headG, 0, 0.215, 0); add(g.hatCrown, brown, P.headG, 0, 0.27, 0); add(g.hatBand, M("#2a2a2a"), P.headG, 0, 0.235, 0); }
    else if (out === "training") { add(g.helm, M("#1d2a44"), P.headG, 0, 0.15, 0, 1.0, 1.0, 1.06); add(g.peak, M("#1d2a44"), P.headG, 0, 0.2, 0.13); }
    else { add(g.helm, M(C.shirt), P.headG, 0, 0.15, 0, 1.02, 1.0, 1.08); add(g.peak, M("#101418"), P.headG, 0, 0.2, 0.135); add(g.hatBand, trimM, P.headG, 0, 0.19, 0, 1.05, 0.5, 1.05); }
    o.hip = 0.94;
  }

  // pose: speed in m/s drives the cycle (walk ≈ 2.4, jog ≈ 5.2); when still, a slow breathing idle
  function pose(o, dt, speed) {
    const P = o.parts; o.speed += (speed - o.speed) * Math.min(1, dt * 10); const sp = o.speed; o.idleT += dt;
    const moving = sp > 0.15, stride = sp < 3.4 ? 0.52 : 0.78; o.phase += dt * (sp * (sp < 3.4 ? 1.9 : 1.5));
    const s = Math.sin(o.phase), c = Math.cos(o.phase), k = Math.min(1, sp / 2.4), run = sp > 3.4 ? 1 : 0;
    if (moving) {
      P.legL.hip.rotation.x = s * stride * k; P.legR.hip.rotation.x = -s * stride * k;
      P.legL.knee.rotation.x = Math.max(0, -Math.cos(o.phase)) * (0.5 + 0.7 * run) * k; P.legR.knee.rotation.x = Math.max(0, Math.cos(o.phase)) * (0.5 + 0.7 * run) * k;
      P.armL.sh.rotation.x = -s * stride * 0.8 * k; P.armR.sh.rotation.x = s * stride * 0.8 * k; P.armL.el.rotation.x = -(0.15 + 0.7 * run) * k; P.armR.el.rotation.x = -(0.15 + 0.7 * run) * k;
      P.pelvis.position.y = o.hip + Math.abs(c) * (0.025 + 0.03 * run) * k; P.torsoG.rotation.y = s * 0.12 * k; P.torsoG.rotation.x = 0.05 + 0.12 * run; P.pelvis.rotation.y = -s * 0.06 * k;
      P.headG.rotation.y = -s * 0.04 * k;
    } else {
      const b = Math.sin(o.idleT * 1.6);
      for (const j of [P.legL.hip, P.legR.hip, P.legL.knee, P.legR.knee]) j.rotation.x *= 0.8;
      P.armL.sh.rotation.x += (0.03 * b - P.armL.sh.rotation.x) * 0.15; P.armR.sh.rotation.x += (0.03 * b - P.armR.sh.rotation.x) * 0.15; P.armL.el.rotation.x += (-0.1 - P.armL.el.rotation.x) * 0.15; P.armR.el.rotation.x += (-0.1 - P.armR.el.rotation.x) * 0.15;
      P.pelvis.position.y = o.hip; P.pelvis.rotation.y *= 0.85; P.torsoG.rotation.x = 0.01 * b; P.torsoG.rotation.y *= 0.85; P.headG.rotation.y = Math.sin(o.idleT * 0.45) * 0.12;
    }
  }
  function dispose(o) { if (!o) return; for (const m of o.mats) m.dispose(); o.mats.length = 0; if (o.root.parent) o.root.parent.remove(o.root); }
  function disposeShared() { if (G) { for (const k of Object.keys(G)) G[k].dispose(); G = null; } }
  return { make, pose, dispose, disposeShared, SKINS, HAIRS, HAIR_STYLES, FACES, OUTFITS, BUILDS, DEFAULT };
})();
