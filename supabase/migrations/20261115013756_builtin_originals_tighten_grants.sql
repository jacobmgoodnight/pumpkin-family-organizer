-- Supabase default privileges also granted TRUNCATE, REFERENCES and TRIGGER.
-- TRUNCATE bypasses row-level security; clients need only the four below.
revoke truncate, references, trigger on public.pc_builtin_originals from authenticated;
