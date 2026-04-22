import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { canPublishDocument } from './canPublishDocument.js';
import { canWrite } from './canWrite.js';

/**
 * Lead darf den gemeinsamen Lead-Draft (Block-JSON) bearbeiten — gleiche Schwelle wie Publish
 * (`canWriteContext` auf dem Dokument-Kontext, vgl. `canPublishDocument`).
 */
export async function canEditLeadDraft(
  prisma: PrismaClient,
  userId: string,
  documentId: string
): Promise<boolean> {
  return canPublishDocument(prisma, userId, documentId);
}

/**
 * Lesen des Lead-Drafts: nur wer schreiben darf (Autor) oder Lead/Publish-Recht hat.
 * Reine Leser (nur Read / Kontext-Lesen) → false (Plan: Lead-Draft nicht für Read-only).
 */
export async function canReadLeadDraft(
  prisma: PrismaClient,
  userId: string,
  documentId: string
): Promise<boolean> {
  const [write, lead] = await Promise.all([
    canWrite(prisma, userId, documentId),
    canEditLeadDraft(prisma, userId, documentId),
  ]);
  return write || lead;
}
