"use client";

import { useRef, useState } from "react";

function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy failed");
  } finally {
    textarea.remove();
  }
  return Promise.resolve();
}

export function ShareControls({
  code,
}: {
  code: string;
  roomName?: string;
}) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const codeTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const linkTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const shareUrl = typeof window === "undefined"
    ? `/join/${code}`
    : new URL(`/join/${code}`, window.location.origin).toString();

  async function handleCopyCode() {
    try {
      await copyToClipboard(code);
      setCodeCopied(true);
      if (codeTimer.current) clearTimeout(codeTimer.current);
      codeTimer.current = setTimeout(() => setCodeCopied(false), 1500);
    } catch {}
  }

  async function handleCopyLink() {
    try {
      await copyToClipboard(shareUrl);
      setLinkCopied(true);
      if (linkTimer.current) clearTimeout(linkTimer.current);
      linkTimer.current = setTimeout(() => setLinkCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="share-controls">
      <button className="room-share-button" type="button" onClick={handleCopyCode}>
        {codeCopied ? "Copied!" : "Copy code"}
      </button>
      <button className="room-share-button" type="button" onClick={handleCopyLink}>
        {linkCopied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
