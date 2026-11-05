// Save the wall as a video: a small dialog (size and length) that says what the video will hold, then the main process
// asks where to save it and makes it as a job (renderer/lib/wallvideo.js, lib/wallexport.js). In the video the wall
// goes on as it would here: each tile from where it is now, with its looped part, speed, zoom, playlist and sound,
// and the music if it plays. From Saved walls (Save as a video…); the bar's Record button records the wall live
// instead (ui/recorder.js). Beside Record, Screenshot saves the wall as it shows now as a picture.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, WV = MW.wallvideo, PL = MW.pl, GM = MW.gifmake;
  var S = A.S, $ = A.$, api = A.api, box = $('#popWv'), wall = $('#wall');

  function fill(sel, list, val) {
    sel.innerHTML = list.map(function (o) { return '<option value="' + o[0] + '">' + U.esc(o[1]) + '</option>'; }).join('');
    sel.value = val;
  }
  // The same dialog makes a video or a GIF (gif). The choices stay as last chosen while Wallpane runs, a length for each.
  var gif = false, secsOf = { video: '30', gif: '5' };
  fill($('#wvSize'), WV.SIZES, '1080');
  fill($('#wvWidth'), WV.GIF_WIDTHS.map(function (w) { return [w, w + ' px']; }), '480');
  fill($('#wvFps'), WV.GIF_RATES.map(function (r) { return [r, String(r)]; }), '15');
  function setMode(g) {
    secsOf[gif ? 'gif' : 'video'] = $('#wvSecs').value || secsOf[gif ? 'gif' : 'video'];
    gif = g;
    fill($('#wvSecs'), gif ? WV.GIF_LENGTHS : WV.LENGTHS, secsOf[gif ? 'gif' : 'video']);
    $('#wvTitle').textContent = gif ? 'Save the wall as a GIF' : 'Save the wall as a video';
    $('#wvMake').textContent = gif ? 'Save the GIF…' : 'Save the video…';
    $('#wvSizeFld').hidden = gif;
    $('#wvWidthFld').hidden = $('#wvFpsFld').hidden = !gif;
  }
  setMode(false);

  // The wall's colour as #rrggbb, from its style (also for ui/recorder.js).
  A.wallColour = function () {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(wall).backgroundColor || '');
    return m ? '#' + [m[1], m[2], m[3]].map(function (v) { return ('0' + (+v).toString(16)).slice(-2); }).join('') : '#000000';
  };
  // The wall as it plays now: each tile with media, its box on the wall (as drawn, so Free and grid alike, and only
  // the full-screen tile while one is), how the media sits in it and how it plays; the playlists the tiles play, the
  // music, and what is known of the files' loudness and openings.
  function gather() {
    var wr = wall.getBoundingClientRect(), tiles = [], lists = {}, paths = {};
    S.items.forEach(function (it) {
      var el = A.tileEls.get(it.id);
      if (!el || !A.hasMedia(it) || it.sample || it.missing || !it.path) return;
      var r = el.getBoundingClientRect();
      if (!(r.width >= 1 && r.height >= 1)) return;
      var m = it.kind === 'video' ? A.videoOf(it) : null, p = it.pl && S.playlists[it.pl], at = m ? m.currentTime || 0 : 0;
      tiles.push({
        file: it.path, kind: it.kind, x: r.left - wr.left, y: r.top - wr.top, w: r.width, h: r.height,
        fit: it.fit, mx: it.mx, my: it.my, zoom: it.zoom, speed: it.speed || 1,
        vol: it.kind === 'video' && !it.muted ? (it.vol == null ? 1 : it.vol) : 0,
        at: at, loopA: it.loopA, loopB: it.loopB, repeat: !!it.loop, pinned: !!it.pinned, pl: p ? it.pl : null,
        used: p ? (it.kind === 'video' ? Math.max(0, at - (it._t0 || 0)) : it.shown || 0) : 0
      });
      paths[it.path] = true;
      if (p && !lists[it.pl]) { lists[it.pl] = PL.fields(p); p.files.forEach(function (f) { paths[f.path] = true; }); }
    });
    return {
      wall: { w: wr.width, h: wr.height, bg: A.wallColour() },
      tiles: tiles, playlists: lists, music: A.musicNow(), hints: A.heardHints(Object.keys(paths))
    };
  }
  function lengthText(secs) { return (WV.LENGTHS.concat(WV.GIF_LENGTHS).filter(function (o) { return o[0] === secs; })[0] || [0, secs + ' s'])[1]; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function refresh() {
    var r = gather(), secs = +$('#wvSecs').value, lists = Object.keys(r.playlists).length;
    $('#wvSub').textContent = plural(r.tiles.length, 'tile', 'tiles') + (lists ? ', ' + plural(lists, 'playlist', 'playlists') : '');
    if (gif) {
      var g = WV.gifSize(r.wall.w, r.wall.h, +$('#wvWidth').value), fps = +$('#wvFps').value, bytes = GM.estimate(secs, fps, g.w, g.h);
      $('#wvNote').textContent = g.w + ' × ' + g.h + ' px, ' + lengthText(secs) + ', ' + fps + ' frames a second, about ' + U.bytes(bytes) +
        '. No sound. Each tile carries on from where it is when you save, as on the wall.' +
        (bytes > 20 * 1024 * 1024 ? ' GIFs get big: a shorter length, a smaller width or fewer frames make a smaller file.' : '');
      return;
    }
    var o = WV.outSize(r.wall.w, r.wall.h, +$('#wvSize').value), heard = r.tiles.filter(function (t) { return t.vol > 0; }).length;
    var sound = heard ? 'the sound of ' + plural(heard, 'tile', 'tiles') + (r.music ? ' and the music' : '') : r.music ? 'the music' : 'no sound';
    var note = o.w + ' × ' + o.h + ' px, ' + lengthText(secs) + ', with ' + sound + '. Each tile carries on from where it is when you save, as on the wall.';
    if (secs * o.w * o.h > 120 * 1920 * 1080) note += ' A long or big video takes a while to make; the bar shows how far it has got.';
    $('#wvNote').textContent = note;
  }

  // asGif: the GIF of the wall (Saved walls › Save as a GIF…, and the right-click menu in wall mode).
  A.openWallVideo = function (asGif) {
    asGif = asGif === true;
    if (!A.hasFfmpeg) { A.toast('Saving the wall as a ' + (asGif ? 'GIF' : 'video') + ' needs FFmpeg, which this Wallpane does not have.'); return; }
    if (!gather().tiles.length) { A.toast('Put some media on the wall first.'); return; }
    A.closePops();
    setMode(asGif);
    box.hidden = false;
    refresh();
    $(asGif ? '#wvWidth' : '#wvSize').focus();
  };
  function close() { box.hidden = true; }
  box.addEventListener('change', refresh);
  $('#wvClose').addEventListener('click', close);
  $('#wvCancel').addEventListener('click', close);
  window.addEventListener('keydown', function (e) {
    if (!box.hidden && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);
  $('#wallVideoBtn').addEventListener('click', function () { A.openWallVideo(false); });
  $('#wallGifBtn').addEventListener('click', function () { A.openWallVideo(true); });

  // A screenshot of the wall as it shows now, at the screen's resolution. For the moment it is taken only the media
  // shows (body.shot: no selection, tile controls, empty cells, nor anything over the wall); then where to save it.
  function frame() { return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(ok); }); }); }
  A.wallShot = function () {
    A.closePops();
    document.body.classList.add('shot');
    frame().then(function () {
      var r = wall.getBoundingClientRect();
      return api.wallShot({ x: r.left, y: r.top, w: r.width, h: r.height });
    }).then(function (got) {
      document.body.classList.remove('shot');
      if (!got) { A.toast('The screenshot could not be taken.'); return null; }
      return api.saveWallShot();
    }, function () {
      document.body.classList.remove('shot');
      A.toast('The screenshot could not be taken.');
      return null;
    }).then(function (res) {
      if (!res || res.status === 'cancelled') return;
      if (res.status !== 'saved') { A.toast('The screenshot could not be saved there.'); return; }
      A.toast('Saved ' + U.baseName(res.path) + ' (' + U.bytes(res.bytes) + ').', [
        { label: 'Show in Explorer', act: function () { api.revealFile(res.path); } }
      ]);
    });
  };
  $('#shotBtn').addEventListener('click', A.wallShot);

  // The wall as it is at this moment goes to the main process.
  $('#wvMake').addEventListener('click', function () {
    var r = gather(), what = gif ? 'GIF' : 'video';
    close();
    if (!r.tiles.length) return;
    r.secs = +$('#wvSecs').value;
    if (gif) { r.format = 'gif'; r.width = +$('#wvWidth').value; r.fps = +$('#wvFps').value; } else r.size = +$('#wvSize').value;
    api.wallVideo(r).then(function (res) {
      if (res.status === 'cancelled') return;
      if (res.status !== 'working') { A.toast('The ' + what + ' could not be made: FFmpeg is missing, or the wall could not be read.'); return; }
      // In wall mode the bar is hidden; a message says when it is saved all the same.
      A.toast('Saving the wall as a ' + what + '. ' + (document.body.classList.contains('clean') ? 'A message says when it is saved.' : 'The bar shows how far it has got.'));
      A.watchJob(res.key, function (j) {
        if (j.state === 'failed') { A.toast('The ' + what + ' could not be made: ' + j.error); return; }
        if (j.state !== 'done' || !j.result) return;
        var p = j.result.path;
        A.toast('Saved ' + j.label + (j.result.bytes ? ' (' + U.bytes(j.result.bytes) + ')' : '') + '.', [
          { label: 'Show in Explorer', act: function () { api.revealFile(p); } }
        ]);
      });
    });
  });
})(window.MW.app);
