import { notifications } from '@mantine/notifications';

type NotifyOverrides = {
  title?: string;
  /** Wenn der Server kein `error`-Feld liefert (z. B. fester Hinweistext). */
  defaultMessage?: string;
  color?: 'red' | 'yellow' | 'blue';
};

/**
 * Zeigt eine Notification aus einem fehlgeschlagenen `fetch`-Response (JSON-Body mit `error` optional).
 */
export async function notifyApiErrorResponse(
  res: Response,
  overrides?: NotifyOverrides
): Promise<void> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  notifications.show({
    title: overrides?.title ?? 'Error',
    message: body?.error ?? overrides?.defaultMessage ?? res.statusText,
    color: overrides?.color ?? 'red',
  });
}
