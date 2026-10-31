'use strict';
// Hover previews for the library (main process): a few seconds of a video, small and silent, that its thumbnail plays
// while the pointer rests on it. Four short parts from across the video (a short video: its start), at most SIZE px on
// the long side and 30 frames a second, as H.264 in the cache's previews folder, named like every cached file by the
// original's path, size and time. Made the first time a thumbnail asks, on the processor (two threads: a clip this
// small is quick, and the graphics card keeps playing the wall). One is made at a time; of those asked for meanwhile
// only the latest waits (the pointer has moved on from the others). A file FFmpeg cannot make one of is not tried
// again until Wallpane starts again.
//
// createPreviews({ cache, ffmpeg }) -> { get(entry) -> Promise<path | null> }   entry: a library file
const fs = require('fs');
const FF = require('./ffmpeg');
const { createLatest } = require('./latest');

const SIZE = 360, PARTS = 4, PART = 1.5, SHORT = 8;

// Where the parts start (seconds) and how long each is, for a video `dur` seconds long (0: not known).
function partsFor(dur) {
  if (!(dur >= SHORT)) return [{ at: 0, len: Math.min(dur || 6, 6) }];
  const out = [];
  for (let i = 0; i < PARTS; i++) out.push({ at: Math.round(dur * (0.15 + i * 0.2) * 100) / 100, len: PART });
  return out;
}

// The FFmpeg arguments for the preview of `file` (dur seconds long) into `out`.
function previewArgs(file, out, dur) {
  const parts = partsFor(dur), inputs = [], chains = [];
  const scale = "scale=iw*sar:ih,setsar=1,scale=w='if(gte(iw,ih),min(" + SIZE + ",trunc(iw/2)*2),-2)':h='if(gte(iw,ih),-2,min(" + SIZE + ",trunc(ih/2)*2))',fps=30";
  parts.forEach((p, i) => {
    inputs.push('-ss', String(p.at), '-t', String(p.len), '-threads', '2');
    inputs.push.apply(inputs, FF.input(file));
    chains.push('[' + i + ':V:0]' + scale + '[p' + i + ']');
  });
  const join = parts.map((p, i) => '[p' + i + ']').join('') + 'concat=n=' + parts.length + ':v=1:a=0,format=yuv420p[v]';
  return ['-y', '-v', 'error'].concat(inputs, ['-filter_complex', chains.concat(join).join(';'), '-map', '[v]', '-an', '-sn', '-dn',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-threads', '2', '-movflags', '+faststart', '-f', 'mp4', out]);
}

function createPreviews(o) {
  const cache = o.cache, ff = o.ffmpeg;
  const bad = new Set();   // keys of files FFmpeg could not make one of
  const keyOf = (e) => cache.keyFor(e.path, e.size, e.mtime);
  const latest = createLatest(make);

  async function make(e) {
    const key = keyOf(e), found = cache.findKey('previews', key, 'mp4');
    if (found) return found;
    if (bad.has(key)) return null;
    const out = cache.pathForKey('previews', key, 'mp4'), part = out + '.part';
    try {
      try {
        await ff.run('ffmpeg', previewArgs(e.path, part, e.dur), { timeoutMs: 30000 });
      } catch (err) {
        // A length that was wrong puts parts past the end: the start instead.
        if (!(e.dur >= SHORT)) throw err;
        await ff.run('ffmpeg', previewArgs(e.path, part, 0), { timeoutMs: 30000 });
      }
      fs.renameSync(part, out);
      return out;
    } catch {
      try { fs.unlinkSync(part); } catch { /* not made */ }
      bad.add(key);
      return null;
    }
  }
  function get(e) {
    if (!e || e.kind !== 'video' || !ff.available()) return Promise.resolve(null);
    const key = keyOf(e), found = cache.findKey('previews', key, 'mp4');
    return found ? Promise.resolve(found) : latest.get(key, e);
  }
  return { get };
}

module.exports = { createPreviews, previewArgs, partsFor, SIZE };
