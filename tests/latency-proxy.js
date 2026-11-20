// WebSocket proxy that adds latency and jitter (in order, like TCP) — for testing online play on a poor connection.
// usage: node tests/latency-proxy.js <listenPort> <targetWsUrl> <latencyMs> <jitterMs>
const WebSocket = require('ws');
function startProxy(port, target, lat, jit) {
  const wss = new WebSocket.Server({ port });
  wss.on('connection', (c) => {
    const up = new WebSocket(target); const q1 = [], q2 = []; let t1 = 0, t2 = 0;
    const pipe = (from, to, last) => (d, isBin) => {
      const at = Math.max(last.t || 0, Date.now() + lat + Math.random() * jit); last.t = at;
      setTimeout(() => { if (to.readyState === 1) to.send(d, { binary: isBin }); }, at - Date.now());
    };
    const L1 = {}, L2 = {};
    up.on('open', () => { q1.forEach(([d, b]) => pipe(c, up, L1)(d, b)); q1.length = 0; });
    c.on('message', (d, b) => { if (up.readyState !== 1) q1.push([d, b]); else pipe(c, up, L1)(d, b); });
    up.on('message', pipe(up, c, L2));
    c.on('close', () => up.close()); up.on('close', () => c.close()); up.on('error', () => c.close());
  });
  return wss;
}
if (require.main === module) { const [p, t, l, j] = process.argv.slice(2); startProxy(+p, t, +l, +j); console.log('proxy', p, '→', t, l, '±', j); }
module.exports = { startProxy };
