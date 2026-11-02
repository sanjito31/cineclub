import { noStoreJson, requireRoomMemberApi } from "@/app/api/rooms/[code]/member-request";
import { toRoomSelectionMovies } from "@/app/api/rooms/[code]/movies/room-selection-movies";
import { RoomPhase } from "@/app/generated/prisma/enums";
import { collectRoomLetterboxdMembers } from "@/lib/domain/watchboxd-selection";
import { createMovieSearchAgent, splitAgentReply } from "@/lib/llm/agents/movie-search";
import type { Msg } from "@/lib/llm";
import { getTmdbMovie } from "@/lib/tmdb/client";

const MAX_MESSAGE_LENGTH = 1_000;
const MAX_HISTORY_MESSAGES = 100;

type RoomParticipants = Parameters<typeof collectRoomLetterboxdMembers>[0];

// The members' Letterboxd usernames filter every search by default; the context
// tells the agent that, and whose history "I" refers to so it can narrow the filter
function roomForAgent(roomName: string, participants: RoomParticipants, currentUserId: string) {
  const members = collectRoomLetterboxdMembers(participants);
  const asker = members.find((member) => member.userId === currentUserId);
  const memberList = members.map((member) => `${member.displayName} (${member.letterboxdUsername})`).join(", ");

  const context = [
    `You're helping a member of the movie club "${roomName}" choose movies to nominate.`,
    members.length > 0
      ? `Members' Letterboxd usernames: ${memberList}. Searches automatically leave out movies any of them has watched. Only pass excludeWatchedBy to change that: just the person chatting's username for "movies I haven't seen", or [] when they're open to rewatches.`
      : "No members have linked a Letterboxd account, so watched history isn't available.",
    asker
      ? `The person chatting is ${asker.displayName}; "I" or "me" means ${asker.letterboxdUsername}.`
      : "The person chatting hasn't linked a Letterboxd account.",
  ].join("\n");

  return { context, letterboxdUsernames: members.map((member) => member.letterboxdUsername) };
}

// Streams newline-delimited JSON events: { type: "status", text } while the agent
// works, then one { type: "done", text, movies, history } or { type: "error", error }.
// movies are room selection cards for the TMDB ids the agent's reply marked.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const access = await requireRoomMemberApi((await params).code);
  if (!access.ok) return access.error;
  if (access.room.phase !== RoomPhase.SELECTION) {
    return noStoreJson({ error: "Movie selection is closed for this room." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { message?: unknown; history?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const history = body?.history ?? [];
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return noStoreJson({ error: `Messages must be 1 to ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
  }
  if (!Array.isArray(history) || history.length > MAX_HISTORY_MESSAGES) {
    return noStoreJson({ error: "This conversation is too long. Start a new one." }, { status: 400 });
  }

  const { room, user } = access;
  const agent = createMovieSearchAgent(roomForAgent(room.name, room.participants, user.id));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await agent.handleMessage(history as Msg[], message, {
          onStatus: (text) => send({ type: "status", text }),
        });
        const { text, tmdbIds } = splitAgentReply(result.reply);

        send({ type: "status", text: "Pulling posters and details…" });
        const tmdbMovies = await Promise.all(
          tmdbIds.map((tmdbId) => getTmdbMovie(tmdbId, { signal: request.signal }).catch(() => null)),
        );
        const movies = await toRoomSelectionMovies({
          roomId: room.id,
          participants: room.participants,
          currentUserId: user.id,
          movies: tmdbMovies.filter((movie) => movie !== null),
          signal: request.signal,
        });
        send({ type: "done", text, movies, history: result.history });
      } catch (error) {
        console.error("[movie-agent] failed", error);
        send({ type: "error", error: "The movie bot couldn't answer right now. Please try again." });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "private, no-store" },
  });
}
