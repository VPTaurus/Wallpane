'use strict';
// The pace Wallpane draws at (main.js; Settings › Wall mode › Drawing pace). Chromium paces every window by the main
// display's refresh (ui/gl/vsync_thread_win_dxgi.cc), so beside a faster main display a wall on a 60 Hz screen
// judders; drawing at the slowest screen's rate keeps it smooth (Chromium's fake-vsync-rate switch).
//   pace 'auto':  the slowest screen's rate when it is below the main display's, worked out by autoPace
//   pace 'main':  the main display's, as Windows does
//   pace '60':    60 frames a second
const PACES = ['auto', 'main', '60'];

// What Automatic draws at: the slowest rate (Hz) when it is below the main display's; 0 (the main display's own pace)
// when they run alike or there is one screen.
function autoPace(rates, main) {
  const all = (rates || []).map((r) => Math.round(+r || 0)).filter((r) => r >= 20);
  const slow = all.length ? Math.min(...all) : 0;
  return all.length > 1 && main > 0 && slow < Math.round(main) - 1 ? slow : 0;
}
// The rate to draw at for app.json's { pace, paceHz } (paceHz: what autoPace said last time); 0: the main display's.
function paceHzOf(s) {
  s = s || {};
  const hz = s.pace === '60' ? 60 : s.pace === 'main' ? 0 : +s.paceHz || 0;
  return hz >= 20 && hz <= 240 ? Math.round(hz) : 0;
}

module.exports = { PACES, autoPace, paceHzOf };
