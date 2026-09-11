"use client";

import Link from "next/link";
import { useState } from "react";

type NavLink = { key: string; label: string; href: string };

const NAV_LINKS: NavLink[] = [
  { key: "join", label: "Join a club", href: "/join" },
  { key: "create", label: "Start a club", href: "/create" },
  { key: "rooms", label: "My clubs", href: "/dashboard" },
  { key: "profile", label: "My profile", href: "/profile" },
];

export function GlobalMenu() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="selection-page-menu-btn"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <div className={`selection-page-nav${open ? " is-open" : ""}`} aria-hidden={!open}>
        <div className="selection-page-nav-header">
          <button type="button" className="selection-page-nav-close" onClick={close}>Close</button>
        </div>
        <nav className="selection-page-nav-links" aria-label="Primary navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className="selection-page-nav-link"
              tabIndex={open ? 0 : -1}
              onClick={close}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
