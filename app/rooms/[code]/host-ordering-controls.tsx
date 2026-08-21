"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import {
  listFinalistOrderingStrategies,
  type FinalistOrdering,
} from "@/lib/domain/finalist-ordering";

type UpdateOrderingAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function HostOrderingControls({
  code,
  currentOrdering,
  disabledReason,
  updateOrderingAction,
}: {
  code: string;
  currentOrdering: FinalistOrdering;
  disabledReason?: string;
  updateOrderingAction: UpdateOrderingAction;
}) {
  const [state, action, pending] = useActionState(updateOrderingAction, {
    status: "idle",
  } satisfies ActionState);
  const locked = Boolean(disabledReason);

  return (
    <div className="host-controls">
      <div>
        <span className="eyebrow">Host controls</span>
        <h2>Reveal order</h2>
        <p>
          Choose how Cineclub orders the finalists after voting. New options can be added later without changing the rest of finalization.
        </p>
      </div>
      <form action={action} className="host-controls-form">
        <input name="code" type="hidden" value={code} />
        <fieldset className="choice-fields" disabled={pending || locked}>
          <legend className="visually-hidden">Finalist ordering</legend>
          {listFinalistOrderingStrategies().map((strategy) => (
            <label className="check-field" key={strategy.id}>
              <input
                name="finalistOrdering"
                type="radio"
                value={strategy.id}
                defaultChecked={strategy.id === currentOrdering}
              />
              <span>
                <strong>{strategy.label}</strong>
                <small>{strategy.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <button
          className="button button-primary"
          disabled={pending || locked}
          type="submit"
        >
          {pending ? "Saving order…" : locked ? "Order locked" : "Save reveal order"}
        </button>
        {disabledReason ? <small>{disabledReason}</small> : null}
        <ActionMessage status={state.status} message={state.message} />
      </form>
    </div>
  );
}