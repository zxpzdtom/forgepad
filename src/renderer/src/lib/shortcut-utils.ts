import type { ShortcutActionId, ShortcutCombo } from '@shared/types';

/**
 * Serialize a combo to a stable string key for comparison/dedup.
 * e.g., "meta+shift+t"
 */
export function comboToString(combo: ShortcutCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('ctrl');
  if (combo.alt) parts.push('alt');
  if (combo.shift) parts.push('shift');
  if (combo.meta) parts.push('meta');
  parts.push(combo.key.toLowerCase());
  return parts.join('+');
}

const KEY_DISPLAY: Record<string, string> = {
  tab: 'Tab',
  enter: 'Return',
  backspace: 'Delete',
  delete: 'Fn Delete',
  escape: 'Esc',
  arrowup: '\u2191',
  arrowdown: '\u2193',
  arrowleft: '\u2190',
  arrowright: '\u2192',
  ' ': 'Space',
  ',': ',',
};

/**
 * Format a combo for display using macOS modifier symbols.
 * Output example: "⌃⌥⇧⌘T"
 */
export function comboToDisplay(combo: ShortcutCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('\u2303');
  if (combo.alt) parts.push('\u2325');
  if (combo.shift) parts.push('\u21E7');
  if (combo.meta) parts.push('\u2318');

  const displayKey = KEY_DISPLAY[combo.key.toLowerCase()] ?? combo.key.toUpperCase();
  parts.push(displayKey);

  return parts.join('');
}

/**
 * Format modifier symbols and key separately (for rendering as separate kbd elements).
 */
export function comboToParts(combo: ShortcutCombo): {
  modifiers: string;
  key: string;
} {
  const mods: string[] = [];
  if (combo.ctrl) mods.push('\u2303');
  if (combo.alt) mods.push('\u2325');
  if (combo.shift) mods.push('\u21E7');
  if (combo.meta) mods.push('\u2318');

  const displayKey = KEY_DISPLAY[combo.key.toLowerCase()] ?? combo.key.toUpperCase();

  return { modifiers: mods.join(''), key: displayKey };
}

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Shift', 'Alt']);

/**
 * Derive the "logical" key from a KeyboardEvent.
 *
 * On macOS, pressing Option+<key> produces special Unicode characters in `e.key`
 * (e.g. Option+1 → "¡", Option+2 → "™").  When the shortcut uses Alt/Option we
 * fall back to `e.code` to recover the original key.
 */
function logicalKey(e: KeyboardEvent): string {
  if (e.altKey && e.code) {
    // e.code: "Digit1" → "1", "KeyA" → "a", "BracketLeft" → "["
    if (e.code.startsWith('Digit')) return e.code[5];
    if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase();
    const codeMap: Record<string, string> = {
      BracketLeft: '[',
      BracketRight: ']',
      Backslash: '\\',
      Semicolon: ';',
      Quote: "'",
      Comma: ',',
      Period: '.',
      Slash: '/',
      Minus: '-',
      Equal: '=',
      Backquote: '`',
    };
    if (codeMap[e.code]) return codeMap[e.code];
  }
  return e.key.toLowerCase();
}

/**
 * Extract a ShortcutCombo from a live KeyboardEvent.
 * Returns null if only modifiers are pressed (no "real" key yet).
 */
export function comboFromEvent(e: KeyboardEvent): ShortcutCombo | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  return {
    meta: e.metaKey,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    key: e.altKey ? logicalKey(e) : e.key.toLowerCase(),
  };
}

/**
 * Check if a KeyboardEvent matches a ShortcutCombo.
 */
export function eventMatchesCombo(e: KeyboardEvent, combo: ShortcutCombo): boolean {
  return (
    e.metaKey === combo.meta &&
    e.ctrlKey === combo.ctrl &&
    e.shiftKey === combo.shift &&
    e.altKey === combo.alt &&
    logicalKey(e) === combo.key
  );
}

/**
 * Find conflicts: returns the action ID that already uses this combo, or null.
 */
export function findConflict(
  combo: ShortcutCombo,
  shortcuts: Record<ShortcutActionId, ShortcutCombo>,
  excludeAction: ShortcutActionId,
): ShortcutActionId | null {
  const target = comboToString(combo);
  for (const [actionId, existing] of Object.entries(shortcuts)) {
    if (actionId === excludeAction) continue;
    if (comboToString(existing) === target) return actionId as ShortcutActionId;
  }
  return null;
}
