// Where the media sits inside its tile: a focus point (mx, my from 0 to 1) and a zoom (1 = as the fit lays it out).
// The page uses the focus point as both the CSS object-position and the transform-origin, and the zoom as scale(),
// so on one axis a point u of the media (0..C) shows at  p * S + z * (u - p * C)  in a tile of size S.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).view = factory();
})(this, function () {
  'use strict';
  var MAXZ = 8;

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  // Size of the media as object-fit lays it out in a W x H tile; a = media width / height.
  function content(W, H, a, fit) {
    if (!(a > 0)) a = W / H;
    return fit === 'contain' ? { w: Math.min(W, H * a), h: Math.min(H, W / a) } : { w: Math.max(W, H * a), h: Math.max(H, W / a) };
  }
  function of(it) { return { mx: it.mx == null ? 0.5 : it.mx, my: it.my == null ? 0.5 : it.my, zoom: it.zoom || 1 }; }
  function isDefault(it) { var v = of(it); return v.zoom === 1 && v.mx === 0.5 && v.my === 0.5; }
  function screenAt(p, z, S, C, u) { return p * S + z * (u - p * C); }

  // Dragging by `delta` keeps the grabbed point of the media under the pointer (as far as the media reaches).
  function panAxis(p, z, S, C, delta) { var den = S - z * C; return Math.abs(den) < 0.5 ? p : clamp01(p + delta / den); }
  // Zooming to z2 keeps the point under the pointer (at `at`) where it is.
  function zoomAxis(p, z, z2, S, C, at) {
    var u = (at - p * S) / z + p * C, den = S - z2 * C;
    return Math.abs(den) < 0.5 ? p : clamp01((at - z2 * u) / den);
  }
  // v: { mx, my, zoom }; W, H: tile size; c: content(); dx, dy: how far the pointer moved since v.
  function pan(v, W, H, c, dx, dy) { return { mx: panAxis(v.mx, v.zoom, W, c.w, dx), my: panAxis(v.my, v.zoom, H, c.h, dy), zoom: v.zoom }; }
  // Zoom to z2 (kept between 1 and 8) around the point (px, py) of the tile.
  function zoomAt(v, W, H, c, z2, px, py) {
    z2 = Math.max(1, Math.min(MAXZ, z2));
    if (z2 === 1) return { mx: v.mx, my: v.my, zoom: 1 };
    return { mx: zoomAxis(v.mx, v.zoom, z2, W, c.w, px), my: zoomAxis(v.my, v.zoom, z2, H, c.h, py), zoom: z2 };
  }
  // The CSS for a tile's media element.
  function css(it) {
    var v = of(it), pos = (v.mx * 100).toFixed(2) + '% ' + (v.my * 100).toFixed(2) + '%';
    return { objectPosition: pos, transformOrigin: pos, transform: v.zoom > 1.0001 ? 'scale(' + v.zoom.toFixed(4) + ')' : '' };
  }

  return { MAXZ: MAXZ, content: content, of: of, isDefault: isDefault, screenAt: screenAt, pan: pan, zoomAt: zoomAt, css: css };
});
