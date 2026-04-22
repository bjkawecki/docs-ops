/**
 * EPIC-2 / PR-2a: Zod-Validierung für Block-Dokumente v0.
 * Kanonische Definitionen und Beispiel liegen in `blockSchema.ts` (ADR 001 / EPIC-0).
 */
export {
  blockNodeSchema,
  blockDocumentSchemaV0,
  parseBlockDocumentV0,
  safeParseBlockDocumentV0,
  exampleBlockDocumentV0,
  type BlockNode,
  type BlockDocumentV0,
} from './blockSchema.js';
