# Grocery Tracker

A mobile-first web application that tracks groceries by photo and uses AI to read
expiry dates off packaging, so food gets used before it goes bad.

## About

Most food waste at home comes down to forgetting what's in the fridge and when it
expires. Logging groceries by hand solves that in theory, but nobody keeps it up —
the effort costs more than the food saved.

Grocery Tracker removes the typing. Photograph an item, and a vision model reads
the printed use-by date or identifies what the item is. The app tracks it, groups
everything by how soon it expires, and clearing an item is a single tap: used it,
or tossed it.

Designed for a phone held one-handed at an open fridge.

## How It Works

1. **Capture** - Photograph the label with the in-app camera. The photo uploads to
   private storage keyed to your household.
2. **AI Extraction** - Gemini 3.7 Flash reads the image and returns the item name,
   the printed expiry date if there is one, and a confidence score.
3. **Confidence Gating** - Above the threshold, the item files itself silently.
   Below it, the scan lands on a confirm screen with the prediction pre-filled, so
   correcting it is one tap rather than a form.
4. **Validation** - Predicted dates are sanity-checked before being trusted. Lot
   codes and Julian stamps that look like dates get rejected rather than tracked.
5. **Tracking** - Items are stored in Postgres and grouped by urgency, with the
   list colour-coded so what's expiring reads at a glance.
6. **Resolution** - One tap marks an item used or tossed, which is what produces
   the waste data the app measures.

## Features

* **Photo Capture** - Camera opens directly, no file picker detour
* **Automatic Date Reading** - Printed USE BY / BEST BEFORE dates read from the label
* **Item Classification** - Loose produce and bakery items with no printed date are
  still identified and tracked
* **Confidence Gating** - High-confidence scans file themselves; uncertain ones ask
  for a single confirmation tap
* **Urgency Grouping** - Items sorted and colour-coded by how soon they expire
* **One-Tap Resolution** - Used it or tossed it, from the list or the detail screen
* **Passwordless Sign-In** - Google OAuth or an email magic link
* **Shared Households** - Inventory belongs to a space, not a user, so a household
  shares one fridge
* **Private Photos** - Item photos live in a private bucket served through
  short-lived signed URLs
* **Mobile First** - Built for a phone, works on desktop

## Tech Stack

* **Frontend** - Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
* **Backend** - Next.js Server Actions and Route Handlers
* **Database** - Supabase (PostgreSQL) with Row Level Security
* **Auth** - Supabase Auth: Google OAuth and email magic link
* **Storage** - Supabase Storage, private bucket with policy-scoped access
* **AI** - Gemini 3.7 Flash for photo extraction, behind a swappable provider interface
* **Validation** - Zod schemas shared between the model output and the app
* **Deployment** - Vercel-ready

## Architecture

```
User photographs an item
  -> Upload to private Supabase Storage, keyed by household
  -> Send image to Gemini 3.7 Flash for extraction
  -> Validate the response: schema, date plausibility, self-consistency
  -> Write an extractions row (prediction, confidence, audit trail)
  -> Above confidence threshold: file the item automatically
     Below threshold: confirm screen, pre-filled, one tap to accept

User opens the app
  -> Next.js queries Supabase under Row Level Security
  -> Items grouped by urgency and colour-coded
  -> One tap marks an item used or tossed
```

The extraction provider is swappable. `src/lib/extraction/` keeps the prompt and
schema provider-neutral, with one file per provider and a single constant
selecting the active one — changing model vendor does not touch the app.

## Local Development

### Prerequisites

* Node.js 20+
* pnpm
* A Supabase project
* A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### Setup

```bash
# Clone the repository
git clone https://github.com/Hitarth05/AI-Grocery-Tracker.git
cd AI-Grocery-Tracker

# Install dependencies
pnpm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in your keys (see Environment Variables section below)

# Apply the database migrations
pnpm exec supabase login
pnpm exec supabase link --project-ref your_project_ref
pnpm exec supabase db push

# Run the development server
pnpm dev
```

To run the database locally instead of against a hosted project, Docker is
required:

```bash
pnpm exec supabase start
pnpm exec supabase db reset   # applies every migration in order
```

Open <http://localhost:3000>. To use it on a phone, open the Network URL that
`next dev` prints, with the phone on the same Wi-Fi.

### Environment Variables

Create a `.env.local` file with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
GEMINI_API_KEY=your_gemini_api_key
```

`GEMINI_API_KEY` is server-side only and must not be given a `NEXT_PUBLIC_`
prefix, which would inline it into the browser bundle.

### Checks

```bash
pnpm run check:tokens   # design tokens: one source for every primary colour
pnpm exec tsc --noEmit  # types
pnpm build              # production build
```

## Database Schema

Seven tables, all under Row Level Security:

* `profiles` - App-level user data, mirrors `auth.users`
* `spaces` - Owns the inventory, so a household shares one fridge
* `space_members` - Who can access a space, and in what role
* `inventory_items` - The physical items being tracked
* `extractions` - One row per scan: prediction, confidence, and correction record
* `catalog_items` - Shelf-life reference data for items with no printed date
* `notifications` - Log of reminders sent and whether they were acted on

Migrations live in `supabase/migrations/` and must be applied in order:

| File | What it does |
| --- | --- |
| `0001_initial_schema.sql` | Tables, enums, indexes, first-pass RLS |
| `0002_rls_bootstrap_storage.sql` | Finalized RLS, signup trigger, photo storage bucket |
| `0003_lock_down_function_grants.sql` | Restricts privileged functions to the right roles |
| `0004_one_item_per_extraction.sql` | Unique index enforcing one item per scan |
| `0005_restrict_photo_mime_types.sql` | Limits uploads to JPEG, PNG and WebP |

A signup trigger provisions a profile, a household space, and an owner membership
on the user's first sign-in, so a new account lands on a usable space with no
setup step.

## Future Improvements

* Shelf-life estimates from USDA FoodKeeper data, so items with no printed date
  get an expiry rather than a blank
* Expiry reminders via scheduled job and push notification
* Household invites — the schema and policies support multiple members, but there
  is no invite UI yet
* Partial consumption, for items used over several days rather than all at once
* Barcode lookup as a faster path for packaged goods
* Shopping list export from items marked used

## Author

Built by [Hitarth Sharma](https://github.com/Hitarth05), Computer Science student
at San Jose State University.
