export type LoginErrorDisplay = {
  title: string;
  message: string;
  /** Optional second line in the inline alert. */
  hint?: string;
};

function isNetworkError(raw: string): boolean {
  return (
    raw === 'Failed to fetch' ||
    raw.includes('NetworkError') ||
    raw.toLowerCase().includes('load failed')
  );
}

/** User-facing copy for login failures. */
export function getLoginErrorDisplay(err: unknown): LoginErrorDisplay {
  const raw = err instanceof Error ? err.message : String(err);

  if (isNetworkError(raw)) {
    return {
      title: 'Login failed',
      message: 'Cannot reach the server.',
    };
  }

  if (raw === 'Invalid credentials') {
    return {
      title: 'Login failed',
      message: 'Email or password is incorrect.',
    };
  }

  const httpMatch = /^HTTP_(\d+)$/.exec(raw);
  if (httpMatch) {
    return {
      title: 'Login failed',
      message: `Server error (${httpMatch[1]}).`,
      hint: 'Contact IT with this code if the problem continues.',
    };
  }

  return {
    title: 'Login failed',
    message: 'Something went wrong.',
  };
}
