import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinRoomForm } from "@/app/join/[code]/join-room-form";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { getRoomPreview } from "@/lib/data/rooms";
import { roomTaskPath } from "@/lib/domain/room-paths";
import { normalizeRoomCode } from "@/lib/validation/shared";

export const dynamic = "force-dynamic";

export default async function JoinRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeRoomCode(rawCode);

  if (!code) return <InvalidRoom message="That room code is not valid." />;

  const user = await requireUserOrRedirect(`/join/${code}`);
  const profile = await getProfile(user.id);
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent(`/join/${code}`)}`);

  let room;
  try {
    room = await getRoomPreview(code, user.id);
  } catch (error) {
    return <InvalidRoom message={error instanceof Error ? error.message : "Unable to find that room."} />;
  }

  if (room.isMember) redirect(roomTaskPath(room.code, room.phase));
  const unavailable = room.rosterLocked || room.participantCount >= room.maxParticipants;

  return (
    <main className="centered-page">
      <section className="auth-card wide-card">
        <span className="eyebrow">Room found</span>
        <h1>{room.name}</h1>
        <p className="lede">Hosted by {room.ownerName}</p>
        <div className="room-preview-meta">
          <span>{room.participantCount} of {room.maxParticipants} seats filled</span>
          <span>Code {room.code}</span>
        </div>
        {unavailable ? (
          <p className="action-message is-error">This room is no longer accepting participants.</p>
        ) : (
          <JoinRoomForm code={room.code} />
        )}
        <Link className="text-link" href="/join">Use another code</Link>
      </section>
    </main>
  );
}

function InvalidRoom({ message }: { message: string }) {
  return (
    <main className="centered-page">
      <section className="auth-card">
        <span className="eyebrow">No screening here</span>
        <h1>Room not found</h1>
        <p className="lede">{message}</p>
        <Link className="button button-primary" href="/join">Try another code</Link>
      </section>
    </main>
  );
}
