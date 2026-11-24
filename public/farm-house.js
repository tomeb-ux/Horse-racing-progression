'use strict';
/* =====================================================================
   FINAL FURLONG — INSIDE THE FARMHOUSE (Phase 5)
   A basic, walkable room (10 × 8 m) with its own scene, lights and colliders, entered through the farmhouse front door:
     • the RACE CALENDAR BOARD on the north wall — a cork board with this month's calendar (race days marked, today ringed, a booked
       race circled) and a card for the next race; E opens the booking screen
     • the desk with the stable ledger (finances and records), the trophy cabinet (your real trophies), a wardrobe with a mirror
       (appearance and outfit), a sofa and rug, a bookshelf, a small kitchen, windows with a view, pictures, warm pendant lights
   Everything is merged by FARMWORLD.Batch (a few dozen draw calls) and uses its own copies of the farm materials with the sky
   reflection turned right down, so the room reads as lit from inside and through the windows.
   ===================================================================== */
const FARMHOUSE = (() => {
  const W = FARMWORLD, TAU = W.TAU, lin = GFX.lin;
  const ROOM = { x0: -5, x1: 5, z0: -4, z1: 4, h: 2.9 };
  const DOOR = { z0: -1, z1: 1, h: 2.2 };

  function build() {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1612);
    const own = { tex: [], geo: [], mat: [] }, im = {}, B = new W.Batch(), col = [], pts = [];
    for (const k of ["timber", "wood", "weather", "paint", "steel", "rubber", "concrete", "straw"]) { const m = W.M[k].clone(); m.envMapIntensity = 0.22; im[k] = m; own.mat.push(m); }
    scene.environment = GFX.envMap || null;
    const bx = (mat, x0, y0, z0, x1, y1, z1, c, o) => B.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c, o);
    const colBox = (x0, z0, x1, z1) => col.push({ x0, x1, z0, z1 });
    const CREAM = 0xf0e6cf, TIM = 0x8a6a46, DARK = 0x5a4430, WHITE = 0xf4f1ea;
    // ---- shell: floor, ceiling with beams, four walls (the east wall has the front door), wainscot, skirting, picture rail
    bx(im.wood, ROOM.x0 - 0.2, -0.12, ROOM.z0 - 0.2, ROOM.x1 + 0.2, 0, ROOM.z1 + 0.2, 0xa07e56, { grain: true, tile: 1.3 });
    bx(im.timber, ROOM.x0 - 0.2, ROOM.h, ROOM.z0 - 0.2, ROOM.x1 + 0.2, ROOM.h + 0.1, ROOM.z1 + 0.2, 0x9a8260, { tile: 2.0 });
    for (const z of [-2.6, 0, 2.6]) bx(im.wood, ROOM.x0, ROOM.h - 0.2, z - 0.1, ROOM.x1, ROOM.h, z + 0.1, 0x6b5238, { grain: true });
    bx(im.weather, ROOM.x0 - 0.2, 0, ROOM.z0 - 0.2, ROOM.x1 + 0.2, ROOM.h, ROOM.z0, CREAM, { tile: 1.6 });                         // north
    bx(im.weather, ROOM.x0 - 0.2, 0, ROOM.z1, ROOM.x1 + 0.2, ROOM.h, ROOM.z1 + 0.2, CREAM, { tile: 1.6 });                         // south
    bx(im.weather, ROOM.x0 - 0.2, 0, ROOM.z0, ROOM.x0, ROOM.h, ROOM.z1, CREAM, { tile: 1.6 });                                      // west
    bx(im.weather, ROOM.x1, 0, ROOM.z0, ROOM.x1 + 0.2, ROOM.h, DOOR.z0, CREAM, { tile: 1.6 }); bx(im.weather, ROOM.x1, 0, DOOR.z1, ROOM.x1 + 0.2, ROOM.h, ROOM.z1, CREAM, { tile: 1.6 }); bx(im.weather, ROOM.x1, DOOR.h, DOOR.z0, ROOM.x1 + 0.2, ROOM.h, DOOR.z1, CREAM, { tile: 1.6 });
    for (const [a, b, c2, d] of [[ROOM.x0, ROOM.z0 + 0.01, ROOM.x1, ROOM.z0 + 0.04], [ROOM.x0, ROOM.z1 - 0.04, ROOM.x1, ROOM.z1 - 0.01]]) { bx(im.timber, a, 0, b, c2, 1.0, d, 0x6d5236, { tile: 1.2 }); bx(im.paint, a, 0, b, c2, 0.1, d + 0.02 * (b < 0 ? 1 : -1), WHITE); bx(im.paint, a, 1.0, b - 0.01, c2, 1.05, d + 0.01, WHITE); bx(im.paint, a, 2.55, b - 0.01, c2, 2.6, d + 0.01, WHITE); }
    bx(im.timber, ROOM.x0 + 0.01, 0, ROOM.z0, ROOM.x0 + 0.04, 1.0, ROOM.z1, 0x6d5236, { tile: 1.2 }); bx(im.paint, ROOM.x0 + 0.01, 1.0, ROOM.z0, ROOM.x0 + 0.05, 1.05, ROOM.z1, WHITE); bx(im.paint, ROOM.x0 + 0.01, 2.55, ROOM.z0, ROOM.x0 + 0.05, 2.6, ROOM.z1, WHITE);
    for (const [a, b] of [[ROOM.z0, DOOR.z0], [DOOR.z1, ROOM.z1]]) { bx(im.timber, ROOM.x1 - 0.04, 0, a, ROOM.x1 - 0.01, 1.0, b, 0x6d5236, { tile: 1.2 }); bx(im.paint, ROOM.x1 - 0.05, 1.0, a, ROOM.x1 - 0.01, 1.05, b, WHITE); bx(im.paint, ROOM.x1 - 0.05, 2.55, a, ROOM.x1 - 0.01, 2.6, b, WHITE); }
    // front door: frame, open leaf swung against the wall, a doormat; the view outside is a bright panel
    for (const z of [DOOR.z0 - 0.05, DOOR.z1 + 0.05]) bx(im.paint, ROOM.x1 - 0.1, 0, z - 0.06, ROOM.x1 + 0.2, DOOR.h + 0.08, z + 0.06, WHITE); bx(im.paint, ROOM.x1 - 0.1, DOOR.h, DOOR.z0 - 0.1, ROOM.x1 + 0.2, DOOR.h + 0.1, DOOR.z1 + 0.1, WHITE);
    bx(im.paint, ROOM.x1 - 0.95, 0.02, DOOR.z1 + 0.1, ROOM.x1 - 0.1, DOOR.h, DOOR.z1 + 0.16, 0x2f4a38); bx(im.rubber, ROOM.x1 - 1.3, 0.0, -0.7, ROOM.x1 - 0.2, 0.03, 0.7, 0x3a3128);
    bx(im.concrete, ROOM.x1 + 0.2, -0.12, DOOR.z0 - 0.4, ROOM.x1 + 2.4, 0.0, DOOR.z1 + 0.4, 0xb5b2aa, { tile: 3 });
    // windows: frame, mullions, sill, curtains; the view is a painted panel just outside
    const view = (() => { const c = document.createElement("canvas"); c.width = 256; c.height = 160; const g = c.getContext("2d"), sky = g.createLinearGradient(0, 0, 0, 160); sky.addColorStop(0, "#7fb2e6"); sky.addColorStop(0.55, "#cfe3f1"); sky.addColorStop(0.56, "#7a9a58"); sky.addColorStop(1, "#4d6b3a"); g.fillStyle = sky; g.fillRect(0, 0, 256, 160);
      g.fillStyle = "#8aa2b8"; g.beginPath(); g.moveTo(0, 88); for (let x = 0; x <= 256; x += 16) g.lineTo(x, 80 + 10 * Math.sin(x / 30)); g.lineTo(256, 90); g.fill(); for (let i = 0; i < 9; i++) { const x = 15 + i * 30, h = 28 + (i * 17 % 20); g.fillStyle = "#e6e0cf"; g.fillRect(x, 150 - h, 4, h); g.fillStyle = "#4a6b3c"; g.beginPath(); g.ellipse(x + 2, 150 - h - 8, 16, 14, 0, 0, TAU); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; own.tex.push(t); return t; })();
    const viewM = new THREE.MeshBasicMaterial({ map: view }); own.mat.push(viewM);
    const window3 = (cx, cz, ax) => {   // ax: 'z' on a north/south wall, 'x' on the east wall
      const w = 1.5, h = 1.3, y0 = 0.95, south = ax === 'z';
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), viewM); own.geo.push(pane.geometry);
      if (south) { pane.position.set(cx, y0 + h / 2, ROOM.z1 + 0.12); pane.rotation.y = Math.PI; } else { pane.position.set(ROOM.x1 + 0.12, y0 + h / 2, cz); pane.rotation.y = -Math.PI / 2; } scene.add(pane);
      const f = (a, b2, c2, d, e, g2) => bx(im.paint, a, b2, c2, d, e, g2, WHITE);
      if (south) { const zz = ROOM.z1; f(cx - w / 2 - 0.07, y0 - 0.07, zz - 0.09, cx + w / 2 + 0.07, y0, zz + 0.0, 0); f(cx - w / 2 - 0.07, y0 + h, zz - 0.09, cx + w / 2 + 0.07, y0 + h + 0.07, zz, 0); f(cx - w / 2 - 0.07, y0, zz - 0.09, cx - w / 2, y0 + h, zz, 0); f(cx + w / 2, y0, zz - 0.09, cx + w / 2 + 0.07, y0 + h, zz, 0); f(cx - 0.02, y0, zz - 0.07, cx + 0.02, y0 + h, zz, 0); f(cx - w / 2, y0 + h / 2 - 0.02, zz - 0.07, cx + w / 2, y0 + h / 2 + 0.02, zz, 0); f(cx - w / 2 - 0.12, y0 - 0.1, zz - 0.2, cx + w / 2 + 0.12, y0 - 0.04, zz - 0.0, 0);
        for (const s of [-1, 1]) bx(im.paint, cx + s * (w / 2 + 0.14) - 0.12, 0.7, zz - 0.2, cx + s * (w / 2 + 0.14) + 0.12, 2.5, zz - 0.1, 0xb04a3a); }
      else { const xx = ROOM.x1; f(xx - 0.09, y0 - 0.07, cz - w / 2 - 0.07, xx, y0, cz + w / 2 + 0.07, 0); f(xx - 0.09, y0 + h, cz - w / 2 - 0.07, xx, y0 + h + 0.07, cz + w / 2 + 0.07, 0); f(xx - 0.09, y0, cz - w / 2 - 0.07, xx, y0 + h, cz - w / 2, 0); f(xx - 0.09, y0, cz + w / 2, xx, y0 + h, cz + w / 2 + 0.07, 0); f(xx - 0.07, y0, cz - 0.02, xx, y0 + h, cz + 0.02, 0); f(xx - 0.07, y0 + h / 2 - 0.02, cz - w / 2, xx, y0 + h / 2 + 0.02, cz + w / 2, 0); f(xx - 0.2, y0 - 0.1, cz - w / 2 - 0.12, xx, y0 - 0.04, cz + w / 2 + 0.12, 0); }
    };
    window3(-2.8, 0, 'z'); window3(2.8, 0, 'z'); window3(0, -2.8, 'x'); window3(0, 2.8, 'x');
    // ---- the race calendar board (north wall): timber frame, cork, a canvas that is redrawn from the career
    bx(im.wood, -2.0, 0.78, ROOM.z0, 2.0, 2.52, ROOM.z0 + 0.06, 0x5f4a34, { grain: true }); bx(im.timber, -1.9, 0.88, ROOM.z0 + 0.06, 1.9, 2.42, ROOM.z0 + 0.075, 0x9c7a50, { tile: 0.8 });
    const bc = document.createElement("canvas"); bc.width = 1024; bc.height = 410; const boardTex = new THREE.CanvasTexture(bc); boardTex.encoding = THREE.sRGBEncoding; boardTex.anisotropy = 8; own.tex.push(boardTex);
    const boardM = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9, metalness: 0, envMapIntensity: 0.2 }); own.mat.push(boardM); const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.52), boardM); own.geo.push(boardMesh.geometry); boardMesh.position.set(0, 1.65, ROOM.z0 + 0.082); scene.add(boardMesh);
    colBox(-2.0, ROOM.z0, 2.0, ROOM.z0 + 0.12);
    pts.push({ id: "board", x: 0, z: -2.7, r: 2.1, text: "E — Race calendar: choose and book a race" });
    // ---- desk with the ledger (NW corner), chair, lamp
    bx(im.wood, -4.8, 0.72, -3.7, -3.0, 0.78, -2.7, 0x7a5a3a, { grain: true }); for (const [dx, dz] of [[-4.75, -3.65], [-3.05, -3.65], [-4.75, -2.75], [-3.05, -2.75]]) bx(im.wood, dx - 0.04, 0, dz - 0.04, dx + 0.04, 0.72, dz + 0.04, 0x5a4430, { grain: true });
    bx(im.timber, -4.8, 0.2, -3.7, -4.2, 0.72, -2.8, 0x6f5538, { tile: 1.0 }); bx(im.paint, -4.5, 0.78, -3.4, -3.9, 0.83, -3.0, 0x23382b); bx(im.paint, -4.46, 0.83, -3.36, -3.94, 0.84, -3.04, 0xf1efe8);
    bx(im.steel, -3.4, 0.78, -3.6, -3.36, 1.1, -3.56, 0x6c7378); bx(im.paint, -3.5, 1.1, -3.65, -3.26, 1.2, -3.45, 0xd9c98f);
    bx(im.paint, -3.9, 0.45, -2.5, -3.4, 0.5, -2.0, 0x4a3a2a); bx(im.paint, -3.9, 0.5, -2.5, -3.85, 1.0, -2.0, 0x4a3a2a); for (const [dx, dz] of [[-3.88, -2.48], [-3.42, -2.48], [-3.88, -2.02], [-3.42, -2.02]]) bx(im.wood, dx - 0.02, 0, dz - 0.02, dx + 0.02, 0.45, dz + 0.02, 0x3a2c20);
    colBox(-4.9, -3.8, -2.9, -2.6); colBox(-4.0, -2.6, -3.3, -1.9);
    pts.push({ id: "ledger", x: -3.2, z: -2.2, r: 1.9, text: "E — Stable ledger: finances and records" });
    // ---- trophy cabinet (west wall): frame, shelves, glass front
    bx(im.wood, ROOM.x0, 0, 0.1, ROOM.x0 + 0.5, 2.0, 0.16, 0x5f4a34, { grain: true }); bx(im.wood, ROOM.x0, 0, 1.54, ROOM.x0 + 0.5, 2.0, 1.6, 0x5f4a34, { grain: true }); bx(im.timber, ROOM.x0, 0, 0.16, ROOM.x0 + 0.05, 2.0, 1.54, 0x6d5236, { tile: 1.0 });
    bx(im.wood, ROOM.x0, 0, 0.1, ROOM.x0 + 0.5, 0.1, 1.6, 0x5f4a34, { grain: true }); bx(im.wood, ROOM.x0, 1.95, 0.1, ROOM.x0 + 0.5, 2.05, 1.6, 0x5f4a34, { grain: true });
    for (const y of [0.65, 1.2, 1.75]) bx(im.wood, ROOM.x0 + 0.05, y, 0.16, ROOM.x0 + 0.48, y + 0.03, 1.54, 0x7a5a3a, { grain: true });
    const glass = new THREE.MeshStandardMaterial({ color: 0xcfe0e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, envMapIntensity: 0.9 }); own.mat.push(glass); const gm = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 1.85), glass); own.geo.push(gm.geometry); gm.position.set(ROOM.x0 + 0.49, 1.03, 0.85); gm.rotation.y = Math.PI / 2; scene.add(gm);
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4a93a, roughness: 0.28, metalness: 0.9, envMapIntensity: 0.8 }); own.mat.push(gold); const cupGeo = (() => { const pts2 = [[0.0, 0], [0.07, 0], [0.07, 0.03], [0.02, 0.05], [0.02, 0.14], [0.08, 0.2], [0.095, 0.3], [0.0, 0.3]].map(p => new THREE.Vector2(p[0], p[1])); return new THREE.LatheGeometry(pts2, 10); })(); own.geo.push(cupGeo);
    const cups = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(cupGeo, gold); const sh = Math.floor(i / 4), k = i % 4; m.position.set(ROOM.x0 + 0.27, 0.68 + sh * 0.55, 0.32 + k * 0.32); m.scale.setScalar(sh === 2 ? 1.1 : 1); m.visible = false; scene.add(m); cups.push(m); }
    colBox(ROOM.x0, 0.0, ROOM.x0 + 0.55, 1.7); pts.push({ id: "cabinet", x: -4.0, z: 0.85, r: 1.7, text: "E — Trophy cabinet" });
    // ---- wardrobe with a mirror (SW corner)
    bx(im.wood, ROOM.x0, 0, 2.2, ROOM.x0 + 0.65, 2.15, 3.8, 0x6b5238, { grain: true }); const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), new THREE.MeshStandardMaterial({ color: 0xdde9ee, roughness: 0.04, metalness: 1.0, envMapIntensity: 1.2 })); own.geo.push(mir.geometry); own.mat.push(mir.material);
    mir.position.set(ROOM.x0 + 0.66, 1.12, 3.0); mir.rotation.y = Math.PI / 2; scene.add(mir); bx(im.paint, ROOM.x0 + 0.65, 0.2, 2.5, ROOM.x0 + 0.69, 2.0, 2.54, 0xe8dcc0); bx(im.paint, ROOM.x0 + 0.65, 0.2, 3.46, ROOM.x0 + 0.69, 2.0, 3.5, 0xe8dcc0); bx(im.paint, ROOM.x0 + 0.65, 1.95, 2.5, ROOM.x0 + 0.69, 2.0, 3.5, 0xe8dcc0); bx(im.paint, ROOM.x0 + 0.65, 0.2, 2.5, ROOM.x0 + 0.69, 0.25, 3.5, 0xe8dcc0);
    colBox(ROOM.x0, 2.1, ROOM.x0 + 0.7, 3.9); pts.push({ id: "mirror", x: -3.7, z: 3.0, r: 1.8, text: "E — Change clothes and appearance" });
    // ---- sofa, rug, coffee table, armchair, bookshelf, kitchen, lamps, pictures
    bx(im.paint, -1.2, 0.0, 0.7, 2.0, 0.012, 3.0, 0x7a3a30); bx(im.paint, -1.1, 0.012, 0.8, 1.9, 0.02, 2.9, 0xc9a45c);
    bx(im.paint, -1.9, 0.0, 3.0, 0.3, 0.45, 3.9, 0x5a6b4e); bx(im.paint, -1.9, 0.45, 3.7, 0.3, 1.0, 3.9, 0x5a6b4e); for (const sx of [-1.9, 0.12]) bx(im.paint, sx, 0.45, 3.0, sx + 0.18, 0.7, 3.9, 0x50604a); for (let i = 0; i < 3; i++) bx(im.paint, -1.7 + i * 0.64, 0.45, 3.05, -1.1 + i * 0.64, 0.58, 3.7, 0x6b7c5d);
    bx(im.wood, -1.4, 0.38, 1.6, -0.2, 0.42, 2.2, 0x7a5a3a, { grain: true }); for (const [dx, dz] of [[-1.35, 1.65], [-0.25, 1.65], [-1.35, 2.15], [-0.25, 2.15]]) bx(im.wood, dx - 0.03, 0, dz - 0.03, dx + 0.03, 0.38, dz + 0.03, 0x5a4430); bx(im.paint, -1.1, 0.42, 1.8, -0.7, 0.46, 2.0, 0xb53a30); bx(im.paint, -0.6, 0.42, 1.75, -0.45, 0.52, 1.9, 0xf1efe8);
    colBox(-1.95, 2.95, 0.35, 3.95); colBox(-1.45, 1.55, -0.15, 2.25);
    bx(im.paint, 2.6, 0.0, 2.9, 3.5, 0.42, 3.8, 0x8a5a3a); bx(im.paint, 2.6, 0.42, 3.55, 3.5, 0.95, 3.8, 0x8a5a3a); bx(im.paint, 2.55, 0.42, 2.9, 2.75, 0.65, 3.8, 0x7a4c30); bx(im.paint, 3.35, 0.42, 2.9, 3.55, 0.65, 3.8, 0x7a4c30); colBox(2.5, 2.8, 3.6, 3.9);
    bx(im.wood, ROOM.x0, 0, -2.2, ROOM.x0 + 0.38, 2.1, -0.4, 0x6b5238, { grain: true }); for (const y of [0.5, 0.95, 1.4, 1.85]) bx(im.wood, ROOM.x0 + 0.02, y, -2.18, ROOM.x0 + 0.36, y + 0.03, -0.42, 0x7a5a3a, { grain: true });
    const rb = W.rng(5); for (let sh = 0; sh < 4; sh++) { let z = -2.12; while (z < -0.55) { const w = 0.03 + rb() * 0.035, h = 0.22 + rb() * 0.12; bx(im.paint, ROOM.x0 + 0.04, 0.5 + sh * 0.45 + 0.03, z, ROOM.x0 + 0.34, 0.5 + sh * 0.45 + 0.03 + h, z + w, [0x8a2f26, 0x23382b, 0x2e5e8a, 0xc9a45c, 0x5a4430, 0x6b3a6b, 0xe8dcc0][Math.floor(rb() * 7)]); z += w + 0.004; } }
    colBox(ROOM.x0, -2.3, ROOM.x0 + 0.42, -0.3);
    bx(im.paint, 4.35, 0.0, 1.9, 4.95, 0.9, 3.4, 0xe8e2d0); bx(im.paint, 4.3, 0.9, 1.9, 4.95, 0.95, 3.4, 0x6c7378); bx(im.steel, 4.45, 0.95, 2.4, 4.8, 0.99, 2.9, 0xc9ced1); bx(im.paint, 4.55, 1.55, 1.9, 4.95, 2.35, 3.4, 0xe8e2d0); bx(im.paint, 4.35, 0.0, 3.45, 4.95, 1.85, 3.95, 0xf0f0ee); colBox(4.2, 1.8, 5.0, 4.0);
    // pendant lights (with real point lights), floor lamp, pictures
    const bulb = new THREE.MeshBasicMaterial({ color: 0xffe6b0 }); own.mat.push(bulb);
    for (const [px, pz] of [[0, 0.4], [-3.8, -3.2]]) { bx(im.steel, px - 0.015, 2.1, pz - 0.015, px + 0.015, ROOM.h, pz + 0.015, 0x3a3a3a); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 14, 1, true), im.steel); own.geo.push(cone.geometry); cone.position.set(px, 2.05, pz); cone.material.side = THREE.DoubleSide; scene.add(cone); const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulb); own.geo.push(b2.geometry); b2.position.set(px, 1.97, pz); scene.add(b2); }
    const L1 = new THREE.PointLight(0xffe2b4, 0.95, 16, 1.6); L1.position.set(0, 1.9, 0.4); scene.add(L1); const L2 = new THREE.PointLight(0xffe2b4, 0.55, 8, 1.8); L2.position.set(-3.8, 1.9, -3.2); scene.add(L2);
    const L3 = new THREE.PointLight(0xfff2dc, 0.5, 8, 1.8); L3.position.set(0, 1.9, -3.3); scene.add(L3);                      // washes the board
    scene.add(new THREE.HemisphereLight(0xfff0dc, 0x6a5440, 0.62)); const sunIn = new THREE.DirectionalLight(0xdfeeff, 0.45); sunIn.position.set(-2, 3, 6); scene.add(sunIn);
    const pic = (kind, x, y, z, ry, w, h) => { const c = document.createElement("canvas"); c.width = 256; c.height = Math.round(256 * h / w); const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, kind ? "#f2b36b" : "#9cc3e4"); gr.addColorStop(1, kind ? "#c4623a" : "#e9efe0"); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#2b2420"; g.beginPath(); g.moveTo(40, c.height - 40); g.quadraticCurveTo(70, c.height * 0.45, 130, c.height * 0.5); g.lineTo(150, c.height * 0.3); g.lineTo(160, c.height * 0.5); g.quadraticCurveTo(210, c.height * 0.55, 215, c.height - 40); g.lineTo(200, c.height - 40); g.lineTo(190, c.height * 0.7); g.lineTo(100, c.height * 0.7); g.lineTo(80, c.height - 40); g.closePath(); g.fill(); g.fillRect(0, c.height - 40, c.width, 40);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; own.tex.push(t); const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, envMapIntensity: 0.2 }); own.mat.push(m); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); own.geo.push(p.geometry); p.position.set(x, y, z); p.rotation.y = ry; scene.add(p);
      const fx = Math.abs(Math.sin(ry)) > 0.5 ? 0 : 1; if (fx) bx(im.wood, x - w / 2 - 0.04, y - h / 2 - 0.04, z - 0.02 * Math.sign(Math.cos(ry)), x + w / 2 + 0.04, y + h / 2 + 0.04, z, 0x4a3a2a); else bx(im.wood, x - 0.02 * Math.sign(-Math.sin(ry)), y - h / 2 - 0.04, z - w / 2 - 0.04, x, y + h / 2 + 0.04, z + w / 2 + 0.04, 0x4a3a2a); };
    pic(1, -2.0, 1.7, ROOM.z1 - 0.025, Math.PI, 0.7, 0.5); pic(0, 0.0, 1.7, ROOM.z1 - 0.025, Math.PI, 0.5, 0.7); pic(1, 2.0, 1.7, ROOM.z1 - 0.025, Math.PI, 0.7, 0.5); pic(0, ROOM.x1 - 0.025, 1.7, -2.6, -Math.PI / 2, 0.6, 0.45);
    B.flush(scene, false, true);

    // ---- the calendar board canvas, redrawn from the career each time you walk in
    function drawBoard(info) {
      const g = bc.getContext("2d"), W2 = bc.width, H2 = bc.height; g.clearRect(0, 0, W2, H2);
      g.fillStyle = "#b08a58"; g.fillRect(0, 0, W2, H2); for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${90 + (i * 37 % 60)},${60 + (i * 53 % 40)},${30 + (i * 29 % 30)},.22)`; g.fillRect((i * 97.3) % W2, (i * 61.7) % H2, 3, 3); }
      const paper = (x, y, w, h, rot) => { g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rot || 0); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(-w / 2 + 5, -h / 2 + 6, w, h); g.fillStyle = "#f4efe0"; g.fillRect(-w / 2, -h / 2, w, h); g.restore(); };
      // the month
      paper(30, 24, 520, 362); g.fillStyle = "#23382b"; g.fillRect(30, 24, 520, 52); g.fillStyle = "#f4efe0"; g.font = "800 34px Archivo, Inter, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText((info.monthLabel || "").toUpperCase(), 290, 51);
      const cw = 520 / 7, rh = 44; g.font = "700 15px Archivo, Inter, Arial, sans-serif"; g.fillStyle = "#6a6a5a"; ["S", "M", "T", "W", "T", "F", "S"].forEach((d, i) => g.fillText(d, 30 + cw * (i + 0.5), 92));
      const sd = info.firstDow | 0; g.font = "600 20px Archivo, Inter, Arial, sans-serif";
      for (let d = 1; d <= info.daysInMonth; d++) {
        const k = sd + d - 1, cx = 30 + cw * ((k % 7) + 0.5), cy = 120 + rh * Math.floor(k / 7) + 14, past = d < info.today;
        const r = info.races[d]; if (r) { g.fillStyle = r === "round" ? "#d8b04a" : "#cfd8c8"; g.beginPath(); g.arc(cx, cy, 17, 0, TAU); g.fill(); }
        if (info.booked === d) { g.strokeStyle = "#c0261c"; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 21, 0, TAU); g.stroke(); }
        if (info.today === d) { g.strokeStyle = "#23382b"; g.lineWidth = 3; g.setLineDash([5, 4]); g.beginPath(); g.arc(cx, cy, 20, 0, TAU); g.stroke(); g.setLineDash([]); }
        g.fillStyle = past ? "#a6a690" : "#2a2a24"; g.fillText(String(d), cx, cy + 1);
      }
      g.font = "600 14px Archivo, Inter, Arial, sans-serif"; g.textAlign = "left"; g.fillStyle = "#6a6a5a"; g.fillText("●", 40, 372); g.fillStyle = "#d8b04a"; g.fillText("championship round", 58, 372); g.fillStyle = "#9aa890"; g.fillText("●", 230, 372); g.fillStyle = "#6a6a5a"; g.fillText("optional race", 248, 372); g.fillStyle = "#c0261c"; g.fillText("◯ booked", 372, 372); g.textAlign = "center";
      // the next race card
      paper(580, 30, 410, 230, 0.02); g.fillStyle = "#23382b"; g.font = "800 20px Archivo, Inter, Arial, sans-serif"; g.textAlign = "left"; g.fillText("NEXT RACE", 604, 62);
      const nx = info.next; g.fillStyle = "#1c1c18"; g.font = "800 30px Archivo, Inter, Arial, sans-serif"; g.fillText(nx ? nx.name : "Season complete", 604, 110, 372);
      g.font = "600 20px Archivo, Inter, Arial, sans-serif"; g.fillStyle = "#4a4a40"; if (nx) { g.fillText(nx.date, 604, 150, 372); g.fillText(nx.venue + " · " + nx.dist, 604, 180, 372); g.fillText(nx.grade + " · " + nx.prize, 604, 210, 372); g.fillText(nx.cond, 604, 240, 372); }
      paper(600, 276, 370, 120, -0.015); g.fillStyle = info.bookedText ? "#c0261c" : "#4a4a40"; g.font = "800 20px Archivo, Inter, Arial, sans-serif"; g.fillText(info.bookedText ? "BOOKED" : "NOTHING BOOKED", 622, 308); g.font = "600 18px Archivo, Inter, Arial, sans-serif"; g.fillStyle = "#2a2a24";
      (info.bookedText || "Press E to choose a race.").split("\n").forEach((l, i) => g.fillText(l, 622, 340 + i * 26, 330));
      g.textAlign = "center"; boardTex.needsUpdate = true;
    }
    return {
      scene, colliders: col, points: pts, bounds: { x0: ROOM.x0 + 0.45, x1: ROOM.x1 - 0.55, z0: ROOM.z0 + 0.45, z1: ROOM.z1 - 0.45, h: ROOM.h },
      spawn: { x: ROOM.x1 - 2.5, z: 0, yaw: -Math.PI / 2 },
      refresh(info, trophies) { drawBoard(info); cups.forEach((c, i) => c.visible = i < Math.min(12, trophies | 0)); },
      dispose() { for (const m of own.mat) m.dispose(); for (const g of own.geo) g.dispose(); for (const t of own.tex) t.dispose(); scene.traverse(o => { if (o.geometry && !own.geo.includes(o.geometry)) o.geometry.dispose(); }); },
    };
  }
  return { build, ROOM };
})();
