-- ============================================================
-- Grocery Expiry Tracker — tighten function privileges
-- Migration 0003
--
-- 0002 tried to lock its SECURITY DEFINER functions down with
--   revoke all on function ... from public;
--   grant execute on function ... to authenticated;
--
-- That is not enough on Supabase. REVOKE ... FROM PUBLIC only drops the
-- PUBLIC pseudo-role's privileges; it does not touch grants held by the `anon`
-- and `authenticated` roles, which Supabase hands out through default
-- privileges on the public schema. Every function in 0002 stayed callable by
-- anon, confirmed against the deployed project:
--
--   POST /rest/v1/rpc/mark_expired_items   ->  200  0
--
-- For the read-only helpers that is merely untidy — they resolve auth.uid()
-- to NULL and return false. For mark_expired_items it matters more: it is
-- SECURITY DEFINER so it bypasses RLS, it WRITES, it is not scoped to a space,
-- and the publishable key that reaches it ships in the client bundle.
--
-- Scoping the damage honestly: the function only touches rows that are already
-- past due, and it is idempotent, so a caller cannot expire anything early or
-- corrupt a row the nightly cron wouldn't have touched anyway. What they get is
-- an unauthenticated, unthrottled, cross-tenant write — a table scan plus
-- update on demand — and the ability to stamp resolved_at ahead of schedule,
-- which front-runs the reminder logic that reads status = 'active'.
--
-- Low severity, real defect. It should be reachable by the cron and nothing else.
-- ============================================================

-- ---------- the mutating one: service_role only ----------
revoke all on function public.mark_expired_items() from public, anon, authenticated;
grant execute on function public.mark_expired_items() to service_role;

comment on function public.mark_expired_items() is
  'Sweeps past-due active items to status=expired. SECURITY DEFINER and '
  'cross-tenant by design — call it from the reminder cron with the service '
  'role key, never from the browser.';

-- ---------- read-only helpers: authenticated only, not anon ----------
-- These are called from inside RLS policies, which evaluate as the querying
-- role, so `authenticated` genuinely needs EXECUTE. `anon` never does: every
-- policy in 0002 is already scoped `to authenticated`.
revoke all on function public.is_space_member(uuid) from public, anon;
grant execute on function public.is_space_member(uuid) to authenticated;

revoke all on function public.is_space_owner(uuid) from public, anon;
grant execute on function public.is_space_owner(uuid) to authenticated;

revoke all on function public.can_access_item_photo(text) from public, anon;
grant execute on function public.can_access_item_photo(text) to authenticated;

-- ---------- create_space: authenticated only ----------
-- Its internal `if auth.uid() is null then raise` guard already rejected anon
-- callers, so this is defence in depth rather than a fix.
revoke all on function public.create_space(text, space_type) from public, anon;
grant execute on function public.create_space(text, space_type) to authenticated;

-- ---------- stop the next one leaking the same way ----------
-- Supabase's default privileges grant EXECUTE on new functions in `public` to
-- anon and authenticated. Turn that off so a future SECURITY DEFINER function
-- is unreachable until someone grants it deliberately.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
