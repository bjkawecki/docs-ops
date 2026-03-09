/**
 * Formats an ISO date string for use in tables.
 * @param iso - ISO 8601 date string
 * @param options.withTime - If true, include time (for "Deleted at" / "Archived at"); default false for "Last updated"
 */
export function formatTableDate(iso: string, options?: { withTime?: boolean }): string {
  try {
    const date = new Date(iso);
    if (options?.withTime) {
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
