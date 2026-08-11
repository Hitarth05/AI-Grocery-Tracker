"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { ItemStatus } from "@/types/database";

/**
 * The one-tap resolution. RLS scopes the update to the caller's spaces, so no
 * ownership check is needed here — a mismatched id simply matches no rows.
 */
async function resolveItem(itemId: string, status: Extract<ItemStatus, "consumed" | "tossed">) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("inventory_items")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("status", "active");

  if (error) throw new Error(`Could not mark item ${status}: ${error.message}`);

  // If this item was resolved off the back of a reminder, record that the
  // reminder worked — this is the engagement signal CLAUDE.md wants measured.
  await supabase
    .from("notifications")
    .update({ responded: true, response_action: status })
    .eq("inventory_item_id", itemId)
    .eq("responded", false);

  revalidatePath("/items");
}

export async function markConsumed(itemId: string) {
  await resolveItem(itemId, "consumed");
}

export async function markTossed(itemId: string) {
  await resolveItem(itemId, "tossed");
}

export async function undoResolve(itemId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("inventory_items")
    .update({ status: "active", resolved_at: null })
    .eq("id", itemId);

  if (error) throw new Error(`Could not restore item: ${error.message}`);

  revalidatePath("/items");
}
