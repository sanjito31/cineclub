export type AsyncUnavailableReason =
  | "cancelled"
  | "http_error"
  | "malformed_response"
  | "network_error"
  | "timeout";

export type AsyncResourceResult<T> =
  | { status: "ready"; data: T }
  | { status: "pending"; retryAfter: number; jobId: string | null }
  | { status: "not_found" }
  | {
      status: "unavailable";
      reason: AsyncUnavailableReason;
      statusCode?: number;
    };

export type AsyncResourcePollResult<T> =
  | AsyncResourceResult<T>
  | {
      status: "timed_out";
      attempts: number;
      jobId: string | null;
    }
  | {
      status: "cancelled";
      attempts: number;
      jobId: string | null;
    };

export type AsyncResourceDecoder<T> = (value: unknown) => T | null;

type RequestAsyncResourceOptions<T> = {
  decode: AsyncResourceDecoder<T>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  readJobId?: (value: unknown) => string | null;
};

type PollOperation<T> = (context: {
  attempt: number;
  pending: Extract<AsyncResourceResult<T>, { status: "pending" }> | null;
  signal: AbortSignal;
}) => Promise<AsyncResourceResult<T>>;

export type PollAsyncResourceOptions = {
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  maxAttempts?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_RETRY_AFTER_SECONDS = 2;
const MAX_RETRY_AFTER_SECONDS = 10;

export function getRetryAfterSeconds(response: Response) {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.min(retryAfter, MAX_RETRY_AFTER_SECONDS)
    : DEFAULT_RETRY_AFTER_SECONDS;
}

function readJobIdCandidate(value: unknown) {
  return typeof value === "string" && value.trim() && value.length <= 160
    ? value.trim()
    : null;
}

export function extractAsyncResourceJobIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];

  const record = body as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;
  const meta =
    record.meta && typeof record.meta === "object"
      ? (record.meta as Record<string, unknown>)
      : null;
  const jobs = Array.isArray(meta?.jobs) ? meta.jobs : [];
  const ids: string[] = [];

  for (const job of jobs) {
    if (!job || typeof job !== "object") continue;
    const id = readJobIdCandidate((job as { id?: unknown }).id);
    if (id && !ids.includes(id)) ids.push(id);
  }

  for (const candidate of [
    record.jobId,
    record.job_id,
    data?.jobId,
    data?.job_id,
  ]) {
    const id = readJobIdCandidate(candidate);
    if (id && !ids.includes(id)) ids.push(id);
  }

  return ids;
}

export function isPendingAsyncResourceEnvelope(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const data = (body as { data?: unknown }).data;
  return data == null && extractAsyncResourceJobIds(body).length > 0;
}

function getJobIdFromLocation(response: Response) {
  const location = response.headers.get("location");
  if (!location) return null;

  try {
    const pathname = new URL(location, response.url || "http://localhost").pathname;
    const segment = pathname.split("/").filter(Boolean).at(-1);
    return segment ? decodeURIComponent(segment) : null;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function parseAsyncResourceResponse<T>(
  response: Response,
  decode: AsyncResourceDecoder<T>,
  readJobId?: (value: unknown) => string | null,
): Promise<AsyncResourceResult<T>> {
  if (response.status === 202) {
    const body = await readJson(response);
    return {
      status: "pending",
      retryAfter: getRetryAfterSeconds(response),
      jobId:
        getJobIdFromLocation(response)
        ?? readJobId?.(body)
        ?? extractAsyncResourceJobIds(body)[0]
        ?? null,
    };
  }

  if (response.status === 404) {
    return { status: "not_found" };
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      reason: "http_error",
      statusCode: response.status,
    };
  }

  const body = await readJson(response);
  if (body === null) {
    return { status: "unavailable", reason: "malformed_response" };
  }

  const data = decode(body);
  if (data) {
    return { status: "ready", data };
  }

  if (isPendingAsyncResourceEnvelope(body)) {
    return {
      status: "pending",
      retryAfter: getRetryAfterSeconds(response),
      jobId:
        readJobId?.(body)
        ?? extractAsyncResourceJobIds(body)[0]
        ?? null,
    };
  }

  return { status: "unavailable", reason: "malformed_response" };
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out.", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    wasTimedOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

export async function requestAsyncResource<T>(
  url: URL,
  options: RequestAsyncResourceOptions<T>,
): Promise<AsyncResourceResult<T>> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const requestSignal = createRequestSignal(options.signal, timeoutMs);

  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: requestSignal.signal,
    });
    return await parseAsyncResourceResponse(response, options.decode, options.readJobId);
  } catch {
    if (requestSignal.wasTimedOut()) {
      return { status: "unavailable", reason: "timeout" };
    }
    if (options.signal?.aborted) {
      return { status: "unavailable", reason: "cancelled" };
    }
    return { status: "unavailable", reason: "network_error" };
  } finally {
    requestSignal.cleanup();
  }
}

function defaultDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export async function pollAsyncResource<T>(
  operation: PollOperation<T>,
  options: PollAsyncResourceOptions = {},
): Promise<AsyncResourcePollResult<T>> {
  const maxAttempts = options.maxAttempts ?? 5;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const timeoutMs = options.timeoutMs ?? 30_000;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer.");
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new RangeError("maxDelayMs must be a non-negative number.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive number.");
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  let pending: Extract<AsyncResourceResult<T>, { status: "pending" }> | null = null;

  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Polling timed out.", "TimeoutError"));
  }, timeoutMs);

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (controller.signal.aborted) {
        return {
          status: timedOut ? "timed_out" : "cancelled",
          attempts: attempt - 1,
          jobId: pending?.jobId ?? null,
        };
      }

      const result = await operation({ attempt, pending, signal: controller.signal });
      if (result.status !== "pending") {
        return result;
      }

      pending = result;
      if (attempt === maxAttempts) break;

      const elapsed = Date.now() - startedAt;
      const remaining = timeoutMs - elapsed;
      if (remaining <= 0) {
        timedOut = true;
        break;
      }

      const requestedDelay = Math.min(result.retryAfter * 1_000, maxDelayMs, remaining);
      try {
        await (options.delay ?? defaultDelay)(requestedDelay, controller.signal);
      } catch {
        return {
          status: timedOut ? "timed_out" : "cancelled",
          attempts: attempt,
          jobId: pending.jobId,
        };
      }
    }

    return {
      status: "timed_out",
      attempts: maxAttempts,
      jobId: pending?.jobId ?? null,
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
