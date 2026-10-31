// TEMP: remove before merging. Unauthenticated endpoint for trying the movie search agent.
import { createMovieSearchAgent } from "@/lib/llm/agents/movie-search";
import type { Msg } from "@/lib/llm";

export async function POST(request: Request) {
  const { message, history } = (await request.json()) as {
    message: string;
    history?: Msg[];
  };

  try {
    const previous = history ?? [];
    const result = await createMovieSearchAgent().handleMessage(previous, message);

    // Everything this turn added: the user message, tool calls, tool results, final reply
    const newMessages = result.history.slice(previous.length);
    console.log(
      `[movie-search-agent] turn added ${newMessages.length} messages (history now ${result.history.length}):\n`,
      JSON.stringify(newMessages, null, 2),
    );

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
