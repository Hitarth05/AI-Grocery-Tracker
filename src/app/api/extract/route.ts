import { NextResponse, type NextRequest } from "next/server";

import { extractFromPhoto, REVIEW_THRESHOLD } from "@/lib/extraction";
import { loadPhotoFromStorage } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";

/**
 * Re-run extraction for a photo already in Storage.
 *
 * The add flow extracts inline from the bytes it just uploaded, so this
 * endpoint covers the cases that happen afterwards: retrying a scan that failed
 * or scored badly, and back-filling predictions when the model, the prompt, or
 * the threshold changes and you want the existing corpus re-scored.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { extraction_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!body.extraction_id) {
    return NextResponse.json({ error: "extraction_id is required" }, { status: 400 });
  }

  // RLS scopes this read, so an extraction in someone else's space 404s.
  const { data: extraction } = await supabase
    .from("extractions")
    .select("id, photo_path")
    .eq("id", body.extraction_id)
    .maybeSingle();

  if (!extraction?.photo_path) {
    return NextResponse.json({ error: "No such extraction" }, { status: 404 });
  }

  let prediction;
  try {
    const image = await loadPhotoFromStorage(supabase, extraction.photo_path);
    prediction = await extractFromPhoto(image);
  } catch (error) {
    // extractFromPhoto never throws — this is the storage read failing.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read the photo" },
      { status: 502 },
    );
  }

  const { error } = await supabase
    .from("extractions")
    .update({
      method: prediction.method,
      raw_model_output: prediction.raw,
      predicted_name: prediction.name,
      predicted_date: prediction.date,
      predicted_date_type: prediction.dateType,
      confidence: prediction.confidence,
      needs_review: prediction.confidence < REVIEW_THRESHOLD,
    })
    .eq("id", extraction.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    extraction_id: extraction.id,
    ...prediction,
    needs_review: prediction.confidence < REVIEW_THRESHOLD,
  });
}
