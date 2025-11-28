import { IsNotEmpty, IsString } from "class-validator";

export class UpdateHostInput {
    @IsNotEmpty()
    @IsString()
    newHostId!: string;
}
