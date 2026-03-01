-- Entfernt die fehlgeschlagene Migration aus der Historie, damit die
-- neu datierte Migration 20260228172800_user_preferences angewendet werden kann.
DELETE FROM _prisma_migrations WHERE migration_name = '20260226120000_user_preferences';
