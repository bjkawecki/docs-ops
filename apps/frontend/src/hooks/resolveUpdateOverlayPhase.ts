export type UpdateOverlayPhase = 'preparing' | 'restarting' | 'reload' | 'success' | 'failed';

export type ResolveUpdateOverlayPhaseInput = {
  runFailed: boolean;
  liveInProgress: boolean;
  agentPhase: string | null | undefined;
  sticky: boolean;
  apiReachable: boolean;
  recoveryPolling: boolean;
  recoverySuccess: boolean;
  recoveryVersion: string | null | undefined;
  targetVersion: string | null | undefined;
};

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function versionsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return normalizeVersion(a) === normalizeVersion(b);
}

export function isRestartAgentPhase(phase: string | null | undefined): boolean {
  return phase === 'compose_up' || phase === 'wait_health' || phase === 'verify_version';
}

export function resolveUpdateOverlayPhase(
  input: ResolveUpdateOverlayPhaseInput
): UpdateOverlayPhase {
  if (input.runFailed) return 'failed';

  const restarting =
    input.liveInProgress && (isRestartAgentPhase(input.agentPhase) || !input.apiReachable);

  if (restarting) return 'restarting';

  if (input.liveInProgress) return 'preparing';

  if (input.recoveryPolling) {
    if (input.recoverySuccess) {
      if (versionsMatch(input.recoveryVersion, input.targetVersion)) {
        return 'success';
      }
      return 'reload';
    }
    if (!input.apiReachable && input.sticky) {
      return 'restarting';
    }
  }

  if (input.sticky && input.recoverySuccess) {
    return versionsMatch(input.recoveryVersion, input.targetVersion) ? 'success' : 'reload';
  }

  return 'preparing';
}
