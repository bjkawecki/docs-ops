import { apiFetch } from '../../../api/client.js';
import type { LeadDraftResponse } from '../../../api/document-types.js';

export const leadDraftQueryKey = (documentId: string) =>
  ['document', documentId, 'lead-draft'] as const;

export async function fetchLeadDraft(
  documentId: string
): Promise<LeadDraftResponse | { forbidden: true }> {
  const res = await apiFetch(`/api/v1/documents/${documentId}/lead-draft`);
  if (res.status === 403) return { forbidden: true as const };
  if (res.status === 404) throw new Error('not-found');
  if (!res.ok) throw new Error('lead-draft');
  return res.json() as Promise<LeadDraftResponse>;
}

export function collaborationHintQueryKey(documentId: string) {
  return ['document', documentId, 'collaboration-hint'] as const;
}
