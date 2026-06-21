const ONLINE_THRESHOLD_MS = 5 * 60_000;

/**
 * Formats presence for scope people UI (English).
 */
export function formatPresence(isOnline: boolean, lastActiveAt: string | null): string {
  if (isOnline) return 'Online';
  if (lastActiveAt == null) return 'Last seen unknown';

  const last = new Date(lastActiveAt);
  const diffMs = Date.now() - last.getTime();
  if (diffMs < 0) return 'Online';

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'Active just now';
  if (diffMinutes < 60) return `Active ${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Last seen ${diffDays}d ago`;

  return `Last seen ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** Client-side online hint when API flag is stale (optional fallback). */
export function isLikelyOnline(lastActiveAt: string | null): boolean {
  if (lastActiveAt == null) return false;
  return Date.now() - new Date(lastActiveAt).getTime() <= ONLINE_THRESHOLD_MS;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1][0] ?? '';
  return `${first}${last}`.toUpperCase();
}
