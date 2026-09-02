import Link from "next/link";

import { uploadAndExtract } from "@/app/add/actions";
import { BottomNav } from "@/components/BottomNav";
import { CaptureButton } from "@/components/CaptureButton";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <>
      <main className="px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="type-display text-[26px] font-bold leading-tight">Add an item</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">
          Photograph the label. We&apos;ll read the date if there is one.
        </p>

        {error && (
          <p role="alert" data-urgency="expired" className="alert mt-4 px-4 py-3 text-sm">
            {error === "no_photo"
              ? "Pick a photo first."
              : error === "unsupported_image"
                ? "That image format can't be read. Take the photo with the camera button, or use a JPEG or PNG."
                : error}
          </p>
        )}

        <form id="capture-form" action={uploadAndExtract} className="mt-6">
          <CaptureButton formId="capture-form" />
        </form>

        <Link
          href="/add/confirm"
          className="btn-secondary mt-4 flex min-h-14 items-center justify-center"
        >
          Enter it by hand instead
        </Link>
      </main>

      <BottomNav />
    </>
  );
}
