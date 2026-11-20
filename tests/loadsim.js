// Loads the pure simulation core (between /*@sim-begin*/ and /*@sim-end*/) from the game HTML into a Node vm context.
const fs = require('fs'), vm = require('vm');
module.exports = function loadSim(file) {
  // the simulation now lives in public/sim.js (also accepts an older single-file HTML)
  if (!file || /index\.html$/.test(file)) { const pth = require('path').join(__dirname, '..', 'public', 'sim.js'); if (fs.existsSync(pth)) file = pth; }
  const src = fs.readFileSync(file, 'utf8');
  const a = src.indexOf('/*@sim-begin*/'), b = src.indexOf('/*@sim-end*/');
  if (a < 0 || b < 0) throw new Error('sim markers not found');
  const code = src.slice(a, b);
  const ctx = { console, Math, Float64Array, Float32Array, Int32Array, Array, Object, JSON };
  vm.createContext(ctx);
  // export the top-level declarations we need
  vm.runInContext(code + '\n;this.__sim = { Race, Horse, ROSTER, KNACK: typeof KNACK!=="undefined"?KNACK:{}, DISTANCES, GOING, STYLE: typeof STYLE!=="undefined"?STYLE:null, DIFF, SIM_DT, RHYTHM_AT, RHYTHM_PERIOD, LEN_M, HORSE_LEN, LAT_SEP, marginText, runBalanceTests, runFieldTests, mulberry32, clamp, NLANES, riderKick: typeof riderKick!=="undefined"?riderKick:null, typeof_: 1, extra: (typeof SIM_EXPORTS!=="undefined"?SIM_EXPORTS:{}) };', ctx);
  return ctx.__sim;
};
