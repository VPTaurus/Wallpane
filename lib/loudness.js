'use strict';
// Even loudness (main process): each video's integrated loudness (EBU R128, in LUFS), measured once with FFmpeg's
// ebur128 filter on its sound alone (so even a film takes seconds), kept in loudness.json (lib/measures.js). A video
// with no sound, or one FFmpeg cannot read, is null.
//
// createLoudness({ ffmpeg, cache, file, notify }) -> { want(owner, paths) -> { path: lufs | null } }
const FF = require('./ffmpeg');
const { createMeasures } = require('./measures');

function loudnessArgs(file) {
  return ['-nostats', '-v', 'info', '-threads', '1'].concat(FF.input(file),
    ['-map', '0:a:0', '-vn', '-sn', '-dn', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
}
// The integrated loudness from ebur128's summary (the last "I:" line), or null for silence or none.
function parse(text) {
  const all = String(text).match(/\bI:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+LUFS/g);
  if (!all) return null;
  const v = parseFloat(all[all.length - 1].replace(/^I:\s+/, ''));
  return isFinite(v) && v > -70 ? Math.round(v * 10) / 10 : null;
}

function createLoudness(o) {
  const ff = o.ffmpeg;
  return createMeasures(Object.assign({}, o, {
    measure: async (p) => parse((await ff.run('ffmpeg', loudnessArgs(p), { timeoutMs: 10 * 60 * 1000 })).stderr)
  }));
}

module.exports = { createLoudness, loudnessArgs, parse };
