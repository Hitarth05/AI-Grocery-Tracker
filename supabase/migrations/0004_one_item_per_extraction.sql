-- ============================================================
-- Grocery Expiry Tracker — one inventory item per extraction
-- Migration 0004
--
-- A double-tap on the confirm screen inserted two identical inventory rows.
-- The app now disables the submit button while the action is in flight and
-- checks for an existing item before inserting, but a check-then-insert has a
-- race: two concurrent requests can both read "no item yet" and both insert.
-- Only the database can actually make this exclusive.
--
-- Partial, because extraction_id is null for hand-entered items and there is
-- no natural key that would make two of those a duplicate rather than someone
-- genuinely buying two of the same thing. Postgres treats NULLs as distinct in
-- a unique index anyway; the WHERE clause states the intent and keeps the
-- index off the rows it would never constrain.
--
-- This will fail if duplicate rows still exist — that is the intended
-- behaviour. Resolve them and re-run rather than weakening the constraint.
-- ============================================================

create unique index if not exists inventory_items_one_per_extraction
  on public.inventory_items (extraction_id)
  where extraction_id is not null;

comment on index public.inventory_items_one_per_extraction is
  'A scan yields at most one item. Backstops the double-submit guard in '
  'confirmItem, which cannot be race-free on its own.';
