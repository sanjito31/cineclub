import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BackButton } from "@/app/components/back-button";
import { GlobalMenu } from "@/app/components/global-menu";
import { roomHomePath } from "@/lib/domain/room-paths";

export function RoomTaskHeader({ code }: { code: string }) {
  return (
    <header className="lobby-header task-header">
      <BackButton href={roomHomePath(code)} />
      <GlobalMenu />
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
        <div className="ballot-header">
          <span className="title-card-tag title-card-tag-left">Official ballot</span>
          <span className="title-card-tag title-card-tag-right">No spoilers</span>
          <span className="ballot-hand-icon" aria-hidden="true" />
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
