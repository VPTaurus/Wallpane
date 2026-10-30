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
    if (known[it.path]) return known[it.path];
    return it.path && F.convertible(it.path) ? null : it.url;
  };

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
  A.onJobsChanged = function (list) { jobsNow = list; follow(); };

  // Settings › General: convert on its own, or only when asked.
  $('#setConvert').addEventListener('change', function () { S.autoConvert = this.checked; A.savePrefs(); });
})(window.MW.app);
