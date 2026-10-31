'use strict';
// Timeline pictures for video tiles (main process): small frames from across a video, laid out in one picture (a
// strip, COLS frames to a row), which a tile shows over its timeline while the pointer is there. About one frame a
// second, at most MAX, each SIZE px on its long side, as WebP in the cache's previews folder (named by the original's
// path, size and time, and the number of frames). FFmpeg reads only the video's key frames, so even a long film takes
// seconds, on two processor threads; a frame is the key frame nearest before its time. Made the first time a timeline
// is hovered; one at a time, the latest asked for first (lib/latest.js). A file FFmpeg cannot make one of is not
// tried again until Wallpane starts again.
//
// createStrips({ cache, ffmpeg }) -> { get(file, seconds) -> Promise<{ path, count, every, cols, rows } | null> }
//   frame i (0 .. count-1) shows the time i * every, at column i % cols and row floor(i / cols)
const fs = require('fs');
const FF = require('./ffmpeg');
const { createLatest } = require('./latest');

const COLS = 10, MAX = 100, SIZE = 160;

// How a video `dur` seconds long is laid out.
function layoutFor(dur) {
  const count = Math.max(1, Math.min(MAX, Math.ceil(dur)));
  return { count, every: dur / count, cols: Math.min(COLS, count), rows: Math.ceil(count / COLS) };
}

// The FFmpeg arguments for the strip of `file` with this layout into `out`.
function stripArgs(file, out, lay) {
  const vf = 'scale=iw*sar:ih,setsar=1,fps=1/' + (Math.round(lay.every * 1000) / 1000) +
    ",scale=w='if(gte(iw,ih),min(" + SIZE + ",trunc(iw/2)*2),-2)':h='if(gte(iw,ih),-2,min(" + SIZE + ",trunc(ih/2)*2))'" +
    // The last key frame usually comes before the end: it stands in for the rest, so no cell stays black.
    ',tpad=stop_mode=clone:stop=' + lay.count + ',tile=' + lay.cols + 'x' + lay.rows;
  return ['-y', '-v', 'error', '-skip_frame', 'nokey', '-threads', '2'].concat(FF.input(file), [
    '-map', '0:V:0', '-an', '-sn', '-dn', '-vf', vf, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '70', '-f', 'webp', out
  ]);
}

function createStrips(o) {
  const cache = o.cache, ff = o.ffmpeg;
  const bad = new Set();   // names of strips FFmpeg could not make
  const latest = createLatest(make);
  const extFor = (lay) => 'strip' + lay.count + '.webp';

  async function make(a) {
    const ext = extFor(a.lay), found = cache.findKey('previews', a.key, ext);
    if (found) return found;
    if (bad.has(a.key + ext)) return null;
    const out = cache.pathForKey('previews', a.key, ext), part = out + '.part';
    try {
      await ff.run('ffmpeg', stripArgs(a.file, part, a.lay), { timeoutMs: 5 * 60 * 1000 });
      fs.renameSync(part, out);
      return out;
    } catch {
      try { fs.unlinkSync(part); } catch { /* not made */ }
      bad.add(a.key + ext);
      return null;
    }
  }
  function get(file, dur) {
    if (typeof file !== 'string' || !(dur > 0) || !isFinite(dur) || !ff.available()) return Promise.resolve(null);
    let key;
    try { key = cache.keyOf(file); } catch { return Promise.resolve(null); }   // gone
    const lay = layoutFor(dur), done = (p) => (p ? Object.assign({ path: p }, lay) : null);
    const found = cache.findKey('previews', key, extFor(lay));
    return found ? Promise.resolve(done(found)) : latest.get(key + extFor(lay), { file, key, lay }).then(done);
  }
  return { get };
}

module.exports = { createStrips, stripArgs, layoutFor, COLS, MAX, SIZE };
