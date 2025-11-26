import { IsString, Length } from "class-validator";

import { USER_DISPLAY_NAME_MAX_LENGTH, USER_DISPLAY_NAME_MIN_LENGTH } from "../../../constants";

export class JoinRoomInput {
    @Length(USER_DISPLAY_NAME_MIN_LENGTH, USER_DISPLAY_NAME_MAX_LENGTH)
    @IsString()
    displayName: string;
}
