import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function wrapPgDumpError(error: unknown): Error {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  ) {
    return new Error(
      'pg_dump not found. Rebuild the docsops-job-worker image (postgresql-client) or set PG_DUMP_BIN.'
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function runPostgresDump(outputPath: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is not configured');
  }
  try {
    await execFileAsync(
      process.env.PG_DUMP_BIN?.trim() || 'pg_dump',
      ['-Fc', '-f', outputPath, '--dbname', databaseUrl],
      {
        timeout: 600_000,
        maxBuffer: 4 * 1024 * 1024,
        env: process.env,
      }
    );
  } catch (error) {
    throw wrapPgDumpError(error);
  }
}
