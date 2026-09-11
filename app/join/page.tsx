import { JoinCodeForm } from "@/app/join/join-code-form";
import { BackButton } from "@/app/components/back-button";
import { GlobalMenu } from "@/app/components/global-menu";

// Same seamless-loop marquee phrase used for the home page's animated
// border -- two copies so the scroll animation (translate by -50% of the
// pair's own size) loops without a visible seam.
const BORDER_PHRASE = "STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ STOP SCROLLING. START WATCHING. ★ ";

function BorderEdge({ edge }: { edge: "top" | "bottom" | "left" | "right" }) {
  return (
    <div className={`hero-frame-edge hero-frame-edge--${edge}`} aria-hidden="true">
      <div className="hero-frame-track">
        <span>{BORDER_PHRASE}</span>
        <span>{BORDER_PHRASE}</span>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <main className="tv-page tv-page--join">
      <BackButton href="/" />
      <GlobalMenu />
      <div className="tv-frame tv-frame--join">
        <BorderEdge edge="top" />
        <BorderEdge edge="bottom" />
        <BorderEdge edge="left" />
        <BorderEdge edge="right" />
        <JoinCodeForm />
      </div>
    </main>
  );
}
