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
 * Image formats the app accepts.
 *
 * This is the intersection of what our providers read, not the maximum any one
 * of them supports: Gemini also reads HEIC and HEIF, Claude does not. Keeping
 * the narrower list means flipping ACTIVE_PROVIDER back to Anthropic can never
 * strand photos that were storable but unreadable. Migration 0005 enforces the
 * same list at the bucket.
 */
export const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export function isSupportedMediaType(t: string): t is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(t);
}
