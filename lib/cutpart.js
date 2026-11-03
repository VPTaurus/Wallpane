'use strict';
// Save a video tile's looped part as a video of its own, without re-encoding (a video tile's Save the part as MP4…).
// The picture and sound are copied as they are, so it takes moments and loses nothing; but a copy can only start on a
// keyframe, so it starts at the last keyframe before the part (often a second or two early) and ends where the part
// ends. An MP4 when the picture and sound can go into one; otherwise a file of the video's own kind (an older WebM's
// VP8 and Vorbis, for one, cannot). The job kind 'cutpart' writes "<name>.part.<ext>" and renames it when whole.
// Result { path, bytes, early } (early: seconds it starts before the part).
const fs = require('fs');
const path = require('path');

// The codecs (as ffprobe names them) an MP4 takes, among those found in videos.
const MP4_VIDEO = ['h264', 'hevc', 'av1', 'vp9', 'mpeg4', 'mpeg2video'];
const MP4_AUDIO = ['aac', 'mp3', 'ac3', 'eac3', 'opus', 'flac', 'alac'];

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : NaN; }
// What the page asks for, checked: { file, start, end } or null.
function clean(o) {
  if (!o || typeof o.file !== 'string' || !o.file) return null;
  const start = num(o.start), end = num(o.end);
  return start >= 0 && end > start ? { file: o.file, start, end } : null;
}
// The kind of file to save: 'mp4' when the video's picture and sound (lib/mediainfo.js describe) go into one, else
// the video's own extension.
function extFor(info, file) {
  const v = info && info.video, a = info && info.audio;
  if ((!v || MP4_VIDEO.includes(v.codec)) && (!a || MP4_AUDIO.includes(a.codec))) return 'mp4';
  const own = path.extname(file).slice(1).toLowerCase();
  return /^[a-z0-9]{2,4}$/.test(own) ? own : 'mkv';
}
// "clip 1m.mp4" -> "clip 1m.part.mp4": FFmpeg picks the kind of file from the extension.
function partName(out) { return out.replace(/(\.[^.\\/]+)$/, '.part$1'); }
// FFmpeg's arguments: seeking before reading lands on the keyframe at or before the start, and with copying that is
// where the file starts (-avoid_negative_ts make_zero: from 0, the same in every player); -to ends it at the part's end.
// The first picture and sound, no subtitles or data. An MP4 gets its index at the front, so it starts playing at once.
function args(c, out, input) {
  return ['-y', '-v', 'error', '-ss', c.start.toFixed(3), '-to', c.end.toFixed(3)].concat(input(c.file), [
    '-map', '0:V:0', '-map', '0:a:0?', '-sn', '-dn', '-c', 'copy', '-avoid_negative_ts', 'make_zero'],
  /\.(?:mp4|m4v|mov)$/i.test(out) ? ['-movflags', '+faststart'] : [], ['-progress', 'pipe:1', '-nostats', out]);
}

function cutPartKind(o) {
  const ffmpeg = o.ffmpeg;
  return {
    heavy: true,
    transient: true,   // asked for by hand; not started again next time
    async run(job, ctx) {
      const c = clean(job.input), out = job.input && job.input.out;
      if (!c || typeof out !== 'string' || !out) throw new Error('Nothing to save.');
      if (!fs.existsSync(c.file)) throw new Error('The video is not there any more.');
      const part = partName(out), secs = c.end - c.start;
      try {
        await ffmpeg.run('ffmpeg', args(c, part, ffmpeg.input), { signal: ctx.signal, timeoutMs: 3600 * 1000, onProgress: (s) => ctx.progress(s / secs) });
        fs.renameSync(part, out);
      } catch (err) {
        try { fs.unlinkSync(part); } catch { /* none */ }
        throw err;
      }
      let early = 0;
      try { early = Math.max(0, (parseFloat((await ffmpeg.probeRaw(out)).format.duration) || 0) - secs); } catch { /* not known */ }
      return { path: out, bytes: fs.statSync(out).size, early: Math.round(early * 10) / 10 };
    }
  };
}

module.exports = { MP4_VIDEO, MP4_AUDIO, clean, extFor, partName, args, cutPartKind };
