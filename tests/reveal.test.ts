import assert from "node:assert/strict";
import test from "node:test";
import { RoomPhase } from "../app/generated/prisma/enums";
import {
  assertRevealAllowed,
  buildSpoilerSafeRevealView,
  lastRevealedFinalist,
  nextUnrevealedFinalist,
  REVEAL_COOLDOWN_MS,
  RevealError,
  revealCooldownEndsAt,
  scheduleFinalistReveals,
  scheduledRevealAtForFinalist,
} from "../lib/domain/reveal";

const finalizedAt = new Date("2026-08-21T12:00:00.000Z");

function row(
  roomMovieId: string,
  extras: {
    isFinalist?: boolean;
    finalOrder?: number | null;
    scheduledRevealAt?: Date | null;
    revealedAt?: Date | null;
    title?: string;
  } = {},
) {
  return {
    roomMovieId,
    isFinalist: extras.isFinalist ?? true,
    finalOrder: extras.finalOrder ?? null,
    scheduledRevealAt: extras.scheduledRevealAt ?? null,
    revealedAt: extras.revealedAt ?? null,
    movie: extras.title
      ? {
          title: extras.title,
          releaseYear: 1995,
          posterPath: `/${roomMovieId}.jpg`,
          letterboxdRating: 4.2,
          letterboxdSlug: roomMovieId,
          nominators: [{ participantId: "p1", displayName: "Ada" }],
        }
      : null,
  };
}

test("finalists are scheduled 24 hours apart from finalization", () => {
  const schedule = scheduleFinalistReveals(
    [
      { roomMovieId: "heat", isFinalist: true, finalOrder: 1 },
      { roomMovieId: "drive", isFinalist: true, finalOrder: 2 },
      { roomMovieId: "extra", isFinalist: false, finalOrder: null },
    ],
    finalizedAt,
  );

  assert.equal(schedule.heat?.toISOString(), finalizedAt.toISOString());
  assert.equal(
    schedule.drive?.toISOString(),
    scheduledRevealAtForFinalist(finalizedAt, 2).toISOString(),
  );
  assert.equal(schedule.extra ?? null, null);
  assert.equal(REVEAL_COOLDOWN_MS, 24 * 60 * 60 * 1000);
});

test("next unrevealed finalist follows final order and ignores non-finalists", () => {
  const results = [
    row("extra", { isFinalist: false, title: "Secret Extra" }),
    row("drive", { finalOrder: 2, title: "Drive" }),
    row("heat", {
      finalOrder: 1,
      revealedAt: finalizedAt,
      title: "Heat",
    }),
  ];

  assert.equal(nextUnrevealedFinalist(results)?.roomMovieId, "drive");
  assert.equal(lastRevealedFinalist(results)?.roomMovieId, "heat");
});

test("cooldown uses the later of the stored schedule and 24 hours after the previous reveal", () => {
  const previousRevealedAt = new Date("2026-08-21T18:00:00.000Z");
  const scheduledRevealAt = new Date("2026-08-22T12:00:00.000Z");

  const fromLateReveal = revealCooldownEndsAt({
    scheduledRevealAt,
    previousRevealedAt,
  });
  assert.equal(
    fromLateReveal?.toISOString(),
    new Date(previousRevealedAt.getTime() + REVEAL_COOLDOWN_MS).toISOString(),
  );

  const onSchedule = revealCooldownEndsAt({
    scheduledRevealAt,
    previousRevealedAt: finalizedAt,
  });
  assert.equal(onSchedule?.toISOString(), scheduledRevealAt.toISOString());
});

test("early reveals require confirmation instead of being blocked", () => {
  const cooldownEndsAt = new Date("2026-08-22T12:00:00.000Z");
  const now = new Date("2026-08-21T13:00:00.000Z");

  assert.throws(
    () =>
      assertRevealAllowed({
        cooldownEndsAt,
        now,
        confirmEarlyReveal: false,
      }),
    (error: unknown) => {
      assert.ok(error instanceof RevealError);
      assert.equal(error.code, "COOLDOWN_UNCONFIRMED");
      return true;
    },
  );

  assert.doesNotThrow(() =>
    assertRevealAllowed({
      cooldownEndsAt,
      now,
      confirmEarlyReveal: true,
    }),
  );
});

test("spoiler-safe views omit unrevealed titles, posters, and ordering details", () => {
  const view = buildSpoilerSafeRevealView({
    phase: RoomPhase.REVEAL,
    now: finalizedAt,
    results: [
      row("heat", {
        finalOrder: 1,
        scheduledRevealAt: finalizedAt,
        revealedAt: finalizedAt,
        title: "Heat",
      }),
      row("secret", {
        finalOrder: 2,
        scheduledRevealAt: scheduledRevealAtForFinalist(finalizedAt, 2),
        title: "SECRET TITLE",
      }),
    ],
  });

  assert.equal(view.revealed.length, 1);
  assert.equal(view.revealed[0]?.title, "Heat");
  assert.equal(view.remainingCount, 1);
  assert.equal(view.nextReveal?.revealPosition, 2);
  assert.equal(view.nextReveal?.isOnCooldown, true);
  assert.equal(JSON.stringify(view).includes("SECRET TITLE"), false);
  assert.equal(JSON.stringify(view).includes("/secret.jpg"), false);
  assert.equal(JSON.stringify(view).includes("\"roomMovieId\":\"secret\""), false);
});
