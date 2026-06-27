export function updateStatusPageUrl(targetReleaseTag: string): string {
  return `/update-status.html?target=${encodeURIComponent(targetReleaseTag)}`;
}

export function goToUpdateStatusPage(targetReleaseTag: string): void {
  window.location.href = updateStatusPageUrl(targetReleaseTag);
}
