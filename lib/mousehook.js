'use strict';
// The emergency hide's mouse button in every program: runs the small helper (tools/mousehook, built into
// wallpane-mouse.exe) that holds a system-wide hook for that one button, and calls onPress for each press. The helper
// tells when its hook is in place ("ready"); until then, or when it cannot run, the page still catches the button over
// Wallpane's own windows. onChange(ok) reports whether it works. The helper ends with Wallpane (its input closes).
const fs = require('fs');
const { spawn } = require('child_process');

const BUTTONS = ['middle', 'back', 'forward'];

function createMouseHook(o) {
  const exe = o.exe, onPress = o.onPress, onChange = o.onChange || (() => {});
  let child = null, ok = false, watching = '';
  function set(v) { if (ok !== v) { ok = v; onChange(v); } }
  function stop() {
    const c = child;
    child = null; watching = '';
    set(false);
    if (c) { try { c.stdin.end(); } catch { /* gone */ } setTimeout(() => { if (c.exitCode === null) c.kill(); }, 2000).unref(); }
  }
  // Watch for this button ('' or none: let go of it). The same button again leaves the running helper as it is.
  function start(button) {
    if (child && button === watching) return;
    stop();
    if (!BUTTONS.includes(button) || !fs.existsSync(exe)) return;
    let c;
    try { c = spawn(exe, [button], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); } catch { return; }
    child = c; watching = button;
    let buf = '';
    c.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach((l) => {
        if (child !== c) return;
        if (l === 'ready') set(true);
        else if (l === 'press') onPress();
      });
    });
    const gone = () => { if (child === c) { child = null; watching = ''; set(false); } };
    c.on('exit', gone);
    c.on('error', gone);
    c.stdin.on('error', () => { /* it has ended */ });
  }
  return { start, stop, ok: () => ok };
}

module.exports = { createMouseHook, BUTTONS };
