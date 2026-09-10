import Link from "next/link";
import { JoinCodeForm } from "@/app/join/join-code-form";

export default function JoinPage() {
  return (
    <main className="tv-page tv-page--join">
      <div className="tv-page-header">
        <Link className="back-link" href="/">← Back</Link>
      </div>
      <JoinCodeForm />
    </main>
  );
}
