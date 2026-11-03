'use strict';
// Save the wall as a video (the page's Save the wall as a video…): every tile in its place, as one MP4 of the size and
// length chosen, made offline with FFmpeg. The wall goes on as it would: each tile carries on from where it is, with
// its looped part, Repeat, speed, zoom and position; a tile playing a folder moves on through its files with the
// playlist's own timing and order (tiles that share one take turns, as on the wall). The sound is that of the tiles
// whose sound is on, at their volume (even loudness too, for the files it has measured), with the music if it plays.
//
// How: plan() turns the wall into a run of pieces for each tile (a part of a file, and for how many frames) and one
// for the music. Each different piece is made once, at its tile's size (the media cropped and placed as the tile shows
// it, black bars), 30 frames a second, with its sound or silence; a tile's pieces are joined by FFmpeg's concat
// demuxer, so a looped part made once plays many times. Then all tiles are laid on the wall's colour and the sound is
// mixed, into the MP4. A big video whose lighter copy is big enough for its tile is read from that copy. The pieces
// live in a folder of their own, removed at the end; the video is written to "<name>.part.mp4" and renamed when whole.
// Not like the wall: a playlist's crossfade is a cut, a GIF starts from its first frame, and a video paused on the
// wall plays.
//
// The job kind 'wallvideo': input { out, req } (req as renderer/lib/wallvideo.js clean gives it).
// Result { path, bytes, tiles, secs }.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const V = require('../renderer/lib/view');
const PL = require('../renderer/lib/playlist');
const WV = require('../renderer/lib/wallvideo');
const mediainfo = require('./mediainfo');
const { imageSize } = require('./imagesize');
const { ENCODERS } = require('./ffmpeg');
const { partName } = require('./cutpart');

const FPS = WV.FPS;
const MAX_PIECES = 5000;   // per run: a guard against files that last no time at all
const OPEN_MIN = 0.3;      // as ui/playable.js: a shorter black or silent opening is none

function even(v) { return Math.max(2, Math.round(v / 2) * 2); }
function fx(v) { return String(Math.round(v * 1e6) / 1e6); }
function isGif(f) { return /\.gif$/i.test(f); }

// What a file is to the video: { type: 'video' | 'gif' | 'image' | 'audio', w, h, dur, audio }, or null when it cannot
// be read. w and h as the picture shows (a phone video or photo upright). A GIF of one frame is a picture. kind: what
// the wall calls it ('video', 'image'), or 'audio' for the music.
async function readInfo(ffmpeg, file, kind) {
  try { await fsp.access(file); } catch { return null; }
  if (kind === 'image' && !isGif(file)) {
    let s = null;
    try { s = await imageSize(file); } catch { /* left to ffprobe */ }
    if (!s) { try { const d = mediainfo.describe(await ffmpeg.probeRaw(file)); if (d.video) s = { w: d.video.width, h: d.video.height }; } catch { /* unreadable */ } }
    return s && s.w > 0 && s.h > 0 ? { type: 'image', w: s.w, h: s.h, dur: 0, audio: false } : null;
  }
  let d;
  try { d = mediainfo.describe(await ffmpeg.probeRaw(file)); } catch { return null; }
  if (kind === 'audio') return d.audio && d.duration > 0 ? { type: 'audio', w: 0, h: 0, dur: d.duration, audio: true } : null;
  const v = d.video;
  if (!v || !(v.width > 0 && v.height > 0)) return null;
  if (isGif(file)) return { type: d.duration > 0.05 ? 'gif' : 'image', w: v.width, h: v.height, dur: d.duration > 0.05 ? d.duration : 0, audio: false };
  return d.duration > 0 ? { type: 'video', w: v.width, h: v.height, dur: d.duration, audio: !!d.audio } : null;
}

// The wall as runs of pieces: { size: { w, h }, frames, tiles: [{ box: { x, y, w, h }, sound, pieces }], music }.
// A tile's piece: { file, type, a, b, frames, speed, audio, vol, crop, dest }: the file from a to b (seconds; a picture
// has none) at the tile's speed, for `frames` frames, its last frame staying when the part runs out first. crop: the
// part of the picture shown (fractions, view.js shown); dest: where in the tile it goes (pixels). The music's pieces:
// { file, type: 'audio', a, b, frames, vol }. info(file, kind) -> Promise<readInfo>; rnd for random starts.
async function plan(req, info, rnd) {
  rnd = rnd || Math.random;
  const L = req.secs, total = Math.round(L * FPS), size = WV.outSize(req.wall.w, req.wall.h, req.size), k = size.w / req.wall.w;
  const hints = req.hints || { gain: {}, open: {} };
  const runs = req.tiles.map((t) => ({ tile: t, box: { x: Math.round(t.x * k), y: Math.round(t.y * k), w: even(t.w * k), h: even(t.h * k) }, sound: t.vol > 0, pieces: [], t: 0, used: 0 }));
  const full = (R) => R.used >= total;
  // A piece takes the frames from where the run is to where it ends (rounded once, so they never drift); the last
  // one is cut to the video's length.
  function add(R, p, secs) {
    if (full(R) || !(secs > 0)) return;
    let frames = Math.round((R.t + secs) * FPS) - R.used;
    R.t += secs;
    if (frames <= 0) return;
    if (R.used + frames > total) {
      frames = total - R.used;
      if (p.type === 'video' || p.type === 'gif' || p.type === 'audio') p.b = Math.min(p.b, p.a + frames / FPS * (p.speed || 1));
    }
    p.frames = frames; R.used += frames; R.pieces.push(p);
  }
  function piece(R, file, inf, a, b) {
    const t = R.tile, pl = V.placed(R.box.w, R.box.h, inf.w / inf.h, t.fit, { mx: t.mx, my: t.my, zoom: t.zoom }), d = pl.dest;
    const w = Math.min(R.box.w, even(d.w)), h = Math.min(R.box.h, even(d.h));
    const gain = hints.gain[file] > 0 ? hints.gain[file] : 1;
    return {
      file, type: inf.type, a, b, speed: inf.type === 'video' ? t.speed : 1, audio: inf.audio, vol: R.sound && inf.audio ? t.vol * gain : 0,
      crop: pl.crop, dest: { x: Math.max(0, Math.min(R.box.w - w, Math.round(d.x))), y: Math.max(0, Math.min(R.box.h - h, Math.round(d.y))), w, h }
    };
  }
  // A video from a to b at the tile's speed (or shown for `secs`, its last frame staying).
  function part(R, file, inf, a, b, secs) {
    const p = piece(R, file, inf, a, b);
    add(R, p, secs != null ? secs : (b - a) / p.speed);
  }
  // A picture shown for `secs`; a GIF goes round from its start meanwhile.
  function hold(R, file, inf, secs) {
    if (inf.type !== 'gif') { add(R, piece(R, file, inf, 0, 0), secs); return; }
    for (let left = secs, n = 0; left > 1e-3 && !full(R) && n < MAX_PIECES; n++) {
      const s = Math.min(inf.dur, left);
      add(R, piece(R, file, inf, 0, s), s);
      left -= s;
    }
  }
  // Where a video starts after its opening (ui/playable.js openingOf): after its black, or its silence when it is heard.
  function opening(file, inf, heard) {
    const o = hints.open[file];
    if (!o) return 0;
    const s = Math.max(o.black || 0, heard ? o.silence || 0 : 0);
    return s >= OPEN_MIN && s <= inf.dur / 3 ? s : 0;
  }
  const startAt = (t, inf) => Math.min(t.at, Math.max(0, inf.dur - 0.05));

  // A tile with one file (or a playlist tile staying on its file).
  async function single(R) {
    const t = R.tile, inf = await info(t.file, t.kind);
    if (!inf) return;
    if (inf.type !== 'video') { hold(R, t.file, inf, L); return; }
    const D = inf.dur, at = startAt(t, inf);
    if (t.loopB != null || t.loopA > 0) {
      let A = Math.min(t.loopA || 0, D), B = t.loopB == null ? D : Math.min(t.loopB, D);
      if (B - A < 0.05) { A = 0; B = D; }
      part(R, t.file, inf, at >= A && at < B ? at : A, B);
      for (let n = 0; !full(R) && n < MAX_PIECES; n++) part(R, t.file, inf, A, B);
    } else if (t.repeat || t.pinned) {
      part(R, t.file, inf, at, D);
      const s = opening(t.file, inf, R.sound);
      for (let n = 0; !full(R) && n < MAX_PIECES; n++) part(R, t.file, inf, s, D);
    } else part(R, t.file, inf, at, D, L - R.t);   // plays once: its last frame stays
  }
  // What a playlist tile shows now, for the rest of its turn.
  async function current(R, p) {
    const t = R.tile, inf = await info(t.file, t.kind);
    if (!inf) return;
    if (inf.type === 'video') {
      const at = startAt(t, inf), end = p.maxClip ? Math.min(inf.dur, at + Math.max(0, p.maxClip - t.used)) : inf.dur;
      part(R, t.file, inf, at, Math.max(at, end));
    } else hold(R, t.file, inf, Math.max(0.5, (inf.type === 'gif' && p.gifOnce ? inf.dur : p.secs) - t.used));
  }
  // The tiles that share a playlist: each first carries on with its file, then the playlist's next file goes to
  // whichever tile needs one first, as on the wall.
  async function playlist(key, group) {
    const p = PL.clean({ p: req.playlists[key] }).p;
    if (!p) { for (const R of group) await single(R); return; }
    for (const R of group) await current(R, p);
    let bad = 0;
    for (let n = 0; n < MAX_PIECES * group.length; n++) {
      const R = group.filter((g) => !full(g)).sort((a, b) => a.t - b.t)[0];
      if (!R) break;
      const f = PL.nextFile(p);
      if (!f) break;
      const inf = await info(f.path, f.kind);
      if (!inf) { if (++bad > p.files.length) break; continue; }   // the wall passes over a file it cannot play
      bad = 0;
      if (inf.type === 'video') {
        let t0 = 0;
        if (p.randomStart) { const room = inf.dur - (p.maxClip || 10); if (room > 1) t0 = rnd() * room; } else t0 = opening(f.path, inf, R.sound);
        part(R, f.path, inf, t0, p.maxClip ? Math.min(inf.dur, t0 + p.maxClip) : inf.dur);
      } else hold(R, f.path, inf, inf.type === 'gif' && p.gifOnce ? inf.dur : p.secs);
    }
  }
  async function music() {
    const m = req.music;
    if (!m || !(m.vol > 0)) return null;
    const R = { pieces: [], t: 0, used: 0 };
    let bad = 0;
    for (let i = 0; !full(R) && i < MAX_PIECES; i++) {
      const f = m.tracks[i % m.tracks.length], inf = await info(f, 'audio');
      if (!inf) { if (++bad >= m.tracks.length) break; continue; }
      bad = 0;
      const a = i === 0 ? Math.min(m.at, inf.dur) : 0;
      add(R, { file: f, type: 'audio', a, b: inf.dur, speed: 1, vol: m.vol }, inf.dur - a);
    }
    return R.pieces.length ? R.pieces : null;
  }

  const groups = new Map();
  for (const R of runs) {
    if (R.tile.pl && !R.tile.pinned) { if (!groups.has(R.tile.pl)) groups.set(R.tile.pl, []); groups.get(R.tile.pl).push(R); } else await single(R);
  }
  for (const [key, group] of groups) await playlist(key, group);
  return {
    size, frames: total,
    tiles: runs.filter((R) => R.pieces.length).map((R) => ({ box: R.box, sound: R.pieces.some((p) => p.vol > 0), pieces: R.pieces })),
    music: await music()
  };
}

/* ---------- FFmpeg's arguments ---------- */
// The sound's speed: atempo takes 0.5 to 2 at a time.
function tempo(s) {
  const out = [];
  while (s > 2) { out.push('atempo=2'); s /= 2; }
  while (s < 0.5) { out.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-6) out.push('atempo=' + fx(s));
  return out;
}
const SOUND = ['aresample=48000', 'aformat=sample_fmts=s16:channel_layouts=stereo'];
// Pieces are made quickly and nearly losslessly (they are encoded once more for the video), in Matroska.
const PIECE = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-g', String(FPS)];
function tail(out) { return ['-sn', '-dn', '-f', 'matroska', '-progress', 'pipe:1', '-nostats', out]; }

// One piece of a tile, at the tile's size (box). `src`: the file to read (the original or its lighter copy); `sound`:
// the tile is heard, so every piece of it has sound (silence where the file has none), as the concat demuxer needs.
// A video is read from a to b (seeking before reading, exact when re-encoding) and played at its speed; a picture is
// read once and repeated. The frames are counted exactly; a video that runs out first keeps its last frame.
function pieceArgs(p, box, sound, src, out, input) {
  const secs = (p.frames / FPS).toFixed(4), c = p.crop;
  const a = ['-y', '-v', 'error'];
  if (p.type === 'image') a.push(...input(src));
  else a.push('-ss', p.a.toFixed(3), '-t', Math.max(0.04, p.b - p.a).toFixed(3), ...input(src));
  const silent = sound && !(p.vol > 0 && p.audio);
  if (silent) a.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  const vf = [];
  if (!(c.x < 0.001 && c.y < 0.001 && c.w > 0.999 && c.h > 0.999)) vf.push('crop=w=iw*' + fx(c.w) + ':h=ih*' + fx(c.h) + ':x=iw*' + fx(c.x) + ':y=ih*' + fx(c.y));
  vf.push('scale=' + p.dest.w + ':' + p.dest.h + ':flags=bicubic', 'setsar=1');
  const pad = 'pad=' + box.w + ':' + box.h + ':' + p.dest.x + ':' + p.dest.y + ':color=black';
  if (p.type === 'image') vf.push(pad, 'format=yuv420p', 'loop=loop=-1:size=1', 'setpts=N/' + FPS + '/TB');
  else vf.push('setpts=(PTS-STARTPTS)/' + fx(p.speed), 'fps=' + FPS, pad, 'format=yuv420p', 'tpad=stop_mode=clone:stop_duration=' + secs);
  let fc = '[0:v:0]' + vf.join(',') + '[v]';
  if (sound) {
    fc += ';' + (silent ? '[1:a]atrim=end=' + secs + '[a]'
      : '[0:a:0]' + ['asetpts=PTS-STARTPTS'].concat(tempo(p.speed), ['volume=' + fx(p.vol)], SOUND, ['apad', 'atrim=end=' + secs]).join(',') + '[a]');
  }
  a.push('-filter_complex', fc, '-map', '[v]');
  if (sound) a.push('-map', '[a]', '-c:a', 'pcm_s16le'); else a.push('-an');
  return a.concat(['-frames:v', String(p.frames)], PIECE, tail(out));
}
// One piece of the music: its sound only, at its volume, exactly as long as its frames.
function musicArgs(p, out, input) {
  const secs = (p.frames / FPS).toFixed(4);
  return ['-y', '-v', 'error', '-ss', p.a.toFixed(3), '-t', Math.max(0.04, p.b - p.a).toFixed(3)].concat(input(p.file), [
    '-filter_complex', '[0:a:0]' + ['asetpts=PTS-STARTPTS', 'volume=' + fx(p.vol)].concat(SOUND, ['apad', 'atrim=end=' + secs]).join(',') + '[a]',
    '-map', '[a]', '-c:a', 'pcm_s16le', '-vn'], tail(out));
}
// The concat demuxer's list of pieces (names in the same folder as the list).
function listText(names) { return 'ffconcat version 1.0\n' + names.map((n) => "file '" + n.replace(/'/g, "'\\''") + "'").join('\n') + '\n'; }
// The video: the wall's colour, each tile's joined pieces laid on it in its place (in the wall's order, so a tile
// over another stays over it), the heard tiles and the music mixed as they add up on the wall. lists: a list file
// for each tile of the plan, then the music's (or null).
function wallArgs(pl, lists, musicList, bg, encoder, out) {
  const a = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x' + bg.slice(1) + ':s=' + pl.size.w + 'x' + pl.size.h + ':r=' + FPS];
  lists.concat(musicList ? [musicList] : []).forEach((l) => a.push('-f', 'concat', '-safe', '0', '-i', l));
  const fc = [];
  let last = '[0:v]';
  pl.tiles.forEach((T, i) => {
    const o = '[w' + (i + 1) + ']';
    fc.push(last + '[' + (i + 1) + ':v]overlay=x=' + T.box.x + ':y=' + T.box.y + ':eof_action=repeat' + o);
    last = o;
  });
  fc.push(last + 'format=yuv420p[vout]');
  const heard = pl.tiles.map((T, i) => (T.sound ? '[' + (i + 1) + ':a]' : null)).filter(Boolean);
  if (musicList) heard.push('[' + (lists.length + 1) + ':a]');
  if (heard.length) fc.push(heard.join('') + (heard.length > 1 ? 'amix=inputs=' + heard.length + ':normalize=0:duration=longest' : 'anull') + '[aout]');
  a.push('-filter_complex', fc.join(';'), '-map', '[vout]');
  if (heard.length) a.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k'); else a.push('-an');
  return a.concat(encoder.args, ['-frames:v', String(pl.frames), '-movflags', '+faststart', '-f', 'mp4', '-progress', 'pipe:1', '-nostats', out]);
}

function wallVideoKind(o) {
  const ffmpeg = o.ffmpeg, cache = o.cache, tmp = o.tmp;
  return {
    heavy: true,
    transient: true,   // asked for by hand; not started again next time
    async run(job, ctx) {
      const req = WV.clean(job.input && job.input.req), out = job.input && job.input.out;
      if (!req || typeof out !== 'string' || !out) throw new Error('Nothing to make.');
      const known = new Map();
      const info = (file, kind) => {
        const key = kind + '|' + file;
        if (!known.has(key)) known.set(key, readInfo(ffmpeg, file, kind));
        return known.get(key);
      };
      const pl = await plan(req, info);
      if (!pl.tiles.length) throw new Error('None of the tiles\' files could be read.');
      // A big video is read from its lighter copy when that is big enough for the part its tile shows.
      const copies = new Map();
      async function source(p) {
        if (p.type !== 'video' || !cache) return p.file;
        if (!copies.has(p.file)) {
          const c = cache.find('proxies', p.file, 'mp4');
          copies.set(p.file, c ? readInfo(ffmpeg, c, 'video').then((i) => (i ? { path: c, w: i.w, h: i.h } : null)) : Promise.resolve(null));
        }
        const c = await copies.get(p.file);
        return c && p.dest.w <= c.w * p.crop.w + 2 && p.dest.h <= c.h * p.crop.h + 2 ? c.path : p.file;
      }
      fs.rmSync(tmp, { recursive: true, force: true });   // what an earlier video left (one is made at a time)
      fs.mkdirSync(tmp, { recursive: true });
      const part = partName(out);
      try {
        // Each different piece once; a tile's list names its pieces in turn.
        const names = new Map(), todo = [];
        const name = (key, x) => { if (!names.has(key)) { names.set(key, 'p' + names.size + '.mkv'); todo.push(Object.assign({ name: names.get(key) }, x)); } return names.get(key); };
        const lists = pl.tiles.map((T, i) => {
          const f = path.join(tmp, 't' + i + '.txt');
          fs.writeFileSync(f, listText(T.pieces.map((p) => name(JSON.stringify([T.box.w, T.box.h, T.sound, p]), { p, T }))));
          return f;
        });
        let musicList = null;
        if (pl.music) {
          musicList = path.join(tmp, 'music.txt');
          fs.writeFileSync(musicList, listText(pl.music.map((p) => name(JSON.stringify(['music', p]), { p, T: null }))));
        }
        const total = todo.reduce((s, x) => s + x.p.frames, 0) / FPS + pl.frames / FPS;
        let done = 0;
        const step = { signal: ctx.signal, timeoutMs: 6 * 3600 * 1000, onProgress: (s) => ctx.progress(Math.min(1, (done + s) / total)) };
        for (const x of todo) {
          const f = path.join(tmp, x.name);
          await ffmpeg.run('ffmpeg', x.T ? pieceArgs(x.p, x.T.box, x.T.sound, await source(x.p), f, ffmpeg.input) : musicArgs(x.p, f, ffmpeg.input), step);
          done += x.p.frames / FPS;
        }
        const encoder = await ffmpeg.h264Encoder();
        try {
          await ffmpeg.run('ffmpeg', wallArgs(pl, lists, musicList, req.wall.bg, encoder, part), step);
        } catch (err) {
          // A graphics card encoder that cannot take this size: once more on the processor.
          if (encoder.name === 'libx264' || err.code === 'CANCELLED') throw err;
          await ffmpeg.run('ffmpeg', wallArgs(pl, lists, musicList, req.wall.bg, ENCODERS[ENCODERS.length - 1], part), step);
        }
        fs.renameSync(part, out);
      } catch (err) {
        try { fs.unlinkSync(part); } catch { /* none */ }
        throw err;
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      return { path: out, bytes: fs.statSync(out).size, tiles: pl.tiles.length, secs: req.secs };
    }
  };
}

module.exports = { readInfo, plan, tempo, pieceArgs, musicArgs, listText, wallArgs, wallVideoKind };
