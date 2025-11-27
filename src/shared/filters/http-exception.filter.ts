import {
    BadRequestException,
    Catch,
    ExceptionFilter,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";

import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
} from "../../common/exceptions/room.exceptions";

const DOMAIN_EXCEPTIONS = [
    RoomNotFoundException,
    UserNotFoundException,
    UnauthorizedHostActionException,
    InvalidOperationException,
];

type DomainException = InstanceType<(typeof DOMAIN_EXCEPTIONS)[number]>;

@Catch(...DOMAIN_EXCEPTIONS)
export class HttpDomainExceptionFilter implements ExceptionFilter {
    catch(exception: DomainException) {
        throw this.mapToHttpException(exception);
    }

    private mapToHttpException(exception: DomainException) {
        if (
            exception instanceof RoomNotFoundException ||
            exception instanceof UserNotFoundException
        ) {
            return new NotFoundException(exception.message);
        }
        if (exception instanceof UnauthorizedHostActionException) {
            return new ForbiddenException(exception.message);
        }

        return new BadRequestException(exception.message);
    }
}

