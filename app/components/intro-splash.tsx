"use client";

import { useEffect, useRef } from "react";

type Recipe = "r-a" | "r-b" | "r-c" | "r-d";

const LETTERS: { char: string; recipe: Recipe; delay: string; duration: string }[] = [
  { char: "C", recipe: "r-a", delay: "0.525s", duration: "1.725s" },
  { char: "i", recipe: "r-b", delay: "0.578s", duration: "1.65s" },
  { char: "n", recipe: "r-d", delay: "0.735s", duration: "1.875s" },
  { char: "e", recipe: "r-c", delay: "0.75s", duration: "1.605s" },
  { char: "c", recipe: "r-a", delay: "0.893s", duration: "1.815s" },
  { char: "l", recipe: "r-b", delay: "0.893s", duration: "1.74s" },
  { char: "u", recipe: "r-a", delay: "1.043s", duration: "1.605s" },
  { char: "b", recipe: "r-d", delay: "1.088s", duration: "1.8s" },
];

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export function IntroSplash({ onDone }: { onDone: () => void }) {
  const splashRef = useRef<HTMLDivElement>(null);
  const glitchBgRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const ghostRRef = useRef<HTMLDivElement>(null);
  const ghostCRef = useRef<HTMLDivElement>(null);
  const bar0Ref = useRef<HTMLDivElement>(null);
  const bar1Ref = useRef<HTMLDivElement>(null);
  const bar2Ref = useRef<HTMLDivElement>(null);
  const blackoutRef = useRef<HTMLDivElement>(null);
  const glitchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onDone();
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    // TV-static burst confined to the wordmark's own box, then the whole
    // splash dissolves via opacity to reveal the homepage underneath.
    const runExit = () => {
      const splash = splashRef.current;
      const glitchBg = glitchBgRef.current;
      const grain = grainRef.current;
      const ghostR = ghostRRef.current;
      const ghostC = ghostCRef.current;
      const bars = [bar0Ref.current, bar1Ref.current, bar2Ref.current];
      const blackout = blackoutRef.current;
      const glitchBox = glitchBoxRef.current;
      if (!splash || !glitchBg || !grain || !ghostR || !ghostC || !blackout || !glitchBox) return;

      splash.classList.add("intro-exiting"); // wordmark starts fading out right away

      const GLITCH_MS = 400;
      const TICK_MS = 30;
      let elapsed = 0;

      const tick = window.setInterval(() => {
        if (cancelled) {
          window.clearInterval(tick);
          return;
        }
        elapsed += TICK_MS;
        const progress = Math.min(elapsed / GLITCH_MS, 1);

        // interlace bands: jagged, shrinking heights, alternating bright
        // and dark scan lines so they actually read as static against the
        // splash's own cream background, instead of the old same-color
        // bands that just blended invisibly into it.
        const bandCount = 9 + Math.floor(progress * 6);
        const stops: string[] = [];
        let pos = 0;
        for (let i = 0; i < bandCount && pos < 100; i++) {
          const h = rand(2, 10) * (1 - progress * 0.4);
          const a = rand(0.25, 0.9);
          const rgb = Math.random() > 0.5 ? "255,255,255" : "18,16,13";
          stops.push(`rgba(${rgb},${a.toFixed(2)}) ${pos}% ${pos + h}%`);
          pos += h;
        }
        stops.push(`transparent ${pos}% 100%`);
        glitchBg.style.transition = elapsed <= TICK_MS ? "opacity 70ms ease" : "none";
        glitchBg.style.opacity = "1";
        glitchBg.style.backgroundImage = `repeating-linear-gradient(${stops.join(",")})`;
        glitchBg.style.backgroundSize = `100% ${rand(70, 150)}px`;
        glitchBg.style.transform = `translateX(${rand(-1, 1) * (progress > 0.7 ? 0.5 : 3)}px)`;

        // soft chromatic-split flares, peaking mid-burst
        const flareChance = Math.sin(progress * Math.PI);
        ghostR.style.opacity = Math.random() < flareChance * 0.4 ? String(rand(0.08, 0.22)) : "0";
        ghostR.style.transform = `translateX(${rand(-4, 4)}px)`;
        ghostC.style.opacity = Math.random() < flareChance * 0.35 ? String(rand(0.06, 0.16)) : "0";
        ghostC.style.transform = `translateX(${rand(-4, 4)}px)`;

        // tracking bars: jump to a random spot/height/opacity, sometimes off
        bars.forEach((bar) => {
          if (!bar) return;
          if (Math.random() < 0.7) {
            bar.style.top = `${rand(0, 95)}%`;
            bar.style.height = `${rand(4, 34)}px`;
            bar.style.opacity = String(rand(0.15, 0.4));
            bar.style.background =
              Math.random() > 0.5
                ? "linear-gradient(rgba(255,255,255,.5), rgba(255,255,255,.08))"
                : "linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.08))";
          } else {
            bar.style.opacity = "0";
          }
        });

        // grain builds through the burst
        grain.style.opacity = String(0.4 + progress * 0.45);
        grain.style.backgroundPosition = `${rand(-40, 40)}px ${rand(-40, 40)}px`;

        if (elapsed >= GLITCH_MS) {
          window.clearInterval(tick);

          // everything that was glitching eases out together instead of snapping off
          const settle = "opacity 280ms ease";
          glitchBg.style.transition = settle;
          bars.forEach((b) => {
            if (b) b.style.transition = settle;
          });
          ghostR.style.transition = settle;
          ghostC.style.transition = settle;
          grain.style.transition = "opacity 380ms ease";
          blackout.style.transition = "opacity 280ms ease";

          requestAnimationFrame(() => {
            glitchBg.style.opacity = "0";
            bars.forEach((b) => {
              if (b) b.style.opacity = "0";
            });
            ghostR.style.opacity = "0";
            ghostC.style.opacity = "0";
            grain.style.opacity = "0";
            blackout.style.opacity = "1"; // covers the splash in solid black
            glitchBox.style.display = "none"; // force a repaint of this layer now, while it's hidden behind blackout, rather than letting unmount tear it out abruptly

            timers.push(
              window.setTimeout(() => {
                // fade the whole splash away by opacity, so the already-rendered
                // homepage underneath dissolves smoothly into view through it.
                // Kept in sync with the .intro-splash opacity transition in
                // globals.css (1300ms) below.
                splash.style.opacity = "0";
                timers.push(
                  window.setTimeout(() => {
                    if (!cancelled) onDone();
                  }, 1300)
                );
              }, 400)
            );
          });
        }
      }, TICK_MS);

      timers.push(tick);
    };

    timers.push(window.setTimeout(runExit, 3000));

    return () => {
      cancelled = true;
      timers.forEach((t) => {
        window.clearTimeout(t);
        window.clearInterval(t);
      });
    };
  }, [onDone]);

  return (
    <div className="intro-splash" ref={splashRef} aria-hidden="true">
      <div className="intro-light-flares" />
      <div className="intro-frame">
        <div className="intro-wordmark-row">
          <h1 className="intro-wordmark">
            {LETTERS.map((letter, i) => (
              <span
                key={i}
                className={`intro-ltr ${letter.recipe}`}
                style={{ "--d": letter.delay, "--dur": letter.duration } as React.CSSProperties}
              >
                {letter.char}
              </span>
            ))}
          </h1>
        </div>
      </div>
      <div className="intro-glitch-box" ref={glitchBoxRef}>
        <div className="intro-glitch-bg" ref={glitchBgRef} />
        <div className="intro-glitch-ghost r" ref={ghostRRef} />
        <div className="intro-glitch-ghost c" ref={ghostCRef} />
        <div className="intro-glitch-bar" ref={bar0Ref} />
        <div className="intro-glitch-bar" ref={bar1Ref} />
        <div className="intro-glitch-bar" ref={bar2Ref} />
        <div className="intro-glitch-grain" ref={grainRef} />
      </div>
      <div className="intro-blackout" ref={blackoutRef} />
    </div>
  );
}
