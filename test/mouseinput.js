'use strict';
// For tests of the emergency hide's mouse helper: presses and lets go of a side mouse button the way a real mouse does
// (Windows' SendInput, through PowerShell), so a system-wide hook sees it. 1 is Back, 2 is Forward. pressSide returns how
// many events Windows took (2), or 0 where it would not (no desktop to send to). sideDown and sideUp send one half each
// (1, or 0); pointTo puts the pointer on a screen point, windowAt says which window is there; holdsMouse says whether a
// window (by its handle) holds the mouse, as one does from a button's press until its release.
const { execFile } = require('child_process');

const PS = `Add-Type @"
using System; using System.Runtime.InteropServices;
public static class WallpaneTestMouse {
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct IN { public uint type; public MI mi; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int l, t, r, b; }
  [StructLayout(LayoutKind.Sequential)] public struct GUI { public int size, flags; public IntPtr active, focus, capture, menu, move, caret; public RECT rc; }
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, IN[] i, int size);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w, IntPtr pid);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread, ref GUI info);
  [StructLayout(LayoutKind.Sequential)] public struct PT { public int x, y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(PT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr w, uint flags);
  public static long At(int x, int y) { var p = new PT(); p.x = x; p.y = y; return (long)GetAncestor(WindowFromPoint(p), 2); }
  public static uint Send(uint b, params uint[] flags) { var a = new IN[flags.Length]; for (int i = 0; i < flags.Length; i++) { a[i].mi.data = b; a[i].mi.flags = flags[i]; } return SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(IN))); }
  public static long Capture(long w) { var g = new GUI(); g.size = Marshal.SizeOf(typeof(GUI)); GetGUIThreadInfo(GetWindowThreadProcessId((IntPtr)w, IntPtr.Zero), ref g); return (long)g.capture; }
}
"@
CALL`;

function run(call) {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS.replace('CALL', call)], { windowsHide: true, timeout: 60000 },
      (err, out) => resolve(err ? null : String(out).trim()));
  });
}
const side = (button) => (button === 1 ? 1 : 2);
const count = (out) => parseInt(out || '', 10) || 0;

const pressSide = async (button) => count(await run('[WallpaneTestMouse]::Send(' + side(button) + ', 0x80, 0x100)'));
const sideDown = async (button) => count(await run('[WallpaneTestMouse]::Send(' + side(button) + ', 0x80)'));
const sideUp = async (button) => count(await run('[WallpaneTestMouse]::Send(' + side(button) + ', 0x100)'));
const pointTo = async (x, y) => (await run('[WallpaneTestMouse]::SetCursorPos(' + Math.round(x) + ', ' + Math.round(y) + ')')) === 'True';
// Whether the window with this handle (a number, as BrowserWindow.getNativeWindowHandle gives it), or another window of
// its thread (Chromium may give the mouse to an inner one), holds the mouse.
const holdsMouse = async (hwnd) => Number(await run('[WallpaneTestMouse]::Capture(' + hwnd + ')')) > 0;
// The top-level window at a screen point (its handle, a number).
const windowAt = async (x, y) => Number(await run('[WallpaneTestMouse]::At(' + Math.round(x) + ', ' + Math.round(y) + ')')) || 0;

module.exports = { pressSide, sideDown, sideUp, pointTo, holdsMouse, windowAt };
