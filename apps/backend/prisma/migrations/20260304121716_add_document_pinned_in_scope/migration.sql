-- CreateEnum
CREATE TYPE "PinnedScopeType" AS ENUM ('team', 'department', 'company');

-- AlterTable
ALTER TABLE "DepartmentLead" RENAME CONSTRAINT "Supervisor_pkey" TO "DepartmentLead_pkey";

-- AlterTable
ALTER TABLE "TeamLead" RENAME CONSTRAINT "TeamLeader_pkey" TO "TeamLead_pkey";

-- CreateTable
CREATE TABLE "DocumentPinnedInScope" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "scopeType" "PinnedScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "pinnedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPinnedInScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentPinnedInScope_scopeType_scopeId_idx" ON "DocumentPinnedInScope"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPinnedInScope_scopeType_scopeId_documentId_key" ON "DocumentPinnedInScope"("scopeType", "scopeId", "documentId");

-- RenameForeignKey
ALTER TABLE "DepartmentLead" RENAME CONSTRAINT "Supervisor_departmentId_fkey" TO "DepartmentLead_departmentId_fkey";

-- RenameForeignKey
ALTER TABLE "DepartmentLead" RENAME CONSTRAINT "Supervisor_userId_fkey" TO "DepartmentLead_userId_fkey";

-- RenameForeignKey
ALTER TABLE "TeamLead" RENAME CONSTRAINT "TeamLeader_teamId_fkey" TO "TeamLead_teamId_fkey";

-- RenameForeignKey
ALTER TABLE "TeamLead" RENAME CONSTRAINT "TeamLeader_userId_fkey" TO "TeamLead_userId_fkey";

-- AddForeignKey
ALTER TABLE "DocumentPinnedInScope" ADD CONSTRAINT "DocumentPinnedInScope_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPinnedInScope" ADD CONSTRAINT "DocumentPinnedInScope_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
