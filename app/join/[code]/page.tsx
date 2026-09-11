import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinRoomForm } from "@/app/join/[code]/join-room-form";
import { PageNav } from "@/app/components/page-nav";
import { requireUserOrRedirect } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { getRoomPreview } from "@/lib/data/rooms";
import { roomTaskPath } from "@/lib/domain/room-paths";
import { normalizeRoomCode } from "@/lib/validation/shared";

export const dynamic = "force-dynamic";

function HalftonePhoto() {
  return (
    <div className="join-welcome-frame">
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no responsive/loader needs */}
      <img className="join-welcome-image" src="/riso/cinema-riso.png" alt="" aria-hidden="true" />
    </div>
  );
}

export default async function JoinRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeRoomCode(rawCode);

  if (!code) return <InvalidRoom message="That club code is not valid." />;

  const user = await requireUserOrRedirect(`/join/${code}`);
  const profile = await getProfile(user.id);
  if (!profile) redirect(`/onboarding?next=${encodeURIComponent(`/join/${code}`)}`);

  let room;
  try {
    room = await getRoomPreview(code, user.id);
  } catch (error) {
    return <InvalidRoom message={error instanceof Error ? error.message : "Unable to find that club."} />;
  }

  if (room.isMember) redirect(roomTaskPath(room.code, room.phase));
  const unavailable = room.rosterLocked || room.participantCount >= room.maxParticipants;

  return (
    <main className="centered-page join-preview-page">
      <PageNav backHref="/join" />
      <div className="join-welcome">
        <h1 className="join-welcome-headline">
          <span className="join-welcome-headline-line">
            <span className="join-welcome-headline-star" aria-hidden="true">★</span>
            <span className="join-welcome-headline-text">Welcome to</span>
            <span className="join-welcome-headline-star" aria-hidden="true">★</span>
          </span>
          <span className="join-welcome-name-box">
            <span className="join-welcome-name-star" aria-hidden="true">★ ★</span>
            <span className="join-welcome-headline-name">{room.name}</span>
            <span className="join-welcome-name-star" aria-hidden="true">★ ★</span>
          </span>
        </h1>
        <HalftonePhoto />
        <p className="join-welcome-host">Hosted by {room.ownerName}</p>
        <div className="join-welcome-chips">
          <span className="join-welcome-chip">
            <span className="join-welcome-chip-count">{room.participantCount}/{room.maxParticipants}</span>
            <span className="join-welcome-chip-label">Seats</span>
          </span>
          <span className="join-welcome-chip-star" aria-hidden="true">★</span>
          <span className="join-welcome-chip join-welcome-chip-code">{room.code}</span>
        </div>
        {unavailable ? (
          <p className="join-welcome-notice">This club is no longer accepting participants.</p>
        ) : (
          <JoinRoomForm code={room.code} />
        )}
        <p className="join-welcome-stars" aria-hidden="true">★ ★ ★ ★ ★ ★</p>
        <div className="join-welcome-footer">
          <Link className="join-welcome-link" href="/join">Use another code</Link>
        </div>
      </div>
    </main>
  );
}

function InvalidRoom({ message }: { message: string }) {
  return (
    <main className="centered-page join-preview-page">
      <PageNav backHref="/join" />
      <div className="join-welcome">
        <h1 className="join-welcome-headline">
          <span className="join-welcome-headline-line">
            <span className="join-welcome-headline-star" aria-hidden="true">★</span>
            <span className="join-welcome-headline-text">Welcome to</span>
            <span className="join-welcome-headline-star" aria-hidden="true">★</span>
          </span>
          <span className="join-welcome-name-box">
            <span className="join-welcome-name-star" aria-hidden="true">★ ★</span>
            <span className="join-welcome-headline-name">No club found</span>
            <span className="join-welcome-name-star" aria-hidden="true">★ ★</span>
          </span>
        </h1>
        <HalftonePhoto />
        <p className="join-welcome-host">{message}</p>
        <Link className="join-welcome-btn" href="/join">Try another code</Link>
      </div>
    </main>
  );
}
