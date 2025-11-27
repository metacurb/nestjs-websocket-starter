import { RoomErrorCode } from "../../shared/errors/error-codes";

export class RoomNotFoundException extends Error {
    readonly errorCode = RoomErrorCode.RoomNotFound;
    constructor(message = "Room not found") {
        super(message);
        this.name = "RoomNotFoundException";
    }
}

export class UserNotFoundException extends Error {
    readonly errorCode = RoomErrorCode.UserNotFound;
    constructor(message = "User not found") {
        super(message);
        this.name = "UserNotFoundException";
    }
}

export class UnauthorizedHostActionException extends Error {
    readonly errorCode = RoomErrorCode.NotHost;
    constructor(message = "User is not host of room") {
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

