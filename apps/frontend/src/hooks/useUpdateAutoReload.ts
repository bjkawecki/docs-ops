import { useEffect, useState } from 'react';

export const UPDATE_AUTO_RELOAD_SECONDS = 3;

type Options = {
  enabled: boolean;
  onReload?: () => void;
};

export function useUpdateAutoReload({ enabled, onReload }: Options): {
  secondsLeft: number | null;
} {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

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
        onReload?.();
        window.location.reload();
        return;
      }
      setSecondsLeft(remaining);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      setSecondsLeft(null);
    };
  }, [enabled, onReload]);

  return { secondsLeft };
}
