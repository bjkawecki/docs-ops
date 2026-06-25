import type { AdminUpdateRun } from 'backend/api-types';

export type UpdateProgressStep = {
  key: string;
  label: string;
  detail: string;
  estimate: string;
};

export const UPDATE_PROGRESS_STEPS: UpdateProgressStep[] = [
  {
    key: 'backup',
    label: 'Create operational backup',
    detail: 'Database and attachments are archived before any files change.',
    estimate: '2–10 min',
  },
  {
    key: 'apply',
    label: 'Apply release',
    detail: 'Pull container images and restart the production stack.',
    estimate: '3–8 min',
  },
  {
    key: 'health',
    label: 'Wait for services',
    detail: 'Containers restart; the API may be briefly unavailable.',
    estimate: '1–3 min',
  },
  {
    key: 'reload',
    label: 'Reload this page',
    detail: 'After the stack is healthy, reload to use the new version.',
    estimate: '',
  },
];

export function updateProgressStepIndex(status: AdminUpdateRun['status']): number {
  switch (status) {
    case 'queued':
    case 'backing_up':
      return 0;
    case 'applying':
      return 1;
    case 'succeeded':
      return UPDATE_PROGRESS_STEPS.length;
    case 'failed':
      return -1;
    default:
      return 0;
  }
}

export function formatElapsedSince(iso: string | null | undefined, nowMs: number): string | null {
  if (iso == null) return null;
  const started = Date.parse(iso);
  if (Number.isNaN(started)) return null;
  const totalSec = Math.max(0, Math.floor((nowMs - started) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}s`;
  return `${min} min ${sec}s`;
}
