import { LoginForm } from "./LoginForm";

/**
 * A server shell around the form, purely so the callback's `?error=` reaches
 * the screen. Reading it client-side with useSearchParams would need a
 * Suspense boundary and so costs the same split for less clarity.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return <LoginForm initialError={error} />;
}
