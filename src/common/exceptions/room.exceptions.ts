import { RoomErrorCode } from "../../events/model/room.event";

export class RoomNotFoundException extends Error {
    readonly errorCode = RoomErrorCode.RoomNotFound;
    constructor(message = "Room not found") {
        super(message);
        this.name = "RoomNotFoundException";
    }
}

export class MemberNotFoundException extends Error {
    readonly errorCode = RoomErrorCode.MemberNotFound;
    constructor(message = "Member not found") {
        super(message);
        this.name = "MemberNotFoundException";
    }
}

export class UnauthorizedHostActionException extends Error {
    readonly errorCode = RoomErrorCode.NotHost;
    constructor(message = "Member is not host of room") {
        super(message);
        this.name = "UnauthorizedHostActionException";
    }
}

export class InvalidOperationException extends Error {
    constructor(
        message: string,
        readonly errorCode: RoomErrorCode,
    ) {
        super(message);
        this.name = "InvalidOperationException";
    }
}
