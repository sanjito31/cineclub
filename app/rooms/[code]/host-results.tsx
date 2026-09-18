"use client";

import { useState } from "react";
import type { HostResults } from "@/lib/data/host-results";

export function HostResultsPanel({ results }: { results: HostResults }) {
  const [orderId, setOrderId] = useState("OFFICIAL");
  const order = results.orders.find(({ id }) => id === orderId) ?? results.orders[0];
  const moviesById = new Map(results.finalists.map((movie) => [movie.roomMovieId, movie]));

  return (
    <section className="panel host-results-panel" aria-labelledby="host-results-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Host only · All finalists</span>
          <h2 id="host-results-heading">Finalist results</h2>
        </div>
        <span className="host-results-official">Official: {results.officialOrderingLabel}</span>
      </div>
      <p className="muted-copy">
        Preview every finalist, including movies still waiting to be revealed.
        Changing this view keeps the official reveal order intact.
      </p>
      {results.finalists.length === 0 ? (
        <p>No finalists were selected for this club.</p>
      ) : (
        <>
          <div className="host-results-order">
            <label htmlFor="host-results-order">View order</label>
            <select
              id="host-results-order"
              className="setting-select"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              aria-describedby="host-results-order-description"
            >
              {results.orders.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <p id="host-results-order-description" className="muted-copy" aria-live="polite">
            {order.description}
          </p>
          <div className="host-results-table-scroll" role="region" aria-label="Finalist rankings" tabIndex={0}>
            <table className="host-results-table">
              <caption>{order.label} · {results.finalists.length} finalists</caption>
              <thead>
                <tr>
                  <th scope="col">Position</th>
                  <th scope="col">Movie</th>
                  <th scope="col">Finalist rank</th>
                  <th scope="col">Score</th>
                  <th scope="col">Votes</th>
                </tr>
              </thead>
              <tbody>
                {order.movieIds.map((movieId, index) => {
                  const movie = moviesById.get(movieId)!;
                  return (
                    <tr key={movieId}>
                      <td>{index + 1}</td>
                      <th scope="row">
                        <strong>{movie.title}{movie.releaseYear ? ` (${movie.releaseYear})` : ""}</strong>
                        <small>{movie.revealed ? "Revealed" : "Unrevealed"}</small>
                      </th>
                      <td>
                        <strong>#{movie.finalistRank}</strong>
                        <small>#{movie.aggregateRank} overall</small>
                      </td>
                      <td>{movie.score}</td>
                      <td>{movie.voteCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted-copy host-results-legend">
            Finalist rank is relative to the other finalists; overall rank includes all nominated movies.
            Score is the total ranked ballot points, with ties already resolved.
            Vote count includes every ballot that ranked the movie at any position.
          </p>
        </>
      )}
    </section>
  );
}
