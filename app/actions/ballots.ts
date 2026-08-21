"use server";

import { revalidatePath } from "next/cache";
import type { RoomPhase } from "@/app/generated/prisma/enums";
import type { ActionState } from "@/app/actions/types";
import { requireUser } from "@/lib/auth/session";
import { submitBallot } from "@/lib/data/ballots";
import {
  BallotSubmissionError,
  BallotValidationError,
  type BallotSubmissionErrorCode,
  type BallotValidationErrorCode,
} from "@/lib/domain/voting";
import {
  roomFinalizePath,
  roomHomePath,
  roomRevealPath,
  roomSelectionPath,
  roomVotingPath,
} from "@/lib/domain/room-paths";
import { normalizeRoomCode, readString } from "@/lib/validation/shared";

export type SubmitBallotActionResult = {
  roomId: string;
  code: string;
  participantId: string;
  submittedAt: string;
  phase: RoomPhase;
  phaseTransitioned: boolean;
  rankedCount: number;
};

export type SubmitBallotActionState = ActionState & {
  errorCode?:
    | BallotValidationErrorCode
    | BallotSubmissionErrorCode
    | "INVALID_ROOM_CODE"
    | "INVALID_RANKS";
  result?: SubmitBallotActionResult;
};

function parseRanks(value: FormDataEntryValue | null) {
  const serialized = readString(value);
  if (!serialized) {
    return null;
  }

  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
}

export async function submitBallotAction(
  _previousState: SubmitBallotActionState,
  formData: FormData,
): Promise<SubmitBallotActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));
  if (!code) {
    return {
      status: "error",
      errorCode: "INVALID_ROOM_CODE",
      message: "Enter a valid six-character room code.",
    };
  }

  const ranks = parseRanks(formData.get("ranks"));
  if (!ranks) {
    return {
      status: "error",
      errorCode: "INVALID_RANKS",
      message: "Submit a valid ranked list of movies.",
    };
  }

  try {
    const user = await requireUser();
    const result = await submitBallot({
      userId: user.id,
      code,
      ranks,
    });

    revalidatePath(roomHomePath(code));
    revalidatePath(roomSelectionPath(code));
    revalidatePath(roomVotingPath(code));
    revalidatePath(roomFinalizePath(code));
    revalidatePath(roomRevealPath(code));
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: result.phaseTransitioned
        ? "Ballot submitted. Results are being finalized."
        : "Ballot submitted. Waiting for the remaining participants.",
      result: {
        roomId: result.roomId,
        code: result.code,
        participantId: result.participantId,
        submittedAt: result.submittedAt,
        phase: result.phase,
        phaseTransitioned: result.phaseTransitioned,
        rankedCount: result.rankedCount,
      },
    };
  } catch (error) {
    return {
      status: "error",
      errorCode:
        error instanceof BallotValidationError ||
        error instanceof BallotSubmissionError
          ? error.code
          : undefined,
      message:
        error instanceof Error
          ? error.message
          : "Unable to submit your ballot.",
    };
  }
}
