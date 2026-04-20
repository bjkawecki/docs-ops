CREATE TABLE IF NOT EXISTS document_search_index (
  document_id TEXT PRIMARY KEY,
  context_id TEXT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  searchable tsvector NOT NULL,
  updated_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_search_index_searchable_gin
  ON document_search_index
  USING GIN (searchable);

CREATE INDEX IF NOT EXISTS document_search_index_context_id_idx
  ON document_search_index (context_id);

INSERT INTO document_search_index (document_id, context_id, title, content, searchable, updated_on)
SELECT
  d.id,
  d."contextId",
  d.title,
  d.content,
  to_tsvector('simple', concat_ws(' ', coalesce(d.title, ''), coalesce(d.content, ''))),
  NOW()
FROM "Document" d
WHERE d."deletedAt" IS NULL
  AND d."archivedAt" IS NULL
ON CONFLICT (document_id) DO UPDATE
SET
  context_id = EXCLUDED.context_id,
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  searchable = EXCLUDED.searchable,
  updated_on = EXCLUDED.updated_on;
