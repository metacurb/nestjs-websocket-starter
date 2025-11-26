import { IsUUID } from "class-validator";

export class KickUserInput {
    @IsUUID()
    kickUserId: string;
}
