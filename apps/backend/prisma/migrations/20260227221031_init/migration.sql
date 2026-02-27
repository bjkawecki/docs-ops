/*
  Warnings:

  - You are about to drop the column `lifetime` on the `Process` table. All the data in the column will be lost.
  - You are about to drop the column `lifetime` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Process" DROP COLUMN "lifetime";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "lifetime";

-- DropEnum
DROP TYPE "ContextLifetime";
