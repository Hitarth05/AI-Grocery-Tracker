import { z } from "zod";

/**
 * The schema the model must fill. Kept provider-neutral — it describes the
 * extraction task, not the Anthropic API, so a second provider reuses it.
 *
 * Field descriptions are part of the prompt: the model reads them, so they carry
 * the per-field rules rather than repeating everything in the system text.
 */
export const predictionSchema = z.object({
  method: z
    .enum(["date_ocr", "classification"])
    .describe(
      "date_ocr if you read an actual printed expiry date off the packaging. " +
        "classification if no expiry date is printed or it is unreadable.",
    ),
  name: z
    .string()
    .nullable()
    .describe(
      "The item in plain language, as a person would say it: 'Whole milk', " +
        "'Bananas', 'Cheddar cheese'. Not the marketing text off the package. " +
        "Null only if you genuinely cannot tell what the item is.",
    ),
  date: z
    .string()
    .nullable()
    .describe(
      "The expiry date as YYYY-MM-DD, or null if none is printed. " +
        "If the year is not printed, infer the nearest plausible future year. " +
        "If the printed format is ambiguous between day-first and month-first, " +
        "say so in reasoning and lower your confidence.",
    ),
  dateType: z
    .enum(["use_by", "best_before", "sell_by", "manufacture", "unknown"])
    .describe("Which kind of date you read. unknown when no date was found."),
  category: z
    .string()
    .nullable()
    .describe(
      "Broad food category: produce, dairy, meat, seafood, bakery, deli, " +
        "frozen, pantry, beverage, condiment, other.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "How confident you are in name AND date together. Be honest and be " +
        "willing to go low — a low score routes this to a human, which is " +
        "cheap. A wrong date accepted silently is expensive. Blurry, angled, " +
        "partially obscured, or ambiguous-format dates should score below 0.7.",
    ),
  reasoning: z
    .string()
    .describe("One sentence: what you saw and why you read it that way."),
});

export type RawPrediction = z.infer<typeof predictionSchema>;

/**
 * The failure modes here are the ones CLAUDE.md calls out. Printed dates sit
 * next to codes that look like dates, and a confidently-read lot number is
 * worse than an honest "no date found" — the second routes to review, the
 * first silently tracks a wrong expiry.
 */
export const SYSTEM_PROMPT = `You read grocery packaging and report when the item expires.

You get one photo. Identify the item, and read its printed expiry date if there is one.

Reading the date:
- Look for USE BY, BEST BEFORE, BB, EXP, SELL BY, or a bare date near them.
- When several dates appear, prefer USE BY, then BEST BEFORE, then SELL BY.
- A MANUFACTURE or PACKED ON date is not an expiry date. Report it only as
  dateType "manufacture", and do not present it as when the food goes bad.

What is not a date, however much it looks like one:
- Lot and batch codes. Often long, often mixed letters and digits, often near
  a plant code: L3421A, 21B4419, LOT 0925.
- Julian date stamps: a 3-digit day-of-year, sometimes with a year digit
  (5203 = 2025 day 203). These are packing codes, not expiry dates.
- Weights, prices, barcode numbers, nutrition figures, recycling codes.
If the only date-like string is one of these, there is no printed expiry date.

When there is no printed date — loose produce, bakery, deli, butcher counter —
set method to "classification", date to null, and identify the item and its
category as precisely as you can. That path is expected and useful. Do not
invent a date to fill the field.

Report what you can actually see. If the photo is too blurry or too dark to read
a date you believe is there, say so in reasoning and score low rather than
guessing at the digits.`;
