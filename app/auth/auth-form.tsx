"use client";

import { useActionState } from "react";
import { sendMagicLink, type MagicLinkActionState } from "@/app/actions/auth";
import { ActionMessage } from "@/app/components/action-message";
import { SubmitButton } from "@/app/components/submit-button";
import { BrandMark } from "@/app/components/brand-mark";
import { EyeTile } from "@/app/components/eye-tile";

const initialState: MagicLinkActionState = { status: "idle" };

function BrandTile() {
  return (
    <div className="tv-tile tv-logo">
      <div className="tv-screen">
        <span className="tv-brand-lockup">
          <span className="tv-brand-mark-wrap"><BrandMark width={36} height={38} /></span>
          <span className="tv-brand-word">INECLUB</span>
        </span>
      </div>
      <div className="tv-dots"><span /><span /><span /></div>
    </div>
  );
}

export function AuthForm({ next }: { next: string }) {
  const [state, action] = useActionState(sendMagicLink, initialState);

  if (state.linkSent && state.email) {
    return (
      <div className="tv-wall tv-wall--sent" role="status">
        <div className="tv-bleed is-h" style={{ top: "17.4%", background: "linear-gradient(90deg, #3d8b9c 0 16%, #a59723 16% 34%, #a83d80 34% 52%, #317133 52% 70%, #202657 70% 86%, #8f1820 86% 100%)" }} />
        <div className="tv-bleed is-h" style={{ top: "29%", background: "linear-gradient(90deg, #a59723 0 22%, #8f1820 22% 44%, #317133 44% 66%, #3d8b9c 66% 100%)", opacity: .4 }} />
        <div className="tv-bleed is-h" style={{ top: "50%", background: "linear-gradient(90deg, #a83d80 0 20%, #a59723 20% 40%, #202657 40% 60%, #8f1820 60% 80%, #317133 80% 100%)" }} />
        <div className="tv-bleed is-h" style={{ top: "82.6%", background: "linear-gradient(90deg, #3d8b9c 0 18%, #8f1820 18% 38%, #a59723 38% 58%, #317133 58% 78%, #202657 78% 100%)" }} />
        <div className="tv-bleed is-v" style={{ left: "33.8%", background: "linear-gradient(180deg, #8f1820 0 25%, #3d8b9c 25% 50%, #a59723 50% 75%, #8a5389 75% 100%)" }} />
        <div className="tv-bleed is-v" style={{ left: "66.2%", background: "linear-gradient(180deg, #317133 0 30%, #8f1820 30% 55%, #a59723 55% 80%, #a83d80 80% 100%)" }} />

        <div className="tv-marquee">
          <span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" />
          <span className="tv-marquee-label">● Stand By</span>
          <span className="tv-bulb" /><span className="tv-bulb" />
        </div>

        <BrandTile />

        <div className="tv-tile tv-e1">
          <div className="tv-screen tv-screen--golconda" />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e2">
          <div className="tv-screen tv-screen--glasses" />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-headline-tile">
          <div className="tv-screen">
            <h1 className="tv-headline-text">Check Your<br />Email</h1>
            <p className="tv-headline-lede">
              Your ticket is in your inbox — <strong>{state.email}</strong>. Open it on this device to
              continue.
            </p>
            <div className="tv-ident-strip" />
            <div className="tv-dot-strip tv-dot-strip--sent" />
          </div>
          <div className="tv-dots"><span /><span /><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-e3">
          <div className="tv-screen tv-halftone tv-screen--gold-eye">
            <EyeTile iris="gold" />
          </div>
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-envelope-tile">
          <div className="tv-screen">
            <div className="tv-sent-badge">
              <svg className="tv-envelope-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="1.5" stroke="#f4ede1" strokeWidth={1.6} />
                <path d="M3 6l9 6.5L21 6" stroke="#f4ede1" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="tv-sent-dot">
                <svg viewBox="0 0 24 24" fill="#14100c" aria-hidden="true">
                  <path d="M12 2l2.6 6.4L21 9l-5 4.6L17.4 21 12 17.3 6.6 21 8 13.6 3 9l6.4-.6L12 2z" />
                </svg>
              </div>
            </div>
            <p className="tv-sent-label">Ticket Sent</p>
            <span className="tv-ticket-no tv-ticket-no--envelope">No. 048213</span>
          </div>
          <div className="tv-dots"><span /><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-relink-tile">
          <a className="tv-screen tv-relink-screen tv-screen--hatstack" href={`/auth?next=${encodeURIComponent(state.next ?? next)}`}>
            <span className="tv-relink-label">← Send To a<br />Different Email</span>
          </a>
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-mask-tile">
          <div className="tv-screen tv-screen--mask" />
          <div className="tv-dots"><span /><span /><span /></div>
        </div>

        <div className="tv-tile tv-footnote-tile">
          <div className="tv-screen"><p className="tv-footnote-text">Didn&rsquo;t land in a minute? Check spam before requesting a new one.</p></div>
          <div className="tv-dots"><span /><span /></div>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="tv-wall tv-wall--idle">
      <input name="next" type="hidden" value={next} />

      <div className="tv-bleed is-h" style={{ top: "17.4%", background: "linear-gradient(90deg, #a59723 0 16%, #3d8b9c 16% 34%, #317133 34% 52%, #a83d80 52% 70%, #8f1820 70% 86%, #202657 86% 100%)" }} />
      <div className="tv-bleed is-h" style={{ top: "29%", background: "linear-gradient(90deg, #8f1820 0 22%, #f0c74e 22% 44%, #3d8b9c 44% 66%, #8a5389 66% 100%)", opacity: .4 }} />
      <div className="tv-bleed is-h" style={{ top: "50%", background: "linear-gradient(90deg, #202657 0 20%, #a83d80 20% 40%, #8f1820 40% 60%, #a59723 60% 80%, #3d8b9c 80% 100%)" }} />
      <div className="tv-bleed is-h" style={{ top: "82.6%", background: "linear-gradient(90deg, #317133 0 18%, #a59723 18% 38%, #3d8b9c 38% 58%, #8f1820 58% 78%, #8a5389 78% 100%)" }} />
      <div className="tv-bleed is-v" style={{ left: "33.8%", background: "linear-gradient(180deg, #a59723 0 25%, #317133 25% 50%, #8f1820 50% 75%, #3d8b9c 75% 100%)" }} />
      <div className="tv-bleed is-v" style={{ left: "66.2%", background: "linear-gradient(180deg, #a83d80 0 30%, #f0c74e 30% 55%, #202657 55% 80%, #317133 80% 100%)" }} />

      <div className="tv-marquee">
        <span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" /><span className="tv-bulb" />
        <span className="tv-marquee-label">● On Air</span>
        <span className="tv-bulb" /><span className="tv-bulb" />
      </div>

      <BrandTile />

      <div className="tv-tile tv-e1">
        <div className="tv-screen tv-screen--theater" />
        <div className="tv-dots"><span /><span /><span /></div>
      </div>

      <div className="tv-tile tv-e1b">
        <div className="tv-screen tv-screen--juggler" />
        <div className="tv-dots"><span /><span /><span /></div>
      </div>

      <div className="tv-tile tv-e2">
        <div className="tv-screen tv-halftone tv-screen--red-eye">
          <EyeTile iris="red" />
        </div>
        <div className="tv-dots"><span /><span /><span /></div>
      </div>

      <div className="tv-tile tv-headline-tile">
        <div className="tv-screen">
          <h1 className="tv-headline-text">Sign In<br />With Email</h1>
          <p className="tv-headline-lede">One link, no password. We&rsquo;ll email you a ticket straight to this seat.</p>
          <div className="tv-ident-strip" />
          <div className="tv-dot-strip" />
        </div>
        <div className="tv-dots"><span /><span /><span /><span /><span /></div>
      </div>

      <div className="tv-tile tv-e3">
        <div className="tv-screen tv-halftone tv-screen--green-eye">
          <EyeTile iris="green" />
        </div>
        <div className="tv-dots"><span /><span /><span /></div>
      </div>

      <div className="tv-tile tv-input-tile">
        <div className="tv-screen">
          <label htmlFor="email" className="tv-input-label">Your Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            defaultValue={state.email}
            required
            autoFocus
            className="tv-input-field"
          />
          <ActionMessage status={state.status} message={state.message} />
        </div>
        <div className="tv-dots"><span /><span /><span /><span /></div>
      </div>

      <div className="tv-tile tv-button-tile">
        <SubmitButton className="tv-screen tv-button-screen" pendingLabel="Sending…">
          <span className="tv-btn-label">
            Email My Ticket
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="tv-ticket-no tv-ticket-no--button">No. 048213</span>
        </SubmitButton>
        <div className="tv-dots"><span /><span /><span /></div>
      </div>

      <div className="tv-tile tv-footnote-tile">
        <div className="tv-screen"><p className="tv-footnote-text">No password. New emails create an account automatically.</p></div>
        <div className="tv-dots"><span /><span /></div>
      </div>
    </form>
  );
}
