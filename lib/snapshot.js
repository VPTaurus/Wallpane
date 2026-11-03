'use strict';
// Save the frame a video tile shows as a picture (a video tile's Save this frame…): the whole frame at the video's own
// size, taken from the original file, also when the tile is zoomed or plays a lighter or playable copy (the times are
// the same). PNG (exact) or JPEG (smaller), as the name chosen ends. The job kind 'snapshot' writes "<out>.part" and
// renames it when whole. Result { path, bytes }.
const fs = require('fs');
const path = require('path');
const gifmake = require('../renderer/lib/gifmake');

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : NaN; }
// What the page asks for, checked: { file, at } or null.
function clean(o) {
  if (!o || typeof o.file !== 'string' || !o.file) return null;
  const at = num(o.at);
  return at >= 0 ? { file: o.file, at } : null;
}
function isJpeg(f) { return /\.jpe?g$/i.test(f); }
// "clip 1m23.5s.png" for the frame at 1:23.5 of "clip.mp4".
function fileName(name, at, ext) {
  const base = String(name || 'video').replace(/\.[^.\\/]+$/, '') || 'video';
  return base + ' ' + gifmake.stamp(at) + '.' + (ext || 'png');
}
// Seeking before reading lands exactly on the frame (FFmpeg decodes from the keyframe before it and drops the rest).
// One picture of the first video stream, upright as the video says, at its own size; to `file` (the .part name, so
// the kind of picture is said, not taken from the name).
function args(c, file, jpeg, input) {
  return ['-y', '-v', 'error', '-ss', c.at.toFixed(3)].concat(input(c.file), ['-map', '0:V:0', '-frames:v', '1', '-an', '-sn', '-dn', '-f', 'image2', '-update', '1'],
    jpeg ? ['-c:v', 'mjpeg', '-q:v', '2'] : ['-c:v', 'png'], [file]);
}

function snapshotKind(o) {
  const ffmpeg = o.ffmpeg;
  return {
    heavy: false,       // one frame: it need not wait for a long conversion
    transient: true,    // asked for by hand; not started again next time
    async run(job, ctx) {
      const c = clean(job.input), out = job.input && job.input.out;
      if (!c || typeof out !== 'string' || !out) throw new Error('Nothing to save.');
      if (!fs.existsSync(c.file)) throw new Error('The video is not there any more.');
      const part = out + '.part', none = () => new Error('There is no picture at ' + gifmake.stamp(c.at) + ' in ' + path.basename(c.file) + '.');
      try {
        try {
          await ffmpeg.run('ffmpeg', args(c, part, isJpeg(out), ffmpeg.input), { signal: ctx.signal, timeoutMs: 120000 });
        } catch (err) {
          // Past the video's end (or a moment with no picture) FFmpeg finds nothing to write.
          throw /Nothing was written|received no packets|Output file is empty/i.test(err.message) ? none() : err;
        }
        if (!fs.existsSync(part)) throw none();
        fs.renameSync(part, out);
      } catch (err) {
        try { fs.unlinkSync(part); } catch { /* none */ }
        throw err;
      }
      return { path: out, bytes: fs.statSync(out).size };
    }
  };
}

module.exports = { clean, isJpeg, fileName, args, snapshotKind };
