-- Read-only schema inventory. Run manually in the Supabase SQL Editor.
-- Does not create, drop, or mutate production objects.
-- Compare output with SCHEMA_BASELINE.md after database changes.
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name LIKE 'pc_%'
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace='public'::regnamespace
  AND conrelid::regclass::text LIKE 'pc_%'
ORDER BY 1,2;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename LIKE 'pc_%'
ORDER BY tablename,indexname;

SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename LIKE 'pc_%')
   OR (schemaname='storage' AND tablename='objects' AND policyname LIKE 'pc_%')
ORDER BY schemaname, tablename, policyname;

SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'pc_%'
ORDER BY tablename;

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id IN ('pc-previews','pc-family-imports')
ORDER BY id;

SELECT publicationname, schemaname, tablename
FROM pg_publication_tables
WHERE schemaname='public' AND tablename LIKE 'pc_%'
ORDER BY publicationname, tablename;
