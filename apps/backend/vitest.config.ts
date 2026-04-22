import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    globalSetup: ['src/testing/globalSetup.ts'],
    /** Eine gemeinsame Test-DB: keine parallelen Testdateien, damit z. B. Admin-Setup andere Suites nicht stört. */
    fileParallelism: false,
  },
});
