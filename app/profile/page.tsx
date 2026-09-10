import Link from "next/link";
import { ProfileForm } from "@/app/onboarding/profile-form";
import { signOut } from "@/app/actions/auth";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUserOrRedirect("/profile");
  const profile = await getProfile(user.id);

  return (
    <main className="centered-page">
      <header className="lobby-header">
        <Link className="back-link" href="/dashboard">← Back</Link>
        <nav className="dashboard-nav" aria-label="Navigation">
          <Link href="/profile">Profile</Link>
          <Link href="/dashboard">Clubs</Link>
          <form action={signOut}><button className="text-button" type="submit">Sign out</button></form>
        </nav>
      </header>
      <section className="auth-card">
        <span className="eyebrow">Account</span>
        <h1>{profile ? "Edit your profile" : "Create your profile"}</h1>
        <p className="lede">Signed in as {user.email ?? "your Supabase account"}.</p>
        <ProfileForm next="/dashboard" profile={profile} submitLabel="Save profile" />
      </section>
    </main>
  );
}
