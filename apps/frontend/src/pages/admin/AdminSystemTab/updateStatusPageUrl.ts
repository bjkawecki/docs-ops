export function updateStatusPageUrl(targetReleaseTag: string): string {
  return `/update-status.html?target=${encodeURIComponent(targetReleaseTag)}`;
}

export function openUpdateStatusPage(targetReleaseTag: string): void {
  window.open(updateStatusPageUrl(targetReleaseTag), '_blank', 'noopener,noreferrer');
}

export function goToUpdateStatusPage(targetReleaseTag: string): void {
  window.location.href = updateStatusPageUrl(targetReleaseTag);
}
