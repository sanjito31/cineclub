import { requireRoomMemberApi, noStoreJson } from "@/app/api/rooms/[code]/member-request";
import { decodeWatchboxdJob } from "@/lib/watchboxd/decode";
import { getWatchboxdJob } from "@/lib/watchboxd/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string; jobId: string }> },
) {
  const { code, jobId } = await params;
  const access = await requireRoomMemberApi(code);
  if (!access.ok) return access.error;

  try {
    const result = await getWatchboxdJob(jobId, decodeWatchboxdJob, {
      signal: request.signal,
    });
    if (result.status === "pending") {
      return noStoreJson(result, {
        status: 202,
        headers: { "Retry-After": String(result.retryAfter) },
      });
    }
    if (result.status === "not_found") {
      return noStoreJson({ error: "That Watchboxd job was not found." }, { status: 404 });
    }
    if (result.status !== "ready") {
      return noStoreJson(
        { error: "Watchboxd job status is unavailable right now." },
        { status: 503 },
      );
    }

    const pending =
      result.data.status === "queued" || result.data.status === "running";
    if (pending) {
      return noStoreJson(
        {
          status: "pending",
          retryAfter: 2,
          jobId: result.data.id,
          job: result.data,
        },
        { status: 202, headers: { "Retry-After": "2" } },
      );
    }

    return noStoreJson({ status: "ready", job: result.data });
  } catch {
    return noStoreJson(
      { error: "Unable to poll that Watchboxd job." },
      { status: 400 },
    );
  }
}
