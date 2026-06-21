/** Online if lastActiveAt is within this many seconds (default 300). */
export function getPresenceOnlineThresholdMs(): number {
  const raw = process.env.PRESENCE_ONLINE_THRESHOLD_SECONDS;
  if (raw == null || raw.trim() === '') return 300_000;
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds) || seconds < 60) return 300_000;
  if (seconds > 3600) return 3_600_000;
  return seconds * 1000;
}

export function isUserOnline(lastActiveAt: Date | null | undefined, now = new Date()): boolean {
  if (lastActiveAt == null) return false;
  return lastActiveAt.getTime() >= now.getTime() - getPresenceOnlineThresholdMs();
}
