"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";

type LockRosterAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function HostRosterControls({
  code,
  disabledReason,
  locked,
  lockRosterAction,
}: {
  code: string;
  disabledReason?: string;
  locked: boolean;
  lockRosterAction: LockRosterAction;
}) {
  const [state, action, pending] = useActionState(lockRosterAction, {
    status: "idle",
  } satisfies ActionState);

  return (
    <div className="host-controls">
      <div>
        <span className="eyebrow">Host controls</span>
        <h2>{locked ? "The crew is set" : "Ready to start?"}</h2>
        <p>
          {locked
            ? "The participant list is final and no one else can join."
            : "Locking fixes the participant list. No one else can join after this point."}
        </p>
      </div>
      <form action={action} className="host-controls-form">
        <input name="code" type="hidden" value={code} />
        <button
          className="button button-primary"
          disabled={pending || Boolean(disabledReason)}
          type="submit"
        >
          {pending ? "Locking roster…" : locked ? "Roster locked" : "Lock roster"}
        </button>
        {disabledReason ? <small>{disabledReason}</small> : null}
        <ActionMessage status={state.status} message={state.message} />
      </form>
    </div>
  );
}
