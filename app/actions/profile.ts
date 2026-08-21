"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { saveProfile } from "@/lib/data/profiles";
import {
  normalizeLetterboxdUsername,
  optionalString,
  readString,
  safeNextPath,
} from "@/lib/validation/shared";
import { lookupWatchboxdUser, warmWatchboxdCache } from "@/lib/watchboxd/client";
import type { ActionState } from "@/app/actions/types";

export async function updateProfile(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const displayName = readString(formData.get("displayName"));
  const letterboxdUsername = optionalString(formData.get("letterboxdUsername"));
  const next = safeNextPath(formData.get("next"));

  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "You must be signed in to continue.",
    };
  }

  if (displayName.length < 2 || displayName.length > 60) {
    return {
      status: "error",
      message: "Display name must be between 2 and 60 characters.",
    };
  }

  if (letterboxdUsername && !normalizeLetterboxdUsername(letterboxdUsername)) {
    return {
      status: "error",
      message: "Letterboxd usernames may contain letters, numbers, dashes, and underscores.",
    };
  }

  let verifiedLetterboxdUsername = letterboxdUsername;

  if (letterboxdUsername) {
    const lookup = await lookupWatchboxdUser(letterboxdUsername);

    if (lookup.status === "pending") {
      return {
        status: "error",
        message: "Letterboxd is still checking that profile. Please try again in a moment.",
      };
    }

    if (lookup.status === "not_found") {
      return {
        status: "error",
        message: "We couldn’t find that Letterboxd profile. Check the username and try again.",
      };
    }

    if (lookup.status === "unavailable") {
      return {
        status: "error",
        message: "Letterboxd verification is unavailable right now. Please try again.",
      };
    }

    verifiedLetterboxdUsername = lookup.profile.username;
  }

  try {
    await saveProfile({
      userId: user.id,
      displayName,
      letterboxdUsername: verifiedLetterboxdUsername,
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to save your profile.",
    };
  }

  if (verifiedLetterboxdUsername) {
    warmWatchboxdCache(verifiedLetterboxdUsername);
  }

  revalidatePath("/profile");
  redirect(next);
}
