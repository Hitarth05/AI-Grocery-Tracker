import Link from "next/link";
import { notFound } from "next/navigation";

import { markConsumed, markTossed } from "@/app/items/actions";
import { expiryParts, urgencyOf } from "@/lib/expiry";
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
  const { lead, trail } = expiryParts(item.expiry_date);
  const isActive = item.status === "active";

  return (
    <main
      data-urgency={urgency}
      className="px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <Link
        href="/items"
        className="inline-flex min-h-12 items-center text-sm font-medium text-[var(--ink-soft)]"
      >
        ← Back
      </Link>

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires in 10 min
        <img
          src={photoUrl}
          alt={item.display_name}
          className="mt-2 max-h-64 w-full rounded-[20px] object-cover shadow-[var(--shadow-card)]"
        />
      )}

      <div className="mt-5 flex items-start justify-between gap-3">
        <h1 className="type-display text-[26px] font-bold leading-tight">
          {item.display_name}
        </h1>
        <span className="u-pill mt-1 flex shrink-0 items-baseline gap-1 rounded-full px-3 py-1.5">
          <span className="text-[15px] font-bold leading-none">{lead}</span>
          {trail && <span className="text-[11px] font-medium opacity-75">{trail}</span>}
        </span>
      </div>

      <dl className="panel mt-6 flex flex-col gap-3.5 p-5 text-sm">
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
            <button type="submit" className="btn-primary min-h-14 w-full">
              Used it
            </button>
          </form>
          <form action={markTossed.bind(null, item.id)} className="flex-1">
            <button type="submit" className="btn-secondary min-h-14 w-full">
              Tossed it
            </button>
          </form>
        </div>
      ) : (
        <p className="panel mt-6 px-4 py-3.5 text-sm text-[var(--ink-soft)]">
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
      <dt className="text-[var(--ink-soft)]">{label}</dt>
      <dd className="text-right capitalize">{children}</dd>
    </div>
  );
}
