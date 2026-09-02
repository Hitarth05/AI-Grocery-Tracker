"use client";

import { useState } from "react";

import { GoogleMark } from "@/components/GoogleMark";
import { createClient } from "@/lib/supabase/client";

/**
 * OAuth providers offered alongside the magic link. Each renders itself from
 * this list, so adding Apple later is one entry plus its mark — the provider
 * has to be enabled in the Supabase dashboard first.
 */
const OAUTH_PROVIDERS: {
  id: "google" | "apple";
  label: string;
  Mark: (props: { className?: string }) => React.ReactElement;
}[] = [{ id: "google", label: "Google", Mark: GoogleMark }];

type Status =
  | { kind: "idle" | "sending" | "sent" | "redirecting" }
  | { kind: "error"; message: string };

export function LoginForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(
    initialError ? { kind: "error", message: initialError } : { kind: "idle" },
  );

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setStatus(error ? { kind: "error", message: error.message } : { kind: "sent" });
  }

  async function signInWith(provider: "google" | "apple") {
    // This navigates the whole page away, so the state exists to stop a second
    // tap starting a second flow during the hop out to the provider.
    setStatus({ kind: "redirecting" });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) setStatus({ kind: "error", message: error.message });
  }

  const busy = status.kind === "sending" || status.kind === "redirecting";

  if (status.kind === "sent") {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-6 pb-[env(safe-area-inset-bottom)]">
        <h1 className="type-display text-[26px] font-bold">Check your email</h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-soft)]">
          We sent a sign-in link to <span className="font-medium">{email}</span>. Open
          it on this phone and you&apos;re in.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="mt-8 min-h-12 text-left font-semibold text-[var(--primary)]"
        >
          Use a different email
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col px-6 pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-1 flex-col justify-center">
        {/* text-balance because the name is long enough to wrap on a narrow
            phone, and an even two-line break reads better than an orphan. */}
        <h1 className="type-display text-balance text-[32px] font-bold leading-[1.15]">
          Grocery Tracker
        </h1>
        <p className="mt-2 text-[17px] leading-relaxed text-[var(--ink-soft)]">
          Snap a photo, we&apos;ll remind you before it goes bad.
        </p>
      </div>

      {/* Sits low on the screen — thumb reach, not eye level. The zero-typing
          path goes first; the email form is the fallback under it. */}
      <div className="flex flex-col gap-3 pb-10">
        {OAUTH_PROVIDERS.map(({ id, label, Mark }) => (
          <button
            key={id}
            type="button"
            disabled={busy}
            onClick={() => signInWith(id)}
            className="btn-secondary flex min-h-14 items-center justify-center gap-3 disabled:opacity-60"
          >
            <Mark />
            {status.kind === "redirecting"
              ? "Opening…"
              : `Continue with ${label}`}
          </button>
        ))}

        {OAUTH_PROVIDERS.length > 0 && (
          <div className="flex items-center gap-3 py-1" aria-hidden="true">
            <span className="h-px flex-1 bg-[var(--secondary-border)]" />
            <span className="text-xs text-[var(--ink-soft)]">or</span>
            <span className="h-px flex-1 bg-[var(--secondary-border)]" />
          </div>
        )}

        <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input min-h-14 px-4"
          />

          <button
            type="submit"
            disabled={busy}
            className="btn-primary min-h-14 disabled:opacity-60"
          >
            {status.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>

        {status.kind === "error" && (
          <p role="alert" data-urgency="expired" className="alert px-4 py-3 text-sm">
            {status.message}
          </p>
        )}

        <p className="mt-2 text-center text-xs text-[var(--ink-soft)]">
          No password either way.
        </p>
      </div>
    </main>
  );
}
