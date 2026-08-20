"use server";

import { revalidatePath } from "next/cache";
import type { RoomPhase } from "@/app/generated/prisma/enums";
import type { ActionState } from "@/app/actions/types";
import { requireUser } from "@/lib/auth/session";
import {
  submitNominations,
  type SubmittedNomination,
} from "@/lib/data/nominations";
import {
  NominationSubmissionError,
  SelectionValidationError,
  type ExistingNominationDuplicate,
  type NominationSubmissionErrorCode,
  type SelectionValidationErrorCode,
} from "@/lib/domain/nominations";
import { roomHomePath, roomSelectionPath, roomVotingPath } from "@/lib/domain/room-paths";
import { normalizeRoomCode, readString } from "@/lib/validation/shared";

export type SubmitNominationsActionResult = {
  roomId: string;
  code: string;
  participantId: string;
  submittedAt: string;
  phase: RoomPhase;
  phaseTransitioned: boolean;
  nominations: SubmittedNomination[];
  duplicateWarnings: ExistingNominationDuplicate[];
};

export type SubmitNominationsActionState = ActionState & {
  errorCode?:
    | SelectionValidationErrorCode
    | NominationSubmissionErrorCode
    | "INVALID_ROOM_CODE"
    | "INVALID_SELECTIONS";
  result?: SubmitNominationsActionResult;
};

function parseSelections(value: FormDataEntryValue | null) {
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

export async function submitNominationsAction(
  _previousState: SubmitNominationsActionState,
  formData: FormData,
): Promise<SubmitNominationsActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));
  if (!code) {
    return {
      status: "error",
      errorCode: "INVALID_ROOM_CODE",
      message: "Enter a valid six-character room code.",
    };
  }

  const selections = parseSelections(formData.get("selections"));
  if (!selections) {
    return {
      status: "error",
      errorCode: "INVALID_SELECTIONS",
      message: "Submit a valid list of movie selections.",
    };
  }

  try {
    const user = await requireUser();
    const result = await submitNominations({
      userId: user.id,
      code,
      selections,
    });

    revalidatePath(roomHomePath(code));
    revalidatePath(roomSelectionPath(code));
    revalidatePath(roomVotingPath(code));
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: result.phaseTransitioned
        ? "Selections submitted. Voting is now open."
        : "Selections submitted. Waiting for the remaining participants.",
      result: {
        roomId: result.roomId,
        code: result.code,
        participantId: result.participantId,
        submittedAt: result.submittedAt,
        phase: result.phase,
        phaseTransitioned: result.phaseTransitioned,
        nominations: result.nominations,
        duplicateWarnings: result.duplicates.existingByOtherParticipants,
      },
    };
  } catch (error) {
    return {
      status: "error",
      errorCode:
        error instanceof SelectionValidationError ||
        error instanceof NominationSubmissionError
          ? error.code
          : undefined,
      message:
        error instanceof Error
          ? error.message
          : "Unable to submit movie selections.",
    };
  }
}
