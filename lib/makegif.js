'use strict';
// The job kind 'makegif': a GIF of a part of a video, saved where the user chose (a video tile's Make a GIF…).
// Input: what renderer/lib/gifmake.js clean() gives, plus out (the path to save to). The GIF is written to
// "<out>.part" and renamed when whole, so a stopped or failed one leaves nothing behind. Result { path, bytes }.
const fs = require('fs');
const gifmake = require('../renderer/lib/gifmake');

function makeGifKind(o) {
  const ffmpeg = o.ffmpeg;
  return {
    heavy: true,
    transient: true,   // asked for by hand; not started again next time
    async run(job, ctx) {
      const g = gifmake.clean(job.input), out = job.input && job.input.out;
      if (!g || typeof out !== 'string' || !out) throw new Error('Nothing to make.');
      if (!fs.existsSync(g.file)) throw new Error('The video is not there any more.');
      const part = out + '.part', secs = gifmake.seconds(g);
      try {
        await ffmpeg.run('ffmpeg', gifmake.args(g, part, ffmpeg.input), { signal: ctx.signal, timeoutMs: 3600 * 1000, onProgress: (s) => ctx.progress(s / secs) });
        fs.renameSync(part, out);
      } catch (err) {
        try { fs.unlinkSync(part); } catch { /* none */ }
        throw err;
      }
      return { path: out, bytes: fs.statSync(out).size };
    }
  };
}

module.exports = { makeGifKind };
