import Link from "next/link";

import { confirmItem } from "@/app/add/actions";
import { createClient } from "@/lib/supabase/server";
import type { StorageLocation } from "@/types/database";

export const dynamic = "force-dynamic";

const LOCATIONS: StorageLocation[] = ["fridge", "freezer", "pantry", "other"];

const INPUT =
  "min-h-14 w-full rounded-xl border border-border bg-surface px-4 outline-none focus:ring-2 focus:ring-emerald-600";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ extraction?: string; error?: string }>;
}) {
  const { extraction: extractionId, error } = await searchParams;

  const supabase = await createClient();

  const { data: extraction } = extractionId
    ? await supabase
        .from("extractions")
        .select("id, photo_path, predicted_name, predicted_date, confidence, needs_review")
        .eq("id", extractionId)
        .maybeSingle()
    : { data: null };

  // Private bucket — a signed URL is the only way to show the photo back.
  let photoUrl: string | null = null;
  if (extraction?.photo_path) {
    const { data } = await supabase.storage
      .from("item-photos")
      .createSignedUrl(extraction.photo_path, 60 * 10);
    photoUrl = data?.signedUrl ?? null;
  }

  const needsReview = extraction?.needs_review ?? true;

  return (
    <main className="px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-semibold tracking-tight">
        {needsReview ? "Check this" : "Looks good?"}
      </h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {extraction
          ? needsReview
            ? "We weren't confident enough to file this on its own."
            : "Confirm and it's tracked."
          : "Add an item by hand."}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error === "name_required" ? "Give the item a name." : error}
        </p>
      )}

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires in 10 min
        <img
          src={photoUrl}
          alt="The item you photographed"
          className="mt-5 max-h-56 w-full rounded-2xl object-cover"
        />
      )}

      <form action={confirmItem} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="extraction_id" value={extraction?.id ?? ""} />

        <Field label="Item" htmlFor="display_name">
          <input
            id="display_name"
            name="display_name"
            required
            autoFocus={!extraction?.predicted_name}
            defaultValue={extraction?.predicted_name ?? ""}
            placeholder="Milk"
            className={INPUT}
          />
        </Field>

        <Field label="Expires" htmlFor="expiry_date">
          <input
            id="expiry_date"
            type="date"
            name="expiry_date"
            defaultValue={extraction?.predicted_date ?? ""}
            className={INPUT}
          />
        </Field>

        <Field label="Where">
          {/* Radio pills rather than a select: one tap, no picker wheel. */}
          <div className="grid grid-cols-4 gap-2">
            {LOCATIONS.map((loc, i) => (
              <label
                key={loc}
                className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-sm capitalize has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-600 has-[:checked]:text-white"
              >
                <input
                  type="radio"
                  name="storage_location"
                  value={loc}
                  defaultChecked={i === 0}
                  className="sr-only"
                />
                {loc}
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="How many" htmlFor="quantity">
            <input
              id="quantity"
              type="number"
              name="quantity"
              min="1"
              step="1"
              inputMode="numeric"
              defaultValue={1}
              className={INPUT}
            />
          </Field>
          <Field label="Unit (optional)" htmlFor="unit">
            <input id="unit" name="unit" placeholder="lbs, cartons…" className={INPUT} />
          </Field>
        </div>

        <button
          type="submit"
          className="mt-2 min-h-14 rounded-xl bg-emerald-600 font-medium text-white"
        >
          Track it
        </button>

        <Link
          href="/items"
          className="flex min-h-12 items-center justify-center text-sm text-neutral-500"
        >
          Cancel
        </Link>
      </form>
    </main>
  );
}

const FIELD_LABEL =
  "px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400";

/**
 * `htmlFor` associates the caption with a single control. The radio group has
 * no single control to point at, so it passes no `htmlFor` and gets a plain
 * span — a <label> there would nest labels, which is invalid HTML and makes
 * taps land on the wrong control.
 */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={FIELD_LABEL}>
          {label}
        </label>
      ) : (
        <span className={FIELD_LABEL}>{label}</span>
      )}
      {children}
    </div>
  );
}
