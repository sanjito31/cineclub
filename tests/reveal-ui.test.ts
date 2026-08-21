import assert from "node:assert/strict";
import test from "node:test";
import { RoomPhase } from "../app/generated/prisma/enums";
import {
  parseRevealPayload,
  payloadContainsUnrevealedIdentity,
  toRevealClientContext,
} from "../app/rooms/[code]/reveal-contracts";

const revealed = {
  roomMovieId: "movie-1",
  title: "Heat",
  releaseYear: 1995,
  posterPath: "/heat.jpg",
  letterboxdRating: 4.2,
  letterboxdSlug: "heat",
  nominators: [{ participantId: "p1", displayName: "Ada" }],
  revealedAt: "2026-08-21T12:00:00.000Z",
  revealPosition: 1,
};

test("client reveal context keeps unrevealed identity out of the payload", () => {
  const context = toRevealClientContext({
    roomId: "room-1",
    code: "ABC234",
    name: "Friday night",
    phase: RoomPhase.REVEAL,
    isOwner: true,
    totalFinalists: 2,
    revealedCount: 1,
    remainingCount: 1,
    revealed: [revealed],
    nextReveal: {
      revealPosition: 2,
      cooldownEndsAt: "2026-08-22T12:00:00.000Z",
      isOnCooldown: true,
    },
  });

  assert.equal(context.revealed[0]?.letterboxdUrl, "https://letterboxd.com/film/heat/");
  assert.equal(context.nextReveal?.isOnCooldown, true);
  assert.equal(payloadContainsUnrevealedIdentity(context, "SECRET TITLE"), false);

  const parsed = parseRevealPayload({
    ...context,
    leftoverTitle: "SECRET TITLE",
  });
  assert.ok(parsed);
  assert.equal(parsed.revealed.length, 1);
  assert.equal(parsed.nextReveal?.revealPosition, 2);
});
