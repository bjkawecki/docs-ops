-- Edit-System EPIC-1: Lead-Draft am Document, Block-Snapshot an DocumentVersion, DocumentSuggestion (ADR 001).

-- CreateEnum
CREATE TYPE "DocumentSuggestionStatus" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn', 'superseded');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "draftBlocks" JSONB,
ADD COLUMN "draftRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN "blocks" JSONB,
ADD COLUMN "blocksSchemaVersion" INTEGER;

-- CreateTable
CREATE TABLE "DocumentSuggestion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" "DocumentSuggestionStatus" NOT NULL,
    "baseDraftRevision" INTEGER NOT NULL,
    "publishedVersionId" TEXT,
    "ops" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "comment" TEXT,

    CONSTRAINT "DocumentSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSuggestion_documentId_status_idx" ON "DocumentSuggestion"("documentId", "status");

-- CreateIndex
CREATE INDEX "DocumentSuggestion_documentId_authorId_idx" ON "DocumentSuggestion"("documentId", "authorId");

-- AddForeignKey
ALTER TABLE "DocumentSuggestion" ADD CONSTRAINT "DocumentSuggestion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSuggestion" ADD CONSTRAINT "DocumentSuggestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSuggestion" ADD CONSTRAINT "DocumentSuggestion_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSuggestion" ADD CONSTRAINT "DocumentSuggestion_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
