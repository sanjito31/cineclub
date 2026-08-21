import { RoomPhase } from "@/app/generated/prisma/enums";
import type { RoomPhase as RoomPhaseValue } from "@/app/generated/prisma/enums";

type ParticipantProgress = {
  selectionSubmittedAt: Date | null;
  votingSubmittedAt: Date | null;
};

function phaseMessage({
  phase,
  rosterLocked,
  completed,
  total,
}: {
  phase: RoomPhaseValue;
  rosterLocked: boolean;
  completed: number;
  total: number;
}) {
  if (!rosterLocked && phase === RoomPhase.SELECTION) {
    return completed === total
      ? "Everyone currently in the room has submitted. The host can lock the roster to start voting."
      : "You can start choosing movies now. The host will lock the roster when everyone has joined.";
  }

  if (phase === RoomPhase.SELECTION) {
    return completed === total
      ? "Everyone has submitted. The room is moving to voting."
      : "Waiting for everyone to finish choosing their movies.";
  }

  if (phase === RoomPhase.VOTING) {
    return completed === total
      ? "Every ballot is in. Results are being prepared."
      : "Waiting for everyone to submit their ranked ballot.";
  }

  if (phase === RoomPhase.FINALIZING) {
    return "All ballots are in. Cineclub is preparing the final order.";
  }

  if (phase === RoomPhase.REVEAL) {
    return "The host is revealing the finalists one movie at a time. Future titles stay hidden.";
  }

  return "This Cineclub is complete. Open the reveal page to see the full lineup.";
}

export function RoomProgress({
  phase,
  rosterLocked,
  participants,
}: {
  phase: RoomPhaseValue;
  rosterLocked: boolean;
  participants: ParticipantProgress[];
}) {
  const tracksSelections = phase === RoomPhase.SELECTION;
  const tracksVoting = phase === RoomPhase.VOTING;
  const completed = tracksSelections
    ? participants.filter((participant) => participant.selectionSubmittedAt).length
    : tracksVoting
      ? participants.filter((participant) => participant.votingSubmittedAt).length
      : participants.length;
  const total = participants.length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  const label = tracksSelections
    ? "Selections submitted"
    : tracksVoting
      ? "Ballots submitted"
      : "Phase progress";

  return (
    <section className="panel progress-panel" aria-labelledby="room-progress-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Room progress</span>
          <h2 id="room-progress-heading">
            {rosterLocked ? "Roster locked" : "Waiting for the crew"}
          </h2>
        </div>
        <span className={`status-pill${rosterLocked ? " is-locked" : ""}`}>
          {rosterLocked ? "Locked" : "Open"}
        </span>
      </div>
      <p className="progress-message">
        {phaseMessage({ phase, rosterLocked, completed, total })}
      </p>
      <div className="progress-summary">
        <span>{label}</span>
        <strong>{completed} of {total}</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </section>
  );
}
