/*
  Warnings:

  - You are about to drop the column `ownerDepartmentId` on the `Process` table. All the data in the column will be lost.
  - You are about to drop the column `ownerTeamId` on the `Process` table. All the data in the column will be lost.
  - You are about to drop the column `ownerDepartmentId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `ownerTeamId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the `DocumentGrant` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `ownerId` to the `Process` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownerId` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "DocumentGrant" DROP CONSTRAINT "DocumentGrant_documentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentGrant" DROP CONSTRAINT "DocumentGrant_granteeDepartmentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentGrant" DROP CONSTRAINT "DocumentGrant_granteeTeamId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentGrant" DROP CONSTRAINT "DocumentGrant_granteeUserId_fkey";

-- DropForeignKey
ALTER TABLE "Process" DROP CONSTRAINT "Process_ownerDepartmentId_fkey";

-- DropForeignKey
ALTER TABLE "Process" DROP CONSTRAINT "Process_ownerTeamId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerDepartmentId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerTeamId_fkey";

-- AlterTable
ALTER TABLE "Process" DROP COLUMN "ownerDepartmentId",
DROP COLUMN "ownerTeamId",
ADD COLUMN     "ownerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "ownerDepartmentId",
DROP COLUMN "ownerTeamId",
ADD COLUMN     "ownerId" TEXT NOT NULL;

-- DropTable
DROP TABLE "DocumentGrant";

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "teamId" TEXT,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentGrantUser" (
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GrantRole" NOT NULL,

    CONSTRAINT "DocumentGrantUser_pkey" PRIMARY KEY ("documentId","userId","role")
);

-- CreateTable
CREATE TABLE "DocumentGrantTeam" (
    "documentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "GrantRole" NOT NULL,

    CONSTRAINT "DocumentGrantTeam_pkey" PRIMARY KEY ("documentId","teamId","role")
);

-- CreateTable
CREATE TABLE "DocumentGrantDepartment" (
    "documentId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "role" "GrantRole" NOT NULL,

    CONSTRAINT "DocumentGrantDepartment_pkey" PRIMARY KEY ("documentId","departmentId","role")
);

-- CreateIndex
CREATE INDEX "DocumentGrantUser_documentId_idx" ON "DocumentGrantUser"("documentId");

-- CreateIndex
CREATE INDEX "DocumentGrantUser_userId_idx" ON "DocumentGrantUser"("userId");

-- CreateIndex
CREATE INDEX "DocumentGrantTeam_documentId_idx" ON "DocumentGrantTeam"("documentId");

-- CreateIndex
CREATE INDEX "DocumentGrantTeam_teamId_idx" ON "DocumentGrantTeam"("teamId");

-- CreateIndex
CREATE INDEX "DocumentGrantDepartment_documentId_idx" ON "DocumentGrantDepartment"("documentId");

-- CreateIndex
CREATE INDEX "DocumentGrantDepartment_departmentId_idx" ON "DocumentGrantDepartment"("departmentId");

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Owner" ADD CONSTRAINT "Owner_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGrantUser" ADD CONSTRAINT "DocumentGrantUser_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGrantUser" ADD CONSTRAINT "DocumentGrantUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGrantTeam" ADD CONSTRAINT "DocumentGrantTeam_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGrantTeam" ADD CONSTRAINT "DocumentGrantTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGrantDepartment" ADD CONSTRAINT "DocumentGrantDepartment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentGrantDepartment" ADD CONSTRAINT "DocumentGrantDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
