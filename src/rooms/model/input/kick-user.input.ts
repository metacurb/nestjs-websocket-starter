import { IsNotEmpty, IsString } from "class-validator";

export class KickUserInput {
    @IsNotEmpty()
    @IsString()
    kickUserId!: string;
}
