import { redirect } from "next/navigation";
import { ProfileForm } from "@/app/onboarding/profile-form";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { safeNextPath } from "@/lib/validation/shared";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeNextPath(
    typeof query.next === "string" ? query.next : "/dashboard",
  );
  const user = await requireUserOrRedirect(`/onboarding?next=${encodeURIComponent(next)}`);
  const profile = await getProfile(user.id);

  if (profile) {
    redirect(next);
  }

  return (
    <main className="centered-page">
      <section className="auth-card">
        <span className="eyebrow">Almost there</span>
        <h1>Set up your movie-night profile</h1>
        <p className="lede">This is what friends will see inside shared rooms.</p>
        <ProfileForm next={next} />
      </section>
    </main>
  );
}
