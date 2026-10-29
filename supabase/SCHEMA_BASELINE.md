# Inspected Supabase schema baseline — October 29, 2026

**Documentation snapshot, not a migration.** The tables, keys, constraints, policies and storage listed here were inspected directly against the project's live Postgres catalog. It is intended to help re-create and audit a separate test environment; do **not** run a guessed re-creation script against production.

## Public app tables

| Table | Primary key | Important columns / constraints |
| --- | --- | --- |
| `pc_accounts` | `user_id` UUID | References `auth.users(id)` with ON DELETE CASCADE; `created_at timestamptz` |
| `pc_people` | `(user_id, person_id)` | Display name, user FK to `pc_accounts` with ON DELETE CASCADE; person ID max 80 characters, display name 1–32 |
| `pc_choices` | `(user_id, person_id, template_id)` | `favorite boolean`, `final_pick boolean`, `updated_at`; joint FK to `pc_people` with ON DELETE CASCADE; template ID max 160 chars |
| `pc_imports` | `id` UUID | `user_id`, name (1–160), category (1–80), `tags text[]`, difficulty (max 40), private thumbnail and original paths, origin `upload/web`, source metadata, timestamps. User FK to `pc_accounts` with cascade; path constraints require the account's `<uid>/imports/` prefix; at least one file path |
| `pc_web_ideas` | `id` UUID | User FK, title, source/preview URL, source name, search term and timestamp; unique `(user_id,source_url)` |
| `pc_search_logs` | `id` bigint | User FK, search term (2–130 chars), `created_at`; used for request limits |

Additional indexes: `pc_choices_user_id_idx`, `pc_imports_owner_added_idx`, `pc_search_logs_owner_time_idx`, `pc_web_ideas_owner_idx`, plus the primary keys and idea uniqueness.

## Row-level security

RLS is active on the public app tables. Policies scope reads/writes to `auth.uid() = user_id`. The `pc_imports` and `pc_web_ideas` SELECT/INSERT/UPDATE/DELETE policies also check row ownership. Retain **both** ownership checks on UPDATE (`USING` and `WITH CHECK`). Do not expose the service-role key to clients or replace these with unrestricted authenticated-user policies.

## Private storage

- `pc-previews`: 2,053 uploaded images (661 + 1,392), approximately 194 MiB; private, read/write policies restricted to authenticated account paths.
- `pc-family-imports`: private, supported JPG/JPEG/PNG/WebP/PDF files under `<uid>/imports/`; INSERT/SELECT/UPDATE/DELETE policies restrict to the authenticated owner and supported file types.
- The Edge Function `pumpkin-image-search` uses **manual user/family authorization** and the `SERPAPI_KEY` server-only environment secret.
- `pc_choices`, `pc_people`, `pc_imports` and `pc_web_ideas` have been included in Supabase Realtime publication.

## Reproducing the schema safely

Use a **separate test Supabase project** and first extract a real schema-only dump from the project using a supported Supabase CLI version; verify the dump includes table definitions, indexes, constraints, RLS policies and storage policies before replaying it against test. Supabase-managed `auth` and `storage` schemas require special care.

This snapshot documents the live schema **but is not a complete executable SQL migration**. It does not establish the contents or version history of any production-only migrations. Never regenerate or reapply migrations on production merely to satisfy repository bookkeeping.
