-- AlterTable
-- Document.contextId: make optional (nullable) for context-free drafts; FK on delete SetNull
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_contextId_fkey";
ALTER TABLE "Document" ALTER COLUMN "contextId" DROP NOT NULL;
ALTER TABLE "Document" ADD CONSTRAINT "Document_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE SET NULL ON UPDATE CASCADE;
