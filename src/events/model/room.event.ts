import type { RoomStoreModel } from "../../rooms/model/store/room-store.model";
import type { UserStoreModel } from "../../rooms/model/store/user-store.model";
export interface GatewayEvents {
    "error:room": RoomErrorEvent;
    "error:user": UserErrorEvent;
    "room:closed": RoomClosedEvent;
    "room:host_updated": RoomHostUpdatedEvent;
    "room:lock_toggled": RoomLockToggledEvent;
    "room:state": RoomStateEvent;
    "user:connected": UserConnectionChangedEvent;
    "user:disconnected": UserConnectionChangedEvent;
    "user:kicked": null;
    "user:left": UserLeftEvent;
}

export enum RoomErrorCode {
    AlreadyHost = "ALREADY_HOST",
    CannotKickSelf = "CANNOT_KICK_SELF",
    UserNotFound = "MEMBER_NOT_FOUND",
    NotHost = "NOT_HOST",
    RoomFull = "ROOM_FULL",
    RoomLocked = "ROOM_LOCKED",
    RoomNotFound = "ROOM_NOT_FOUND",
    UnknownError = "UNKNOWN_ERROR",
}

enum UserErrorCode {}

export interface RoomErrorEvent {
    code: RoomErrorCode;
    message: string;
}
interface UserErrorEvent {
    code: UserErrorCode;
    message: string;
}

interface RoomClosedEvent {
    reason: "HOST_CLOSED" | "HOST_LEFT";
}

interface RoomHostUpdatedEvent {
    hostId: string;
}

interface RoomLockToggledEvent {
    isLocked: boolean;
}

interface UserConnectionChangedEvent {
    user: UserStoreModel;
}

interface UserLeftEvent {
    userId: string;
    reason: "KICKED" | "LEFT";
}

interface RoomStateEvent {
    room: RoomStoreModel;
    users: UserStoreModel[];
}
