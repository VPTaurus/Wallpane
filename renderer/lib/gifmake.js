// Make a GIF of a video tile's looped part: the choices the dialog offers, checking what the page asks for, the size
// the GIF will have and roughly how big a file it makes, its file name, and FFmpeg's arguments. The page uses the
// dialog's half; the main process checks the request again (clean) and runs FFmpeg (lib/makegif.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).gifmake = factory();
})(this, function () {
  'use strict';
  var WIDTHS = [320, 480, 640, 800], RATES = [10, 15, 20, 25];
  var LONG = 15, MAX = 60;   // seconds: from LONG the dialog warns of a big file, from MAX it refuses
  // Bytes per pixel of each frame, roughly, for video through palettegen and paletteuse with bayer dithering and only
  // the changed part of each frame stored. Measured: 0.1 for flat test pictures, 0.5 for a moving picture that changes
  // all over (an FFmpeg mandelbrot zoom), up to 1 for noise. So the dialog says "about".
  var BPP = 0.45;

  function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : NaN; }
  // What the page asks for, checked: { file, start, end, width, fps, speed, crop } or null. crop: the part of the
  // frame to keep, as fractions of it ({ x, y, w, h } from 0 to 1), or null for the whole frame.
  function clean(o) {
    if (!o || typeof o.file !== 'string' || !o.file) return null;
    var start = num(o.start), end = num(o.end);
    if (!(start >= 0) || !(end > start) || end - start > MAX + 1e-6) return null;
    var c = o.crop, crop = null;
    if (c && typeof c === 'object') {
      var x = num(c.x), y = num(c.y), w = num(c.w), h = num(c.h);
      if (!(x >= 0 && y >= 0 && w >= 0.01 && h >= 0.01 && x + w <= 1.0001 && y + h <= 1.0001)) return null;
      // Nearly the whole frame is the whole frame.
      if (!(x < 0.001 && y < 0.001 && w > 0.999 && h > 0.999)) crop = { x: x, y: y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
    }
    var speed = num(o.speed);
    return {
      file: o.file, start: start, end: end,
      width: WIDTHS.indexOf(o.width) > -1 ? o.width : 480,
      fps: RATES.indexOf(o.fps) > -1 ? o.fps : 15,
      speed: speed >= 0.25 && speed <= 4 ? speed : 1,
      crop: crop
    };
  }
  // The GIF's size in pixels for a vw x vh video: the kept part, `width` wide but never wider than that part.
  function outSize(vw, vh, crop, width) {
    var cw = vw * (crop ? crop.w : 1), ch = vh * (crop ? crop.h : 1);
    var w = Math.max(1, Math.round(Math.min(width, cw)));
    return { w: w, h: Math.max(1, Math.round(w * ch / cw)) };
  }
  // Seconds the GIF lasts, and roughly how many bytes it takes.
  function seconds(g) { return (g.end - g.start) / (g.speed || 1); }
  function estimate(secs, fps, w, h) { return Math.round(secs * fps * w * h * BPP); }
  // "clip 1m23.5s-1m30s.gif" for the part 1:23.5 to 1:30 of "clip.mp4" (Windows allows no colons in names).
  function stamp(s) {
    s = Math.round(s * 10) / 10;
    var m = Math.floor(s / 60), r = Math.round((s - m * 60) * 10) / 10, rs = r % 1 ? r.toFixed(1) : String(r);
    return (m ? m + 'm' + (r < 10 ? '0' : '') : '') + rs + 's';
  }
  function fileName(name, start, end) {
    var base = String(name || 'video').replace(/\.[^.\\/]+$/, '') || 'video';
    return base + ' ' + stamp(start) + '-' + stamp(end) + '.gif';
  }
  function fx(v) { return String(Math.round(v * 1e6) / 1e6); }
  // FFmpeg's arguments to make the GIF `out` (g from clean). `input(file)` gives the arguments that open the file.
  // One pass: the part (seeking before reading, which is exact when re-encoding), the kept part of the frame, the speed,
  // the rate and size, then the frames split in two: one makes a palette of the colours that change, the other is
  // drawn with it. -loop 0: the GIF plays forever.
  function args(g, out, input) {
    var vf = [];
    if (g.crop) vf.push('crop=w=iw*' + fx(g.crop.w) + ':h=ih*' + fx(g.crop.h) + ':x=iw*' + fx(g.crop.x) + ':y=ih*' + fx(g.crop.y));
    if (g.speed !== 1) vf.push('setpts=PTS/' + fx(g.speed));
    vf.push('fps=' + g.fps, "scale=w='min(" + g.width + ",iw)':h=-1:flags=lanczos", 'split[a][b]');
    return ['-y', '-v', 'error', '-ss', (g.start).toFixed(3), '-t', (g.end - g.start).toFixed(3)].concat(input(g.file), [
      '-map', '0:V:0', '-an', '-sn', '-dn',
      '-vf', vf.join(',') + ';[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      '-loop', '0', '-f', 'gif', '-progress', 'pipe:1', '-nostats', out]);
  }

  return { WIDTHS: WIDTHS, RATES: RATES, LONG: LONG, MAX: MAX, clean: clean, outSize: outSize, seconds: seconds, estimate: estimate, fileName: fileName, args: args };
});
