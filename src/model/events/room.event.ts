import type { RoomDtoModel } from "../../rooms/dto/room-dto.model";

export type GatewayEvent = RoomExitedEvent | RoomHostChangeEvent | RoomUpdatedEvent;

export enum RoomEvent {
    HostChange = "room/host_change",
    Joined = "room/joined",
    Updated = "room/updated",
    Exited = "room/exited",
}

export enum RoomExitReason {
    Disconnected = "disconnected",
    Kicked = "kicked",
    Left = "left",
}

export interface RoomUpdatedEvent {
    opCode: RoomEvent.Updated;
    roomCode: string;
    data: {
        room: RoomDtoModel;
    };
}
export interface RoomExitedEvent {
    opCode: RoomEvent.Exited;
    roomCode: string;
    data: {
        reason: RoomExitReason;
    };
}

export interface RoomHostChangeEvent {
    opCode: RoomEvent.HostChange;
    roomCode: string;
    data: {
        secret?: string;
    };
}
