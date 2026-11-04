// Recording the wall live: the bar's Record button starts it and stops it (in wall mode, the right-click menu stops it).
// Each frame the tiles' videos and pictures are drawn into a canvas as each tile shows them, in its place: only the
// media, no selection, controls or pointer, and a tile leaving in a crossfade at its opacity; GIFs are decoded here, so
// they move (a canvas would draw a GIF's first frame only). The sound is what you hear
// from the wall: each video as loud as it plays now (its volume and even loudness; silent when muted or paused; fading
// in a crossfade), and the music. The browser's recorder makes an MP4 (H.264 and AAC) of it, sent a second at a time
// to the main process, which writes it as it comes and tidies it when it stops (lib/recfile.js). Then it is saved in the
// folder Settings › Recording chose, with the size, frames a second, quality and sound set there.
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, V = MW.view, WV = MW.wallvideo;
  var S = A.S, $ = A.$, api = A.api, wall = A.wall, btn = $('#recordBtn');
  var rec = null;   // the recording under way
  var SETTLE = 600;  // ms for the sound to flow before recording starts

  // The kinds of file the recorder can make here, best first.
  function kind(sound) {
    var list = sound ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=h264,opus', 'video/webm']
      : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=h264', 'video/webm'];
    return window.MediaRecorder ? list.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || null : null;
  }
  function sizeNow() { var r = wall.getBoundingClientRect(); return WV.recSize(r.width, r.height, window.devicePixelRatio, S.rec.size); }
  function clock(ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + (s % 60)).slice(-2);
  }

  // A GIF: a canvas draws only a picture's first frame, so while recording each GIF on the wall is decoded here (the
  // browser's ImageDecoder, the file's bytes from the main process) and goes from frame to frame with each frame's own
  // delay, round and round, as the wall plays it. Null until it is ready, or for a GIF of one frame (the picture then).
  function gifFrame(r, file) {
    var g = r.gifs.get(file);
    if (g === undefined) {
      r.gifs.set(file, null);
      if (window.ImageDecoder) {
        api.gifData(file).then(function (bytes) {
          if (!bytes || rec !== r) return null;
          var d = new ImageDecoder({ data: bytes, type: 'image/gif' });
          return d.tracks.ready.then(function () { return d.completed; }).then(function () {
            var t = d.tracks.selectedTrack, n = t ? t.frameCount : 0;
            if (rec !== r || n < 2) { d.close(); return; }
            r.gifs.set(file, { d: d, n: n, i: -1, frame: null, next: 0, busy: false });
          });
        }).catch(function () { /* drawn as the picture */ });
      }
      return null;
    }
    if (!g) return null;
    var now = performance.now();
    if (!g.busy && now >= g.next) {
      var i = (g.i + 1) % g.n;
      g.busy = true;
      g.d.decode({ frameIndex: i }).then(function (res) {
        g.busy = false;
        if (r.gifs.get(file) !== g) { res.image.close(); return; }
        if (g.frame) g.frame.close();
        g.frame = res.image; g.i = i;
        var ms = (res.image.duration || 0) / 1000;   // microseconds; 10 ms or less plays as 100, as in browsers
        g.next = performance.now() + (ms > 10 ? ms : 100);
      }, function () { g.busy = false; });
    }
    return g.frame;
  }

  // One frame: the wall's colour, then each tile's media as the tile shows it, in the wall's order. The wall keeps its
  // shape in the video: if it changes while recording (a tile full screen, the window resized), it is fitted in.
  function draw(r) {
    var c = r.ctx, wr = wall.getBoundingClientRect();
    c.globalAlpha = 1; c.fillStyle = r.bg; c.fillRect(0, 0, r.w, r.h);
    if (!(wr.width > 0 && wr.height > 0)) return;
    var k = Math.min(r.w / wr.width, r.h / wr.height), ox = (r.w - wr.width * k) / 2, oy = (r.h - wr.height * k) / 2;
    Array.prototype.forEach.call(wall.querySelectorAll('.tile'), function (el) {
      var m = el._media, it = A.itemById(+el.dataset.id);
      if (!m || !it || (m.tagName !== 'VIDEO' && m.tagName !== 'IMG')) return;
      if (m.tagName === 'IMG' && /\.gif$/i.test(it.path || '')) m = gifFrame(r, it.path) || m;
      var nw = m.displayWidth || m.videoWidth || m.naturalWidth, nh = m.displayHeight || m.videoHeight || m.naturalHeight, b = el.getBoundingClientRect();
      if (!nw || !nh || !(b.width >= 1 && b.height >= 1)) return;
      var p = V.placed(b.width, b.height, nw / nh, it.fit, V.of(it)), cr = p.crop, d = p.dest;
      if (!(d.w > 0 && d.h > 0)) return;
      c.globalAlpha = el.style.opacity !== '' || el.classList.contains('leaving') ? parseFloat(getComputedStyle(el).opacity) || 0 : 1;
      try {
        c.drawImage(m, cr.x * nw, cr.y * nh, cr.w * nw, cr.h * nh, ox + (b.left - wr.left + d.x) * k, oy + (b.top - wr.top + d.y) * k, d.w * k, d.h * k);
      } catch (e) { /* no frame yet */ }
    });
  }
  // The sound: each video on the wall and the music, captured from its element (before its volume, which applies here,
  // so a muted or quiet one sounds as it does in the room). An element whose file changes gets its new sound.
  function hear(r) {
    var a = r.audio;
    if (!a) return;
    var els = [];
    Array.prototype.forEach.call(wall.querySelectorAll('.tile'), function (el) { if (el._media && el._media.tagName === 'VIDEO') els.push(el._media); });
    if (A.musicEl) els.push(A.musicEl);
    els.forEach(function (m) {
      var n = a.nodes.get(m);
      if (!n) {
        n = { stream: null, track: null, src: null, gain: a.ctx.createGain() };
        n.gain.connect(a.dest);
        try { n.stream = m.captureStream(); } catch (e) { /* cannot be heard */ }
        a.nodes.set(m, n);
      }
      if (n.stream) n.stream.getVideoTracks().forEach(function (t) { t.stop(); });   // only its sound is wanted
      var t = n.stream && n.stream.getAudioTracks().filter(function (x) { return x.readyState === 'live'; })[0];
      if (t && t !== n.track) {
        if (n.src) n.src.disconnect();
        n.src = a.ctx.createMediaStreamSource(new MediaStream([t])); n.src.connect(n.gain); n.track = t;
      }
      n.gain.gain.value = m.muted || m.paused ? 0 : m.volume;
    });
    a.nodes.forEach(function (n, m) {
      if (els.indexOf(m) > -1) return;
      if (n.src) n.src.disconnect();
      n.gain.disconnect();
      a.nodes.delete(m);
    });
  }

  function start() {
    var o = S.rec, type = kind(o.sound), size = sizeNow();
    if (!type) { A.toast('Recording is not possible on this PC: Windows offers no way to record video here.'); return; }
    var canvas = document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    var ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingQuality = 'high';
    var stream = canvas.captureStream(o.fps), audio = null;
    if (o.sound) {
      var ac = new AudioContext({ sampleRate: 48000 }), dest = ac.createMediaStreamDestination();
      audio = { ctx: ac, dest: dest, nodes: new Map() };
      stream.addTrack(dest.stream.getAudioTracks()[0]);
    }
    var r = rec = {
      w: size.w, h: size.h, ctx: ctx, audio: audio, bg: A.wallColour(), started: Date.now(), writing: Promise.resolve(), failed: null, timer: 0, ticker: 0, gifs: new Map(),
      mr: new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: WV.recBitrate(size.w, size.h, o.fps, o.quality), audioBitsPerSecond: 192000 })
    };
    show();
    api.recStart({ ext: /webm/.test(type) ? 'webm' : 'mp4', dir: o.dir }).then(function (res) {
      if (rec !== r) { if (res && !res.error) api.recStop(); return; }   // stopped before it began: the empty file goes
      if (!res || res.error) { rec = null; finish(r); show(); A.toast('Recording could not start: ' + ((res && res.error) || 'the folder could not be written to') + '.'); return; }
      // Each second's video goes to the main process in turn; a write that fails (a full disk) stops the recording.
      r.mr.ondataavailable = function (e) {
        if (!e.data || !e.data.size) return;
        r.writing = r.writing.then(function () { return e.data.arrayBuffer(); }).then(function (b) { return api.recData(new Uint8Array(b)); }).then(function (w) {
          if (w && w.error && !r.failed) { r.failed = w.error; if (rec === r) stop(); }
        });
      };
      draw(r); hear(r);
      r.timer = setInterval(function () { draw(r); hear(r); }, 1000 / o.fps);
      // The sound takes a moment to flow, and the recorder would count it from its first sound: it starts once it flows,
      // so picture and sound keep in step.
      (r.audio ? r.audio.ctx.resume().then(function () { return new Promise(function (ok) { setTimeout(ok, SETTLE); }); }) : Promise.resolve()).then(function () {
        if (rec !== r) return;
        r.mr.start(1000);
        r.started = Date.now();
        r.ticker = setInterval(show, 500);
      });
    });
  }
  function finish(r) {
    clearInterval(r.timer); clearInterval(r.ticker);
    if (r.audio) r.audio.ctx.close().catch(function () {});
    r.audio = null;
    r.gifs.forEach(function (g) { if (g) { if (g.frame) g.frame.close(); g.d.close(); } });
    r.gifs.clear();
  }
  function stop() {
    var r = rec;
    if (!r) return;
    rec = null;
    show();
    var secs = (Date.now() - r.started) / 1000;
    r.mr.onstop = function () {
      finish(r);
      r.writing.then(function () { return api.recStop(); }).then(function (res) {
        if (!res || res.status !== 'saved') { A.toast(r.failed ? 'Recording stopped: ' + r.failed : 'Nothing was recorded.'); return; }
        var acts = [{ label: 'Show in Explorer', act: function () { api.revealFile(res.path); } }];
        if (r.failed) A.toast('Recording stopped early: ' + r.failed + ' What was recorded is in ' + U.baseName(res.path) + '.', acts);
        else A.toast('Saved ' + U.baseName(res.path) + ' (' + clock(secs * 1000) + ', ' + U.bytes(res.bytes) + ').', acts);
      });
    };
    if (r.mr.state !== 'inactive') r.mr.stop(); else r.mr.onstop();
  }

  A.recording = function () { return !!rec; };
  A.recordingTime = function () { return rec ? clock(Date.now() - rec.started) : ''; };
  A.toggleRecording = function () { if (rec) stop(); else { A.closePops(); start(); } };
  function show() {
    var on = !!rec, t = A.recordingTime();
    btn.classList.toggle('rec', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Stop recording' : 'Record the wall');
    btn.title = on ? 'Stop recording (' + t + ')' : 'Record: start recording the wall as it plays; click again to stop';
    $('#recTime').hidden = !on;
    $('#recTime').textContent = t;
  }
  btn.addEventListener('click', A.toggleRecording);

  /* ---------- Settings › Recording ---------- */
  function fill(sel, list) { sel.innerHTML = list.map(function (o) { return '<option value="' + o[0] + '">' + U.esc(o[1]) + '</option>'; }).join(''); }
  fill($('#setRecSize'), [[0, 'As on screen']].concat(WV.SIZES));
  fill($('#setRecFps'), WV.RATES.map(function (f) { return [f, String(f)]; }));
  fill($('#setRecQuality'), WV.QUALITIES);
  function note() {
    var s = sizeNow(), bps = WV.recBitrate(s.w, s.h, S.rec.fps, S.rec.quality);
    $('#recNote').textContent = 'For this wall: ' + s.w + ' × ' + s.h + ' px, about ' + U.bytes(bps / 8 * 60) + ' a minute.' + (rec ? ' A change applies to the next recording.' : '');
  }
  A.refreshRecording = function () {
    $('#setRecSize').value = String(S.rec.size);
    $('#setRecFps').value = String(S.rec.fps);
    $('#setRecQuality').value = S.rec.quality;
    $('#setRecSound').checked = S.rec.sound;
    api.recFolder(S.rec.dir).then(function (d) { $('#recDir').textContent = d; });
    note();
  };
  function set(key, v) { S.rec[key] = v; S.rec = WV.cleanRec(S.rec); A.savePrefs(); note(); }
  $('#setRecSize').addEventListener('change', function () { set('size', +this.value); });
  $('#setRecFps').addEventListener('change', function () { set('fps', +this.value); });
  $('#setRecQuality').addEventListener('change', function () { set('quality', this.value); });
  $('#setRecSound').addEventListener('change', function () { set('sound', this.checked); });
  $('#recDirBtn').addEventListener('click', function () {
    api.recChooseFolder(S.rec.dir).then(function (d) { if (d) { set('dir', d); A.refreshRecording(); } });
  });
  $('#recDirShow').addEventListener('click', function () { api.recOpenFolder(S.rec.dir); });
})(window.MW.app);
