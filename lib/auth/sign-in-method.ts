import "server-only";

import { prisma } from "@/lib/prisma";

export type SignInMethod = "password" | "link";

// app_runtime cannot read auth.users, so this goes through the
// cineclub.email_sign_in_method SECURITY DEFINER function. Null means no
// account uses this email yet.
export async function getSignInMethod(email: string): Promise<SignInMethod | null> {
  try {
    const rows = await prisma.$queryRaw<{ method: SignInMethod | null }[]>`
      SELECT cineclub.email_sign_in_method(${email}) AS method
    `;

    return rows[0]?.method ?? null;
  } catch (error) {
    // Keep database details (e.g. a missing migration) out of the UI.
    console.error("email_sign_in_method lookup failed", error);
    throw new Error("We couldn’t check that email right now. Try again in a moment.");
  }
}
