import { Expose } from "class-transformer";

export class RoomSessionDtoModel {
    @Expose()
    roomCode: string;

    @Expose()
    token: string;
}
