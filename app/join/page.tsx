import Link from "next/link";
import { JoinCodeForm } from "@/app/join/join-code-form";

export default function JoinPage() {
  return (
    <main className="centered-page">
      <section className="auth-card">
        <Link className="back-link" href="/">← Home</Link>
        <span className="eyebrow">Join your friends</span>
        <h1>Enter the room code</h1>
        <p className="lede">You’ll confirm the room and sign in before taking a seat.</p>
        <JoinCodeForm />
      </section>
    </main>
  );
}
