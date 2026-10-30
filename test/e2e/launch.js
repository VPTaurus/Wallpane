'use strict';
// Starts Wallpane for one test, on that test's data folder (the same folder again after a restart), with its page
// errors collected and the file dialogs answered by the test.
const { _electron: electron } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

async function start(dir) {
  const data = path.join(dir, 'data');
  if (!fs.existsSync(data)) {
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, 'window.json'), JSON.stringify({ wins: { 1: { width: 1024, height: 728 } }, open: [1] }));
  }
  const env = Object.assign({}, process.env, { WALLPANE_USER_DATA: data });
  // WALLPANE_EXE runs the tests against a built app (dist\win-unpacked\Wallpane.exe).
  const app = await electron.launch(process.env.WALLPANE_EXE ? { executablePath: process.env.WALLPANE_EXE, args: [], env } : { args: [root], env });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('body[data-ready="1"]');
  // The next open dialog picks `p`.
  const answer = (p) => app.evaluate(({ dialog }, a) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [].concat(a) }); }, p);
  return { app, page, errors, answer };
}

module.exports = { start, root };
