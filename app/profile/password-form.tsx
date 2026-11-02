"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";
import { initialActionState } from "@/app/actions/types";
import { ActionMessage } from "@/app/components/action-message";
import { SubmitButton } from "@/app/components/submit-button";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action] = useActionState(updatePassword, initialActionState);

  return (
    <section className="account-password">
      <span className="eyebrow">Password</span>
      <p>
        {hasPassword
          ? "You sign in with a password. Forgot it? Tap “Forgot password?” on the sign-in page for an emailed link, then change it here."
          : "You sign in with emailed links. Add a password to sign in with it instead. You can still get a link from “Forgot password?”."}
      </p>
      <form action={action} className="form-stack">
        <div className="field-group">
          <label htmlFor="password">{hasPassword ? "New password" : "Password"}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
          <small>At least 6 characters.</small>
        </div>
        <div className="field-group">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <ActionMessage status={state.status} message={state.message} />
        <SubmitButton pendingLabel="Saving…">
          {hasPassword ? "Change password" : "Add password"}
        </SubmitButton>
      </form>
    </section>
  );
}
