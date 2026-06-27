import { useEffect, useRef, useState } from 'react';

export const UPDATE_AUTO_RELOAD_SECONDS = 3;

type Options = {
  enabled: boolean;
  /** Same-window navigation when countdown finishes. Defaults to full page reload. */
  redirectTo?: string | null;
  onComplete?: () => void;
};

export function useUpdateAutoReload({ enabled, redirectTo = null, onComplete }: Options): {
  secondsLeft: number | null;
} {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!enabled) {
      setSecondsLeft(null);
      return;
    }

    setSecondsLeft(UPDATE_AUTO_RELOAD_SECONDS);
    let remaining = UPDATE_AUTO_RELOAD_SECONDS;

    const intervalId = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(intervalId);
        setSecondsLeft(null);
        onCompleteRef.current?.();
        if (redirectTo != null && redirectTo !== '') {
          window.location.href = redirectTo;
        } else {
          window.location.reload();
        }
        return;
      }
      setSecondsLeft(remaining);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      setSecondsLeft(null);
    };
  }, [enabled, redirectTo]);

  return { secondsLeft };
}
