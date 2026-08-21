"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type FinalizePollerProps = {
  code: string;
  endpoint: string;
  lobbyHref: string;
};

type FinalizeResponse = {
  status?: string;
  phase?: string;
  retryAfter?: number;
  pendingRatingCount?: number;
  error?: string;
};

const DEFAULT_RETRY_AFTER_SECONDS = 2;
const MAXIMUM_RETRY_AFTER_SECONDS = 10;

function retryAfterSeconds(value: unknown, headerValue: string | null) {
  const fromBody = typeof value === "number" && Number.isFinite(value) ? value : null;
  const fromHeader = headerValue ? Number(headerValue) : null;
  const seconds = fromBody ?? (Number.isFinite(fromHeader) ? fromHeader : null);
  if (seconds === null || seconds <= 0) return DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(seconds, MAXIMUM_RETRY_AFTER_SECONDS);
}

export function FinalizePoller({
  code,
  endpoint,
  lobbyHref,
}: FinalizePollerProps) {
  const router = useRouter();
  const [message, setMessage] = useState("Preparing the final order.");
  const [error, setError] = useState<string | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: number | undefined;

    async function poll() {
      attempts.current += 1;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as FinalizeResponse | null;

        if (response.status === 202 || body?.status === "pending") {
          const pendingCount = body?.pendingRatingCount;
          setError(null);
          setMessage(
            pendingCount && pendingCount > 0
              ? `Waiting on Letterboxd ratings for ${pendingCount} ${pendingCount === 1 ? "movie" : "movies"}.`
              : "Waiting on Letterboxd ratings.",
          );
          timeout = window.setTimeout(
            poll,
            retryAfterSeconds(body?.retryAfter, response.headers.get("retry-after")) * 1_000,
          );
          return;
        }

        if (!response.ok) {
          setError(body?.error ?? "Unable to finalize this room right now.");
          timeout = window.setTimeout(poll, 4_000);
          return;
        }

        setError(null);
        setMessage("Final order is ready.");
        router.replace(lobbyHref);
        router.refresh();
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unable to finalize this room right now.");
        timeout = window.setTimeout(poll, 4_000);
      }
    }

    void poll();

    return () => {
      controller.abort();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [endpoint, lobbyHref, router]);

  return (
    <section className="panel selection-complete-panel" aria-labelledby="finalizing-heading">
      <span className="status-spinner finalizing-spinner" aria-hidden="true" />
      <div>
        <span className="eyebrow">Room {code}</span>
        <h2 id="finalizing-heading">Finalizing results</h2>
        <p>{message} Titles stay hidden until the host reveals them.</p>
        {error ? <p className="action-message is-error">{error}</p> : null}
      </div>
    </section>
  );
}