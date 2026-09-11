import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { BackButton } from "@/app/components/back-button";
import { GlobalMenu } from "@/app/components/global-menu";

/**
 * Standard "back to the previous step" row for lightweight pages, with an
 * optional Profile/Clubs/Sign out cluster on the right for pages reached
 * while already signed in. The back button and menu button are the same
 * fixed, site-wide pair used everywhere else.
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
    <>
      <BackButton href={backHref} />
      <GlobalMenu />
      {showAccountNav ? (
        <div className={`page-nav-row${wide ? " page-nav-row--wide" : ""}`}>
          <nav className="dashboard-nav" aria-label="Navigation">
            <Link href="/profile">Profile</Link>
            <Link href="/dashboard">Clubs</Link>
            <form action={signOut}>
              <button className="text-button" type="submit">Sign out</button>
            </form>
          </nav>
        </div>
      ) : null}
    </>
  );
}
