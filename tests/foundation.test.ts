import assert from "node:assert/strict";
import test from "node:test";
import { RoomPhase } from "../app/generated/prisma/enums";
import { categorizeDashboardRooms } from "../lib/domain/dashboard";
import {
  assertRoomPhaseTransition,
  canTransitionRoomPhase,
} from "../lib/domain/room-lifecycle";
import { roomTaskPath } from "../lib/domain/room-paths";
import {
  normalizeLetterboxdUsername,
  normalizeRoomCode,
  safeNextPath,
} from "../lib/validation/shared";

test("room codes are normalized and ambiguous characters are rejected", () => {
  assert.equal(normalizeRoomCode(" h3x9qk "), "H3X9QK");
  assert.equal(normalizeRoomCode("MOVIE7"), null);
  assert.equal(normalizeRoomCode("short"), null);
});

test("redirect destinations stay on the application origin", () => {
  assert.equal(safeNextPath("/create/confirm"), "/create/confirm");
  assert.equal(safeNextPath("//malicious.example"), "/");
  assert.equal(safeNextPath("https://malicious.example"), "/");
});

test("Letterboxd usernames remain optional but reject unsafe values", () => {
  assert.equal(normalizeLetterboxdUsername(" karsten "), "karsten");
  assert.equal(normalizeLetterboxdUsername("movie_fan-92"), "movie_fan-92");
  assert.equal(normalizeLetterboxdUsername(""), null);
  assert.equal(normalizeLetterboxdUsername("profile/name"), null);
});

test("room lifecycle only permits the planned forward sequence", () => {
  assert.equal(canTransitionRoomPhase(RoomPhase.SELECTION, RoomPhase.VOTING), true);
  assert.equal(canTransitionRoomPhase(RoomPhase.REVEAL, RoomPhase.COMPLETE), true);
  assert.equal(canTransitionRoomPhase(RoomPhase.VOTING, RoomPhase.REVEAL), false);
  assert.throws(() => {
    assertRoomPhaseTransition(RoomPhase.REVEAL, RoomPhase.VOTING);
  }, /cannot move/);
});

test("dashboard separates active and completed rooms", () => {
  const rooms = [
    { id: "hosted", ownerId: "user-1", phase: RoomPhase.SELECTION },
    { id: "joined", ownerId: "user-2", phase: RoomPhase.REVEAL },
    { id: "completed-hosted", ownerId: "user-1", phase: RoomPhase.COMPLETE },
    { id: "completed-joined", ownerId: "user-3", phase: RoomPhase.COMPLETE },
  ];

  const result = categorizeDashboardRooms(rooms, "user-1");

  assert.deepEqual(result.active.map((room) => room.id), ["hosted", "joined"]);
  assert.deepEqual(result.completed.map((room) => room.id), [
    "completed-hosted",
    "completed-joined",
  ]);
  assert.equal(result.userId, "user-1");
});

test("room task paths keep selection and voting off the lobby", () => {
  assert.equal(roomTaskPath("ABC234", RoomPhase.SELECTION), "/rooms/ABC234/select");
  assert.equal(roomTaskPath("ABC234", RoomPhase.VOTING), "/rooms/ABC234/vote");
  assert.equal(roomTaskPath("ABC234", RoomPhase.FINALIZING), "/rooms/ABC234/finalize");
  assert.equal(roomTaskPath("ABC234", RoomPhase.REVEAL), "/rooms/ABC234/reveal");
  assert.equal(roomTaskPath("ABC234", RoomPhase.COMPLETE), "/rooms/ABC234/reveal");
});
