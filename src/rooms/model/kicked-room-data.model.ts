import type { Member } from "../schema/member.schema";
import type { RoomDataModel } from "./room-data.model";

export type KickedRoomDataModel = RoomDataModel & {
    kickedMember: Member;
};
