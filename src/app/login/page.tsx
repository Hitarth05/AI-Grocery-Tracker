"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * OAuth providers to offer alongside the magic link. Add "google" here once
 * the provider is configured in the Supabase dashboard — the button renders
 * itself from this list, so that's the only change needed on the client.
 */
const OAUTH_PROVIDERS: { id: "google" | "apple"; label: string }[] = [];

type Status = { kind: "idle" | "sending" | "sent" } | { kind: "error"; message: string };

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) setStatus({ kind: "error", message: error.message });
  }

  if (status.kind === "sent") {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-6 pb-[env(safe-area-inset-bottom)]">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          We sent a sign-in link to <span className="font-medium">{email}</span>. Open
          it on this phone and you&apos;re in.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="mt-8 min-h-12 text-left font-medium text-emerald-700 dark:text-emerald-400"
        >
          Use a different email
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col px-6 pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-3xl font-semibold tracking-tight">Fridge</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Snap a photo, we&apos;ll remind you before it goes bad.
        </p>
      </div>

      {/* Form sits low on the screen — thumb reach, not eye level. */}
      <form onSubmit={sendMagicLink} className="flex flex-col gap-3 pb-10">
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
          className="min-h-14 rounded-xl border border-border bg-surface px-4 outline-none focus:ring-2 focus:ring-emerald-600"
        />

        <button
          type="submit"
          disabled={status.kind === "sending"}
          className="min-h-14 rounded-xl bg-emerald-600 font-medium text-white disabled:opacity-60"
        >
          {status.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>

        {OAUTH_PROVIDERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => signInWith(id)}
            className="min-h-14 rounded-xl border border-border font-medium"
          >
            Continue with {label}
          </button>
        ))}

        {status.kind === "error" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {status.message}
          </p>
        )}

        <p className="mt-2 text-center text-xs text-neutral-500">
          No password. The link signs you in.
        </p>
      </form>
    </main>
  );
}
