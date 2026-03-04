-- Backfill: assign all tags without owner to first available Owner (prefer company scope)
UPDATE "Tag"
SET "ownerId" = (
  SELECT id FROM "Owner"
  WHERE "companyId" IS NOT NULL
  LIMIT 1
)
WHERE "ownerId" IS NULL;

-- If no company owner exists, use any owner (e.g. personal)
UPDATE "Tag"
SET "ownerId" = (SELECT id FROM "Owner" LIMIT 1)
WHERE "ownerId" IS NULL;

-- Make ownerId required (fails if any tag still has null - then run backfill manually)
ALTER TABLE "Tag" ALTER COLUMN "ownerId" SET NOT NULL;

-- Replace global name unique with per-scope unique
DROP INDEX IF EXISTS "Tag_name_key";
CREATE UNIQUE INDEX "Tag_ownerId_name_key" ON "Tag"("ownerId", "name");
