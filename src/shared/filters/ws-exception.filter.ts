import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Socket } from "socket.io";

import { mapDomainExceptionToRoomErrorEvent } from "../../events/mapping/map-domain-exception-to-room-error-event";
import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../../rooms/exceptions/room.exceptions";
import { UserNotFoundException } from "../../users/exceptions/user.exceptions";

const DOMAIN_EXCEPTIONS = [
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
];

type DomainException = InstanceType<(typeof DOMAIN_EXCEPTIONS)[number]>;

@Catch(...DOMAIN_EXCEPTIONS)
export class WsDomainExceptionFilter implements ExceptionFilter {
    catch(exception: DomainException, host: ArgumentsHost) {
        const client = host.switchToWs().getClient<Socket>();
        const errorEvent = mapDomainExceptionToRoomErrorEvent(exception);
        client.emit("room:error", errorEvent);
    }
}
