import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImageSource } from "@/lib/extraction";
import type { Database } from "@/types/database";

export const PHOTO_BUCKET = "item-photos";

/**
 * Fetch a stored photo as a vision-ready image.
 *
 * The bucket is private, so this goes through the authenticated client and is
 * scoped by the storage RLS policy — a path in another space returns an error
 * rather than bytes. Used by the re-run path in /api/extract; the upload path
 * already holds the bytes and passes them straight through instead.
 */
export async function loadPhotoFromStorage(
  supabase: SupabaseClient<Database>,
  path: string,
): Promise<ImageSource> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(path);

  if (error || !data) {
    throw new Error(`Could not read photo ${path}: ${error?.message ?? "no data"}`);
  }

  return {
    base64: Buffer.from(await data.arrayBuffer()).toString("base64"),
    // Storage reports the type it was uploaded with; fall back to JPEG, which
    // is what a phone camera capture produces.
    mediaType: data.type || "image/jpeg",
  };
}

/** Convert an uploaded File to a vision-ready image without a storage round-trip. */
export async function photoFromUpload(file: File): Promise<ImageSource> {
  return {
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    mediaType: file.type || "image/jpeg",
  };
}
