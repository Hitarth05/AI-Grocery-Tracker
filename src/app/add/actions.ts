"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  extractFromPhoto,
  isSupportedMediaType,
  REVIEW_THRESHOLD,
} from "@/lib/extraction";
import { PHOTO_BUCKET, photoFromUpload } from "@/lib/photos";
import { getCurrentSpace } from "@/lib/spaces";
import { createClient } from "@/lib/supabase/server";
import type { ExpirySource, StorageLocation } from "@/types/database";

/**
 * Photo → Storage → vision extraction → extractions row → confirm screen.
 *
 * An extraction row is written for every scan, including ones where the model
 * failed or returned nothing. That table is where extraction accuracy comes
 * from, and it can only measure the scans it saw.
 */
export async function uploadAndExtract(formData: FormData) {
  const photo = formData.get("photo");

  if (!(photo instanceof File) || photo.size === 0) {
    redirect("/add?error=no_photo");
  }

  // Rejected before the upload, not after: storing a format the model cannot
  // read leaves a photo nothing can extract from. Migration 0006 enforces the
  // same list at the bucket, this is the message the user sees.
  if (!isSupportedMediaType(photo.type)) {
    redirect("/add?error=unsupported_image");
  }

  const { userId, spaceId } = await getCurrentSpace();
  const supabase = await createClient();

  // {space_id}/{uuid}.{ext} — the leading segment is what the storage RLS
  // policy reads to decide access, so it must be the space id.
  const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${spaceId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, photo, { contentType: photo.type || "image/jpeg", upsert: false });

  if (uploadError) {
    redirect(`/add?error=${encodeURIComponent(uploadError.message)}`);
  }

  // The bytes are already in memory from the upload — reading them back out of
  // Storage just to hand them to the model would be a pointless round-trip on
  // the one request the user is actively waiting on.
  const prediction = await extractFromPhoto(await photoFromUpload(photo));

  const { data: extraction, error: extractionError } = await supabase
    .from("extractions")
    .insert({
      space_id: spaceId,
      created_by: userId,
      photo_path: path,
      method: prediction.method,
      raw_model_output: prediction.raw,
      predicted_name: prediction.name,
      predicted_date: prediction.date,
      predicted_date_type: prediction.dateType,
      confidence: prediction.confidence,
      needs_review: prediction.confidence < REVIEW_THRESHOLD,
    })
    .select("id")
    .single();

  if (extractionError) {
    redirect(`/add?error=${encodeURIComponent(extractionError.message)}`);
  }

  redirect(`/add/confirm?extraction=${extraction.id}`);
}

/** Confirm screen submit: writes the final_* audit fields, then the item. */
export async function confirmItem(formData: FormData) {
  const extractionId = String(formData.get("extraction_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const expiryDate = String(formData.get("expiry_date") ?? "").trim() || null;
  const storageLocation = String(
    formData.get("storage_location") ?? "fridge",
  ) as StorageLocation;
  const quantity = Number(formData.get("quantity") ?? 1) || 1;
  const unit = String(formData.get("unit") ?? "").trim() || null;

  if (!displayName) {
    redirect(`/add/confirm?extraction=${extractionId}&error=name_required`);
  }

  const { spaceId } = await getCurrentSpace();
  const supabase = await createClient();

  const { data: extraction } = await supabase
    .from("extractions")
    .select("id, method, predicted_name, predicted_date, confidence")
    .eq("id", extractionId)
    .maybeSingle();

  // A scan produces at most one item. Disabling the button stops the common
  // double-tap, but not a retried request or a resubmitted back-button page,
  // so re-confirming an extraction that already has an item is a no-op here
  // rather than a second row.
  //
  // limit(1) because the pre-fix bug may already have left duplicate rows in
  // an existing database; maybeSingle() alone would error on those instead of
  // handling them.
  if (extraction) {
    const { data: already } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("extraction_id", extraction.id)
      .limit(1)
      .maybeSingle();

    if (already) {
      revalidatePath("/items");
      redirect("/items");
    }
  }

  // was_corrected is the accuracy signal, and it only means something when the
  // model actually predicted something. Left null when it didn't (a failed call
  // or a photo it couldn't read) so those rows don't count as corrections and
  // drag the measured accuracy down for something that was never a prediction.
  const hadPrediction =
    Boolean(extraction?.predicted_name) || Boolean(extraction?.predicted_date);
  const wasCorrected = hadPrediction
    ? extraction!.predicted_name !== displayName ||
      extraction!.predicted_date !== expiryDate
    : null;

  if (extraction) {
    await supabase
      .from("extractions")
      .update({
        user_confirmed: true,
        final_name: displayName,
        final_date: expiryDate,
        was_corrected: wasCorrected,
        needs_review: false,
      })
      .eq("id", extraction.id);
  }

  // How we actually got this date, which is what expiry_source records.
  // 'printed' is claimable only when the model read a date off the packaging
  // AND the user left it alone — a date the user typed or corrected is
  // 'manual', however good the prediction around it was. The 'estimated' case
  // (classify the item, apply a shelf life) arrives with the catalog_items
  // seed; until then the no-printed-date path produces a manual date.
  const keptPrediction =
    expiryDate !== null && extraction?.predicted_date === expiryDate;
  const expirySource: ExpirySource =
    extraction?.method === "date_ocr" && keptPrediction ? "printed" : "manual";

  const { error } = await supabase.from("inventory_items").insert({
    space_id: spaceId,
    extraction_id: extraction?.id ?? null,
    catalog_item_id: null,
    display_name: displayName,
    quantity,
    unit,
    storage_location: storageLocation,
    expiry_date: expiryDate,
    expiry_source: expirySource,
    opened_at: null,
    status: "active",
    resolved_at: null,
  });

  // 23505 = unique violation, i.e. this extraction already has an item and we
  // lost the race the index exists to arbitrate. The user's item is saved —
  // the other request saved it — so this is a success, not an error.
  if (error && error.code !== "23505") {
    throw new Error(`Could not save item: ${error.message}`);
  }

  revalidatePath("/items");
  redirect("/items");
}
