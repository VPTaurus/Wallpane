'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MI = require('../../lib/mediainfo');

// A ffprobe-like report: one container, a video stream and maybe an audio stream.
function probe(container, v, a) {
  const streams = [Object.assign({ codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '30000/1001', pix_fmt: 'yuv420p' }, v)];
  if (a) streams.push(Object.assign({ codec_type: 'audio', channels: 2 }, a));
  return { format: { format_name: container, duration: '12.5', size: '1000', bit_rate: '640' }, streams };
}

test('describe: plain facts, with a turned phone video taller than wide', () => {
  const info = MI.describe(probe('mov,mp4,m4a,3gp,3g2,mj2', { codec_name: 'h264', side_data_list: [{ rotation: -90 }] }, { codec_name: 'aac' }));
  assert.deepEqual(info.video, { codec: 'h264', width: 1080, height: 1920, rotation: 270, fps: 29.97, pixfmt: 'yuv420p' });
  assert.deepEqual(info.audio, { codec: 'aac', channels: 2 });
  assert.equal(info.duration, 12.5);
  const pic = MI.describe({ format: { format_name: 'mov,mp4' }, streams: [{ codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } }] });
  assert.equal(pic.video, null, 'a cover picture is not a video');
});

test('verdict: plays as it is, re-wrap, fix the sound, or convert', () => {
  const v = (c, vc, ac, extra) => MI.verdict(MI.describe(probe(c, Object.assign({ codec_name: vc }, extra), ac ? { codec_name: ac } : null)));
  assert.deepEqual(v('mov,mp4,m4a,3gp,3g2,mj2', 'h264', 'aac'), { action: 'none', target: null, why: 'plays as it is' });
  assert.equal(v('matroska,webm', 'vp9', 'opus').action, 'none');
  assert.equal(v('matroska,webm', 'hevc', 'aac').action, 'maybe');
  assert.deepEqual(v('avi', 'h264', 'mp3'), { action: 'remux', target: 'mp4', why: 'the container (avi)' });
  assert.equal(v('flv', 'h264', null).action, 'remux');
  assert.deepEqual(v('matroska,webm', 'h264', 'ac3'), { action: 'audio', target: 'mp4', why: 'the sound (ac3)' });
  assert.equal(v('mov,mp4,m4a,3gp,3g2,mj2', 'h264', 'dts').action, 'audio');
  assert.equal(v('avi', 'mpeg4', 'mp3').action, 'convert');
  assert.equal(v('asf', 'wmv3', 'wmav2').action, 'convert');
  assert.equal(v('mpegts', 'mpeg2video', 'ac3').action, 'convert');
  assert.equal(v('mov,mp4,m4a,3gp,3g2,mj2', 'h264', 'aac', { pix_fmt: 'yuv420p10le' }).action, 'convert', '10-bit H.264');
  assert.equal(v('mov,mp4,m4a,3gp,3g2,mj2', 'prores', 'pcm_s16le').action, 'convert');
});
