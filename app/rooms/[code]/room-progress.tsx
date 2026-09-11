import Link from "next/link";
import { RoomPhase } from "@/app/generated/prisma/enums";
import type { RoomPhase as RoomPhaseValue } from "@/app/generated/prisma/enums";
import { roomPhaseLabels } from "@/lib/domain/room-lifecycle";
import { roomHomePath, roomTaskPath } from "@/lib/domain/room-paths";

type ParticipantProgress = {
  selectionSubmittedAt: Date | null;
  votingSubmittedAt: Date | null;
};

const phaseOrder: RoomPhaseValue[] = [
  RoomPhase.SELECTION,
  RoomPhase.VOTING,
  RoomPhase.FINALIZING,
  RoomPhase.REVEAL,
  RoomPhase.COMPLETE,
];

function phaseHeadline(phase: RoomPhaseValue) {
  if (phase === RoomPhase.SELECTION) return "Nominating movies";
  if (phase === RoomPhase.VOTING) return "Voting in progress";
  if (phase === RoomPhase.FINALIZING) return "Preparing results";
  if (phase === RoomPhase.REVEAL) return "Revealing finalists";
  return "Night complete";
}

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
      ? "Everyone currently in the club has submitted. The host can lock the roster to start voting."
      : "You can start choosing movies now. The host will lock the roster when everyone has joined.";
  }

  if (phase === RoomPhase.SELECTION) {
    return completed === total
      ? "Everyone has submitted. The club is moving to voting."
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

function taskCta(phase: RoomPhaseValue, submitted: boolean) {
  if (phase === RoomPhase.SELECTION) {
    return submitted ? "View your selections" : "Nominate movies";
  }
  if (phase === RoomPhase.VOTING) {
    return submitted ? "View voting" : "Cast your ballot";
  }
  if (phase === RoomPhase.FINALIZING) {
    return "View progress";
  }
  if (phase === RoomPhase.REVEAL) {
    return "Watch the reveal";
  }
  if (phase === RoomPhase.COMPLETE) {
    return "View results";
  }
  return null;
}

export function RoomProgress({
  phase,
  rosterLocked,
  participants,
  submitted,
  roomCode,
}: {
  phase: RoomPhaseValue;
  rosterLocked: boolean;
  participants: ParticipantProgress[];
  submitted: boolean;
  roomCode: string;
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
  const barLabel = tracksSelections
    ? "Selections submitted"
    : tracksVoting
      ? "Ballots submitted"
      : "Phase progress";

  const ctaLabel = taskCta(phase, submitted);
  const taskHref = roomTaskPath(roomCode, phase);
  const showCta = ctaLabel && taskHref !== roomHomePath(roomCode);
  const currentIndex = phaseOrder.indexOf(phase);

  return (
    <section className="panel progress-panel" aria-labelledby="room-progress-heading">
      <div className="phase-pills" role="list" aria-label="Club phases">
        {phaseOrder.map((p, i) => {
          const done = i < currentIndex;
          const active = p === phase;
          let cls = "phase-pill";
          if (active) cls += ` phase-pill-active phase-${p.toLowerCase()}`;
          else if (done) cls += " phase-pill-done";
          return (
            <span key={p} className={cls} role="listitem" aria-current={active ? "step" : undefined}>
              {roomPhaseLabels[p]}
            </span>
          );
        })}
      </div>
      <h2 className="progress-headline" id="room-progress-heading">
        {phaseHeadline(phase)}
      </h2>
      <p className="progress-message">
        {phaseMessage({ phase, rosterLocked, completed, total })}
      </p>
      <div className="progress-summary">
        <span>{barLabel}</span>
        <strong>{completed} of {total}</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={barLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
      {showCta ? (
        <div className="progress-cta">
          <Link className="button button-primary" href={taskHref}>
            {ctaLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
