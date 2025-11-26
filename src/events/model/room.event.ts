import type { RoomDtoModel } from "../../rooms/model/dto/room-dto.model";

export type GatewayEvent =
    | RoomErrorEvent
    | RoomExitedEvent
    | RoomHostChangeEvent
    | RoomUpdatedEvent;

export enum RoomEvent {
    HostChange = "room/host_change",
    Joined = "room/joined",
    Updated = "room/updated",
    Exited = "room/exited",
    Error = "room/error",
}

export enum RoomErrorCode {
    AlreadyHost = "ALREADY_HOST",
    CannotKickSelf = "CANNOT_KICK_SELF",
    ConnectionFailed = "CONNECTION_FAILED",
    InvalidSocketId = "INVALID_SOCKET_ID",
    KickFailed = "KICK_FAILED",
    LockFailed = "LOCK_FAILED",
    MemberNotFound = "MEMBER_NOT_FOUND",
    NoHost = "NO_HOST",
    NotHost = "NOT_HOST",
    ReconnectFailed = "RECONNECT_FAILED",
    RoomFull = "ROOM_FULL",
    RoomLocked = "ROOM_LOCKED",
    RoomNotFound = "ROOM_NOT_FOUND",
    UnknownError = "UNKNOWN_ERROR",
    UpdateHostFailed = "UPDATE_HOST_FAILED",
}

export enum RoomExitReason {
    Disconnected = "disconnected",
    Kicked = "kicked",
    Left = "left",
}

export interface RoomErrorEvent {
    opCode: RoomEvent.Error;
    roomCode?: string;
    data: {
        code: RoomErrorCode;
        message: string;
    };
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
