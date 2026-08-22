"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";

type FormAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function WithdrawButton({
  code,
  action,
  label,
}: {
  code: string;
  action: FormAction;
  label: string;
}) {
  const [state, doAction, pending] = useActionState(action, {
    status: "idle",
  } satisfies ActionState);

  return (
    <div className="withdraw-control">
      <form action={doAction}>
        <input name="code" type="hidden" value={code} />
        <button
          className="button button-secondary button-small"
          disabled={pending}
          type="submit"
        >
          {pending ? "Withdrawing…" : label}
        </button>
      </form>
      <ActionMessage status={state.status} message={state.message} />
    </div>
  );
}
