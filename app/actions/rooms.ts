"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createRoom, joinRoom } from "@/lib/domain/rooms";
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

  redirect(`/rooms/${code}?created=1`);
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

  redirect(`/rooms/${code}`);
}
