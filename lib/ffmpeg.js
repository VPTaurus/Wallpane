'use strict';
// Running the FFmpeg that comes with Wallpane (see scripts/fetch-ffmpeg.js): ffprobe to learn what a file holds,
// ffmpeg to make things from it. Every run uses an argument list (never a shell), runs at below-normal priority so the
// wall keeps playing smoothly, has a time limit, can report progress and be cancelled, and only ever sees local files:
// arguments that name a network address are refused, and inputs are opened with only the file protocol allowed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Network addresses FFmpeg could otherwise open (http:, rtmp:, tcp:, …). Windows paths ("C:\…") never match.
const NETWORK = /^(?:https?|rtmps?|rtsp|rtp|tcp|udp|tls|srt|ftp|sftp|mms[th]?|gopher|icecast|hls|data|unix|zmq|rist|ipfs|ipns):/i;

// The arguments that open one input file, with only local files (and pipes) allowed.
function input(file) { return ['-protocol_whitelist', 'file,pipe', '-i', file]; }

function create(dir) {
  const exe = (tool) => path.join(dir, tool + '.exe');
  function available() { return fs.existsSync(exe('ffmpeg')) && fs.existsSync(exe('ffprobe')); }

  /* run('ffmpeg' | 'ffprobe', args, opts) -> Promise<{ code, stdout, stderr }>
     opts.timeoutMs: stop after this long (default 10 minutes)
     opts.signal: an AbortSignal; aborting stops the program
     opts.onProgress(seconds): for ffmpeg runs that pass "-progress pipe:1", how far the output has got
     Rejects with err.code 'CANCELLED', 'TIMEOUT', 'NO_FFMPEG', or 'FAILED' (with the end of FFmpeg's own message). */
  function run(tool, args, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      const fail = (code, msg) => { const e = new Error(msg); e.code = code; reject(e); };
      if (tool !== 'ffmpeg' && tool !== 'ffprobe') { fail('FAILED', 'Unknown program'); return; }
      if (!available()) { fail('NO_FFMPEG', 'FFmpeg is not in this copy of Wallpane.'); return; }
      const bad = args.find((a) => typeof a !== 'string' || NETWORK.test(a));
      if (bad !== undefined) { fail('FAILED', 'Refused an argument that is not a local file: ' + String(bad).slice(0, 80)); return; }
      if (opts.signal && opts.signal.aborted) { fail('CANCELLED', 'Cancelled'); return; }
      const child = spawn(exe(tool), ['-hide_banner'].concat(args), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed: normal priority */ }
      let out = '', err = '', ended = null;
      const stop = (why) => { if (!ended) { ended = why; child.kill(); } };
      const timer = setTimeout(() => stop('TIMEOUT'), opts.timeoutMs || 10 * 60 * 1000);
      const onAbort = () => stop('CANCELLED');
      if (opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true });
      child.stdout.on('data', (d) => {
        const s = d.toString();
        out += s;
        if (opts.onProgress) {
          // "-progress pipe:1" writes key=value lines; out_time_us is how far the output has got.
          const m = s.match(/out_time_us=(\d+)/g);
          if (m) opts.onProgress(parseInt(m[m.length - 1].split('=')[1], 10) / 1e6);
          if (!opts.keepOutput && out.length > 65536) out = out.slice(-4096);
        }
      });
      child.stderr.on('data', (d) => { err = (err + d.toString()).slice(-8192); });
      child.on('error', (e) => { clearTimeout(timer); fail('FAILED', e.message); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
        if (ended === 'CANCELLED') fail('CANCELLED', 'Cancelled');
        else if (ended === 'TIMEOUT') fail('TIMEOUT', tool + ' took too long and was stopped.');
        else if (code !== 0) fail('FAILED', (err.trim().split(/\r?\n/).pop() || tool + ' failed') + ' (exit ' + code + ')');
        else resolve({ code, stdout: out, stderr: err });
      });
    });
  }

  // What a file holds, as ffprobe reports it (JSON): its format and streams.
  async function probeRaw(file, opts) {
    const r = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'].concat(input(file)),
      Object.assign({ timeoutMs: 30000, keepOutput: true }, opts));
    return JSON.parse(r.stdout);
  }

  // The H.264 encoder to convert with: the graphics card's when one works (a one-second test encode of each, once),
  // else x264. Returns { name, args } with the arguments that pick it and its quality.
  let encoder = null;
  async function h264Encoder() {
    if (encoder) return encoder;
    for (const e of ENCODERS) {
      if (e.name === 'libx264') { encoder = e; break; }
      try {
        await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=1', '-pix_fmt', 'yuv420p'].concat(e.args, ['-f', 'null', '-']), { timeoutMs: 15000 });
        encoder = e; break;
      } catch { /* not on this PC */ }
    }
    return encoder;
  }

  return { dir, available, run, probeRaw, input, h264Encoder };
}

// Graphics card encoders (NVIDIA, Intel, AMD) first, x264 last; each with a quality close to x264's CRF 21.
const ENCODERS = [
  { name: 'h264_nvenc', label: 'NVIDIA graphics', args: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0'] },
  { name: 'h264_qsv', label: 'Intel graphics', args: ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', '23'] },
  { name: 'h264_amf', label: 'AMD graphics', args: ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '21', '-qp_p', '23'] },
  { name: 'libx264', label: 'the processor', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21'] }
];

module.exports = { create, input, NETWORK, ENCODERS };
