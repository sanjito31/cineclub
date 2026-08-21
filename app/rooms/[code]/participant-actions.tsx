"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";

type FormAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function RosterToggleButton({
  code,
  locked,
  canToggle,
  lockAction,
  unlockAction,
}: {
  code: string;
  locked: boolean;
  canToggle: boolean;
  lockAction: FormAction;
  unlockAction: FormAction;
}) {
  const [lockState, doLock, lockPending] = useActionState(lockAction, {
    status: "idle",
  } satisfies ActionState);
  const [unlockState, doUnlock, unlockPending] = useActionState(unlockAction, {
    status: "idle",
  } satisfies ActionState);

  const pending = lockPending || unlockPending;
  const state = locked ? unlockState : lockState;

  if (!canToggle) {
    return (
      <span className="status-pill is-locked">
        Roster {locked ? "locked" : "open"}
      </span>
    );
  }

  return (
    <form action={locked ? doUnlock : doLock} className="roster-lock-inline">
      <input name="code" type="hidden" value={code} />
      <button
        className={`button button-xs${locked ? " button-secondary" : " button-primary"}`}
        disabled={pending}
        type="submit"
      >
        {pending
          ? (locked ? "Unlocking…" : "Locking…")
          : (locked ? "Unlock roster" : "Lock roster")}
      </button>
      {state.status === "error" ? (
        <ActionMessage status={state.status} message={state.message} />
      ) : null}
    </form>
  );
}

export function RemoveParticipantButton({
  code,
  participantId,
  removeAction,
}: {
  code: string;
  participantId: string;
  removeAction: FormAction;
}) {
  const [state, action, pending] = useActionState(removeAction, {
    status: "idle",
  } satisfies ActionState);

  return (
    <form action={action} className="remove-participant-form">
      <input name="code" type="hidden" value={code} />
      <input name="participantId" type="hidden" value={participantId} />
      <button
        className="remove-participant-button"
        disabled={pending}
        type="submit"
        title="Remove participant"
        aria-label="Remove participant"
      >
        {pending ? "…" : "×"}
      </button>
      {state.status === "error" ? (
        <ActionMessage status={state.status} message={state.message} />
      ) : null}
    </form>
  );
}
