import { describe, it, expect } from 'vitest';
import { isUserOnline } from './presenceConfig.js';

describe('presenceConfig', () => {
  it('isUserOnline respects recent lastActiveAt', () => {
    expect(isUserOnline(new Date())).toBe(true);
    expect(isUserOnline(new Date(Date.now() - 10 * 60_000))).toBe(false);
    expect(isUserOnline(null)).toBe(false);
  });
});
