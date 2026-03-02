/**
 * Läuft einmal vor allen Tests. Wendet offene Migrationen an, damit das DB-Schema
 * (z. B. Owner.companyId, CompanyLead) mit dem Prisma-Schema übereinstimmt.
 * Ohne DATABASE_URL werden die Migrationen übersprungen (z. B. bei reinen Unit-Tests).
 */
export default async function globalSetup(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl === '') return;

  const { execSync } = await import('node:child_process');
  try {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch {
    // Migrate kann fehlschlagen (z. B. keine DB erreichbar); Tests laufen trotzdem
    // und schlagen dann ggf. mit Schema-Fehlern fehl.
  }
}
