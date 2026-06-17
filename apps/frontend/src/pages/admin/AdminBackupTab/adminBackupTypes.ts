export type BackupStatus = {
  minioAvailable: boolean;
  workerConnected: boolean;
  maintenanceActive: boolean;
  encryptionConfigured: boolean;
  retentionCount: number;
  defaultDestinationId: string | null;
  autoBackupConfigured: boolean;
  schedule: { enabled: boolean; cron: string | null; tz: string | null };
};

export type Destination = {
  id: string;
  name: string;
  type: 'S3_COMPATIBLE' | 'SSH';
  enabled: boolean;
  configJson: Record<string, unknown>;
};

export type BackupRun = {
  id: string;
  status: string;
  triggerSource: string;
  sizeBytes: number | null;
  createdAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  destination: { id: string; name: string } | null;
  localObjectKey: string | null;
  remotePath: string | null;
};

export const BACKUP_STATUS_COLOR: Record<string, string> = {
  queued: 'gray',
  running: 'blue',
  uploading: 'cyan',
  succeeded: 'green',
  failed: 'red',
};

export type BackupSchedulePreset = 'daily-3utc' | 'weekly-mon-3utc';

export const BACKUP_SCHEDULE_PRESETS: Array<{
  value: BackupSchedulePreset;
  label: string;
  cron: string;
  tz: string;
}> = [
  { value: 'daily-3utc', label: 'Daily at 03:00 UTC', cron: '0 3 * * *', tz: 'UTC' },
  {
    value: 'weekly-mon-3utc',
    label: 'Weekly on Monday at 03:00 UTC',
    cron: '0 3 * * 1',
    tz: 'UTC',
  },
];
