/**
 * Loads `.env` from repo root when present (dev/CLI). Does not override variables
 * already set in the environment (e.g. Docker Compose / install env file).
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const candidates = [
  resolve(__dirname, '../../../.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '.env'),
];

let loaded = false;

export function loadEnvFromFilesystem(): void {
  if (loaded) return;
  loaded = true;
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    config({ path, override: false });
    return;
  }
}

loadEnvFromFilesystem();

/**
 * Ensures required environment variables are set and non-empty.
 */
export function assertRequiredEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.error('Fehler: Folgende Umgebungsvariablen müssen gesetzt sein:', missing.join(', '));
    process.exit(1);
  }
}
