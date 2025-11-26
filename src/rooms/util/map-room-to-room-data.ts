import type { RoomDataModel } from "../model/room-data.model";
import type { Room } from "../schema/room.schema";

export const mapRoomToRoomData = (room: Room, socketId: string): RoomDataModel => ({
    host: room.members.find(({ isHost }) => isHost)!,
    me: room.members.find((member) => member.socketId === socketId)!,
    room,
});
