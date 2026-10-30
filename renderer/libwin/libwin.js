// The library window (Settings › Library › Show the library as: a window of its own): the browsing view
// (ui/libview.js) on its own, for a second screen. What it needs from a page is set up here: the API, its settings
// (kept in libwin.json), a toast, a right-click menu, and the host. Files dragged out of it are real Windows file
// drags, so a wall window takes them as it takes a drop from Explorer; double-click, Enter and Put on the wall send them
// to the wall window used last. Closing it only hides it.
(function () {
  'use strict';
  var MW = window.MW, api = window.wall;
  if (!api) {
    document.body.innerHTML = '<p style="padding:24px;font:14px sans-serif">This page needs the Wallpane desktop app.</p>';
    return;
  }
  var $ = function (s) { return document.querySelector(s); };
  var toastEl = $('#toast'), toastTimer = 0;
  var A = MW.app = { api: api, $: $, S: { lib: null }, ICON: MW.icons, libDrag: null, hasFfmpeg: undefined };

  A.toast = function (msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4200);
  };
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; A.toast('Error: ' + ((r && r.message) || r)); });
  window.addEventListener('error', function (e) { A.toast('Error: ' + e.message); });
  var saveTimer = 0;
  A.savePrefs = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { api.storeSet('libwin', A.S.lib); }, 300);
  };

  /* ---------- a right-click menu: items { label, hint, icon, act, disabled }, or '-' for a line ---------- */
  var menu = document.createElement('div');
  menu.className = 'pop menu ctx';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);
  function hideMenu() { menu.hidden = true; }
  A.showMenu = function (x, y, items) {
    menu.innerHTML = '';
    items.forEach(function (m) {
      if (m === '-') { var hr = document.createElement('hr'); hr.className = 'div'; menu.appendChild(hr); return; }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mi'; b.disabled = !!m.disabled;
      b.setAttribute('role', 'menuitem');
      b.innerHTML = '<span class="ic" aria-hidden="true">' + (A.ICON[m.icon] || '') + '</span><span><b></b>' + (m.hint ? '<small></small>' : '') + '</span>';
      b.querySelector('b').textContent = m.label;
      if (m.hint) b.querySelector('small').textContent = m.hint;
      b.addEventListener('click', function () { hideMenu(); m.act(); });
      menu.appendChild(b);
    });
    menu.hidden = false;
    var r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    var first = menu.querySelector('.mi:not(:disabled)');
    if (first) first.focus();
  };
  document.addEventListener('pointerdown', function (e) { if (!menu.hidden && !menu.contains(e.target)) hideMenu(); }, true);
  menu.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); hideMenu(); } });
  window.addEventListener('blur', hideMenu);

  /* ---------- the host ---------- */
  A.libHost = {
    places: false,
    isOpen: function () { return !!A.S.lib; },
    put: function (paths) { if (paths.length) api.libraryToWall(paths); },
    // extra: the view's own items (collections).
    menu: function (paths, x, y, extra) {
      var n = paths.length;
      A.showMenu(x, y, [
        { label: n > 1 ? 'Put these ' + n + ' on the wall' : 'Put on the wall', icon: 'plus', hint: 'On the wall window used last', act: function () { api.libraryToWall(paths); } },
        '-',
        { label: 'Show in Explorer', icon: 'folder', disabled: n !== 1, act: function () { api.revealFile(paths[0]); } }
      ].concat(extra || []));
    },
    // A real file drag, made by the main process. Here it can still land on a collection or a new place in one; the
    // flag goes with a move of the mouse after the drag.
    dragOut: function (e, paths, info) {
      info = info || {};
      e.preventDefault();
      A.libDrag = { n: paths.length, ids: info.ids || null, reorder: !!info.reorder, at: Date.now() };
      api.startFileDrag(paths);
    },
    dragEnd: function () { A.libDrag = null; },
    close: function () { api.openLibraryWindow(false); }
  };
  document.addEventListener('mousemove', function () { if (A.libDrag && Date.now() - A.libDrag.at > 500) A.libDrag = null; });
  // Ctrl+L hides this window, as it closes the drawer.
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'l') { e.preventDefault(); api.openLibraryWindow(false); }
  });
})();
