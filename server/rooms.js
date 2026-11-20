'use strict';
// Private rooms (2–6 riders): create / join by code, lobby (names, horses, readiness, host settings), the race session,
// disconnects and reconnects (with a server-issued token), and cleanup of abandoned rooms.
const { performance } = require('perf_hooks');
const P = require('./protocol');
const { RaceSession } = require('./race-server');
const { ROSTER } = require('../public/sim.js');

const LOBBY_GRACE_MS = 90 * 1000;     // a player who drops out of the lobby keeps their seat this long
const EMPTY_ROOM_MS = 5 * 60 * 1000;  // a room with nobody connected is removed after this
const IDLE_ROOM_MS = 45 * 60 * 1000;  // any room idle this long is removed
const MAX_ROOMS = 400;

class Room {
  constructor(code, mgr) {
    this.code = code; this.mgr = mgr; this.players = Array(P.MAX_PLAYERS).fill(null); this.host = 0;
    this.settings = Object.assign({}, P.DEFAULT_SETTINGS); this.state = 'lobby'; this.session = null; this.touched = Date.now(); this.lastResults = null;
  }
  nextSeed() { return P.newSeed(); }
  slotOf(ws) { return this.players.findIndex(p => p && p.ws === ws); }
  // slot: one player; null: everyone; { not: s }: everyone except s
  send(slot, msg, binary) {
    const all = this.players.map((p, i) => i), targets = slot == null ? all : typeof slot === 'object' ? all.filter(i => i !== slot.not) : [slot];
    for (const s of targets) { const p = this.players[s]; if (p && p.ws && p.ws.readyState === 1) { try { p.ws.send(binary ? msg : JSON.stringify(msg)); } catch (e) { /* closed */ } } }
  }
  lobbyState() {
    return { type: 'lobby', code: this.code, state: this.state, host: this.host, settings: this.settings,
      players: this.players.map((p, i) => p ? { slot: i, name: p.name, horse: p.horse, ready: p.ready, connected: !!(p.ws && p.ws.readyState === 1) } : null) };
  }
  broadcastLobby() { this.send(null, this.lobbyState()); }
  touch() { this.touched = Date.now(); }
  addPlayer(ws, name) {
    const slot = this.players.findIndex(p => !p);
    const used = this.players.filter(Boolean).map(p => p.horse);
    const horse = [4, 0, 2, 7, 8, 9, 1, 3, 5, 6, 10, 11].find(h => !used.includes(h));
    this.players[slot] = { name: P.cleanName(name), token: P.newToken(), ws, horse, ready: false, rtt: 150, discAt: null };
    ws.room = this; ws.slot = slot;
    return slot;
  }
  welcome(slot) { const p = this.players[slot]; this.send(slot, { type: 'welcome', code: this.code, slot, token: p.token, name: p.name }); }
  resetReady() { this.players.forEach(p => { if (p) p.ready = false; }); }
  pick(slot, horse) {
    if (this.state !== 'lobby') return 'race-running';
    horse = +horse; if (!Number.isInteger(horse) || horse < 0 || horse >= ROSTER.length) return 'invalid-horse';
    if (this.players.some((p, i) => p && i !== slot && p.horse === horse)) return 'horse-taken';
    this.players[slot].horse = horse; this.players[slot].ready = false; return null;
  }
  setReady(slot, on) { if (this.state !== 'lobby') return 'race-running'; this.players[slot].ready = !!on; return null; }
  setSettings(slot, o) {
    if (slot !== this.host) return 'host-only'; if (this.state !== 'lobby') return 'race-running';
    const s = P.cleanSettings(o, this.settings); if (!s) return 'invalid-settings';
    this.settings = s; this.resetReady(); return null;
  }
  start(slot) {
    if (slot !== this.host) return 'host-only';
    if (this.state !== 'lobby') return 'race-running';
    const here = this.players.filter(Boolean);
    if (here.length < 2) return 'need-two-players';
    if (!here.every(p => p.ws && p.ws.readyState === 1)) return 'player-disconnected';
    if (!here.every(p => p.ready)) return 'not-ready';
    if (new Set(here.map(p => p.horse)).size !== here.length) return 'horse-taken';
    this.state = 'racing'; this.lastResults = null;
    this.session = new RaceSession(this, (s, m, bin) => this.send(s, m, bin));
    this.session.onDone = () => {
      this.lastResults = { results: this.session.results, replay: this.session.replay };
      this.state = 'lobby'; this.resetReady(); this.session = null; this.broadcastLobby();
    };
    this.broadcastLobby();
    this.session.start();
    return null;
  }
  disconnect(slot) {
    const p = this.players[slot]; if (!p) return;
    p.ws = null; p.discAt = Date.now();
    if (this.state === 'lobby') p.ready = false;
    if (this.session) this.session.setConnected(slot, false);
    this.send({ not: slot }, { type: 'peer', slot, connected: false });
    this.broadcastLobby();
  }
  leave(slot) {
    if (this.session && this.state === 'racing') { this.disconnect(slot); return; }   // mid-race: same as dropping out
    this.players[slot] = null;
    this.passHost(slot);
    this.resetReady(); this.broadcastLobby();
  }
  rejoin(ws, token) {
    const slot = this.players.findIndex(p => p && p.token === token);
    if (slot < 0) return -1;
    const p = this.players[slot];
    if (p.ws && p.ws !== ws && p.ws.readyState === 1) { try { p.ws.close(4000, 'replaced'); } catch (e) {} }
    p.ws = ws; p.discAt = null; ws.room = this; ws.slot = slot;
    this.welcome(slot);
    this.send({ not: slot }, { type: 'peer', slot, connected: true });
    this.broadcastLobby();
    if (this.session) {   // back into the running race: the race set-up, then the latest authoritative state
      this.session.setConnected(slot, true);
      this.send(slot, Object.assign(this.session.startMsg(), { resume: true }));
      this.send(slot, this.session.snapshot(performance.now(), slot));
    } else if (this.lastResults) {   // the race finished while they were away
      this.send(slot, this.lastResults.results); this.send(slot, this.lastResults.replay.meta); this.send(slot, this.lastResults.replay.buf, true);
    }
    return slot;
  }
  sweep(now) {
    // lobby seats of long-gone players are freed; the host role moves to whoever is still here
    if (this.state === 'lobby') this.players.forEach((p, i) => { if (p && !p.ws && p.discAt && now - p.discAt > LOBBY_GRACE_MS) { this.players[i] = null; this.passHost(i); this.broadcastLobby(); } });
    const anyone = this.players.some(p => p && p.ws && p.ws.readyState === 1);
    if (!anyone && (!this.emptySince)) this.emptySince = now;
    if (anyone) this.emptySince = null;
    return (this.emptySince && now - this.emptySince > EMPTY_ROOM_MS) || now - this.touched > IDLE_ROOM_MS || this.players.every(p => !p);
  }
  // the host left: the longest-seated remaining rider takes over
  passHost(gone) { if (this.host === gone) { const n = this.players.findIndex(Boolean); if (n >= 0) this.host = n; } }
  close() { if (this.session) this.session.stop(); this.players.forEach(p => { if (p && p.ws) { try { p.ws.close(4001, 'room closed'); } catch (e) {} } }); }
}

class RoomManager {
  constructor() { this.rooms = new Map(); this.sweepTimer = setInterval(() => this.sweep(), 10 * 1000); }
  create(ws, name) {
    if (this.rooms.size >= MAX_ROOMS) return { err: 'server-full' };
    const code = P.newCode(new Set(this.rooms.keys()));
    const room = new Room(code, this); this.rooms.set(code, room);
    const slot = room.addPlayer(ws, name); room.host = slot;
    room.welcome(slot); room.broadcastLobby();
    return { room };
  }
  join(ws, code, name) {
    const c = P.cleanCode(code); if (!c) return { err: 'invalid-code' };
    const room = this.rooms.get(c); if (!room) return { err: 'no-such-room' };
    if (room.state === 'racing') return { err: 'race-started' };
    if (room.players.every(Boolean)) return { err: 'room-full' };
    const slot = room.addPlayer(ws, name); room.touch();
    room.welcome(slot); room.broadcastLobby();
    return { room };
  }
  rejoin(ws, code, token) {
    const c = P.cleanCode(code); const room = c && this.rooms.get(c);
    if (!room) return { err: 'no-such-room' };
    if (typeof token !== 'string' || token.length > 64) return { err: 'bad-token' };
    const slot = room.rejoin(ws, token); if (slot < 0) return { err: 'bad-token' };
    room.touch(); return { room };
  }
  sweep() { const now = Date.now(); for (const [code, room] of this.rooms) if (room.sweep(now)) { room.close(); this.rooms.delete(code); } }
  stop() { clearInterval(this.sweepTimer); for (const r of this.rooms.values()) r.close(); this.rooms.clear(); }
}
module.exports = { RoomManager };
