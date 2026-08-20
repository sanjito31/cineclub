import { RoomPhase } from "@/app/generated/prisma/enums";

export function roomHomePath(code: string) {
  return `/rooms/${code}`;
}

export function roomSelectionPath(code: string) {
  return `/rooms/${code}/select`;
}

export function roomVotingPath(code: string) {
  return `/rooms/${code}/vote`;
}

export function roomTaskPath(code: string, phase: RoomPhase) {
  if (phase === RoomPhase.SELECTION) return roomSelectionPath(code);
  if (phase === RoomPhase.VOTING) return roomVotingPath(code);
  return roomHomePath(code);
}
