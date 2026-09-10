import Link from "next/link";
import { signOut } from "@/app/actions/auth";

/**
 * Standard "back to the previous step" row for lightweight pages, with an
 * optional Profile/Clubs/Sign out cluster on the right for pages reached
 * while already signed in.
 */
export function PageNav({
  backHref,
  showAccountNav = false,
  wide = false,
}: {
  backHref: string;
  /** Show the Profile/Clubs/Sign out links -- only for pages reached while signed in. */
  showAccountNav?: boolean;
  /** Span the full content width instead of the narrow auth-card width -- use on wider pages like the create flow. */
  wide?: boolean;
}) {
  return (
    <div className={`page-nav-row${wide ? " page-nav-row--wide" : ""}`}>
      <Link className="back-link" href={backHref}>← Back</Link>
      {showAccountNav ? (
        <nav className="dashboard-nav" aria-label="Navigation">
          <Link href="/profile">Profile</Link>
          <Link href="/dashboard">Clubs</Link>
          <form action={signOut}>
            <button className="text-button" type="submit">Sign out</button>
          </form>
        </nav>
      ) : null}
    </div>
  );
}
