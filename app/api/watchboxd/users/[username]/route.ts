import { getCurrentUser } from "@/lib/auth/session";
import { normalizeLetterboxdUsername } from "@/lib/validation/shared";
import { lookupWatchboxdUser } from "@/lib/watchboxd/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Sign in before checking a Letterboxd profile." }, { status: 401 });
  }

  const { username: rawUsername } = await params;
  const username = normalizeLetterboxdUsername(rawUsername);

  if (!username) {
    return Response.json(
      { error: "Enter a valid Letterboxd username." },
      { status: 400 },
    );
  }

  const result = await lookupWatchboxdUser(username);

  if (result.status === "ready") {
    return Response.json({ status: "ready", profile: result.profile });
  }

  if (result.status === "pending") {
    return Response.json(result, {
      status: 202,
      headers: { "Retry-After": String(result.retryAfter) },
    });
  }

  if (result.status === "not_found") {
    return Response.json(
      { error: "We couldn’t find that Letterboxd profile. Check the username and try again." },
      { status: 404 },
    );
  }

  return Response.json(
    { error: "Letterboxd verification is unavailable right now. Please try again." },
    { status: 503 },
  );
}
