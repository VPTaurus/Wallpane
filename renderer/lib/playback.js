// Playback of a video tile: speed steps, times written as m:ss.s, and the part of a video that loops.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).play = factory();
})(this, function () {
  'use strict';
  var SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

  // The next speed up (dir 1) or down (dir -1) from the steps above.
  function stepSpeed(cur, dir) {
    cur = +cur || 1;
    if (dir > 0) { for (var i = 0; i < SPEEDS.length; i++) if (SPEEDS[i] > cur + 1e-9) return SPEEDS[i]; return SPEEDS[SPEEDS.length - 1]; }
    for (var j = SPEEDS.length - 1; j >= 0; j--) if (SPEEDS[j] < cur - 1e-9) return SPEEDS[j];
    return SPEEDS[0];
  }
  // 83.46 -> "1:23.4" (tenths only when asked); an hour or more -> "1:02:03".
  function fmtTime(sec, tenths) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var whole = Math.floor(sec), h = Math.floor(whole / 3600), m = Math.floor(whole / 60) % 60, s = whole % 60;
    var out = (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
    return tenths ? out + '.' + Math.floor((sec - whole) * 10 + 1e-6) : out;
  }
  // "1:23.4", "83.4" or "1:02:03" -> seconds; NaN for anything else.
  function parseTime(str) {
    var s = String(str == null ? '' : str).trim().replace(',', '.');
    if (!/^\d+(?:\.\d+)?$|^\d+(?::\d{1,2}){1,2}(?:\.\d+)?$/.test(s)) return NaN;
    return s.split(':').reduce(function (acc, part) { return acc * 60 + parseFloat(part); }, 0);
  }
  // A loop part [a, b] put in order and inside the video (b null: to the end). Null when it makes no sense.
  function cleanLoop(a, b, duration) {
    a = a == null || a === '' ? 0 : +a; b = b == null || b === '' ? null : +b;
    if (!isFinite(a) || a < 0) a = 0;
    if (b != null && !isFinite(b)) return null;
    if (isFinite(duration) && duration > 0) { a = Math.min(a, duration); if (b != null) b = Math.min(b, duration); }
    if (b != null && b - a < 0.1) return null;
    if (b == null && a === 0) return null;   // the whole video: no part at all
    return { a: Math.round(a * 100) / 100, b: b == null ? null : Math.round(b * 100) / 100 };
  }
  function hasLoop(it) { return it.loopB != null || (it.loopA != null && it.loopA > 0); }
  // Where to jump back to at time t, or null when t is still inside the part.
  function loopTarget(t, a, b) {
    if (b == null) return null;
    return t >= b ? (a || 0) : null;
  }

  return { SPEEDS: SPEEDS, stepSpeed: stepSpeed, fmtTime: fmtTime, parseTime: parseTime, cleanLoop: cleanLoop, hasLoop: hasLoop, loopTarget: loopTarget };
});
