import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
} from "../../common/exceptions/room.exceptions";
import type { RoomErrorEvent } from "../model/room.event";
import { RoomErrorCode } from "../model/room.event";

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
