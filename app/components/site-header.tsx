import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Cineclub home">
        <span className="brand-mark" aria-hidden="true">C</span>
        <span>Cineclub</span>
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/create">Create a room</Link>
        <Link href="/join">Join</Link>
        <Link href="/dashboard">My rooms</Link>
        <Link href="/profile">Profile</Link>
      </nav>
    </header>
  );
}
