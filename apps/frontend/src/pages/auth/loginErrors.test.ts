import { describe, expect, it } from 'vitest';
import { getLoginErrorDisplay, getLoginRedirectErrorDisplay } from './loginErrors';

describe('loginErrors', () => {
  it('maps session-not-established to a user-facing message', () => {
    const display = getLoginErrorDisplay(new Error('Session not established'));
    expect(display.title).toBe('Login failed');
    expect(display.message).toContain('no session was created');
    expect(display.hint).toBeTruthy();
  });

  it('maps auth redirect reasons', () => {
    expect(getLoginRedirectErrorDisplay('auth_required').title).toBe('Sign in required');
    expect(getLoginRedirectErrorDisplay('session_expired').title).toBe('Session expired');
  });
});
