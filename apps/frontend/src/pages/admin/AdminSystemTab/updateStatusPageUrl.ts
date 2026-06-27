export function updateStatusPageUrl(targetReleaseTag: string): string {
  return `/update-status.html?target=${encodeURIComponent(targetReleaseTag)}`;
}

export function openUpdateStatusPage(targetReleaseTag: string): void {
  window.open(updateStatusPageUrl(targetReleaseTag), '_blank', 'noopener,noreferrer');
}
