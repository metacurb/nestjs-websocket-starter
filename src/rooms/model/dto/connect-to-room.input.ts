import { IsAlphanumeric, IsMongoId, IsString, IsUppercase, Length } from "class-validator";

import { ROOM_CODE_LENGTH } from "../../../constants";

export class ConnectToRoomInput {
    @IsMongoId()
    memberId: string;

    @Length(ROOM_CODE_LENGTH, ROOM_CODE_LENGTH)
    @IsUppercase()
    @IsAlphanumeric()
    @IsString()
    roomCode: string;
}
