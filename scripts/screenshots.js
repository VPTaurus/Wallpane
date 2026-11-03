'use strict';
// The pictures for the README and the landing page (ROADMAP G2): Wallpane started on a fresh data folder with the
// demo media (demo-media/, from Pexels; see its CREDITS.md), set up scene by scene and photographed in its dark look,
// and a short clip of the wall made with its own Record. Writes docs/images: wall.jpg (wall mode), app.jpg, free.jpg,
// library.jpg, properties.jpg, settings.jpg, hide.jpg, and wall.mp4 with wall-poster.jpg.
//
//   npm run screenshots          (needs FFmpeg: npm run fetch-ffmpeg)
//   DEMO_MEDIA=D:\clips npm run screenshots   (the media from elsewhere, with the same file names)
const { _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FF = require('../lib/ffmpeg');

const ROOT = path.join(__dirname, '..');
const SOURCE = process.env.DEMO_MEDIA || path.join(ROOT, 'demo-media');
// No one's own folders in the pictures: the media is opened through a junction in Windows' shared Videos folder
// (removed at the end; nothing is copied), and recordings are said to go there.
const PUBLIC = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Videos');
const LINK = path.join(PUBLIC, 'Wallpane demo');
let MEDIA = SOURCE;
const OUT = path.join(ROOT, 'docs', 'images');
const W = 1600, H = 900;   // the window's page, in pixels (one pixel a point, whatever Windows' scaling)
const CLIP = 10;           // seconds of wall in wall.mp4
const ff = FF.create(path.join(ROOT, 'vendor', 'ffmpeg'));
const media = (name) => path.join(MEDIA, name);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// The mosaic wall: a big tile, wide ones and two tall ones for the upright clips, with a good moment of each.
const MOSAIC = [
  ['taipei-sunset.mp4', [0, 0, 2, 2], 12], ['northern-lights.mp4', [2, 0, 2, 1], 6], ['jellyfish.mp4', [2, 1, 1, 1], 5],
  ['fireplace.mp4', [3, 1, 1, 1], 20], ['waterfall.mp4', [0, 2, 1, 2], 4], ['ocean-crash.mp4', [1, 2, 2, 1], 8],
  ['neon-puddle.mp4', [3, 2, 1, 2], 4], ['ink-colours.mp4', [1, 3, 2, 1], 14]
];
// Free layout after Fill the wall: pictures and clips of every shape.
const FREE = ['mountain-lake.jpg', 'ocean-beach.mp4', 'taipei-sunset.mp4', 'northern-lights.mp4', 'ink-upright.mp4', 'cherry-tree.jpg', 'jellyfish.mp4', 'lake-sunset.jpg', 'neon-puddle.mp4', 'ink-colours.mp4'];

// Wallpane on a fresh data folder, dark, its page W x H, messages hidden (a first start shows some).
async function launch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-shots-'));
  const data = path.join(dir, 'data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'window.json'), JSON.stringify({ wins: { 1: { width: W, height: H } }, open: [1] }));
  const app = await electron.launch({ args: [ROOT, '--force-device-scale-factor=1'], env: Object.assign({}, process.env, { WALLPANE_USER_DATA: data }) });
  const page = await app.firstWindow();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForSelector('body[data-ready="1"]');
  await app.evaluate(({ BrowserWindow }, s) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(s.w, s.h); w.center(); }, { w: W, h: H });
  await page.addStyleTag({ content: '#toast { visibility: hidden !important; }' });
  await page.mouse.move(W - 2, H - 2);
  return { app, page, dir };
}
async function add(s, files) {
  await s.app.evaluate(({ dialog }, a) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: a }); }, files.map(media));
  await s.page.click('#addBtn');
  await s.page.click('#addFiles');
  await s.page.waitForFunction((n) => window.MW.app.S.items.filter((i) => i.path && !i.sample).length >= n, files.length);
}
// Every video at its moment (or as it is), playing, with a picture; every image loaded.
async function settle(page, moments) {
  await page.evaluate(async (m) => {
    const vids = [...document.querySelectorAll('#wall .tile video')];
    await Promise.all(vids.map((v) => new Promise((ok) => {
      const name = v.closest('.tile').getAttribute('aria-label') || '', t = Object.keys(m).find((k) => name.startsWith(k));
      const go = () => { if (t != null && Math.abs(v.currentTime - m[t]) > 0.5) { v.addEventListener('seeked', ok, { once: true }); v.currentTime = m[t]; } else ok(); };
      if (v.readyState >= 2) go(); else v.addEventListener('loadeddata', go, { once: true });
      setTimeout(ok, 15000);
    })));
    await Promise.all([...document.querySelectorAll('#wall .tile img')].map((i) => (i.complete ? null : new Promise((ok) => { i.onload = i.onerror = ok; }))));
  }, moments || {});
  await sleep(600);
}
// Until `check` (run in the page; it may wait for the main process) is true. waitForFunction does not wait for an
// answer that takes a while, so this asks again and again from here.
async function until(page, check, secs) {
  for (const end = Date.now() + secs * 1000; Date.now() < end; await sleep(1000)) if (await page.evaluate(check)) return;
  throw new Error('Waited ' + secs + ' s in vain for: ' + check);
}
// Until the background work is done (lighter copies of the clips, thumbnails), so the bar shows none: none for three
// seconds in a row, since the wall asks for lighter copies a moment after it changes.
async function quiet(page) {
  for (let calm = 0; calm < 3;) {
    await until(page, async () => !(await window.wall.jobs()).some((j) => j.state === 'queued' || j.state === 'running'), 300);
    calm++;
    await sleep(1000);
    if (await page.evaluate(async () => (await window.wall.jobs()).some((j) => j.state === 'queued' || j.state === 'running'))) calm = 0;
  }
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 88 });
  console.log('  ' + name);
}

async function mosaicScene() {
  const s = await launch(), page = s.page;
  try {
    await page.evaluate(() => { const A = window.MW.app; A.S.cols = 4; A.S.rows = 4; A.render(); });
    await add(s, MOSAIC.map((m) => m[0]));
    await page.evaluate((list) => {
      const A = window.MW.app;
      list.forEach(([name, f]) => { const it = A.S.items.find((i) => i.name === name); Object.assign(it, { col: f[0], row: f[1], w: f[2], h: f[3] }); });
      A.render();
    }, MOSAIC);
    const moments = Object.fromEntries(MOSAIC.map((m) => [m[0], m[2]]));
    await quiet(page);
    await settle(page, moments);

    // The window, with the big tile's controls under the pointer.
    const big = await page.locator('#wall .tile[aria-label^="taipei-sunset.mp4"]').boundingBox();
    await page.mouse.move(big.x + big.width * 0.6, big.y + big.height * 0.45);
    await sleep(500);
    await shot(page, 'app.jpg');

    // A tile's Properties, with a looped part.
    await page.evaluate(() => {
      const A = window.MW.app, it = A.S.items.find((i) => i.name === 'ocean-crash.mp4');
      A.select(it.id); A.setLoop(it, 6.5, 14); A.openProps(it, '#pbSec');
    });
    await sleep(700);
    await shot(page, 'properties.jpg');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.MW.app.select(null));

    // Settings: recording, and the emergency hide.
    await page.mouse.move(W - 2, H - 2);
    await page.evaluate((d) => { const A = window.MW.app; A.S.rec.dir = d; A.openSettings('rec'); }, fs.existsSync(PUBLIC) ? PUBLIC : null);
    await sleep(600);
    await shot(page, 'settings.jpg');
    await page.evaluate(() => window.MW.app.openSettings('hide'));
    await sleep(600);
    await shot(page, 'hide.jpg');
    await page.evaluate(() => window.MW.app.closePops());

    // Wall mode (as F11 shows it, in this window, once the pointer rests), and a clip of it made with Record.
    await page.evaluate(() => document.body.classList.add('clean', 'idle'));
    await settle(page, moments);
    await shot(page, 'wall.jpg');
    const recDir = path.join(s.dir, 'rec');
    fs.mkdirSync(recDir);
    await page.evaluate((d) => { const A = window.MW.app; A.S.rec = { size: 1080, fps: 30, quality: 'high', sound: false, dir: d }; A.toggleRecording(); }, recDir);
    await sleep(CLIP * 1000 + 800);
    await page.evaluate(() => window.MW.app.toggleRecording());
    let made = null;
    for (let i = 0; i < 120 && !made; i++) { await sleep(500); made = fs.readdirSync(recDir).find((n) => /^Wallpane .*\.mp4$/.test(n) && !/\.part\./.test(n)); }
    if (!made) throw new Error('The recording did not finish.');
    // Smaller for the web: 1280 wide, no sound, starting at once; and its first frame as the poster.
    const clip = path.join(OUT, 'wall.mp4');
    await ff.run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(recDir, made), '-t', String(CLIP), '-an', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip], { timeoutMs: 300000 });
    await ff.run('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-frames:v', '1', '-q:v', '3', path.join(OUT, 'wall-poster.jpg')], { timeoutMs: 60000 });
    console.log('  wall.mp4 (' + Math.round(fs.statSync(clip).size / 1024) + ' KB), wall-poster.jpg');
    await page.evaluate(() => document.body.classList.remove('clean', 'idle'));

    // The library beside the wall: the demo folder, with stars, hearts and tags.
    await page.evaluate((d) => window.wall.addLibraryFolder(d), MEDIA);
    await until(page, async () => (await window.wall.libraryFolders()).every((f) => !f.scanning && !f.pending), 120);
    await page.evaluate(async () => {
      const items = (await window.wall.queryLibrary({ sort: 'name' })).items, id = (n) => items.find((i) => i.name === n).id;
      await window.wall.markLibrary([id('northern-lights.mp4'), id('mountain-lake.jpg'), id('taipei-sunset.mp4')], { stars: 5, fav: true });
      await window.wall.markLibrary([id('jellyfish.mp4'), id('waterfall.mp4'), id('ocean-beach.mp4'), id('lake-sunset.jpg')], { stars: 4 });
      await window.wall.markLibrary([id('fireplace.mp4'), id('ink-colours.mp4')], { stars: 3 });
      await window.wall.markLibrary([id('ocean-beach.mp4'), id('ocean-crash.mp4'), id('waterfall.mp4'), id('jellyfish.mp4')], { addTags: ['Water'] });
      await window.wall.markLibrary([id('milan-night.mp4'), id('taipei-sunset.mp4'), id('neon-puddle.mp4'), id('northern-lights.mp4')], { addTags: ['Night'] });
      await window.wall.markLibrary([id('mountain-clouds.mp4'), id('fireplace.mp4'), id('lake-sunset.jpg')], { addTags: ['Calm'] });
    });
    await page.evaluate(() => { window.MW.app.S.lib.size = 150; });
    await page.keyboard.press('Control+l');
    await page.waitForFunction(() => document.querySelectorAll('#libGrid .lthumb img').length >= 16, null, { timeout: 120000, polling: 500 });
    await quiet(page);
    await page.mouse.move(W - 2, 60);
    await settle(page, moments);
    await sleep(800);
    await shot(page, 'library.jpg');
  } finally { await s.app.close(); fs.rmSync(s.dir, { recursive: true, force: true }); }
}

async function freeScene() {
  const s = await launch(), page = s.page;
  try {
    // Added on the grid (12 cells for 10 files); Fill the wall places them freely, each in its own shape.
    await add(s, FREE);
    await page.click('#arrangeMenuBtn');
    await page.click('#fillWallBtn');
    await page.mouse.move(W - 2, H - 2);
    await quiet(page);
    await settle(page, { 'ocean-beach.mp4': 6, 'taipei-sunset.mp4': 20, 'northern-lights.mp4': 6, 'ink-upright.mp4': 5, 'jellyfish.mp4': 9, 'neon-puddle.mp4': 7, 'ink-colours.mp4': 14 });
    await shot(page, 'free.jpg');
  } finally { await s.app.close(); fs.rmSync(s.dir, { recursive: true, force: true }); }
}

// The junction to the media, when there is a shared Videos folder and nothing of that name in it yet. Taken away with
// unlink, which removes the link only, never what it points to.
function linkMedia() {
  if (process.platform !== 'win32' || !fs.existsSync(PUBLIC) || fs.existsSync(LINK)) return false;
  try { fs.symlinkSync(SOURCE, LINK, 'junction'); } catch { return false; }
  MEDIA = LINK;
  return true;
}

(async () => {
  const missing = MOSAIC.map((m) => m[0]).concat(FREE).filter((n) => !fs.existsSync(media(n)));
  if (missing.length) throw new Error('Missing in ' + MEDIA + ': ' + [...new Set(missing)].join(', ') + ' (see ROADMAP G1).');
  if (!ff.available()) throw new Error('FFmpeg is not in vendor/ffmpeg: npm run fetch-ffmpeg');
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Writing ' + OUT);
  const linked = linkMedia();
  try {
    await mosaicScene();
    await freeScene();
  } finally {
    if (linked) fs.unlinkSync(LINK);
  }
})().catch((err) => { console.error(err.message || err); process.exit(1); });
