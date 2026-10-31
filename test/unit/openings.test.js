'use strict';
// Black or silent openings: reading the detectors' lines, and the real thing on clips FFmpeg makes for the test
// (skipped without vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const { createOpenings, parseOpening, WINDOW } = require('../../lib/openings');
const { createCache } = require('../../lib/cache');

test('an opening starts the video and ends before the window does', () => {
  const lines = '[silencedetect @ 0x1] silence_start: -0.0213\n[silencedetect @ 0x1] silence_end: 1.500021 | silence_duration: 1.52\n' +
    '[blackdetect @ 0x2] black_start:0 black_end:2.04 black_duration:2.04\n[blackdetect @ 0x2] black_start:5 black_end:6 black_duration:1';
  assert.deepEqual(parseOpening(lines), { black: 2.04, silence: 1.5 });
  assert.deepEqual(parseOpening('black_start:3.2 black_end:4 black_duration:0.8'), { black: 0, silence: 0 }, 'not at the start');
  assert.deepEqual(parseOpening('black_start:0 black_end:' + (WINDOW - 0.04) + ' black_duration:11.96'), { black: 0, silence: 0 }, 'black throughout');
  assert.deepEqual(parseOpening(''), { black: 0, silence: 0 });
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-open-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function clip(name, vf, af) {
  const f = path.join(dir, name);
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-filter_complex', vf + (af ? ';' + af : ''), '-map', '[v]'].concat(af ? ['-map', '[a]', '-c:a', 'aac'] : [],
    ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', f]), { timeoutMs: 60000 });
  return f;
}
const until = async (cond) => { for (let i = 0; i < 300 && !cond(); i++) await new Promise((r) => setTimeout(r, 20)); };

test('black and silent openings found in real clips; none in a plain one, nor a video black throughout', { skip }, async () => {
  const both = await clip('both.mp4', 'color=c=black:s=320x180:d=2:r=25[b];testsrc=s=320x180:d=6:r=25[t];[b][t]concat=n=2:v=1:a=0[v]',
    'anullsrc=r=48000:cl=stereo:d=1.5[s];sine=frequency=440:duration=6.5[n];[s][n]concat=n=2:v=0:a=1[a]');
  const plain = await clip('plain.mp4', 'testsrc=s=320x180:d=8:r=25[v]', 'sine=frequency=440:duration=8[a]');
  const dark = await clip('dark.mp4', 'color=c=black:s=320x180:d=20:r=25[v]', 'sine=frequency=440:duration=20[a]');
  const mute = await clip('mute.mp4', 'color=c=black:s=320x180:d=3:r=25[b];testsrc=s=320x180:d=5:r=25[t];[b][t]concat=n=2:v=1:a=0[v]', null);
  const heard = {};
  const O = createOpenings({ ffmpeg: ff, cache: createCache(path.join(dir, 'cache')), file: path.join(dir, 'openings.json'), notify: (m) => Object.assign(heard, m) });
  O.want(1, [both, plain, dark, mute]);
  await until(() => Object.keys(heard).length === 4);
  assert.deepEqual(heard[both], { black: 2, silence: 1.5 });
  assert.deepEqual(heard[plain], { black: 0, silence: 0 });
  assert.deepEqual(heard[dark], { black: 0, silence: 0 }, 'black throughout is the video, not an opening');
  assert.deepEqual(heard[mute], { black: 3, silence: 0 }, 'no sound: only the black');
  assert.deepEqual(O.want(1, [both]), { [both]: { black: 2, silence: 1.5 } }, 'measured once');
});
