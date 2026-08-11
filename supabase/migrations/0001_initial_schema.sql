-- ============================================================
-- Grocery Expiry Tracker — initial schema (Supabase / Postgres)
-- Migration 0001
--
-- Design goals baked into this schema:
--   1. Segment-neutral: inventory belongs to a SPACE, not a user,
--      so household / cafe / office are all the same core with a tag.
--   2. Two expiry paths: printed-date read OR classify + shelf-life
--      estimate (see catalog_items + inventory_items.expiry_source).
--   3. Extraction is its OWN table so you can measure accuracy and
--      audit the vision pipeline independently (your MGG competency).
--   4. The two resume metrics fall straight out of the tables:
--        - extraction accuracy  -> extractions.was_corrected + confidence
--        - waste / traction      -> inventory_items.status + notifications
-- ============================================================

-- gen_random_uuid() is available in Supabase by default (pgcrypto).

-- ---------- enums ----------
create type space_type          as enum ('household', 'business', 'office');
create type storage_location    as enum ('pantry', 'fridge', 'freezer', 'other');
create type expiry_source       as enum ('printed', 'estimated', 'manual');
create type item_status         as enum ('active', 'consumed', 'tossed', 'expired');
create type extraction_method   as enum ('date_ocr', 'classification', 'hybrid');
create type printed_date_type   as enum ('use_by', 'best_before', 'sell_by', 'manufacture', 'unknown');
create type notification_type   as enum ('expiring_soon', 'expired');
create type notification_channel as enum ('push', 'email');
create type space_role          as enum ('owner', 'member');

-- ============================================================
-- profiles : app-level user data (mirrors auth.users)
-- ============================================================
create table profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  display_name      text,
  default_space_id  uuid,                 -- FK added after spaces exists
  -- default reminder lead time; per-item override can come later
  reminder_lead_days int not null default 3,
  push_enabled      boolean not null default true,
  email_enabled     boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- spaces : the thing that OWNS inventory (the shared fridge/pantry)
-- This is the segment-neutral bet — one household or one cafe = one space.
-- ============================================================
create table spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        space_type not null default 'household',
  created_at  timestamptz not null default now()
);

alter table profiles
  add constraint profiles_default_space_fk
  foreign key (default_space_id) references spaces (id) on delete set null;

-- ============================================================
-- space_members : who can access a space (multi-user from day one,
-- cheap now, avoids a painful migration when a 2nd household member
-- or cafe staffer needs in).
-- ============================================================
create table space_members (
  space_id   uuid not null references spaces (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       space_role not null default 'member',
  added_at   timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- ============================================================
-- catalog_items : shelf-life REFERENCE data (shared, not per-user).
-- This is the fallback path for items with no printed date (produce,
-- bakery, deli). Seed this from USDA FoodKeeper — it's the
-- authoritative shelf-life dataset and saves you guessing numbers.
-- ============================================================
create table catalog_items (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,              -- canonical, e.g. 'Banana'
  aliases                text[] not null default '{}', -- match classifier output
  category               text,                       -- produce / dairy / meat ...
  has_printed_date       boolean not null default false, -- milk yes, banana no
  shelf_life_pantry_days   int,
  shelf_life_fridge_days   int,
  shelf_life_freezer_days  int,
  shelf_life_opened_days   int,   -- opened milk, etc.
  source                 text,    -- e.g. 'usda_foodkeeper'
  created_at             timestamptz not null default now()
);
create index catalog_items_name_idx on catalog_items using gin (to_tsvector('english', name));

-- ============================================================
-- extractions : ONE row per scan. The audit + accuracy record.
--   predicted_* = what the model said
--   final_*     = what the user confirmed
--   was_corrected = the accuracy signal (accuracy = 1 - corrected/total)
--   confidence + needs_review = lets you TUNE the review threshold,
--     exactly the confidence-gating you did at MGG.
-- ============================================================
create table extractions (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references spaces (id) on delete cascade,
  created_by         uuid references auth.users (id) on delete set null,
  photo_path         text,          -- Supabase Storage object path
  method             extraction_method not null,
  raw_model_output   jsonb,         -- full response, for auditing
  predicted_name     text,
  predicted_date     date,
  predicted_date_type printed_date_type default 'unknown',
  confidence         numeric(4,3),  -- 0.000 - 1.000
  needs_review       boolean not null default false, -- below threshold
  user_confirmed     boolean not null default false,
  final_name         text,
  final_date         date,
  was_corrected      boolean,       -- did the user change the prediction?
  created_at         timestamptz not null default now()
);
create index extractions_space_idx on extractions (space_id);
create index extractions_review_idx on extractions (needs_review) where needs_review;

-- ============================================================
-- inventory_items : the actual physical items in a space.
-- status + resolved_at drive the waste metric (v1 keeps it as columns;
-- upgrade to a consumption_events log later if you need partial use).
-- ============================================================
create table inventory_items (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references spaces (id) on delete cascade,
  catalog_item_id  uuid references catalog_items (id) on delete set null,
  extraction_id    uuid references extractions (id) on delete set null,
  display_name     text not null,
  quantity         numeric not null default 1,
  unit             text,
  storage_location storage_location not null default 'fridge',
  expiry_date      date,                      -- effective expiry (read or est.)
  expiry_source    expiry_source not null,    -- how we got expiry_date
  opened           boolean not null default false,
  opened_at        timestamptz,
  status           item_status not null default 'active',
  resolved_at      timestamptz,               -- when consumed/tossed/expired
  added_at         timestamptz not null default now()
);
create index inventory_active_expiry_idx
  on inventory_items (space_id, expiry_date)
  where status = 'active';

-- ============================================================
-- notifications : log of reminders sent. Dedup + the ENGAGEMENT
-- signal — responded/response_action tells you if the reminder
-- actually drove a used/tossed action (your retention proxy).
-- ============================================================
create table notifications (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  type              notification_type not null,
  channel           notification_channel not null,
  sent_at           timestamptz not null default now(),
  responded         boolean not null default false,
  response_action   item_status                 -- 'consumed' | 'tossed' | null
);
create index notifications_item_idx on notifications (inventory_item_id);

-- ============================================================
-- Row Level Security
-- Enable on everything. Policies below are the REPRESENTATIVE pattern
-- (space-scoped access + public read on reference data). Finalize and
-- TEST these in Claude Code — Supabase RLS has a known recursion gotcha
-- on the membership table itself, so review before shipping.
-- ============================================================
alter table profiles        enable row level security;
alter table spaces          enable row level security;
alter table space_members   enable row level security;
alter table catalog_items   enable row level security;
alter table extractions     enable row level security;
alter table inventory_items enable row level security;
alter table notifications   enable row level security;

-- profiles: a user sees/edits only their own row
create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- catalog_items: shared reference data, readable by any signed-in user
create policy "catalog read" on catalog_items
  for select using (auth.role() = 'authenticated');

-- helper predicate reused below: is the current user a member of this space?
-- (inlined per-table to keep it simple; extract to a security-definer
--  function if you hit recursion.)

create policy "space access" on spaces
  for select using (
    exists (select 1 from space_members m
            where m.space_id = spaces.id and m.user_id = auth.uid())
  );

create policy "member rows" on space_members
  for select using (user_id = auth.uid());

create policy "inventory by space" on inventory_items
  for all using (
    exists (select 1 from space_members m
            where m.space_id = inventory_items.space_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from space_members m
            where m.space_id = inventory_items.space_id and m.user_id = auth.uid())
  );

create policy "extractions by space" on extractions
  for all using (
    exists (select 1 from space_members m
            where m.space_id = extractions.space_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from space_members m
            where m.space_id = extractions.space_id and m.user_id = auth.uid())
  );

create policy "own notifications" on notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
