'use strict';
// Thumbnails for the library (main process): a small WebP of each file, at most 360 px on its long side, in the
// cache's thumbs folder, named like every cached file by the original's path, size and time (so a changed file gets a
// new one, and one the cache cleaned away is simply made again).
// - A video: a typical frame from about a tenth of the way in. FFmpeg's thumbnail filter picks the most typical of 40
//   frames there, which skips a black or blank one.
// - A GIF: its first frame. A picture: a small copy, turned the way its camera says (FFmpeg reads the EXIF orientation).
// One background job makes them, two at a time: first the ones a window shows right now (want), then every other
// library file that has its details. A file FFmpeg cannot make one of is marked (terr) and not tried again until it
// changes.
//
// createThumbs({ library, cache, ffmpeg, jobs, notify, notifyEvery })
//   notify({ id: path }): thumbnails just made that a window asked for (at most four times a second).
// Returns { want, queue, kind, thumbArgs }.
const fs = require('fs');
const FF = require('./ffmpeg');

const SIZE = 360;

// The FFmpeg arguments for one thumbnail of `file` (a 'video', 'gif' or 'image') into `out`.
// o.at: where to look in a video, in seconds. o.size: the long side.
function thumbArgs(kind, file, out, o) {
  o = o || {};
  const size = o.size || SIZE;
  // Never larger than the original; videos with stretched pixels (anamorphic DVDs) are made square first.
  const scale = "scale=w='if(gte(iw,ih),min(" + size + ",iw),-1)':h='if(gte(iw,ih),-1,min(" + size + ",ih))'";
  const vf = kind === 'video' ? 'scale=iw*sar:ih,setsar=1,' + scale + ',thumbnail=n=40' : scale;
  const seek = kind === 'video' && o.at > 0 ? ['-ss', String(Math.round(o.at * 100) / 100)] : [];
  return ['-y', '-v', 'error'].concat(seek, FF.input(file), [
    '-map', '0:V:0', '-vf', vf, '-frames:v', '1', '-an', '-sn', '-dn', '-c:v', 'libwebp', '-quality', '75', '-f', 'webp', out
  ]);
}

function createThumbs(o) {
  const lib = o.library, cache = o.cache, ff = o.ffmpeg;
  const wanted = [];           // ids a window shows now, the latest asked for first
  const busy = new Set();      // ids being made now
  let made = {}, timer = null;
  const keyOf = (e) => cache.keyFor(e.path, e.size, e.mtime);

  function tell(id, p) {
    made[id] = p;
    if (!o.notify || timer) return;
    timer = setTimeout(() => { timer = null; const m = made; made = {}; o.notify(m); }, o.notifyEvery === undefined ? 250 : o.notifyEvery);
  }
  function queue() {
    if (ff.available() && o.jobs) o.jobs.add({ kind: 'libthumbs', key: 'libthumbs', label: 'Library', priority: wanted.length ? 'user' : 'background' });
  }
  // The thumbnails of these files that are there: { id: path }. The others are made before any other, and arrive
  // through notify. Without FFmpeg there are none (the page shows pictures from the files themselves).
  function want(ids) {
    const out = {};
    if (!ff.available()) return out;
    let more = false;
    for (const id of Array.isArray(ids) ? ids.slice(0, 500) : []) {
      const e = typeof id === 'string' && lib.get(id);
      if (!e || e.terr) continue;
      const p = cache.findKey('thumbs', keyOf(e), 'webp');
      if (p) { out[id] = p; continue; }
      const i = wanted.indexOf(id);
      if (i > -1) wanted.splice(i, 1);
      wanted.unshift(id);
      more = true;
    }
    if (wanted.length > 2000) wanted.length = 2000;
    if (more) queue();
    return out;
  }

  async function makeOne(e, signal, asked) {
    const out = cache.pathForKey('thumbs', keyOf(e), 'webp'), part = out + '.part';
    if (fs.existsSync(out)) { if (asked) tell(e.id, out); return; }
    busy.add(e.id);
    try {
      const at = e.kind === 'video' && e.dur >= 3 ? e.dur * 0.1 : 0;
      try {
        await ff.run('ffmpeg', thumbArgs(e.kind, e.path, part, { at }), { signal, timeoutMs: 60000 });
      } catch (err) {
        // The length was wrong and the look landed past the end: look at the start instead.
        if (err.code === 'CANCELLED' || !at) throw err;
        await ff.run('ffmpeg', thumbArgs(e.kind, e.path, part, { at: 0 }), { signal, timeoutMs: 60000 });
      }
      fs.renameSync(part, out);
      if (asked) tell(e.id, out);
    } catch (err) {
      try { fs.unlinkSync(part); } catch { /* not made */ }
      if (err.code === 'CANCELLED') throw err;
      // A file that is gone is left to the next scan.
      if (fs.existsSync(e.path)) lib.setInfo(e.id, { terr: String(err.message || err).slice(0, 200) }, e);
    } finally { busy.delete(e.id); }
  }

  // The job kind: the wanted ones first, checked again before every file, then the rest.
  const kind = {
    heavy: false,
    async run(job, ctx) {
      const rest = lib.all().filter((e) => e.w !== undefined && !e.err && !e.terr);
      let i = 0, count = 0;
      function next() {
        while (wanted.length) {
          const e = lib.get(wanted.shift());
          if (e && !e.terr && !busy.has(e.id)) return { e, asked: true };
        }
        while (i < rest.length) {
          const e = rest[i++];
          if (!busy.has(e.id)) return { e, asked: false };
        }
        return null;
      }
      const worker = async () => {
        for (let n = next(); n; n = next()) {
          if (ctx.signal.aborted) throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });
          await makeOne(n.e, ctx.signal, n.asked);
          count++;
          ctx.progress(rest.length ? i / rest.length : 1);
        }
      };
      // Asked for while the last files were being made: those too, before this job ends.
      do { await Promise.all([worker(), worker()]); } while (wanted.length);
      return { files: count };
    }
  };

  return { want, queue, kind, thumbArgs };
}

module.exports = { createThumbs, thumbArgs, SIZE };
