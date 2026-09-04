"use client";

import { useRef, useState, useTransition } from "react";

import { uploadAndExtract } from "@/app/add/actions";
import { downscalePhoto } from "@/lib/downscale";

/**
 * capture="environment" hands straight to the rear camera on iOS and Android
 * rather than opening a file picker — one tap from intent to shutter, which is
 * the whole point. On desktop the same input degrades to a file chooser.
 *
 * The action is called directly rather than through a form submit: the upload
 * is a downscaled copy, and a form would post whatever is in the file input.
 * Replacing that needs a DataTransfer; calling the action is simpler and means
 * there is no submit event to fire twice.
 */
export function CaptureButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  // Ref guards the handler (synchronous, survives no re-render); state drives
  // the button label (a ref change alone would not repaint it).
  const submitted = useRef(false);
  const [working, setWorking] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Set before the first await, not after. Downscaling is asynchronous, so a
    // second change event arriving mid-resize would otherwise pass this check
    // too and upload the same item twice.
    if (submitted.current) return;
    submitted.current = true;
    setWorking(true);

    setFileName(file.name);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    let upload = file;
    try {
      upload = await downscalePhoto(file);
    } catch {
      // Browser could not decode it — Chrome cannot read HEIC. Send the
      // original and let the bucket and the model deal with it.
    }

    const form = new FormData();
    form.append("photo", upload, upload.name);
    startTransition(() => uploadAndExtract(form));
  }

  const busy = working || pending;

  return (
    <div className="mt-6 flex flex-col items-center gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={busy}
        onChange={onChange}
        className="sr-only"
      />

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL, not a remote asset
        <img
          src={preview}
          alt={fileName ?? "Selected photo"}
          className="max-h-64 w-full rounded-[20px] object-cover shadow-[var(--shadow-card)]"
        />
      ) : (
        <div className="flex h-48 w-full items-center justify-center rounded-[20px] border border-dashed border-[var(--secondary-border)] text-sm text-[var(--ink-soft)]">
          No photo yet
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="btn-primary min-h-14 w-full disabled:opacity-60"
      >
        {busy ? "Uploading…" : preview ? "Retake photo" : "Take a photo"}
      </button>
    </div>
  );
}
