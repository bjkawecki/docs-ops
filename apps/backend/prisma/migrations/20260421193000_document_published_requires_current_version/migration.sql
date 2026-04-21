-- Veröffentlichte Dokumente müssen eine gesetzte aktuelle Version haben (Domäneninvariante).
ALTER TABLE "Document" ADD CONSTRAINT "Document_published_requires_current_published_version"
CHECK ("publishedAt" IS NULL OR "currentPublishedVersionId" IS NOT NULL);
