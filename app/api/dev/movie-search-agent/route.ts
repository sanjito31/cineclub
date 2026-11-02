// TEMP: remove before merging. Unauthenticated endpoint for trying the movie search agent.
import { createMovieSearchAgent } from "@/lib/llm/agents/movie-search";
import type { Msg } from "@/lib/llm";

// Streams newline-delimited JSON events: { type: "status", text } while the
// agent works, then one { type: "done", reply, history } or { type: "error", error }
export async function POST(request: Request) {
  const { message, history } = (await request.json()) as { message: string; history?: Msg[] };
  const previous = history ?? [];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await createMovieSearchAgent().handleMessage(previous, message, {
          onStatus: (text) => send({ type: "status", text }),
        });
        // Everything this turn added: the user message, tool calls, tool results, final reply
        const newMessages = result.history.slice(previous.length);
        console.log(
          `[movie-search-agent] turn added ${newMessages.length} messages (history now ${result.history.length}):\n`,
          JSON.stringify(newMessages, null, 2),
        );
        send({ type: "done", ...result });
      } catch (error) {
        send({ type: "error", error: String(error) });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
