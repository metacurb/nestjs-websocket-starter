import { IsNotEmpty, IsNumber, IsOptional, IsString, Length, Max, Min } from "class-validator";

import {
    ROOM_MAX_USERS,
    USER_DISPLAY_NAME_MAX_LENGTH,
    USER_DISPLAY_NAME_MIN_LENGTH,
} from "../../../constants";

export class CreateRoomInput {
    @IsNotEmpty()
    @Length(USER_DISPLAY_NAME_MIN_LENGTH, USER_DISPLAY_NAME_MAX_LENGTH)
    @IsString()
    displayName: string;

    @IsOptional()
    @Max(ROOM_MAX_USERS)
    @Min(0)
    @IsNumber()
    maxUsers?: number;
}
