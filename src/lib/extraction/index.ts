import type { ExtractionMethod, Json, PrintedDateType } from "@/types/database";

import { runAnthropicExtraction } from "./anthropic";
import { runGeminiExtraction } from "./gemini";
import type { RawPrediction } from "./prompt";
import { ExtractionUnavailableError, type ExtractionProvider, type ImageSource } from "./types";

export type { ImageSource } from "./types";
export { isSupportedMediaType } from "./types";

/**
 * The providers this app can extract with, and which one is live.
 *
 * v1 runs on Gemini's free tier: the accuracy baseline costs nothing to gather,
 * and there's no case for paying per scan before knowing whether the numbers
 * justify it. Claude Sonnet 5 is the documented upgrade path if they don't.
 *
 * Switching is editing ACTIVE_PROVIDER. Both stay imported deliberately — an
 * unreferenced provider stops being typechecked and quietly rots into something
 * that no longer compiles by the time you need it, which would make the swap
 * expensive exactly when you want it cheap.
 *
 * Not an env var: the provider serving production should be visible in the
 * code, and there's no reason to flip it without a deploy.
 */
const PROVIDERS = {
  gemini: runGeminiExtraction,
  anthropic: runAnthropicExtraction,
} satisfies Record<string, ExtractionProvider>;

const ACTIVE_PROVIDER: keyof typeof PROVIDERS = "gemini";

/**
 * Confidence threshold below which we ask the user to confirm.
 *
 * This is the dial CLAUDE.md describes: start conservative so nearly every scan
 * produces a label, then raise it as measured precision climbs and the app gets
 * quieter over time. Change it here, never at a call site.
 *
 * Caveat worth remembering when you tune it: a model's self-reported confidence
 * is not a calibrated probability. It correlates with correctness, but 0.85 does
 * not mean "85% of these are right". Plot accuracy against this score on real
 * reviewed scans (extractions.was_corrected) before trusting a raised threshold.
 */
export const REVIEW_THRESHOLD = 0.85;

export interface Prediction {
  method: ExtractionMethod;
  name: string | null;
  date: string | null;
  dateType: PrintedDateType;
  confidence: number;
  /** Category hint for catalog_items matching, once that table is seeded. */
  category: string | null;
  /** Stored verbatim in extractions.raw_model_output. */
  raw: Json | null;
}

/** Grocery expiry dates outside this window are not plausible — see below. */
const MAX_DAYS_PAST = 30;
const MAX_DAYS_FUTURE = 3650;

/**
 * Extract an item and its expiry date from a photo.
 *
 * The single seam the rest of the app knows about. Callers get a Prediction or a
 * zero-confidence Prediction — never an exception — so a model outage degrades
 * to manual entry instead of failing an upload the user is standing there
 * waiting on. Swapping providers is a change to the import below and nothing
 * else; the checks here apply to whatever the provider returns.
 */
export async function extractFromPhoto(image: ImageSource): Promise<Prediction> {
  let raw: RawPrediction;

  try {
    raw = await PROVIDERS[ACTIVE_PROVIDER](image);
  } catch (error) {
    return unavailable(error);
  }

  return sanityCheck(raw);
}

/**
 * The model's output is evidence, not truth. Two checks run before a prediction
 * is allowed to influence the confidence gate.
 */
function sanityCheck(raw: RawPrediction): Prediction {
  const notes: string[] = [];
  let date = raw.date;
  let method: ExtractionMethod = raw.method;
  let confidence = clamp01(raw.confidence);

  // 1. Is the date real, and is it plausible for food? A Julian stamp or lot
  //    code misread as a date typically lands years off. Dropping the date and
  //    halving confidence is better than tracking a wrong expiry silently — the
  //    item still gets added, it just goes through review.
  if (date !== null) {
    const parsed = parseIsoDate(date);

    if (parsed === null) {
      notes.push(`discarded unparseable date ${JSON.stringify(date)}`);
      date = null;
      confidence = confidence / 2;
    } else {
      const days = daysFromToday(parsed);
      if (days < -MAX_DAYS_PAST || days > MAX_DAYS_FUTURE) {
        notes.push(
          `discarded implausible date ${date} (${days} days from today) — ` +
            `likely a lot code or Julian stamp read as a date`,
        );
        date = null;
        confidence = confidence / 2;
      }
    }
  }

  // 2. "I read a printed date" plus no date is self-contradictory. Trust the
  //    absence of the date over the claim, and record the honest method so the
  //    accuracy metric isn't polluted with mislabelled rows.
  if (method === "date_ocr" && date === null) {
    notes.push("no usable date, so method downgraded from date_ocr");
    method = "classification";
  }

  return {
    method,
    name: raw.name?.trim() || null,
    date,
    dateType: date === null ? "unknown" : normalizeDateType(raw.dateType),
    category: raw.category?.trim() || null,
    confidence,
    raw: {
      // Recorded per-row so a corpus scanned across a provider switch can still
      // be split by provider when comparing measured accuracy.
      provider: ACTIVE_PROVIDER,
      model_output: raw as unknown as Json,
      ...(notes.length > 0 ? { validation_notes: notes } : {}),
    },
  };
}

/**
 * Every failure lands here as a zero-confidence prediction, which is below any
 * sane REVIEW_THRESHOLD and so routes the scan to the confirm screen. The
 * reason is kept in raw_model_output — without it, a spell of API errors is
 * indistinguishable from a spell of genuinely hard photos when you later look
 * at why so much needed review.
 */
function unavailable(error: unknown): Prediction {
  const reason =
    error instanceof ExtractionUnavailableError ? error.cause_ : "api_error";
  const message = error instanceof Error ? error.message : String(error);

  console.error(`[extraction:${ACTIVE_PROVIDER}] ${reason}: ${message}`);

  return {
    method: "classification",
    name: null,
    date: null,
    dateType: "unknown",
    category: null,
    confidence: 0,
    raw: { provider: ACTIVE_PROVIDER, error: reason, message },
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeDateType(t: RawPrediction["dateType"]): PrintedDateType {
  return t satisfies PrintedDateType;
}

/**
 * Strict YYYY-MM-DD parse. Date.parse would accept plenty of other shapes and
 * silently roll over an invalid day (2026-02-31 → March 3), which would turn a
 * misread into a plausible-looking date — exactly what the caller is checking
 * for. Returns UTC midnight so it can be compared without timezone drift.
 */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  const roundTripped =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;

  return roundTripped ? date : null;
}

function daysFromToday(date: Date, now: Date = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today) / 86_400_000);
}
