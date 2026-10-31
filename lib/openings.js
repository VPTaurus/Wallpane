'use strict';
// Black or silent openings (main process): how long a video opens with a black picture, and with silence, found once
// by FFmpeg's blackdetect and silencedetect in its first WINDOW seconds and kept in openings.json (lib/measures.js).
// A wall then starts the video after it. Black that lasts the whole window is not an opening (a dark video, or music
// over a black picture), nor is silence that does; neither is anything that does not start at the very beginning.
//
// createOpenings({ ffmpeg, cache, file, notify }) -> { want(owner, paths) -> { path: { black, silence } | null } }
//   black, silence: where each opening ends, in seconds (0: none)
const FF = require('./ffmpeg');
const { createMeasures } = require('./measures');

const WINDOW = 12;

function openingArgs(file) {
  return ['-nostats', '-v', 'info', '-threads', '2', '-t', String(WINDOW)].concat(FF.input(file), [
    '-sn', '-dn', '-vf', 'blackdetect=d=0.1:pic_th=0.98:pix_th=0.10', '-af', 'silencedetect=n=-50dB:d=0.5', '-f', 'null', '-'
  ]);
}
// { black, silence } from the detectors' lines: the first black and the first silence, if each starts the video and
// ends before the window does.
function parseOpening(text) {
  const s = String(text), r = (v) => Math.round(v * 100) / 100;
  let black = 0, silence = 0;
  const b = /black_start:\s*(-?[\d.]+)\s+black_end:\s*([\d.]+)/.exec(s);
  if (b && +b[1] <= 0.1 && +b[2] < WINDOW - 0.5) black = r(+b[2]);
  const s0 = /silence_start:\s*(-?[\d.e-]+)/.exec(s), s1 = /silence_end:\s*([\d.]+)/.exec(s);
  if (s0 && +s0[1] <= 0.1 && s1 && +s1[1] < WINDOW - 0.5) silence = r(+s1[1]);
  return { black, silence };
}

function createOpenings(o) {
  const ff = o.ffmpeg;
  return createMeasures(Object.assign({}, o, {
    measure: async (p) => parseOpening((await ff.run('ffmpeg', openingArgs(p), { timeoutMs: 2 * 60 * 1000 })).stderr)
  }));
}

module.exports = { createOpenings, openingArgs, parseOpening, WINDOW };
