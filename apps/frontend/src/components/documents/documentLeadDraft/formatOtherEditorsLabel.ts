import type { DraftPresenceEditor } from './useDocumentLeadDraftPanelState.js';

export function formatOtherEditorsLabel(editors: DraftPresenceEditor[]): string | null {
  if (editors.length === 0) return null;
  if (editors.length === 1) {
    return `${editors[0]?.name ?? 'Someone'} is editing`;
  }
  return `${editors.map((e) => e.name).join(', ')} are editing`;
}
