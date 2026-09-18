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

export function roomFinalizePath(code: string) {
  return `/rooms/${code}/finalize`;
}

export function roomRevealPath(code: string) {
  return `/rooms/${code}/reveal`;
}

export function roomResultsPath(code: string) {
  return `/rooms/${code}/results`;
}

export function roomTaskPath(code: string, phase: RoomPhase) {
  if (phase === RoomPhase.SELECTION) return roomSelectionPath(code);
  if (phase === RoomPhase.VOTING) return roomVotingPath(code);
  if (phase === RoomPhase.FINALIZING) return roomFinalizePath(code);
  if (phase === RoomPhase.REVEAL || phase === RoomPhase.COMPLETE) {
    return roomRevealPath(code);
  }
  return roomHomePath(code);
}
