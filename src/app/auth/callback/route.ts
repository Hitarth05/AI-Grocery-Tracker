import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** What we show for the provider's own error codes, which are terse. */
const PROVIDER_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  server_error: "The sign-in provider had a problem. Try again.",
  temporarily_unavailable:
    "The sign-in provider is temporarily unavailable. Try again shortly.",
};

function backToLogin(origin: string, message: string) {
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(message)}`,
  );
}

/**
 * Landing point for magic links and OAuth redirects. Trades the one-time code
 * for a session cookie, then sends the user to the item list.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/items";

  // Only relative paths — an absolute `next` would make this an open redirect.
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/items";

  // OAuth failures come back as ?error, not as a missing code. Backing out of
  // the Google consent screen is an ordinary thing to do, and it should say so
  // rather than report a missing code the user never had.
  const providerError = searchParams.get("error");
  if (providerError) {
    return backToLogin(
      origin,
      PROVIDER_ERRORS[providerError] ??
        searchParams.get("error_description") ??
        "Sign-in didn't complete. Try again.",
    );
  }

  if (!code) {
    return backToLogin(origin, "That sign-in link is missing or has expired.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return backToLogin(origin, error.message);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
