"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSignInMethod } from "@/lib/auth/sign-in-method";
import { normalizeEmail, safeNextPath } from "@/lib/validation/shared";
import type { ActionState } from "@/app/actions/types";
import { publicConfig } from "@/lib/config/public";

export type AuthActionState = ActionState & {
  email?: string;
  next?: string;
  passwordRequired?: boolean;
  linkSent?: boolean;
};

async function getEmailRedirectUrl(next: string) {
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

async function sendMagicLink(email: string, next: string): Promise<AuthActionState> {
  try {
    const supabase = await createClient();
    const emailRedirectTo = await getEmailRedirectUrl(next);
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

async function signInWithPassword(
  email: string,
  password: string,
  next: string,
): Promise<AuthActionState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { status: "error", message: error.message, email, next, passwordRequired: true };
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to sign you in.",
      email,
      next,
      passwordRequired: true,
    };
  }

  redirect(`/onboarding?next=${encodeURIComponent(next)}`);
}

async function signUpWithPassword(
  email: string,
  password: string,
  next: string,
): Promise<AuthActionState> {
  let hasSession;
  try {
    if (await getSignInMethod(email)) {
      return {
        status: "error",
        message: "That email already has an account. Go back and sign in with it.",
        email,
        next,
      };
    }

    const supabase = await createClient();
    // Magic-link sign-ups also get a (random) password hash in auth.users,
    // so this flag is how email_sign_in_method tells real passwords apart.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: await getEmailRedirectUrl(next),
        data: { has_password: true },
      },
    });

    if (error) {
      return { status: "error", message: error.message, email, next };
    }

    hasSession = Boolean(data.session);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to create your account.",
      email,
      next,
    };
  }

  // With "Confirm email" on, sign up returns no session until the emailed
  // link is opened, which lands in /auth/confirm like a magic link.
  if (!hasSession) {
    return {
      status: "success",
      message: "Check your email to confirm your account.",
      email,
      next,
      linkSent: true,
    };
  }

  redirect(`/onboarding?next=${encodeURIComponent(next)}`);
}

// One action for every step of the sign-in form. The "email" step looks up
// how the address signs in: password accounts get the password field,
// everyone else (including new emails) gets a magic link.
export async function submitSignIn(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(formData.get("email"));
  const password = formData.get("password");
  const next = safeNextPath(formData.get("next"));
  const mode = formData.get("mode");

  if (!email) {
    return { status: "error", message: "Enter a valid email address.", next };
  }

  if (formData.get("intent") === "link") {
    return sendMagicLink(email, next);
  }

  if (mode === "password" || mode === "signup") {
    if (typeof password !== "string" || password.length === 0) {
      return {
        status: "error",
        message: "Enter your password.",
        email,
        next,
        passwordRequired: mode === "password",
      };
    }

    return mode === "password"
      ? signInWithPassword(email, password, next)
      : signUpWithPassword(email, password, next);
  }

  let method;
  try {
    method = await getSignInMethod(email);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to check that email.",
      email,
      next,
    };
  }

  if (method === "password") {
    return { status: "idle", email, next, passwordRequired: true };
  }

  return sendMagicLink(email, next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
