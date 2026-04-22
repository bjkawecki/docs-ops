export type NotificationItem = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  /** Current document title when still in DB; null if missing or no document in payload. */
  documentTitle?: string | null;
};

export type NotificationsResponse = {
  items: NotificationItem[];
  total: number;
  limit: number;
  offset: number;
};

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_LIMIT = 10;

export const ME_NOTIFICATION_CATEGORIES = ['all', 'documents', 'reviews', 'system', 'org'] as const;
export type MeNotificationCategory = (typeof ME_NOTIFICATION_CATEGORIES)[number];
