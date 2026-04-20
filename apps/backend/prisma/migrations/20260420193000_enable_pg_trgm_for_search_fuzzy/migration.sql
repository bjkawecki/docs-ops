CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS document_search_index_title_trgm_idx
  ON document_search_index
  USING GIN (title gin_trgm_ops);
