'use strict';
// Message formats and validation for the Final Furlong multiplayer protocol (JSON text frames, plus one binary replay frame).
// Client → server: hello, create, join, rejoin, leave, pick, ready, settings, start, input, press, ping, spr
// Server → client: welcome, lobby, error, raceStart, snap, ev, pressres, results, replayMeta (+binary), pong, sp, peer
const crypto = require('crypto');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L: easy to read out and type
const CODE_LEN = 6;
const DISTANCES = [1000, 1200, 1400, 1600, 2000, 2400, 3200];
const GOINGS = ['firm', 'good', 'soft', 'heavy'];
const DIFFS = ['easy', 'medium', 'hard'];
const INCIDENTS = ['off', 'stumbles', 'full'];
const FIELDS = [6, 8, 10, 12];                 // runners in total (2 humans + AI)

function newCode(taken) {
  for (let tries = 0; tries < 50; tries++) {
    let c = ''; for (let i = 0; i < CODE_LEN; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!taken.has(c)) return c;
  }
  throw new Error('could not allocate a room code');
}
const newToken = () => crypto.randomBytes(18).toString('base64url');           // reconnect credential (never shown to the other player)
const newSeed = () => crypto.randomInt(1, 2 ** 31 - 1);

function cleanName(s) {
  s = String(s == null ? '' : s).replace(/[^\p{L}\p{N} _.\-']/gu, '').trim().slice(0, 16);
  return s || 'Rider';
}
function cleanCode(s) { s = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length === CODE_LEN ? s : null; }

// returns a sanitised settings object, or null if invalid
function cleanSettings(o, base) {
  const s = Object.assign({}, base);
  if (!o || typeof o !== 'object') return null;
  if (o.dist != null) { if (!DISTANCES.includes(+o.dist)) return null; s.dist = +o.dist; }
  if (o.going != null) { if (!GOINGS.includes(o.going)) return null; s.going = o.going; }
  if (o.diff != null) { if (!DIFFS.includes(o.diff)) return null; s.diff = o.diff; }
  if (o.incidents != null) { if (!INCIDENTS.includes(o.incidents)) return null; s.incidents = o.incidents; }
  if (o.field != null) { if (!FIELDS.includes(+o.field)) return null; s.field = +o.field; }
  if (o.chaos != null) { if (typeof o.chaos !== 'boolean') return null; s.chaos = o.chaos; }
  return s;
}
// rider controls: only choices a rider can make — never positions, speeds or results
function cleanInput(o) {
  if (!o || typeof o !== 'object') return null;
  const e = Number(o.effort);
  return {
    effort: Number.isFinite(e) ? Math.min(1, Math.max(0, e)) : null,
    steer: o.steer === 1 || o.steer === -1 ? o.steer : 0,
    dl: Number.isFinite(Number(o.dl)) ? Math.min(0.5, Math.max(0, Number(o.dl))) : 0,   // the client's display delay (s); bounded
    sm: Number.isFinite(Number(o.sm)) ? Math.min(1, Math.max(0, Number(o.sm))) : null,   // start marker as shown on screen
    settle: !!o.settle, check: !!o.check, drive: !!o.drive, hold: !!o.hold, adv: !!o.adv,
  };
}
const DEFAULT_SETTINGS = { dist: 1600, going: 'good', diff: 'medium', incidents: 'full', field: 12, chaos: false };
const MAX_PLAYERS = 6;                        // riders per private room (the rest of the field is AI)

module.exports = { MAX_PLAYERS, CODE_LEN, newCode, newToken, newSeed, cleanName, cleanCode, cleanSettings, cleanInput, DEFAULT_SETTINGS, DISTANCES, GOINGS, DIFFS, INCIDENTS, FIELDS };
