"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/app/components/site-header";
import { IntroSplash } from "@/app/components/intro-splash";

const SPLASH_SESSION_KEY = "cineclub-intro-seen";

// runs before paint (client-only) so a repeat visit within the same
// browser session never flashes the splash before hiding it -- the intro
// should only ever play once per session, the very first time you land
// on the homepage.
function useIsomorphicLayoutEffect(
  effect: React.EffectCallback,
  deps?: React.DependencyList,
) {
  const use = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  use(effect, deps);
}

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);

  useIsomorphicLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(SPLASH_SESSION_KEY)) {
        setShowSplash(false);
      } else {
        sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
      }
    } catch {
      // sessionStorage unavailable (private browsing, etc.) -- fall back
      // to always showing the splash rather than throwing.
    }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return (
    <div className="home-page">
      {showSplash && <IntroSplash onDone={() => setShowSplash(false)} />}
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="subtext">Because picking the movie with friends shouldn&apos;t take longer than watching it.</p>
            <h1 className="tagline"><span className="tagline-light">Stop scrolling.</span><br /><span className="tagline-emphasis">Start watching.</span></h1>
            <div className="hero-actions">
              <Link className="button button-primary" href="/create">Create a club <span>→</span></Link>
              <Link className="button button-secondary" href="/join">Join with a code</Link>
            </div>
          </div>
        </section>
        <div className="brand-bar" aria-hidden="true">
          <div className="brand-bar-stripes">
            <span className="stripe-yellow"></span>
            <span className="stripe-teal"></span>
            <span className="stripe-green"></span>
            <span className="stripe-purple"></span>
            <h2 className="brand-bar-wordmark">Cineclub</h2>
          </div>
          <div className="brand-bar-accent">
            <div className="color-bar-main">
              <span className="bar-white"></span>
              <span className="bar-yellow"></span>
              <span className="bar-cyan"></span>
              <span className="bar-green"></span>
              <span className="bar-magenta"></span>
              <span className="bar-red"></span>
              <span className="bar-blue"></span>
            </div>
            <div className="color-bar-registration">
              <span className="reg-navy"></span>
              <span className="reg-white"></span>
              <span className="reg-purple"></span>
              <span className="reg-black"></span>
              <span className="reg-static"></span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
