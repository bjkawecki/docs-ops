import { useEffect, useState } from 'react';
import { formatElapsedSince } from '../pages/admin/AdminSystemTab/updateProgressSteps.js';

function parseStartedMs(iso: string | null | undefined): number | null {
  if (iso == null) return null;
  const started = Date.parse(iso);
  return Number.isNaN(started) ? null : started;
}

/** Elapsed milliseconds since `startedAt`, ticking every second. */
export function useElapsedMs(startedAt: string | null | undefined): number | null {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt == null) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const startedMs = parseStartedMs(startedAt);
  if (startedMs == null) return null;
  return Math.max(0, nowMs - startedMs);
}

/** Human-readable elapsed time since `startedAt`. */
export function useElapsedSince(startedAt: string | null | undefined): string | null {
  const elapsedMs = useElapsedMs(startedAt);
  const startedMs = parseStartedMs(startedAt);
  if (elapsedMs == null || startedMs == null) return null;
  return formatElapsedSince(startedAt, startedMs + elapsedMs);
}
