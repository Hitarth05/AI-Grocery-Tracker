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
      <main className="px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-semibold tracking-tight">Add an item</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Photograph the label. We&apos;ll read the date if there is one.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error === "no_photo" ? "Pick a photo first." : error}
          </p>
        )}

        <form id="capture-form" action={uploadAndExtract} className="mt-6">
          <CaptureButton formId="capture-form" />
        </form>

        <Link
          href="/add/confirm"
          className="mt-4 flex min-h-14 items-center justify-center rounded-xl border border-border font-medium"
        >
          Enter it by hand instead
        </Link>
      </main>

      <BottomNav />
    </>
  );
}
