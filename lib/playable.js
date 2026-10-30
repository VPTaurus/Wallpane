'use strict';
// Making a video Wallpane can play, the cheapest way that works (the verdict from lib/mediainfo.js): re-wrap it
// ('remux', seconds, nothing lost), fix only the sound ('audio'), or convert it to H.264 and AAC ('convert'). The copy
// goes to the cache (converted\<hash>.mp4 or .webm); the original is never touched. It is written to a ".part" file
// and renamed when whole, so a half-made copy never plays.
const fs = require('fs');
const mediainfo = require('./mediainfo');
const { ENCODERS } = require('./ffmpeg');

// FFmpeg's arguments to make `out` from `file` for this verdict (and, for 'convert', this encoder). `input(file)` gives
// the arguments that open it (local files only).
function argsFor(verdict, file, out, encoder, input) {
  const fmt = verdict.target === 'webm' ? 'webm' : 'mp4';
  const head = ['-y', '-v', 'error'].concat(input(file), ['-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn']);
  const tail = (fmt === 'mp4' ? ['-movflags', '+faststart'] : []).concat(['-f', fmt, '-progress', 'pipe:1', '-nostats', out]);
  if (verdict.action === 'remux') return head.concat(['-c', 'copy'], tail);
  const aac = ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'];
  if (verdict.action === 'audio') return head.concat(['-c:v', 'copy'], aac, tail);
  // Convert: even width and height (H.264 needs them), 8-bit 4:2:0, at most 60 frames a second.
  return head.concat(encoder.args, ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-fpsmax', '60'], aac, tail);
}

// The job kind 'playable': input { file, force } (force: convert even when it looks playable, because it did not
// play). Result { path, action, encoder }: path is the file to play, the original when nothing was needed.
function playableKind(o) {
  const ffmpeg = o.ffmpeg, cache = o.cache;
  async function make(v, file, out, encoder, ctx, duration) {
    const part = out + '.part';
    try {
      await ffmpeg.run('ffmpeg', argsFor(v, file, part, encoder, ffmpeg.input), {
        signal: ctx.signal, timeoutMs: 6 * 3600 * 1000, onProgress: (s) => { if (duration) ctx.progress(s / duration); }
      });
      fs.renameSync(part, out);
    } catch (err) {
      try { fs.unlinkSync(part); } catch { /* none */ }
      throw err;
    }
  }
  return {
    heavy: true,
    async run(job, ctx) {
      const file = job.input && job.input.file;
      if (!file || !fs.existsSync(file)) throw new Error('The file is not there any more.');
      const info = mediainfo.describe(await ffmpeg.probeRaw(file, { signal: ctx.signal }));
      let v = mediainfo.verdict(info);
      if (job.input.force && (v.action === 'none' || v.action === 'maybe')) v = { action: 'convert', target: 'mp4', why: 'it did not play' };
      if (v.action === 'none' || v.action === 'maybe') return { path: file, action: 'none' };
      const out = cache.pathFor('converted', file, v.target === 'webm' ? 'webm' : 'mp4');
      if (fs.existsSync(out)) return { path: out, action: v.action };
      let encoder = v.action === 'convert' ? await ffmpeg.h264Encoder() : null;
      try {
        await make(v, file, out, encoder, ctx, info.duration);
      } catch (err) {
        // A graphics card encoder that cannot take this file: once more on the processor.
        if (!encoder || encoder.name === 'libx264' || err.code === 'CANCELLED') throw err;
        encoder = ENCODERS[ENCODERS.length - 1];
        await make(v, file, out, encoder, ctx, info.duration);
      }
      return { path: out, action: v.action, encoder: encoder ? encoder.label : null };
    }
  };
}

module.exports = { argsFor, playableKind };
