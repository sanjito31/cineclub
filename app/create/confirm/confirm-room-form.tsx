"use client";

import Link from "next/link";
import { useActionState, useMemo, useSyncExternalStore } from "react";
import { createRoomAction } from "@/app/actions/rooms";
import { initialActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import { SubmitButton } from "@/app/components/submit-button";
import { roomDraftStorageKey, type RoomDraft } from "@/app/create/create-room-form";
import { finalistOrderingLabel, parseFinalistOrdering } from "@/lib/domain/finalist-ordering";

function isRoomDraft(value: unknown): value is RoomDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<RoomDraft>;
  return (
    typeof draft.name === "string" &&
    typeof draft.maxParticipants === "string" &&
    typeof draft.selectionsPerUser === "string" &&
    typeof draft.requireParticipantCoverage === "boolean"
  );
}

export function ConfirmRoomForm() {
  const [state, action] = useActionState(createRoomAction, initialActionState);
  const storedDraft = useSyncExternalStore(
    () => () => undefined,
    () => localStorage.getItem(roomDraftStorageKey),
    () => null,
  );
  const draft = useMemo(() => {
    if (!storedDraft) return null;
    try {
      const parsed: unknown = JSON.parse(storedDraft);
      return isRoomDraft(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }, [storedDraft]);

  if (!draft) {
    return (
      <div className="empty-state">
        <h2>Your club draft isn’t in this browser.</h2>
        <p>Club settings are intentionally kept out of the database until after sign-in.</p>
        <Link className="button button-primary" href="/create">Start a new club</Link>
      </div>
    );
  }

  return (
    <form action={action} className="form-stack">
      {Object.entries(draft).map(([name, value]) =>
        name === "requireParticipantCoverage" ? (
          value ? <input key={name} name={name} type="hidden" value="on" /> : null
        ) : (
          <input key={name} name={name} type="hidden" value={String(value)} />
        ),
      )}
      <div className="draft-summary">
        <span className="eyebrow">Ready to create</span>
        <h2>{draft.name}</h2>
        <dl>
          <div><dt>Guests</dt><dd>Up to {draft.maxParticipants}</dd></div>
          <div><dt>Selections</dt><dd>{draft.selectionsPerUser} each</dd></div>
          <div><dt>Coverage rule</dt><dd>{draft.requireParticipantCoverage ? "Required" : "Optional"}</dd></div>
          <div>
            <dt>Reveal order</dt>
            <dd>{finalistOrderingLabel(parseFinalistOrdering(draft.finalistOrdering))}</dd>
          </div>
        </dl>
      </div>
      <ActionMessage status={state.status} message={state.message} />
      <SubmitButton pendingLabel="Creating club…">Create club</SubmitButton>
      <Link className="text-link" href="/create">Edit settings</Link>
    </form>
  );
}
