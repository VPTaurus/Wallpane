// The time in the bar: a clock, and a stopwatch and a countdown timer that keep running in the background (also in
// wall mode). The popover's "In the bar" boxes choose what the bar always shows: the clock (else a small clock icon,
// so the popover can still be opened), and chips for the stopwatch and timer with a start/pause button each. A
// stopwatch or timer in use shows anyway, so a running one never disappears.
(function (A) {
  'use strict';
  if (!A) return;
  var C = window.MW.clock;
  var S = A.S, $ = A.$, ICON = A.ICON;
  var sw = C.watch(), tm = C.watch(5 * 60000), tmDone = false, actx = null;
  var shown = {};   // what each readout shows now, so the page is only touched on a change

  function setText(id, text) {
    if (shown[id] === text) return;
    shown[id] = text;
    $('#' + id).textContent = text;
  }
  function setFlags(id, flags) {   // { hidden, dim, done } on one element
    var k = JSON.stringify(flags), el = $('#' + id);
    if (shown['f:' + id] === k) return;
    shown['f:' + id] = k;
    var refit = 'hidden' in flags && el.hidden !== flags.hidden;   // a chip came or went: the bar may fit differently
    Object.keys(flags).forEach(function (f) { if (f === 'hidden') el.hidden = flags[f]; else el.classList.toggle(f, flags[f]); });
    if (refit) A.fitBar();
  }
  function h24() {
    if (typeof S.clock24 === 'boolean') return S.clock24;
    var hc = new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc !== 'h12' && hc !== 'h11';
  }
  function popOpen() { return !$('#popT').hidden; }
  // A chip's button: its icon and what a click does.
  function setCtl(id, icon, label) {
    if (shown[id] === icon + label) return;
    shown[id] = icon + label;
    var b = $('#' + id);
    b.innerHTML = '<span class="ic" aria-hidden="true">' + ICON[icon] + '</span>';
    b.setAttribute('aria-label', label); b.title = label;
  }

  function tick() {
    var now = Date.now(), d = new Date(now), bar = S.timeBar;
    setText('clock', C.fmtClock(d, h24(), false));
    setFlags('clock', { hidden: !bar.clock });
    setFlags('clockIcon', { hidden: bar.clock });
    // The stopwatch chip: when ticked, or while in use; dimmed while it is not running.
    var swMs = C.elapsed(sw, now), swOn = C.running(sw);
    setFlags('swChip', { hidden: !bar.sw && !swOn && !swMs, dim: !swOn });
    setText('swChipT', C.fmt(swMs, false));
    setCtl('swCtl', swOn ? 'pause' : 'play', swOn ? 'Pause the stopwatch' : (swMs ? 'Resume the stopwatch' : 'Start the stopwatch'));
    // The timer: counts down, and rings once at zero.
    var tmOn = C.running(tm), left = C.left(tm, now), tmUsed = C.elapsed(tm, now) > 0;
    if (tmOn && left <= 0) { C.pause(tm, now); tmOn = false; tmDone = true; ring(); }
    setFlags('tmChip', { hidden: !bar.tm && !tmOn && !tmDone && !tmUsed, dim: !tmOn && !tmDone, done: tmDone });
    setText('tmChipT', C.fmtLeft(left));
    setCtl('tmCtl', tmDone ? 'reset' : tmOn ? 'pause' : 'play',
      tmDone ? 'Reset the timer' : tmOn ? 'Pause the timer' : (tmUsed ? 'Resume the timer' : 'Start the timer'));
    if (popOpen()) {
      setText('bigClock', C.fmtClock(d, h24(), true));
      setText('dateLine', d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
      setText('swTime', C.fmt(swMs, true));
      setText('tmTime', C.fmtLeft(left));
      setFlags('tmTime', { done: tmDone });
      setText('swGo', swOn ? 'Pause' : (swMs ? 'Resume' : 'Start'));
      $('#swLap').disabled = !swOn;
      $('#swReset').disabled = !swMs;
      setText('tmGo', tmOn ? 'Pause' : (tmUsed && !tmDone ? 'Resume' : 'Start'));
      $('#tmReset').disabled = !tmOn && !tmDone && !tmUsed;
    }
  }
  setInterval(tick, 100);

  // Three soft beeps. The emergency hide mutes the window, so they never give it away.
  function ring() {
    A.toast('Timer: ' + C.fmtLeft(tm.total) + ' is up.');
    try {
      actx = actx || new AudioContext();
      var t0 = actx.currentTime + 0.05;
      [0, 0.32, 0.64].forEach(function (d) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = 988;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.28);
        o.connect(g); g.connect(actx.destination);
        o.start(t0 + d); o.stop(t0 + d + 0.3);
      });
    } catch (e) { /* no sound device */ }
  }

  function renderLaps() {
    var box = $('#swLaps');
    box.innerHTML = '';
    sw.laps.forEach(function (t, i) {
      var li = document.createElement('li'), prev = sw.laps[i + 1] || 0;
      li.innerHTML = '<span></span><span></span><span></span>';
      li.children[0].textContent = 'Lap ' + (sw.laps.length - i);
      li.children[1].textContent = C.fmt(t, true);
      li.children[2].textContent = '+' + C.fmt(t - prev, true);
      box.appendChild(li);
    });
    box.hidden = !sw.laps.length;
  }
  A.refreshTime = function () {
    $('#clock24').checked = h24();
    $('#showClock').checked = S.timeBar.clock; $('#showSw').checked = S.timeBar.sw; $('#showTm').checked = S.timeBar.tm;
    shown = {};
    renderLaps(); tick();
  };
  [['showClock', 'clock'], ['showSw', 'sw'], ['showTm', 'tm']].forEach(function (p) {
    $('#' + p[0]).addEventListener('change', function () { S.timeBar[p[1]] = this.checked; A.savePrefs(); tick(); });
  });
  // A chip's time opens (or closes) the popover.
  ['swOpen', 'tmOpen'].forEach(function (id) {
    $('#' + id).addEventListener('click', function () { if (popOpen()) A.closePops(); else A.openPop('time'); });
  });

  /* ---------- stopwatch ---------- */
  function swToggle() {
    var now = Date.now();
    if (C.running(sw)) C.pause(sw, now); else C.start(sw, now);
    tick();
  }
  $('#swGo').addEventListener('click', swToggle);
  $('#swCtl').addEventListener('click', swToggle);
  $('#swLap').addEventListener('click', function () { C.lap(sw, Date.now()); renderLaps(); });
  $('#swReset').addEventListener('click', function () { C.reset(sw); renderLaps(); tick(); });

  /* ---------- timer ---------- */
  function setTimer(ms) {
    C.reset(tm); tm.total = ms; tmDone = false;
    $('#tmSet').value = C.fmtLeft(ms).replace(/^(\d+):00$/, '$1');
  }
  // Start, pause or resume; a new start takes the length typed in the popover.
  function tmToggle() {
    var now = Date.now();
    if (C.running(tm)) { C.pause(tm, now); tick(); return; }
    if (tmDone || !C.elapsed(tm, now)) {
      var ms = C.parseTimer($('#tmSet').value);
      if (ms == null) { A.toast('Type minutes, like 5, or minutes and seconds, like 1:30.'); A.openPop('time'); $('#tmSet').focus(); return; }
      setTimer(ms);
    }
    C.start(tm, now); tick();
  }
  $('#tmGo').addEventListener('click', tmToggle);
  // The chip's button also resets a finished timer, which stops its flashing.
  $('#tmCtl').addEventListener('click', function () { if (tmDone) { setTimer(tm.total); tick(); } else tmToggle(); });
  $('#tmReset').addEventListener('click', function () { setTimer(tm.total); tick(); });
  $('#tmSet').addEventListener('change', function () {
    var ms = C.parseTimer(this.value);
    if (ms != null && !C.running(tm)) { setTimer(ms); tick(); }
  });
  $('#tmSet').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#tmGo').click(); } });
  Array.prototype.forEach.call(document.querySelectorAll('#tmPresets [data-min]'), function (b) {
    b.addEventListener('click', function () { setTimer(+b.dataset.min * 60000); C.start(tm, Date.now()); tick(); });
  });

  $('#clock24').addEventListener('change', function () { S.clock24 = this.checked; A.savePrefs(); shown = {}; tick(); });
  tick();
})(window.MW.app);
