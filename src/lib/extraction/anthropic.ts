import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { predictionSchema, SYSTEM_PROMPT, type RawPrediction } from "./prompt";
import {
  ExtractionUnavailableError,
  isSupportedMediaType,
  type ImageSource,
} from "./types";

/**
 * Vision-capable Sonnet tier. Sonnet 5 is the first Sonnet with high-resolution
 * vision (2576px on the long edge), which is what makes small printed date
 * stamps legible — the whole task hinges on reading fine print.
 *
 * Not the active provider: v1 runs on Gemini's free tier while accuracy is
 * unvalidated. This stays compiled and typechecked so switching back is one
 * constant in ./index — see ACTIVE_PROVIDER there.
 */
const MODEL = "claude-sonnet-5";

/**
 * Sonnet 5 defaults to "high". Reading a date off a label does not need it, and
 * effort drives both latency and token spend on a request the user is standing
 * at the fridge waiting for. Sweep this against real scans before changing it.
 */
const EFFORT = "medium" as const;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionUnavailableError(
      "ANTHROPIC_API_KEY is not set",
      "missing_api_key",
    );
  }
  // Constructed once per server instance; the SDK reads the key from the env.
  client ??= new Anthropic();
  return client;
}

/**
 * The one function that talks to Anthropic. Everything provider-specific stops
 * here — it returns a schema-shaped object and throws on failure. Sanity checks
 * and the degrade-to-manual path live in ./index so every provider inherits
 * them rather than each reimplementing them.
 */
export async function runAnthropicExtraction(
  image: ImageSource,
): Promise<RawPrediction> {
  if (!isSupportedMediaType(image.mediaType)) {
    throw new ExtractionUnavailableError(
      `Vision does not accept ${image.mediaType}`,
      "unsupported_media_type",
    );
  }

  const message = await getClient().messages.parse({
    model: MODEL,
    // Generous: thinking and the response share this budget, and Sonnet 5 runs
    // adaptive thinking by default.
    max_tokens: 4096,
    output_config: {
      effort: EFFORT,
      format: zodOutputFormat(predictionSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: image.base64,
            },
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
      },
    ],
  });

  // Safety classifiers can decline a request; that is a 200 with no usable
  // content, so it has to be checked before reading parsed_output.
  if (message.stop_reason === "refusal") {
    throw new ExtractionUnavailableError(
      `Model declined the request (${message.stop_details?.category ?? "unspecified"})`,
      "refusal",
    );
  }

  if (message.stop_reason === "max_tokens") {
    throw new ExtractionUnavailableError(
      "Response hit max_tokens before completing",
      "max_tokens",
    );
  }

  if (!message.parsed_output) {
    throw new ExtractionUnavailableError(
      "Model response did not match the expected schema",
      "schema_mismatch",
    );
  }

  return message.parsed_output;
}
