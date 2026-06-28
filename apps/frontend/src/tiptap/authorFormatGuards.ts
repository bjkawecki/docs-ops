import type { Editor } from '@tiptap/core';

function hasSuggestionMark(marks: readonly { type: { name: string } }[], name: string): boolean {
  return marks.some((m) => m.type.name === name);
}

function isCanonText(marks: readonly { type: { name: string } }[]): boolean {
  return (
    !hasSuggestionMark(marks, 'suggestionInsert') && !hasSuggestionMark(marks, 'suggestionDelete')
  );
}

/**
 * True when the current selection includes unmarked canon text (formatting would fail author save).
 */
export function authorSelectionTouchesCanon(editor: Editor): boolean {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) {
    return isCanonText(state.doc.resolve(from).marks());
  }

  let touchesCanon = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (touchesCanon || !node.isText) return;
    if (isCanonText(node.marks)) touchesCanon = true;
  });
  return touchesCanon;
}
