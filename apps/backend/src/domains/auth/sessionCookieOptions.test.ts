import { afterEach, describe, expect, it } from 'vitest';
import {
  isSessionCookieSecure,
  sessionCookieClearOptions,
  sessionCookieSetOptions,
} from './sessionCookieOptions.js';

describe('sessionCookieOptions', () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it('defaults to non-secure cookies for HTTP intranet production', () => {
    process.env = { ...env, NODE_ENV: 'production' };
    delete process.env.SESSION_COOKIE_SECURE;
    expect(isSessionCookieSecure()).toBe(false);
    expect(sessionCookieSetOptions(3600).secure).toBe(false);
    expect(sessionCookieClearOptions().secure).toBe(false);
  });

  it('enables Secure when SESSION_COOKIE_SECURE=1', () => {
    process.env = { ...env, NODE_ENV: 'production', SESSION_COOKIE_SECURE: '1' };
    expect(sessionCookieSetOptions(3600).secure).toBe(true);
  });
});
