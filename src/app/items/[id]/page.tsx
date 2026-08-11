import Link from "next/link";
import { notFound } from "next/navigation";

import { markConsumed, markTossed } from "@/app/items/actions";
import { expiryLabel, URGENCY_PILL, urgencyOf } from "@/lib/expiry";
import { createClient } from "@/lib/supabase/server";
import type { Extraction, InventoryItem } from "@/types/database";

export const dynamic = "force-dynamic";

type ItemWithExtraction = InventoryItem & {
  extractions: Pick<
    Extraction,
    "photo_path" | "confidence" | "predicted_name" | "predicted_date" | "was_corrected"
  > | null;
};

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS scopes this to the caller's spaces, so a foreign id returns no row.
  const { data: item } = await supabase
    .from("inventory_items")
    .select(
      "*, extractions (photo_path, confidence, predicted_name, predicted_date, was_corrected)",
    )
    .eq("id", id)
    .maybeSingle<ItemWithExtraction>();

  if (!item) notFound();

  let photoUrl: string | null = null;
  if (item.extractions?.photo_path) {
    const { data } = await supabase.storage
      .from("item-photos")
      .createSignedUrl(item.extractions.photo_path, 60 * 10);
    photoUrl = data?.signedUrl ?? null;
  }

  const urgency = urgencyOf(item.expiry_date);
  const isActive = item.status === "active";

  return (
    <main className="px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/items" className="inline-flex min-h-12 items-center text-sm text-neutral-500">
        ← Back
      </Link>

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires in 10 min
        <img
          src={photoUrl}
          alt={item.display_name}
          className="mt-2 max-h-64 w-full rounded-2xl object-cover"
        />
      )}

      <div className="mt-5 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{item.display_name}</h1>
        <span
          className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${URGENCY_PILL[urgency]}`}
        >
          {expiryLabel(item.expiry_date)}
        </span>
      </div>

      <dl className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
        <Row label="Quantity">
          {item.quantity}
          {item.unit ? ` ${item.unit}` : ""}
        </Row>
        <Row label="Stored in">{item.storage_location}</Row>
        <Row label="Expiry date">{item.expiry_date ?? "Not set"}</Row>
        <Row label="Date came from">{item.expiry_source}</Row>
        <Row label="Status">{item.status}</Row>
        {item.extractions?.confidence != null && (
          <Row label="Model confidence">
            {(Number(item.extractions.confidence) * 100).toFixed(0)}%
            {item.extractions.was_corrected ? " · corrected by you" : ""}
          </Row>
        )}
      </dl>

      {isActive ? (
        <div className="mt-6 flex gap-3">
          <form action={markConsumed.bind(null, item.id)} className="flex-1">
            <button
              type="submit"
              className="min-h-14 w-full rounded-xl bg-emerald-600 font-medium text-white"
            >
              Used it
            </button>
          </form>
          <form action={markTossed.bind(null, item.id)} className="flex-1">
            <button
              type="submit"
              className="min-h-14 w-full rounded-xl border border-border font-medium"
            >
              Tossed it
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-surface px-4 py-3 text-sm text-neutral-500">
          Marked {item.status}
          {item.resolved_at
            ? ` on ${new Date(item.resolved_at).toLocaleDateString()}`
            : ""}
          .
        </p>
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-right capitalize">{children}</dd>
    </div>
  );
}
