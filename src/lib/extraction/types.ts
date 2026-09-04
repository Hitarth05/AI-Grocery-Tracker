import type { RawPrediction } from "./prompt";

/** A photo ready to send to a vision model. */
export interface ImageSource {
  /** Base64-encoded image bytes, no data: prefix and no newlines. */
  base64: string;
  /** MIME type, e.g. "image/jpeg". */
  mediaType: string;
}

/**
 * What a provider has to be. Everything else — validation, the confidence gate,
 * the degrade-to-manual path — lives in ./index and applies to whatever comes
 * back, so a provider's only job is to return a schema-shaped object or throw.
 */
export type ExtractionProvider = (image: ImageSource) => Promise<RawPrediction>;

/**
 * Thrown for conditions the caller should surface rather than retry blindly.
 * Lives here rather than in a provider so providers never import each other.
 */
export class ExtractionUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause_: string,
  ) {
    super(message);
    this.name = "ExtractionUnavailableError";
  }
}

/**
 * Image formats the app accepts. Migration 0006 enforces the same list at the
 * bucket.
 *
 * This is Gemini's set, not the intersection with Anthropic's — Claude reads
 * neither HEIC nor HEIF. Switching ACTIVE_PROVIDER back to Anthropic therefore
 * accepts HEIC at upload and fails to read it later, which degrades to manual
 * entry rather than erroring, but wastes the scan. Narrow this list at the same
 * time if that switch is ever made.
 */
export const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export function isSupportedMediaType(t: string): t is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(t);
}
