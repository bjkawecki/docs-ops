export function updateStatusPageUrl(
  targetReleaseTag: string,
  installedVersion?: string | null
): string {
  const params = new URLSearchParams({ target: targetReleaseTag });
  if (installedVersion != null && installedVersion.trim() !== '') {
    params.set('from', installedVersion.trim());
  }
  return `/update-status.html?${params.toString()}`;
}

export function openUpdateStatusPage(
  targetReleaseTag: string,
  installedVersion?: string | null
): void {
  window.open(
    updateStatusPageUrl(targetReleaseTag, installedVersion),
    '_blank',
    'noopener,noreferrer'
  );
}
