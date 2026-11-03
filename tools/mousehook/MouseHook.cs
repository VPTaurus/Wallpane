// The emergency hide's mouse button, from any program. Wallpane runs it as "wallpane-mouse.exe back|forward|middle"
// (lib/mousehook.js). It holds a system-wide low-level mouse hook for that one button, writes "ready" on standard output
// once the hook is in place, then "press" for each press. Other programs no longer get that button while it runs: its
// presses and releases go no further. Every other button and all movement pass straight on. It ends when Wallpane
// closes its standard input (or ends), so it never outlives Wallpane.
// Built by scripts/build-mousehook.js with the C# compiler that comes with Windows (.NET Framework 4).
using System;
using System.Runtime.InteropServices;
using System.Threading;

static class MouseHook
{
    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }

    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] static extern bool PeekMessage(out MSG msg, IntPtr hwnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);

    const int WH_MOUSE_LL = 14;
    const uint WM_QUIT = 0x0012, WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208, WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;

    static uint down, up, side;   // the button's messages; for a side button which one (1 back, 2 forward), else 0
    static HookProc keep;         // the hook's delegate, kept alive while the hook is in place

    // Kept short: Windows waits for it before any program sees the mouse.
    static IntPtr Hook(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            uint msg = (uint)wParam.ToInt64();
            if (msg == down || msg == up)
            {
                MSLLHOOKSTRUCT d = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
                if (side == 0 || (d.mouseData >> 16) == side)
                {
                    if (msg == down) { Console.Out.Write("press\n"); Console.Out.Flush(); }
                    return (IntPtr)1;
                }
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    static int Main(string[] args)
    {
        string b = args.Length > 0 ? args[0] : "";
        if (b == "middle") { down = WM_MBUTTONDOWN; up = WM_MBUTTONUP; side = 0; }
        else if (b == "back" || b == "forward") { down = WM_XBUTTONDOWN; up = WM_XBUTTONUP; side = b == "back" ? 1u : 2u; }
        else { Console.Out.Write("error unknown button\n"); Console.Out.Flush(); return 2; }

        MSG m;
        PeekMessage(out m, IntPtr.Zero, 0, 0, 0);   // this thread's message queue, so the watcher below can end the loop
        keep = Hook;
        IntPtr hook = SetWindowsHookEx(WH_MOUSE_LL, keep, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) { Console.Out.Write("error " + Marshal.GetLastWin32Error() + "\n"); Console.Out.Flush(); return 1; }

        uint main = GetCurrentThreadId();
        Thread watch = new Thread(() =>
        {
            try { while (Console.In.Read() >= 0) { } } catch { }
            PostThreadMessage(main, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
        });
        watch.IsBackground = true;
        watch.Start();

        Console.Out.Write("ready\n"); Console.Out.Flush();
        while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
        UnhookWindowsHookEx(hook);
        return 0;
    }
}
