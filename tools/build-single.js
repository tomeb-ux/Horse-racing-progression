// Builds a single self-contained HTML file (dist/final-furlong-single.html) for offline / static hosting.
// Single-player works fully. Online races need the Node server: in this build the Multiplayer screen explains that,
// unless the page is opened with ?server=wss://your-host/ws pointing at a running Final Furlong server.
const fs = require('fs'), path = require('path');
const pub = path.join(__dirname, '..', 'public');
let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
const inline = (file) => '<script>\n' + fs.readFileSync(path.join(pub, file), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>';
const swap = (from, to) => { if (!html.includes(from)) throw new Error('build-single: missing ' + from); html = html.replace(from, () => to); };
swap(`<script>window.THREE || document.write('<script src="vendor/three.min.js"><\\/script>');</script>`, '<script>window.FF_STANDALONE = true;</script>');
swap('<script src="sim.js"></script>', inline('sim.js'));
swap('<script src="season.js"></script>', inline('season.js'));
swap('<script src="calls.js"></script>', inline('calls.js'));
swap('<script src="commentary.js"></script>', inline('commentary.js'));
swap('<script src="voice-core.js"></script>', inline('voice-core.js'));
swap('<script src="voice.js"></script>', inline('voice.js'));
// the ElevenLabs commentary recordings travel inside the file (base64 MP3, ~7 MB) so the recorded voice works offline
{ const dir = path.join(pub, 'assets', 'audio', 'commentary'), man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), data = {};
  for (const c of man.clips) data[c.file] = fs.readFileSync(path.join(dir, c.file)).toString('base64');
  swap('<script src="eleven.js"></script>', '<script>window.__FF_COMM_LIB = ' + JSON.stringify({ manifest: man, data }) + ';</script>\n' + inline('eleven.js')); }
swap('<script src="gfx.js"></script>', inline('gfx.js'));
swap('<script src="mp.js"></script>', inline('mp.js'));
swap('<script src="venues.js"></script>', inline('venues.js'));
swap('<script src="presentation.js"></script>', inline('presentation.js'));
swap('<script src="stable3d.js"></script>', inline('stable3d.js'));
  swap('<script src="career.js"></script>', inline('career.js'));
const out = path.join(__dirname, '..', 'dist', 'final-furlong-single.html');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
console.log('wrote', path.relative(process.cwd(), out), (html.length / 1024).toFixed(0) + ' KB');
