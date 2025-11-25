import type { Member } from "../rooms/schema/member.schema";
import type { Room } from "../rooms/schema/room.schema";

export type RoomDataModel = {
    host: Member;
    me: Member;
    room: Room;
};
