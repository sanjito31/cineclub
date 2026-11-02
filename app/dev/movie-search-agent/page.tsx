// TEMP: remove before merging. Bare-bones page for trying the movie search agent.
"use client";

import { useState, type FormEvent } from "react";
import type { Msg } from "@/lib/llm";

type ChatLine = { role: "user" | "assistant" | "error"; text: string };

type AgentEvent =
  | { type: "status"; text: string }
  | { type: "done"; reply: string; history: Msg[] }
  | { type: "error"; error: string };

export default function MovieSearchAgentPage() {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyHistory() {
    await navigator.clipboard.writeText(JSON.stringify(history, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || pending) return;

    setInput("");
    setPending(true);
    setStatus("Thinking…");
    setLines((prev) => [...prev, { role: "user", text: message }]);

    const response = await fetch("/api/dev/movie-search-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });

    // The endpoint streams one JSON event per line; a chunk can end mid-line
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const completeLines = buffered.split("\n");
      buffered = completeLines.pop() ?? "";
      for (const line of completeLines.filter(Boolean)) {
        const agentEvent = JSON.parse(line) as AgentEvent;
        if (agentEvent.type === "status") {
          setStatus(agentEvent.text);
        } else if (agentEvent.type === "done") {
          setHistory(agentEvent.history);
          setLines((prev) => [...prev, { role: "assistant", text: agentEvent.reply }]);
        } else {
          setLines((prev) => [...prev, { role: "error", text: agentEvent.error }]);
        }
      }
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
        {pending && <p className="animate-pulse text-gray-500">{status}</p>}
      </div>

      <details className="rounded border border-gray-300 p-2">
        <summary className="cursor-pointer text-sm font-semibold">
          Raw history ({history.length} messages)
        </summary>
        <button
          type="button"
          onClick={copyHistory}
          disabled={history.length === 0}
          className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
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
