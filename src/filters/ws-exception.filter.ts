import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";

import {
    InvalidOperationException,
    MemberNotFoundException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../common/exceptions/room.exceptions";
import { RoomErrorCode, RoomErrorEvent, RoomEvent } from "../events/model/room.event";

const DOMAIN_EXCEPTIONS = [
    RoomNotFoundException,
    MemberNotFoundException,
    UnauthorizedHostActionException,
    InvalidOperationException,
];

type DomainException = InstanceType<(typeof DOMAIN_EXCEPTIONS)[number]>;

@Catch(...DOMAIN_EXCEPTIONS)
export class WsDomainExceptionFilter implements ExceptionFilter {
    catch(exception: DomainException, host: ArgumentsHost) {
        const callback = host.getArgByIndex(2);

        const errorEvent: RoomErrorEvent = {
            opCode: RoomEvent.Error,
            data: {
                code: exception.errorCode ?? RoomErrorCode.UnknownError,
                message: exception.message,
            },
        };

        if (typeof callback === "function") {
            callback(errorEvent);
        }
    }
}
