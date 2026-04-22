import argon2 from 'argon2';

/**
 * Erzeugt einen Argon2-Hash des Passworts (für Speicherung in der DB).
 * @param password Klartext-Passwort
 * @returns Argon2-Hash-String
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * Prüft ein Klartext-Passwort gegen einen gespeicherten Argon2-Hash.
 * @param hash Gespeicherter Hash (z. B. User.passwordHash)
 * @param password Eingegebenes Passwort
 * @returns true wenn das Passwort übereinstimmt
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
