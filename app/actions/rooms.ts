"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createRoom, deleteRoom, joinRoom, lockRoster, removeParticipant, renameRoom, unlockRoster, updateFinalistOrdering, updateRoomSettings } from "@/lib/domain/rooms";
import { isFinalistOrdering, parseFinalistOrdering } from "@/lib/domain/finalist-ordering";
import {
  roomFinalizePath,
  roomHomePath,
  roomRevealPath,
  roomSelectionPath,
  roomVotingPath,
} from "@/lib/domain/room-paths";
import { normalizeRoomCode, readString } from "@/lib/validation/shared";
import type { ActionState } from "@/app/actions/types";

function readInteger(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(readString(value));
  return Number.isInteger(parsed) ? parsed : fallback;
}

function readDate(value: FormDataEntryValue | null) {
  const text = readString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revalidateRoom(code: string) {
  revalidatePath(roomHomePath(code));
  revalidatePath(roomSelectionPath(code));
  revalidatePath(roomVotingPath(code));
  revalidatePath(roomFinalizePath(code));
  revalidatePath(roomRevealPath(code));
  revalidatePath("/dashboard");
}

export async function createRoomAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = readString(formData.get("name"));
  const maxParticipants = readInteger(formData.get("maxParticipants"), 8);
  const selectionsPerUser = readInteger(formData.get("selectionsPerUser"), 3);

  if (name.length < 2 || name.length > 80) {
    return { status: "error", message: "Room name must be between 2 and 80 characters." };
  }

  if (maxParticipants < 2 || maxParticipants > 20) {
    return { status: "error", message: "Choose between 2 and 20 participants." };
  }

  if (selectionsPerUser < 1 || selectionsPerUser > 10) {
    return { status: "error", message: "Choose between 1 and 10 movies per person." };
  }

  let code: string;

  try {
    const user = await requireUser();
    const room = await createRoom({
      ownerId: user.id,
      name,
      maxParticipants,
      selectionsPerUser,
      requireParticipantCoverage: formData.get("requireParticipantCoverage") === "on",
      finalistOrdering: parseFinalistOrdering(
        readString(formData.get("finalistOrdering")),
      ),
      joinDeadline: readDate(formData.get("joinDeadline")),
      selectionDeadline: readDate(formData.get("selectionDeadline")),
      votingDeadline: readDate(formData.get("votingDeadline")),
    });
    code = room.code;
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to create the room.",
    };
  }

  redirect(`${roomHomePath(code)}?created=1`);
}

export async function joinRoomAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));

  if (!code) {
    return { status: "error", message: "Enter a valid six-character room code." };
  }

  try {
    const user = await requireUser();
    await joinRoom({ userId: user.id, code });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to join the room.",
    };
  }

  redirect(roomSelectionPath(code));
}

export async function lockRoomRosterAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));

  if (!code) {
    return { status: "error", message: "Enter a valid six-character room code." };
  }

  try {
    const user = await requireUser();
    const result = await lockRoster({ userId: user.id, code });

    revalidateRoom(code);

    return {
      status: "success",
      message: result.alreadyLocked
        ? "This room's roster is already locked."
        : "Roster locked. No new participants can join.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to lock the roster.",
    };
  }
}

export async function unlockRoomRosterAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));

  if (!code) {
    return { status: "error", message: "Enter a valid six-character room code." };
  }

  try {
    const user = await requireUser();
    const result = await unlockRoster({ userId: user.id, code });

    revalidateRoom(code);

    return {
      status: "success",
      message: result.alreadyUnlocked
        ? "Roster is already open."
        : "Roster unlocked. New participants can join.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to unlock the roster.",
    };
  }
}

export async function updateRoomSettingsAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));

  if (!code) {
    return { status: "error", message: "Invalid room code." };
  }

  const maxParticipants = readInteger(formData.get("maxParticipants"), 8);
  const selectionsPerUser = readInteger(formData.get("selectionsPerUser"), 3);
  const requireParticipantCoverage = formData.get("requireParticipantCoverage") === "on";
  const orderingValue = readString(formData.get("finalistOrdering"));

  if (maxParticipants < 2 || maxParticipants > 20) {
    return { status: "error", message: "Choose between 2 and 20 participants." };
  }

  if (selectionsPerUser < 1 || selectionsPerUser > 10) {
    return { status: "error", message: "Choose between 1 and 10 movies per person." };
  }

  if (orderingValue && !isFinalistOrdering(orderingValue)) {
    return { status: "error", message: "Choose a valid reveal order." };
  }

  try {
    const user = await requireUser();
    await updateRoomSettings({
      userId: user.id,
      code,
      maxParticipants,
      selectionsPerUser,
      requireParticipantCoverage,
      finalistOrdering: orderingValue ? parseFinalistOrdering(orderingValue) : undefined,
    });
    revalidateRoom(code);
    return { status: "success", message: "Settings saved." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to update settings.",
    };
  }
}

export async function removeParticipantAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));
  const participantId = readString(formData.get("participantId"));

  if (!code) {
    return { status: "error", message: "Invalid room code." };
  }

  if (!participantId) {
    return { status: "error", message: "Missing participant." };
  }

  try {
    const user = await requireUser();
    await removeParticipant({ userId: user.id, code, participantId });
    revalidateRoom(code);
    return { status: "success", message: "Participant removed." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to remove participant.",
    };
  }
}

export async function updateFinalistOrderingAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));
  const orderingValue = readString(formData.get("finalistOrdering"));

  if (!code) {
    return { status: "error", message: "Enter a valid six-character room code." };
  }

  if (!isFinalistOrdering(orderingValue)) {
    return { status: "error", message: "Choose a valid reveal order." };
  }

  try {
    const user = await requireUser();
    const result = await updateFinalistOrdering({
      userId: user.id,
      code,
      ordering: orderingValue,
    });

    revalidateRoom(code);

    return {
      status: "success",
      message: result.unchanged
        ? "Reveal order is already set to that option."
        : "Reveal order updated.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Unable to update the reveal order.",
    };
  }
}

export async function renameRoomAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));
  const name = readString(formData.get("name"));

  if (!code) {
    return { status: "error", message: "Invalid room code." };
  }

  if (name.length < 2 || name.length > 80) {
    return { status: "error", message: "Room name must be between 2 and 80 characters." };
  }

  try {
    const user = await requireUser();
    await renameRoom({ userId: user.id, code, name });
    revalidateRoom(code);
    return { status: "success", message: "Room renamed." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to rename the room.",
    };
  }
}

export async function deleteRoomAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = normalizeRoomCode(readString(formData.get("code")));

  if (!code) {
    return { status: "error", message: "Invalid room code." };
  }

  try {
    const user = await requireUser();
    await deleteRoom({ userId: user.id, code });
    revalidatePath("/dashboard");
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to delete the room.",
    };
  }

  redirect("/dashboard");
}
