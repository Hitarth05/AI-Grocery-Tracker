"use client";

import { useRef, useState } from "react";

/**
 * capture="environment" hands straight to the rear camera on iOS and Android
 * rather than opening a file picker — one tap from intent to shutter, which is
 * the whole point. On desktop the same input degrades to a file chooser.
 */
export function CaptureButton({ formId }: { formId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });

    // Submit as soon as a photo exists — no second "upload" tap.
    (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <input
        ref={inputRef}
        form={formId}
        type="file"
        name="photo"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        className="sr-only"
      />

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URL, not a remote asset
        <img
          src={preview}
          alt={fileName ?? "Selected photo"}
          className="max-h-64 w-full rounded-2xl object-cover"
        />
      ) : (
        <div className="flex h-48 w-full items-center justify-center rounded-2xl border border-dashed border-border text-sm text-neutral-500">
          No photo yet
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="min-h-14 w-full rounded-xl bg-emerald-600 font-medium text-white"
      >
        {preview ? "Retake photo" : "Take a photo"}
      </button>
    </div>
  );
}
