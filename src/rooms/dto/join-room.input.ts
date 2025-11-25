import { IsMongoId, IsOptional, IsString, Length } from "class-validator";

import { USER_NAME_MAX_LENGTH, USER_NAME_MIN_LENGTH } from "../../constants";

export class JoinRoomInput {
    @Length(USER_NAME_MIN_LENGTH, USER_NAME_MAX_LENGTH)
    @IsString()
    name: string;

    @IsOptional()
    @IsMongoId()
    memberId?: string;
}
