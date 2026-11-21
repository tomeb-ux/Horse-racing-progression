// The ElevenLabs clip planner (public/eleven.js): every live commentary line → recorded phrases + horse-name clips.
// Uses the real manifest. Checks: the right clips for each kind of call, names from the recordings (or a local-voice
// fallback for names the library lacks, never silently a wrong name), the official winner only, dominant vs close
// finishes, markers, and full simulated races (every planned name belongs to a horse the line was about).
//   node tests/eleven-plan.js
const E = require('../public/eleven.js'), S = require('../public/sim.js'), COMM = require('../public/commentary.js'), SEA = require('../public/season.js');
const M = require('../public/assets/audio/commentary/manifest.json');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log(' ✓ ' + m); } else { fail++; console.log(' ✗ ' + m); } };
E._index(M);
const ids = new Set(M.clips.map(c => c.file.replace(/\.mp3$/, ''))), names = new Map(M.clips.filter(c => c.category === 'horse-names').map(c => [E.norm(c.phrase), c.file.replace(/\.mp3$/, '')]));
const shouts = new Map(M.clips.filter(c => c.category === 'horse-names-shout').map(c => [E.norm(c.phrase), c.file.replace(/\.mp3$/, '')]));
const ctx = { has: id => ids.has(id), nameOf: h => names.get(E.norm(h.def.name)) || null, shoutOf: h => shouts.get(E.norm(h.def.name)) || null, display: h => h.def.name, rng: Math.random };
const H = n => ({ def: { name: n } });
console.log('— library');
ok(M.voice.id === 'OQt0mf8rKBYkweCSQ9d4' && M.voice.provider === 'ElevenLabs' && M.clips.every(c => c.voice_id === 'OQt0mf8rKBYkweCSQ9d4'), 'manifest: every clip is voice OQt0mf8rKBYkweCSQ9d4 (ElevenLabs)');
ok(M.clips.length >= 220 && M.clips.every(c => c.category && c.phrase && c.file && c.duration > 0.3 && c.priority && c.use && c.version), `${M.clips.length} clips, each with category, phrase, file, duration, priority, usage and version`);
for (const cat of ['start', 'early', 'middle', 'home-turn', 'final-600', 'final-400', 'final-200', 'final-100', 'battle', 'photo-finish', 'winners', 'horse-names', 'horse-names-shout', 'major-events', 'transitions']) ok(M.clips.some(c => c.category === cat), `category ${cat}: ${M.clips.filter(c => c.category === cat).length} clips`);
ok(S.ROSTER.every(r => names.has(E.norm(r.name))), 'every Quick Race horse has a recorded name');
ok(SEA.PLAYER_NAMES.length === 19 && SEA.PLAYER_NAMES.every(n => names.has(E.norm(n)) && M.clips.some(c => c.category === 'horse-names-shout' && E.norm(c.phrase) === E.norm(n))), 'all 19 choosable career names are recorded (excited + shouted)');
ok(SEA.HORSE_NAMES.every(n => names.has(E.norm(n))), `every career rival name (${SEA.HORSE_NAMES.length}) is recorded`);
console.log('\n— plans');
const p = (clip) => E.plan(clip, ctx).map(x => x.id || 'say:' + x.say);
ok(p({ kind: 'away' }).length === 1 && /^start\//.test(p({ kind: 'away' })[0]), 'gates open → a start call');
ok(p({ kind: 'intro', race: 'The Everest' })[0] === 'major-events/everest' && p({ kind: 'intro', race: 'Melbourne Cup' })[0] === 'major-events/melbourne_cup' && p({ kind: 'intro', race: '' })[0] === 'major-events/welcome_generic', 'pre-race welcome matches the race (Everest / Melbourne Cup / generic)');
const lc = p({ kind: 'lead', leader: H('Quiet Thunder'), tight: true });
ok(lc[0] === 'transitions/new_leader' && lc[1] === 'horse-names/quiet_thunder', `late lead change → "And there's a new leader," + Quiet Thunder (${lc.join(' + ')})`);
const unk = p({ kind: 'lead', leader: H('My Custom Champion'), tight: false });
ok(unk[1] === 'say:My Custom Champion', 'a name the recordings lack → handed to the local voice (or the Enhanced server), never a wrong recorded name');
const m200 = p({ kind: 'straight', marker: 200, leader: H('Tempted'), same: true, gapL: 0.6, second: H('Bay Majesty'), closing: true });
ok(/final-200\/two_2|battle\/fighting_it_out/.test(m200[0]) && m200.includes('horse-names/bay_majesty'), `200 m, close, challenger alongside → ${m200.join(' + ')}`);
const m400 = p({ kind: 'straight', marker: 400, leader: H('Tempted'), same: false, gapL: 2, bunched: true });
ok(/four_2|from_everywhere/.test(m400[0]) && m400.some(x => /horse-names(-shout)?\/tempted/.test(x)), `400 m, bunched, new leader → ${m400.join(' + ')}`);
const runaway = p({ kind: 'straight', marker: 100, leader: H('Soul Of Spain'), same: true, gapL: 6 });
ok(runaway[0] === 'final-100/hundred_2' && !runaway.some(x => /locked|two_2|line_together|neck|stride/.test(x)), `100 m with a runaway leader: no "locked together" → ${runaway.join(' + ')}`);
const dom = p({ kind: 'win', winner: H('Ka Ying Rising'), gapL: 6, photo: false }), close = p({ kind: 'win', winner: H('Ka Ying Rising'), gapL: 0.1, photo: true });
ok(dom[0] === 'winners/winner_is' && /ka_ying_rising/.test(dom[1]) && /extraordinary|canter|plenty_in_hand/.test(dom[2]), `dominant win → ${dom.join(' + ')}`);
ok(close[0] === 'winners/winner_is' && /ka_ying_rising/.test(close[1]) && /what_a_finish|just_held_on|unbelievable|incredible/.test(close[2]), `photo-finish win → ${close.join(' + ')}`);
{ const a = p({ kind: 'photo', tight: true }), b = p({ kind: 'photo', tight: false }); ok(/line_together|couldnt_split/.test(a[0]) && /photo_/.test(a[1]) && b.length === 1 && /photo_/.test(b[0]) && !a.concat(b).some(x => /horse-names|say:/.test(x)), `photo call before the result never names a horse (${a.join(' + ')})`); }
ok(p({ kind: 'fall' }).every(x => !/horse-names/.test(x)), 'a fall has no recording: caption (+ local voice if set) — nothing misleading');
console.log('\n— whole simulated races through the real commentary engine');
let lines = 0, voiced = 0, bad = 0, winOK = 0, winSay = 0, recNames = 0, allNames = 0, races = 0, finalLines = 0, finalVoiced = 0;
for (let k = 0; k < 24; k++) {
  // career-style fields (rival names from the career pool, some generated) + a custom player name the library lacks
  const C = { seed: 900 + k, stable: 'T', horses: [], trophies: [] }; SEA.migrate(C);
  const opp = SEA.runnersFor(C, k % 3, Math.min(SEA.DIVS[k % 3].rounds.length - 1, k % 10)).slice(0, 11), t = S.ROSTER[k % 12];
  const r = new S.Race({ distance: [1200, 1600, 2000, 2400][k % 4], field: opp.length + 1, diff: 'hard', playerDef: { name: SEA.PLAYER_NAMES[k % 19], style: t.style, role: t.role, coat: 1, silk: '#fff', attrs: t.attrs }, oppDefs: opp, allBots: true, going: 'good', incidents: 'off', seed: 4242 + k * 7919, track: ['randwick', 'flemington', 'generic'][k % 3] });
  const spoken = [], sp = { speak(t, prm, end, info) { const items = E.plan(info && info.clip, ctx); spoken.push({ t, info, items, snapL: b.lastSnap && b.lastSnap.L }); setTimeout0(end, 0.4 + items.length * 1.1); }, cancel() {} };
  const timers = []; let now = 0; const setTimeout0 = (f, s) => timers.push([now + s, f]);
  const b = new COMM.Booth(r, { venue: 'x' }, sp, { rng: Math.random });
  r.state = 'count'; r.openGates && r.openGates(); let n = 0;
  while (r.state !== 'done' && n++ < 200000) { r.step(S.SIM_DT); now += S.SIM_DT; b.update(now); for (let i = timers.length - 1; i >= 0; i--) if (timers[i][0] <= now) { const f = timers[i][1]; timers.splice(i, 1); f(); } }
  for (let i = 0; i < 400 && !b.winCalled; i++) { now += 0.05; b.update(now); for (let j = timers.length - 1; j >= 0; j--) if (timers[j][0] <= now) { const f = timers[j][1]; timers.splice(j, 1); f(); } }
  races++;
  for (const s of spoken) {
    lines++; if (s.items.length) voiced++;
    const c = s.info && s.info.clip; if (!c) continue;
    const allowed = new Set([c.leader, c.mover, c.trapped, c.closer, c.second, c.winner].filter(Boolean).map(h => E.norm(h.def.name)));
    for (const it of s.items) if (it.id && /^horse-names/.test(it.id) || it.say) { allNames++; if (it.id) recNames++; }
    for (const it of s.items) { const nm = it.id && /^horse-names/.test(it.id) ? M.clips.find(x => x.file === it.id + '.mp3').phrase : it.say; if (nm && !allowed.has(E.norm(nm))) bad++; }
    if (c.kind === 'straight' && c.final) { finalLines++; if (s.items.length) finalVoiced++; }
    if (c.kind === 'win' && E.norm(c.winner.def.name) === E.norm(r.finishOrder[0].def.name)) { if (s.items.some(it => it.id && /^horse-names/.test(it.id) && E.norm(M.clips.find(x => x.file === it.id + '.mp3').phrase) === E.norm(r.finishOrder[0].def.name))) winOK++; else if (s.items.some(it => it.say && E.norm(it.say) === E.norm(r.finishOrder[0].def.name))) winSay++; }
  }
}
ok(bad === 0, `${lines} lines in ${races} races: every recorded name belongs to a horse that line is actually about (${bad} wrong)`);
console.log(`   names called: ${allNames}, ${Math.round(recNames / Math.max(1, allNames) * 100)}% from the recordings`);
ok(voiced / lines > 0.75, `${Math.round(voiced / lines * 100)}% of lines get a voiced plan (recordings, plus the name fallback where a name isn't recorded); the rest stay as captions`);
ok(finalLines === 0 || finalVoiced / finalLines > 0.9, `final 250 m: ${finalVoiced}/${finalLines} lines voiced`);
ok(winOK === races, `the official winner's recorded name is called in every race (${winOK}/${races})`);
ok(recNames === allNames, `every name called comes from the recordings (${recNames}/${allNames}) — career names are chosen from the recorded list, rivals only get recorded names`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
