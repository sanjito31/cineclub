import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { roomHomePath } from "@/lib/domain/room-paths";

export function RoomTaskHeader() {
  return (
    <header className="lobby-header task-header">
      <nav className="dashboard-nav" aria-label="Navigation">
        <Link href="/profile">Profile</Link>
        <Link href="/dashboard">Clubs</Link>
        <form action={signOut}>
          <button className="text-button" type="submit">Sign out</button>
        </form>
      </nav>
    </header>
  );
}

export function RoomTaskIdentity({
  name,
  code,
  variant,
}: {
  name: string;
  code: string;
  isOwner?: boolean;
  /** "ballot" swaps in the create-page's big poster-style header, for the vote page only. */
  variant?: "ballot";
}) {
  if (variant === "ballot") {
    return (
      <section className="task-identity task-identity-ballot" aria-label="Club">
        <Link className="back-link" href={roomHomePath(code)}>← Back</Link>
        <div className="ballot-header">
          <span className="title-card-tag title-card-tag-left">Official ballot</span>
          <span className="title-card-tag title-card-tag-right">No spoilers</span>
          <svg className="ballot-hand-icon" viewBox="0 0 64 48" fill="none" aria-hidden="true">
            <rect x="4" y="30" width="14" height="12" rx="3" />
            <rect x="14" y="18" width="22" height="22" rx="10" />
            <rect x="19" y="10" width="5" height="11" rx="2.5" />
            <rect x="26" y="9" width="5" height="12" rx="2.5" />
            <rect x="33" y="10" width="5" height="11" rx="2.5" />
            <rect x="36" y="19" width="26" height="10" rx="5" />
          </svg>
          <div className="ballot-header-top-row">
            <span className="eyebrow">Cast your vote</span>
            <p className="task-room-code">
              <span>Club code</span>
              <strong>{code}</strong>
            </p>
          </div>
          <h1>{name}</h1>
          <p>Submit your ranked picks below. Ballots stay sealed until everyone&rsquo;s in.</p>
          <div className="title-card-bar" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="task-identity" aria-label="Club">
      <Link className="back-link" href={roomHomePath(code)}>← Back</Link>
      <div className="task-identity-row">
        <h1>{name}</h1>
        <p className="task-room-code">
          <span>Club code</span>
          <strong>{code}</strong>
        </p>
      </div>
    </section>
  );
}
