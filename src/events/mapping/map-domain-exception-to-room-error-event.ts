import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../../rooms/exceptions/room.exceptions";
import { UserNotFoundException } from "../../users/exceptions/user.exceptions";
import { RoomErrorCode } from "../../shared/errors/error-codes";
import type { RoomErrorEvent } from "../model/room.event";

export function mapDomainExceptionToRoomErrorEvent(exception: Error): RoomErrorEvent {
    if (
        exception instanceof RoomNotFoundException ||
        exception instanceof UserNotFoundException ||
        exception instanceof UnauthorizedHostActionException ||
        exception instanceof InvalidOperationException
    ) {
        return {
            code: exception.errorCode,
            message: exception.message,
        };
    }

    return {
        code: RoomErrorCode.UnknownError,
        message: exception.message ?? "Unknown error",
    };
}
