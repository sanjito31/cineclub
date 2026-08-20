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
      <form action={signOut}>
        <button className="text-button" type="submit">Sign out</button>
      </form>
    </header>
  );
}

export function RoomTaskIdentity({
  name,
  code,
  isOwner,
}: {
  name: string;
  code: string;
  isOwner: boolean;
}) {
  return (
    <section className="task-identity" aria-label="Room">
      <h1>{name}</h1>
      <div className="task-identity-meta">
        <p className="task-room-code">
          <span>Room code</span>
          <strong>{code}</strong>
        </p>
        <Link
          className="button button-secondary button-compact"
          href={roomHomePath(code)}
        >
          {isOwner ? "Host Controls" : "Room Info"}
        </Link>
      </div>
    </section>
  );
}
