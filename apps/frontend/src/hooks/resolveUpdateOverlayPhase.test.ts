import { describe, expect, it } from 'vitest';
import { resolveUpdateOverlayPhase } from './resolveUpdateOverlayPhase.js';

describe('resolveUpdateOverlayPhase', () => {
  it('returns preparing during early update with API up', () => {
    expect(
      resolveUpdateOverlayPhase({
        runFailed: false,
        liveInProgress: true,
        agentPhase: 'pull_images',
        sticky: true,
        apiReachable: true,
        recoveryPolling: false,
        recoverySuccess: false,
        recoveryVersion: null,
        targetVersion: '0.1.1',
      })
    ).toBe('preparing');
  });

  it('returns restarting during compose_up', () => {
    expect(
      resolveUpdateOverlayPhase({
        runFailed: false,
        liveInProgress: true,
        agentPhase: 'compose_up',
        sticky: true,
        apiReachable: true,
        recoveryPolling: false,
        recoverySuccess: false,
        recoveryVersion: null,
        targetVersion: '0.1.1',
      })
    ).toBe('restarting');
  });

  it('returns reload when API is back but version not yet matched', () => {
    expect(
      resolveUpdateOverlayPhase({
        runFailed: false,
        liveInProgress: false,
        agentPhase: null,
        sticky: true,
        apiReachable: true,
        recoveryPolling: true,
        recoverySuccess: true,
        recoveryVersion: '0.1.0',
        targetVersion: '0.1.1',
      })
    ).toBe('reload');
  });

  it('returns success when recovered version matches target', () => {
    expect(
      resolveUpdateOverlayPhase({
        runFailed: false,
        liveInProgress: false,
        agentPhase: null,
        sticky: true,
        apiReachable: true,
        recoveryPolling: true,
        recoverySuccess: true,
        recoveryVersion: '0.1.1',
        targetVersion: '0.1.1',
      })
    ).toBe('success');
  });
});
