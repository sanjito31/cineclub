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
    active: rooms.filter((room) => room.phase !== RoomPhase.COMPLETE),
    completed: rooms.filter((room) => room.phase === RoomPhase.COMPLETE),
    userId,
  };
}
