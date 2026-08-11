# Fridge — grocery expiry tracker

Photograph a grocery item, get reminded before it expires, tap "used it" or
"tossed it". See [CLAUDE.md](./CLAUDE.md) for the product thinking; this file is
just how to run it.

Next.js (App Router) · Supabase (Postgres + Auth + Storage) · Tailwind.

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # then fill in the two NEXT_PUBLIC_ values
```

### Database

Two migrations live in `supabase/migrations/`, and both must be applied:

| File | What it does |
| --- | --- |
| `0001_initial_schema.sql` | Tables, enums, indexes, first-pass RLS |
| `0002_rls_bootstrap_storage.sql` | Finalized RLS, signup trigger, `item-photos` bucket |

**0002 is not optional.** 0001's policies have no INSERT path for `spaces` or
`space_members`, so without 0002 a new user authenticates and then sits in front
of an empty list they can never add to.

**Local** (needs Docker running):

```bash
pnpm exec supabase start
pnpm exec supabase db reset    # applies both migrations in order
```

**Hosted:**

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>
pnpm exec supabase db push
```

Or paste both files, in order, into the dashboard's SQL Editor.

### Run

```bash
pnpm dev
```

Open <http://localhost:3000>. To use it on a phone — which is the point — hit the
Network URL `next dev` prints, with the phone on the same Wi-Fi.

## How it fits together

```
src/
  app/
    login/            magic-link sign-in
    auth/callback/    exchanges the link's code for a session
    items/            home screen: what's expiring, one-tap used/tossed
    add/              camera capture → upload → confirm
    api/extract/      re-run extraction for an existing photo (stub)
  components/         ItemCard, CaptureButton, BottomNav
  lib/
    supabase/         browser / server / middleware clients
    extraction.ts     THE VISION STUB — see below
    expiry.ts         day math and urgency buckets
    spaces.ts         current user's space
  middleware.ts       refreshes the session, gates protected routes
```

### The extraction stub

`src/lib/extraction.ts` returns confidence `0` and no prediction. Everything
around it is wired: the photo uploads, an `extractions` row is written, and the
scan lands on the confirm screen because zero is below `REVIEW_THRESHOLD`.
Implementing the real vision call means changing that one function.

`REVIEW_THRESHOLD` in the same file is the confidence dial — above it, a scan is
accepted silently; below it, the user confirms. Start it conservative to gather
labels, raise it as measured precision climbs.

### Security notes

- Photos live in a **private** bucket, keyed `{space_id}/{uuid}.ext`, and are
  shown through short-lived signed URLs. The first path segment is what the RLS
  policy checks, so it must be the space id.
- Spaces are created through the `create_space()` function, not a direct insert.
  A raw insert would leave the space ownerless for a moment, and an ownerless
  space is claimable by anyone.
- RLS policies call the `is_space_member()` / `is_space_owner()` SECURITY DEFINER
  helpers rather than inlining a subquery on `space_members`. That is what keeps
  the membership table's own policy from recursing into itself.

## Not built yet

- The vision call (see above)
- USDA FoodKeeper seed data for `catalog_items`
- Reminders: a Vercel cron calling `mark_expired_items()` and writing
  `notifications`
- Multi-user invites (the schema and policies support it; there's no UI)
