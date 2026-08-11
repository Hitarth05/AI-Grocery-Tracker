"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { extractFromPhoto, REVIEW_THRESHOLD } from "@/lib/extraction";
import { getCurrentSpace } from "@/lib/spaces";
import { createClient } from "@/lib/supabase/server";
import type { ExpirySource, StorageLocation } from "@/types/database";

const BUCKET = "item-photos";

/**
 * Photo → Storage → extractions row → confirm screen.
 *
 * The extraction row is written even when the model is not wired up yet, so
 * every scan is on the record from day one. That table is where extraction
 * accuracy comes from, and it can only measure scans it saw.
 */
export async function uploadAndExtract(formData: FormData) {
  const photo = formData.get("photo");

  if (!(photo instanceof File) || photo.size === 0) {
    redirect("/add?error=no_photo");
  }

  const { userId, spaceId } = await getCurrentSpace();
  const supabase = await createClient();

  // {space_id}/{uuid}.{ext} — the leading segment is what the storage RLS
  // policy reads to decide access, so it must be the space id.
  const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${spaceId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo, { contentType: photo.type || "image/jpeg", upsert: false });

  if (uploadError) {
    redirect(`/add?error=${encodeURIComponent(uploadError.message)}`);
  }

  const prediction = await extractFromPhoto(path);

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
    .select("id, predicted_name, predicted_date, confidence")
    .eq("id", extractionId)
    .maybeSingle();

  // was_corrected is the accuracy signal: it only means something when the
  // model actually predicted something, so leave it null on stubbed scans
  // rather than recording a "correction" of nothing.
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

  // Printed vs estimated vs manual — with the model stubbed, a date the user
  // typed is 'manual'. The real pipeline sets 'printed' or 'estimated'.
  const expirySource: ExpirySource = hadPrediction ? "printed" : "manual";

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

  if (error) throw new Error(`Could not save item: ${error.message}`);

  revalidatePath("/items");
  redirect("/items");
}
