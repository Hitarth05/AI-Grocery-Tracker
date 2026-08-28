import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { predictionSchema, SYSTEM_PROMPT, type RawPrediction } from "./prompt";
import {
  ExtractionUnavailableError,
  isSupportedMediaType,
  type ImageSource,
} from "./types";

/**
 * Vision-capable Flash model on Google's free tier — the point of v1 is to
 * gather an accuracy baseline at zero cost before paying for a model.
 *
 * `gemini-3.6-flash` is the cheaper-at-scale sibling if throughput ever matters
 * more than accuracy. Model IDs move; check ai.google.dev/gemini-api/docs/models
 * rather than assuming this one is still current.
 */
const MODEL = "gemini-3.7-flash";

/**
 * The response schema, derived from the Zod schema rather than hand-written.
 *
 * z.toJSONSchema carries each field's .describe() text through as `description`,
 * and the model reads those — so the per-field rules in prompt.ts reach Gemini
 * without a second copy to keep in sync. Computed once: it never varies.
 *
 * `$schema` is dropped: Gemini accepts a documented subset of JSON Schema, and
 * that meta-keyword isn't in it. It carries no validation meaning, so removing
 * it costs nothing and avoids relying on the API silently ignoring it.
 *
 * The nullable fields come out as `anyOf: [{type: "string"}, {type: "null"}]`,
 * which the subset does cover.
 */
const RESPONSE_SCHEMA = (() => {
  const schema: Record<string, unknown> = z.toJSONSchema(predictionSchema);
  delete schema.$schema;
  return schema;
})();

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new ExtractionUnavailableError(
      "GEMINI_API_KEY is not set",
      "missing_api_key",
    );
  }

  // Passed explicitly rather than relying on the SDK's env lookup, so a missing
  // key fails with the message above instead of an opaque auth error later.
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/**
 * The one function that talks to Google. Everything provider-specific stops
 * here — it returns a schema-shaped object and throws on failure. Sanity checks
 * and the degrade-to-manual path live in ./index so every provider inherits
 * them rather than each reimplementing them.
 */
export async function runGeminiExtraction(
  image: ImageSource,
): Promise<RawPrediction> {
  if (!isSupportedMediaType(image.mediaType)) {
    throw new ExtractionUnavailableError(
      `Unsupported image type ${image.mediaType}`,
      "unsupported_media_type",
    );
  }

  let interaction;
  try {
    interaction = await getClient().interactions.create({
      model: MODEL,
      system_instruction: SYSTEM_PROMPT,
      // generation_config.thinking_level is the reasoning dial. Left at the
      // model default on purpose so the first accuracy baseline measures the
      // model as shipped; it's the first thing to raise if reading dates off
      // awkward labels turns out to be the weak point.
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RESPONSE_SCHEMA,
      },
      input: [
        {
          type: "image",
          data: image.base64,
          mime_type: image.mediaType,
        },
        {
          type: "text",
          // Today's date anchors relative reasoning: a label reading "12 MAR"
          // with no year has to resolve to the nearest plausible future year.
          text:
            `Today is ${new Date().toISOString().slice(0, 10)}. ` +
            `What is this item, and when does it expire?`,
        },
      ],
    });
  } catch (error) {
    // Auth failures, rate limits (the free tier's limits are per-account and
    // not published), and safety blocks all surface as thrown errors here.
    throw new ExtractionUnavailableError(
      error instanceof Error ? error.message : String(error),
      "api_error",
    );
  }

  const text = interaction.output_text;

  if (!text) {
    throw new ExtractionUnavailableError(
      "Model returned no text output",
      "empty_response",
    );
  }

  // Gemini is schema-constrained, but it hands back a string — so Zod is both
  // the parser and the type boundary. A response that doesn't validate throws
  // and lands in the degrade path rather than propagating a half-typed object.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExtractionUnavailableError(
      "Model output was not valid JSON",
      "invalid_json",
    );
  }

  const result = predictionSchema.safeParse(parsed);

  if (!result.success) {
    throw new ExtractionUnavailableError(
      `Model output did not match the schema: ${result.error.message}`,
      "schema_mismatch",
    );
  }

  return result.data;
}
