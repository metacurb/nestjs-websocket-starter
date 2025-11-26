import type { MemberDtoModel } from "../model/dto/member-dto.model";
import type { RoomDtoModel } from "../model/dto/room-dto.model";
import type { Room } from "../schema/room.schema";
import { mapMemberToDto } from "./map-member-to-dto";

export const mapRoomToDto = (room: Room, showSecret?: boolean): RoomDtoModel => ({
    code: room.code,
    isFull: !!room.maxMembers && room.members.length >= room.maxMembers,
    isLocked: room.isLocked,
    maxMembers: room.maxMembers,
    members: room.members
        .map((member) => mapMemberToDto(member))
        .filter((m): m is MemberDtoModel => m !== null),
    secret: showSecret ? room.secret : undefined,
    state: room.state,
});
