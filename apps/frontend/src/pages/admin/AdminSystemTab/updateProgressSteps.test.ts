import { describe, expect, it } from 'vitest';
import {
  agentPhaseStepIndex,
  formatAgentPhaseLabel,
  isRestartPhase,
  updateProgressStepIndex,
  UPDATE_PROGRESS_STEPS,
} from './updateProgressSteps.js';

describe('formatAgentPhaseLabel', () => {
  it('maps known agent phases to readable labels', () => {
    expect(formatAgentPhaseLabel('compose_up')).toBe('Restarting containers');
    expect(formatAgentPhaseLabel('wait_health')).toBe('Waiting for health check');
  });

  it('returns null for empty phase', () => {
    expect(formatAgentPhaseLabel(null)).toBeNull();
    expect(formatAgentPhaseLabel('')).toBeNull();
  });
});

describe('isRestartPhase', () => {
  it('identifies restart-related phases', () => {
    expect(isRestartPhase('compose_up')).toBe(true);
    expect(isRestartPhase('wait_health')).toBe(true);
    expect(isRestartPhase('pull_images')).toBe(false);
  });
});

describe('updateProgressStepIndex', () => {
  it('returns full step count for succeeded', () => {
    expect(updateProgressStepIndex('succeeded')).toBe(UPDATE_PROGRESS_STEPS.length);
  });

  it('maps applying to apply step', () => {
    expect(updateProgressStepIndex('applying')).toBe(1);
  });
});

describe('agentPhaseStepIndex', () => {
  it('maps compose_up to wait-for-services step', () => {
    expect(agentPhaseStepIndex('compose_up')).toBe(2);
  });

  it('maps agent succeeded to reload step', () => {
    expect(agentPhaseStepIndex('succeeded')).toBe(3);
  });
});
