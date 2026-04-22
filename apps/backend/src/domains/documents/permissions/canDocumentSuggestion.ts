import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { canEditLeadDraft, canReadLeadDraft } from './canEditLeadDraft.js';
import { canWrite } from './canWrite.js';

/** Autor legt Suggestion an (Schreibrecht am Dokument). */
export async function canCreateSuggestion(
  prisma: PrismaClient,
  userId: string,
  documentId: string
): Promise<boolean> {
  return canWrite(prisma, userId, documentId);
}

/** Liste der Suggestions: wie Lead-Draft-Lesepfad (Write oder Lead). */
export async function canReadSuggestions(
  prisma: PrismaClient,
  userId: string,
  documentId: string
): Promise<boolean> {
  return canReadLeadDraft(prisma, userId, documentId);
}

/** Accept/Reject: nur Scope-Lead (wie Lead-Draft bearbeiten). */
export async function canResolveSuggestion(
  prisma: PrismaClient,
  userId: string,
  documentId: string
): Promise<boolean> {
  return canEditLeadDraft(prisma, userId, documentId);
}
