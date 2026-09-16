// Adapted from Sharpie's keyed comment handling.
// Copyright (c) 2026 Enrique Gonzalez. MIT; see NOTICE.txt.
// Fluent owns the actual fields/list. The engine stores ranges, never replaces
// or focuses a textarea as a side effect of rendering or undo.
export function rememberCaret(element, id, field = 'comment') {
  return { id, field, start: element.selectionStart, end: element.selectionEnd,
    direction: element.selectionDirection || 'none' };
}

export function restoreCaret(element, caret, id, field = 'comment') {
  if (!caret || caret.id !== id || caret.field !== field) return false;
  element.setSelectionRange(caret.start, caret.end, caret.direction);
  return true;
}
