-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
