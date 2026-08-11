import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface CurrentUserSpace {
  userId: string;
  spaceId: string;
  spaceName: string;
}

/**
 * The signed-in user plus the space they're currently working in.
 *
 * Every new user gets a profile, a space, and an owner membership from the
 * handle_new_user trigger in 0002, so default_space_id is populated before the
 * first page render — there is no "create your first space" step to walk
 * through. The fallback to any membership covers a user who was invited to
 * someone else's space but whose own default was later deleted.
 */
export async function getCurrentSpace(): Promise<CurrentUserSpace> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_space_id, spaces:default_space_id (id, name)")
    .eq("id", user.id)
    .maybeSingle<{
      default_space_id: string | null;
      spaces: { id: string; name: string } | null;
    }>();

  if (profile?.spaces) {
    return {
      userId: user.id,
      spaceId: profile.spaces.id,
      spaceName: profile.spaces.name,
    };
  }

  const { data: membership } = await supabase
    .from("space_members")
    .select("space_id, spaces:space_id (id, name)")
    .eq("user_id", user.id)
    .order("added_at", { ascending: true })
    .limit(1)
    .maybeSingle<{
      space_id: string;
      spaces: { id: string; name: string } | null;
    }>();

  if (!membership?.spaces) {
    throw new Error(
      "Signed-in user belongs to no space. The handle_new_user trigger in " +
        "0002_rls_bootstrap_storage.sql should have created one — check that " +
        "the migration was applied.",
    );
  }

  return {
    userId: user.id,
    spaceId: membership.spaces.id,
    spaceName: membership.spaces.name,
  };
}
