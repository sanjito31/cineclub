import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";
import type { MovieAgentUsage } from "@/lib/domain/movie-agent-limits";
import type { Msg, Usage } from "@/lib/llm";
import { prisma } from "@/lib/prisma";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// The conversation's messages so far, and how much of the movie bot this user
// has used recently. Turns are matched on room and user too, so a conversation id
// from someone else's chat loads nothing.
export async function loadMovieAgentConversation(input: {
  conversationId: string;
  roomId: string;
  userId: string;
  now: Date;
}): Promise<{ history: Msg[]; usage: MovieAgentUsage }> {
  const { conversationId, roomId, userId, now } = input;
  const [turns, turnsLastHour, lastDay] = await Promise.all([
    prisma.movieAgentTurn.findMany({
      where: { conversationId, roomId, userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { messages: true },
    }),
    prisma.movieAgentTurn.count({
      where: { userId, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
    }),
    prisma.movieAgentTurn.aggregate({
      where: { userId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);

  return {
    history: turns.flatMap((turn) => turn.messages as Msg[]),
    usage: {
      conversationTurns: turns.length,
      turnsLastHour,
      tokensLastDay: (lastDay._sum.inputTokens ?? 0) + (lastDay._sum.outputTokens ?? 0),
    },
  };
}

// Recorded before the agent runs so a turn that fails still counts toward the limits
export async function startMovieAgentTurn(input: { conversationId: string; roomId: string; userId: string }) {
  const turn = await prisma.movieAgentTurn.create({ data: input, select: { id: true } });
  return turn.id;
}

// messages is empty when the turn failed, so it drops out of the conversation
export async function finishMovieAgentTurn(turnId: string, result: { messages: Msg[]; usage: Usage }) {
  await prisma.movieAgentTurn.update({
    where: { id: turnId },
    data: {
      messages: result.messages as unknown as Prisma.InputJsonValue,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  });
}
