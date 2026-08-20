import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/validation/shared";

const validTypes = new Set<EmailOtpType>([
  "signup",
  "email",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const requestedNext = request.nextUrl.searchParams.get("next");
  const next = requestedNext ? safeNextPath(requestedNext) : "/dashboard";

  const supabase = await createClient();
  let error: Error | null = null;

  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    error = result.error;
  } else if (tokenHash && type && validTypes.has(type)) {
    const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = result.error;
  } else {
    error = new Error("Missing authentication code.");
  }

  if (!error) {
    const response = NextResponse.redirect(
      new URL(`/onboarding?next=${encodeURIComponent(next)}`, request.url),
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const authUrl = new URL("/auth", request.url);
  authUrl.searchParams.set("error", "invalid-link");
  authUrl.searchParams.set("next", next);
  return NextResponse.redirect(authUrl);
}
