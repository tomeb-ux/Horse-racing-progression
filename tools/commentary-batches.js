// Final Furlong — plan the ElevenLabs recording batches for the commentary library (no API calls here).
// Each batch: one delivery tag + up to ~24 lines separated by blank lines (the splitter cuts at the pauses).
//   node tools/commentary-batches.js > batches.json        (prints the plan + a credit estimate on stderr)
const CALLS = require('../public/calls.js'), S = require('../public/season.js'), sim = require('../public/sim.js');
const MAXN = 22, MAXC = 700, out = [];
const groups = new Map();
for (const u of CALLS.units) { const tag = u.tag ? CALLS.TIER_TAGS[u.tag] : CALLS.TIER_TAGS[u.tier]; const k = tag + "|" + u.stage; if (!groups.has(k)) groups.set(k, { tag, stage: u.stage, items: [] }); groups.get(k).items.push({ id: u.id, text: u.text, kind: u.form }); }
for (const [k, g] of groups) { let cur = null, c = 0; for (const it of g.items) { if (!cur || cur.items.length >= MAXN || c + it.text.length > MAXC) { cur = { name: "", tag: g.tag, items: [] }; out.push(cur); c = 0; } cur.items.push(it); c += it.text.length + 2; } }
// horse names: Quick Race roster + career rivals + the choosable career names, in three deliveries
const names = [...new Set(sim.ROSTER.map(r => r.name).concat(S.HORSE_NAMES, S.PLAYER_NAMES))];
for (const [ctx, d] of Object.entries(CALLS.NAME_CTX)) { const nb = Math.ceil(names.length / 25), per = Math.ceil(names.length / nb); for (let i = 0; i < names.length; i += per) out.push({ name: "", tag: d.tag, names: ctx, items: names.slice(i, i + per).map(n => ({ id: "names-" + ctx + "/" + n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), text: n + d.punct, kind: "name", name: n })) }); }
out.forEach((b, i) => { b.name = "b" + String(i + 1).padStart(2, "0") + (b.names ? "_names_" + b.names : "_" + b.items[0].id.split("/")[0]); b.prompt = b.tag + " " + b.items.map(x => x.text).join("\n\n"); b.chars = b.prompt.length; });
const tot = out.reduce((s, b) => s + b.chars, 0);
console.error(`${out.length} batches, ${out.reduce((s, b) => s + b.items.length, 0)} clips (${names.length} names x3), ≈ ${tot} credits`);
console.log(JSON.stringify(out, null, 1));
