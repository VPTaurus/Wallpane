// Background work in the page: the jobs indicator in the bar with its list (progress, cancel), and Settings › Storage,
// which shows and limits the cache the jobs fill (playable copies, thumbnails, previews, lighter copies). The jobs
// themselves run in the main process (lib/jobs.js); tiles that wait for one follow it in ui/playable.js.
(function (A) {
  'use strict';
  if (!A) return;
  var U = window.MW.util;
  var $ = A.$, api = A.api;
  var KIND_NAMES = { converted: 'Playable copies', thumbs: 'Thumbnails', previews: 'Previews', proxies: 'Lighter copies' };

  /* ---------- jobs in the bar ---------- */
  var JOB_WORDS = { playable: 'Making playable', gifvideo: 'GIF to video', libinfo: 'Reading file details', libthumbs: 'Making thumbnails' };
  var STATE_WORDS = { queued: 'Waiting', done: 'Done', failed: 'Failed', cancelled: 'Stopped' };
  var jobList = [];
  function active(j) { return j.state === 'queued' || j.state === 'running'; }
  // The indicator: there while something runs, waits or failed; it counts the jobs still to do.
  function showJobs(list) {
    jobList = list;
    var todo = list.filter(active), failed = list.some(function (j) { return j.state === 'failed'; }), wrap = $('#jobsWrap');
    var shown = !!(todo.length || failed);
    if (wrap.hidden === shown) { wrap.hidden = !shown; A.fitBar(); }
    if (!shown && !$('#popJ').hidden) A.closePops();
    $('#jobsCount').textContent = todo.length ? String(todo.length) : '!';
    $('#jobsBtn').classList.toggle('busy', list.some(function (j) { return j.state === 'running'; }));
    $('#jobsBtn').classList.toggle('bad', failed && !todo.length);
    $('#jobsBtn').title = todo.length ? 'Background work: ' + todo.length + (todo.length === 1 ? ' job' : ' jobs') + ' to do' : 'Background work: something failed';
    if (!$('#popJ').hidden) A.refreshJobs();
  }
  A.refreshJobs = function () {
    var box = $('#jobsList');
    box.innerHTML = '';
    if (!jobList.length) box.innerHTML = '<p class="note">Nothing to do.</p>';
    jobList.slice().reverse().forEach(function (j) {
      var row = document.createElement('div');
      row.className = 'jrow ' + j.state;
      row.innerHTML = '<div class="jtext"><b></b><small></small></div>' + (active(j) ? '<button class="btn ib" type="button" aria-label="Stop" title="Stop">' + A.ICON.x + '</button>' : '') +
        (j.state === 'running' ? '<span class="bbar"><i></i></span>' : '');
      row.querySelector('b').textContent = j.label;
      row.querySelector('small').textContent = (JOB_WORDS[j.kind] || j.kind) + ' · ' +
        (j.state === 'running' ? Math.round(j.progress * 100) + ' %' : STATE_WORDS[j.state]) + (j.error ? ': ' + j.error : '');
      if (j.state === 'running') row.querySelector('.bbar i').style.width = Math.round(j.progress * 100) + '%';
      var stop = row.querySelector('button');
      if (stop) stop.addEventListener('click', function () { api.cancelJob(j.id); });
      box.appendChild(row);
    });
    $('#jobsClear').disabled = !jobList.some(function (j) { return !active(j); });
  };
  $('#jobsClear').addEventListener('click', function () { api.clearJobs(); });
  function onJobs(list) { showJobs(list); A.onJobsChanged(list); }
  api.onJobs(onJobs);
  api.jobs().then(onJobs);

  /* ---------- Settings › Storage ---------- */
  function showStorage(i) {
    var limit = i.limitGB * 1e9;
    $('#cacheTotal').textContent = U.bytes(i.total);
    $('#cacheOf').textContent = 'of ' + i.limitGB + ' GB';
    $('#cacheBar').style.width = Math.min(100, i.total / limit * 100).toFixed(1) + '%';
    $('#cacheLimit').value = String(i.limitGB);
    $('#cacheDir').textContent = i.dir;
    var dl = $('#cacheKinds');
    dl.innerHTML = '';
    Object.keys(KIND_NAMES).forEach(function (k) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = KIND_NAMES[k]; dd.textContent = U.bytes(i.byKind[k] || 0);
      dl.appendChild(dt); dl.appendChild(dd);
    });
    $('#cacheClear').disabled = !i.total;
  }
  A.refreshStorage = function () { api.cacheInfo().then(showStorage); };
  $('#cacheLimit').addEventListener('change', function () { api.setCacheLimit(+this.value).then(showStorage); });
  $('#cacheReveal').addEventListener('click', function () { api.revealCache(); });
  // Clear takes two clicks, like Clear wall: the first arms it for three seconds.
  var armed = false, disarm = 0;
  $('#cacheClear').addEventListener('click', function () {
    var b = this, lbl = b.querySelector('.lbl');
    if (!armed) {
      armed = true; lbl.textContent = 'Click again to clear'; b.classList.add('armed');
      disarm = setTimeout(function () { armed = false; lbl.textContent = 'Clear'; b.classList.remove('armed'); }, 3000);
      return;
    }
    clearTimeout(disarm); armed = false; lbl.textContent = 'Clear'; b.classList.remove('armed');
    api.clearCache().then(function (i) { showStorage(i); A.toast('The cache is empty. Anything it held is made again when needed.'); });
  });
})(window.MW.app);
