"use client";

import Link from "next/link";
import { useTransition } from "react";

import { markConsumed, markTossed } from "@/app/items/actions";
import { expiryLabel, URGENCY_PILL, urgencyOf } from "@/lib/expiry";
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

  const quantity =
    item.quantity === 1 && !item.unit
      ? null
      : `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;

  return (
    <li
      className={`rounded-2xl border border-border bg-surface transition-opacity ${
        pending ? "opacity-50" : ""
      }`}
    >
      <Link href={`/items/${item.id}`} className="flex items-center gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.display_name}</p>
          <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
            {[quantity, item.storage_location].filter(Boolean).join(" · ")}
            {item.expiry_source === "estimated" && " · estimated"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${URGENCY_PILL[urgency]}`}
        >
          {expiryLabel(item.expiry_date)}
        </span>
      </Link>

      {/* Both actions are one tap and full-width-ish: confirming is cheap. */}
      <div className="mt-3 flex gap-2 border-t border-border p-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => markConsumed(item.id))}
          className="min-h-12 flex-1 rounded-xl bg-emerald-600 text-sm font-medium text-white disabled:opacity-60"
        >
          Used it
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => markTossed(item.id))}
          className="min-h-12 flex-1 rounded-xl border border-border text-sm font-medium disabled:opacity-60"
        >
          Tossed it
        </button>
      </div>
    </li>
  );
}
