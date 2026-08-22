"use server";

import { revalidatePath } from "next/cache";
import type { RoomPhase } from "@/app/generated/prisma/enums";
import type { ActionState } from "@/app/actions/types";
import { requireUser } from "@/lib/auth/session";
import { revealAllMovies, revealNextMovie } from "@/lib/data/reveal";
import {
  RevealError,
  type RevealErrorCode,
} from "@/lib/domain/reveal";
import {
  roomFinalizePath,
  roomHomePath,
  roomRevealPath,
  roomSelectionPath,
  roomVotingPath,
} from "@/lib/domain/room-paths";
import { normalizeRoomCode, readString } from "@/lib/validation/shared";

export type RevealNextActionState = ActionState & {
  errorCode?: RevealErrorCode | "INVALID_ROOM_CODE";
  cooldownEndsAt?: string;
  phase?: RoomPhase;
  remainingCount?: number;
  revealedMovieId?: string;
};

function revalidateReveal(code: string) {
  revalidatePath(roomHomePath(code));
  revalidatePath(roomSelectionPath(code));
  revalidatePath(roomVotingPath(code));
  revalidatePath(roomFinalizePath(code));
  revalidatePath(roomRevealPath(code));
  revalidatePath("/dashboard");
}

export async function revealNextMovieAction(
  _previousState: RevealNextActionState,
  formData: FormData,
): Promise<RevealNextActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));
  if (!code) {
    return {
      status: "error",
      errorCode: "INVALID_ROOM_CODE",
      message: "Enter a valid six-character room code.",
    };
  }

  try {
    const user = await requireUser();
    const result = await revealNextMovie({
      userId: user.id,
      code,
      confirmEarlyReveal: readString(formData.get("confirmEarlyReveal")) === "1",
    });

    if (result.status === "needs_confirmation") {
      return {
        status: "error",
        errorCode: "COOLDOWN_UNCONFIRMED",
        cooldownEndsAt: result.cooldownEndsAt,
        phase: result.phase,
        message:
          "Revealing now skips the 24-hour pause between movies. Confirm if you want to continue.",
      };
    }

    revalidateReveal(code);

    if (result.status === "complete") {
      return {
        status: "success",
        phase: result.phase,
        remainingCount: 0,
        message: "Every finalist has been revealed. This Cineclub is complete.",
      };
    }

    return {
      status: "success",
      phase: result.phase,
      remainingCount: result.remainingCount,
      revealedMovieId: result.revealedMovie.roomMovieId,
      message: result.alreadyRevealed
        ? `${result.revealedMovie.title} was already revealed.`
        : `${result.revealedMovie.title} is in.`,
    };
  } catch (error) {
    return {
      status: "error",
      errorCode: error instanceof RevealError ? error.code : undefined,
      message:
        error instanceof Error ? error.message : "Unable to reveal the next movie.",
    };
  }
}

export async function skipRevealAction(
  _previousState: RevealNextActionState,
  formData: FormData,
): Promise<RevealNextActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));
  if (!code) {
    return {
      status: "error",
      errorCode: "INVALID_ROOM_CODE",
      message: "Enter a valid six-character room code.",
    };
  }

  try {
    const user = await requireUser();
    const result = await revealAllMovies({ userId: user.id, code });

    revalidateReveal(code);

    return {
      status: "success",
      phase: result.phase,
      remainingCount: 0,
      message: "Every finalist has been revealed. This Cineclub is complete.",
    };
  } catch (error) {
    return {
      status: "error",
      errorCode: error instanceof RevealError ? error.code : undefined,
      message:
        error instanceof Error ? error.message : "Unable to skip the reveal.",
    };
  }
}
