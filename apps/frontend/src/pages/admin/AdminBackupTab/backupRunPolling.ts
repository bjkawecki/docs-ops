import type { BackupRun } from './adminBackupTypes';

const IN_PROGRESS_BACKUP_STATUSES = new Set(['queued', 'running', 'uploading']);

export const BACKUP_RUN_POLL_INTERVAL_MS = 3000;

/** Keep polling briefly after "Backup now" until the new run appears in the list. */
export const BACKUP_POLL_BOOST_MS = 90_000;

export function hasInProgressBackupRun(runs: BackupRun[] | undefined): boolean {
  return runs?.some((r) => IN_PROGRESS_BACKUP_STATUSES.has(r.status)) ?? false;
}

export function shouldPollBackupRuns(
  runs: BackupRun[] | undefined,
  pollBoostUntilMs: number
): boolean {
  if (Date.now() < pollBoostUntilMs) return true;
  return hasInProgressBackupRun(runs);
}

export function isInProgressBackupStatus(status: string): boolean {
  return IN_PROGRESS_BACKUP_STATUSES.has(status);
}

export function formatExternalDestinationLabel(run: BackupRun): string {
  if (run.destination?.name) return run.destination.name;
  if (run.status === 'succeeded') return 'Local only';
  return '–';
}
