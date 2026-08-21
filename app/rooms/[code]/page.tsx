import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { lockRoomRosterAction, updateFinalistOrderingAction } from "@/app/actions/rooms";
import { ClearRoomDraft } from "@/app/rooms/[code]/clear-room-draft";
import { HostOrderingControls } from "@/app/rooms/[code]/host-ordering-controls";
import { HostRosterControls } from "@/app/rooms/[code]/host-roster-controls";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { RoomProgress } from "@/app/rooms/[code]/room-progress";
import { ShareControls } from "@/app/rooms/[code]/share-controls";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { roomPhaseLabels } from "@/lib/domain/room-lifecycle";
import { finalistOrderingLabel } from "@/lib/domain/finalist-ordering";
import { roomHomePath, roomTaskPath } from "@/lib/domain/room-paths";

export const dynamic = "force-dynamic";

type LobbyParticipant =
  Awaited<ReturnType<typeof loadMemberRoom>>["room"]["participants"][number];

function participantStatus(participant: LobbyParticipant, phase: RoomPhase) {
  if (phase === RoomPhase.SELECTION) {
    return participant.selectionSubmittedAt ? "Selections submitted" : "Choosing movies";
  }
  if (phase === RoomPhase.VOTING) {
    return participant.votingSubmittedAt ? "Ballot submitted" : "Ranking movies";
  }
  return "Phase complete";
}

function taskCta(phase: RoomPhase, submitted: boolean) {
  if (phase === RoomPhase.SELECTION) {
    return submitted ? "View your selections" : "Choose movies";
  }
  if (phase === RoomPhase.VOTING) {
    return submitted ? "View voting" : "Rank movies";
  }
  if (phase === RoomPhase.FINALIZING) {
    return "Preparing results";
  }
  return null;
}

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code: rawCode } = await params;
  const query = await searchParams;
  const { user, room, isOwner } = await loadMemberRoom(rawCode);
  const participants = room.participants;
  const rosterLocked = Boolean(room.rosterLockedAt);
  const currentParticipant = participants.find(
    (participant) => participant.userId === user.id,
  );
  const submitted = room.phase === RoomPhase.SELECTION
    ? Boolean(currentParticipant?.selectionSubmittedAt)
    : Boolean(currentParticipant?.votingSubmittedAt);
  const ctaLabel = taskCta(room.phase, submitted);
  const taskHref = roomTaskPath(room.code, room.phase);

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
          {ctaLabel && taskHref !== roomHomePath(room.code) ? (
            <Link className="button button-primary lobby-task-cta" href={taskHref}>
              {ctaLabel}
            </Link>
          ) : null}
        </div>
        <div className="room-code-card">
          <span>Room code</span>
          <strong>{room.code}</strong>
          <small className="room-share-url">cineclub.app/join/{room.code}</small>
          {!rosterLocked ? <ShareControls code={room.code} roomName={room.name} /> : null}
        </div>
      </section>
      <div className="lobby-grid">
        <div className="lobby-main-column">
          <RoomProgress
            phase={room.phase}
            rosterLocked={rosterLocked}
            participants={participants}
          />
          <section className="panel">
            <div className="section-heading">
              <div><span className="eyebrow">The crew</span><h2>Participants</h2></div>
              <span className={`status-pill${rosterLocked ? " is-locked" : ""}`}>
                Roster {rosterLocked ? "locked" : "open"}
              </span>
            </div>
            <ul className="participant-list">
              {participants.map((participant, index) => {
                const status = participantStatus(participant, room.phase);
                const complete = status === "Selections submitted"
                  || status === "Ballot submitted"
                  || status === "Phase complete";

                return (
                  <li key={participant.id}>
                    <span className="avatar">{participant.user.displayName.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{participant.user.displayName}</strong>
                      <small>{participant.userId === room.ownerId ? "Host" : `Guest ${index + 1}`}</small>
                    </span>
                    <span className={`participant-progress${complete ? " is-complete" : ""}`}>
                      <span className="ready-dot" aria-hidden="true" />
                      {status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
        <aside className="lobby-sidebar">
          <section className="panel room-rules">
            <span className="eyebrow">Room rules</span>
            <h2>Tonight’s setup</h2>
            <dl>
              <div><dt>Movies per person</dt><dd>{room.selectionsPerUser}</dd></div>
              <div><dt>Participant coverage</dt><dd>{room.requireParticipantCoverage ? "Required" : "Optional"}</dd></div>
              <div><dt>Reveal order</dt><dd>{finalistOrderingLabel(room.finalistOrdering)}</dd></div>
              <div><dt>Roster</dt><dd>{room.rosterLockedAt ? "Locked" : "Open"}</dd></div>
            </dl>
            <p className="muted-copy">
              {isOwner
                ? "As host, you control when the participant roster is final."
                : rosterLocked
                  ? "The participant list is final. Follow the room progress here."
                  : "Share the invite link while the host gathers the rest of the crew."}
            </p>
          </section>
          {isOwner ? (
            <section className="panel">
              <HostRosterControls
                code={room.code}
                disabledReason={
                  rosterLocked
                    ? "Roster locking is complete."
                    : room.phase !== RoomPhase.SELECTION
                      ? "The roster can only be locked during selection."
                      : undefined
                }
                locked={rosterLocked}
                lockRosterAction={lockRoomRosterAction}
              />
            </section>
          ) : null}
          {isOwner ? (
            <section className="panel">
              <HostOrderingControls
                code={room.code}
                currentOrdering={room.finalistOrdering}
                disabledReason={
                  room.phase === RoomPhase.REVEAL || room.phase === RoomPhase.COMPLETE
                    ? "Reveal order is locked after finalization."
                    : undefined
                }
                updateOrderingAction={updateFinalistOrderingAction}
              />
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
