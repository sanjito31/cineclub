import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/app/auth/auth-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { safeNextPath } from "@/lib/validation/shared";

export const dynamic = "force-dynamic";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeNextPath(
    typeof query.next === "string" ? query.next : "/dashboard",
  );
  const invalidLink = query.error === "invalid-link";
  const user = await getCurrentUser();

  if (user) {
    const profile = await getProfile(user.id);
    redirect(profile ? next : `/onboarding?next=${encodeURIComponent(next)}`);
  }

  return (
    <main className="centered-page">
      <section className="auth-card">
        <Link className="back-link" href="/">← Back to Cineclub</Link>
        <span className="eyebrow">Your seat is waiting</span>
        <h1>Sign in with email</h1>
        <p className="lede">We’ll send a one-time sign-in link. No passwords to remember between movie nights.</p>
        {invalidLink ? (
          <p className="action-message is-error" role="alert">That sign-in link is invalid or expired. Request a new link below.</p>
        ) : null}
        <AuthForm next={next} />
      </section>
    </main>
  );
}
