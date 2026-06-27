import type { AdminUpdateRun } from 'backend/api-types';

export type UpdateProgressStep = {
  key: string;
  label: string;
  detail: string;
};

export const UPDATE_PROGRESS_STEPS: UpdateProgressStep[] = [
  {
    key: 'backup',
    label: 'Create operational backup',
    detail: 'Database and attachments are archived before any files change.',
  },
  {
    key: 'apply',
    label: 'Apply release',
    detail: 'Download bundle, update configuration, pull images, and restart the stack.',
  },
  {
    key: 'health',
    label: 'Wait for services',
    detail:
      'Containers are restarting. The app may be temporarily unreachable. Connection errors during this step are expected.',
  },
  {
    key: 'reload',
    label: 'Reload this page',
    detail: 'After the stack is healthy, reload to use the new version.',
  },
];

const AGENT_PHASE_LABELS: Record<string, string> = {
  preflight: 'Running preflight checks',
  download_bundle: 'Downloading release bundle',
  extract_bundle: 'Extracting release bundle',
  patch_env: 'Updating configuration',
  pull_images: 'Pulling images',
  compose_up: 'Restarting containers',
  wait_health: 'Waiting for health check',
  verify_version: 'Verifying version',
  cleanup: 'Finishing up',
  succeeded: 'Update finished on server',
  failed: 'Update failed',
};

const RESTART_AGENT_PHASES = new Set(['compose_up', 'wait_health', 'verify_version']);

export function formatAgentPhaseLabel(phase: string | null | undefined): string | null {
  if (phase == null || phase.trim() === '') return null;
  return AGENT_PHASE_LABELS[phase] ?? phase.replace(/_/g, ' ');
}

export function isRestartPhase(phase: string | null | undefined): boolean {
  if (phase == null || phase.trim() === '') return false;
  return RESTART_AGENT_PHASES.has(phase);
}

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

const AGENT_PHASE_STEP: Record<string, number> = {
  preflight: 1,
  download_bundle: 1,
  extract_bundle: 1,
  patch_env: 1,
  pull_images: 1,
  compose_up: 2,
  wait_health: 2,
  verify_version: 2,
  cleanup: 2,
  succeeded: 3,
  failed: -1,
};

export function agentPhaseStepIndex(phase: string): number {
  return AGENT_PHASE_STEP[phase] ?? 1;
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
