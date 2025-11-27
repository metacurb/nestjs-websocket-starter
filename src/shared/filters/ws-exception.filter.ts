import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Socket } from "socket.io";

import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
} from "../../rooms/exceptions/room.exceptions";
import { mapDomainExceptionToRoomErrorEvent } from "../../events/mapping/map-domain-exception-to-room-error-event";

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

