/*
  Warnings:

  - You are about to drop the `TeamSuperuser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TeamSuperuser" DROP CONSTRAINT "TeamSuperuser_teamId_fkey";

-- DropForeignKey
ALTER TABLE "TeamSuperuser" DROP CONSTRAINT "TeamSuperuser_userId_fkey";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "TeamSuperuser";

-- CreateTable
CREATE TABLE "TeamLeader" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TeamLeader_pkey" PRIMARY KEY ("teamId","userId")
);

-- AddForeignKey
ALTER TABLE "TeamLeader" ADD CONSTRAINT "TeamLeader_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLeader" ADD CONSTRAINT "TeamLeader_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
