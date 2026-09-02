"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * capture="environment" hands straight to the rear camera on iOS and Android
 * rather than opening a file picker — one tap from intent to shutter, which is
 * the whole point. On desktop the same input degrades to a file chooser.
 */
export function CaptureButton({ formId }: { formId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Ref guards the handler (synchronous, survives no re-render); state drives
  // the button label (a ref change alone would not repaint it).
  const submitted = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { pending } = useFormStatus();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Picking a second photo while the first is still uploading would fire the
    // action twice — two uploads and two extraction rows for one item. The ref
    // rather than `pending` because pending only flips after the submit lands,
    // which is a frame too late to catch a fast second pick.
    if (submitted.current || pending) return;
    submitted.current = true;
    setSubmitting(true);

    setFileName(file.name);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    // Submit as soon as a photo exists — no second "upload" tap.
    (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
  }

  const busy = pending || submitting;

  return (
    <div className="flex flex-col items-center gap-4">
      <input
        ref={inputRef}
        form={formId}
        type="file"
        name="photo"
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
