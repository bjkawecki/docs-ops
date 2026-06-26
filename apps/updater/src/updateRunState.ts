import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const UPDATE_RUN_LOG_FILE = '.update-run.log';

export type PersistedUpdateRunState = {
  running: boolean;
  version: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  containerName: string;
  error?: string;
  containerLogTail?: string;
};

export type UpdateRunStatus = {
  running: boolean;
  version: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  containerName: string | null;
  containerLogTail: string | null;
};

export type DockerInspectResult = {
  status: string;
  running: boolean;
  exitCode: number;
} | null;

export type UpdateRunStateDeps = {
  readState: () => PersistedUpdateRunState | null;
  writeState: (state: PersistedUpdateRunState) => void;
  inspectContainer: (containerName: string) => DockerInspectResult;
  removeContainer: (containerName: string) => void;
  runExecScript: (version: string) => string;
  readLogTail: () => string | undefined;
  readContainerLogs: (containerName: string) => string | undefined;
};

const STATE_FILE_NAME = '.update-run-state.json';
const LOG_TAIL_MAX_CHARS = 6000;

export function getStateFilePath(installDir: string): string {
  return join(installDir, STATE_FILE_NAME);
}

export function getUpdateRunLogPath(installDir: string): string {
  return join(installDir, UPDATE_RUN_LOG_FILE);
}

export function readUpdateLogTailFromFile(
  installDir: string,
  maxChars = LOG_TAIL_MAX_CHARS
): string | undefined {
  const logPath = getUpdateRunLogPath(installDir);
  if (!existsSync(logPath)) return undefined;
  try {
    const content = readFileSync(logPath, 'utf8').trim();
    if (!content) return undefined;
    return content.length > maxChars ? content.slice(-maxChars) : content;
  } catch {
    return undefined;
  }
}

export function readDockerContainerLogTail(
  containerName: string,
  maxChars = LOG_TAIL_MAX_CHARS
): string | undefined {
  try {
    const content = execFileSync('docker', ['logs', '--tail', '120', containerName], {
      encoding: 'utf8',
    }).trim();
    if (!content) return undefined;
    return content.length > maxChars ? content.slice(-maxChars) : content;
  } catch {
    return undefined;
  }
}

export function formatUpdateContainerError(
  exitCode: number,
  logTail?: string,
  dockerLogs?: string
): string {
  const parts = [`Update container exited with code ${exitCode}`];
  const log = logTail?.trim() || dockerLogs?.trim();
  if (log) {
    parts.push(`Last log output:\n${log}`);
  }
  return parts.join('\n\n');
}

export function parseDockerInspectOutput(output: string): DockerInspectResult {
  const trimmed = output.trim();
  if (!trimmed) return null;
  const [status, runningRaw, exitCodeRaw] = trimmed.split('|');
  if (!status) return null;
  return {
    status,
    running: runningRaw === 'true',
    exitCode: Number.parseInt(exitCodeRaw ?? '0', 10) || 0,
  };
}

export function mergeInspectIntoState(
  state: PersistedUpdateRunState,
  inspect: DockerInspectResult,
  options?: { logTail?: string; dockerLogs?: string }
): PersistedUpdateRunState {
  if (!inspect) {
    if (state.running) {
      const logTail = options?.logTail ?? options?.dockerLogs;
      return {
        ...state,
        running: false,
        finishedAt: state.finishedAt ?? new Date().toISOString(),
        exitCode: state.exitCode ?? 1,
        error: state.error ?? 'Update container not found',
        containerLogTail: logTail ?? state.containerLogTail,
      };
    }
    return state;
  }

  if (inspect.running) {
    return { ...state, running: true, error: undefined };
  }

  if (inspect.status === 'exited' || inspect.status === 'dead') {
    const logTail = options?.logTail ?? options?.dockerLogs;
    return {
      ...state,
      running: false,
      finishedAt: state.finishedAt ?? new Date().toISOString(),
      exitCode: inspect.exitCode,
      containerLogTail: logTail ?? state.containerLogTail,
      error:
        inspect.exitCode === 0
          ? undefined
          : formatUpdateContainerError(inspect.exitCode, options?.logTail, options?.dockerLogs),
    };
  }

  return state;
}

export function toPublicStatus(state: PersistedUpdateRunState | null): UpdateRunStatus {
  if (!state) {
    return {
      running: false,
      version: null,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      error: null,
      containerName: null,
      containerLogTail: null,
    };
  }

  return {
    running: state.running,
    version: state.version,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt ?? null,
    exitCode: state.exitCode ?? null,
    error: state.error ?? null,
    containerName: state.containerName,
    containerLogTail: state.containerLogTail ?? null,
  };
}

export function createUpdateRunStateDeps(options: {
  installDir: string;
  envFile: string;
  healthUrl: string;
}): UpdateRunStateDeps {
  const statePath = getStateFilePath(options.installDir);

  return {
    readState: () => {
      if (!existsSync(statePath)) return null;
      try {
        return JSON.parse(readFileSync(statePath, 'utf8')) as PersistedUpdateRunState;
      } catch {
        return null;
      }
    },
    writeState: (state) => {
      writeFileSync(statePath, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
    },
    inspectContainer: (containerName) => {
      try {
        const output = execFileSync(
          'docker',
          [
            'inspect',
            '-f',
            '{{.State.Status}}|{{.State.Running}}|{{.State.ExitCode}}',
            containerName,
          ],
          { encoding: 'utf8' }
        );
        return parseDockerInspectOutput(output);
      } catch {
        return null;
      }
    },
    removeContainer: (containerName) => {
      try {
        execFileSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
      } catch {
        // ignore cleanup errors
      }
    },
    readLogTail: () => readUpdateLogTailFromFile(options.installDir),
    readContainerLogs: (containerName) => readDockerContainerLogTail(containerName),
    runExecScript: (version) => {
      const script = join(options.installDir, 'scripts/updater-exec-update.sh');
      const result = spawnSync('bash', [script, version], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DOCSOPS_INSTALL_DIR: options.installDir,
          DOCSOPS_ENV_FILE: options.envFile,
          DOCSOPS_HEALTH_URL: options.healthUrl,
        },
      });
      if (result.status !== 0) {
        const stderr = result.stderr?.trim() || result.stdout?.trim();
        throw new Error(stderr || `updater-exec-update.sh failed with exit code ${result.status}`);
      }
      const lines = (result.stdout ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const containerName = lines.at(-1);
      if (!containerName) {
        throw new Error('updater-exec-update.sh did not return a container name');
      }
      return containerName;
    },
  };
}

export function getUpdateRunStatus(deps: UpdateRunStateDeps): UpdateRunStatus {
  const state = deps.readState();
  if (!state) return toPublicStatus(null);

  const inspect = deps.inspectContainer(state.containerName);
  const shouldCollectLogs =
    state.running &&
    inspect != null &&
    !inspect.running &&
    (inspect.status === 'exited' || inspect.status === 'dead') &&
    inspect.exitCode !== 0;

  const logTail = shouldCollectLogs ? deps.readLogTail() : undefined;
  const dockerLogs = shouldCollectLogs ? deps.readContainerLogs(state.containerName) : undefined;

  const merged = mergeInspectIntoState(state, inspect, { logTail, dockerLogs });
  if (!merged.running && merged.exitCode != null && state.running) {
    deps.removeContainer(merged.containerName);
  }
  if (JSON.stringify(merged) !== JSON.stringify(state)) {
    deps.writeState(merged);
  }
  return toPublicStatus(merged);
}

export function startUpdateRun(deps: UpdateRunStateDeps, version: string): UpdateRunStatus {
  const current = getUpdateRunStatus(deps);
  if (current.running) {
    throw new UpdateAlreadyRunningError();
  }

  const containerName = deps.runExecScript(version);
  const state: PersistedUpdateRunState = {
    running: true,
    version,
    startedAt: new Date().toISOString(),
    containerName,
  };
  deps.writeState(state);
  return getUpdateRunStatus(deps);
}

export class UpdateAlreadyRunningError extends Error {
  constructor() {
    super('Update already running');
    this.name = 'UpdateAlreadyRunningError';
  }
}
