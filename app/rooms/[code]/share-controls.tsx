"use client";

import { useState } from "react";

type ShareStatus = "idle" | "copied" | "shared" | "error";

function copyWithFallback(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export function ShareControls({
  code,
  roomName,
}: {
  code: string;
  roomName: string;
}) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const shareUrl = typeof window === "undefined"
    ? `/join/${code}`
    : new URL(`/join/${code}`, window.location.origin).toString();

  async function copyShareUrl() {
    setStatus("idle");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else if (!copyWithFallback(shareUrl)) {
        throw new Error("Copy command was unavailable.");
      }
      setStatus("copied");
    } catch {
      try {
        if (!copyWithFallback(shareUrl)) {
          throw new Error("Copy command failed.");
        }
        setStatus("copied");
      } catch {
        setStatus("error");
      }
    }
  }

  async function shareRoom() {
    if (!navigator.share) {
      await copyShareUrl();
      return;
    }

    setStatus("idle");
    try {
      await navigator.share({
        title: `Join ${roomName} on Cineclub`,
        text: `Use room code ${code} to join our Cineclub room.`,
        url: shareUrl,
      });
      setStatus("shared");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyShareUrl();
    }
  }

  const statusMessage = {
    idle: "",
    copied: "Invite link copied.",
    shared: "Invite shared.",
    error: "Couldn’t copy automatically. Select the link above and copy it.",
  }[status];

  return (
    <div className="share-controls">
      <button className="room-share-button" type="button" onClick={copyShareUrl}>
        Copy link
      </button>
      <button className="room-share-button" type="button" onClick={shareRoom}>
        Share
      </button>
      <span className={`share-status${status === "error" ? " is-error" : ""}`} aria-live="polite">
        {statusMessage}
      </span>
    </div>
  );
}
