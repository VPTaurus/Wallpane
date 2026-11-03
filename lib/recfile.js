'use strict';
// Recording the wall live, the main process's half: the page's recorder (renderer/ui/recorder.js) sends its video a
// second at a time, and it is written to "<name>.part.mp4" as it comes, so a long recording never sits in memory and a
// window that closes while recording keeps what it recorded. When it stops, FFmpeg copies it into an ordinary MP4
// without re-encoding (the recorder writes a fragmented one, which some players cannot seek in or tell the length of);
// without FFmpeg, or if that fails, the file is only renamed.
//
// createRecordings({ ffmpeg }) -> { start(owner, out), write(owner, bytes), stop(owner), recording(owner) }; owner: the
// page recording (its webContents id).
const fs = require('fs');
const fsp = fs.promises;
const { partName } = require('./cutpart');

function createRecordings(o) {
  const ffmpeg = o.ffmpeg;
  const now = new Map();   // owner -> { out, part, fh, bytes, chain, error }

  // A recording of one page at a time: one it had still going is finished first.
  async function start(owner, out) {
    if (now.has(owner)) await stop(owner);
    const part = partName(out);
    const fh = await fsp.open(part, 'w');
    now.set(owner, { out, part, fh, bytes: 0, chain: Promise.resolve(), error: null });
    return out;
  }
  // The next piece, after the ones before it: { bytes } written so far, or { error } (the disk is full, say).
  function write(owner, bytes) {
    const r = now.get(owner);
    if (!r) return Promise.resolve({ error: 'Nothing is being recorded.' });
    r.chain = r.chain.then(async () => {
      if (r.error) return;
      try { await r.fh.write(bytes); r.bytes += bytes.length; } catch (err) { r.error = err.message; }
    });
    return r.chain.then(() => (r.error ? { error: r.error } : { bytes: r.bytes }));
  }
  // { status: 'saved', path, bytes, error } (error: why it stopped early, if it did), 'empty' when nothing came, or
  // null when nothing was being recorded.
  async function stop(owner) {
    const r = now.get(owner);
    if (!r) return null;
    now.delete(owner);
    await r.chain;
    await r.fh.close().catch(() => { /* closed */ });
    if (!r.bytes) { await fsp.unlink(r.part).catch(() => { /* none */ }); return { status: 'empty' }; }
    let copied = false;
    if (ffmpeg && ffmpeg.available()) {
      const mp4 = /\.mp4$/i.test(r.out) ? ['-movflags', '+faststart'] : [];
      try {
        await ffmpeg.run('ffmpeg', ['-y', '-v', 'error'].concat(ffmpeg.input(r.part), ['-map', '0', '-c', 'copy'], mp4, [r.out]), { timeoutMs: 30 * 60 * 1000 });
        copied = true;
      } catch { await fsp.unlink(r.out).catch(() => { /* none */ }); }
    }
    if (copied) await fsp.unlink(r.part).catch(() => { /* in use: left */ }); else await fsp.rename(r.part, r.out);
    return { status: 'saved', path: r.out, bytes: (await fsp.stat(r.out)).size, error: r.error };
  }
  return { start, write, stop, recording: (owner) => now.has(owner) };
}

module.exports = { createRecordings };
