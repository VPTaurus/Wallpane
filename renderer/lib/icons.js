// The app's icons: small line drawings on a 16 × 16 grid, as SVG text for innerHTML. Shared by the wall page and
// the library window.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).icons = factory();
})(this, function () {
  'use strict';
  function svg(d, fill) {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }
  return {
    play: svg('<path d="M4 2.5v11l9-5.5z"/>', true),
    pause: svg('<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>', true),
    vol: svg('<path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.7a6 6 0 0 1 0 8.6"/>'),
    mute: svg('<path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor"/><path d="M11.5 6l3.5 4M15 6l-3.5 4"/>'),
    fit: svg('<path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"/>'),
    trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
    loop: svg('<path d="M3 7V6a2 2 0 0 1 2-2h7M10 2l2 2-2 2M13 9v1a2 2 0 0 1-2 2H4M6 14l-2-2 2-2"/>'),
    next: svg('<path d="M3 2.5v11l7-5.5zM12.5 2.5v11"/>'),
    pin: svg('<path d="M10 2l4 4-2 .5-2.5 3 .5 3-1 1-3-3-3.5 3.5M6.5 6.5L10 2"/>'),
    plus: svg('<path d="M8 3v10M3 8h10"/>'),
    chev: svg('<path d="M4.5 6.5L8 10l3.5-3.5"/>'),
    file: svg('<path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3"/>'),
    folder: svg('<path d="M1.5 4h4.5l1.5 1.5h7v8h-13z"/>'),
    playlist: svg('<path d="M2 4h9M2 8h9M2 12h5M11 10.5v4l3-2z"/>'),
    grid: svg('<path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z"/>'),
    wand: svg('<path d="M2.5 13.5l8-8M11 1.5v2.5M14.5 5H12M13.5 2.5L12 4M9 4l3 3"/>'),
    layout: svg('<path d="M2.5 2.5h11v11h-11zM2.5 9h11M8 2.5V9"/>'),
    undo: svg('<path d="M5.5 3.5L2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7"/>'),
    redo: svg('<path d="M10.5 3.5l3 3-3 3M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/>'),
    bookmark: svg('<path d="M4 2h8v12l-4-3-4 3z"/>'),
    // A cog: a ring with eight square teeth (thin round rays would read as a sun).
    gear: svg('<circle cx="8" cy="8" r="4.3"/><circle cx="8" cy="8" r="1.7"/><path stroke-width="2.6" stroke-linecap="butt" d="M12.3 8h2.4M11.04 11.04l1.7 1.7M8 12.3v2.4M4.96 11.04l-1.7 1.7M3.7 8H1.3M4.96 4.96l-1.7-1.7M8 3.7V1.3M11.04 4.96l1.7-1.7"/>'),
    panel: svg('<path d="M2 3h12v10H2zM10 3v10"/>'),
    tv: svg('<path d="M1.5 3h13v8.5h-13zM5 14.5h6M8 11.5v3"/>'),
    window: svg('<path d="M1.5 5.5h9v8h-9zM4.5 5.5V2.5h10v8h-4"/>'),
    move: svg('<path d="M8 1.5v13M1.5 8h13M6 3.5l2-2 2 2M6 12.5l2 2 2-2M3.5 6l-2 2 2 2M12.5 6l2 2-2 2"/>'),
    reset: svg('<path d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2v3h3"/>'),
    tile: svg('<path d="M2.5 2.5h11v11h-11zM8 5.5v5M5.5 8h5"/>'),
    copy: svg('<path d="M5.5 5.5h8v8h-8zM2.5 10.5v-8h8"/>'),
    splitv: svg('<path d="M2.5 2.5h11v11h-11zM8 2.5v11"/>'),
    splith: svg('<path d="M2.5 2.5h11v11h-11zM2.5 8h11"/>'),
    rows: svg('<path d="M2.5 2.5h11v11h-11zM2.5 8h11M6.2 2.5V8M9.8 2.5V8M5.2 8v5.5M8 8v5.5M10.8 8v5.5"/>'),
    sliders: svg('<path d="M2.5 4.5h11M2.5 11.5h11M5.5 3v3M10.5 10v3"/>'),
    help: svg('<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4M8 11.4v.2"/>'),
    x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    music: svg('<path d="M6 12V3.2l7.5-1.7v9"/><circle cx="4.3" cy="12" r="1.8"/><circle cx="11.8" cy="10.5" r="1.8"/>'),
    prev: svg('<path d="M13 2.5v11l-7-5.5zM3.5 2.5v11"/>'),
    cast: svg('<path d="M1.5 6V3.5h13v9H9.5M1.5 8.6a4.4 4.4 0 0 1 4.4 4.4M1.5 11.2a1.8 1.8 0 0 1 1.8 1.8"/>'),
    collage: svg('<path d="M2.5 2.5h11v11h-11zM2.5 7.5h11M6.5 2.5v5M9.5 7.5v6"/>'),
    eyeoff: svg('<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM2.5 2.5l11 11"/>'),
    keyboard: svg('<path d="M1.5 4h13v8h-13zM4 6.6h.01M6.7 6.6h.01M9.3 6.6h.01M12 6.6h.01M4.6 9.5h6.8"/>'),
    info: svg('<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM8 7.3v4M8 4.7v.1"/>'),
    jobs: svg('<path d="M8 1.8a6.2 6.2 0 1 1-6.2 6.2"/>'),
    disk: svg('<path d="M2 9.5l1.8-6h8.4L14 9.5v4H2zM2 9.5h12M11 11.5h.01"/>'),
    hash: svg('<path d="M6 2.5l-1.2 11M11.2 2.5L10 13.5M2.8 6h11M2.2 10h11"/>'),
    minus: svg('<path d="M3 8h10"/>'),
    clock: svg('<path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM8 4.5V8l2.5 1.6"/>'),
    watch: svg('<path d="M8 4.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM6.5 1.5h3M8 1.5v3M8 9.5l2-2M12.3 4.6l1-1"/>'),
    timer: svg('<path d="M4 1.5h8M4 14.5h8M5 1.5v2.5l3 4 3-4V1.5M5 14.5V12l3-4 3 4v2.5"/>'),
    // Books on a shelf, the last one leaning.
    library: svg('<path d="M1.5 14.5h13M2.5 3h2.5v11.5H2.5zM6 2h2.5v12.5H6zM10 3.6l2.4-.7 2.3 10.9-2.4.7z"/>'),
    search: svg('<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4l3.6 3.6"/>'),
    sortdir: svg('<path d="M5 2.5v11M2.5 11l2.5 2.5 2.5-2.5M11 13.5v-11M8.5 5l2.5-2.5 2.5 2.5"/>'),
    shuffle: svg('<path d="M1.5 4.5h2.5c3.5 0 4.5 7 8 7h2.5M12.5 9.5l2 2-2 2M1.5 11.5h2.5c1.2 0 2-.8 2.7-2M9.3 6.5c.7-1.2 1.5-2 2.7-2h2.5M12.5 2.5l2 2-2 2"/>')
  };
});
