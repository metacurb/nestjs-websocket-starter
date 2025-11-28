import { IsUUID } from "class-validator";

export class UpdateHostInput {
    @IsUUID()
    newHostId!: string;
}
