import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { ClearRoomDraft } from "@/app/rooms/[code]/clear-room-draft";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getRoomForMember } from "@/lib/data/rooms";
import { roomPhaseLabels } from "@/lib/domain/room-lifecycle";
import { normalizeRoomCode } from "@/lib/validation/shared";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code: rawCode } = await params;
  const query = await searchParams;
  const code = normalizeRoomCode(rawCode);
  if (!code) redirect("/join");

  const user = await requireUserOrRedirect(`/rooms/${code}`);
  let room;
  try {
    room = await getRoomForMember(code, user.id);
  } catch {
    redirect(`/join/${code}`);
  }

  const isOwner = room.ownerId === user.id;

  return (
    <main className="lobby-page">
      {query.created === "1" ? <ClearRoomDraft /> : null}
      <header className="lobby-header">
        <Link className="brand" href="/dashboard"><span className="brand-mark">C</span><span>Cineclub</span></Link>
        <form action={signOut}><button className="text-button" type="submit">Sign out</button></form>
      </header>
      <section className="lobby-hero">
        <div>
          <span className="eyebrow">{isOwner ? "You’re hosting" : "You’re in"}</span>
          <h1>{room.name}</h1>
          <p>{roomPhaseLabels[room.phase]} · {room.participants.length} of {room.maxParticipants} seats</p>
        </div>
        <div className="room-code-card">
          <span>Room code</span>
          <strong>{room.code}</strong>
          <small>Share cineclub.app/join/{room.code}</small>
        </div>
      </section>
      <div className="lobby-grid">
        <section className="panel">
          <div className="section-heading"><div><span className="eyebrow">The crew</span><h2>Participants</h2></div><span className="status-pill">Roster open</span></div>
          <ul className="participant-list">
            {room.participants.map((participant, index) => (
              <li key={participant.id}>
                <span className="avatar">{participant.user.displayName.slice(0, 1).toUpperCase()}</span>
                <span><strong>{participant.user.displayName}</strong><small>{participant.userId === room.ownerId ? "Host" : `Guest ${index + 1}`}</small></span>
                <span className="ready-dot" title="Joined" />
              </li>
            ))}
          </ul>
        </section>
        <aside className="panel room-rules">
          <span className="eyebrow">Room rules</span>
          <h2>Tonight’s setup</h2>
          <dl>
            <div><dt>Movies per person</dt><dd>{room.selectionsPerUser}</dd></div>
            <div><dt>Participant coverage</dt><dd>{room.requireParticipantCoverage ? "Required" : "Optional"}</dd></div>
            <div><dt>Roster</dt><dd>{room.rosterLockedAt ? "Locked" : "Open"}</dd></div>
          </dl>
          <p className="muted-copy">Selection controls and roster locking arrive in Chunk 2. This lobby confirms the authenticated create/join milestone.</p>
        </aside>
      </div>
    </main>
  );
}
