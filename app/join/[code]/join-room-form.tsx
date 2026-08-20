"use client";

import { useActionState } from "react";
import { joinRoomAction } from "@/app/actions/rooms";
import { initialActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import { SubmitButton } from "@/app/components/submit-button";

export function JoinRoomForm({ code }: { code: string }) {
  const [state, action] = useActionState(joinRoomAction, initialActionState);

  return (
    <form action={action} className="form-stack">
      <input name="code" type="hidden" value={code} />
      <ActionMessage status={state.status} message={state.message} />
      <SubmitButton pendingLabel="Taking your seat…">Confirm and join</SubmitButton>
    </form>
  );
}
