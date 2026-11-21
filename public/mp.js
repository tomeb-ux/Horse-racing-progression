'use strict';
/* =====================================================================
   FINAL FURLONG — online multiplayer client (private rooms of 2–6 riders).
   The race itself runs on the server (server/race-server.js, using the same sim.js). This client:
   · keeps a "mirror" Race built from the server's seed and fills it every frame with interpolated server
     snapshots, so the existing renderer, HUD, cameras, radar, replays and results work unchanged;
   · sends only rider controls (effort target, steering, settle/check/drive, Space held) and Space presses,
     time-stamped with the race moment the rider was looking at (the server bounds the lag it accepts);
   · shows the lobby (room code, link, names, horses, readiness, host settings) and handles reconnects.
   ===================================================================== */
const MP = (() => {
  const M = { racing: false, inRoom: false, ws: null, slot: -1, code: null, token: null, lobby: null, snaps: [], evq: [], offset: 0, rtt: 0, pings: [],
    delay: 120, delayTarget: 120, late: [], lastSend: 0, lastInp: "", names: ["", ""], results: null, meta: null, myIdx: -1, rivals: [], slots: [], spec: null, msgs: {}, reconnectT: null, wantClose: false, startHold: { m: 0.35, mv: 0 } };
  const now = () => performance.now();
  const est = () => now() + M.offset;                       // our estimate of the server's clock (ms)
  const SS_KEY = "ff_mp_session";
  function serverURL() {
    const q = new URLSearchParams(location.search).get("server"); if (q) return q;
    if (window.FF_STANDALONE) return null;          // the single-file build has no server of its own
    if (location.protocol === "http:" || location.protocol === "https:") return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
    return null;
  }
  const ERR = {
    "no-such-room": "No race with that code — check it and try again.", "room-full": "That race is full (6 riders).", "race-started": "That race has already started.",
    "invalid-code": "Room codes are 6 letters/numbers.", "horse-taken": "Someone has already picked that horse.", "host-only": "Only the host can change the race settings.",
    "not-ready": "Everyone needs to be READY.", "need-two-players": "Waiting for at least one more rider to join.", "player-disconnected": "A rider is disconnected — wait for them or ask them to leave.",
    "bad-token": "Couldn't rejoin that race.", "server-full": "The server is busy — try again shortly.", "connect": "Couldn't reach the multiplayer server.",
    "no-server": "Online races need the hosted version of the game (see README). Single-player works anywhere.",
  };
  // ---------- connection ----------
  function connect(onOpen) {
    const url = serverURL();
    if (!url) { setStatus(ERR["no-server"], true); return; }
    if (M.ws && M.ws.readyState <= 1) { if (M.ws.readyState === 1) onOpen && onOpen(); else M.ws.addEventListener("open", () => onOpen && onOpen(), { once: true }); return; }
    let ws; try { ws = new WebSocket(url); } catch (e) { setStatus(ERR.connect, true); return; }
    ws.binaryType = "arraybuffer"; M.ws = ws; M.wantClose = false;
    ws.onopen = () => { M.pings = []; ping(); onOpen && onOpen(); };
    ws.onmessage = e => { if (typeof e.data !== "string") return onBinary(e.data); let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
    ws.onerror = () => {};
    ws.onclose = () => {
      M.ws = null;
      if (M.wantClose) return;
      if (M.inRoom && M.code && M.token) scheduleReconnect(); else setStatus(ERR.connect, true);
    };
  }
  function send(m) { if (M.ws && M.ws.readyState === 1) M.ws.send(JSON.stringify(m)); }
  function ping() { send({ type: "ping", t: now() }); }
  setInterval(() => { if (M.ws && M.ws.readyState === 1) ping(); }, 2000);
  function scheduleReconnect() {
    if (M.reconnectT) return;
    const t0 = now();
    netBanner("Connection lost — reconnecting…");
    const tryIt = () => {
      M.reconnectT = null;
      if (now() - t0 > 90000) { netBanner("Couldn't reconnect.", true); return; }
      connect(() => send({ type: "rejoin", code: M.code, token: M.token }));
      M.reconnectT = setTimeout(() => { if (!M.ws || M.ws.readyState !== 1) tryIt(); else M.reconnectT = null; }, 2000);
    };
    tryIt();
  }
  function saveSession() { try { sessionStorage.setItem(SS_KEY, JSON.stringify({ code: M.code, token: M.token, t: Date.now() })); } catch (e) {} }
  function clearSession() { try { sessionStorage.removeItem(SS_KEY); } catch (e) {} }
  // ---------- messages ----------
  function onMsg(m) {
    switch (m.type) {
      case "pong": {
        const t = now(), rtt = t - m.t, off = m.s - (m.t + rtt / 2);
        M.pings.push({ rtt, off }); if (M.pings.length > 12) M.pings.shift();
        const best = M.pings.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        M.offset = M.pings.length === 1 ? off : M.offset + (best.off - M.offset) * 0.3; M.rtt = best.rtt;
        if (M.pings.length < 5) setTimeout(ping, 150);
        return;
      }
      case "sp": send({ type: "spr", s: m.s }); return;
      case "welcome": M.slot = m.slot; M.code = m.code; M.token = m.token; M.inRoom = true; saveSession(); netBanner(null); return;
      case "lobby": M.lobby = m; renderLobby(); if (!M.racing && ui.state !== "racing" && ui.state !== "replay" && ui.state !== "results") show("mp"); return;
      case "peer": if (M.racing) toast((M.names[m.slot] || "A rider") + (m.connected ? " is back" : " disconnected — they have 20 s to return"), m.connected ? "good" : "warn", 2.2); return;
      case "error":
        if (m.rejoin) { M.inRoom = false; clearSession(); netBanner(null); setStatus(ERR[m.code] || m.code, true); if (M.racing) leaveRaceView(); return; }
        setStatus(ERR[m.code] || ("Error: " + m.code), true); return;
      case "raceStart": beginRace(m); return;
      case "snap": if (M.racing) addSnap(m); return;
      case "pressres": if (M.racing && m.r && m.r.kind !== "launch") pressFeedback(m.r); return;
      case "kickres": if (M.racing) kickFeedback(m); return;
      case "results": M.results = m; return;
      case "replayMeta": M.meta = m; return;
    }
  }
  // ---------- lobby UI ----------
  const el = document.createElement("div");
  el.className = "screen"; el.id = "mpScreen"; el.hidden = true;
  el.innerHTML = `<div style="position:absolute;inset:0;background:rgba(5,10,8,0.72);"></div>
  <div class="menu-inner mp-inner">
    <h2 style="font-size:26px;">Multiplayer</h2>
    <div id="mpHome" class="panel mp-box">
      <label class="mp-l">Your name <input id="mpName" maxlength="16" autocomplete="off" placeholder="Rider"></label>
      <button class="btn primary" id="mpCreate">Create Private Race</button>
      <div class="mp-join"><input id="mpCode" maxlength="6" autocomplete="off" placeholder="ROOM CODE"><button class="btn" id="mpJoin">Join Race</button></div>
      <div class="mp-note">Race up to 5 friends live — you'll get a code to send them. Everyone needs this website open.</div>
    </div>
    <div id="mpLobby" class="panel mp-box" hidden>
      <div class="mp-code-row"><span>Room code</span><b id="mpCodeBig">——————</b><button class="btn small" id="mpCopyCode">Copy code</button><button class="btn small" id="mpCopyLink">Copy link</button></div>
      <div id="mpPlayers" class="mp-players"></div>
      <div class="mp-sub">Your horse</div><div id="mpHorses" class="opt-row mp-horses"></div>
      <div class="mp-sub">Race <span id="mpHostNote"></span></div>
      <div id="mpSettings"></div>
      <div class="mp-actions"><button class="btn primary" id="mpReady">Ready</button><button class="btn" id="mpStart">Start Race</button><button class="btn" id="mpLeave">Leave</button></div>
    </div>
    <div id="mpStatus" class="mp-status"></div>
    <button class="btn" id="mpBack">Back</button>
  </div>`;
  document.body.appendChild(el);
  screens.mp = el;
  const st = document.createElement("style");
  st.textContent = `.mp-inner{max-width:720px}.mp-box{padding:16px 18px;display:flex;flex-direction:column;gap:12px;width:100%;align-items:stretch}
  .mp-l{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--fg-dim);letter-spacing:.08em;text-transform:uppercase}
  .mp-box input{background:rgba(255,255,255,.08);border:1px solid var(--panel-line);color:var(--fg);border-radius:8px;padding:10px 12px;font-size:16px;font-family:var(--font-b)}
  .mp-join{display:flex;gap:8px}.mp-join input{flex:1;text-transform:uppercase;letter-spacing:.3em;font-family:var(--font-d);font-weight:800}
  .mp-note,.mp-sub{font-size:12px;color:var(--fg-dim)}.mp-sub{letter-spacing:.1em;text-transform:uppercase;margin-top:4px}
  .mp-code-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mp-code-row span{font-size:12px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.1em}
  .mp-code-row b{font-family:var(--font-d);font-size:30px;letter-spacing:.25em;color:var(--accent)}
  .mp-players{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}.mp-p{padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid var(--panel-line);font-size:13px}
  .mp-p b{font-family:var(--font-d);font-size:15px}.mp-p .rd{float:right;font-weight:800;font-size:11px;letter-spacing:.1em}.mp-p .rd.on{color:var(--good)}.mp-p .rd.off{color:var(--fg-dim)}.mp-p.me{border-color:rgba(232,195,90,.6)}
  .mp-horses .chip{font-size:12px;padding:6px 10px}.mp-horses .chip[disabled]{opacity:.35;cursor:not-allowed}
  .mp-actions{display:flex;gap:10px;flex-wrap:wrap}.mp-status{min-height:18px;font-size:13px;color:var(--fg-dim);text-align:center}.mp-status.err{color:var(--bad)}
  #mpSettings .opt-row{margin-bottom:6px}#mpSettings .chip[disabled]{opacity:.6;cursor:default}
  #mpNet{position:absolute;top:8px;left:50%;transform:translateX(-50%);font-size:11px;letter-spacing:.1em;padding:3px 10px;border-radius:999px;background:rgba(10,16,13,.7);border:1px solid var(--panel-line);color:var(--fg-dim);pointer-events:none;z-index:5}
  #mpBanner{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);padding:14px 22px;border-radius:10px;background:rgba(10,16,13,.9);border:1px solid var(--panel-line);font-family:var(--font-d);font-weight:800;z-index:50}
  .mp-tag{position:absolute;transform:translate(-50%,-100%);font-family:var(--font-d);font-weight:800;font-size:11px;letter-spacing:.06em;padding:2px 8px;border-radius:999px;background:rgba(20,30,60,.82);border:1px solid rgba(140,180,255,.7);color:#cfe0ff;pointer-events:none;white-space:nowrap}
  #mpSpec{position:absolute;top:44px;left:50%;transform:translateX(-50%);font-family:var(--font-d);font-weight:800;font-size:13px;letter-spacing:.08em;padding:6px 14px;border-radius:999px;background:rgba(20,30,60,.85);border:1px solid rgba(140,180,255,.7);color:#cfe0ff;pointer-events:none;z-index:6;text-align:center}
  #mpSpec small{display:block;font-family:var(--font-b);font-weight:400;font-size:11px;letter-spacing:.04em;opacity:.8}
  #hud.mp-spec .hud-bc,#hud.mp-spec #prox,#hud.mp-spec #rhythmBar{display:none}
  .res-mp{font-family:var(--font-d);font-weight:800;font-size:15px;letter-spacing:.06em;margin:6px 0;color:var(--accent)}`;
  document.head.appendChild(st);
  const $m = id => document.getElementById(id);
  try { $m("mpName").value = localStorage.getItem("ff_name") || ""; } catch (e) {}
  const nameNow = () => { const v = $m("mpName").value.trim() || "Rider"; try { localStorage.setItem("ff_name", v); } catch (e) {} return v; };
  function setStatus(t, err) { const s = $m("mpStatus"); s.textContent = t || ""; s.className = "mp-status" + (err ? " err" : ""); }
  let bannerEl = null;
  function netBanner(t, err) { if (!t) { if (bannerEl) { bannerEl.remove(); bannerEl = null; } return; } if (!bannerEl) { bannerEl = document.createElement("div"); bannerEl.id = "mpBanner"; document.body.appendChild(bannerEl); } bannerEl.textContent = t; bannerEl.style.color = err ? "var(--bad)" : ""; }
  $m("mpCreate").onclick = () => { setStatus("Connecting…"); connect(() => { send({ type: "create", name: nameNow() }); setStatus(""); }); };
  $m("mpJoin").onclick = () => {
    const c = $m("mpCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length !== 6) { setStatus(ERR["invalid-code"], true); return; }
    setStatus("Connecting…"); connect(() => { send({ type: "join", code: c, name: nameNow() }); setStatus(""); });
  };
  $m("mpCode").addEventListener("keydown", e => { if (e.key === "Enter") $m("mpJoin").click(); e.stopPropagation(); });
  $m("mpName").addEventListener("keydown", e => e.stopPropagation());
  $m("mpReady").onclick = () => { const me = M.lobby && M.lobby.players[M.slot]; send({ type: "ready", ready: !(me && me.ready) }); };
  $m("mpStart").onclick = () => send({ type: "start" });
  $m("mpLeave").onclick = () => leaveRoom();
  $m("mpBack").onclick = () => { if (M.inRoom) leaveRoom(); show("menu"); };
  const copy = t => { try { navigator.clipboard.writeText(t); toast("Copied", "good", 0.8); } catch (e) { prompt("Copy this:", t); } };
  $m("mpCopyCode").onclick = () => copy(M.code || "");
  $m("mpCopyLink").onclick = () => copy(location.origin + location.pathname + "?join=" + (M.code || ""));
  function leaveRoom() { send({ type: "leave" }); M.wantClose = true; M.inRoom = false; M.code = null; M.token = null; M.lobby = null; clearSession(); renderLobby(); setStatus(""); try { M.ws && M.ws.close(); } catch (e) {} }
  function renderLobby() {
    const L = M.lobby, inLobby = M.inRoom && L;
    $m("mpHome").hidden = !!inLobby; $m("mpLobby").hidden = !inLobby;
    if (!inLobby) return;
    $m("mpCodeBig").textContent = L.code;
    const me = L.players[M.slot], host = L.host === M.slot, here = L.players.filter(Boolean), others = L.players.filter((p, i) => p && i !== M.slot);
    M.names = L.players.map(p => p ? p.name : "");
    $m("mpPlayers").innerHTML = L.players.map((p, i) => p ? `<div class="mp-p${i === M.slot ? " me" : ""}"><span class="rd ${p.ready ? "on" : "off"}">${p.connected ? (p.ready ? "READY" : "NOT READY") : "DISCONNECTED"}</span><b>${esc(p.name)}</b>${i === L.host ? " · host" : ""}${i === M.slot ? " · you" : ""}<br>${ROSTER[p.horse] ? esc(ROSTER[p.horse].name) + " · " + ROSTER[p.horse].role : ""}</div>` : "").join("")
      + (here.length < L.players.length ? `<div class="mp-p"><b>${here.length < 2 ? "Waiting for a friend…" : "Room for " + (L.players.length - here.length) + " more"}</b><br>Send them the code or the link.</div>` : "");
    const hz = $m("mpHorses"); hz.innerHTML = "";
    ROSTER.forEach((r, i) => {
      const b = document.createElement("button"); b.className = "chip" + (me && me.horse === i ? " sel" : "");
      b.textContent = r.name; const taken = others.find(o => o.horse === i); if (taken) { b.disabled = true; b.title = "Taken by " + taken.name; }
      b.onclick = () => send({ type: "pick", horse: i }); hz.appendChild(b);
    });
    const S = L.settings, sEl = $m("mpSettings"); sEl.innerHTML = "";
    const row = (label, opts, cur, key, fmt, off) => {
      const r = document.createElement("div"); r.className = "opt-row"; r.innerHTML = `<span class="mp-note" style="min-width:90px">${label}</span>`;
      opts.forEach(o => { const b = document.createElement("button"); b.className = "chip" + (String(o) === String(cur) ? " sel" : ""); b.textContent = fmt ? fmt(o) : o; b.disabled = !host || (off && off(o)); b.onclick = () => send({ type: "settings", settings: { [key]: o } }); r.appendChild(b); });
      sEl.appendChild(r);
    };
    row("Distance", DISTANCES, S.dist, "dist", v => v + "m"); row("Going", Object.keys(GOING), S.going, "going", v => GOING[v].label);
    const nh = Math.max(2, here.length);   // the field is never smaller than the riders in the room
    row("Runners", [6, 8, 10, 12], Math.max(S.field, here.length), "field", v => v + " (" + Math.max(0, v - nh) + " AI)", v => v < here.length); row("AI skill", ["easy", "medium", "hard"], S.diff, "diff");
    row("Incidents", ["off", "stumbles", "full"], S.chaos ? "full" : S.incidents, "incidents", v => ({ off: "Off", stumbles: "Stumbles", full: "Full" })[v], () => !!S.chaos);
    row("Chaos mode", [false, true], !!S.chaos, "chaos", v => v ? "On" : "Off");
    if (S.chaos) { const n = document.createElement("div"); n.className = "mp-note"; n.style.textAlign = "center"; n.textContent = "Chaos: a normal race, but each rider has ONE kick (P, holding A or D for the side) that knocks over the horse right beside them — and nobody steers or brakes around a fallen horse, so pile-ups come from real contact."; sEl.appendChild(n); }
    $m("mpHostNote").textContent = host ? "(you're the host)" : "(the host sets these)";
    $m("mpReady").textContent = me && me.ready ? "Not Ready" : "Ready";
    const allReady = here.length >= 2 && here.every(p => p.ready && p.connected);
    $m("mpStart").hidden = !host; $m("mpStart").disabled = !allReady;
    setStatus(here.length < 2 ? "Waiting for a friend to join…" : !allReady ? `${here.filter(p => p.ready).length}/${here.length} ready — everyone: pick a horse and press READY.` : host ? `All ${here.length} ready — start the race!` : `All ${here.length} ready — waiting for the host to start.`);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // ---------- the race ----------
  let tagEls = [], netEl = null, specEl = null;
  function beginRace(m) {
    if (m.resume && race && race.seed === m.cfg.seed && M.racing) { netBanner(null); return; }   // reconnected mid-race: carry on
    M.snaps = []; M.evq = []; M.results = null; M.meta = null; M.msgs = {}; M.names = m.names || M.names;
    M.racing = true; M.lastSend = 0; M.lastInp = "";
    const cfg = Object.assign({}, m.cfg, { hooks: null });
    startRace(cfg);
    // rider k rides race.horses[k]; slots[k] is their seat in the room
    M.slots = m.slots || [0, 1]; M.hn = m.names || [];
    const myIdx = M.slots.indexOf(M.slot);
    M.myIdx = myIdx; M.rivals = M.slots.map((s, k) => k).filter(k => k !== myIdx); M.spec = null; resetSpecHud();
    const me = race.horses[myIdx];
    race.player = me; race.st = me.st; me.isPlayer = true; me.mpName = null;
    for (const k of M.rivals) { const rv = race.horses[k]; rv.isPlayer = false; rv.mpName = M.hn[k] || "Friend"; }
    riderInput.effort = me.effort; M.startHold = { m: me.st.m, mv: 0 };
    camMode = settings.cam; netBanner(null);
    if (!netEl) { netEl = document.createElement("div"); netEl.id = "mpNet"; $("hud").appendChild(netEl); }
    tagEls.forEach(t => t.remove()); tagEls = M.rivals.map(() => { const t = document.createElement("div"); t.className = "mp-tag"; t.hidden = true; $("hud").appendChild(t); return t; });
    if (!specEl) { specEl = document.createElement("div"); specEl.id = "mpSpec"; $("hud").appendChild(specEl); }
    netEl.hidden = false; specEl.hidden = true;
    showMsg(m.resume ? "Reconnected" : "Online race · " + M.hn.join(" v "), 2.2);
  }
  function addSnap(m) {
    // how late snapshots arrive (one-way delay + jitter): the interpolation buffer is sized from the worst recent ones
    const late = est() - m.s; M.late.push(late); if (M.late.length > 60) M.late.shift();
    const sorted = M.late.slice().sort((x, y) => x - y), p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    M.delayTarget = clamp(p95 + 60, 100, 450);
    M.snaps.push(m); if (M.snaps.length > 80) M.snaps.shift();
    if (m.ev && m.ev.length) M.evq.push(...m.ev);
  }
  const lerp2 = (a, b, u) => a + (b - a) * u;
  function update(dt) {
    if (!race || !M.snaps.length) return;
    // render a little in the past (interpolation buffer); grow the buffer if snapshots arrive late
    M.delay += clamp(M.delayTarget - M.delay, -dt * 40, dt * 400);          // grow quickly when late, shrink gently
    const last = M.snaps[M.snaps.length - 1], Rt = est() - M.delay;
    let a = M.snaps[0], b = last;
    for (let i = M.snaps.length - 1; i > 0; i--) if (M.snaps[i - 1].s <= Rt) { a = M.snaps[i - 1]; b = M.snaps[i]; break; }
    const u = b.s > a.s ? clamp((Rt - a.s) / (b.s - a.s), 0, 1) : 1;
    // a late snapshot: carry the horses on at their known speed for a moment rather than freezing them (≤ 0.3 s)
    const ext = Rt > b.s ? Math.min(0.3, (Rt - b.s) / 1000) : 0;
    race.state = u >= 1 || a.state === b.state ? b.state : a.state;
    race.clock = (a.state === b.state ? lerp2(a.c, b.c, u) : b.c * (u >= 1 ? 1 : 0)) + (b.state === "running" ? ext : 0);
    race.countT = lerp2(a.countT, b.countT, u); race.loadT = lerp2(a.loadT, b.loadT, u); race.leaderProgress = lerp2(a.lp, b.lp, u);
    race.horses.forEach((h, i) => {
      const A = a.H[i], B = b.H[i]; if (!A || !B) return;
      h.progress = lerp2(A[0], B[0], u); h.laneF = lerp2(A[1], B[1], u); h.latV = lerp2(A[2], B[2], u); h.v = lerp2(A[3], B[3], u); h.phase = lerp2(A[4], B[4], u);
      if (ext > 0 && !(B[15] & 8)) { h.progress += B[3] * ext; h.laneF = clamp(h.laneF + B[2] * ext, 0, NLANES - 1); h.phase += (B[4] - A[4]) / Math.max(0.001, (b.s - a.s) / 1000) * ext; }
      h.eAct = lerp2(A[5], B[5], u); h.F = lerp2(A[6], B[6], u); h.mpRide = lerp2(A[7], B[7], u); h.mom = lerp2(A[8], B[8], u); h.accel = lerp2(A[9], B[9], u);
      h.restrainLvl = lerp2(A[10], B[10], u); h.relax = lerp2(A[11], B[11], u); h.stumV = lerp2(A[12], B[12], u); h.fallT = lerp2(A[13], B[13], u);
      h.rank = B[14]; const fl = B[15]; h.finished = !!(fl & 1); h.dnf = !!(fl & 2); h.started = !!(fl & 4); h.fallen = !!(fl & 8); h.fallDir = B[16]; h.vFall = B[17];
      h.fallKind = ["balance", "trip", "side"][(fl >> 4) & 3];
      if (h.fallen && h.fallT <= 0) h.fallT = 0.0001;
      race.route.point(h.progress, laneOff(h.laneF), h.pos);
    });
    race.order = race.horses.slice().sort((x, y) => x.rank - y.rank); race.leader = race.order[0];
    race.dnfs = race.horses.filter(h => h.dnf);
    // our own horse: full detail (stamina, rhythm, balance, start meter) from the server; effort shown as we ask it
    const me = race.player, Pa = a.P[M.myIdx], Pb = b.P[M.myIdx];
    if (Pb) {
      for (const k of ["S", "SR", "keen", "stab", "kB", "lean", "aDem", "cap", "lowStab", "groundLost", "urgeHeat", "penT"]) me[k] = Pa ? lerp2(Pa[k], Pb[k], u) : Pb[k];
      me.rhythmT = Pa ? lerp2(Pa.rhythmT, Pb.rhythmT, u) : Pb.rhythmT;
      me.streak = Pb.streak; me.missRun = Pb.missRun; me.restrain = !!Pb.restrain; me.drive = !!Pb.drive; me.settle = !!Pb.settle; me.sideBlocked = Pb.sideBlocked; me.blocked = !!Pb.blocked; me.onBend = !!Pb.onBend;
      me.stat.overtakes = Pb.overtakes; me.stat.lost = Pb.lost; if (Pb.startCat) me.startCat = Pb.startCat;
      me.effort = riderInput.effort; me.kickUsed = !!Pb.kickUsed;
      if (Pb.st && me.st) {
        const S = me.st; S.z = Pa && Pa.st ? lerp2(Pa.st.z, Pb.st.z, u) : Pb.st.z; S.R = Pb.st.R; S.open = !!Pb.st.open; S.launched = !!Pb.st.launched; S.cat = Pb.st.cat; S.rt = Pb.st.rt; S.zone = Pb.st.zone;
        if (race.state === "load" || race.state === "count") {   // the marker responds to Space at once on screen (same rules as the server)
          const H = M.startHold; H.mv += (riderInput.hold ? 2.7 : -2.4) * dt; H.mv *= Math.pow(0.02, dt); H.m += H.mv * dt;
          if (H.m < 0) { H.m = 0; H.mv = Math.max(0, H.mv); } if (H.m > 1) { H.m = 1; H.mv = Math.min(0, H.mv); }
          S.m = H.m; S.aligned = Math.abs(S.m - S.z) < S.zone;
        }
      }
    }
    for (const k of M.rivals) { const rv = race.horses[k], Pr = b.P[k]; if (rv && Pr) { rv.S = Pr.S; rv.SR = Pr.SR; rv.effort = Pr.effort; rv.aiRiding = !!Pr.ai; } }
    const running = M.rivals.map(k => race.horses[k]).filter(h => h && !h.finished && !h.dnf);
    // events, in step with what's on screen
    while (M.evq.length && M.evq[0].t <= Rt) fire(M.evq.shift());
    // our own race calls
    if (!me.finished && !me.dnf && race.state === "running") {
      const rem = race.dist - me.progress;
      if (!M.msgs.f450 && rem <= RHYTHM_AT) { M.msgs.f450 = 1; showMsg("FINAL DRIVE!", 1.6); }
      else if (!M.msgs.f400 && rem <= 400) { M.msgs.f400 = 1; toast("FINAL 400M", "info"); }
      else if (!M.msgs.f200 && rem <= 200) { M.msgs.f200 = 1; showMsg("FINAL FURLONG!", 1.2); }
    }
    if (me.finished && !M.msgs.wait && running.length) { M.msgs.wait = 1; setTimeout(() => toast("Waiting for " + running.map(h => h.mpName).join(", ") + " to finish…", "info", 3), 2500); }
    updateSpectate(me, running);
    // send our controls (≈30 Hz, or at once on a change)
    const inp = { effort: Math.round(riderInput.effort * 1000) / 1000, steer: riderInput.steer, settle: riderInput.settle, check: riderInput.check, drive: riderInput.drive, hold: riderInput.hold, adv: riderInput.adv, dl: Math.round(M.delay) / 1000,
      sm: race.st && !race.st.open ? Math.round(M.startHold.m * 1000) / 1000 : null };
    const key = JSON.stringify([inp.effort, inp.steer, inp.settle, inp.check, inp.drive, inp.hold, inp.adv]), t = now();   // marker/delay ride along, they don't force a send
    if (key !== M.lastInp || t - M.lastSend > (inp.sm != null ? 66 : 200)) { if (t - M.lastSend > 30 || key !== M.lastInp) { send({ type: "input", i: inp }); M.lastSend = t; M.lastInp = key; } }
    // the other riders' horses: small name tags, and the connection readout
    const ai = M.rivals.map(k => race.horses[k]).filter(h => h && h.aiRiding).map(h => h.mpName);
    if (netEl) netEl.textContent = `ONLINE · ${Math.round(M.rtt)} ms` + (ai.length ? ` · AI riding ${ai.join(", ")}` : "");
    const view = camHorse();
    M.rivals.forEach((k, j) => {
      const rv = race.horses[k], tag = tagEls[j]; if (!tag) return;
      if (!rv || !rv.mesh) { tag.hidden = true; return; }
      const d = Math.abs(rv.progress - view.progress), jockeyCam = camMode === 1 && !M.spec;
      _mpv.set(rv.mesh.position.x, 3.0, rv.mesh.position.z).project(camera);
      const on = (jockeyCam ? d < 30 : d < 90) && _mpv.z < 1 && Math.abs(_mpv.x) < 1.05 && Math.abs(_mpv.y) < 1.05;
      tag.hidden = !on; if (on) { tag.textContent = "★ " + rv.mpName + (rv.fallen ? " (fallen)" : ""); tag.style.left = clamp((_mpv.x * 0.5 + 0.5) * innerWidth, 50, innerWidth - 50) + "px"; tag.style.top = clamp((-_mpv.y * 0.5 + 0.5) * innerHeight, 24, innerHeight - 24) + "px"; }
    });
    if (M.results && M.replayBuf) finishOnline();
  }
  const _mpv = new THREE.Vector3();
  /* Spectating: once our horse is down (and the fall has played for a moment) the camera follows a rider who is still
     racing. A / D (or ← / →) switch between them. The race goes on until every rider has finished or fallen. */
  let specKeys = {};
  function updateSpectate(me, running) {
    const down = me.fallen && race.state === "running" && (me.fallT || 0) > 3.2;
    // every rider down: follow whichever horse is in front (the race runs on until it wins)
    const leader = !running.length ? race.order.find(h => !h.fallen && !h.dnf && !h.finished) : null;
    if (!down || (!running.length && !leader)) { M.spec = null; if (specEl) specEl.hidden = true; specKeys = {}; return; }
    if (leader) {
      if (M.spec !== leader) { cam.specCut = true; cam.lagBack = 0; cam.pullback = 0; cam.side = 0; }
      M.spec = leader; specEl.hidden = false;
      specEl.innerHTML = `SPECTATING THE LEADER · ${esc(leader.def.name)}<small>Every rider is down — watching the race to the line</small>`;
      return;
    }
    let i = M.spec ? running.indexOf(M.spec) : -1;
    if (i < 0) i = 0;
    const edge = k => { const on = !!keys[k], was = specKeys[k]; specKeys[k] = on; return on && !was; };
    if (edge("d") || edge("arrowright")) i = (i + 1) % running.length;
    if (edge("a") || edge("arrowleft")) i = (i - 1 + running.length) % running.length;
    if (M.spec !== running[i]) { cam.specCut = true; cam.lagBack = 0; cam.pullback = 0; cam.side = 0; }
    M.spec = running[i];
    specEl.hidden = false;
    specEl.innerHTML = `SPECTATING ★ ${esc(M.spec.mpName)} · ${ordinal(race.order.indexOf(M.spec) + 1).toUpperCase()}` + (running.length > 1 ? `<small>A / D to switch rider (${i + 1} of ${running.length})</small>` : `<small>You fell — watching the race to the line</small>`);
  }
  // while spectating, the speed / stamina panel shows the rider being watched and the riding controls are hidden
  function afterHUD() {
    const hud = $("hud"), h = M.spec; hud.classList.toggle("mp-spec", !!h);
    const ai = !!h && !h.mpName;   // the server doesn't send an AI horse's stamina / sprint reserve: hide those rather than guess
    $("hStamBar").parentElement.style.display = ai ? "none" : ""; $("hSpr").parentElement.parentElement.style.display = ai ? "none" : "";
    if (!h) return;
    $("hSpeed").textContent = Math.round(h.v * 3.6); $("hAcc").textContent = h.mpName ? "★ " + h.mpName : h.def.name;
    setBar("hStam", h.S || 0); $("hStamV").textContent = Math.round(h.S || 0);
    setBar("hFat", h.F || 0, true); $("hFatV").textContent = Math.round(h.F || 0);
    setBar("hSpr", h.SR || 0, false, "#6aa7e8"); $("hSprV").textContent = Math.round(h.SR || 0); $("hFatWarn").classList.remove("on");
  }
  function resetSpecHud() { $("hud").classList.remove("mp-spec"); $("hStamBar").parentElement.style.display = ""; $("hSpr").parentElement.parentElement.style.display = ""; }
  // the horse the camera should follow (our own unless we're spectating)
  function camHorse() { return (M.racing && M.spec && race && race.horses.includes(M.spec)) ? M.spec : race.player; }
  function fire(e) {
    const H = race.horses, h = e.i != null && e.i >= 0 ? H[e.i] : null;
    switch (e.k) {
      case "msg": showMsg(e.text, e.dur); break;
      case "tick": audio.tick(); break;
      case "gate": raceHooks.gate(); break;
      case "lead": if (h) raceHooks.lead(h, e.p >= 0 ? H[e.p] : null); break;
      case "photo": raceHooks.photo(); break;
      case "finish": if (h) { h.finished = true; h.finishTime = e.ft; if (!race.finishOrder.includes(h)) race.finishOrder.push(h); if (h === race.player || race.finishOrder.length === 1) raceHooks.finish(h); if (h.mpName) toast(h.mpName + " finishes " + ordinal(race.finishOrder.length), "info", 1.8); } break;
      case "incident": if (h) raceHooks.incident(e.type, h, e.o >= 0 ? H[e.o] : null); break;
      case "kick": if (h) { animateKick(h, e.side || (h.steerIn || 1)); const v = e.o >= 0 ? H[e.o] : null; if (v === race.player) toast((h.mpName || h.def.name).toUpperCase() + " KICKED YOU OVER!", "bad", 2); else if (h.mpName && v) toast(h.mpName + " kicked " + v.def.name + " over!", "warn", 1.6); else if (h.mpName && !v && h !== race.player) toast(h.mpName + "'s kick missed!", "info", 1.4); } break;
      case "fall": if (h) { h.fallen = true; h.dnf = true; if (h === race.player) { h.stat.dnfAt = Math.round(h.progress); cam.fallT = 0; } raceHooks.fall(h); if (h.mpName) toast(h.mpName + " has fallen!", "bad", 2); } break;
      case "start": if (h === race.player) raceHooks.start(e.cat, e.rt); else if (h && h.mpName) toast(h.mpName + ": " + START_CATS[e.cat].label.toLowerCase(), "info", 1.4); break;
      case "ai": { const who = H[e.i]; toast((who === race.player ? "You were disconnected — an AI jockey rode your horse" : (M.hn[e.i] || "A rider") + " didn't return — an AI jockey takes over"), "warn", 3); break; }
    }
  }
  // Space: the server judges it at the moment we saw it (our rendered race time), within the latency it measured
  function press() {
    const me = race.player; if (!me || me.fallen) return;
    if (race.state !== "running") return;
    send({ type: "press", rt: race.clock, tSeen: race.clock });
  }
  function kick(side) { const me = race && race.player; if (!me || me.fallen || me.kickUsed || race.state !== "running") return; send({ type: "kick", side: side || 0 }); }
  function localInput(inp, dt) {
    const p = race.player; if (!p) return;
    p.effort = inp.effort; p.steerIn = inp.steer; p.steerAssist = !inp.adv;   // the HUD reacts at once; the server rides the horse
  }
  // ---------- results & replay (from the server's official race and recording) ----------
  function onBinary(buf) { M.replayBuf = new Float32Array(buf); }
  function finishOnline() {
    const R = M.results, meta = M.meta, buf = M.replayBuf; M.results = null; M.replayBuf = null;
    if (!race || !meta) return;
    const H = race.horses, F = meta.F, nH = meta.H;
    race.state = "done";
    race.finishOrder = R.order.map(([i, ft, fv]) => { const h = H[i]; h.finished = true; h.finishTime = ft; h.stat.finishV = fv; return h; });
    race.dnfs = R.dnfs.map(i => H[i]);
    R.fallen.forEach((f, i) => { if (f) { const h = H[i]; h.fallen = true; h.dnf = true; h.fallDir = f[0]; h.vFall = f[1]; h.fallCause = f[2]; h.stat.dnfAt = f[3]; h.stat.dnfT = f[4]; h.fallKind = f[5] || "balance"; } });
    R.riders.forEach(r => { const h = H[r.i]; Object.assign(h.stat, r.stat); Object.assign(h, { S: r.S, F: r.F, SR: r.SR, distRun: r.distRun, groundLost: r.groundLost, incidents: r.incidents || [], fallCause: r.fallCause, dnf: r.dnf, fallen: r.fallen, startCat: r.startCat, lowStab: r.lowStab, aiTook: r.ai }); });
    race.tel = { t: R.tel.t, prog: R.tel.prog, rank: R.tel.rank, v: [], S: [], F: [], e: [], cmd: [] };
    race.events = R.events.map(e => Object.assign({}, e, { h: H[e.h], other: e.other >= 0 ? H[e.other] : null }));
    race.leadChanges = R.leadChanges;
    let o = 0; const n = meta.n, m = meta.m;
    const rt = new Float64Array(n); for (let j = 0; j < n; j++) rt[j] = buf[o++];
    const rd = new Float64Array(n * nH * F); for (let j = 0; j < rd.length; j++) rd[j] = buf[o++];
    const ft = buf.slice(o, o + m); o += m; const fd = buf.slice(o, o + m * nH * F);
    race.rec = { cap: Math.max(1, n), n, head: 0, k: 0, t: rt, d: rd, stopT: Infinity };
    race.recFull = { cap: Math.max(1, m), n: m, k: 0, t: ft, d: fd };
    M.racing = false; M.lastOfficial = R; M.spec = null; resetSpecHud();
    tagEls.forEach(t => { t.hidden = true; }); if (netEl) netEl.hidden = true; if (specEl) specEl.hidden = true;
    finishRace(race);
    // the online result: every rider, in finishing order (fallers last)
    const placeOf = r => r.dnf ? 99 : R.order.findIndex(x => x[0] === r.i) + 1;
    const line = R.riders.slice().sort((x, y) => placeOf(x) - placeOf(y)).map(r => { const pl = R.order.findIndex(x => x[0] === r.i) + 1; return `${esc(r.name).toUpperCase()}${r.slot === M.slot ? " (YOU)" : ""} — ${r.dnf ? "DNF" : ordinal(pl).toUpperCase()}${r.ai != null ? " (AI rode from " + r.ai + " m)" : ""}`; }).join(" · ");
    let b = document.getElementById("resMPLine"); if (!b) { b = document.createElement("div"); b.id = "resMPLine"; b.className = "res-mp"; $("resPlace").insertAdjacentElement("afterend", b); }
    b.hidden = false; b.innerHTML = line;
    $("resAgain").hidden = true; $("resNext").hidden = true; $("resLobby").hidden = false;
  }
  function backToLobby() { const b = document.getElementById("resMPLine"); if (b) b.hidden = true; $("resLobby").hidden = true; clearRaceMeshes(); race = null; show("mp"); renderLobby(); setMenuHorse(settings.playerHorse); }
  function leaveRaceView() { M.racing = false; M.spec = null; resetSpecHud(); tagEls.forEach(t => { t.hidden = true; }); if (netEl) netEl.hidden = true; if (specEl) specEl.hidden = true; clearRaceMeshes(); race = null; show("mp"); renderLobby(); }
  // ---------- entry points ----------
  function open() { show("mp"); renderLobby(); if (!serverURL()) setStatus(ERR["no-server"], true); }
  // a shared link (?join=CODE) opens the join screen with the code filled in; a reload rejoins our room
  setTimeout(() => {
    if (typeof FF_FEATURES !== "undefined" && !FF_FEATURES.multiplayer) return;   // multiplayer parked: no auto-join / rejoin
    const q = new URLSearchParams(location.search).get("join");
    let ss = null; try { ss = JSON.parse(sessionStorage.getItem(SS_KEY) || "null"); } catch (e) {}
    if (ss && ss.code && ss.token && Date.now() - ss.t < 2 * 3600 * 1000 && serverURL()) { M.code = ss.code; M.token = ss.token; M.inRoom = true; show("mp"); connect(() => send({ type: "rejoin", code: ss.code, token: ss.token })); }
    else if (q) { open(); $m("mpCode").value = q.toUpperCase().slice(0, 6); setStatus("Enter your name and press JOIN RACE."); $m("mpName").focus(); }
  }, 300);
  M.open = open; M.camHorse = () => camHorse(); M.afterHUD = afterHUD; M.update = update; M.press = press; M.kick = kick; M.localInput = localInput; M.backToLobby = backToLobby; M.leave = () => { leaveRoom(); };
  return M;
})();
