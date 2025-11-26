import type { JoinedRoomDtoModel } from "../model/dto/joined-room-dto.model";
import type { MemberDocument } from "../schema/member.schema";
import type { Room } from "../schema/room.schema";
import { mapMemberToDto } from "./map-member-to-dto";
import { mapRoomToDto } from "./map-room-to-dto";

export const mapRoomToJoinedRoomDtoModel = (
    room: Room,
    member: MemberDocument,
): JoinedRoomDtoModel => {
    const roomHost = room.members.find((m) => m.isHost);

    return {
        member: mapMemberToDto(member),
        room: mapRoomToDto(room, roomHost?._id.equals(member._id)),
    };
};
