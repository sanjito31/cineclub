import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import {
  deleteRoomAction,
  lockRoomRosterAction,
  removeParticipantAction,
  renameRoomAction,
  unlockRoomRosterAction,
  updateRoomSettingsAction,
} from "@/app/actions/rooms";
import { ClearRoomDraft } from "@/app/rooms/[code]/clear-room-draft";
import { HostControlsCard } from "@/app/rooms/[code]/host-controls-card";
import { RosterToggleButton, RemoveParticipantButton } from "@/app/rooms/[code]/participant-actions";
import { loadMemberRoom } from "@/app/rooms/[code]/load-room";
import { RoomProgress } from "@/app/rooms/[code]/room-progress";
import { ShareControls } from "@/app/rooms/[code]/share-controls";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { finalistOrderingLabel } from "@/lib/domain/finalist-ordering";

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
  const canRemoveParticipants = isOwner && room.phase === RoomPhase.SELECTION;

  return (
    <main className="lobby-page">
      {query.created === "1" ? <ClearRoomDraft /> : null}
      <header className="lobby-header">
        <Link className="brand" href="/dashboard"><span className="brand-mark">C</span><span>Cineclub</span></Link>
        <nav className="dashboard-nav" aria-label="Navigation">
          <Link href="/profile">Profile</Link>
          <Link href="/dashboard">Rooms</Link>
          <form action={signOut}><button className="text-button" type="submit">Sign out</button></form>
        </nav>
      </header>
      <section className="lobby-hero">
        <div>
          <span className="eyebrow">{isOwner ? "You're hosting" : "You're in"}</span>
          <h1>{room.name}</h1>
        </div>
        <div className="room-code-card room-code-card-compact">
          <span>Room code</span>
          <strong>{room.code}</strong>
          {!rosterLocked ? <ShareControls code={room.code} /> : null}
        </div>
      </section>
      <div className="lobby-grid">
        <div className="lobby-main-column">
          <RoomProgress
            phase={room.phase}
            rosterLocked={rosterLocked}
            participants={participants}
            submitted={submitted}
            roomCode={room.code}
          />
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Participants</h2>
                <span className="participant-seats">{participants.length} of {room.maxParticipants} seats filled</span>
              </div>
              <div className="section-heading-actions">
                <RosterToggleButton
                  code={room.code}
                  locked={rosterLocked}
                  canToggle={isOwner && room.phase === RoomPhase.SELECTION}
                  lockAction={lockRoomRosterAction}
                  unlockAction={unlockRoomRosterAction}
                />
              </div>
            </div>
            <ul className="participant-list">
              {participants.map((participant, index) => {
                const status = participantStatus(participant, room.phase);
                const complete = status === "Selections submitted"
                  || status === "Ballot submitted"
                  || status === "Phase complete";
                const isHost = participant.userId === room.ownerId;

                return (
                  <li key={participant.id}>
                    <span className="avatar">{participant.user.displayName.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{participant.user.displayName}</strong>
                      <small>{isHost ? "Host" : `Guest ${index + 1}`}</small>
                    </span>
                    <span className={`participant-progress${complete ? " is-complete" : ""}`}>
                      <span className="ready-dot" aria-hidden="true" />
                      {status}
                    </span>
                    {canRemoveParticipants && !isHost ? (
                      <RemoveParticipantButton
                        code={room.code}
                        participantId={participant.id}
                        removeAction={removeParticipantAction}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
          {isOwner ? (
            <HostControlsCard
              code={room.code}
              roomName={room.name}
              maxParticipants={room.maxParticipants}
              selectionsPerUser={room.selectionsPerUser}
              requireParticipantCoverage={room.requireParticipantCoverage}
              currentOrdering={room.finalistOrdering}
              locked={room.phase !== RoomPhase.SELECTION}
              updateSettingsAction={updateRoomSettingsAction}
              renameAction={renameRoomAction}
              deleteAction={deleteRoomAction}
            />
          ) : null}
        </div>
        <aside className="lobby-sidebar">
          <section className="panel room-rules">
            <h2>Room Rules</h2>
            <dl>
              <div><dt>Movies per person</dt><dd>{room.selectionsPerUser}</dd></div>
              <div><dt>Participant coverage</dt><dd>{room.requireParticipantCoverage ? "Required" : "Optional"}</dd></div>
              <div><dt>Reveal order</dt><dd>{finalistOrderingLabel(room.finalistOrdering)}</dd></div>
              <div><dt>Roster</dt><dd>{room.rosterLockedAt ? "Locked" : "Open"}</dd></div>
            </dl>
            <p className="muted-copy">
              {isOwner
                ? "As host, you control the room settings and roster."
                : rosterLocked
                  ? "The participant list is final. Follow the room progress here."
                  : "Share the invite link while the host gathers the rest of the crew."}
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
