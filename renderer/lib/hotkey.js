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
    Space: 'Space', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Backspace', Insert: 'Insert', Delete: 'Delete',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
    CapsLock: 'Capslock', NumLock: 'Numlock', ScrollLock: 'Scrolllock', PrintScreen: 'PrintScreen',
    AudioVolumeMute: 'VolumeMute', AudioVolumeDown: 'VolumeDown', AudioVolumeUp: 'VolumeUp', MediaPlayPause: 'MediaPlayPause',
    MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack', MediaStop: 'MediaStop'
  };
  var WORDS = ['Space', 'Tab', 'Enter', 'Backspace', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right',
    'Capslock', 'Numlock', 'Scrolllock', 'PrintScreen', 'VolumeMute', 'VolumeDown', 'VolumeUp', 'MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop'];
  var CANON = { 'return': 'Enter' };   // lower case -> the way Electron writes it
  WORDS.forEach(function (w) { CANON[w.toLowerCase()] = w; });
  // Keys that type something (or move the cursor while typing): alone, the emergency key takes them from every program.
  var TYPING = /^(?:[A-Z0-9]|num[0-9]|numadd|numsub|nummult|numdiv|numdec|[`\-=[\]\\;',./]|Space|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/;
  var LABELS = { Super: 'Win', numadd: 'Num +', numsub: 'Num -', nummult: 'Num *', numdiv: 'Num /', numdec: 'Num .', Capslock: 'Caps Lock', Numlock: 'Num Lock', Scrolllock: 'Scroll Lock', PrintScreen: 'Print Screen', VolumeMute: 'Mute key', VolumeDown: 'Volume down key', VolumeUp: 'Volume up key', MediaPlayPause: 'Play/Pause key', MediaNextTrack: 'Next track key', MediaPreviousTrack: 'Previous track key', MediaStop: 'Stop key' };
  var KEYS = /^(?:[A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|num[0-9]|numadd|numsub|nummult|numdiv|numdec|[`\-=[\]\\;',./])$/;

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
    if (/^[a-z]$|^f\d+$/i.test(key)) key = key.toUpperCase();
    else if (CANON[key.toLowerCase()]) key = CANON[key.toLowerCase()];
    if (!KEYS.test(key) && WORDS.indexOf(key) < 0) return null;
    return MODS.filter(function (n) { return mods[n]; }).concat(key).join('+');
  }
  // Why a shortcut can't be the emergency key, or '' when it can. Any key may be it, alone or with modifiers, except
  // the wall mode key and the one that closes windows.
  function problem(accel) {
    var n = normalize(accel);
    if (!n) return 'That key can\'t be a shortcut.';
    if (n === 'F11') return 'F11 is the wall mode key. Pick another.';
    if (n === 'Alt+F4') return 'Alt+F4 closes windows. Pick another.';
    return '';
  }
  // Whether the shortcut is a key that types something, with no Ctrl, Alt or Win: as the emergency key, other programs
  // no longer get it, so typing it anywhere hides the wall.
  function types(accel) {
    var n = normalize(accel), parts = n ? n.split('+') : [], key = parts.pop();
    return !!n && TYPING.test(key) && parts.every(function (p) { return p === 'Shift'; });
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
  // "Ctrl+Shift+H" -> "Ctrl + Shift + H"; Super is the Windows key, numpad and media keys get their names.
  function label(accel) {
    var n = normalize(accel);
    return n ? n.split('+').map(function (p) { return LABELS[p] || p.replace(/^num(\d)$/, 'Num $1'); }).join(' + ') : '';
  }

  return { normalize: normalize, problem: problem, types: types, fromEvent: fromEvent, matches: matches, label: label };
});
