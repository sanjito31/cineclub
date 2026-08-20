import { RoomPhase } from "@/app/generated/prisma/enums";

type DashboardRoomIdentity = {
  ownerId: string;
  phase: RoomPhase;
};

export function categorizeDashboardRooms<T extends DashboardRoomIdentity>(
  rooms: readonly T[],
  userId: string,
) {
  return {
    hosting: rooms.filter(
      (room) => room.ownerId === userId && room.phase !== RoomPhase.COMPLETE,
    ),
    current: rooms.filter(
      (room) => room.ownerId !== userId && room.phase !== RoomPhase.COMPLETE,
    ),
    previous: rooms.filter((room) => room.phase === RoomPhase.COMPLETE),
  };
}
