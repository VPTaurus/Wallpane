// Small helpers used all over the page.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).util = factory();
})(this, function () {
  'use strict';
  var ASPECTS = ['fill', '16:9', '4:3', '1:1', '9:16'];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dirOf(p) { return String(p).replace(/[\\/][^\\/]*$/, ''); }
  function baseName(p) { return String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop(); }
  function sortEntries(a) {
    return a.slice().sort(function (x, y) { return x.path.localeCompare(y.path, undefined, { numeric: true, sensitivity: 'base' }); });
  }
  function readingOrder(a, b) { return a.row - b.row || a.col - b.col; }

  // file:// address for a local or network path. Each segment is encoded, so spaces, # ? and % are safe.
  function fileUrl(p) {
    var s = String(p).replace(/\\/g, '/');
    var host = '';
    if (s.startsWith('//')) {            // network path: //server/share/file
      var rest = s.slice(2), i = rest.indexOf('/');
      host = i < 0 ? rest : rest.slice(0, i);
      s = i < 0 ? '/' : rest.slice(i);
    } else if (!s.startsWith('/')) {
      s = '/' + s;                       // C:/folder/file -> /C:/folder/file
    }
    var enc = s.split('/').map(function (seg, n) { return (n === 1 && /^[A-Za-z]:$/.test(seg)) ? seg : encodeURIComponent(seg); }).join('/');
    return 'file://' + host + enc;
  }
  // 1234567 -> "1.2 MB", in decimal units like the cache's size limit.
  function bytes(n) {
    n = Math.max(0, +n || 0);
    var units = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return (i === 0 || n >= 100 ? Math.round(n) : Math.round(n * 10) / 10) + ' ' + units[i];
  }

  return { ASPECTS: ASPECTS, clamp: clamp, esc: esc, dirOf: dirOf, baseName: baseName, sortEntries: sortEntries, readingOrder: readingOrder, fileUrl: fileUrl, bytes: bytes };
});
