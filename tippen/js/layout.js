// German QWERTZ keyboard: the characters each key produces and the finger that types it.
(function () {
  'use strict';

  // Hand and finger for each physical column (0 = far left, 12 = far right).
  const FINGER_BY_COL = [
    { hand: 'left', finger: 'pinky' },
    { hand: 'left', finger: 'pinky' },
    { hand: 'left', finger: 'ring' },
    { hand: 'left', finger: 'middle' },
    { hand: 'left', finger: 'index' },
    { hand: 'left', finger: 'index' },
    { hand: 'right', finger: 'index' },
    { hand: 'right', finger: 'index' },
    { hand: 'right', finger: 'middle' },
    { hand: 'right', finger: 'ring' },
    { hand: 'right', finger: 'pinky' },
    { hand: 'right', finger: 'pinky' },
    { hand: 'right', finger: 'pinky' }
  ];

  // Character keys per row (row 0 = number row, row 3 = bottom letter row).
  // plain = without modifier, shift = with Shift, altgr = with AltGr (Mac: Option).
  const ROW_DEFS = [
    [
      { col: 0, plain: '^', shift: '°', dead: true },
      { col: 1, plain: '1', shift: '!' },
      { col: 2, plain: '2', shift: '"', altgr: '²' },
      { col: 3, plain: '3', shift: '§', altgr: '³' },
      { col: 4, plain: '4', shift: '$' },
      { col: 5, plain: '5', shift: '%' },
      { col: 6, plain: '6', shift: '&' },
      { col: 7, plain: '7', shift: '/', altgr: '{' },
      { col: 8, plain: '8', shift: '(', altgr: '[' },
      { col: 9, plain: '9', shift: ')', altgr: ']' },
      { col: 10, plain: '0', shift: '=', altgr: '}' },
      { col: 11, plain: 'ß', shift: '?', altgr: '\\' },
      { col: 12, plain: '´', shift: '`', dead: true }
    ],
    [
      { col: 1, plain: 'q', shift: 'Q', altgr: '@' },
      { col: 2, plain: 'w', shift: 'W' },
      { col: 3, plain: 'e', shift: 'E', altgr: '€' },
      { col: 4, plain: 'r', shift: 'R' },
      { col: 5, plain: 't', shift: 'T' },
      { col: 6, plain: 'z', shift: 'Z' },
      { col: 7, plain: 'u', shift: 'U' },
      { col: 8, plain: 'i', shift: 'I' },
      { col: 9, plain: 'o', shift: 'O' },
      { col: 10, plain: 'p', shift: 'P' },
      { col: 11, plain: 'ü', shift: 'Ü' },
      { col: 12, plain: '+', shift: '*', altgr: '~' }
    ],
    [
      { col: 1, plain: 'a', shift: 'A' },
      { col: 2, plain: 's', shift: 'S' },
      { col: 3, plain: 'd', shift: 'D' },
      { col: 4, plain: 'f', shift: 'F' },
      { col: 5, plain: 'g', shift: 'G' },
      { col: 6, plain: 'h', shift: 'H' },
      { col: 7, plain: 'j', shift: 'J' },
      { col: 8, plain: 'k', shift: 'K' },
      { col: 9, plain: 'l', shift: 'L' },
      { col: 10, plain: 'ö', shift: 'Ö' },
      { col: 11, plain: 'ä', shift: 'Ä' },
      { col: 12, plain: '#', shift: "'" }
    ],
    [
      { col: 0, plain: '<', shift: '>', altgr: '|' },
      { col: 1, plain: 'y', shift: 'Y' },
      { col: 2, plain: 'x', shift: 'X' },
      { col: 3, plain: 'c', shift: 'C' },
      { col: 4, plain: 'v', shift: 'V' },
      { col: 5, plain: 'b', shift: 'B' },
      { col: 6, plain: 'n', shift: 'N' },
      { col: 7, plain: 'm', shift: 'M' },
      { col: 8, plain: ',', shift: ';' },
      { col: 9, plain: '.', shift: ':' },
      { col: 10, plain: '-', shift: '_' }
    ]
  ];

  const ROWS = ROW_DEFS.map((defs, row) => defs.map(def => {
    const { hand, finger } = FINGER_BY_COL[def.col];
    return {
      id: `r${row}c${def.col}`,
      row,
      col: def.col,
      plain: def.plain,
      shift: def.shift || null,
      altgr: def.altgr || null,
      dead: Boolean(def.dead),
      hand,
      finger
    };
  }));

  // Keys without a character. gridColumn places them in the 15-column keyboard grid.
  const MODIFIER_KEYS = [
    { id: 'shift-left', label: '⇧', row: 3, gridColumn: '1 / 2', hand: 'left', finger: 'modifier' },
    { id: 'shift-right', label: '⇧', row: 3, gridColumn: '13 / 15', hand: 'right', finger: 'modifier' },
    { id: 'space', label: 'Leertaste', row: 4, gridColumn: '4 / 12', hand: 'both', finger: 'thumb' },
    { id: 'altgr', label: 'AltGr', row: 4, gridColumn: '12 / 14', hand: 'right', finger: 'modifier' }
  ];

  const FINGER_NAMES = {
    'left-pinky': 'linker kleiner Finger',
    'left-ring': 'linker Ringfinger',
    'left-middle': 'linker Mittelfinger',
    'left-index': 'linker Zeigefinger',
    'right-index': 'rechter Zeigefinger',
    'right-middle': 'rechter Mittelfinger',
    'right-ring': 'rechter Ringfinger',
    'right-pinky': 'rechter kleiner Finger',
    'both-thumb': 'Daumen'
  };

  // Which key types a character, and with which modifier. Returns null for characters not on this keyboard.
  function findKey(ch) {
    if (ch === ' ') {
      return { id: 'space', mod: 'plain', hand: 'both', finger: 'thumb', row: 4, col: null };
    }
    for (const row of ROWS) {
      for (const key of row) {
        if (key.plain === ch) return describe(key, 'plain');
        if (key.shift === ch) return describe(key, 'shift');
        if (key.altgr === ch) return describe(key, 'altgr');
      }
    }
    return null;
  }

  function describe(key, mod) {
    return { id: key.id, mod, hand: key.hand, finger: key.finger, row: key.row, col: key.col };
  }

  function fingerName(info) {
    return FINGER_NAMES[`${info.hand}-${info.finger}`] || '';
  }

  window.TippLayout = { ROWS, MODIFIER_KEYS, findKey, fingerName };
})();
