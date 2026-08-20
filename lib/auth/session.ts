import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthenticationError } from "@/lib/auth/errors";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationError();
  }

  return user;
}

export async function requireUserOrRedirect(nextPath: string) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}
