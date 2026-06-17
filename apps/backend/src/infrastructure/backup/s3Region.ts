/**
 * Resolves the AWS SigV4 region for S3-compatible backup destinations.
 * Explicit config wins; otherwise infer from common AWS endpoint host patterns.
 */
export function inferS3RegionFromEndpoint(endpoint: string): string | undefined {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    if (host === 's3.amazonaws.com') return 'us-east-1';
    const pathStyle = host.match(/^s3\.([a-z0-9-]+)\.amazonaws\.com$/);
    if (pathStyle) return pathStyle[1];
    const virtualHosted = host.match(/\.s3\.([a-z0-9-]+)\.amazonaws\.com$/);
    if (virtualHosted) return virtualHosted[1];
  } catch {
    return undefined;
  }
  return undefined;
}

export function resolveS3BackupRegion(endpoint: string, explicitRegion?: string): string {
  const inferred = inferS3RegionFromEndpoint(endpoint);
  if (inferred) return inferred;
  const explicit = explicitRegion?.trim();
  if (explicit) return explicit;
  return 'us-east-1';
}
