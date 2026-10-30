// Thumbnails in even rows, as in a photo gallery: each row exactly as wide as the space, each thumbnail in its media's
// shape. A row is at most `height` tall; it is a little lower when that makes its thumbnails fill it exactly, and the
// last row keeps `height` and ends where it ends. Also which rows show in a scrolled window, for drawing only those.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).justify = factory();
})(this, function () {
  'use strict';
  var MIN = 1 / 3, MAX = 3;

  // The shape a file gets (width / height): its own, kept between 1:3 and 3:1 so none becomes a sliver, or a usual one
  // while its size is not known yet.
  function aspectOf(it) {
    if (it && it.w > 0 && it.h > 0) return Math.min(MAX, Math.max(MIN, it.w / it.h));
    return it && it.kind === 'video' ? 16 / 9 : 4 / 3;
  }

  // items: [{ w, h, kind }] -> { rows: [{ y, h, start, end }], boxes: [{ x, y, w, h }] (one per item), height }.
  function layout(items, width, height, gap) {
    gap = gap || 0;
    var rows = [], boxes = new Array(items.length), y = 0, start = 0, sum = 0;
    if (!(width > 0) || !(height > 0)) return { rows: rows, boxes: [], height: 0 };
    function place(end, h) {
      var x = 0;
      for (var i = start; i < end; i++) {
        var w = aspectOf(items[i]) * h;
        boxes[i] = { x: x, y: y, w: w, h: h };
        x += w + gap;
      }
      rows.push({ y: y, h: h, start: start, end: end });
      y += h + gap; start = end; sum = 0;
    }
    for (var i = 0; i < items.length; i++) {
      sum += aspectOf(items[i]);
      var gaps = gap * (i - start);
      if (sum * height + gaps >= width) place(i + 1, (width - gaps) / sum);
    }
    if (start < items.length) place(items.length, height);
    return { rows: rows, boxes: boxes, height: rows.length ? y - gap : 0 };
  }

  // The rows that show between top and bottom (pixels from the top of all rows): { first, last } indexes, last
  // included, or null when none does.
  function visible(rows, top, bottom) {
    var lo = 0, hi = rows.length - 1, first = rows.length;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (rows[mid].y + rows[mid].h >= top) { first = mid; hi = mid - 1; } else lo = mid + 1;
    }
    var last = first - 1;
    for (var i = first; i < rows.length && rows[i].y <= bottom; i++) last = i;
    return last >= first ? { first: first, last: last } : null;
  }

  return { aspectOf: aspectOf, layout: layout, visible: visible };
});
