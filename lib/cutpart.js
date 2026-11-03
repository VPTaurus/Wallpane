'use strict';
// Save a video tile's looped part as a video of its own (a video tile's Save the part as MP4…). A copy without
// re-encoding takes moments and loses nothing, but can only start on a keyframe: so the part is copied when the last
// keyframe before it is near (NEAR seconds at most), and otherwise re-encoded (H.264 and AAC in an MP4) so it starts and
// ends exactly on the part. Many videos have a keyframe only every few seconds, and a copy of a short part would be
// mostly what comes before it. A copy is an MP4 when the picture and sound can go into one, otherwise a file of the
// video's own kind (an older WebM's VP8 and Vorbis, for one, cannot). The job kind 'cutpart' writes
// "<name>.part.<ext>" and renames it when whole. Result { path, bytes, early, encoded, keyGap } (early: seconds it
// starts before the part; keyGap: how far before the part the keyframe was).
const fs = require('fs');
const path = require('path');
const { ENCODERS } = require('./ffmpeg');

const NEAR = 0.5;
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
// The kind of file a copy makes: 'mp4' when the video's picture and sound (lib/mediainfo.js describe) go into one,
// else the video's own extension.
function extFor(info, file) {
  const v = info && info.video, a = info && info.audio;
  if ((!v || MP4_VIDEO.includes(v.codec)) && (!a || MP4_AUDIO.includes(a.codec))) return 'mp4';
  const own = path.extname(file).slice(1).toLowerCase();
  return /^[a-z0-9]{2,4}$/.test(own) ? own : 'mkv';
}
// How to save the part, from where the keyframe before it is (kf, or null when not known: then a copy):
// { mode: 'copy' | 'encode', ext, keyGap }.
function plan(info, file, kf, start) {
  const keyGap = kf == null ? null : Math.max(0, start - kf);
  if (keyGap != null && keyGap > NEAR) return { mode: 'encode', ext: 'mp4', keyGap };
  return { mode: 'copy', ext: extFor(info, file), keyGap };
}
// ffprobe's arguments to find the keyframe at or before t: seeking lands on it (as FFmpeg's own seek for a copy
// does), and the first picture read from there is it.
function keyframeArgs(file, t, input) {
  return ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', t.toFixed(3) + '%+#1', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0'].concat(input(file));
}
async function keyframeBefore(ffmpeg, file, t) {
  const r = await ffmpeg.run('ffprobe', keyframeArgs(file, t, ffmpeg.input), { timeoutMs: 30000, keepOutput: true });
  const k = parseFloat(r.stdout.trim().split(/\r?\n/)[0]);
  return Number.isFinite(k) ? k : null;
}
// "clip 1m.mp4" -> "clip 1m.part.mp4": FFmpeg picks the kind of file from the extension.
function partName(out) { return out.replace(/(\.[^.\\/]+)$/, '.part$1'); }
// Seeking before reading, to the part's start, and reading up to its end; the first picture and sound, no subtitles
// or data. An MP4 gets its index at the front, so it starts playing at once.
function head(c, input) {
  return ['-y', '-v', 'error', '-ss', c.start.toFixed(3), '-to', c.end.toFixed(3)].concat(input(c.file), ['-map', '0:V:0', '-map', '0:a:0?', '-sn', '-dn']);
}
function tail(out) { return (/\.(?:mp4|m4v|mov)$/i.test(out) ? ['-movflags', '+faststart'] : []).concat(['-progress', 'pipe:1', '-nostats', out]); }
// A copy starts on the keyframe the seek lands on (-avoid_negative_ts make_zero: from 0, the same in every player).
function args(c, out, input) { return head(c, input).concat(['-c', 'copy', '-avoid_negative_ts', 'make_zero'], tail(out)); }
// Re-encoding starts exactly at the part: FFmpeg decodes from the keyframe and drops what comes before the start.
// Even width and height (H.264 needs them), 8-bit 4:2:0, as lib/playable.js converts.
function encodeArgs(c, out, input, encoder) {
  return head(c, input).concat(encoder.args, ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:a', 'aac', '-b:a', '192k'], tail(out));
}

function cutPartKind(o) {
  const ffmpeg = o.ffmpeg;
  return {
    heavy: true,
    transient: true,   // asked for by hand; not started again next time
    async run(job, ctx) {
      const c = clean(job.input), out = job.input && job.input.out, encode = job.input && job.input.mode === 'encode';
      if (!c || typeof out !== 'string' || !out) throw new Error('Nothing to save.');
      if (!fs.existsSync(c.file)) throw new Error('The video is not there any more.');
      const part = partName(out), secs = c.end - c.start;
      const once = async (a) => {
        try {
          await ffmpeg.run('ffmpeg', a, { signal: ctx.signal, timeoutMs: 3600 * 1000, onProgress: (s) => ctx.progress(s / secs) });
          fs.renameSync(part, out);
        } catch (err) {
          try { fs.unlinkSync(part); } catch { /* none */ }
          throw err;
        }
      };
      if (!encode) await once(args(c, part, ffmpeg.input));
      else {
        const encoder = await ffmpeg.h264Encoder();
        try {
          await once(encodeArgs(c, part, ffmpeg.input, encoder));
        } catch (err) {
          // A graphics card encoder that cannot take this video: once more on the processor.
          if (encoder.name === 'libx264' || err.code === 'CANCELLED') throw err;
          await once(encodeArgs(c, part, ffmpeg.input, ENCODERS[ENCODERS.length - 1]));
        }
      }
      let early = 0;
      if (!encode) {
        try { early = Math.max(0, (parseFloat((await ffmpeg.probeRaw(out)).format.duration) || 0) - secs); } catch { /* not known */ }
      }
      const keyGap = num(job.input.keyGap);
      return { path: out, bytes: fs.statSync(out).size, early: Math.round(early * 10) / 10, encoded: encode, keyGap: keyGap >= 0 ? Math.round(keyGap * 10) / 10 : null };
    }
  };
}

module.exports = { NEAR, MP4_VIDEO, MP4_AUDIO, clean, extFor, plan, keyframeArgs, keyframeBefore, partName, args, encodeArgs, cutPartKind };
