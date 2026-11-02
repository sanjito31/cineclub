"use client";

import { useState, type ReactNode } from "react";
import { parseSelectionMovie, type SelectionMovie } from "@/app/rooms/[code]/selection-contracts";
import type { Msg } from "@/lib/llm";

const MOVIES_PER_PAGE = 5;

type ChatEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; movies: SelectionMovie[]; page: number }
  | { role: "error"; text: string };

type AgentEvent =
  | { type: "status"; text: string }
  | { type: "done"; text: string; movies: unknown[]; history: Msg[] }
  | { type: "error"; error: string };

// Chat with the movie search agent. Each reply's picks are shown 5 at a time,
// and renderMovie draws a pick the same way as a manual search result.
export function MovieAgentChat({ endpoint, renderMovie }: {
  endpoint: string;
  renderMovie: (movie: SelectionMovie) => ReactNode;
}) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  // The agent's full transcript, including tool calls; the server is stateless
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const pending = status !== null;

  function handleEvent(agentEvent: AgentEvent) {
    if (agentEvent.type === "status") {
      setStatus(agentEvent.text);
    } else if (agentEvent.type === "done") {
      const movies = agentEvent.movies
        .map(parseSelectionMovie)
        .filter((movie): movie is SelectionMovie => movie !== null);
      setHistory(agentEvent.history);
      setEntries((current) => [...current, { role: "assistant", text: agentEvent.text, movies, page: 1 }]);
    } else {
      setEntries((current) => [...current, { role: "error", text: agentEvent.error }]);
    }
  }

  async function sendMessage() {
    const message = input.trim();
    if (!message || pending) return;

    setInput("");
    setStatus("Thinking…");
    setEntries((current) => [...current, { role: "user", text: message }]);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "The movie bot is unavailable right now.");
      }

      // One JSON event per line; a chunk can end mid-line
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const completeLines = buffered.split("\n");
        buffered = completeLines.pop() ?? "";
        for (const line of completeLines.filter(Boolean)) {
          const agentEvent = JSON.parse(line) as AgentEvent;
          if (agentEvent.type !== "status") finished = true;
          handleEvent(agentEvent);
        }
      }
      if (!finished) throw new Error("The movie bot stopped responding. Please try again.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "The movie bot is unavailable right now.";
      setEntries((current) => [...current, { role: "error", text }]);
    } finally {
      setStatus(null);
    }
  }

  function showPage(entryIndex: number, page: number) {
    setEntries((current) => current.map((entry, index) =>
      index === entryIndex && entry.role === "assistant" ? { ...entry, page } : entry));
  }

  return (
    <section className="movie-agent" aria-labelledby="movie-agent-heading">
      <div className="selection-section-heading"><div>
        <span className="eyebrow">Need ideas?</span>
        <h3 id="movie-agent-heading">Ask the movie bot</h3>
        <p className="movie-agent-intro">Describe what you&rsquo;re in the mood for. It knows your group&rsquo;s Letterboxd accounts, so it can skip movies you&rsquo;ve seen.</p>
      </div></div>

      {entries.length > 0 ? <ol className="movie-agent-thread" aria-live="polite">{entries.map((entry, entryIndex) => {
        if (entry.role !== "assistant") {
          return <li key={entryIndex} className={`movie-agent-message is-${entry.role}`}>{entry.text}</li>;
        }
        const totalPages = Math.ceil(entry.movies.length / MOVIES_PER_PAGE);
        const visibleMovies = entry.movies.slice((entry.page - 1) * MOVIES_PER_PAGE, entry.page * MOVIES_PER_PAGE);
        return <li key={entryIndex} className="movie-agent-message is-assistant">
          {entry.text ? <p>{entry.text}</p> : null}
          {visibleMovies.length > 0 ? <ul className="movie-result-list" aria-label="Movie bot picks">
            {visibleMovies.map((movie) => <li key={movie.tmdbId}>{renderMovie(movie)}</li>)}
          </ul> : null}
          {totalPages > 1 ? <div className="movie-search-pagination">
            <button className="button button-secondary button-compact" type="button" disabled={entry.page <= 1} onClick={() => showPage(entryIndex, entry.page - 1)}>Previous</button>
            <span>Page {entry.page} of {totalPages}</span>
            <button className="button button-secondary button-compact" type="button" disabled={entry.page >= totalPages} onClick={() => showPage(entryIndex, entry.page + 1)}>Next</button>
          </div> : null}
        </li>;
      })}</ol> : null}

      {status ? <p className="movie-agent-status" role="status"><span className="status-spinner" aria-hidden="true" /> {status}</p> : null}

      <div className="movie-agent-compose">
        <label className="sr-only" htmlFor="movie-agent-input">Ask the movie bot</label>
        <input id="movie-agent-input" value={input} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // This sits inside the selections form, so Enter must not submit it
            if (event.key === "Enter") { event.preventDefault(); void sendMessage(); }
          }}
          placeholder="e.g. best horror from the last 10 years none of us have seen" maxLength={1000} autoComplete="off" />
        <button className="button button-secondary button-compact" type="button" disabled={pending || !input.trim()} onClick={() => void sendMessage()}>
          Ask
        </button>
      </div>
    </section>
  );
}
