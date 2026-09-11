"use client";

import { useEffect, useRef } from "react";

export type IrisColor = "red" | "green" | "gold";

const IRIS: Record<IrisColor, { light: string; dark: string; sclera: string; pupil: string }> = {
  red: { light: "#c98f8f", dark: "#4a2222", sclera: "#f2dad6", pupil: "#160a0a" },
  green: { light: "#9fc99a", dark: "#26482a", sclera: "#dfeadb", pupil: "#0e160e" },
  gold: { light: "#f2d98a", dark: "#6b4f16", sclera: "#f7e9c4", pupil: "#1a1206" },
};

/**
 * A cartoon eye whose iris tracks the cursor, modeled on the pointermove +
 * rAF-easing pattern already used by CursorGlow / CursorSpotlight. Unlike the
 * design-canvas mockup (which hardcoded each eye's screen position), this
 * measures its own bounding box, so it works wherever it's placed.
 */
export function EyeTile({ iris }: { iris: IrisColor }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const group = groupRef.current;
    if (!wrap || !group) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (prefersReducedMotion || isCoarsePointer) return;

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;

    const handleMove = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = Math.max(-1, Math.min(1, (event.clientX - cx) / (window.innerWidth / 2)));
      const ny = Math.max(-1, Math.min(1, (event.clientY - cy) / (window.innerHeight / 2)));
      targetX = nx * 3.5;
      targetY = ny * 3.5;
    };

    const tick = () => {
      x += (targetX - x) * 0.25;
      y += (targetY - y) * 0.25;
      group.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", handleMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  const c = IRIS[iris];
  const gradId = `tv-iris-${iris}`;

  return (
    <div className="tv-eye-wrap" ref={wrapRef}>
      <svg className="tv-eye-track" viewBox="0 0 100 56" aria-hidden="true">
        <defs>
          <radialGradient id={gradId} cx="45%" cy="40%" r="65%">
            <stop offset="0%" stopColor={c.light} />
            <stop offset="100%" stopColor={c.dark} />
          </radialGradient>
        </defs>
        <path
          d="M2 28C2 28 22 4 50 4C78 4 98 28 98 28C98 28 78 52 50 52C22 52 2 28 2 28Z"
          fill={c.sclera}
        />
        <g ref={groupRef}>
          <circle cx="50" cy="28" r="15" fill={`url(#${gradId})`} />
          <circle cx="50" cy="28" r="6.5" fill={c.pupil} />
          <circle cx="45.5" cy="23.5" r="2.4" fill="rgba(255,255,255,.9)" />
        </g>
      </svg>
    </div>
  );
}
