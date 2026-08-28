/** A photo ready to send to a vision model. */
export interface ImageSource {
  /** Base64-encoded image bytes, no data: prefix and no newlines. */
  base64: string;
  /** MIME type, e.g. "image/jpeg". */
  mediaType: string;
}
