import { IsNotEmpty, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";

import {
    ROOM_MAX_MAX_MEMBERS,
    ROOM_MIN_MAX_MEMBERS,
    USER_NAME_MAX_LENGTH,
    USER_NAME_MIN_LENGTH,
} from "../../constants";

export class CreateRoomInput {
    @IsNotEmpty()
    @Length(USER_NAME_MIN_LENGTH, USER_NAME_MAX_LENGTH)
    @IsString()
    name: string;

    @IsOptional()
    @Max(ROOM_MIN_MAX_MEMBERS)
    @Min(ROOM_MAX_MAX_MEMBERS)
    @IsNumber()
    maxMembers?: number;
}
