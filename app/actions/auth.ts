"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { normalizeEmail, safeNextPath } from "@/lib/validation/shared";
import type { ActionState } from "@/app/actions/types";
import { publicConfig } from "@/lib/config/public";

export type MagicLinkActionState = ActionState & {
  email?: string;
  next?: string;
  linkSent?: boolean;
};

async function getMagicLinkRedirectUrl(next: string) {
  const requestHeaders = await headers();
  const configuredSiteUrl = publicConfig.siteUrl;
  const requestOrigin = requestHeaders.get("origin");
  const siteUrl = configuredSiteUrl || requestOrigin;

  if (!siteUrl) {
    throw new Error("The Cineclub site URL is not configured.");
  }

  const redirectUrl = new URL("/auth/confirm", siteUrl);

  if (!/^https?:$/.test(redirectUrl.protocol)) {
    throw new Error("The Cineclub site URL must use HTTP or HTTPS.");
  }

  redirectUrl.searchParams.set("next", next);
  return redirectUrl.toString();
}

export async function sendMagicLink(
  _previousState: MagicLinkActionState,
  formData: FormData,
): Promise<MagicLinkActionState> {
  const email = normalizeEmail(formData.get("email"));
  const next = safeNextPath(formData.get("next"));

  if (!email) {
    return { status: "error", message: "Enter a valid email address.", next };
  }

  try {
    const supabase = await createClient();
    const emailRedirectTo = await getMagicLinkRedirectUrl(next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo },
    });

    if (error) {
      return { status: "error", message: error.message, email, next };
    }

    return {
      status: "success",
      message: "Check your email for a sign-in link.",
      email,
      next,
      linkSent: true,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to send the code.",
      email,
      next,
    };
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
