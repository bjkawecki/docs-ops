-- Remove UserSpace: delete documents and contexts that belong to UserSpaces, then drop UserSpace.
-- Add Owner.ownerUserId for personal processes/projects.

-- Delete documents in UserSpace contexts
DELETE FROM "Document"
WHERE "contextId" IN (SELECT "contextId" FROM "UserSpace");

-- Delete contexts that belong to UserSpaces
DELETE FROM "Context"
WHERE "id" IN (SELECT "contextId" FROM "UserSpace");

-- Drop UserSpace table (ownerUserId FK to User is removed with the table)
DROP TABLE "UserSpace";

-- Add ownerUserId to Owner for personal ownership
ALTER TABLE "Owner" ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "Owner" ADD CONSTRAINT "Owner_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
