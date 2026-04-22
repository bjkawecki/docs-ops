import { ME_NOTIFICATION_CATEGORIES, type MeNotificationCategory } from './meNotificationTypes.js';

export function parseMeNotificationCategory(raw: string | null): MeNotificationCategory {
  if (raw != null && ME_NOTIFICATION_CATEGORIES.includes(raw as MeNotificationCategory)) {
    return raw as MeNotificationCategory;
  }
  return 'all';
}

/** `unreadOnly` query param for `/notifications` (coerced booleans are unsafe for `"false"`). */
export function parseMeNotificationUnreadOnly(raw: string | null): boolean {
  if (raw == null || raw === '') return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function meNotificationsListQueryKey(
  limit: number,
  offset: number,
  unreadOnly: boolean,
  category: MeNotificationCategory
): readonly ['me', 'notifications', number, number, boolean, MeNotificationCategory] {
  return ['me', 'notifications', limit, offset, unreadOnly, category];
}
