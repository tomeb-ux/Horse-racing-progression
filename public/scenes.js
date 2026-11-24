'use strict';
/* =====================================================================
   FINAL FURLONG — SCENE + INPUT-CONTEXT MANAGER
   The game has separate worlds that must never run (or listen) at the same time:
     menu · stable (the 3D racing stable and the Career screens) · office · farm · race
   Only the active one is updated and drawn. This file tracks which one is active, gives each a place to set up and tear down
   (enter / leave hooks), keeps keyboard input in exactly one context at a time, shows a loading overlay for slow switches, and
   measures GPU resources so a leak across repeated transitions can be seen (and tested).

   It follows the game's own UI state (`ui.state`, changed only through show()), so every existing screen keeps working exactly
   as before: show() calls SCENES.sync(state) and the scene and input context are derived from that state.

   Input contexts:  "race"  racing / pause / replay / parade / celebrate  — the riding controls
                    "farm"  the farm — its own listeners, attached only while it is active (farm.js)
                    "ui"    menus, career screens, results                 — no game keys
   On every change of scene the keys that are held down are released, exactly as the window-blur handler does, so a key held
   in one world can never leak into the next.
   ===================================================================== */
const SCENES = (() => {
  const RACE_STATES = ["racing", "pause", "replay", "parade", "celebrate", "results"];
  const INPUT_RACE = ["racing", "pause", "replay", "parade", "celebrate"];
  const sceneOf = s => s === "farm" ? "farm" : RACE_STATES.includes(s) ? "race" : s === "c_office" ? "office" : String(s).startsWith("c_") ? "stable" : "menu";
  const inputOf = s => s === "farm" ? "farm" : INPUT_RACE.includes(s) ? "race" : "ui";

  let cur = "menu", input = "ui", count = 0;
  const hooks = {}, log = [], marks = {}, onSwitch = [];
  // services provided by index.html (SCENE_SERVICES: leaveRace(), clearKeys()); looked up when needed because index.html's own script runs first
  const svc = () => (typeof SCENE_SERVICES !== "undefined" ? SCENE_SERVICES : {});

  // ---------- scene hooks ----------
  function register(name, h) { hooks[name] = h; }
  function onChange(fn) { onSwitch.push(fn); }
  function clearHeld() { try { const f = svc().clearKeys; if (f) f(); } catch (e) {} }

  // called by show() with the new UI state: updates the scene, runs leave/enter hooks, releases held keys
  function sync(uiState) {
    const s = sceneOf(uiState), inp = inputOf(uiState), from = cur;
    if (s !== cur) {
      count++;
      cur = s;
      try { if (hooks[from] && hooks[from].leave) hooks[from].leave(s); } catch (e) { console.error("scene leave", from, e); }
      input = inp;                                                   // the new context is in place before the new scene starts
      clearHeld();
      try { if (hooks[s] && hooks[s].enter) hooks[s].enter(from); } catch (e) { console.error("scene enter", s, e); }
      const snap = snapshot(); log.push({ from, to: s, n: count, geo: snap.geo, tex: snap.tex }); if (log.length > 40) log.shift();
      for (const fn of onSwitch) { try { fn(s, from); } catch (e) {} }
    } else if (inp !== input) { input = inp; clearHeld(); }
    return cur;
  }

  // ---------- loading overlay ----------
  let ov = null;
  function overlay() {
    if (ov) return ov;
    ov = document.createElement("div"); ov.id = "sceneLoad"; ov.hidden = true;
    ov.style.cssText = "position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(8,12,10,.78);color:#f2efe6;font:700 18px var(--font-d,system-ui);letter-spacing:.1em;text-transform:uppercase;pointer-events:auto";
    document.body.appendChild(ov); return ov;
  }
  // run `fn` behind the loading overlay: the overlay is painted first (two frames), then the (possibly slow) work runs
  function withOverlay(label, fn) {
    const o = overlay(); o.textContent = label || "Loading…"; o.hidden = false;
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { try { fn(); } finally { o.hidden = true; res(); } })));
  }

  // ---------- moving between scenes ----------
  // Every route out of the race world goes through here: it stops the race, its meshes and (via show()) the commentary.
  function leaveRaceWorld() { try { const f = svc().leaveRace; if (f) f(); } catch (e) { console.error(e); } }
  function enterFarm() { leaveRaceWorld(); show("farm"); }
  function toCareer() { leaveRaceWorld(); CAREER.open(); }
  function toMenu() { leaveRaceWorld(); quitToMenu(); }
  // enter(name, {instant}) — the farm goes behind the loading overlay unless {instant} (tests, programmatic use)
  function enter(name, o) {
    o = o || {};
    const go = name === "farm" ? enterFarm : name === "career" ? toCareer : name === "menu" ? toMenu : null;
    if (!go) throw new Error("SCENES.enter: unknown scene " + name);
    if (o.instant || name !== "farm") { go(); return Promise.resolve(cur); }
    return withOverlay("Loading the farm…", go).then(() => cur);
  }

  // ---------- resources: a ledger + leak check ----------
  function snapshot(label) {
    const m = (typeof renderer !== "undefined" && renderer.info && renderer.info.memory) || { geometries: 0, textures: 0 }, pm = typeof performance !== "undefined" ? performance.memory : null;
    return { label: label || "", scene: cur, input, geo: m.geometries, tex: m.textures, prog: (typeof renderer !== "undefined" && renderer.info.programs) ? renderer.info.programs.length : 0,
      heap: pm ? pm.usedJSHeapSize : null, raceAlive: typeof race !== "undefined" && !!race, raceMeshes: typeof horseMeshes !== "undefined" ? horseMeshes.length : 0,
      farm: typeof FARM !== "undefined" ? FARM.info() : null };
  }
  function mark(name) { return (marks[name] = snapshot(name)); }
  // compares now with a mark: ok when GPU geometries/textures grew by no more than the tolerance
  function check(name, tol) {
    tol = Object.assign({ geo: 6, tex: 6, heapMB: 25 }, tol);
    const b = marks[name]; if (!b) return { ok: false, error: "no mark " + name };
    const n = snapshot(), d = { geo: n.geo - b.geo, tex: n.tex - b.tex, prog: n.prog - b.prog, heapMB: b.heap != null && n.heap != null ? Math.round((n.heap - b.heap) / 1048576 * 10) / 10 : null };
    return { ok: d.geo <= tol.geo && d.tex <= tol.tex && (d.heapMB == null || d.heapMB <= tol.heapMB), delta: d, base: b, now: n };
  }

  return { register, onChange, sync, enter, withOverlay, snapshot, mark, check, sceneOf, inputOf,
    get scene() { return cur; }, get input() { return input; }, get transitions() { return count; }, get log() { return log.slice(); } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = SCENES;
