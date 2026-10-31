'use strict';
// Even loudness: reading ebur128's summary, and real measurements of clips FFmpeg makes for the test (skipped without
// vendor/ffmpeg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../../lib/ffmpeg');
const { createLoudness, parse } = require('../../lib/loudness');
const { createCache } = require('../../lib/cache');

test('the integrated loudness from the summary; silence is none', () => {
  const summary = '[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -16.3 LUFS\n    Threshold: -26.4 LUFS\n\n  Loudness range:\n    LRA:         0.0 LU\n';
  assert.equal(parse(summary), -16.3);
  assert.equal(parse('    I:         -inf LUFS'), null);
  assert.equal(parse('    I:         -91.2 LUFS'), null);
  assert.equal(parse('no summary at all'), null);
});

const ff = FF.create(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));
const skip = ff.available() ? false : 'FFmpeg is not in vendor/ffmpeg (npm run fetch-ffmpeg)';
let dir;
test.before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-loud-')); });
test.after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function clip(name, audio) {
  const file = path.join(dir, name);
  await ff.run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=4'].concat(
    audio ? ['-f', 'lavfi', '-i', audio, '-c:a', 'aac', '-shortest'] : [], ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file]), { timeoutMs: 60000 });
  return file;
}
const until = async (cond) => { for (let i = 0; i < 300 && !cond(); i++) await new Promise((r) => setTimeout(r, 20)); };

test('each video measured once, one at a time, and kept for next time; no sound is null', { skip }, async () => {
  // FFmpeg's tone is at -21.8 LUFS as it is: four times as loud (+12 dB), and a twentieth (-26 dB).
  const loud = await clip('loud.mp4', 'sine=frequency=440:duration=4,volume=4');
  const quiet = await clip('quiet.mp4', 'sine=frequency=440:duration=4,volume=0.05');
  const silent = await clip('silent.mp4', 'anullsrc=r=48000:cl=stereo');
  const none = await clip('none.mp4', null);
  const cache = createCache(path.join(dir, 'cache')), file = path.join(dir, 'loudness.json');
  const heard = {};
  const L = createLoudness({ ffmpeg: ff, cache, file, notify: (m) => Object.assign(heard, m) });
  assert.deepEqual(L.want(1, [loud, quiet, silent, none, path.join(dir, 'gone.mp4')]), {}, 'none measured yet');
  await until(() => Object.keys(heard).length === 4);
  assert.ok(Math.abs(heard[loud] - -9.8) < 1, 'loud: ' + heard[loud]);
  assert.ok(Math.abs(heard[quiet] - -47.8) < 1, 'quiet: ' + heard[quiet]);
  assert.equal(heard[silent], null);
  assert.equal(heard[none], null);
  assert.deepEqual(L.want(1, [loud, none]), { [loud]: heard[loud], [none]: null }, 'measured already');

  await until(() => fs.existsSync(file));
  const again = createLoudness({ ffmpeg: ff, cache, file, notify: () => assert.fail('nothing to measure') });
  assert.deepEqual(again.want(2, [quiet]), { [quiet]: heard[quiet] }, 'kept for next time');
});

test('a wall that changes its list: the files it no longer shows are not measured for it', { skip }, async () => {
  const files = [];
  for (let i = 0; i < 4; i++) files.push(await clip('c' + i + '.mp4', 'sine=frequency=' + (300 + 100 * i) + ':duration=4'));
  const done = [];
  const L = createLoudness({ ffmpeg: ff, cache: createCache(path.join(dir, 'cache2')), file: path.join(dir, 'l2.json'), notify: (m) => done.push(...Object.keys(m)) });
  L.want(1, files.slice(0, 3));   // c0 starts at once
  L.want(1, [files[3]]);          // the wall moved on: c1 and c2 are no longer wanted
  await until(() => done.length === 2);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(done.map((p) => path.basename(p)), ['c0.mp4', 'c3.mp4']);
});
