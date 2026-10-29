// The clock, stopwatch and countdown timer in the bar: the arithmetic, apart from the page so it can be tested.
// A watch runs from `since` (null while stopped) and keeps the time of earlier runs in `banked`; times are milliseconds
// from whatever clock the caller passes in.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).clock = factory();
})(this, function () {
  'use strict';
  function pad(n) { return String(n).padStart(2, '0'); }

  function watch(total) { return { total: total || 0, banked: 0, since: null, laps: [] }; }
  function running(w) { return w.since != null; }
  function elapsed(w, now) { return w.banked + (w.since == null ? 0 : Math.max(0, now - w.since)); }
  function start(w, now) { if (w.since == null) w.since = now; return w; }
  function pause(w, now) { if (w.since != null) { w.banked = elapsed(w, now); w.since = null; } return w; }
  function reset(w) { w.banked = 0; w.since = null; w.laps = []; return w; }
  // Laps, newest first: the time on the watch at each press.
  function lap(w, now) { w.laps.unshift(elapsed(w, now)); if (w.laps.length > 99) w.laps.length = 99; return w; }
  // A countdown: what is left of its total (never below 0).
  function left(w, now) { return Math.max(0, w.total - elapsed(w, now)); }

  // 83456 -> "1:23.4" (tenths when asked); an hour or more -> "1:02:03.4".
  function fmt(ms, tenths) {
    var t = Math.floor(Math.max(0, ms || 0) / 100), s = Math.floor(t / 10), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    var out = (h ? h + ':' + pad(m) : String(m)) + ':' + pad(s % 60);
    return tenths ? out + '.' + (t % 10) : out;
  }
  // A countdown rounds up: it shows 5:00 until a whole second has gone, and 0:00 only when the time is up.
  function fmtLeft(ms) { return fmt(Math.ceil(Math.max(0, ms) / 1000) * 1000, false); }
  // "5" is 5 minutes, "1.5" 90 seconds, "1:30" a minute and a half, "1:00:00" an hour. Null when unreadable or not
  // between a second and a day.
  function parseTimer(str) {
    var s = String(str == null ? '' : str).trim().replace(',', '.'), ms;
    if (/^\d+(?:\.\d+)?$/.test(s)) ms = parseFloat(s) * 60000;
    else if (/^\d+(?::\d{1,2}){1,2}$/.test(s)) ms = s.split(':').reduce(function (a, p) { return a * 60 + Number(p); }, 0) * 1000;
    else return null;
    return ms >= 1000 && ms <= 86400000 ? Math.round(ms) : null;
  }
  // A Date -> "14:05" or "2:05 PM", with ":09" seconds when asked.
  function fmtClock(d, h24, secs) {
    var h = d.getHours(), out = (h24 ? pad(h) : String((h + 11) % 12 + 1)) + ':' + pad(d.getMinutes());
    if (secs) out += ':' + pad(d.getSeconds());
    return h24 ? out : out + (h < 12 ? ' AM' : ' PM');
  }

  return {
    watch: watch, running: running, elapsed: elapsed, start: start, pause: pause, reset: reset, lap: lap, left: left,
    fmt: fmt, fmtLeft: fmtLeft, parseTimer: parseTimer, fmtClock: fmtClock
  };
});
