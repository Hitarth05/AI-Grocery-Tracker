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

Migrations live in `supabase/migrations/` and must all be applied, in order:

| File | What it does |
| --- | --- |
| `0001_initial_schema.sql` | Tables, enums, indexes, first-pass RLS |
| `0002_rls_bootstrap_storage.sql` | Finalized RLS, signup trigger, `item-photos` bucket |
| `0003_lock_down_function_grants.sql` | Restricts SECURITY DEFINER functions to the right roles |
| `0004_one_item_per_extraction.sql` | Unique index — one inventory item per scan |
| `0005_restrict_photo_mime_types.sql` | Drops HEIC/HEIF, which no vision model reads |

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
    api/extract/      re-run extraction for an existing photo
  components/         ItemCard, CaptureButton, BottomNav
  lib/
    supabase/         browser / server / middleware clients
    extraction/       vision extraction — see below
    photos.ts         load a stored photo as model-ready bytes
    expiry.ts         day math and urgency buckets
    spaces.ts         current user's space
  middleware.ts       refreshes the session, gates protected routes
```

### Extraction

`src/lib/extraction/` reads the photo with Claude Sonnet 5 and returns a name, an
expiry date when one is printed, and a confidence score.

| File | Role |
| --- | --- |
| `index.ts` | The only thing callers import. Validation, sanity checks, failure handling. |
| `prompt.ts` | System prompt and the Zod output schema. Provider-neutral. |
| `anthropic.ts` | The one file that imports the SDK. |

Two paths, one call: read a printed USE BY / BEST BEFORE date, or — for loose
produce, bakery, and deli — classify the item and return a null date. The
classification path stays date-less until `catalog_items` is seeded with shelf
lives; the classification is recorded either way, so it becomes useful the moment
that data lands.

`REVIEW_THRESHOLD` in `index.ts` is the confidence dial: above it a scan is
accepted silently, below it the user confirms. Start conservative to gather
labels, and raise it as measured precision climbs — but note that a model's
self-reported confidence is **not** a calibrated probability, so check accuracy
against the score on real reviewed scans before trusting a higher threshold.

**Extraction never throws.** An API error, a refusal, a missing key, or an
unreadable response all return confidence `0`, which routes the scan to the
confirm screen with the reason recorded in `raw_model_output`. A model outage
degrades the app to manual entry; it does not fail an upload at the fridge.

### Security notes

- Photos live in a **private** bucket, keyed `{space_id}/{uuid}.ext`, and are
  shown through short-lived signed URLs. The first path segment is what the RLS
  policy checks, so it must be the space id.
- `ANTHROPIC_API_KEY` is server-side only. Never give it a `NEXT_PUBLIC_` prefix —
  that inlines the value into the browser bundle.
- Spaces are created through the `create_space()` function, not a direct insert.
  A raw insert would leave the space ownerless for a moment, and an ownerless
  space is claimable by anyone.
- RLS policies call the `is_space_member()` / `is_space_owner()` SECURITY DEFINER
  helpers rather than inlining a subquery on `space_members`. That is what keeps
  the membership table's own policy from recursing into itself.

## Not built yet

- USDA FoodKeeper seed data for `catalog_items` — until it lands, the
  no-printed-date path classifies the item but can't estimate a shelf life
- Reminders: a Vercel cron calling `mark_expired_items()` and writing
  `notifications`
- Multi-user invites (the schema and policies support it; there's no UI)
