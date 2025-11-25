import type { Member } from "../rooms/schema/member.schema";
import type { RoomDataModel } from "./room-data.model";

export type KickedRoomDataModel = RoomDataModel & {
    kickedMember: Member;
};
