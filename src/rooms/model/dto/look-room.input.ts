import { IsAlphanumeric, IsString, IsUppercase, Length, MinLength } from "class-validator";

import { ROOM_CODE_LENGTH } from "../../../constants";

export class LockRoomInput {
    @Length(ROOM_CODE_LENGTH, ROOM_CODE_LENGTH)
    @IsUppercase()
    @IsAlphanumeric()
    @IsString()
    roomCode: string;

    @MinLength(1)
    @IsString()
    secret: string;
}
