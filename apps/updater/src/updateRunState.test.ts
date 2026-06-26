import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatUpdateContainerError,
  getUpdateRunStatus,
  mergeInspectIntoState,
  parseDockerInspectOutput,
  readUpdateLogTailFromFile,
  startUpdateRun,
  toPublicStatus,
  UpdateAlreadyRunningError,
  type PersistedUpdateRunState,
  type UpdateRunStateDeps,
} from './updateRunState.js';

function makeDeps(
  overrides: Partial<UpdateRunStateDeps> & { state?: PersistedUpdateRunState | null }
): UpdateRunStateDeps {
  let state = overrides.state ?? null;
  return {
    readState: overrides.readState ?? (() => state),
    writeState:
      overrides.writeState ??
      ((next) => {
        state = next;
      }),
    inspectContainer: overrides.inspectContainer ?? (() => null),
    removeContainer: overrides.removeContainer ?? (() => undefined),
    runExecScript: overrides.runExecScript ?? (() => 'docsops-update-run'),
    readLogTail: overrides.readLogTail ?? (() => undefined),
    readContainerLogs: overrides.readContainerLogs ?? (() => undefined),
  };
}

describe('formatUpdateContainerError', () => {
  it('includes log tail when present', () => {
    const message = formatUpdateContainerError(1, '==> bundle failed');
    assert.match(message, /exited with code 1/);
    assert.match(message, /bundle failed/);
  });
});

describe('parseDockerInspectOutput', () => {
  it('parses running container', () => {
    assert.deepEqual(parseDockerInspectOutput('running|true|0'), {
      status: 'running',
      running: true,
      exitCode: 0,
    });
  });

  it('parses exited container', () => {
    assert.deepEqual(parseDockerInspectOutput('exited|false|1'), {
      status: 'exited',
      running: false,
      exitCode: 1,
    });
  });
});

describe('mergeInspectIntoState', () => {
  const base: PersistedUpdateRunState = {
    running: true,
    version: 'v0.1.1',
    startedAt: '2026-01-01T00:00:00.000Z',
    containerName: 'docsops-update-run',
  };

  it('marks exited inspect as finished with exit code and logs', () => {
    const merged = mergeInspectIntoState(
      base,
      {
        status: 'exited',
        running: false,
        exitCode: 1,
      },
      { logTail: 'tmpdir: unbound variable' }
    );
    assert.equal(merged.running, false);
    assert.equal(merged.exitCode, 1);
    assert.ok(merged.finishedAt);
    assert.match(merged.error ?? '', /tmpdir/);
    assert.equal(merged.containerLogTail, 'tmpdir: unbound variable');
  });

  it('marks missing container as failed while previously running', () => {
    const merged = mergeInspectIntoState(base, null);
    assert.equal(merged.running, false);
    assert.equal(merged.exitCode, 1);
    assert.match(merged.error ?? '', /not found/);
  });
});

describe('getUpdateRunStatus', () => {
  it('returns idle status when no state file', () => {
    assert.deepEqual(getUpdateRunStatus(makeDeps({ state: null })), toPublicStatus(null));
  });

  it('removes container after successful exit', () => {
    let removed: string | null = null;
    const deps = makeDeps({
      state: {
        running: true,
        version: 'v0.1.1',
        startedAt: '2026-01-01T00:00:00.000Z',
        containerName: 'docsops-update-run',
      },
      inspectContainer: () => ({ status: 'exited', running: false, exitCode: 0 }),
      removeContainer: (name) => {
        removed = name;
      },
    });

    const status = getUpdateRunStatus(deps);
    assert.equal(status.running, false);
    assert.equal(status.exitCode, 0);
    assert.equal(removed, 'docsops-update-run');
  });

  it('captures log tail on failed exit', () => {
    const deps = makeDeps({
      state: {
        running: true,
        version: 'v0.1.1',
        startedAt: '2026-01-01T00:00:00.000Z',
        containerName: 'docsops-update-run',
      },
      inspectContainer: () => ({ status: 'exited', running: false, exitCode: 1 }),
      readLogTail: () => '==> Health-Check fehlgeschlagen',
      removeContainer: () => undefined,
    });

    const status = getUpdateRunStatus(deps);
    assert.equal(status.exitCode, 1);
    assert.match(status.error ?? '', /Health-Check/);
    assert.equal(status.containerLogTail, '==> Health-Check fehlgeschlagen');
  });
});

describe('startUpdateRun', () => {
  it('throws when update already running', () => {
    const deps = makeDeps({
      state: {
        running: true,
        version: 'v0.1.1',
        startedAt: '2026-01-01T00:00:00.000Z',
        containerName: 'docsops-update-run',
      },
      inspectContainer: () => ({ status: 'running', running: true, exitCode: 0 }),
    });

    assert.throws(() => startUpdateRun(deps, 'v0.1.1'), UpdateAlreadyRunningError);
  });

  it('writes state and returns running status', () => {
    const deps = makeDeps({
      state: null,
      inspectContainer: () => ({ status: 'running', running: true, exitCode: 0 }),
    });
    const status = startUpdateRun(deps, 'v0.1.1');
    assert.equal(status.running, true);
    assert.equal(status.version, 'v0.1.1');
    assert.equal(status.containerName, 'docsops-update-run');
  });
});

describe('readUpdateLogTailFromFile', () => {
  it('returns undefined for missing file', () => {
    assert.equal(readUpdateLogTailFromFile('/tmp/does-not-exist-docsops-log-test'), undefined);
  });
});
