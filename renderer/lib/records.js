// Saved walls (presets and the last session) and saved layouts, as read back from disk or an imported file.
// Everything is checked and put in range, so a damaged or hand-edited file cannot break the page.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'), require('./geometry'), require('./playlist'));
  else (root.MW = root.MW || {}).rec = factory(root.MW.util, root.MW.geo, root.MW.pl);
})(this, function (U, G, PL) {
  'use strict';

  function num(v) { return isFinite(v) && v !== null ? +v : undefined; }
  function cleanItem(i) {
    var empty = i.kind === 'empty';
    return {
      path: empty ? '' : i.path, name: empty ? 'Empty tile' : i.name, kind: i.kind, col: i.col | 0, row: i.row | 0, w: i.w | 0, h: i.h | 0,
      fit: i.fit === 'contain' ? 'contain' : 'cover', muted: i.muted !== false, loop: i.loop !== false,
      pl: !empty && typeof i.pl === 'string' ? i.pl : null, pinned: i.pinned === true, fitSet: i.fitSet === true,
      fx: num(i.fx), fy: num(i.fy), fw: num(i.fw), fh: num(i.fh),
      // where the media sits in the tile, and its zoom
      mx: num(i.mx) === undefined ? 0.5 : U.clamp(+i.mx, 0, 1), my: num(i.my) === undefined ? 0.5 : U.clamp(+i.my, 0, 1),
      zoom: num(i.zoom) === undefined ? 1 : U.clamp(+i.zoom, 1, 8)
    };
  }
  function goodItem(i) {
    if (!i || !isFinite(i.col) || !isFinite(i.row) || !(i.w >= 1) || !(i.h >= 1)) return false;
    if (i.kind === 'empty') return true;
    return typeof i.path === 'string' && !!i.path && typeof i.name === 'string' && (i.kind === 'video' || i.kind === 'image');
  }
  // A wall record, or null if it is unusable. `needName`: presets need a name, the session does not.
  function cleanRecord(r, needName) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.items)) return null;
    var name = typeof r.name === 'string' ? r.name.trim().slice(0, 48) : '';
    if (needName && !name) return null;
    var items = r.items.filter(goodItem).map(cleanItem);
    return {
      name: name, savedAt: +r.savedAt || Date.now(),
      cols: U.clamp((r.cols | 0) || 4, 1, 12), rows: U.clamp((r.rows | 0) || 3, 1, 12), gap: U.clamp(r.gap | 0, 0, 24),
      aspect: U.ASPECTS.indexOf(r.aspect) > -1 ? r.aspect : 'fill', fit: r.fit === 'contain' ? 'contain' : 'cover',
      presetName: typeof r.presetName === 'string' ? r.presetName : null, items: items, mode: r.mode === 'free' ? 'free' : 'grid',
      playlists: PL.clean(r.playlists), fillPl: typeof r.fillPl === 'string' ? r.fillPl : null
    };
  }
  // A saved layout ({ name, cols, rows, f: [[col, row, w, h], ...] }), or null if it is unusable.
  function cleanLayout(L) {
    if (!L || typeof L.name !== 'string' || !L.name.trim() || !G.validFrames(L)) return null;
    return { name: L.name.trim().slice(0, 40), cols: L.cols, rows: L.rows, f: L.f.map(function (f) { return f.slice(); }) };
  }

  return { cleanRecord: cleanRecord, cleanLayout: cleanLayout };
});
