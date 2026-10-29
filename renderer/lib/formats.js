// Which files the wall can show. Shared by the main process (scanning folders) and the page.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).formats = factory();
})(this, function () {
  'use strict';
  var VIDEO = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'];
  var IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'];
  // Common formats Chromium cannot play. Finding one earns a clear message instead of a silent skip.
  var UNPLAYABLE = {
    avi: ['AVI', 'video'], wmv: ['WMV', 'video'], asf: ['ASF', 'video'], flv: ['FLV', 'video'], mpg: ['MPEG', 'video'], mpeg: ['MPEG', 'video'],
    m2ts: ['MPEG-TS', 'video'], mts: ['MPEG-TS', 'video'], vob: ['VOB', 'video'], '3gp': ['3GP', 'video'], rm: ['RealMedia', 'video'], rmvb: ['RealMedia', 'video'], divx: ['DivX', 'video'],
    heic: ['HEIC', 'image'], heif: ['HEIF', 'image'], tif: ['TIFF', 'image'], tiff: ['TIFF', 'image'], psd: ['PSD', 'image'], jxl: ['JPEG XL', 'image'],
    dng: ['RAW', 'image'], cr2: ['RAW', 'image'], cr3: ['RAW', 'image'], nef: ['RAW', 'image'], arw: ['RAW', 'image']
  };

  function extOf(name) { var m = /\.([^.\\/]+)$/.exec(String(name)); return m ? m[1].toLowerCase() : ''; }
  function kindOfName(name) {
    var e = extOf(name);
    return VIDEO.indexOf(e) > -1 ? 'video' : (IMAGE.indexOf(e) > -1 ? 'image' : null);
  }
  function isUnplayable(name) { return Object.prototype.hasOwnProperty.call(UNPLAYABLE, extOf(name)); }

  // { avi: 3, heic: 1 } -> "3 AVI files and 1 HEIC file cannot play here. Convert videos to MP4 ... and images to JPEG or PNG."
  function describeUnsupported(counts) {
    var byLabel = {}, labels = [], total = 0, video = false, image = false;
    Object.keys(counts || {}).forEach(function (e) {
      var u = Object.prototype.hasOwnProperty.call(UNPLAYABLE, e) ? UNPLAYABLE[e] : null, n = counts[e] | 0;
      if (!u || n < 1) return;
      if (!byLabel[u[0]]) { byLabel[u[0]] = 0; labels.push(u[0]); }
      byLabel[u[0]] += n; total += n;
      if (u[1] === 'video') video = true; else image = true;
    });
    if (!total) return '';
    var parts = labels.map(function (l) { return byLabel[l] + ' ' + l + (byLabel[l] === 1 ? ' file' : ' files'); });
    var list = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
    var how = [];
    if (video) how.push('videos to MP4 (HandBrake does this for free)');
    if (image) how.push('images to JPEG or PNG');
    return list + ' cannot play here. Convert ' + how.join(' and ') + ', then add ' + (total === 1 ? 'it' : 'them') + ' again.';
  }

  return { VIDEO: VIDEO, IMAGE: IMAGE, UNPLAYABLE: UNPLAYABLE, extOf: extOf, kindOfName: kindOfName, isUnplayable: isUnplayable, describeUnsupported: describeUnsupported };
});
