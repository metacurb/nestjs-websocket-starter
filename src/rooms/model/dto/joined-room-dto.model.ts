import { Expose } from "class-transformer";

import { MemberDtoModel } from "./member-dto.model";
import { MemberRoomDtoModel } from "./member-room-dto.model";

export class JoinedRoomDtoModel {
    @Expose()
    member: MemberDtoModel;

    @Expose()
    room: MemberRoomDtoModel;
}
