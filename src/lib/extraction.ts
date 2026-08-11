import type { ExtractionMethod, Json, PrintedDateType } from "@/types/database";

/**
 * Confidence threshold below which we ask the user to confirm.
 *
 * This is the dial CLAUDE.md describes: start conservative so nearly every
 * scan produces a label, then raise it as measured precision climbs and the
 * app gets quieter over time. Change it here, never at a call site.
 */
export const REVIEW_THRESHOLD = 0.85;

export interface Prediction {
  method: ExtractionMethod;
  name: string | null;
  date: string | null;
  dateType: PrintedDateType;
  confidence: number;
  /** The full model response, stored verbatim in extractions.raw_model_output. */
  raw: Json | null;
}

/**
 * STUB — the vision call is not implemented yet.
 *
 * Returns zero confidence, which puts every scan below the review threshold
 * and routes it to the manual confirm screen. That keeps the whole loop
 * (upload → extraction row → confirm → item) working end to end, so wiring in
 * the real model later is a change to this one function and nothing else.
 *
 * When implementing: fetch the photo from Storage, send it to a vision model
 * with a schema-constrained tool call, and return a real confidence. Two paths
 * to handle — a printed USE BY / BEST BEFORE / SELL BY date, and the no-date
 * case (produce, bakery, deli) where you classify the item and estimate from
 * catalog_items. Watch for lot codes and Julian stamps that look like dates.
 */
export async function extractFromPhoto(photoPath: string): Promise<Prediction> {
  return {
    method: "date_ocr",
    name: null,
    date: null,
    dateType: "unknown",
    confidence: 0,
    raw: {
      stub: true,
      note: "vision model not yet wired up",
      photo_path: photoPath,
    },
  };
}
