// The library in the page. So far Settings › Library: the library folders, with how many files each holds, whether
// it is there and whether it is being looked through, and Add folder…, Look again and Remove (two clicks). The
// library itself (lib/library.js) and its folders (lib/libraryfolders.js) live in the main process.
(function (A) {
  'use strict';
  if (!A) return;
  var $ = A.$, api = A.api;

  function count(n, one, many) { return n.toLocaleString('en') + ' ' + (n === 1 ? one : many); }
  function nameOf(p) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }
  function status(f) {
    if (f.scanning) return 'Looking through it…';
    if (f.available === false) return 'Not found. Is its drive connected? Its ' + count(f.files, 'file stays', 'files stay') + ' in the library meanwhile.';
    return count(f.files, 'file', 'files') + (f.pending ? ' · reading the details of ' + f.pending.toLocaleString('en') : '');
  }

  // Remove takes two clicks: the first arms it for three seconds. Kept here, as the list is drawn again often.
  var armed = null, disarm = 0;
  function show(list) {
    var box = $('#libFolders');
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="note">No folders yet. Add the folders where you keep your videos, GIFs and pictures.</p>'; return; }
    list.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'jrow lrow' + (f.available === false ? ' off' : '') + (f.scanning ? ' busy' : '');
      row.innerHTML = '<span class="ic" aria-hidden="true">' + A.ICON.folder + '</span><div class="jtext"><b></b><small class="lpath"></small><small class="lstat"></small></div>' +
        '<button class="btn warn" type="button"><span class="lbl"></span></button>';
      row.querySelector('b').textContent = nameOf(f.path);
      row.querySelector('.lpath').textContent = f.path;
      row.querySelector('.lstat').textContent = status(f);
      var b = row.querySelector('button'), on = armed === f.path;
      b.querySelector('.lbl').textContent = on ? 'Click again to remove' : 'Remove';
      b.classList.toggle('armed', on);
      b.title = 'Take ' + nameOf(f.path) + ' out of the library (its files stay where they are)';
      b.addEventListener('click', function () {
        clearTimeout(disarm);
        if (armed !== f.path) {
          armed = f.path;
          disarm = setTimeout(function () { armed = null; A.refreshLibrary(); }, 3000);
          show(list);
          return;
        }
        armed = null;
        api.removeLibraryFolder(f.path).then(function (n) {
          A.refreshLibrary();
          if (n >= 0) A.toast(nameOf(f.path) + ' is out of the library (' + count(n, 'file', 'files') + '). The files themselves are still there.');
        });
      });
      box.appendChild(row);
    });
  }
  A.refreshLibrary = function () { api.libraryFolders().then(show); };
  api.onLibrary(function () { if (!$('#popS').hidden && !$('#secLibrary').hidden) A.refreshLibrary(); });

  $('#libAdd').addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    api.addLibraryFolder().then(function (r) {
      b.disabled = false;
      if (!r) return;
      api.libraryFolders().then(function (list) {
        show(list);
        if (r.status === 'inside') { A.toast('That folder is in the library already, as part of ' + nameOf(r.path) + '.'); return; }
        if (r.status !== 'added') { A.toast('That folder is not there any more.'); return; }
        var f = list.filter(function (x) { return x.path === r.path; })[0];
        A.toast('Added ' + nameOf(r.path) + ': ' + count(f ? f.files : 0, 'video, GIF or picture', 'videos, GIFs and pictures') + '.' +
          (r.took.length ? ' It takes in ' + count(r.took.length, 'library folder', 'library folders') + ' inside it.' : ''));
      });
    }, function () { b.disabled = false; });
  });
  $('#libRescan').addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    api.rescanLibrary().then(function (list) { b.disabled = false; show(list); }, function () { b.disabled = false; });
  });
})(window.MW.app);
