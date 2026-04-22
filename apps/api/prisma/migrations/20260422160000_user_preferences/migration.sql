-- Add the `preferences` JSONB column the auth service already reads and
-- writes. Nullable so existing rows don't need a backfill; defaults to
-- NULL and callers treat that as an empty bag.
--
-- This is the minimal schema change to make `tsc --noEmit` clean without
-- touching auth.service.ts. The longer-term plan is to move password
-- hashes + auth metadata onto the dedicated UserAuth table and drop
-- preferences from User. That's tracked as a separate refactor.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" JSONB;
