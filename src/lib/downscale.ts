"use client";

/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * Phone photos are 2-5 MB. Next caps Server Action bodies at 1 MB and Vercel
 * caps request bodies at 4.5 MB, and the 1 MB rejection is a 413 thrown before
 * the action runs, so its redirects never fire and the user sees a raw server
 * error. Downscaling here puts every upload under both ceilings instead of
 * raising a limit and hoping. It also cuts the image tokens each scan costs.
 */

/** Long edge in pixels. Well above what date-stamp OCR needs. */
const MAX_EDGE = 2048;
const QUALITY = 0.82;

interface Decoded {
  source: CanvasImageSource & { width: number; height: number };
  release: () => void;
}

/**
 * Decode with EXIF orientation applied.
 *
 * This matters more than it looks: canvas output carries no EXIF, so the pixel
 * orientation produced here is final. Decode without it and every iPhone photo
 * is stored sideways, which also costs the model accuracy on the date stamp.
 *
 * createImageBitmap takes the flag explicitly; older Safari defaulted it to
 * "none", so it is passed rather than assumed. The <img> fallback applies
 * orientation by default in every current browser.
 */
async function decodeOriented(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, release: () => bitmap.close() };
    } catch {
      // Fall through — Chrome cannot decode HEIC, older Safari rejects the option.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas produced no blob"))),
      "image/jpeg",
      QUALITY,
    );
  });
}

/**
 * Returns a JPEG copy, upright and within MAX_EDGE.
 *
 * Throws if the browser cannot decode the file — Chrome cannot read HEIC. The
 * caller falls back to uploading the original, which is why migration 0006
 * allows HEIC at the bucket.
 */
export async function downscalePhoto(file: File): Promise<File> {
  const { source, release } = await decodeOriented(file);

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    // Re-encoded even when already small: it is what strips EXIF, and that
    // metadata carries the GPS coordinates the photo was taken at.
    const blob = await toBlob(canvas);
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    release();
  }
}
