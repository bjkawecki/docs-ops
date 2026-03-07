-- AlterTable
ALTER TABLE "Context" ADD COLUMN     "contextType" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "ownerDisplayName" TEXT;

-- AlterTable
ALTER TABLE "Owner" ADD COLUMN     "displayName" TEXT;
