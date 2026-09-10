import { ConfirmRoomForm } from "@/app/create/confirm/confirm-room-form";
import { PageNav } from "@/app/components/page-nav";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConfirmRoomPage() {
  const user = await requireUserOrRedirect("/create/confirm");
  const profile = await getProfile(user.id);

  if (!profile) {
    redirect("/onboarding?next=%2Fcreate%2Fconfirm");
  }

  return (
    <main className="centered-page">
      <PageNav backHref="/create" showAccountNav />
      <section className="auth-card wide-card">
        <ConfirmRoomForm />
      </section>
    </main>
  );
}
