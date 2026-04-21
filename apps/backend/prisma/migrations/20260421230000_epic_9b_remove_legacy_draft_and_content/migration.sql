-- EPIC-9b: DocumentDraft / DraftRequest entfernen; Markdown-Spalten `content` an Document & DocumentVersion entfernen.
-- Vor dem DROP: fehlende `blocks`/`draftBlocks` aus bestehendem Markdown füllen (ein Absatz mit Volltext).

BEGIN;

DELETE FROM "DraftRequest";
DELETE FROM "DocumentDraft";

DROP TABLE IF EXISTS "DraftRequest";
DROP TABLE IF EXISTS "DocumentDraft";

DROP TYPE IF EXISTS "DraftRequestStatus";

UPDATE "DocumentVersion" dv
SET
  "blocks" = jsonb_build_object(
    'schemaVersion', 0,
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'type', 'paragraph',
        'content', jsonb_build_array(
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'type', 'text',
            'attrs', '{}'::jsonb,
            'meta', jsonb_build_object('text', COALESCE(dv."content", ''))
          )
        )
      )
    )
  ),
  "blocksSchemaVersion" = 0
WHERE dv."blocks" IS NULL;

ALTER TABLE "DocumentVersion" DROP COLUMN "content";

UPDATE "Document" d
SET "draftBlocks" = jsonb_build_object(
    'schemaVersion', 0,
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'type', 'paragraph',
        'content', jsonb_build_array(
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'type', 'text',
            'attrs', '{}'::jsonb,
            'meta', jsonb_build_object('text', COALESCE(d."content", ''))
          )
        )
      )
    )
  )
WHERE d."draftBlocks" IS NULL;

ALTER TABLE "Document" DROP COLUMN "content";

COMMIT;
