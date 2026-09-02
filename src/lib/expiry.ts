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

/**
 * The days-left label split so the number can be set large and the unit small.
 *
 * `trail` is absent for the cases where a bare word says it better than a
 * digit would — "Today" reads faster than "0 days", and at the fridge that
 * difference is the whole point of the pill.
 */
export function expiryParts(
  date: string | null,
  now: Date = new Date(),
): { lead: string; trail?: string } {
  const days = daysUntil(date, now);

  if (days === null) return { lead: "No date" };
  if (days === 0) return { lead: "Today" };
  if (days === 1) return { lead: "Tomorrow" };
  if (days === -1) return { lead: "Yesterday" };
  if (days < -1) return { lead: String(Math.abs(days)), trail: "days ago" };

  return { lead: String(days), trail: "days" };
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
