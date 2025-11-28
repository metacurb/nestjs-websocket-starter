import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, Length, Matches } from "class-validator";
import { USER_DISPLAY_NAME_MAX_LENGTH, USER_DISPLAY_NAME_MIN_LENGTH } from "src/constants";

export class JoinRoomInput {
    @Transform(({ value }) => value?.trim())
    @Matches(/^[a-zA-Z0-9 ]+$/, { message: "displayName must be alphanumeric" })
    @IsNotEmpty()
    @Length(USER_DISPLAY_NAME_MIN_LENGTH, USER_DISPLAY_NAME_MAX_LENGTH)
    @IsString()
    displayName!: string;
}
