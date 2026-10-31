// Make playable, on the wall. Before a video tile plays, it asks the main process whether its file plays as it is
// (media:ensurePlayable). A copy made earlier plays at once; otherwise the tile shows the job making one ("Making it
// playable… 45 %") and switches to the copy when it is done. Saved walls keep the original file; next time its copy
// is found in the cache. A playlist tile does not wait: after a few seconds it moves on, and plays that file once its
// copy is there. A video that fails to play although it looked fine is converted too (once).
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, U = MW.util, F = MW.formats;
  var S = A.S, $ = A.$, api = A.api;
  var known = {};    // file path -> the url to play it from, once known (its copy, or the file itself)
  var forced = {};   // file paths already converted because they did not play
  var jobsNow = [];
  A.hasFfmpeg = false;
  var ready = api.appInfo().then(function (i) { A.hasFfmpeg = !!i.ffmpeg; });   // checks wait for this answer

  // The url a new video element starts with: its copy or the file once known; the file itself when its kind
  // normally plays; nothing for AVI, WMV and the like until their copy is there.
  A.playableSrc = function (it) {
    if (it._small && S.proxies !== 'off' && proxies[it.path]) return proxies[it.path];   // a small tile: its lighter copy
    return fullSrc(it);
  };
  function fullSrc(it) {
    if (known[it.path]) return known[it.path];
    return it.path && F.convertible(it.path) ? null : it.url;
  }

  function busyEl(it, make) {
    var el = A.tileEls.get(it.id);
    if (!el) return null;
    var b = el.querySelector('.busy');
    if (!b && make) {
      b = document.createElement('div');
      b.className = 'busy';
      b.innerHTML = '<b></b><small></small><span class="bbar"><i></i></span>';
      el.appendChild(b);
    }
    return b;
  }
  // o: { text, hint, progress (0..1 or null), failed } or null to take it away.
  function setBusy(it, o) {
    var b = busyEl(it, !!o);
    if (!o) { if (b) b.remove(); return; }
    b.classList.toggle('failed', !!o.failed);
    b.querySelector('b').textContent = o.text;
    b.querySelector('small').textContent = o.hint || '';
    var bar = b.querySelector('.bbar');
    bar.hidden = o.progress == null;
    if (o.progress != null) bar.firstChild.style.width = Math.round(o.progress * 100) + '%';
  }
  function what(v, progress) {
    var p = progress ? ' ' + Math.round(progress * 100) + ' %' : '';
    if (v && v.action === 'remux') return 'Making it playable…' + p;
    if (v && v.action === 'audio') return 'Fixing the sound…' + p;
    return 'Converting it to play here…' + p;
  }
  // The tile plays this file from now on (its copy), from where it was if it was playing.
  function play(it, p) {
    var url = U.fileUrl(p), el = A.tileEls.get(it.id);
    known[it.path] = url;
    setBusy(it, null);
    if (!el || !el._media || el._media.tagName !== 'VIDEO' || el._media.getAttribute('src') === url) return;
    el.classList.remove('broken');
    el._media.src = url;
  }

  function apply(it, r) {
    if (!A.tileEls.get(it.id)) return;
    if (r.status === 'ok' || r.status === 'missing') {
      if (r.status === 'ok') known[it.path] = it.url;
      setBusy(it, null);
      var el = A.tileEls.get(it.id);
      if (r.status === 'ok' && el._media && !el._media.getAttribute('src')) el._media.src = it.url;
    } else if (r.status === 'ready') play(it, r.path);
    else if (r.status === 'working') {
      it._job = r.key; it._verdict = r.verdict;
      setBusy(it, { text: what(r.verdict), hint: r.verdict ? 'Because of ' + r.verdict.why + '. Your file stays as it is.' : '', progress: 0 });
      if (it.pl) skipLater(it);
      follow();
    } else if (r.status === 'needed') {
      setBusy(it, { text: 'This video needs converting to play here.', hint: 'Right-click it and choose Make playable.' });
    } else if (r.status === 'failed') {
      setBusy(it, { text: 'This video cannot be made playable.', hint: r.why, failed: true });
    }
  }
  // Ask once per file (and again with force when it did not play).
  A.checkPlayable = function (it, force) {
    if (!it.path || it.missing || it.sample || it.kind !== 'video') return;
    if (known[it.path] && !force) return;
    ready.then(function () {
      if (!A.hasFfmpeg) {
        if (F.convertible(it.path)) setBusy(it, { text: 'This video does not play here.', hint: 'Convert it to MP4, then add it again.', failed: true });
        return;
      }
      return api.ensurePlayable(it.path, { auto: S.autoConvert, force: !!force, background: !!it.pl && !force }).then(function (r) { apply(it, r); });
    });
  };
  // A video that looked playable but failed: convert it after all (once per file).
  A.didNotPlay = function (it) {
    if (!A.hasFfmpeg || !it.path || forced[it.path]) return;
    forced[it.path] = true; delete known[it.path];
    A.checkPlayable(it, true);
  };
  // Right-click › Make playable: a copy even if the file looks playable.
  A.makePlayable = function (it) {
    forced[it.path] = true; delete known[it.path];
    A.checkPlayable(it, true);
  };

  // A playlist tile moves on while its file is being made playable.
  function skipLater(it) {
    var key = it._job, path = it.path;
    setTimeout(function () {
      if (it.pl && it.path === path && it._job === key && !known[path] && S.items.indexOf(it) > -1) A.advance(it);
    }, 3000);
  }
  // Jobs that tiles wait for: progress on the tile, and the copy when it is done.
  function follow() {
    S.items.forEach(function (it) {
      if (!it._job) return;
      var j = jobsNow.find(function (x) { return x.key === it._job; });
      if (!j) return;
      if (j.state === 'done') { it._job = null; if (j.result) play(it, j.result.path); }
      else if (j.state === 'failed') { it._job = null; setBusy(it, { text: 'This video cannot be made playable.', hint: j.error, failed: true }); }
      else if (j.state === 'cancelled') { it._job = null; setBusy(it, { text: 'Stopped before it could play.', hint: 'Right-click it and choose Make playable to try again.' }); }
      else setBusy(it, { text: what(it._verdict, j.progress) + (j.state === 'queued' ? ' (waiting)' : ''), hint: it._verdict ? 'Because of ' + it._verdict.why + '. Your file stays as it is.' : '', progress: j.progress });
    });
  }
  A.onJobsChanged = function (list) { jobsNow = list; follow(); followGifs(); followProxies(); };

  /* ---------- lighter copies for small tiles ---------- */
  // A video much bigger than its tile plays from a lighter copy (lib/playable.js proxyKind: made once in the background,
  // kept in the cache), from the same moment; when the tile grows, or plays alone full screen, it goes back to the
  // original. Settings › General can turn this off. Sizes are in screen pixels, so a scaled display counts right.
  var proxies = {}, proxyJobs = {}, proxyBad = {}, bigOf = {};   // path -> copy url; job key -> path; failed; original's long side
  var BIG = 1440, SMALL = 960, LEAVE = 1100;   // originals from BIG on; tiles up to SMALL take the copy, over LEAVE leave it
  function tileLong(el) {
    var r = el.getBoundingClientRect();
    return Math.max(r.width, r.height) * (window.devicePixelRatio || 1);
  }
  // Swaps the element's source, carrying on from the same moment, playing or paused as it was (pause() also stops
  // autoplay starting it). A video that has not started yet is about to play by itself, unless a swap held it before.
  // m._swap tells the tile's own loadedmetadata (where it starts, a playlist's clip) that this is the same video.
  function swapSrc(m, url) {
    if (!url || m.getAttribute('src') === url) return;
    var t = m.currentTime, playing = !m.paused || (m.autoplay && !m.played.length && !m._held);
    m._held = !playing; m._swap = true;
    m.src = url;
    m.addEventListener('loadedmetadata', function () {
      m._swap = false;
      try { m.currentTime = t; } catch (e) { /* from the start then */ }
      if (playing) m.play().catch(function () {}); else m.pause();
    }, { once: true });
  }
  // A lighter copy that does not play: back to the original, and no copy for this file again. True when it was one.
  A.proxyFailed = function (it, m) {
    var copy = it.path && proxies[it.path];
    if (!copy || m.getAttribute('src') !== copy) return false;
    proxyBad[it.path] = true; delete proxies[it.path]; it._small = false;
    swapSrc(m, fullSrc(it));
    return true;
  };
  A.checkProxy = function (it) {
    var el = A.tileEls.get(it.id), m = el && el._media;
    if (!m || m.tagName !== 'VIDEO' || it.kind !== 'video' || !it.path) return;
    var copy = proxies[it.path], using = !!copy && m.getAttribute('src') === copy;
    if (!using && m.videoWidth) bigOf[it.path] = Math.max(m.videoWidth, m.videoHeight);
    var want = S.proxies !== 'off' && A.hasFfmpeg && (bigOf[it.path] || 0) >= BIG && A.soloId !== it.id && tileLong(el) <= (using ? LEAVE : SMALL);
    it._small = want;
    if (!want) { if (using) swapSrc(m, fullSrc(it)); return; }
    if (using) return;
    if (copy) { swapSrc(m, copy); return; }
    if (proxyBad[it.path] || Object.keys(proxyJobs).some(function (k) { return proxyJobs[k] === it.path; })) return;
    api.mediaProxy(it.path).then(function (r) {
      if (r.status === 'ready') { proxies[it.path] = U.fileUrl(r.path); A.checkProxy(it); }
      else if (r.status === 'working') proxyJobs[r.key] = it.path;
      else proxyBad[it.path] = true;
    });
  };
  // Every video tile, a moment after the wall changed (tiles moved or resized, the window resized, full screen).
  var proxyTimer = 0;
  A.checkProxiesLater = function () {
    clearTimeout(proxyTimer);
    proxyTimer = setTimeout(function () { S.items.forEach(function (it) { if (it.kind === 'video') A.checkProxy(it); }); }, 600);
  };
  window.addEventListener('resize', A.checkProxiesLater);
  // A copy still waiting for a file no small tile shows any more (a playlist moved on) is not made after all.
  function followProxies() {
    Object.keys(proxyJobs).forEach(function (key) {
      var j = jobsNow.find(function (x) { return x.key === key; }), p = proxyJobs[key];
      if (j && j.state === 'queued' && !S.items.some(function (it) { return it.path === p && it._small; })) {
        delete proxyJobs[key]; api.cancelJob(j.id); return;
      }
      if (!j || j.state === 'queued' || j.state === 'running') return;
      delete proxyJobs[key];
      if (j.state === 'done' && j.result) proxies[p] = U.fileUrl(j.result.path); else proxyBad[p] = true;
      S.items.forEach(function (it) { if (it.path === p) A.checkProxy(it); });
    });
  }

  /* ---------- even loudness ---------- */
  // Each video on the wall is measured once (lib/loudness.js), and one louder than TARGET plays that much quieter, so a
  // loud clip beside a quiet one sounds alike when unmuted. Only ever quieter: a page cannot play a video louder than
  // it is, so a quiet one keeps its own level. On top of the tile's own volume. Settings › General can turn it off.
  var levels = {}, TARGET = -18;   // path -> its loudness in LUFS (null: no sound, or not measured)
  A.levelOf = function (it) {
    var l = S.evenLoud ? levels[it.path] : null;
    return l == null || l <= TARGET ? 1 : Math.pow(10, (TARGET - l) / 20);
  };
  function heard(m) {
    var changed = Object.keys(m || {}).filter(function (p) { var was = levels[p]; levels[p] = m[p]; return was !== m[p]; });
    if (changed.length && S.items.some(function (it) { return changed.indexOf(it.path) > -1; })) A.render();
  }
  api.onLoudness(heard);
  $('#setEvenLoud').addEventListener('change', function () { S.evenLoud = this.checked; A.savePrefs(); A.render(); });

  /* ---------- black or silent openings ---------- */
  // Each video on the wall is looked at once (lib/openings.js): a tile starts it after a black opening, or after a
  // silent one while it is heard, also when it loops (not a playlist with a random start, nor a tile with a looped
  // part, which start where they say). Settings › General can turn it off.
  var openings = {};   // path -> { black, silence } (where each opening ends, in seconds), or null
  // Where this tile's video m starts: 0 when there is no opening, it is off, or the opening is over a third of the
  // video (then it is the video).
  A.openingOf = function (it, m) {
    var o = S.skipOpen && openings[it.path];
    if (!o) return 0;
    var s = Math.max(o.black || 0, m && !m.muted ? o.silence || 0 : 0);
    return s >= 0.3 && !(m && isFinite(m.duration) && s > m.duration / 3) ? s : 0;
  };
  function opened(m) {
    var paths = Object.keys(m || {});
    paths.forEach(function (p) { openings[p] = m[p]; });
    // A tile already playing its opening moves on to its start.
    S.items.forEach(function (it) {
      var v = paths.indexOf(it.path) > -1 && A.videoOf(it), p = it.pl && S.playlists[it.pl];
      if (!v || it.loopA || (p && (p.randomStart || it.pinned))) return;
      var s = A.openingOf(it, v);
      if (s && v.currentTime < s - 0.25) { v.currentTime = s; if (p) it._t0 = s; }
    });
    if (paths.length) A.render();
  }
  api.onOpenings(opened);
  $('#setSkipOpen').addEventListener('change', function () { S.skipOpen = this.checked; A.savePrefs(); A.render(); });

  // The videos on the wall, a moment after it changed: their loudness and openings.
  var measureTimer = 0;
  A.measureLater = function () {
    clearTimeout(measureTimer);
    measureTimer = setTimeout(function () {
      var paths = S.items.filter(function (it) { return it.kind === 'video' && it.path && !it.missing; }).map(function (it) { return it.path; });
      if (S.evenLoud) api.loudness(paths).then(heard);
      if (S.skipOpen) api.openings(paths).then(opened);
    }, 600);
  };

  /* ---------- GIF to video ---------- */
  // A GIF over the size chosen in Settings gets a video copy in the background, and plays from it once it is made.
  var gifs = {}, gifJobs = {}, gifBad = {};   // GIF path -> its copy's url; job key -> GIF path; copies that failed
  var GIF_MIN = { off: Infinity, '2': 2e6, '10': 10e6, all: 0 };
  A.gifVideoUrl = function (it) { return (it.kind === 'image' && it.path && gifs[it.path]) || null; };
  A.checkGif = function (it) {
    if (it.kind !== 'image' || !it.path || !/\.gif$/i.test(it.path) || it.missing || it.sample || gifs[it.path] || gifBad[it.path]) return;
    var min = GIF_MIN[S.gifVideo];
    if (min === undefined || min === Infinity) return;
    ready.then(function () {
      if (!A.hasFfmpeg) return;
      return api.gifVideo(it.path, min).then(function (r) {
        if (r.status === 'ready') useGif(it.path, r.path);
        else if (r.status === 'working') { gifJobs[r.key] = it.path; followGifs(); }
      });
    });
  };
  // Tiles showing this GIF are rebuilt to play the copy.
  function useGif(p, copy) {
    gifs[p] = U.fileUrl(copy);
    S.items.forEach(function (it) {
      var el = A.tileEls.get(it.id);
      if (it.path === p && it.kind === 'image' && el && el._media && el._media.tagName === 'IMG') A.removeTileEl(it.id);
    });
    A.render();
  }
  // A copy that does not play: back to the GIF itself, for good.
  A.gifVideoFailed = function (it) {
    gifBad[it.path] = true; delete gifs[it.path];
    A.removeTileEl(it.id); A.render();
  };
  function followGifs() {
    Object.keys(gifJobs).forEach(function (key) {
      var j = jobsNow.find(function (x) { return x.key === key; });
      if (!j || j.state === 'queued' || j.state === 'running') return;
      var p = gifJobs[key];
      delete gifJobs[key];
      if (j.state === 'done' && j.result) useGif(p, j.result.path);
    });
  }
  $('#setGifVideo').addEventListener('change', function () { S.gifVideo = this.value; A.savePrefs(); });
  $('#setProxies').addEventListener('change', function () { S.proxies = this.value; A.savePrefs(); A.checkProxiesLater(); });

  // Settings › General: convert on its own, or only when asked.
  $('#setConvert').addEventListener('change', function () { S.autoConvert = this.checked; A.savePrefs(); });
})(window.MW.app);
