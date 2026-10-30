// The library in the wall page:
// - Settings › Library: how the library shows, and the library folders, with Add folder…, Look again and Remove;
// - the browsing view (ui/libview.js) in this page, as a drawer over the wall or a panel beside it, or else the
//   library window (Library in the bar, Ctrl+L);
// - what its files do here: a drag carries their paths, and the wall takes them as it takes a drop from Explorer
//   (ui/media.js; Shift makes a tile play several in turn). Double-click, Enter or the menu put one file on the selected
//   tile, or files into the empty tiles; the library window sends those to the wall window used last.
// The library itself (lib/library.js), its folders (lib/libraryfolders.js) and thumbnails (lib/thumbs.js) live in the
// main process.
(function (A) {
  'use strict';
  if (!A) return;
  var $ = A.$, api = A.api, S = A.S, ICON = A.ICON;

  function count(n, one, many) { return n.toLocaleString('en') + ' ' + (n === 1 ? one : many); }
  function nameOf(p) { return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }
  function status(f) {
    if (f.scanning) return 'Looking through it…';
    if (f.available === false) return 'Not found. Is its drive connected? Its ' + count(f.files, 'file stays', 'files stay') + ' in the library meanwhile.';
    return count(f.files, 'file', 'files') + (f.pending ? ' · reading the details of ' + f.pending.toLocaleString('en') : '');
  }

  /* ---------- Settings › Library ---------- */
  // Remove takes two clicks: the first arms it for three seconds. Kept here, as the list is drawn again often.
  var armed = null, disarm = 0;
  function show(list) {
    var box = $('#libFolders');
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="note">No folders yet. Add the folders where you keep your videos, GIFs and pictures.</p>'; return; }
    list.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'jrow lrow' + (f.available === false ? ' off' : '') + (f.scanning ? ' busy' : '');
      row.innerHTML = '<span class="ic" aria-hidden="true">' + ICON.folder + '</span><div class="jtext"><b></b><small class="lpath"></small><small class="lstat"></small></div>' +
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

  /* ---------- to the wall ---------- */
  // One file goes on the selected tile; otherwise into the empty tiles, then new ones.
  function putOnWall(paths) {
    if (!paths.length) return;
    var it = A.selected();
    if (paths.length === 1 && it && !it.sample) { onTile(it, paths); return; }
    api.expand(paths).then(function (res) { A.addFiles(res, null); });
  }
  // One file shows on the tile; several play there in turn.
  function onTile(it, paths) {
    api.expand(paths).then(function (res) {
      var f = res.entries[0];
      if (!f) { A.toast(A.noMediaMessage(res)); return; }
      if (res.entries.length > 1) { res.title = count(res.entries.length, 'file', 'files') + ' from the library'; A.assignFolder(it, res); return; }
      A.pushHistory(); A.replaceMedia(it, f);
      if (it.pl) { it.pinned = true; it.loop = true; }
      A.render(); A.refreshInspector();
      A.toast(f.name + ' is on the selected tile now. Ctrl+Z undoes it.');
    });
  }
  api.onLibraryPut(putOnWall);   // from the library window

  /* ---------- the view here: a drawer or a panel ---------- */
  var root = $('#lib');
  A.libHost = {
    places: true,
    isOpen: function () { return !root.hidden; },
    put: putOnWall,
    menu: function (paths, x, y) {
      var n = paths.length, it = A.selected(), tile = it && !it.sample ? it : null;
      A.showMenu(x, y, [
        { label: n > 1 ? 'Put these ' + n + ' on the wall' : 'Put on the wall', icon: 'plus', hint: n === 1 && tile ? 'On the selected tile' : 'Into the empty tiles first, then new ones', act: function () { putOnWall(paths); } },
        { label: n > 1 ? 'Play them in turn on the selected tile' : 'Show on the selected tile', icon: n > 1 ? 'playlist' : 'tile', disabled: !tile, hint: tile ? '' : 'Select a tile on the wall first', act: function () { onTile(tile, paths); } },
        '-',
        { label: 'Show in Explorer', icon: 'folder', disabled: n !== 1, act: function () { api.revealFile(paths[0]); } }
      ]);
    },
    // The drawer fades and lets the drop through, so a tile under it can take it too; the panel covers nothing.
    dragOut: function (e, paths) {
      e.dataTransfer.setData(A.LIB_TYPE, JSON.stringify(paths));
      e.dataTransfer.effectAllowed = 'copy';
      A.libDrag = { n: paths.length };
      if (S.lib.place === 'drawer') setTimeout(function () { root.classList.add('out'); }, 0);
    },
    dragEnd: function () { root.classList.remove('out'); A.libDrag = null; },
    overSelf: function () { A.hideGhost(); A.wall.classList.remove('hot'); },
    close: function () { A.toggleLibrary(false); },
    placeMenu: function (x, y) {
      A.showMenu(x, y, Object.keys(PLACES).map(function (k) {
        return { label: PLACES[k][0], hint: S.lib.place === k ? 'Now · ' + PLACES[k][1] : PLACES[k][1], icon: PLACES[k][2], act: function () { A.setLibraryPlace(k); } };
      }).concat('-', ['left', 'right'].map(function (s) {
        return { label: s === 'left' ? 'On the left' : 'On the right', hint: S.lib.side === s ? 'Now' : '', icon: s === 'left' ? 'prev' : 'next', act: function () { A.setLibrarySide(s); } };
      })));
    }
  };

  // Opens or closes the library (on: true or false; nothing turns it round). The drawer or panel puts the cursor in
  // its search; in the window's place, the library window shows or hides.
  A.toggleLibrary = function (on) {
    if (S.lib.place === 'window') { api.openLibraryWindow(on === undefined ? null : !!on); return; }
    on = on === undefined ? root.hidden : !!on;
    if (on && document.body.classList.contains('clean')) return;
    var was = !root.hidden;
    root.hidden = !on;
    $('#libBtn').setAttribute('aria-pressed', String(on));
    if (S.lib.open !== on) { S.lib.open = on; A.savePrefs(); }
    if (on && !was) A.libView.show();
    if (on) $('#libSearch').focus();
  };
  $('#libBtn').addEventListener('click', function () { A.closePops(); A.toggleLibrary(); });
  api.onLibraryWindow(function (shown) { if (S.lib.place === 'window') $('#libBtn').setAttribute('aria-pressed', String(shown)); });

  // A drawer over the wall, a panel beside it (which makes the wall narrower), or a window of its own.
  var PLACES = {
    drawer: ['A drawer over the wall', 'Leaves the wall as it is', 'library'],
    panel: ['A panel beside the wall', 'Makes the wall narrower while it is open', 'panel'],
    window: ['A window of its own', 'For a second screen; drag files from it onto any wall', 'window']
  };
  A.setLibraryPlace = function (place) {
    if (!PLACES[place]) return;
    var was = S.lib.place, open = !root.hidden;
    S.lib.place = place;
    root.classList.toggle('panel', place === 'panel');
    $('#setLibPlace').value = place;
    if (place === 'window') {
      root.hidden = true;
      $('#libBtn').setAttribute('aria-pressed', 'false');
      if (open) api.openLibraryWindow(true);
    } else if (was === 'window') api.openLibraryWindow(false);
    S.lib.open = place !== 'window' && !root.hidden;
    A.savePrefs();
  };
  $('#setLibPlace').addEventListener('change', function () { A.setLibraryPlace(this.value); });
  // The drawer or the panel on the left of the wall, or on its right.
  A.setLibrarySide = function (side) {
    S.lib.side = side === 'right' ? 'right' : 'left';
    root.classList.toggle('right', S.lib.side === 'right');
    $('#setLibSide').value = S.lib.side;
    A.savePrefs();
  };
  $('#setLibSide').addEventListener('change', function () { A.setLibrarySide(this.value); });

  // After the saved settings are read: the library as it was left.
  A.initLibrary = function () {
    var open = S.lib.open;
    A.setLibrarySide(S.lib.side);
    A.setLibraryPlace(S.lib.place);
    if (open && S.lib.place !== 'window') A.toggleLibrary(true);
  };
})(window.MW.app);
