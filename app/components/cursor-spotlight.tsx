"use client";

import { useEffect, useRef } from "react";

/**
 * A warm light that follows the cursor across the whole site, like a torch
 * sweeping the deep-red paper. Lifts the grain/dust already sitting on
 * top of the page instead of fighting it (mix-blend-mode: soft-light).
 */
export function CursorSpotlight() {
  const spotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spot = spotRef.current;
    if (!spot) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (prefersReducedMotion || isCoarsePointer) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight * 0.4;
    let x = targetX;
    let y = targetY;
    let frame = 0;

    const paint = () => {
      spot.style.background = `radial-gradient(circle 520px at ${x}px ${y}px, rgba(255, 248, 225, 0.6) 0%, rgba(255, 224, 190, 0.26) 40%, transparent 72%)`;
    };

    const handleMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (spot.style.opacity !== "1") spot.style.opacity = "1";
    };

    const handleLeave = () => {
      spot.style.opacity = "0";
    };

    const tick = () => {
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      paint();
      frame = requestAnimationFrame(tick);
    };

    paint();
    window.addEventListener("pointermove", handleMove, { passive: true });
    document.addEventListener("pointerleave", handleLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerleave", handleLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={spotRef} className="cursor-spotlight" aria-hidden="true" />;
}
