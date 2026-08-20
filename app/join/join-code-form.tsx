"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { normalizeRoomCode } from "@/lib/validation/shared";

export function JoinCodeForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = normalizeRoomCode(String(data.get("code") ?? ""));

    if (!code) {
      setError("Enter the six-character code from your host.");
      return;
    }

    router.push(`/join/${code}`);
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="code">Room code</label>
        <input id="code" name="code" className="code-input" minLength={6} maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="H3X9QK" required autoFocus />
      </div>
      {error ? <p className="action-message is-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit">Find room</button>
    </form>
  );
}
