export type AgentUpdateStatus = {
  running: boolean;
  version: string | null;
  phase: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  errorCode: string | null;
  logTail: string | null;
};

type AgentStatusResponse = {
  agentVersion?: string;
  idle: boolean;
  run?: {
    runId?: string;
    version?: string;
    phase?: string;
    startedAt?: string;
    finishedAt?: string;
    exitCode?: number;
    error?: string;
    errorCode?: string;
    logTail?: string;
  } | null;
};

/** Build a failure message for DB/UI from agent status. */
export function formatAgentUpdateFailure(status: AgentUpdateStatus): string {
  if (status.error?.trim()) {
    return status.error.trim().slice(0, 4000);
  }
  if (status.exitCode != null && status.exitCode !== 0) {
    const tail = status.logTail?.trim();
    if (tail) {
      return `Update failed with exit code ${status.exitCode}\n\nLast log output:\n${tail}`.slice(
        0,
        4000
      );
    }
    return `Update failed with exit code ${status.exitCode}`;
  }
  return 'Update failed';
}

export function getAgentMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.DOCSOPS_AGENT_URL?.trim()) {
    missing.push('DOCSOPS_AGENT_URL');
  }
  if (!process.env.DOCSOPS_AGENT_TOKEN?.trim()) {
    missing.push('DOCSOPS_AGENT_TOKEN');
  }
  return missing;
}

export function isAgentConfigured(): boolean {
  return getAgentMissingEnvVars().length === 0;
}

export function getUpdateApplyTimeoutSeconds(): number {
  const raw = process.env.DOCSOPS_UPDATE_APPLY_TIMEOUT_SECONDS;
  if (raw == null || raw.trim() === '') return 600;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 60) return 600;
  return n;
}

function getAgentAuth(): { baseUrl: string; token: string } {
  const baseUrl = process.env.DOCSOPS_AGENT_URL?.trim();
  const token = process.env.DOCSOPS_AGENT_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error('Host agent is not configured');
  }
  return { baseUrl, token };
}

function mapAgentResponse(body: AgentStatusResponse): AgentUpdateStatus {
  const run = body.run ?? null;
  if (run == null) {
    return {
      running: false,
      version: null,
      phase: null,
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      error: null,
      errorCode: null,
      logTail: null,
    };
  }

  const phase = run.phase ?? null;
  const terminal = phase === 'succeeded' || phase === 'failed';
  const running = !body.idle && !terminal;

  return {
    running,
    version: run.version ?? null,
    phase,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    exitCode: run.exitCode ?? null,
    error: run.error ?? null,
    errorCode: run.errorCode ?? null,
    logTail: run.logTail ?? null,
  };
}

export async function getAgentUpdateStatus(): Promise<AgentUpdateStatus> {
  const { baseUrl, token } = getAgentAuth();

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'docsops',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Host agent status returned ${res.status}${body ? `: ${body.slice(0, 500)}` : ''}`
    );
  }

  const body = (await res.json()) as AgentStatusResponse;
  return mapAgentResponse(body);
}

export async function applyUpdateViaAgent(releaseTag: string, updateRunId: string): Promise<void> {
  const { baseUrl, token } = getAgentAuth();

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/apply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'docsops',
    },
    body: JSON.stringify({ version: releaseTag, runId: updateRunId }),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status !== 202) {
    const body = await res.text().catch(() => '');
    throw new Error(`Host agent returned ${res.status}${body ? `: ${body.slice(0, 500)}` : ''}`);
  }
}

export async function preflightUpdateViaAgent(releaseTag: string): Promise<{
  ok: boolean;
  checks: Array<{ code: string; ok: boolean; message: string }>;
}> {
  const { baseUrl, token } = getAgentAuth();

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/preflight`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'docsops',
    },
    body: JSON.stringify({ version: releaseTag }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Host agent preflight returned ${res.status}${body ? `: ${body.slice(0, 500)}` : ''}`
    );
  }

  return res.json() as Promise<{
    ok: boolean;
    checks: Array<{ code: string; ok: boolean; message: string }>;
  }>;
}
