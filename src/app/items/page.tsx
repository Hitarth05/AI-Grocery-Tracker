import Link from "next/link";

import { BottomNav } from "@/components/BottomNav";
import { ItemCard } from "@/components/ItemCard";
import { URGENCY_HEADING, URGENCY_ORDER, urgencyOf, type Urgency } from "@/lib/expiry";
import { getCurrentSpace } from "@/lib/spaces";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/types/database";

export const dynamic = "force-dynamic";

type ListItem = Pick<
  InventoryItem,
  | "id"
  | "display_name"
  | "quantity"
  | "unit"
  | "storage_location"
  | "expiry_date"
  | "expiry_source"
>;

export default async function ItemsPage() {
  const { spaceId, spaceName } = await getCurrentSpace();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      "id, display_name, quantity, unit, storage_location, expiry_date, expiry_source",
    )
    .eq("space_id", spaceId)
    .eq("status", "active")
    // Nulls last so undated items sink below everything with a real deadline.
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .returns<ListItem[]>();

  if (error) throw new Error(`Could not load items: ${error.message}`);

  const items = data ?? [];
  const grouped = new Map<Urgency, ListItem[]>();
  for (const item of items) {
    const key = urgencyOf(item.expiry_date);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return (
    <>
      {/* pb-28 clears the fixed bottom nav. */}
      <main className="px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="mb-6 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="type-display truncate text-[26px] font-bold leading-tight">
              {spaceName}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
              {items.length === 0
                ? "Nothing tracked yet"
                : `${items.length} item${items.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </header>

        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-7">
            {URGENCY_ORDER.filter((u) => grouped.has(u)).map((urgency) => (
              <section key={urgency}>
                <h2 className="type-eyebrow mb-2.5 px-1">
                  {URGENCY_HEADING[urgency]}
                </h2>
                <ul className="flex flex-col gap-3">
                  {grouped.get(urgency)!.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </>
  );
}

function EmptyState() {
  return (
    <div className="panel px-6 py-14 text-center">
      <p className="type-display text-lg font-bold">Scan your first item</p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--ink-soft)]">
        Point your camera at a label and we&apos;ll read the date. One item is enough
        to be useful.
      </p>
      <Link
        href="/add"
        className="btn-primary mt-7 inline-flex min-h-12 items-center rounded-2xl px-7 text-sm font-semibold"
      >
        Add an item
      </Link>
    </div>
  );
}
