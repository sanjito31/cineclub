import Link from "next/link";
import { SiteHeader } from "@/app/components/site-header";

export default function Home() {
  return (
    <div className="home-page">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">Everyone gets a pick</span>
            <h1>Movie night,<br /><em>finally decided.</em></h1>
            <p>Build a shared shortlist, rank the room’s favorites, and reveal the winners one suspenseful night at a time.</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/create">Create a room <span>→</span></Link>
              <Link className="button button-secondary" href="/join">Join with a code</Link>
            </div>
          </div>
          <div className="poster-stack" aria-hidden="true">
            <div className="poster poster-one"><span>01</span><strong>Choose</strong><small>Bring your favorites</small></div>
            <div className="poster poster-two"><span>02</span><strong>Rank</strong><small>Every voice counts</small></div>
            <div className="poster poster-three"><span>03</span><strong>Reveal</strong><small>No spoilers</small></div>
          </div>
        </section>
        <section className="how-it-works">
          <div><span>01</span><h2>Gather the crew</h2><p>Share one short room code. Friends join after a quick email sign-in.</p></div>
          <div><span>02</span><h2>Build the ballot</h2><p>Nominate movies without losing duplicate picks or who chose what.</p></div>
          <div><span>03</span><h2>Let suspense win</h2><p>Rank together, then let the host reveal the final lineup over time.</p></div>
        </section>
      </main>
    </div>
  );
}
