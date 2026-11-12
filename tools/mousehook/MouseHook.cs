// The emergency hide's mouse button, from any program. Wallpane runs it as "wallpane-mouse.exe back|forward|middle"
// (lib/mousehook.js). It holds a system-wide low-level mouse hook for that one button, writes "ready" on standard output
// once the hook is in place, then "press" for each press. Other programs no longer get that button while it runs: its
// presses and releases go no further. Every other button and all movement pass straight on. One release does go on:
// that of a press Windows had after all (the hook was late for it, or the helper started while the button was down).
// Kept back, Windows would take the button as held from then on, and clicks would go wrong in every program until a
// release got through, which with the helper running none would. It ends when Wallpane closes its standard input (or
// ends), so it never outlives Wallpane.
//
// Windows waits only a moment for a low-level hook, and one that takes too long it passes by, and since Windows 7 may
// take out without a word. So the hook does next to nothing: it reads the button from the event and wakes a thread that
// writes "press". Everything it runs is compiled before the hook goes in (not on the first press), and the helper runs
// above normal priority, so a PC busy with other work cannot make it late. Should Windows take the hook out all the
// same, it is put in again every 10 seconds.
// Built by scripts/build-mousehook.js with the C# compiler that comes with Windows (.NET Framework 4).
using System;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Threading;

static class MouseHook
{
    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }

    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] static extern bool PeekMessage(out MSG msg, IntPtr hwnd, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern UIntPtr SetTimer(IntPtr hwnd, UIntPtr id, uint ms, IntPtr fn);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);

    const int WH_MOUSE_LL = 14;
    const uint WM_QUIT = 0x0012, WM_TIMER = 0x0113, WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208, WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;
    const int MOUSE_DATA = 8;     // MSLLHOOKSTRUCT: pt (two ints), then mouseData, whose high word names the side button

    static uint down, up, side;   // the button's messages; for a side button which one (1 back, 2 forward), else 0
    static int vk;                // the button's virtual key, to ask Windows whether it takes it as down
    static HookProc keep;         // the hook's delegate, kept alive while the hook is in place
    static int presses;           // presses the writer has still to tell
    static readonly AutoResetEvent pressed = new AutoResetEvent(false);

    // Called by Windows for every mouse event, before any program sees it: reads, counts, returns.
    static IntPtr Hook(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            uint msg = (uint)wParam.ToInt64();
            if ((msg == down || msg == up) && (side == 0 || ((uint)Marshal.ReadInt32(lParam, MOUSE_DATA) >> 16) == side))
            {
                if (msg == down) { Interlocked.Increment(ref presses); pressed.Set(); return (IntPtr)1; }
                // The release. Windows updates a button's state only after the hooks, so here it still says whether it
                // had the press: if so, the release goes on and Windows lets go of the button.
                if (GetAsyncKeyState(vk) < 0) return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    // Tells Wallpane of each press, away from the hook.
    static void Writer()
    {
        for (;;)
        {
            pressed.WaitOne();
            for (int n = Interlocked.Exchange(ref presses, 0); n > 0; n--) Console.Out.Write("press\n");
            Console.Out.Flush();
        }
    }

    static int Main(string[] args)
    {
        string b = args.Length > 0 ? args[0] : "";
        if (b == "middle") { down = WM_MBUTTONDOWN; up = WM_MBUTTONUP; side = 0; vk = 0x04; }
        else if (b == "back" || b == "forward") { down = WM_XBUTTONDOWN; up = WM_XBUTTONUP; side = b == "back" ? 1u : 2u; vk = b == "back" ? 0x05 : 0x06; }
        else { Console.Out.Write("error unknown button\n"); Console.Out.Flush(); return 2; }

        try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.AboveNormal; } catch { }
        Thread.CurrentThread.Priority = ThreadPriority.Highest;   // this thread runs the hook

        // Compile now what the hook runs, and go through it once with an event that is not the button.
        RuntimeHelpers.PrepareMethod(typeof(MouseHook).GetMethod("Hook", BindingFlags.NonPublic | BindingFlags.Static).MethodHandle);
        IntPtr sample = Marshal.AllocHGlobal(32);
        try { Marshal.WriteInt32(sample, MOUSE_DATA, 0); Marshal.ReadInt32(sample, MOUSE_DATA); Hook(0, (IntPtr)0x0200, sample); } finally { Marshal.FreeHGlobal(sample); }
        GetAsyncKeyState(vk);   // and the call the release makes, so its first use costs nothing either

        Thread writer = new Thread(Writer);
        writer.IsBackground = true;
        writer.Start();

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
        // Every 10 seconds a fresh hook goes in front and the old one comes out, so one that Windows took out after all
        // is back within seconds. Windows asks the newest hook first, and it keeps the button, so no press counts twice.
        SetTimer(IntPtr.Zero, UIntPtr.Zero, 10000, IntPtr.Zero);
        while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0)
        {
            if (m.message != WM_TIMER) continue;
            IntPtr fresh = SetWindowsHookEx(WH_MOUSE_LL, keep, GetModuleHandle(null), 0);
            if (fresh != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = fresh; }
        }
        UnhookWindowsHookEx(hook);
        return 0;
    }
}
