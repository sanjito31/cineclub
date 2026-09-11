"use server";

import { revalidatePath } from "next/cache";
import type { RoomPhase } from "@/app/generated/prisma/enums";
import type { ActionState } from "@/app/actions/types";
import { requireUser } from "@/lib/auth/session";
import {
  submitNominations,
  type SubmittedNomination,
} from "@/lib/data/nominations";
import { withdrawSelections } from "@/lib/domain/rooms";
import {
  NominationSubmissionError,
  SelectionValidationError,
  type ExistingNominationDuplicate,
  type NominationSubmissionErrorCode,
  type SelectionValidationErrorCode,
} from "@/lib/domain/nominations";
import { roomHomePath, roomSelectionPath, roomVotingPath } from "@/lib/domain/room-paths";
import { DomainError } from "@/lib/auth/errors";
import { normalizeRoomCode, readString } from "@/lib/validation/shared";

export type SubmitNominationsActionResult = {
  roomId: string;
  code: string;
  participantId: string;
  submittedAt: string;
  phase: RoomPhase;
  phaseTransitioned: boolean;
  resubmitted: boolean;
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
        : result.resubmitted
          ? "Selections updated. You can update them again until voting begins."
          : "And now the wait begins...waiting for the other participants to submit",
      result: {
        roomId: result.roomId,
        code: result.code,
        participantId: result.participantId,
        submittedAt: result.submittedAt,
        phase: result.phase,
        phaseTransitioned: result.phaseTransitioned,
        resubmitted: result.resubmitted,
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

export async function withdrawSelectionsAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));
  if (!code) {
    return { status: "error", message: "Invalid room code." };
  }

  try {
    const user = await requireUser();
    await withdrawSelections({ userId: user.id, code });

    revalidatePath(roomHomePath(code));
    revalidatePath(roomSelectionPath(code));
    revalidatePath("/dashboard");

    return { status: "success", message: "Selections withdrawn. You can now pick again." };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof DomainError || error instanceof Error
          ? error.message
          : "Unable to withdraw selections.",
    };
  }
}
