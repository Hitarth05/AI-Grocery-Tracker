import { BottomNav } from "@/components/BottomNav";
import { getCurrentSpace } from "@/lib/spaces";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { spaceId, spaceName } = await getCurrentSpace();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { count: memberCount } = await supabase
    .from("space_members")
    .select("*", { count: "exact", head: true })
    .eq("space_id", spaceId);

  return (
    <>
      <main className="px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <dl className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
          <Row label="Signed in as">{user?.email ?? "—"}</Row>
          <Row label="Space">{spaceName}</Row>
          <Row label="Members">{memberCount ?? 1}</Row>
        </dl>

        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="min-h-14 w-full rounded-xl border border-border font-medium text-red-600 dark:text-red-400"
          >
            Sign out
          </button>
        </form>
      </main>

      <BottomNav />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}
