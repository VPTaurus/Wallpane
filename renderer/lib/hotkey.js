// Shortcut keys written as Electron accelerators ("Ctrl+Shift+H"): made from a key press, checked, compared and shown.
// The main process uses the same rules for the emergency hide key.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.MW = root.MW || {}).hotkey = factory();
})(this, function () {
  'use strict';
  var MODS = ['Ctrl', 'Alt', 'Shift', 'Super'];
  var ALIAS = { control: 'Ctrl', ctrl: 'Ctrl', commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', super: 'Super', meta: 'Super', win: 'Super', cmd: 'Super', command: 'Super' };
  // KeyboardEvent.code -> the key's name in an accelerator. Codes, not characters, so the keyboard layout doesn't matter.
  var NAMED = {
    Space: 'Space', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec'
  };
  var KEYS = /^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|num[0-9]|numadd|numsub|nummult|numdiv|numdec|Space|Insert|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right|[`\-=[\]\\;',./])$/;

  function keyOfCode(code) {
    var m = /^Key([A-Z])$/.exec(code) || /^Digit([0-9])$/.exec(code) || /^(F(?:[1-9]|1\d|2[0-4]))$/.exec(code);
    if (m) return m[1];
    if ((m = /^Numpad([0-9])$/.exec(code))) return 'num' + m[1];
    return NAMED[code] || null;
  }
  // Modifiers in a fixed order, then the key. Null when the text is not a shortcut we take.
  function normalize(accel) {
    if (typeof accel !== 'string' || !accel) return null;
    var parts = accel.replace(/\+\+$/, '+Plus').split('+'), key = parts.pop(), mods = {};
    for (var i = 0; i < parts.length; i++) {
      var m = ALIAS[parts[i].trim().toLowerCase()];
      if (!m || mods[m]) return null;
      mods[m] = true;
    }
    key = key.trim();
    if (/^[a-z]$/.test(key)) key = key.toUpperCase();
    if (/^f\d+$/i.test(key)) key = key.toUpperCase();
    if (!KEYS.test(key)) return null;
    return MODS.filter(function (n) { return mods[n]; }).concat(key).join('+');
  }
  // Why a shortcut can't be the emergency key, or '' when it can. A global shortcut takes the keys from every other
  // program, so plain letters need two modifiers (Ctrl+H alone would take Replace from every editor).
  function problem(accel) {
    var n = normalize(accel);
    if (!n) return 'That key can\'t be a shortcut.';
    var parts = n.split('+'), key = parts.pop(), fkey = /^F\d+$/.test(key);
    if (fkey && !parts.length && key === 'F11') return 'F11 is the wall mode key. Pick another.';
    if (n === 'Alt+F4') return 'Alt+F4 closes windows. Pick another.';
    if (fkey) return '';
    if (!parts.some(function (p) { return p !== 'Shift'; }) || parts.length < 2) return 'Use two modifier keys with it, like Ctrl+Shift.';
    return '';
  }
  // A key press -> { accel } or { error }; null while only modifier keys are held.
  function fromEvent(e) {
    if (/^(?:Control|Shift|Alt|Meta|OS|AltGraph)$/.test(e.key)) return null;
    var key = keyOfCode(e.code);
    if (!key) return { error: 'That key can\'t be a shortcut.' };
    var mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    var accel = mods.concat(key).join('+'), err = problem(accel);
    return err ? { error: err, accel: accel } : { accel: accel };
  }
  // Whether a key press is this shortcut.
  function matches(e, accel) {
    var n = normalize(accel), r = n && fromEvent(e);
    return !!(r && r.accel === n);
  }
  // "Ctrl+Shift+H" -> "Ctrl + Shift + H"; Super is the Windows key.
  function label(accel) {
    var n = normalize(accel);
    return n ? n.split('+').map(function (p) { return p === 'Super' ? 'Win' : p; }).join(' + ') : '';
  }

  return { normalize: normalize, problem: problem, fromEvent: fromEvent, matches: matches, label: label };
});
