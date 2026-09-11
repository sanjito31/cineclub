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
          <span className="ballot-hand-icon" aria-hidden="true" />
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
