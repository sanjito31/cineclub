import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { roomHomePath } from "@/lib/domain/room-paths";

export function RoomTaskHeader() {
  return (
    <header className="lobby-header task-header">
      <Link className="brand" href="/dashboard">
        <span className="brand-mark">C</span>
        <span>Cineclub</span>
      </Link>
      <nav className="dashboard-nav" aria-label="Navigation">
        <Link href="/profile">Profile</Link>
        <Link href="/dashboard">Rooms</Link>
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
}: {
  name: string;
  code: string;
  isOwner?: boolean;
}) {
  return (
    <section className="task-identity" aria-label="Room">
      <Link className="back-link" href={roomHomePath(code)}>← Back to room</Link>
      <div className="task-identity-row">
        <h1>{name}</h1>
        <p className="task-room-code">
          <span>Room code</span>
          <strong>{code}</strong>
        </p>
      </div>
    </section>
  );
}
