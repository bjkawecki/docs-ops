export type SidecarUpdateStatus = {
  running: boolean;
  version: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  containerName: string | null;
  containerLogTail: string | null;
};

/** Build a failure message for DB/UI from sidecar status. */
export function formatSidecarUpdateFailure(status: SidecarUpdateStatus): string {
  if (status.error?.trim()) {
    return status.error.trim().slice(0, 4000);
  }
  if (status.exitCode != null && status.exitCode !== 0) {
    const tail = status.containerLogTail?.trim();
    if (tail) {
      return `Update container exited with code ${status.exitCode}\n\nLast log output:\n${tail}`.slice(
        0,
        4000
      );
    }
    return `Update container exited with code ${status.exitCode}`;
  }
  return 'Update failed';
}

export function getUpdaterMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.DOCSOPS_UPDATER_URL?.trim()) {
    missing.push('DOCSOPS_UPDATER_URL');
  }
  if (!process.env.DOCSOPS_UPDATER_TOKEN?.trim()) {
    missing.push('DOCSOPS_UPDATER_TOKEN');
  }
  return missing;
}

export function isUpdaterConfigured(): boolean {
  return getUpdaterMissingEnvVars().length === 0;
}

export function getUpdateApplyTimeoutSeconds(): number {
  const raw = process.env.DOCSOPS_UPDATE_APPLY_TIMEOUT_SECONDS;
  if (raw == null || raw.trim() === '') return 600;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 60) return 600;
  return n;
}

function getSidecarAuth(): { baseUrl: string; token: string } {
  const baseUrl = process.env.DOCSOPS_UPDATER_URL?.trim();
  const token = process.env.DOCSOPS_UPDATER_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error('Updater sidecar is not configured');
  }
  return { baseUrl, token };
}

export async function getSidecarUpdateStatus(): Promise<SidecarUpdateStatus> {
  const { baseUrl, token } = getSidecarAuth();

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/internal/status`, {
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
      `Updater sidecar status returned ${res.status}${body ? `: ${body.slice(0, 500)}` : ''}`
    );
  }

  return res.json() as Promise<SidecarUpdateStatus>;
}

export async function applyUpdateViaSidecar(releaseTag: string): Promise<void> {
  const { baseUrl, token } = getSidecarAuth();

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/internal/apply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'docsops',
    },
    body: JSON.stringify({ version: releaseTag }),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status !== 202) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Updater sidecar returned ${res.status}${body ? `: ${body.slice(0, 500)}` : ''}`
    );
  }
}
