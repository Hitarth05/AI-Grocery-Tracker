-- ============================================================
-- Grocery Expiry Tracker — RLS finalization, signup bootstrap, storage
-- Migration 0002
--
-- 0001 called its policies "the REPRESENTATIVE pattern ... finalize and TEST".
-- This migration finalizes them. Three things were missing:
--
--   1. NO INSERT PATH. spaces and space_members each had only a SELECT policy,
--      so a new user could never create a space nor insert their own
--      membership row. Every space-scoped policy then evaluated to false
--      forever: the app would authenticate and show an empty, unfillable list.
--
--   2. THE RECURSION GOTCHA 0001 warns about. It isn't present in 0001 (the
--      policy there is a flat `user_id = auth.uid()`), but it appears the
--      moment you want to see a housemate's membership row — that predicate
--      queries space_members from inside space_members' own policy. A
--      SECURITY DEFINER function breaks the cycle because its body runs with
--      RLS suspended, so it never re-enters the policy.
--
--   3. NO STORAGE. Item photos need a bucket, and it must be private —
--      these are pictures of the inside of someone's fridge.
-- ============================================================

-- ============================================================
-- 1. Membership helper
--
-- SECURITY DEFINER so the body bypasses RLS (no recursion), STABLE so the
-- planner can hoist it out of per-row evaluation, and search_path pinned so a
-- caller cannot shadow `space_members` with their own table and grant
-- themselves membership.
-- ============================================================
create or replace function public.is_space_member(target_space_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.space_members m
    where m.space_id = target_space_id
      and m.user_id  = auth.uid()
  );
$$;

revoke all on function public.is_space_member(uuid) from public;
grant execute on function public.is_space_member(uuid) to authenticated;

comment on function public.is_space_member(uuid) is
  'Is the current user a member of this space? SECURITY DEFINER so RLS policies '
  'can call it without recursing into space_members.';

-- Same idea, but for the owner-only writes below.
create or replace function public.is_space_owner(target_space_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.space_members m
    where m.space_id = target_space_id
      and m.user_id  = auth.uid()
      and m.role     = 'owner'
  );
$$;

revoke all on function public.is_space_owner(uuid) from public;
grant execute on function public.is_space_owner(uuid) to authenticated;

-- ============================================================
-- 2. Signup bootstrap
--
-- Gives a brand-new user a profile, a space, and an owner membership in one
-- shot. This is what makes "day-one value before data" true: the user lands on
-- a usable space with zero setup taps. Runs as DEFINER, which is also how it
-- sidesteps the chicken-and-egg — at this instant the user is a member of
-- nothing, so no space-scoped policy would let them insert anything.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_space_id uuid;
  friendly_name text;
begin
  friendly_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.spaces (name, type)
  values (friendly_name || '''s kitchen', 'household')
  returning id into new_space_id;

  insert into public.space_members (space_id, user_id, role)
  values (new_space_id, new.id, 'owner');

  insert into public.profiles (id, display_name, default_space_id)
  values (new.id, friendly_name, new_space_id)
  on conflict (id) do update
    set default_space_id = coalesce(public.profiles.default_space_id, excluded.default_space_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Creating an additional space later (a second household, a cafe) has the same
-- chicken-and-egg as signup, so it gets the same treatment: space and owner
-- membership in one transaction, no window in which the space is ownerless.
create or replace function public.create_space(
  space_name text,
  kind space_type default 'household'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_space_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_space requires an authenticated user';
  end if;

  if coalesce(trim(space_name), '') = '' then
    raise exception 'space_name must not be blank';
  end if;

  insert into public.spaces (name, type)
  values (trim(space_name), kind)
  returning id into new_space_id;

  insert into public.space_members (space_id, user_id, role)
  values (new_space_id, auth.uid(), 'owner');

  return new_space_id;
end;
$$;

revoke all on function public.create_space(text, space_type) from public;
grant execute on function public.create_space(text, space_type) to authenticated;

-- ============================================================
-- 3. Policies
--
-- Recreated against the helpers. Semantics are unchanged where 0001 already
-- had them right; what's new is the write paths and co-member visibility.
-- ============================================================

-- ---------- spaces ----------
drop policy if exists "space access" on public.spaces;

create policy "spaces: members read"
  on public.spaces for select
  to authenticated
  using (public.is_space_member(id));

-- Deliberately NO insert policy: spaces are created through create_space()
-- below, which inserts the space and its owner membership in one transaction.
-- A raw client-side insert would leave the space ownerless for a moment, and
-- an ownerless space is claimable by anyone.

create policy "spaces: owners update"
  on public.spaces for update
  to authenticated
  using (public.is_space_owner(id))
  with check (public.is_space_owner(id));

create policy "spaces: owners delete"
  on public.spaces for delete
  to authenticated
  using (public.is_space_owner(id));

-- ---------- space_members ----------
drop policy if exists "member rows" on public.space_members;

-- Widened from "my own row" to "everyone in my spaces" so the UI can show who
-- shares the fridge. Safe only because is_space_member is DEFINER.
create policy "members: read co-members"
  on public.space_members for select
  to authenticated
  using (public.is_space_member(space_id));

-- Only an existing owner may add someone. The other way in — creating a space
-- and becoming its owner — goes through create_space(), which runs as DEFINER
-- and so is not subject to this check.
--
-- An earlier draft of this policy also allowed "insert yourself into a space
-- that currently has no members", to cover claiming a just-created space. That
-- is unsafe twice over: the `not exists` subquery is itself filtered by this
-- table's SELECT policy, so a user cannot see the row that would disqualify
-- them and the check passes for spaces that are in fact owned; and even with a
-- DEFINER lookup it would let anyone claim any momentarily-ownerless space.
create policy "members: owners invite"
  on public.space_members for insert
  to authenticated
  with check (public.is_space_owner(space_id));

-- Owners remove anyone; anyone may remove themselves (leave a space).
create policy "members: owner removes or self-leave"
  on public.space_members for delete
  to authenticated
  using (public.is_space_owner(space_id) or user_id = auth.uid());

create policy "members: owners change roles"
  on public.space_members for update
  to authenticated
  using (public.is_space_owner(space_id))
  with check (public.is_space_owner(space_id));

-- ---------- catalog_items ----------
-- 0001 used auth.role(), which reads the JWT claim; `to authenticated` is the
-- role-based equivalent and is what Supabase recommends now.
drop policy if exists "catalog read" on public.catalog_items;

create policy "catalog: authenticated read"
  on public.catalog_items for select
  to authenticated
  using (true);

-- ---------- inventory_items ----------
drop policy if exists "inventory by space" on public.inventory_items;

create policy "inventory: by space"
  on public.inventory_items for all
  to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

-- ---------- extractions ----------
drop policy if exists "extractions by space" on public.extractions;

create policy "extractions: by space"
  on public.extractions for all
  to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

-- ---------- profiles ----------
-- 0001's policy is correct but `for all` with no INSERT-time guard leaves the
-- row creatable only by the trigger. Restate it scoped to authenticated.
drop policy if exists "own profile" on public.profiles;

create policy "profiles: own row"
  on public.profiles for all
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- notifications ----------
drop policy if exists "own notifications" on public.notifications;

create policy "notifications: own"
  on public.notifications for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 4. Storage
--
-- Private bucket. Object paths are `{space_id}/{uuid}.{ext}`, so the first
-- path segment is the access key: storage.foldername(name) splits the path and
-- element 1 is that space id. Same membership check as every other table.
--
-- Photos are served through short-lived signed URLs (createSignedUrl), never
-- a public URL — the bucket being private is what makes that meaningful.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-photos',
  'item-photos',
  false,
  10485760,  -- 10 MB; phone camera JPEGs land well under this
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- The membership check per object path. A plain
-- `is_space_member(((storage.foldername(name))[1])::uuid)` looks equivalent but
-- raises invalid_text_representation on any object whose first path segment
-- isn't a UUID — a policy that errors instead of returning false turns a
-- crafted upload path into a 500. Validate, then cast.
create or replace function public.can_access_item_photo(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  segment text;
begin
  segment := (storage.foldername(object_name))[1];

  if segment is null
     or segment !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  return public.is_space_member(segment::uuid);
end;
$$;

revoke all on function public.can_access_item_photo(text) from public;
grant execute on function public.can_access_item_photo(text) to authenticated;

drop policy if exists "item photos: read by space" on storage.objects;
drop policy if exists "item photos: insert by space" on storage.objects;
drop policy if exists "item photos: update by space" on storage.objects;
drop policy if exists "item photos: delete by space" on storage.objects;

create policy "item photos: read by space"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'item-photos' and public.can_access_item_photo(name));

create policy "item photos: insert by space"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-photos' and public.can_access_item_photo(name));

create policy "item photos: update by space"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'item-photos' and public.can_access_item_photo(name))
  with check (bucket_id = 'item-photos' and public.can_access_item_photo(name));

create policy "item photos: delete by space"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-photos' and public.can_access_item_photo(name));

-- ============================================================
-- 5. Expiry sweep
--
-- Flips past-due active items to 'expired' so the waste metric doesn't count
-- them as still-in-the-fridge. Call from the same Vercel cron that sends
-- reminders. Idempotent — safe to run as often as you like.
-- ============================================================
create or replace function public.mark_expired_items()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with swept as (
    update public.inventory_items
       set status = 'expired',
           resolved_at = now()
     where status = 'active'
       and expiry_date is not null
       and expiry_date < current_date
    returning 1
  )
  select count(*)::int from swept;
$$;

revoke all on function public.mark_expired_items() from public;
