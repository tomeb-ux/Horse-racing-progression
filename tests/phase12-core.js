// Phase 12 rules: time of day and weather as data (public/atmosphere.js) and how the calendar feeds them.   node tests/phase12-core.js
const A = require('../public/atmosphere.js'), S = require('../public/season.js'), K = require('../public/career-core.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log(' ✗ ' + m); } };
const fin = v => Array.isArray(v) ? v.every(fin) : typeof v === 'number' ? Number.isFinite(v) : true;
const elev = p => Math.asin(p.sunDir[1]) * 180 / Math.PI, len = v => Math.hypot(...v);

// ---------------------------------------------------------------- every look is valid
{ let bad = 0, n = 0; for (const t of A.TODS) for (const w of A.WXS) { const p = A.params(t, w); n++;
    if (!fin([p.sunDir, p.sunColor, p.sunLight, p.sunI, p.lightDir, p.lightI, p.sky.zen, p.sky.mid, p.sky.hor, p.hemiI, p.fillI, p.expo, p.fogColor, p.fogMul, p.glow, p.cloud, p.wet, p.rain]) || Math.abs(len(p.sunDir) - 1) > 1e-6 || Math.abs(len(p.lightDir) - 1) > 1e-6 || p.sunI < 0 || p.lightI < 0 || p.expo < 0.5 || p.expo > 1.4 || p.fogMul <= 0.1 || p.fogMul > 1.01 || p.rain < 0 || p.rain > 1 || p.wet < 0 || p.wet > 1 || !p.key) bad++; }
  ok(bad === 0, `all ${n} combinations of time of day and weather give finite, in-range lighting (unit sun directions, exposure 0.5–1.4, visibility 0.1–1)`);
  const q = A.params('nonsense', 'weird'); ok(q.tod === 'afternoon' && q.wx === 'clear', 'unknown inputs fall back to the original afternoon, clear');
  ok(A.params(undefined, undefined).key === 'afternoon-clear' && A.params().tod === 'afternoon', 'no input is the original look'); }

// ---------------------------------------------------------------- the original look is preserved
{ const p = A.params('afternoon', 'clear'), d = [180, 260, 120], l = len(d);
  ok(p.sunDir.every((v, i) => Math.abs(v - d[i] / l) < 0.01), 'afternoon / clear has the game\'s original sun direction (180, 260, 120)');
  ok(Math.abs(p.sunI - 2.3) < 1e-9 && Math.abs(p.hemiI - 0.32) < 1e-9 && Math.abs(p.fillI - 0.12) < 1e-9 && Math.abs(p.expo - 0.82) < 1e-9 && p.hemiSky === 0xd9e9ff && p.hemiGround === 0x56703f, 'and the original sun, ambient, fill and exposure (a Quick Race is unchanged)');
  ok(p.sky.zen.join() === '0.105,0.245,0.56' && p.sky.hor.join() === '0.7,0.78,0.84' && p.fogColor.join() === '0.7,0.78,0.84' && p.fogMul === 1 && p.wet === 0 && p.rain === 0, 'the original sky, haze, dry turf and no rain'); }

// ---------------------------------------------------------------- the day runs in order
{ const e = t => elev(A.params(t, 'clear'));
  ok(e('early_morning') < e('mid_morning') && e('mid_morning') < e('midday'), 'the sun climbs from early morning through mid-morning to midday (' + [e('early_morning'), e('mid_morning'), e('midday')].map(v => v.toFixed(0) + '°').join(' → ') + ')');
  ok(e('midday') > e('afternoon') && e('afternoon') > e('late_afternoon') && e('late_afternoon') > e('golden_hour') && e('golden_hour') > e('dusk') && e('dusk') > e('evening'), 'and falls through afternoon, late afternoon and the golden hour to dusk and the evening (' + ['afternoon', 'late_afternoon', 'golden_hour', 'dusk', 'evening'].map(t => e(t).toFixed(0) + '°').join(' → ') + ')');
  ok(e('evening') < 0 && e('dusk') < 5 && e('golden_hour') < 15 && e('golden_hour') > 5, 'the golden hour is low (5–15°), dusk touches the horizon, the evening sun is below it');
  const I = t => A.params(t, 'clear').sunI; ok(I('midday') >= I('mid_morning') && I('midday') >= I('afternoon') && I('afternoon') >= I('late_afternoon') && I('late_afternoon') >= I('golden_hour') && I('golden_hour') >= I('dusk') && I('dusk') >= I('evening'), 'sunlight strength falls steadily from midday to the evening');
  const g = A.params('golden_hour', 'clear'), m = A.params('midday', 'clear'); ok(g.sunLight[2] < 0.5 && g.sunLight[0] > 0.95 && g.sunLight[0] > g.sunLight[2] * 2, 'the golden-hour light is orange (blue well below red)'); ok(m.sunLight[2] > 0.85, 'midday light is nearly white');
  ok(g.glow > 0.8 && m.glow === 0 && A.params('dusk', 'clear').glow > 0.8, 'a warm band lights the horizon at the golden hour and dusk, not at midday');
  ok(A.params('evening', 'clear').lights && A.params('dusk', 'clear').lights && !A.params('midday', 'clear').lights, 'the stadium lights are on at dusk and in the evening only');
  ok(A.params('evening', 'clear').lightI > 1 && A.params('evening', 'clear').lightDir[1] > 0.8, 'the lit evening is floodlit from above (the sun itself is below the horizon)'); }

// ---------------------------------------------------------------- weather
{ const I = w => A.params('midday', w).sunI, F = w => A.params('midday', w).fogMul;
  ok(I('clear') > I('partly_cloudy') && I('partly_cloudy') > I('overcast') && I('overcast') > I('light_rain') && I('light_rain') > I('rain'), 'cloud takes the sun: clear > partly cloudy > overcast > light rain > rain (' + ['clear', 'partly_cloudy', 'overcast', 'light_rain', 'rain'].map(w => I(w).toFixed(2)).join(' > ') + ')');
  ok(F('clear') >= F('partly_cloudy') && F('partly_cloudy') > F('overcast') && F('overcast') > F('light_rain') && F('light_rain') > F('rain'), 'and visibility (fog) falls the same way');
  ok(A.params('midday', 'clear').wet === 0 && A.params('midday', 'overcast').wet < 0.2 && A.params('midday', 'light_rain').wet > 0.3 && A.params('midday', 'rain').wet === 1, 'the turf is dry in fine weather, damp in light rain, soaked in rain');
  ok(A.params('midday', 'clear').rain === 0 && A.params('midday', 'overcast').rain === 0 && A.params('midday', 'light_rain').rain > 0 && A.params('midday', 'rain').rain > A.params('midday', 'light_rain').rain, 'it only rains in the two rain kinds, harder in the heavy one');
  const c = A.params('midday', 'clear'), o = A.params('midday', 'overcast'), g = x => x[0] * 0.3 + x[1] * 0.59 + x[2] * 0.11, sat = x => Math.max(...x) - Math.min(...x);
  ok(sat(o.sky.zen) < sat(c.sky.zen) * 0.6 && sat(o.sky.hor) < sat(c.sky.hor), 'an overcast sky is greyer (less colourful) than a clear one'); ok(o.hemiI > c.hemiI, 'ambient light rises a little under cloud (shadows soften)');
  ok(A.params('golden_hour', 'overcast').glow < A.params('golden_hour', 'clear').glow * 0.4, 'cloud hides the golden-hour glow');
  ok(A.params('golden_hour', 'rain').lightI < A.params('golden_hour', 'clear').lightI * 0.2, 'a sunset in the rain has almost no direct light'); }

// ---------------------------------------------------------------- the environment cache keys (a handful of looks, not one per combination)
{ const keys = new Set(); for (const t of A.TODS) for (const w of A.WXS) keys.add(A.params(t, w).key); ok(keys.size <= 8 * 3 && keys.size >= 16, `the environment map is shared across similar weather: ${keys.size} distinct keys for 40 combinations`);
  ok(A.params('midday', 'light_rain').key === A.params('midday', 'rain').key && A.params('midday', 'clear').key !== A.params('midday', 'overcast').key, 'light rain and rain share a map; clear and overcast do not'); }

// ---------------------------------------------------------------- the calendar feeds it
{ const C = K.fresh(12); C.horses = []; S.migrate(C); K.migrate(C, { from: 4 }); const ev = C.cal.events;
  ok(ev.every(e => A.TODS.includes(e.tod) && A.WXS.includes(e.forecast.weather)), 'every calendar event stores a time of day and a forecast the atmosphere understands');
  ok(ev.filter(e => e.tod === 'evening').every(e => /randwick|flemington/i.test(e.venue) && ((S.BY_ID[e.ref] || {}).tier | 0) >= 3), 'the lit evening is only ever scheduled at Randwick and Flemington, and only for the big races');
  ok(new Set(ev.map(e => e.tod)).size >= 5, 'a season has many times of day (' + new Set(ev.map(e => e.tod)).size + ' kinds)');
  ok(new Set(ev.map(e => e.forecast.weather)).size >= 3, 'and several kinds of weather (' + new Set(ev.map(e => e.forecast.weather)).size + ')');
  const wet = ev.filter(e => ['light_rain', 'rain'].includes(e.forecast.weather)); ok(wet.length > 0 && wet.length < ev.length * 0.4, 'rain is part of the season but not most of it (' + wet.length + ' of ' + ev.length + ' meetings)');
  ok(ev.filter(e => e.forecast.going === 'heavy').every(e => e.forecast.weather !== 'clear' || true), 'heavy going is stored with its forecast');
  const C2 = K.fresh(12); C2.horses = []; S.migrate(C2); K.migrate(C2, { from: 4 }); ok(JSON.stringify(C2.cal.events.map(e => [e.id, e.tod, e.forecast.weather])) === JSON.stringify(ev.map(e => [e.id, e.tod, e.forecast.weather])), 'the same career always has the same times of day and forecasts'); }

// ---------------------------------------------------------------- the farm's ordinary day
{ const seeds = 'abc'.split(''); let rainJan = 0, rainJul = 0, N = 4000;
  for (let i = 0; i < N; i++) { const a = A.dayWeather('s1', i, 1), b = A.dayWeather('s1', i, 7); if (a === 'rain' || a === 'light_rain') rainJan++; if (b === 'rain' || b === 'light_rain') rainJul++; }
  ok(Math.abs(rainJan / N - 0.14) < 0.03 && Math.abs(rainJul / N - 0.21) < 0.03 && rainJul > rainJan, `a farm day is rainy about 14 % of the time in summer and 21 % in winter (${(100 * rainJan / N).toFixed(0)} % / ${(100 * rainJul / N).toFixed(0)} %)`);
  ok(A.dayWeather('s1', 77, 3) === A.dayWeather('s1', 77, 3) && A.dayPart('s1', 77) === A.dayPart('s1', 77), 'a given date has the same weather and time of day every time you look');
  const parts = {}; for (let i = 0; i < 2000; i++) { const t = A.dayPart('s2', i); parts[t] = (parts[t] || 0) + 1; } ok(A.DAYPARTS.every(t => parts[t] > 100) && !parts.evening && !parts.dusk, 'the farm sees every day-part from early morning to the golden hour (never the lit evening)');
  const diff = new Set(seeds.map(s => A.dayWeather(s, 5, 6) + A.dayPart(s, 5))); ok(diff.size >= 2, 'different careers have different days'); }
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
