import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiBase } from '../api/client';
import { maintenanceStatusQueryKey, type MaintenanceStatus } from './useMaintenanceStatus';
import { adminUpdateStatusQueryKey } from './useAdminUpdateStatus';
import { appVersionQueryKey } from './useAppVersion';
import { LiveEventsContext } from './liveEventsContext';

const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 8;

type LiveClientEvent =
  | { v: 1; type: 'notification.unread-changed' }
  | {
      v: 1;
      type: 'maintenance.status-changed';
      payload: MaintenanceStatus;
    }
  | {
      v: 1;
      type: 'document.collaboration-changed';
      payload: { documentId: string };
    };

function invalidateDocumentCollaborationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  documentId: string
): void {
  void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
  void queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
  void queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
}

function getFallbackPollSeconds(): number {
  const raw = import.meta.env.VITE_LIVE_EVENTS_FALLBACK_POLL_SECONDS;
  if (raw == null || raw === '') return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function parseLiveClientEvent(data: string): LiveClientEvent | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed == null || typeof parsed !== 'object') return null;
    const event = parsed as Record<string, unknown>;
    if (event.v !== 1 || typeof event.type !== 'string') return null;
    if (event.type === 'notification.unread-changed') {
      return { v: 1, type: 'notification.unread-changed' };
    }
    if (event.type === 'maintenance.status-changed') {
      const payload = event.payload;
      if (payload == null || typeof payload !== 'object') return null;
      const p = payload as Record<string, unknown>;
      if (typeof p.active !== 'boolean') return null;
      const reason = p.reason;
      if (
        reason !== undefined &&
        reason !== 'backup' &&
        reason !== 'restore' &&
        reason !== 'platform-import' &&
        reason !== 'update'
      ) {
        return null;
      }
      const startedAt = p.startedAt;
      if (startedAt !== undefined && typeof startedAt !== 'string') return null;
      return {
        v: 1,
        type: 'maintenance.status-changed',
        payload: {
          active: p.active,
          ...(reason != null ? { reason } : {}),
          ...(typeof startedAt === 'string' ? { startedAt } : {}),
        },
      };
    }
    if (event.type === 'document.collaboration-changed') {
      const payload = event.payload;
      if (payload == null || typeof payload !== 'object') return null;
      const documentId = (payload as Record<string, unknown>).documentId;
      if (typeof documentId !== 'string' || documentId.length === 0) return null;
      return {
        v: 1,
        type: 'document.collaboration-changed',
        payload: { documentId },
      };
    }
    return null;
  } catch {
    return null;
  }
}

function buildEventsUrl(): string {
  const path = '/api/v1/me/events';
  return apiBase ? `${apiBase}${path}` : path;
}

function invalidatePostMaintenanceQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: appVersionQueryKey() });
  void queryClient.invalidateQueries({ queryKey: adminUpdateStatusQueryKey });
}

function catchUpQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['me', 'notifications', 'unread-count'] });
  void queryClient.invalidateQueries({ queryKey: maintenanceStatusQueryKey() });
  invalidatePostMaintenanceQueries(queryClient);
}

/**
 * Holds the authenticated SSE stream for live UI signals (§23a).
 * Disconnects when the tab is hidden; reconnects with exponential backoff.
 */
export function useLiveEvents(): { fallbackPollingActive: boolean } {
  const queryClient = useQueryClient();
  const [fallbackPollingActive, setFallbackPollingActive] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_MS);
  const visibleRef = useRef(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const closeEventSource = useCallback(() => {
    const es = eventSourceRef.current;
    if (es) {
      es.close();
      eventSourceRef.current = null;
    }
  }, []);

  const handleLiveEvent = useCallback(
    (event: LiveClientEvent) => {
      if (event.type === 'notification.unread-changed') {
        void queryClient.invalidateQueries({ queryKey: ['me', 'notifications', 'unread-count'] });
        return;
      }
      if (event.type === 'document.collaboration-changed') {
        invalidateDocumentCollaborationQueries(queryClient, event.payload.documentId);
        return;
      }
      queryClient.setQueryData(maintenanceStatusQueryKey(), event.payload);
      if (!event.payload.active) {
        invalidatePostMaintenanceQueries(queryClient);
      }
    },
    [queryClient]
  );

  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    if (!visibleRef.current) return;

    reconnectAttemptRef.current += 1;
    const fallbackSeconds = getFallbackPollSeconds();
    if (fallbackSeconds > 0 && reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setFallbackPollingActive(true);
      return;
    }

    clearReconnectTimer();
    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!visibleRef.current) return;
      connectRef.current();
    }, delay);
    reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_MS);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    if (!visibleRef.current) return;

    closeEventSource();
    clearReconnectTimer();

    const es = new EventSource(buildEventsUrl(), { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      reconnectAttemptRef.current = 0;
      reconnectDelayRef.current = INITIAL_RECONNECT_MS;
      setFallbackPollingActive(false);
    };

    es.onmessage = (message: MessageEvent<string>) => {
      const event = parseLiveClientEvent(message.data);
      if (event) handleLiveEvent(event);
    };

    es.addEventListener('ping', () => {
      // keep-alive only
    });

    es.onerror = () => {
      closeEventSource();
      scheduleReconnect();
    };
  }, [clearReconnectTimer, closeEventSource, handleLiveEvent, scheduleReconnect]);

  connectRef.current = connect;

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      visibleRef.current = visible;

      if (!visible) {
        clearReconnectTimer();
        closeEventSource();
        return;
      }

      reconnectAttemptRef.current = 0;
      reconnectDelayRef.current = INITIAL_RECONNECT_MS;
      setFallbackPollingActive(false);
      catchUpQueries(queryClient);
      connect();
    };

    if (visibleRef.current) {
      connect();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearReconnectTimer();
      closeEventSource();
    };
  }, [clearReconnectTimer, closeEventSource, connect, queryClient]);

  return { fallbackPollingActive };
}

export { LiveEventsContext };
