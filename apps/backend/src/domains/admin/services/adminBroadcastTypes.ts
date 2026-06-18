export const ADMIN_BROADCAST_JOB = 'notifications.admin-broadcast' as const;

export type AdminBroadcastStatus = 'scheduled' | 'sent' | 'cancelled';

export function adminBroadcastJobKey(broadcastId: string): string {
  return `broadcast-${broadcastId}`;
}
