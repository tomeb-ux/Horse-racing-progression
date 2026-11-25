// Phase 20: temperament-driven behaviour for the horses on the farm (farm only, presentation only: nothing here touches the sim or the career).
// Each horse has a small random event machine whose odds come from its own temperament (nervous horses toss their heads and paw more) and the time of day
// (pawing at feed times, tail-swishing at flies in the southern summer). A horse in its box looks over the door when you come up to it; in the paddock horses
// doze on three legs and, now and then, roll. All of it is applied AFTER the normal idle pose each frame, as small offsets on the same bones.
const FARMIDLE = (() => {
  const S = new WeakMap(); let rolling = null;
  const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nerv = hid => { try { const h = CAREER.data.horses.find(x => x.id === hid), t = h && h.attrs && h.attrs.tem; return clamp(1 - (isFinite(t) ? t : 65) / 100, 0, 1); } catch (e) { return 0.35; } };
  function st(g) { let s = S.get(g); if (!s) { s = { t: rnd(2, 8), ev: null, et: 0, dur: 1, nerv: nerv(g.userData.hid), look: 0 }; S.set(g, s); } return s; }
  const summer = () => { try { const m = CORE.parts(CAREER.data.day).m; return m === 11 || m === 0 || m === 1; } catch (e) { return false; } };
  const feedTime = () => { try { if (!FARMACTORS.live()) return false; const h = FARMACTORS.hour(); return (h > 5.9 && h < 6.7) || (h > 15.9 && h < 16.9); } catch (e) { return false; } };
  function pick(s) {
    const w = { toss: 0.5 + s.nerv * 2.2, paw: (feedTime() ? 2.4 : 0.25) * (0.5 + s.nerv * 1.5), swish: 0.8 + (summer() ? 2.2 : 0) }, tot = w.toss + w.paw + w.swish; let r = Math.random() * tot;
    for (const k of ["toss", "paw", "swish"]) { if ((r -= w[k]) <= 0) return k; } return "swish";
  }
  const DUR = { toss: 0.9, paw: 2.2, swish: 1.6 };
  // events shared by the box and the paddock
  function events(g, dt, s) {
    const u = g.userData, B = u.B; if (!B) return;
    if (!s.ev) { s.t -= dt; if (s.t <= 0) { s.ev = pick(s); s.et = 0; s.dur = DUR[s.ev] * rnd(0.85, 1.2); } return; }
    s.et += dt; const k = Math.sin(Math.PI * Math.min(1, s.et / s.dur));
    if (s.ev === "toss") { B.neck1.rotation.z -= (0.28 + 0.2 * s.nerv) * k; B.head.rotation.z -= 0.25 * k; B.head.rotation.y += Math.sin(s.et * 9) * 0.1 * k; }
    else if (s.ev === "paw") { const L = u.legs && u.legs[0]; if (L) { const sw = Math.sin(s.et * 7.5); L.b[0].rotation.z += (-0.55 + 0.35 * sw) * k; L.b[1].rotation.z += 0.3 * Math.max(0, sw) * k; L.b[2].rotation.z += -0.4 * Math.max(0, sw) * k; } B.head.rotation.z += 0.18 * k; B.neck1.rotation.z += 0.1 * k; }
    else if (s.ev === "swish") { B.tail1.rotation.x += Math.sin(s.et * 13) * 0.55 * k; B.tail2.rotation.x += Math.sin(s.et * 13 - 0.6) * 0.45 * k; }
    if (s.et >= s.dur) { s.ev = null; s.t = rnd(3, 11) * (1.3 - s.nerv * 0.6); }
  }
  // a horse standing in its box (call after the idle pose)
  function box(g, dt, player) {
    const s = st(g), B = g.userData.B; if (!B) return; events(g, dt, s);
    if (player) {                                                              // looks over the door at you
      const dx = player.x - g.position.x, dz = player.z - g.position.z, d = Math.hypot(dx, dz), ry = g.rotation.y;
      const lx = dx * Math.cos(ry) - dz * Math.sin(ry), lz = dx * Math.sin(ry) + dz * Math.cos(ry);
      const want = d < 6.5 && lx > -0.5 ? clamp(1 - Math.max(0, d - 2.5) / 4, 0.25, 1) : 0; s.look += (want - s.look) * Math.min(1, dt * 2.5);
      if (s.look > 0.02) { B.head.rotation.y = -clamp(Math.atan2(lz, Math.max(0.2, lx)), -0.85, 0.85) * s.look; B.neck1.rotation.z -= 0.09 * s.look; B.head.rotation.z += 0.05 * s.look; B.neck2.rotation.y = B.head.rotation.y * 0.3; }
    }
  }
  // a horse out in the paddock: modes are driven by FARMLIFE (graze / walk) plus these two
  function doze(g, dt, o) {
    const u = g.userData, B = u.B; if (!B) return; o.dz = Math.min(1, (o.dz || 0) + dt * 0.6); const k = o.dz, t = performance.now() / 1000;
    B.neck1.rotation.z += 0.42 * k; B.neck2.rotation.z += 0.12 * k; B.head.rotation.z += 0.55 * k; B.head.rotation.y = Math.sin(t * 0.2) * 0.05; B.body.position.y -= 0.02 * k;
    const L = u.legs && u.legs[3]; if (L) { L.b[0].rotation.z += -0.22 * k; L.b[1].rotation.z += 0.12 * k; L.b[3].rotation.z += -0.55 * k; }                    // one hind leg rested on its toe
    B.tail1.rotation.x += Math.sin(t * 0.9) * 0.05 * k;
  }
  function wantsRoll(o, g) { if (rolling && rolling !== g) return false; return Math.random() < 0.06; }
  // rolling: down onto one side, legs kicking, then back up. Returns true while it is happening.
  function roll(g, dt, o, groundY) {
    const u = g.userData, B = u.B; if (!B) return false; if (o.rt == null) { o.rt = 0; o.rs = Math.random() < 0.5 ? 1 : -1; rolling = g; g.rotation.order = "YXZ"; }
    o.rt += dt; const T = 5.2, t = o.rt, down = Math.min(1, t / 1.1), up = t > T - 1.1 ? (t - (T - 1.1)) / 1.1 : 0, k = Math.max(0, down - up), e = k * k * (3 - 2 * k);
    g.rotation.x = o.rs * 1.45 * e; g.position.y = groundY + 0.3 * (1 - e) * 0 - 0.12 * e;
    if (t > 1.1 && t < T - 1.1) { const sw = t * 9; (u.legs || []).forEach((L, i) => { L.b[0].rotation.z += Math.sin(sw + i * 1.3) * 0.55; L.b[1].rotation.z += Math.sin(sw * 0.8 + i) * 0.25; }); B.neck1.rotation.z += Math.sin(t * 3) * 0.12; }
    if (t >= T) { g.rotation.x = 0; g.rotation.order = "XYZ"; g.position.y = groundY; o.rt = null; rolling = null; return false; }
    return true;
  }
  function reset(g) { if (g && rolling === g) rolling = null; if (g) { g.rotation.x = 0; g.rotation.order = "XYZ"; } }
  return { box, doze, roll, wantsRoll, events, st, reset, get rolling() { return rolling; } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = FARMIDLE;
