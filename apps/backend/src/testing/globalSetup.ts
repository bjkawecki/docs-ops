/**
 * Läuft einmal vor allen Tests. Wendet offene Migrationen an, damit das DB-Schema
 * (z. B. User, Document, DocumentPinnedInScope) mit dem Prisma-Schema übereinstimmt.
 * Ohne DATABASE_URL werden die Migrationen übersprungen (z. B. bei reinen Unit-Tests).
 * Schlägt migrate deploy fehl, bricht das Setup mit Fehlermeldung ab, damit nicht
 * alle Tests mit "table does not exist" durchfallen.
 */
export default async function globalSetup(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl === '') return;

  const { execSync } = await import('node:child_process');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const backendRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

  try {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: backendRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch (err) {
    console.error(
      '\n[test-globalSetup] prisma migrate deploy fehlgeschlagen. Bitte in apps/backend mit gesetzter DATABASE_URL ausführen: pnpm exec prisma migrate deploy\n'
    );
    throw err;
  }
}
