import type { MemberDocument } from "../schema/member.schema";
import type { Room } from "../schema/room.schema";

export type RoomDataModel = {
    host: MemberDocument;
    me: MemberDocument;
    room: Room;
};
