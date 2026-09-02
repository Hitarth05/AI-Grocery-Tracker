"use client";

import Link from "next/link";
import { useTransition } from "react";

import { markConsumed, markTossed } from "@/app/items/actions";
import { expiryParts, urgencyOf } from "@/lib/expiry";
import type { InventoryItem } from "@/types/database";

interface Props {
  item: Pick<
    InventoryItem,
    "id" | "display_name" | "quantity" | "unit" | "storage_location" | "expiry_date" | "expiry_source"
  >;
}

export function ItemCard({ item }: Props) {
  const [pending, startTransition] = useTransition();
  const urgency = urgencyOf(item.expiry_date);
  const { lead, trail } = expiryParts(item.expiry_date);

  const quantity =
    item.quantity === 1 && !item.unit
      ? null
      : `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;

  return (
    // data-urgency sets --u-ink / --u-tint / --u-wash for this subtree; the
    // .u-card and .u-pill rules in globals.css read them. One colour decision,
    // applied to the card body and the pill together.
    <li
      data-urgency={urgency}
      className={`u-card overflow-hidden rounded-[20px] transition-opacity ${
        pending ? "opacity-50" : ""
      }`}
    >
      <Link href={`/items/${item.id}`} className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-snug">
            {item.display_name}
          </p>
          <p className="mt-1 truncate text-[13px] text-[var(--ink-soft)]">
            {[quantity, item.storage_location].filter(Boolean).join(" · ")}
            {item.expiry_source === "estimated" && " · estimated"}
          </p>
        </div>

        {/* Number large, unit small: at a glance the magnitude is what you
            need, and it keeps the pill narrow beside a long item name. */}
        <span className="u-pill flex shrink-0 items-baseline gap-1 rounded-full px-3 py-1.5">
          <span className="text-[15px] font-bold leading-none">{lead}</span>
          {trail && <span className="text-[11px] font-medium opacity-75">{trail}</span>}
        </span>
      </Link>

      {/* Same size and the same tap target, different weight: "Used it" is
          the common outcome and carries the solid fill, "Tossed it" stays
          one tap away without competing for attention. */}
      <div className="flex gap-2 px-3 pb-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => markConsumed(item.id))}
          className="btn-primary min-h-12 flex-1 rounded-2xl transition-opacity disabled:opacity-60"
        >
          Used it
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => markTossed(item.id))}
          className="btn-secondary min-h-12 flex-1 rounded-2xl transition-opacity disabled:opacity-60"
        >
          Tossed it
        </button>
      </div>
    </li>
  );
}
