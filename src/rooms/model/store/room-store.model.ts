import type { RoomState } from "../enum/room-state.enum";

export type RoomStoreModel = {
    code: string;
    hostId: string;
    isLocked: boolean;
    maxUsers?: number;
    state: RoomState;
    createdAt: Date;
    updatedAt: Date;
};
