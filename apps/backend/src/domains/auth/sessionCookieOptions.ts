/** Session cookie flags. Default: HTTP intranet (no Secure). Set SESSION_COOKIE_SECURE=1 with HTTPS. */
export function isSessionCookieSecure(): boolean {
  return process.env.SESSION_COOKIE_SECURE === '1';
}

export function sessionCookieSetOptions(maxAgeSeconds: number): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: isSessionCookieSecure(),
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function sessionCookieClearOptions(): {
  path: string;
  secure: boolean;
  sameSite: 'strict';
} {
  return {
    path: '/',
    secure: isSessionCookieSecure(),
    sameSite: 'strict',
  };
}
