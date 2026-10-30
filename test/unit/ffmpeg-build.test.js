'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { BUILD, wanted } = require('../../scripts/fetch-ffmpeg');

test('FFmpeg is pinned to one build: a versioned download and its SHA-256', () => {
  assert.match(BUILD.url, /^https:\/\/github\.com\/GyanD\/codexffmpeg\/releases\/download\//);
  assert.ok(BUILD.url.includes('/' + BUILD.version + '/'), 'the URL names the version');
  assert.ok(BUILD.url.endsWith('/' + BUILD.name + '.zip'));
  assert.match(BUILD.sha256, /^[0-9a-f]{64}$/);
  assert.match(BUILD.source, /^https:\/\/github\.com\/FFmpeg\/FFmpeg\//, 'where its source is, for About and the licence');
});

test('only ffmpeg, ffprobe and their libraries are kept', () => {
  assert.deepEqual(['ffmpeg.exe', 'ffprobe.exe', 'ffplay.exe', 'avcodec-63.dll', 'README.txt', 'ffmpeg.lib'].filter(wanted),
    ['ffmpeg.exe', 'ffprobe.exe', 'avcodec-63.dll']);
});

test('the built app ships vendor/ffmpeg as resources/ffmpeg', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  assert.deepEqual(pkg.build.extraResources, [{ from: 'vendor/ffmpeg', to: 'ffmpeg' }]);
  assert.equal(pkg.scripts.predist, 'node scripts/fetch-ffmpeg.js', 'npm run dist fetches it first');
});
