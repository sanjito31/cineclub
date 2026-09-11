import { redirect } from "next/navigation";
import { AuthForm } from "@/app/auth/auth-form";
import { BackButton } from "@/app/components/back-button";
import { GlobalMenu } from "@/app/components/global-menu";
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
    <main className="tv-page">
      <BackButton href="/" />
      <GlobalMenu />
      {invalidLink ? (
        <div className="tv-page-header">
          <p className="action-message is-error" role="alert">That sign-in link is invalid or expired. Request a new link below.</p>
        </div>
      ) : null}
      <AuthForm next={next} />
    </main>
  );
}
