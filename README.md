# Grocery Tracker

Photograph a grocery item, and it gets tracked with an expiry date so you can use
it before it goes bad. A vision model reads the printed use-by date where there
is one, or identifies the item where there isn't. Items are grouped by urgency,
and clearing one is a single tap: used it, or tossed it.

Built mobile-first — the screen you actually use is a phone held one-handed at
an open fridge.

## Stack

- **Next.js** (App Router, TypeScript)
- **Supabase** — Postgres, Auth, Storage
- **Tailwind CSS**
- **Gemini Flash** for photo extraction, behind a swappable provider interface

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # then fill in the values
```

You will need a Supabase project and a Gemini API key. Both go in `.env.local`;
neither may carry a `NEXT_PUBLIC_` prefix, which would inline the value into the
browser bundle.

### Database

Migrations live in `supabase/migrations/` and must all be applied, in order:

| File | What it does |
| --- | --- |
| `0001_initial_schema.sql` | Tables, enums, indexes, first-pass RLS |
| `0002_rls_bootstrap_storage.sql` | Finalized RLS, signup trigger, `item-photos` bucket |
| `0003_lock_down_function_grants.sql` | Restricts SECURITY DEFINER functions to the right roles |
| `0004_one_item_per_extraction.sql` | Unique index — one inventory item per scan |
| `0005_restrict_photo_mime_types.sql` | Limits photos to JPEG/PNG/WebP |

**0002 is not optional.** 0001's policies have no INSERT path for `spaces` or
`space_members`, so without it a new user authenticates and then sits in front of
an empty list they can never add to.

**Local** (needs Docker running):

```bash
pnpm exec supabase start
pnpm exec supabase db reset    # applies every migration in order
```

**Hosted:**

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>
pnpm exec supabase db push
```

Or paste each file, in order, into the dashboard's SQL Editor.

### Run

```bash
pnpm dev
```

Open <http://localhost:3000>. To use it on a phone, hit the Network URL
`next dev` prints, with the phone on the same Wi-Fi.

## Project layout

```
src/
  app/
    login/            magic-link and Google sign-in
    auth/callback/    exchanges the auth code for a session
    items/            home screen: what's expiring, one-tap used/tossed
    add/              camera capture → upload → confirm
    api/extract/      re-run extraction for an existing photo
  components/         ItemCard, CaptureButton, BottomNav
  lib/
    supabase/         browser / server / middleware clients
    extraction/       photo extraction and its providers
    photos.ts         load a stored photo as model-ready bytes
    expiry.ts         day math and urgency buckets
    spaces.ts         current user's space
  middleware.ts       refreshes the session, gates protected routes
```

## Extraction

`src/lib/extraction/` reads a photo and returns an item name, an expiry date
where one is printed, and a confidence score.

| File | Role |
| --- | --- |
| `index.ts` | The only module callers import — provider selection, validation, failure handling |
| `prompt.ts` | Extraction schema and instructions, provider-neutral |
| `gemini.ts` | Google provider (active) |
| `anthropic.ts` | Alternate provider |

Switching providers is one constant, `ACTIVE_PROVIDER` in `index.ts`. Both stay
imported so both are typechecked on every build.

`REVIEW_THRESHOLD` is the confidence gate: above it a scan is accepted silently,
below it the user confirms on the next screen. A model's self-reported confidence
is not a calibrated probability, so check accuracy against the score on real
reviewed scans before raising it.

Extraction never throws. An API error, a missing key, or an unreadable response
all return confidence `0`, which routes the scan to the confirm screen with the
reason recorded in `raw_model_output` — a provider outage degrades the app to
manual entry rather than failing the upload.

## Design system

Colours, type and component classes live in `src/app/globals.css`. Primary
actions resolve to a single `--primary` token; `pnpm run check:tokens` fails the
build if a colour literal creeps into a component or a button stops referencing
the token.

## Security notes

- Photos live in a **private** bucket keyed `{space_id}/{uuid}.ext` and are served
  through short-lived signed URLs. The first path segment is what the storage RLS
  policy checks, so it must be the space id.
- API keys are server-side only. A `NEXT_PUBLIC_` prefix would publish them.
- Spaces are created through `create_space()` rather than a direct insert. A raw
  insert would leave the space ownerless for a moment, and an ownerless space is
  claimable by anyone.
- RLS policies call the `is_space_member()` / `is_space_owner()` SECURITY DEFINER
  helpers rather than inlining a subquery on `space_members`, which is what stops
  the membership table's own policy recursing into itself.

## Not built yet

- USDA FoodKeeper shelf-life data for `catalog_items` — until it lands, items with
  no printed date are identified but not given an estimated expiry
- Reminders: a scheduled job calling `mark_expired_items()` and writing
  `notifications`
- Multi-user invites — the schema and policies support it, but there is no UI
