export type LoginRedirectReason = 'auth_required' | 'session_expired';

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

/** Shown when AuthGuard redirects unauthenticated users to /login. */
export function getLoginRedirectErrorDisplay(reason: LoginRedirectReason): LoginErrorDisplay {
  if (reason === 'session_expired') {
    return {
      title: 'Session expired',
      message: 'Please log in again to continue.',
    };
  }
  return {
    title: 'Sign in required',
    message: 'Log in to access this page.',
  };
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

  if (raw === 'Session not established') {
    return {
      title: 'Login failed',
      message: 'Your credentials were accepted, but no session was created.',
      hint: 'The browser may not be storing cookies (e.g. HTTP with Secure cookies). Contact IT if this persists.',
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
