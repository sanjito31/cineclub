import { RoomPhase } from "@/app/generated/prisma/enums";
import { DomainError } from "@/lib/auth/errors";

const transitions: Readonly<Record<RoomPhase, readonly RoomPhase[]>> = {
  [RoomPhase.SELECTION]: [RoomPhase.VOTING],
  [RoomPhase.VOTING]: [RoomPhase.FINALIZING],
  [RoomPhase.FINALIZING]: [RoomPhase.REVEAL],
  [RoomPhase.REVEAL]: [RoomPhase.COMPLETE],
  [RoomPhase.COMPLETE]: [],
};

export function isRoomPhase(value: string): value is RoomPhase {
  return Object.values(RoomPhase).includes(value as RoomPhase);
}

export function canTransitionRoomPhase(from: RoomPhase, to: RoomPhase) {
  return transitions[from].includes(to);
}

export function assertRoomPhase(current: RoomPhase, expected: RoomPhase) {
  if (current !== expected) {
    throw new DomainError(`Room must be in ${expected.toLowerCase()} to continue.`);
  }
}

export function assertRoomPhaseTransition(from: RoomPhase, to: RoomPhase) {
  if (!canTransitionRoomPhase(from, to)) {
    throw new DomainError(`Room cannot move from ${from} to ${to}.`);
  }
}

export const roomPhaseLabels: Readonly<Record<RoomPhase, string>> = {
  [RoomPhase.SELECTION]: "Selection",
  [RoomPhase.VOTING]: "Voting",
  [RoomPhase.FINALIZING]: "Finalizing",
  [RoomPhase.REVEAL]: "Reveal",
  [RoomPhase.COMPLETE]: "Complete",
};
