// Packs the commentary recordings into ONE file (public/assets/audio/commentary-lib.json: manifest + base64 MP3s) so the
// repository holds one file instead of ~800 (GitHub's web uploader takes at most 100 files at a time). eleven.js loads
// this pack first and falls back to the individual files.   node tools/pack-commentary.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'public', 'assets', 'audio', 'commentary'), man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), data = {};
for (const c of man.clips) data[c.file] = fs.readFileSync(path.join(dir, c.file)).toString('base64');
const out = path.join(dir, '..', 'commentary-lib.json'); fs.writeFileSync(out, JSON.stringify({ manifest: man, data }));
console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB,', man.clips.length, 'clips');
