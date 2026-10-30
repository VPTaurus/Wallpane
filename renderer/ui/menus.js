// Right-click menus: on a tile (its media and what to do with it), and on empty wall (add media or a new tile there).
(function (A) {
  'use strict';
  if (!A) return;
  var MW = window.MW, G = MW.geo, V = MW.view;
  var S = A.S, ICON = A.ICON, wall = A.wall;

  var menu = document.createElement('div');
  menu.className = 'pop menu ctx';
  menu.id = 'ctxMenu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);

  // items: { label, hint, icon, act, disabled, danger }, or '-' for a dividing line.
  A.showMenu = function (x, y, items) {
    A.closePops();
    menu.innerHTML = '';
    items.forEach(function (m) {
      if (m === '-') {
        if (menu.lastChild && menu.lastChild.tagName !== 'HR') { var hr = document.createElement('hr'); hr.className = 'div'; menu.appendChild(hr); }
        return;
      }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mi' + (m.danger ? ' danger' : ''); b.disabled = !!m.disabled;
      b.setAttribute('role', 'menuitem');
      b.innerHTML = '<span class="ic" aria-hidden="true">' + (ICON[m.icon] || '') + '</span><span><b></b>' + (m.hint ? '<small></small>' : '') + '</span>';
      b.querySelector('b').textContent = m.label;
      if (m.hint) b.querySelector('small').textContent = m.hint;
      b.addEventListener('click', function () { A.hideMenu(); m.act(); });
      menu.appendChild(b);
    });
    if (menu.lastChild && menu.lastChild.tagName === 'HR') menu.lastChild.remove();
    menu.hidden = false;
    var r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    var first = menu.querySelector('.mi:not(:disabled)');
    if (first) first.focus();
  };
  A.hideMenu = function () { menu.hidden = true; };
  A.menuOpen = function () { return !menu.hidden; };
  document.addEventListener('pointerdown', function (e) { if (!menu.hidden && !menu.contains(e.target)) A.hideMenu(); }, true);
  window.addEventListener('blur', A.hideMenu);
  window.addEventListener('resize', A.hideMenu);
  // Up and down arrows move through the items.
  menu.addEventListener('keydown', function (e) {
    var list = Array.prototype.slice.call(menu.querySelectorAll('.mi:not(:disabled)')), i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      var n = list.length;
      if (n) list[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].focus();
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); A.hideMenu(); }
  });

  function tileMenu(it, x, y) {
    var media = A.hasMedia(it), items = [];
    if (it.kind === 'empty') {
      items.push({ label: 'Choose media…', icon: 'file', act: function () { A.chooseMedia(it); } },
        { label: 'Play a folder here…', hint: 'This tile plays its files in turn', icon: 'folder', act: function () { A.ownFolder(it); } });
    }
    if (media) {
      items.push({ label: 'Reposition and zoom', hint: 'Drag the media; scroll to zoom', icon: 'move', act: function () { A.startRepos(it); } });
      if (!V.isDefault(it)) items.push({ label: 'Reset position and zoom', icon: 'reset', act: function () { A.resetView(it); } });
      items.push({ label: it.fit === 'cover' ? 'Show the whole frame' : 'Fill the tile', icon: 'fit', act: function () { it.fit = it.fit === 'cover' ? 'contain' : 'cover'; it.fitSet = true; A.render(); A.refreshInspector(); } },
        { label: 'Fit tile to media', hint: 'No bars, nothing cropped', icon: 'fit', act: function () { A.fitTilesToMedia([it]); } });
    }
    items.push('-');
    if (media && it.kind === 'video') {
      items.push({ label: it.muted ? 'Sound on' : 'Sound off', icon: it.muted ? 'vol' : 'mute', act: function () { it.muted = !it.muted; A.render(); A.refreshInspector(); } });
      if (!it.pl) items.push({ label: it.loop ? 'Play once' : 'Loop', icon: 'loop', act: function () { it.loop = !it.loop; A.render(); A.refreshInspector(); } });
      if (!it.pl && MW.play.hasLoop(it)) items.push({ label: 'Stop looping the part', hint: MW.play.fmtTime(it.loopA || 0, true) + ' to ' + (it.loopB == null ? 'the end' : MW.play.fmtTime(it.loopB, true)), icon: 'loop', act: function () { A.setLoop(it, null, null); } });
      else if (!it.pl) items.push({ label: 'Loop a part…', hint: 'Speed, volume and loop in Properties', icon: 'loop', act: function () { A.openProps(it, '#pbSec'); } });
      if (A.hasFfmpeg && it.path) items.push({ label: 'Make playable', hint: 'A converted copy, for a video that plays badly or not at all', icon: 'wand', act: function () { A.makePlayable(it); } });
    }
    if (it.pl && S.playlists[it.pl]) {
      items.push({ label: 'Previous file', icon: 'prev', disabled: !!it.pinned || !(it._back && it._back.length), act: function () { A.goBack(it); } },
        { label: 'Next file', icon: 'next', disabled: !!it.pinned, act: function () { A.advance(it); } },
        { label: it.pinned ? 'Let the playlist continue' : 'Pin this file', icon: 'pin', act: function () { A.setPinned(it, !it.pinned); } },
        { label: 'Playlist settings…', hint: 'Order, timing, crossfade for this folder', icon: 'playlist', act: function () { A.openProps(it, '#plSec'); } });
    }
    items.push('-');
    if (it.missing) items.push({ label: 'Locate file…', icon: 'file', act: function () { A.relinkOne(it); } });
    else if (it.kind !== 'empty') items.push({ label: 'Replace media…', icon: 'file', act: function () { A.chooseMedia(it); } });
    if (it.kind !== 'empty') items.push({ label: 'Own folder…', hint: 'This tile plays a folder of its own', icon: 'folder', act: function () { A.ownFolder(it); } });
    if (it.path && !it.missing) items.push({ label: 'Show in folder', icon: 'folder', act: function () { A.api.revealFile(it.path); } });
    items.push('-',
      { label: 'Duplicate', icon: 'copy', act: function () { A.duplicateTile(it); } },
      { label: 'Split side by side', icon: 'splitv', disabled: !A.canSplit(it, 'v'), act: function () { A.splitTile(it, 'v'); } },
      { label: 'Split top and bottom', icon: 'splith', disabled: !A.canSplit(it, 'h'), act: function () { A.splitTile(it, 'h'); } },
      '-',
      { label: 'Properties…', hint: 'Exact position and size · Alt+Enter', icon: 'sliders', act: function () { A.openProps(it); } },
      { label: 'Remove from wall', icon: 'trash', danger: true, act: function () { A.removeItem(it.id); } });
    A.showMenu(x, y, items);
  }

  function wallMenu(e) {
    var target;
    if (S.mode === 'free') target = { x: e.clientX, y: e.clientY, free: true };
    else {
      var slot = e.target.closest('.slot');
      target = slot ? { col: +slot.dataset.col, row: +slot.dataset.row } : A.cellAt(e.clientX, e.clientY);
      if (G.itemAt(S.items, target.col, target.row)) target = null;   // between tiles: no particular cell
    }
    A.showMenu(e.clientX, e.clientY, [
      { label: 'Add media here…', icon: 'file', act: function () { A.api.openFiles(true).then(function (res) { if (A.picked(res)) A.addFiles(res, target); }); } },
      { label: 'Add a folder here…', hint: 'A tile for each file', icon: 'folder', act: function () { A.api.openFolder().then(function (res) { if (A.picked(res)) A.addFiles(res, target); }); } },
      { label: 'New empty tile', hint: 'Size it first, add media later', icon: 'tile', act: function () { A.newEmptyTile(target); } }
    ]);
  }

  wall.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (document.body.classList.contains('clean')) {
      A.showMenu(e.clientX, e.clientY, [{ label: 'Exit wall mode', hint: 'Esc or F11', icon: 'tv', act: function () { A.setClean(false); } }]);
      return;
    }
    var t = e.target.closest('.tile');
    var it = t && !t._dead ? A.itemById(+t.dataset.id) : null;
    if (it) { A.select(it.id); tileMenu(it, e.clientX, e.clientY); }
    else wallMenu(e);
  });
})(window.MW.app);
