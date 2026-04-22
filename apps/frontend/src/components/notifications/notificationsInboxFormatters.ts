import type { NotificationItem } from './meNotificationTypes.js';

export function eventHeadline(eventType: string): string {
  const labels: Record<string, string> = {
    'document-created': 'Document created',
    'document-updated': 'Document updated',
    'document-deleted': 'Document moved to trash',
    'document-published': 'Document published',
    'document-archived': 'Document archived',
    'document-restored': 'Document restored',
    'document-grants-changed': 'Document access changed',
    'document-comment-created': 'New comment on document',
    'draft-request-submitted': 'Review request submitted',
    'draft-request-merged': 'Review request merged',
    'draft-request-rejected': 'Review request rejected',
  };
  return labels[eventType] ?? eventType.replace(/-/g, ' ');
}

export function payloadDocumentId(payload: Record<string, unknown>): string | null {
  return typeof payload.documentId === 'string' ? payload.documentId : null;
}

function payloadDraftRequestId(payload: Record<string, unknown>): string | null {
  return typeof payload.draftRequestId === 'string' ? payload.draftRequestId : null;
}

export function secondaryDetail(
  eventType: string,
  payload: Record<string, unknown>
): string | null {
  if (eventType === 'document-comment-created') {
    const preview = typeof payload.commentPreview === 'string' ? payload.commentPreview.trim() : '';
    if (preview !== '') return preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;
    return 'Someone commented on a document you can read.';
  }
  const draftId = payloadDraftRequestId(payload);
  if (draftId == null) return null;
  if (eventType === 'draft-request-submitted') return 'A review request is open for this document.';
  if (eventType === 'draft-request-merged')
    return 'Your proposed changes were merged into the published version.';
  if (eventType === 'draft-request-rejected') return 'Your review request was rejected.';
  return 'Related to a review request.';
}

export function documentDisplayTitle(item: NotificationItem): string {
  const docId = payloadDocumentId(item.payload);
  if (docId == null) return 'Activity';
  if (item.documentTitle != null && item.documentTitle.trim() !== '') return item.documentTitle;
  return 'Untitled document';
}
