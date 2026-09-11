import Link from "next/link";

/**
 * The small fixed circular "back" button used across the site -- same
 * visual treatment (and CSS) as the one originally built for the movie
 * selection page, now shared everywhere. Always pairs with <GlobalMenu />.
 */
export function BackButton({ href }: { href: string }) {
  return (
    <Link href={href} className="selection-page-back-btn" aria-label="Back">
      Back
    </Link>
  );
}
