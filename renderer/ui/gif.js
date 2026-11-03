// Make a GIF of a video tile's looped part: a small dialog (width, frames a second, the whole frame or what the tile
// shows, speed) with the GIF's size and roughly how big a file it makes. The main process then asks where to save it
// and makes it as a job (renderer/lib/gifmake.js, lib/makegif.js); when it is done, Show in Explorer or put it on
// the wall. Save the part as MP4 goes the same way without a dialog: the part is copied, not re-encoded (lib/cutpart.js).
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, P = MW.play, V = MW.view, GM = MW.gifmake;
  var $ = A.$, api = A.api, box = $('#popGif');
  var cur = null;   // the tile the dialog is for

  function fill(sel, list, val) {
    sel.innerHTML = list.map(function (o) { return '<option value="' + o[0] + '">' + U.esc(o[1]) + '</option>'; }).join('');
    sel.value = val;
  }
  // The width and rate stay as last chosen while Wallpane runs.
  fill($('#gifWidth'), GM.WIDTHS.map(function (w) { return [w, w + ' px']; }), '480');
  fill($('#gifFps'), GM.RATES.map(function (r) { return [r, String(r)]; }), '15');

  // The part: from the loop's start to its end (the video's end when the part runs to it), or null while the video
  // has not loaded.
  function part(it) {
    var m = A.videoOf(it), d = m && isFinite(m.duration) ? m.duration : null;
    var a = it.loopA || 0, b = it.loopB != null ? it.loopB : d;
    return b != null && b > a ? { a: a, b: b } : null;
  }
  function frame(it) { var m = A.videoOf(it); return m && m.videoWidth ? { w: m.videoWidth, h: m.videoHeight } : null; }
  // What the tile shows of the frame, from the video element's own size (its box on screen is zoomed).
  function tileView(it) {
    var m = A.videoOf(it), f = frame(it);
    return m && f && m.clientWidth ? V.shown(m.clientWidth, m.clientHeight, f.w / f.h, it.fit, V.of(it)) : null;
  }
  function request(it, p) {
    return {
      file: it.path, start: p.a, end: p.b, width: +$('#gifWidth').value, fps: +$('#gifFps').value,
      speed: $('#gifSpeed').value === 'tile' ? (it.speed || 1) : 1, crop: $('#gifView').value === 'tile' ? tileView(it) : null
    };
  }
  function secsText(s) { return (Math.round(s * 10) / 10) + ' s'; }
  function refresh() {
    var it = cur, p = it && part(it), f = it && frame(it), note = '', ok = !!p;
    if (!it) return;
    $('#gifPart').textContent = p ? P.fmtTime(p.a, true) + ' to ' + P.fmtTime(p.b, true) + ' of ' + it.name : it.name;
    if (!p) note = 'The video has not loaded yet. Try again in a moment.';
    else if (p.b - p.a > GM.MAX + 1e-6) { ok = false; note = 'The part is longer than a minute. Make it shorter to save it as a GIF.'; }
    else if (f) {
      var r = request(it, p), secs = GM.seconds(r), o = GM.outSize(f.w, f.h, r.crop, r.width);
      note = o.w + ' × ' + o.h + ' px, ' + secsText(secs) + ', about ' + U.bytes(GM.estimate(secs, r.fps, o.w, o.h)) + '.';
      if (secs > GM.LONG) note += ' GIFs get big: a shorter part, a smaller width or fewer frames make a smaller file.';
    }
    $('#gifNote').textContent = note;
    $('#gifMake').disabled = !ok;
  }

  // From Properties › Playback or the tile's right-click menu, for a single video with a looped part.
  A.makeGif = function (it) {
    if (!it || it.kind !== 'video' || !it.path || it.pl || it.missing) return;
    if (!P.hasLoop(it)) { A.toast('Loop a part of the video first: Properties › Playback, or [ and ] while it plays.'); return; }
    cur = it;
    var sp = it.speed || 1;
    $('#gifSpeedFld').hidden = sp === 1;
    fill($('#gifSpeed'), [['normal', 'Normal'], ['tile', sp + '×, as the tile plays it']], 'normal');
    // Zoomed or moved: what the tile shows is most likely what is wanted.
    $('#gifView').value = V.isDefault(it) ? 'whole' : 'tile';
    box.hidden = false;
    refresh();
    $('#gifWidth').focus();
  };
  function close() { box.hidden = true; cur = null; }
  box.addEventListener('change', refresh);
  $('#gifClose').addEventListener('click', close);
  $('#gifCancel').addEventListener('click', close);
  window.addEventListener('keydown', function (e) {
    if (!box.hidden && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);

  // A finished job's file: where it went, with anything worth knowing about it, Show in Explorer and Put on the wall.
  function saved(j, note) {
    var p = j.result.path;
    A.toast('Saved ' + j.label + (j.result.bytes ? ' (' + U.bytes(j.result.bytes) + ')' : '') + '.' + (note ? ' ' + note : ''), [
      { label: 'Show in Explorer', act: function () { api.revealFile(p); } },
      { label: 'Put on the wall', act: function () { api.expand([p]).then(function (res) { A.addFiles(res, null); }); } }
    ]);
  }
  function done(j) {
    if (j.state === 'done' && j.result) saved(j);
    else if (j.state === 'failed') A.toast('The GIF could not be made: ' + j.error);
  }
  $('#gifMake').addEventListener('click', function () {
    var it = cur, p = it && A.itemById(it.id) && part(it);
    if (!p) { close(); return; }
    var r = request(it, p);
    close();
    api.makeGif(r).then(function (res) {
      if (res.status === 'cancelled') return;
      if (res.status !== 'working') { A.toast('The GIF could not be made: the video is not there, or FFmpeg is missing.'); return; }
      A.toast('Making the GIF. The bar shows how far it has got.');
      A.watchJob(res.key, done);
    });
  });

  // Save the looped part as a video of its own, straight to where to save it. A copy can only start on a keyframe, so
  // the message says when it starts before the part, and when the video's picture or sound kept it from being an MP4.
  A.cutPart = function (it) {
    if (!it || it.kind !== 'video' || !it.path || it.pl || it.missing) return;
    if (!P.hasLoop(it)) { A.toast('Loop a part of the video first: Properties › Playback, or [ and ] while it plays.'); return; }
    var p = part(it);
    if (!p) { A.toast('The video has not loaded yet. Try again in a moment.'); return; }
    api.cutPart({ file: it.path, start: p.a, end: p.b }).then(function (res) {
      if (res.status === 'cancelled') return;
      if (res.status !== 'working') { A.toast('The part could not be saved: the video is not there, or FFmpeg is missing.'); return; }
      A.toast('Saving the part…');
      A.watchJob(res.key, function (j) {
        if (j.state === 'failed') { A.toast('The part could not be saved: ' + j.error); return; }
        if (j.state !== 'done' || !j.result) return;
        var r = j.result, notes = [], ext = (/\.([^.\\/]+)$/.exec(r.path) || ['', ''])[1];
        if (ext.toLowerCase() !== 'mp4') notes.push('Its picture or sound cannot go into an MP4 without re-encoding, so it is ' + ext.toUpperCase() + ', like the video.');
        if (r.early >= 0.1) notes.push('It starts ' + r.early + ' s before the part, on the keyframe there: a copy without re-encoding starts on one.');
        saved(j, notes.join(' '));
      });
    });
  };
})(window.MW.app);
