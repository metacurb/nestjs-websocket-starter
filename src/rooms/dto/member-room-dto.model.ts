import { Expose } from "class-transformer";

import { RoomState } from "../../model/enum/room-state.enum";
import type { MemberDtoModel } from "./member-dto.model";

export class MemberRoomDtoModel {
    @Expose()
    members: MemberDtoModel[];

    @Expose()
    state: RoomState;
}
