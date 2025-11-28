import type { RoomStoreModel } from "../../rooms/model/store/room-store.model";
import type { RoomErrorCode } from "../../shared/errors/error-codes";
import type { UserStoreModel } from "../../users/model/user-store.model";

export interface GatewayEvents {
    "error:room": RoomErrorEvent;
    "room:closed": RoomClosedEvent;
    "room:host_updated": RoomHostUpdatedEvent;
    "room:lock_toggled": RoomLockToggledEvent;
    "room:state": RoomStateEvent;
    "user:connected": UserConnectionChangedEvent;
    "user:disconnected": UserConnectionChangedEvent;
    "user:kicked": null;
    "user:left": UserLeftEvent;
}

export interface RoomErrorEvent {
    code: RoomErrorCode;
    message: string;
}

interface RoomClosedEvent {
    reason: "HOST_CLOSED";
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
