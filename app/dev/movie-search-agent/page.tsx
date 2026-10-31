// TEMP: remove before merging. Bare-bones page for trying the movie search agent.
"use client";

import { useState, type FormEvent } from "react";
import type { Msg } from "@/lib/llm";

type ChatLine = { role: "user" | "assistant" | "error"; text: string };

export default function MovieSearchAgentPage() {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || pending) return;

    setInput("");
    setPending(true);
    setLines((prev) => [...prev, { role: "user", text: message }]);

    const response = await fetch("/api/dev/movie-search-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    const body = await response.json();

    if (response.ok) {
      setHistory(body.history);
      setLines((prev) => [...prev, { role: "assistant", text: body.reply }]);
    } else {
      setLines((prev) => [...prev, { role: "error", text: body.error }]);
    }
    setPending(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 bg-white p-4 text-black">
      <h1 className="text-xl font-bold">Movie search agent (dev)</h1>

      <div className="flex flex-1 flex-col gap-3">
        {lines.map((line, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap rounded p-3 ${
              line.role === "user"
                ? "self-end bg-blue-100"
                : line.role === "error"
                  ? "bg-red-100 text-red-800"
                  : "bg-gray-100"
            }`}
          >
            {line.text}
          </p>
        ))}
        {pending && <p className="text-gray-500">Searching…</p>}
      </div>

      <details className="rounded border border-gray-300 p-2">
        <summary className="cursor-pointer text-sm font-semibold">
          Raw history ({history.length} messages)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto text-xs">
          {JSON.stringify(history, null, 2)}
        </pre>
      </details>

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe a movie…"
          className="flex-1 rounded border border-gray-300 p-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
