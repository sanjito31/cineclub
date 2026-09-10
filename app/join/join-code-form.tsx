"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { normalizeRoomCode } from "@/lib/validation/shared";
import { EyeTile, type IrisColor } from "@/app/components/eye-tile";

type SmallSlotContent =
  | { kind: "eye"; iris: IrisColor }
  | { kind: "static"; variant: "teal" | "cobalt" }
  | { kind: "photo"; variant: "glasses" | "hatstack" };

// The four small supporting tiles (never the big/featured ones) draw from
// this pool each time the page mounts: the three eyes always appear
// somewhere in here, plus one of the original small-tile fillers, shuffled
// across the four slots so the wall isn't identical on every visit.
const DEFAULT_SMALL_SLOTS: SmallSlotContent[] = [
  { kind: "static", variant: "teal" },
  { kind: "static", variant: "cobalt" },
  { kind: "photo", variant: "glasses" },
  { kind: "photo", variant: "hatstack" },
];

function shuffledSmallSlots(): SmallSlotContent[] {
  const fillers: SmallSlotContent[] = [
    { kind: "static", variant: "teal" },
    { kind: "static", variant: "cobalt" },
    { kind: "photo", variant: "glasses" },
    { kind: "photo", variant: "hatstack" },
  ];
  const filler = fillers[Math.floor(Math.random() * fillers.length)];
  const items: SmallSlotContent[] = [
    { kind: "eye", iris: "gold" },
    { kind: "eye", iris: "green" },
    { kind: "eye", iris: "red" },
    filler,
  ];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function SmallSlotScreen({ content }: { content: SmallSlotContent }) {
  if (content.kind === "eye") {
    return (
      <div className={`tv-screen tv-halftone tv-screen--${content.iris}-eye`}>
        <EyeTile iris={content.iris} />
      </div>
    );
  }
  if (content.kind === "static") {
    return <div className={`tv-screen tv-screen--static-${content.variant}`} />;
  }
  return <div className={`tv-screen tv-screen--${content.variant}`} />;
}

export function JoinCodeForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [smallSlots, setSmallSlots] = useState<SmallSlotContent[]>(DEFAULT_SMALL_SLOTS);

  // Randomize only after mount -- the server and the first client paint
  // both render the fixed default order, so there's no hydration mismatch.
  useEffect(() => {
    // Deliberate: randomize only after mount so the server-rendered and
    // first-client-paint markup match exactly, then swap to a shuffled
    // layout client-side. eslint's effect rule doesn't have a case for
    // "sync external randomness in on mount", so it's disabled here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSmallSlots(shuffledSmallSlots());
  }, []);

  const [e9Content, e5Content, e7Content, e3bContent] = smallSlots;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = normalizeRoomCode(String(data.get("code") ?? ""));

    if (!code) {
      setError("Enter the six-character code from your host.");
      return;
    }

    setError("");
    setPending(true);
    router.push(`/join/${code}`);
  }

  return (
    <form onSubmit={handleSubmit} className="tv-wall tv-wall--join">
      <div className="tv-bleed is-h" style={{ top: "17.4%", background: "linear-gradient(90deg, #3d8b9c 0 16%, #317133 16% 34%, #a83d80 34% 52%, #a59723 52% 70%, #8f1820 70% 86%, #202657 86% 100%)" }} />
      <div className="tv-bleed is-h" style={{ top: "29%", background: "linear-gradient(90deg, #202657 0 22%, #8f1820 22% 44%, #3d8b9c 44% 66%, #a59723 66% 100%)", opacity: .4 }} />
      <div className="tv-bleed is-h" style={{ top: "50%", background: "linear-gradient(90deg, #a59723 0 20%, #a83d80 20% 40%, #317133 40% 60%, #3d8b9c 60% 80%, #8f1820 80% 100%)" }} />
      <div className="tv-bleed is-h" style={{ top: "82.6%", background: "linear-gradient(90deg, #8a5389 0 18%, #3d8b9c 18% 38%, #317133 38% 58%, #202657 58% 78%, #a59723 78% 100%)" }} />
      <div className="tv-bleed is-v" style={{ left: "33.8%", background: "linear-gradient(180deg, #3d8b9c 0 25%, #a59723 25% 50%, #8f1820 50% 75%, #317133 75% 100%)" }} />
      <div className="tv-bleed is-v" style={{ left: "66.2%", background: "linear-gradient(180deg, #202657 0 30%, #a83d80 30% 55%, #3d8b9c 55% 80%, #a59723 80% 100%)" }} />

      <div className="tv-marquee">
        <span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" />
        <span className="tv-marquee-label">● Now Boarding</span>
        <span className="tv-bulb" /><span className="tv-bulb" />
      </div>

      <div className="tv-photo-row tv-photo-row--top">
        <div className="tv-tile tv-e4">
          <div className="tv-screen tv-screen--juggler" />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e1">
          <div className="tv-screen tv-screen--theater" />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e2">
          <div className="tv-screen tv-screen--test-card" />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e9">
          <SmallSlotScreen content={e9Content} />
          <div className="tv-dots"><span /><span /></div>
        </div>
      </div>

      <div className="tv-photo-row tv-photo-row--extra">
        <div className="tv-tile tv-e5">
          <SmallSlotScreen content={e5Content} />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e6">
          <div className="tv-screen tv-screen--golconda" />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e7">
          <SmallSlotScreen content={e7Content} />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e8">
          <div className="tv-screen tv-screen--static-magenta" />
          <div className="tv-dots"><span /><span /></div>
        </div>
      </div>

      <div className="tv-tile tv-headline-tile">
        <div className="tv-screen">
          <div className="tv-headline-copy">
            <h1 className="tv-headline-text">Enter The<br />Club Code</h1>
            <p className="tv-headline-lede">You&rsquo;ll confirm the club and sign in before taking a seat.</p>
            <div className="tv-ident-strip" />
            <div className="tv-dot-strip tv-dot-strip--join" />
          </div>
          <div className="tv-code-entry">
            <label htmlFor="code" className="tv-input-label">Club Code</label>
            <input
              id="code"
              name="code"
              className="tv-input-field tv-input-field--code"
              minLength={6}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="H3X9QK"
              required
              autoFocus
            />
            {error ? <p className="action-message is-error" role="alert">{error}</p> : null}
          </div>
        </div>
        <div className="tv-dots"><span /><span /><span /><span /><span /></div>
      </div>

      <div className="tv-photo-row tv-photo-row--mid">
        <div className="tv-tile tv-e3">
          <div className="tv-screen tv-screen--mask" />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e3b">
          <SmallSlotScreen content={e3bContent} />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e10">
          <div className="tv-screen tv-screen--static-gold" />
          <div className="tv-dots"><span /><span /></div>
        </div>
      </div>

      <div className="tv-tile tv-button-tile">
        <button className="tv-screen tv-button-screen" type="submit" disabled={pending}>
          <span className="tv-btn-label">
            {pending ? "Finding…" : "Find Club"}
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="tv-ticket-no tv-ticket-no--button">No. 000112</span>
        </button>
        <div className="tv-dots"><span /><span /><span /></div>
      </div>

      <div className="tv-tile tv-footnote-tile">
        <div className="tv-screen"><p className="tv-footnote-text">Codes are six characters — letters and numbers only.</p></div>
        <div className="tv-dots"><span /><span /></div>
      </div>
    </form>
  );
}
