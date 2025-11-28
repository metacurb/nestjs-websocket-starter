import { Transform } from "class-transformer";
import {
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Length,
    Matches,
    Max,
    Min,
} from "class-validator";

import {
    ROOM_MAX_USERS,
    USER_DISPLAY_NAME_MAX_LENGTH,
    USER_DISPLAY_NAME_MIN_LENGTH,
} from "../../../constants";

export class CreateRoomInput {
    @Transform(({ value }) => value?.trim())
    @Matches(/^[a-zA-Z0-9 ]+$/, { message: "displayName must be alphanumeric" })
    @IsNotEmpty()
    @Length(USER_DISPLAY_NAME_MIN_LENGTH, USER_DISPLAY_NAME_MAX_LENGTH)
    @IsString()
    displayName!: string;

    @IsOptional()
    @Max(ROOM_MAX_USERS)
    @Min(0)
    @IsNumber()
    maxUsers?: number;
}
