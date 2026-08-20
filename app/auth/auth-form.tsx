"use client";

import { useActionState } from "react";
import { sendMagicLink, type MagicLinkActionState } from "@/app/actions/auth";
import { ActionMessage } from "@/app/components/action-message";
import { SubmitButton } from "@/app/components/submit-button";

const initialState: MagicLinkActionState = { status: "idle" };

export function AuthForm({ next }: { next: string }) {
  const [state, action] = useActionState(sendMagicLink, initialState);

  if (state.linkSent && state.email) {
    return (
      <div className="email-sent-state" role="status">
        <span className="email-sent-icon" aria-hidden="true">✦</span>
        <h2>Check your email for a sign-in link</h2>
        <p>
          We sent a one-time link to <strong>{state.email}</strong>. Open it in this browser to
          continue.
        </p>
        <a className="text-link" href={`/auth?next=${encodeURIComponent(state.next ?? next)}`}>
          Use a different email
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="form-stack">
      <input name="next" type="hidden" value={next} />
      <div className="field-group">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.email}
          required
          autoFocus
        />
      </div>
      <ActionMessage status={state.status} message={state.message} />
      <SubmitButton pendingLabel="Sending link…">Email me a sign-in link</SubmitButton>
      <p className="form-footnote">No password. New emails create an account automatically.</p>
    </form>
  );
}
