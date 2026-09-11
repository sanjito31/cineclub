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
          {/* Mobile-only: a bordered "frame" wraps the hero, reference-
              inspired -- the tagline runs as a continuous scrolling
              strip along all four edges (top/bottom horizontal,
              sides vertical via writing-mode, bottom mirrored 180deg
              so the loop reads coherently around the corners) instead
              of filling the whole background. The photo sits inside
              as its own sharp, plainly-bordered block -- no blend or
              blur this time, just a clean frame like a printed card.
              All of it is decorative/aria-hidden; the tagline keeps
              one real, accessible instance below in hero-copy
              (visually hidden on mobile). */}
          <div className="hero-frame" aria-hidden="true">
            <div className="hero-frame-edge hero-frame-edge--top">
              <div className="hero-frame-track">
                <span>STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ </span>
                <span>STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ </span>
              </div>
            </div>
            <div className="hero-frame-edge hero-frame-edge--bottom">
              <div className="hero-frame-track">
                <span>STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ </span>
                <span>STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ </span>
              </div>
            </div>
            <div className="hero-frame-edge hero-frame-edge--left">
              <div className="hero-frame-track">
                <span>STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ </span>
                <span>STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ </span>
              </div>
            </div>
            <div className="hero-frame-edge hero-frame-edge--right">
              <div className="hero-frame-track">
                <span>STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ </span>
                <span>STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ </span>
              </div>
            </div>
            {/* Reference: a "TELEVISION" book-cover grid -- black
                panel, bold gradient wordmark up top, a dense grid of
                small rounded screens below. CINECLUB stands in for the
                book title; the audience photo is sliced across the grid
                (background-position math) so the cards reassemble one
                picture instead of repeating it. */}
            <div className="hero-tv-wall">
              {/* Radial displacement map for the slight fisheye/curved-
                  glass look on each screen tile (see .tv-cell). */}
              <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
                <filter id="tv-fisheye" x="-20%" y="-20%" width="140%" height="140%">
                  <feImage
                    result="tv-fisheye-map"
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="none"
                    xlinkHref="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3CradialGradient id='g' cx='50%25' cy='50%25' r='70%25'%3E%3Cstop offset='0%25' stop-color='%23808080'/%3E%3Cstop offset='100%25' stop-color='%23ffffff'/%3E%3C/radialGradient%3E%3Crect width='100' height='100' fill='url(%23g)'/%3E%3C/svg%3E"
                  />
                  <feDisplacementMap in="SourceGraphic" in2="tv-fisheye-map" scale="6" xChannelSelector="R" yChannelSelector="G" />
                </filter>
                {/* Chromatic-aberration/RGB-split filter for the brief
                    screen-glitch moments (see .hero-frame's animation) --
                    pulls the red and blue channels apart, screen-blended
                    back together, so the whole frame briefly reads like a
                    mistracked tape/broadcast signal instead of just
                    jumping position. */}
                <filter id="hero-glitch-rgb" x="-20%" y="-20%" width="140%" height="140%">
                  <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rC" />
                  <feOffset in="rC" dx="-5" dy="0" result="rOff" />
                  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gC" />
                  <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bC" />
                  <feOffset in="bC" dx="5" dy="0" result="bOff" />
                  <feBlend in="rOff" in2="gC" mode="screen" result="rg" />
                  <feBlend in="rg" in2="bOff" mode="screen" />
                </filter>
              </svg>
              <h2 className="hero-tv-wordmark" aria-hidden="true">CINECLUB</h2>
              <div className="hero-tv-grid">
                {Array.from({ length: 32 }).map((_, i) => {
                  const cols = 4;
                  const rows = 8;
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  const bgPosition = `${(col / (cols - 1)) * 100}% ${(row / (rows - 1)) * 100}%`;
                  return (
                    <div
                      className="tv-cell"
                      key={i}
                      style={{ "--tv-bg-pos": bgPosition } as React.CSSProperties}
                    ></div>
                  );
                })}
              </div>
            </div>
            {/* Same animated film-grain texture used on the intro splash
                (.intro-splash::before), reused here and layered above
                everything else in the frame -- borders, wall, wordmark
                included -- so the whole screen reads as one grainy shot. */}
            <div className="hero-grain"></div>
            {/* A bright static "roll" band that briefly sweeps through in
                sync with the RGB-split snaps in .hero-frame's own
                animation -- the screen/film-glitch half of the effect,
                not just a positional jitter. */}
            <div className="hero-glitch-scan" aria-hidden="true"></div>
          </div>
          <div className="hero-copy">
            <h1 className="tagline"><span className="tagline-light">Stop scrolling.</span><br /><span className="tagline-emphasis">Start watching.</span></h1>
            <div className="hero-actions">
              <Link className="button button-primary" href="/create">Create a club <span>→</span></Link>
              <Link className="button button-secondary" href="/join">Join with a code</Link>
            </div>
          </div>
        </section>
        <div className="brand-bar">
          <div className="brand-bar-stripes" aria-hidden="true">
            <span className="stripe-yellow"></span>
            <span className="stripe-teal"></span>
            <span className="stripe-green"></span>
            <span className="stripe-purple"></span>
            <h2 className="brand-bar-wordmark">Cineclub</h2>
          </div>
          <div className="brand-bar-accent" aria-hidden="true">
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
          {/* Mobile-only: body copy laid directly over the bottom
              color-bar strip (see .brand-bar-subtext in globals.css).
              Hidden outside mobile. */}
          <p className="brand-bar-subtext">Because picking the movie with friends shouldn&apos;t take longer than watching it.</p>
        </div>
      </main>
    </div>
  );
}
