// Save the wall as a video: the choices the dialog offers (size and length), the video's size for the wall's shape, and
// checking what the page asks for. The page gathers each tile's place and state (ui/wallvideo.js); the main process
// plans each tile's run of pieces and makes the video with FFmpeg (lib/wallexport.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).wallvideo = factory();
})(this, function () {
  'use strict';
  // The short side of the video, and how long it lasts (seconds).
  var SIZES = [[720, '720p (HD)'], [1080, '1080p (Full HD)'], [1440, '1440p'], [2160, '4K']];
  var LENGTHS = [[10, '10 s'], [30, '30 s'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes'], [600, '10 minutes']];
  var FPS = 30, LONG = 4096;   // LONG: the long side at most, as graphics card encoders take it
  var MAX_TILES = 150, MAX_TRACKS = 200;

  function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : NaN; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function even(v) { return Math.max(2, Math.round(v / 2) * 2); }
  function has(list, v) { return list.some(function (o) { return o[0] === v; }); }
  // The video's size for a W x H wall: the short side `short` pixels, the long side as the wall's shape says (at most
  // LONG); even numbers, as H.264 needs.
  function outSize(W, H, short) {
    var a = W / H, w, h;
    if (!(a > 0) || !isFinite(a)) a = 16 / 9;
    if (a >= 1) { h = short; w = short * a; } else { w = short; h = short / a; }
    var k = Math.min(1, LONG / Math.max(w, h));
    return { w: even(w * k), h: even(h * k) };
  }

  // One tile, checked: its box on the wall (CSS pixels), how the media sits in it, and how it plays now. vol 0: no
  // sound. at: where its video is; used: how much of its turn a playlist tile has had (seconds of the video, or seconds
  // a picture has shown).
  function cleanTile(t) {
    if (!t || typeof t.file !== 'string' || !t.file) return null;
    var x = num(t.x), y = num(t.y), w = num(t.w), h = num(t.h);
    if (!(w >= 1 && h >= 1) || !isFinite(x) || !isFinite(y)) return null;
    var mx = num(t.mx), my = num(t.my), loopA = num(t.loopA), loopB = num(t.loopB);
    return {
      file: t.file, kind: t.kind === 'video' ? 'video' : 'image', x: x, y: y, w: w, h: h,
      fit: t.fit === 'contain' ? 'contain' : 'cover', mx: mx >= 0 ? clamp(mx, 0, 1) : 0.5, my: my >= 0 ? clamp(my, 0, 1) : 0.5,
      zoom: clamp(num(t.zoom) || 1, 1, 8), speed: clamp(num(t.speed) || 1, 0.25, 4), vol: clamp(num(t.vol) || 0, 0, 1),
      at: Math.max(0, num(t.at) || 0), loopA: loopA >= 0 ? loopA : null, loopB: loopB > 0 ? loopB : null, repeat: t.repeat !== false,
      pl: typeof t.pl === 'string' && t.pl ? t.pl : null, pinned: t.pinned === true, used: Math.max(0, num(t.used) || 0)
    };
  }
  // path -> a number in range, for what the page knows of the files: each one's even-loudness gain (0 to 1) and where
  // its black or silent opening ends.
  function numbers(o, max) {
    var out = {};
    Object.keys(o && typeof o === 'object' ? o : {}).slice(0, 5000).forEach(function (k) { var v = num(o[k]); if (v >= 0 && v <= max) out[k] = v; });
    return out;
  }
  function openings(o) {
    var out = {};
    Object.keys(o && typeof o === 'object' ? o : {}).slice(0, 5000).forEach(function (k) {
      var v = o[k];
      if (v && typeof v === 'object') out[k] = { black: Math.max(0, num(v.black) || 0), silence: Math.max(0, num(v.silence) || 0) };
    });
    return out;
  }
  // What the page asks for, checked: { size, secs, wall: { w, h, bg }, tiles, playlists, music, hints } or null.
  // playlists are checked again where they are used (renderer/lib/playlist.js clean).
  function clean(r) {
    if (!r || typeof r !== 'object' || !r.wall || typeof r.wall !== 'object') return null;
    var W = num(r.wall.w), H = num(r.wall.h);
    if (!(W >= 10 && H >= 10)) return null;
    var tiles = (Array.isArray(r.tiles) ? r.tiles : []).slice(0, MAX_TILES).map(cleanTile).filter(Boolean);
    if (!tiles.length) return null;
    var m = r.music, tracks = m && Array.isArray(m.tracks) ? m.tracks.filter(function (p) { return typeof p === 'string' && p; }).slice(0, MAX_TRACKS) : [];
    var h = r.hints || {};
    return {
      size: has(SIZES, r.size) ? r.size : 1080, secs: has(LENGTHS, r.secs) ? r.secs : 30,
      wall: { w: W, h: H, bg: /^#[0-9a-f]{6}$/i.test(r.wall.bg) ? r.wall.bg.toLowerCase() : '#000000' },
      tiles: tiles, playlists: r.playlists && typeof r.playlists === 'object' ? r.playlists : {},
      music: tracks.length ? { tracks: tracks, at: Math.max(0, num(m.at) || 0), vol: clamp(num(m.vol), 0, 1) || 0 } : null,
      hints: { gain: numbers(h.gain, 1), open: openings(h.open) }
    };
  }

  return { SIZES: SIZES, LENGTHS: LENGTHS, FPS: FPS, LONG: LONG, outSize: outSize, clean: clean };
});
