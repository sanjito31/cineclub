// Movie bot guardrails. The hourly cap stops bursts, the daily token budget caps
// spend, and the conversation cap keeps each request's context from growing forever.
export const MOVIE_AGENT_LIMITS = {
  turnsPerConversation: 20,
  turnsPerHour: 20,
  tokensPerDay: 1_000_000,
};

export type MovieAgentUsage = {
  conversationTurns: number;
  turnsLastHour: number;
  tokensLastDay: number;
};

// Why the user can't send another message right now, or null if they can
export function movieAgentLimitError(usage: MovieAgentUsage): string | null {
  if (usage.tokensLastDay >= MOVIE_AGENT_LIMITS.tokensPerDay) {
    return "You've used up the movie bot for today. Try again later.";
  }
  if (usage.turnsLastHour >= MOVIE_AGENT_LIMITS.turnsPerHour) {
    return "You're sending messages too quickly. Try again in a little while.";
  }
  if (usage.conversationTurns >= MOVIE_AGENT_LIMITS.turnsPerConversation) {
    return "This conversation is getting long. Start a new chat to keep going.";
  }
  return null;
}
