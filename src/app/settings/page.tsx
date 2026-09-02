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
      <main className="px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="type-display text-[26px] font-bold leading-tight">Settings</h1>

        <dl className="panel mt-6 flex flex-col gap-3.5 p-5 text-sm">
          <Row label="Signed in as">{user?.email ?? "—"}</Row>
          <Row label="Space">{spaceName}</Row>
          <Row label="Members">{memberCount ?? 1}</Row>
        </dl>

        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="btn-secondary is-danger min-h-14 w-full"
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
      <dt className="text-[var(--ink-soft)]">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}
