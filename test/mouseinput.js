'use strict';
// For tests of the emergency hide's mouse helper: presses and lets go of a side mouse button the way a real mouse does
// (Windows' SendInput, through PowerShell), so a system-wide hook sees it. 1 is Back, 2 is Forward. Returns how many
// events Windows took (2), or 0 where it would not (no desktop to send to).
const { execFile } = require('child_process');

const PS = `Add-Type @"
using System; using System.Runtime.InteropServices;
public static class WallpaneTestMouse {
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct IN { public uint type; public MI mi; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, IN[] i, int size);
  public static uint Press(uint b) { var a = new IN[2]; a[0].mi.data = b; a[0].mi.flags = 0x80; a[1].mi.data = b; a[1].mi.flags = 0x100; return SendInput(2, a, Marshal.SizeOf(typeof(IN))); }
}
"@
[WallpaneTestMouse]::Press(BUTTON)`;

function pressSide(button) {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS.replace('BUTTON', String(button === 1 ? 1 : 2))], { windowsHide: true, timeout: 60000 },
      (err, out) => resolve(err ? 0 : parseInt(String(out).trim(), 10) || 0));
  });
}

module.exports = { pressSide };
