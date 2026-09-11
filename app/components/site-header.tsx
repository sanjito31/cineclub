"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/app/components/brand-mark";

type NavLink = {
  key: string;
  label: string;
  href: string;
  frame: number;
};

const NAV_LINKS: NavLink[] = [
  { key: "join", label: "Join a club", href: "/join", frame: 9 },
  { key: "create", label: "Start a club", href: "/create", frame: 3 },
  { key: "rooms", label: "My clubs", href: "/dashboard", frame: 6 },
  { key: "profile", label: "My profile", href: "/profile", frame: 0 },
];

const TOTAL_CARDS = 18;
// which of the 18 grid cards are real links, in reading order (row-major) --
// this stays correct regardless of whether the grid renders 6 columns (desktop)
// or 3 columns (mobile), since it's a flat position in the deal-out order
const LINK_GRID_INDEXES: Record<number, NavLink> = {
  2: NAV_LINKS[0],
  7: NAV_LINKS[1],
  11: NAV_LINKS[2],
  15: NAV_LINKS[3],
};

const FRAME_COUNT = 12;
const frameSrc = (n: number) => `/nav-frames/frame-${String(((n % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT + 1).padStart(2, "0")}.png`;

const STAGGER_MS = 150; // gap between each card starting its advance -- reading order, one at a time
const SLIDE_MS = 380; // how long one card's photo takes to slide into the gate and lock (matches the CSS transition)
const SETTLE_PAUSE_MS = 450; // beat after the last card locks in, before links flip red
const SETTLE_STAGGER_MS = 130; // gap between each link card flipping red
const EDGE_HEIGHT = 11;

// small, irregularly-sized and irregularly-spaced sprocket holes -- deliberately
// not a repeating tile, so no two filmstrip-edge strips (and no two rows) line up
function makeSprocketSvg(width: number, height = EDGE_HEIGHT): string {
  const holes: string[] = [];
  let x = 4 + Math.random() * 8;
  while (x < width - 4) {
    const w = 2.5 + Math.random() * 2;
    const h = 3.5 + Math.random() * 2.5;
    const y = (height - h) / 2 + (Math.random() * 2.4 - 1.2);
    const op = (0.18 + Math.random() * 0.22).toFixed(2);
    const rx = (Math.min(w, h) / 2.4).toFixed(1);
    holes.push(
      `<rect x='${x.toFixed(1)}' y='${y.toFixed(1)}' width='${w.toFixed(1)}' height='${h.toFixed(1)}' rx='${rx}' fill='#f7ece0' fill-opacity='${op}'/>`
    );
    x += w + (10 + Math.random() * 14);
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>${holes.join("")}</svg>`;
  const encoded = svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23").replace(/'/g, "%27");
  return `data:image/svg+xml,${encoded}`;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const edgesLayerRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const grid = gridRef.current;
    const edgesLayer = edgesLayerRef.current;

    const clearTimers = () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };

    if (!open || !grid || !edgesLayer) {
      clearTimers();
      grid?.querySelectorAll<HTMLElement>(".nav-card").forEach((el) => {
        el.classList.remove("advancing");
        el.classList.remove("revealed");
        el.classList.remove("settled");
      });
      if (edgesLayer) edgesLayer.innerHTML = "";
      return;
    }

    const cards = Array.from(grid.querySelectorAll<HTMLElement>(".nav-card"));
    if (cards.length === 0) return;

    // the grid is 6 columns on desktop and 3 on mobile (matches the CSS
    // breakpoint) -- read it live so a resize between opens is always honored
    const cols = window.matchMedia("(max-width: 560px)").matches ? 3 : 6;
    const rows = cards.length / cols;

    cards.forEach((el) => {
      el.classList.remove("advancing");
      el.classList.remove("revealed");
      el.classList.remove("settled");
    });

    // build the sprocket-perforated filmstrip edges: one above the first row,
    // one below the last, and one between every pair of rows -- measured from
    // the cards' actual layout so this works at any column count
    edgesLayer.innerHTML = "";
    const gridRect = grid.getBoundingClientRect();
    const rowTops: number[] = [];
    const rowBottoms: number[] = [];
    for (let r = 0; r < rows; r++) {
      const rect = cards[r * cols].getBoundingClientRect();
      rowTops.push(rect.top - gridRect.top);
      rowBottoms.push(rect.bottom - gridRect.top);
    }
    const edgeYs: number[] = [0];
    for (let r = 0; r < rows - 1; r++) {
      edgeYs.push((rowBottoms[r] + rowTops[r + 1]) / 2 - EDGE_HEIGHT / 2);
    }
    edgeYs.push(gridRect.height - EDGE_HEIGHT);

    const edgeEls: HTMLElement[] = edgeYs.map((y) => {
      const el = document.createElement("div");
      el.className = "filmstrip-edge";
      el.style.top = `${y}px`;
      el.style.backgroundImage = `url("${makeSprocketSvg(Math.round(gridRect.width))}")`;
      edgesLayer.appendChild(el);
      return el;
    });

    // edge k=0 is the top border, shown right away; edge k borders the bottom
    // of row (k-1), so it fades in once that row's last card has locked in
    edgeEls.forEach((el, k) => {
      const showAt = k === 0 ? 0 : (k * cols - 1) * STAGGER_MS + SLIDE_MS;
      const t = window.setTimeout(() => el.classList.add("shown"), showAt);
      timersRef.current.push(t);
    });

    cards.forEach((el, i) => {
      const startTimer = window.setTimeout(() => {
        // the gold streak builds up in strength as the reel advances -- later
        // cards in the sequence get a fuller glow, and it's scoped to each
        // card's own slide rather than one element chasing across the grid
        const strength = Math.min(1, ((i + 1) / cards.length) * 1.15);
        el.style.setProperty("--streak-a", String(0.06 + strength * 0.26));

        // slides straight in on its own final frame, blurred while moving
        // fast and sharpening as it locks -- a real motion blur reads as
        // continuous movement, where swapping between several distinct still
        // frames reads as stop-motion
        const finalFrame = parseInt(el.dataset.frame ?? "0", 10);
        const img = el.querySelector<HTMLElement>(".card-img");
        if (img) img.style.backgroundImage = `url(${frameSrc(finalFrame)})`;

        // each print sits at a noticeably different density, like actual
        // frames off an old strip of film, rather than every card locking in
        // at full, flat opacity
        el.style.setProperty("--img-op", (0.5 + Math.random() * 0.5).toFixed(2));
        el.classList.add("advancing");

        const lockTimer = window.setTimeout(() => {
          el.classList.remove("advancing");
          el.classList.add("revealed");
          // stagger each card's idle film-weave loop with a random negative
          // delay so they wobble independently instead of pulsing in unison
          if (img) img.style.animationDelay = `-${(Math.random() * 3.2).toFixed(2)}s`;
        }, SLIDE_MS);
        timersRef.current.push(lockTimer);
      }, i * STAGGER_MS);
      timersRef.current.push(startTimer);
    });

    const totalMs = (cards.length - 1) * STAGGER_MS + SLIDE_MS;
    const linkCards = cards.filter((el) => el.classList.contains("is-link"));
    linkCards.forEach((el, i) => {
      const timer = window.setTimeout(
        () => el.classList.add("settled"),
        totalMs + SETTLE_PAUSE_MS + i * SETTLE_STAGGER_MS
      );
      timersRef.current.push(timer);
    });

    return () => {
      clearTimers();
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <header className="site-header">
      {/* Mobile-only small logo lockup, left side of the header -- a
          proper (small, confident) brand presence up top instead of a
          giant wordmark competing with the hero copy for attention.
          Hidden on desktop, which keeps its identity from the big
          bottom-bar wordmark. Decorative: the real site name is in the
          page title/nav, not this mark. */}
      <span className="home-header-brand tv-brand-lockup" aria-hidden="true">
        <span className="tv-brand-mark-wrap"><BrandMark width={30} height={32} /></span>
        <span className="tv-brand-word">Cineclub</span>
      </span>
      <button
        type="button"
        className={`menu-trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-label="Primary navigation"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Menu"}
      </button>

      <div className={`mobile-nav${open ? " open" : ""}`} aria-hidden={!open}>
        <div className="mobile-nav-header">
          <button type="button" className="mobile-nav-close" onClick={closeMenu}>
            Close
          </button>
        </div>
        <div className="nav-card-grid" ref={gridRef}>
          {Array.from({ length: TOTAL_CARDS }).map((_, i) => {
            const link = LINK_GRID_INDEXES[i];
            if (link) {
              const num = String(NAV_LINKS.indexOf(link) + 1).padStart(2, "0");
              return (
                <Link
                  key={link.key}
                  href={link.href}
                  className="nav-card is-link"
                  data-frame={link.frame}
                  data-key={link.key}
                  tabIndex={open ? 0 : -1}
                  onClick={closeMenu}
                >
                  <div className="card-img" />
                  <div className="card-streak" />
                  <div className="card-fade" />
                  <div className="card-num">{String(i + 1).padStart(2, "0")}</div>
                  <div className="card-label">
                    <span className="num">{num}</span>
                    <span className="txt">{link.label}</span>
                  </div>
                </Link>
              );
            }
            return (
              <div key={i} className="nav-card" data-frame={i % FRAME_COUNT}>
                <div className="card-img" />
                <div className="card-streak" />
                <div className="card-fade" />
                <div className="card-num">{String(i + 1).padStart(2, "0")}</div>
              </div>
            );
          })}
          <div className="filmstrip-edges-layer" ref={edgesLayerRef} />
        </div>
      </div>
    </header>
  );
}
