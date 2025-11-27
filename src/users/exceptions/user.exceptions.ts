import { RoomErrorCode } from "../../shared/errors/error-codes";

export class UserNotFoundException extends Error {
    readonly errorCode = RoomErrorCode.UserNotFound;
    constructor(message = "User not found") {
        super(message);
        this.name = "UserNotFoundException";
    }
}

