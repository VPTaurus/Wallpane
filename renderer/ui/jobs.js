// Background work in the page: Settings › Storage, which shows and limits the cache that jobs fill (playable copies,
// thumbnails, previews, lighter copies). The jobs themselves run in the main process (lib/jobs.js).
(function (A) {
  'use strict';
  if (!A) return;
  var U = window.MW.util;
  var $ = A.$, api = A.api;
  var KIND_NAMES = { converted: 'Playable copies', thumbs: 'Thumbnails', previews: 'Previews', proxies: 'Lighter copies' };

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
