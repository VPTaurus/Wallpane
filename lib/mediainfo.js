'use strict';
// What a media file holds (from ffprobe's JSON) in plain terms, and whether Wallpane's Chromium can play it as it is.
// When it cannot, the cheapest way to make it playable:
//   'remux'  the picture and sound are fine, only the container is not: copy them into MP4 (or WebM), seconds, lossless
//   'audio'  only the sound is not (AC3, DTS, …): copy the picture, make the sound AAC
//   'convert' anything else: H.264 and AAC in MP4
// No FFmpeg is run here, so these rules are easy to test.

// Codecs Chromium plays (as ffprobe names them). HEVC plays only where Windows has its HEVC support, so it is 'maybe'.
const VIDEO_OK = ['h264', 'vp8', 'vp9', 'av1', 'theora'];
const VIDEO_MAYBE = ['hevc'];
const AUDIO_OK = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'pcm_u8'];
// Containers (ffprobe's format_name) Chromium opens, and the codecs each of the two targets can carry.
const CONTAINER_OK = /^(?:mov,mp4,m4a,3gp,3g2,mj2|matroska,webm|ogg|mp3|wav|flac)$/;
const IN_MP4 = ['h264', 'hevc', 'av1'];
const IN_WEBM = ['vp8', 'vp9', 'av1'];

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
function rate(r) {
  const m = /^(\d+)\/(\d+)$/.exec(String(r || ''));
  return m && +m[2] ? Math.round((+m[1] / +m[2]) * 100) / 100 : null;
}
// Rotation from the stream's tags (older files) or its display matrix (newer ones), as 0, 90, 180 or 270.
function rotationOf(s) {
  let r = num(s.tags && s.tags.rotate);
  (s.side_data_list || []).forEach((d) => { if (d.rotation !== undefined) r = num(d.rotation); });
  r = ((Math.round(r || 0) % 360) + 360) % 360;
  return r;
}

// ffprobe JSON -> { container, duration, size, bitrate, video: {codec, width, height, rotation, fps, pixfmt} | null,
// audio: {codec, channels} | null }. width and height are as shown: a phone video turned 90° is taller than wide.
function describe(json) {
  const f = (json && json.format) || {}, streams = (json && json.streams) || [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === 'audio');
  let video = null;
  if (v) {
    const rot = rotationOf(v), turned = rot === 90 || rot === 270;
    video = {
      codec: v.codec_name || '', width: turned ? v.height : v.width, height: turned ? v.width : v.height,
      rotation: rot, fps: rate(v.avg_frame_rate) || rate(v.r_frame_rate), pixfmt: v.pix_fmt || ''
    };
  }
  return {
    container: f.format_name || '', duration: num(f.duration) || (v && num(v.duration)) || null,
    size: num(f.size), bitrate: num(f.bit_rate),
    video, audio: a ? { codec: a.codec_name || '', channels: a.channels || 0 } : null
  };
}

// Whether it plays as it is, and if not, how to fix it: { action: 'none' | 'maybe' | 'remux' | 'audio' | 'convert',
// target: 'mp4' | 'webm' | null, why }.
function verdict(info) {
  const v = info.video, a = info.audio;
  if (!v) return { action: 'convert', target: 'mp4', why: 'no picture' };
  const videoOk = VIDEO_OK.includes(v.codec), videoMaybe = VIDEO_MAYBE.includes(v.codec);
  const audioOk = !a || AUDIO_OK.includes(a.codec);
  // Chromium decodes 8-bit 4:2:0 H.264 only (10-bit or 4:4:4 needs converting); other codecs carry their own limits.
  const pixOk = v.codec !== 'h264' || !v.pixfmt || /^(?:yuv420p|yuvj420p)$/.test(v.pixfmt);
  const boxOk = CONTAINER_OK.test(info.container);
  if ((videoOk || videoMaybe) && pixOk && audioOk && boxOk) return { action: videoOk ? 'none' : 'maybe', target: null, why: videoOk ? 'plays as it is' : 'HEVC: plays where Windows can decode it' };
  const box = IN_MP4.includes(v.codec) ? 'mp4' : IN_WEBM.includes(v.codec) ? 'webm' : null;
  if ((videoOk || videoMaybe) && pixOk && box) {
    if (audioOk && (!a || box === 'mp4' || ['opus', 'vorbis'].includes(a.codec))) return { action: 'remux', target: box, why: 'the container (' + info.container.split(',')[0] + ')' };
    if (box === 'mp4') return { action: 'audio', target: 'mp4', why: 'the sound (' + (a ? a.codec : '') + ')' };
  }
  return { action: 'convert', target: 'mp4', why: 'the picture (' + v.codec + (pixOk ? '' : ', ' + v.pixfmt) + ')' };
}

module.exports = { describe, verdict, VIDEO_OK, AUDIO_OK };
