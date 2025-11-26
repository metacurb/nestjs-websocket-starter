import {
    BadRequestException,
    Catch,
    ExceptionFilter,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";

import {
    InvalidOperationException,
    MemberNotFoundException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../common/exceptions/room.exceptions";

const DOMAIN_EXCEPTIONS = [
    RoomNotFoundException,
    MemberNotFoundException,
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
            exception instanceof MemberNotFoundException
        ) {
            return new NotFoundException(exception.message);
        }
        if (exception instanceof UnauthorizedHostActionException) {
            return new ForbiddenException(exception.message);
        }

        return new BadRequestException(exception.message);
    }
}
