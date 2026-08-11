/** Urgency buckets, ordered most- to least-urgent. Drives grouping and color. */
export type Urgency = "expired" | "today" | "soon" | "ok" | "unknown";

/**
 * Whole days from today until `date`, in the viewer's local timezone.
 *
 * expiry_date is a Postgres `date` (no time, no zone), so it must not be parsed
 * as an instant — `new Date("2026-08-12")` is UTC midnight, which reads as the
 * 11th anywhere west of Greenwich and shows the user an off-by-one day count.
 */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  if (!date) return null;

  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;

  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((target - today) / 86_400_000);
}

export function urgencyOf(date: string | null, now: Date = new Date()): Urgency {
  const days = daysUntil(date, now);
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "ok";
}

/** Short label for the days-left pill. Kept terse — it sits in a small chip. */
export function expiryLabel(date: string | null, now: Date = new Date()): string {
  const days = daysUntil(date, now);
  if (days === null) return "No date";
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days === -1) return "Yesterday";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

export const URGENCY_ORDER: Urgency[] = [
  "expired",
  "today",
  "soon",
  "ok",
  "unknown",
];

export const URGENCY_HEADING: Record<Urgency, string> = {
  expired: "Expired",
  today: "Today",
  soon: "Next few days",
  ok: "Later",
  unknown: "No expiry date",
};

/** Tailwind classes for the pill, by urgency. */
export const URGENCY_PILL: Record<Urgency, string> = {
  expired: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  today: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  soon: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  unknown: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

/**
 * Shelf-life estimate for an item with no printed date — the fallback path.
 * Returns an ISO date string, or null if the catalog has no number for that
 * location. Never invent a shelf life here; the numbers come from the catalog,
 * which is seeded from USDA FoodKeeper.
 */
export function estimateExpiry(
  shelfLifeDays: number | null,
  from: Date = new Date(),
): string | null {
  if (shelfLifeDays === null) return null;

  const d = new Date(from);
  d.setDate(d.getDate() + shelfLifeDays);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
