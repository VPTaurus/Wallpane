'use strict';
// Puts FFmpeg into vendor/ffmpeg, where the app finds it while developing and electron-builder ships it from
// (resources/ffmpeg in the built app). One pinned build is downloaded at build time only; Wallpane itself never goes
// online. The download is checked against its SHA-256, and only what the app uses is kept: ffmpeg.exe, ffprobe.exe,
// the libraries they share, the licence and the build's README (which names the exact FFmpeg source it was made from).
// Does nothing when that build is already there. Run: npm run fetch-ffmpeg
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BUILD = {
  version: '9.0.2',
  name: 'ffmpeg-9.0.2-full_build-shared',
  url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-full_build-shared.zip',
  sha256: '8d31e162f1616e37aab3fa2db991b97e1b8dbeb1c8465fd81a81be16ff91b328',
  by: 'www.gyan.dev',
  source: 'https://github.com/FFmpeg/FFmpeg/commit/946fcce07b',
  license: 'GPL-3.0'
};
const OUT = path.join(__dirname, '..', 'vendor', 'ffmpeg');

// The files of the build's bin folder the app keeps: everything but the ffplay player.
function wanted(name) { return /\.(exe|dll)$/i.test(name) && !/^ffplay\.exe$/i.test(name); }

function present() {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, 'build.json'), 'utf8')).sha256 === BUILD.sha256; } catch { return false; }
}

// HTTPS GET to a file, following GitHub's redirects to its file storage.
function download(url, file, hops) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'wallpane-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (hops || 0) < 5) {
        res.resume();
        resolve(download(res.headers.location, file, (hops || 0) + 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error('Download failed: HTTP ' + res.statusCode)); return; }
      const out = fs.createWriteStream(file);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function main() {
  if (present()) { console.log('FFmpeg ' + BUILD.version + ' is already in vendor/ffmpeg.'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wallpane-ffmpeg-'));
  try {
    const zip = path.join(tmp, BUILD.name + '.zip');
    console.log('Downloading FFmpeg ' + BUILD.version + ' (' + BUILD.by + ')...');
    await download(BUILD.url, zip);
    const got = sha256(zip);
    if (got !== BUILD.sha256) throw new Error('The download does not match its SHA-256 (got ' + got + '). Nothing was changed.');
    // Windows' own tar (bsdtar) unpacks zip files.
    execFileSync('tar', ['-xf', zip, '-C', tmp], { stdio: 'inherit' });
    const top = path.join(tmp, BUILD.name), bin = path.join(top, 'bin');
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.readdirSync(bin).filter(wanted).forEach((n) => fs.copyFileSync(path.join(bin, n), path.join(OUT, n)));
    fs.copyFileSync(path.join(top, 'LICENSE'), path.join(OUT, 'LICENSE.txt'));
    fs.copyFileSync(path.join(top, 'README.txt'), path.join(OUT, 'README.txt'));
    fs.writeFileSync(path.join(OUT, 'build.json'), JSON.stringify(BUILD, null, 2) + '\n');
    console.log('FFmpeg ' + BUILD.version + ' is in vendor/ffmpeg.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { BUILD, wanted };
