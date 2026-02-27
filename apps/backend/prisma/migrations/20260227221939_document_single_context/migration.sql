/*
  Warnings:

  - You are about to drop the column `processId` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `subcontextId` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `userSpaceId` on the `Document` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[contextId]` on the table `Process` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contextId]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contextId]` on the table `Subcontext` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[contextId]` on the table `UserSpace` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `contextId` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contextId` to the `Process` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contextId` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contextId` to the `Subcontext` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contextId` to the `UserSpace` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_processId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_subcontextId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_userSpaceId_fkey";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "processId",
DROP COLUMN "projectId",
DROP COLUMN "subcontextId",
DROP COLUMN "userSpaceId",
ADD COLUMN     "contextId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "contextId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "contextId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Subcontext" ADD COLUMN     "contextId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "UserSpace" ADD COLUMN     "contextId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Context" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Context_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Process_contextId_key" ON "Process"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_contextId_key" ON "Project"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "Subcontext_contextId_key" ON "Subcontext"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSpace_contextId_key" ON "UserSpace"("contextId");

-- AddForeignKey
ALTER TABLE "Process" ADD CONSTRAINT "Process_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontext" ADD CONSTRAINT "Subcontext_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSpace" ADD CONSTRAINT "UserSpace_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "Context"("id") ON DELETE CASCADE ON UPDATE CASCADE;
