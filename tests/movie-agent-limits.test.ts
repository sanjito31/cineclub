import assert from "node:assert/strict";
import test from "node:test";
import { MOVIE_AGENT_LIMITS, movieAgentLimitError } from "../lib/domain/movie-agent-limits";

const underLimits = { conversationTurns: 0, turnsLastHour: 0, tokensLastDay: 0 };

test("movie bot allows messages under every limit", () => {
  assert.equal(movieAgentLimitError(underLimits), null);
  assert.equal(movieAgentLimitError({
    conversationTurns: MOVIE_AGENT_LIMITS.turnsPerConversation - 1,
    turnsLastHour: MOVIE_AGENT_LIMITS.turnsPerHour - 1,
    tokensLastDay: MOVIE_AGENT_LIMITS.tokensPerDay - 1,
  }), null);
});

test("movie bot blocks each limit once it is reached", () => {
  assert.match(
    movieAgentLimitError({ ...underLimits, tokensLastDay: MOVIE_AGENT_LIMITS.tokensPerDay }) ?? "",
    /for today/,
  );
  assert.match(
    movieAgentLimitError({ ...underLimits, turnsLastHour: MOVIE_AGENT_LIMITS.turnsPerHour }) ?? "",
    /too quickly/,
  );
  assert.match(
    movieAgentLimitError({ ...underLimits, conversationTurns: MOVIE_AGENT_LIMITS.turnsPerConversation }) ?? "",
    /new chat/,
  );
});

test("movie bot reports the daily budget before a long conversation", () => {
  assert.match(movieAgentLimitError({
    conversationTurns: MOVIE_AGENT_LIMITS.turnsPerConversation,
    turnsLastHour: 0,
    tokensLastDay: MOVIE_AGENT_LIMITS.tokensPerDay,
  }) ?? "", /for today/);
});
