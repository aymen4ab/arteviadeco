---
name: create-migration
description: Create the next numbered Supabase SQL migration following this repo's conventions (header comment, idempotency, account-scoped RLS). Use when adding or changing tables, columns, indexes, RLS policies, RPCs or storage buckets.
argument-hint: <short_snake_case_description>
disable-model-invocation: true
---

# Create a Supabase migration

Migrations live in `supabase/migrations/NNN_description.sql` and are applied
in filename order. Committed migrations may already be applied to live
databases: **never edit one** (a hook blocks it). Always add a new file.

## Steps

1. Find the next number: `ls supabase/migrations | tail -1` and add 1,
   zero-padded to three digits. Name the file
   `NNN_$ARGUMENTS.sql` (snake_case).
2. Read the most recent two or three migrations, plus any earlier one that
   touched the same tables, before writing SQL. `017_account_sharing.sql`
   defines the account model and `is_account_member()`.
3. Write the file using the template below.
4. Update the matching TypeScript types in `src/types/index.ts`.
5. If the change affects API routes, update them and their tests, then run
   `npm run typecheck && npm test`.

## Conventions

- **Header block**: `-- ===` banner, filename, a one-line summary, then a
  prose explanation of _why_ (the problem, not just the DDL). End the header
  with `-- Idempotent — safe to run multiple times.`
- **Idempotent**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`. Postgres has
  no `CREATE POLICY IF NOT EXISTS`, so use `DROP POLICY IF EXISTS` then
  `CREATE POLICY`.
- **Account scoping**: data tables carry `account_id` and RLS is keyed on
  `is_account_member(account_id)` for reads and
  `is_account_member(account_id, 'agent' | 'admin')` for writes. Never key
  new policies on `auth.uid() = user_id`; that was the pre-017 model.
- **RLS on**: every new table gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
  and explicit select/insert/update/delete policies named `<table>_<op>`.
- **SECURITY DEFINER functions**: always `SET search_path = public`, and
  check the caller's authority via `auth.uid()` before writing. Raise
  `42501` for forbidden and `22023` for bad input (the API maps these via
  `toErrorResponse`).
- **Indexes**: index the hot-path predicates, usually composite with
  `account_id` first. Partial indexes for `is_active`/`status` filters.
- Section separators: `-- ====` banners with an upper-case title.

## Template

```sql
-- ============================================================
-- NNN_description.sql — one-line summary
--
-- Why this migration exists: what problem it solves and any
-- backward-compatibility notes.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- SECTION TITLE
-- ============================================================

CREATE TABLE IF NOT EXISTS example (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_example_account ON example(account_id);

ALTER TABLE example ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS example_select ON example;
CREATE POLICY example_select ON example FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS example_insert ON example;
CREATE POLICY example_insert ON example FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS example_update ON example;
CREATE POLICY example_update ON example FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS example_delete ON example;
CREATE POLICY example_delete ON example FOR DELETE USING (is_account_member(account_id, 'agent'));
```

If the Supabase MCP server is connected, run its security advisors after the
migration is applied to catch missing RLS or unsafe functions.
