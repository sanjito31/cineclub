"use client";

import { useEffect, useRef } from "react";

const HOVER_SELECTOR =
  "a, button, [role='button'], input, textarea, select, [data-cursor-hover]";

export function CursorGlow() {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (prefersReducedMotion || isCoarsePointer) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let visible = false;
    let frame = 0;

    const handleMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!visible) {
        visible = true;
        dot.style.opacity = "1";
      }
      const hovering = (event.target as Element | null)?.closest(HOVER_SELECTOR);
      dot.classList.toggle("is-hovering", Boolean(hovering));
    };

    const handleLeave = () => {
      visible = false;
      dot.style.opacity = "0";
    };

    const tick = () => {
      x += (targetX - x) * 0.18;
      y += (targetY - y) * 0.18;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      frame = requestAnimationFrame(tick);
    };

    document.documentElement.classList.add("has-cursor-glow");
    window.addEventListener("pointermove", handleMove, { passive: true });
    document.addEventListener("pointerleave", handleLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      document.documentElement.classList.remove("has-cursor-glow");
      window.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerleave", handleLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={dotRef} className="cursor-glow" aria-hidden="true" />;
}
