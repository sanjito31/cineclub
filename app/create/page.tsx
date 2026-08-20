import Link from "next/link";
import { CreateRoomForm } from "@/app/create/create-room-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CreateRoomPage() {
  const user = await getCurrentUser();

  return (
    <main className="content-page">
      <Link className="back-link" href="/">← Home</Link>
      <div className="page-heading">
        <span className="eyebrow">Host a movie night</span>
        <h1>Set the rules. Invite the crew.</h1>
        <p>
          {user
            ? "Your room is created only after you review these settings."
            : "Your room stays in this browser until you authenticate, so abandoned drafts never reach the database."}
        </p>
      </div>
      <section className="panel">
        <CreateRoomForm isAuthenticated={Boolean(user)} />
      </section>
    </main>
  );
}
