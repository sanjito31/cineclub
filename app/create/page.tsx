import { CreateRoomForm } from "@/app/create/create-room-form";
import { PageNav } from "@/app/components/page-nav";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CreateRoomPage() {
  const user = await getCurrentUser();

  return (
    <main className="content-page">
      <PageNav backHref="/" wide showAccountNav={Boolean(user)} />
      <section className="panel ballot-sheet">
        <div className="ballot-header">
          <span className="title-card-tag title-card-tag-left">Host setup</span>
          <span className="title-card-tag title-card-tag-right">No spoilers</span>
          <svg className="ballot-hand-icon" viewBox="0 0 64 48" fill="none" aria-hidden="true">
            <rect x="4" y="30" width="14" height="12" rx="3" />
            <rect x="14" y="18" width="22" height="22" rx="10" />
            <rect x="19" y="10" width="5" height="11" rx="2.5" />
            <rect x="26" y="9" width="5" height="12" rx="2.5" />
            <rect x="33" y="10" width="5" height="11" rx="2.5" />
            <rect x="36" y="19" width="26" height="10" rx="5" />
          </svg>
          <span className="eyebrow">Host a movie night</span>
          <h1>Set the rules. Invite the crew.</h1>
          <p>
            {user
              ? "Your club is created only after you review these settings."
              : "Your club stays in this browser until you authenticate, so abandoned drafts never reach the database."}
          </p>
          <div className="title-card-bar" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <CreateRoomForm isAuthenticated={Boolean(user)} />
      </section>
    </main>
  );
}
