'use strict';
// Builds the emergency hide's mouse helper (tools/mousehook/MouseHook.cs) into vendor/mousehook/wallpane-mouse.exe,
// where the app finds it while developing and electron-builder ships it from (resources/mousehook in the built app).
// It uses the C# compiler that comes with Windows (.NET Framework 4), so nothing is downloaded. Does nothing when the
// helper is newer than its source. Runs before start, the end-to-end tests and dist: npm run build-mousehook
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'tools', 'mousehook', 'MouseHook.cs');
const OUT = path.join(__dirname, '..', 'vendor', 'mousehook', 'wallpane-mouse.exe');
const CSC = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');

function fresh() {
  try { return fs.statSync(OUT).mtimeMs >= fs.statSync(SRC).mtimeMs; } catch { return false; }
}

if (process.platform !== 'win32') console.log('The mouse helper is for Windows only; skipped.');
else if (fresh()) console.log('Mouse helper is up to date: ' + OUT);
else if (!fs.existsSync(CSC)) {
  // Without it the mouse button still works over Wallpane's own windows.
  console.warn('No C# compiler at ' + CSC + ' (it comes with .NET Framework 4); the mouse helper was not built.');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  execFileSync(CSC, ['/nologo', '/target:exe', '/optimize+', '/out:' + OUT, SRC], { stdio: 'inherit' });
  console.log('Built ' + OUT);
}
