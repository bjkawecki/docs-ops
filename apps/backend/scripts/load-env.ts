/**
 * Lädt .env aus dem Repo-Root, bevor andere Module (z. B. db) geladen werden.
 * Muss als erstes importiert werden, damit ADMIN_* etc. in process.env stehen.
 * Versucht mehrere Pfade (Root und apps/backend); prüft, ob eine Datei gefunden wurde.
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo-Root: von apps/backend/scripts aus drei Ebenen hoch; von cwd apps/backend zwei Ebenen hoch
const candidates = [
  resolve(__dirname, '../../../.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '.env'),
];

const existingPath = candidates.find((p) => existsSync(p));
if (!existingPath) {
  console.error(
    'Fehler: Keine .env-Datei gefunden. Erwartet im Repo-Root oder in apps/backend. Kandidaten:',
    candidates.join(', ')
  );
  process.exit(1);
}

// override: false – bereits gesetzte Variablen (z. B. DATABASE_URL im Container) nicht überschreiben
const result = config({ path: existingPath, override: false });
if (!result.parsed || Object.keys(result.parsed).length === 0) {
  console.error('Fehler: .env-Datei ist leer oder konnte nicht gelesen werden:', existingPath);
  process.exit(1);
}

/**
 * Prüft, ob die angegebenen Umgebungsvariablen gesetzt und nicht leer sind.
 * Beendet den Prozess mit Fehlermeldung, falls eine fehlt.
 */
export function assertRequiredEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.error(
      'Fehler: Folgende Variablen müssen in der .env gesetzt sein:',
      missing.join(', ')
    );
    process.exit(1);
  }
}
