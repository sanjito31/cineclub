"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { updateProfile } from "@/app/actions/profile";
import { initialActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import { SubmitButton } from "@/app/components/submit-button";

type ValidationState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "valid";
      profile: { username: string; avatarUrl: string | null; letterboxdUrl: string };
    }
  | { status: "error"; message: string };

const usernamePattern = /^[A-Za-z0-9_-]{1,40}$/;

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function readErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

function readVerifiedProfile(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const profile = (value as { profile?: unknown }).profile;
  if (!profile || typeof profile !== "object") return null;
  const data = profile as Record<string, unknown>;

  if (typeof data.username !== "string" || typeof data.letterboxdUrl !== "string") {
    return null;
  }

  return {
    username: data.username,
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    letterboxdUrl: data.letterboxdUrl,
  };
}

export function ProfileForm({
  next,
  profile,
  submitLabel = "Save and continue",
}: {
  next: string;
  profile?: { displayName: string; letterboxdUsername: string | null } | null;
  submitLabel?: string;
}) {
  const initialUsername = profile?.letterboxdUsername ?? "";
  const [state, action] = useActionState(updateProfile, initialActionState);
  const [username, setUsername] = useState(initialUsername);
  const [retryKey, setRetryKey] = useState(0);
  const [validation, setValidation] = useState<ValidationState>(
    initialUsername ? { status: "checking" } : { status: "idle" },
  );

  useEffect(() => {
    const normalizedUsername = username.trim();

    if (!normalizedUsername || !usernamePattern.test(normalizedUsername)) {
      return;
    }

    const controller = new AbortController();
    const debounce = window.setTimeout(async () => {
      try {
        for (let attempt = 0; attempt < 45; attempt += 1) {
          const response = await fetch(
            `/api/watchboxd/users/${encodeURIComponent(normalizedUsername)}`,
            { cache: "no-store", signal: controller.signal },
          );
          const body: unknown = await response.json().catch(() => null);

          if (response.status === 202) {
            const retryAfter = Number(response.headers.get("retry-after"));
            const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2;
            await wait(Math.min(seconds, 10) * 1_000, controller.signal);
            continue;
          }

          if (!response.ok) {
            throw new Error(
              readErrorMessage(body) ?? "We couldn’t check that Letterboxd profile.",
            );
          }

          const verifiedProfile = readVerifiedProfile(body);
          if (!verifiedProfile) {
            throw new Error("Watchboxd returned an unexpected profile response.");
          }

          setValidation({ status: "valid", profile: verifiedProfile });
          return;
        }

        throw new Error("Letterboxd is taking longer than expected. Please try again.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setValidation({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "We couldn’t check that Letterboxd profile.",
        });
      }
    }, 500);

    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [retryKey, username]);

  const needsValidation = username.trim().length > 0;
  const submitDisabled = needsValidation && validation.status !== "valid";

  function handleUsernameChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setUsername(value);

    if (!value.trim()) {
      setValidation({ status: "idle" });
    } else if (!usernamePattern.test(value.trim())) {
      setValidation({
        status: "error",
        message: "Usernames may contain letters, numbers, dashes, and underscores.",
      });
    } else {
      setValidation({ status: "checking" });
    }
  }

  function retryValidation() {
    setValidation({ status: "checking" });
    setRetryKey((current) => current + 1);
  }

  return (
    <form action={action} className="form-stack">
      <input name="next" type="hidden" value={next} />
      <div className="field-group">
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          name="displayName"
          minLength={2}
          maxLength={60}
          defaultValue={profile?.displayName}
          placeholder="How friends know you"
          required
          autoFocus
        />
      </div>
      <div className="field-group">
        <label htmlFor="letterboxdUsername">Letterboxd username</label>
        <input
          id="letterboxdUsername"
          name="letterboxdUsername"
          maxLength={40}
          value={username}
          onChange={handleUsernameChange}
          placeholder="your-letterboxd-name"
          autoComplete="off"
        />
        <small>Connect your profile for watchlist suggestions and watched-movie warnings.</small>
        {validation.status === "checking" ? (
          <p className="username-status is-checking" role="status">
            <span className="status-spinner" aria-hidden="true" /> Checking Letterboxd…
          </p>
        ) : null}
        {validation.status === "valid" ? (
          <div className="letterboxd-profile-card" role="status">
            {validation.profile.avatarUrl ? (
              <Image
                className="letterboxd-profile-avatar"
                src={validation.profile.avatarUrl}
                alt=""
                width={44}
                height={44}
              />
            ) : (
              <span className="letterboxd-profile-avatar-fallback" aria-hidden="true">
                {validation.profile.username.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="letterboxd-profile-details">
              <small>Letterboxd profile found</small>
              <a href={validation.profile.letterboxdUrl} target="_blank" rel="noreferrer">
                @{validation.profile.username}
              </a>
            </span>
            <span className="letterboxd-profile-check" aria-hidden="true">
              ✓
            </span>
          </div>
        ) : null}
        {validation.status === "error" ? (
          <div className="username-status is-error" role="alert">
            <span>{validation.message}</span>
            {usernamePattern.test(username.trim()) ? (
              <button className="text-button" type="button" onClick={retryValidation}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <ActionMessage status={state.status} message={state.message} />
      <SubmitButton pendingLabel="Saving…" disabled={submitDisabled}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
