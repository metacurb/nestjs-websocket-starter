import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../../rooms/exceptions/room.exceptions";
import { UserNotFoundException } from "../../users/exceptions/user.exceptions";
import { RoomErrorCode } from "../errors/error-codes";
import { HttpDomainExceptionFilter } from "./http-exception.filter";

describe("HttpDomainExceptionFilter", () => {
    let filter: HttpDomainExceptionFilter;

    beforeEach(() => {
        filter = new HttpDomainExceptionFilter();
    });

    test.each([
        {
            name: "RoomNotFoundException",
            exception: new RoomNotFoundException("Room does not exist"),
            expectedType: NotFoundException,
            expectedMessage: "Room does not exist",
        },
        {
            name: "UserNotFoundException",
            exception: new UserNotFoundException("User does not exist"),
            expectedType: NotFoundException,
            expectedMessage: "User does not exist",
        },
        {
            name: "UnauthorizedHostActionException",
            exception: new UnauthorizedHostActionException("Not authorized"),
            expectedType: ForbiddenException,
            expectedMessage: "Not authorized",
        },
        {
            name: "InvalidOperationException",
            exception: new InvalidOperationException(
                "Cannot kick yourself",
                RoomErrorCode.CannotKickSelf,
            ),
            expectedType: BadRequestException,
            expectedMessage: "Cannot kick yourself",
        },
    ])(
        "should throw $expectedType.name for $name",
        ({ exception, expectedType, expectedMessage }) => {
            expect(() => filter.catch(exception)).toThrow(expectedType);
            expect(() => filter.catch(exception)).toThrow(expectedMessage);
        },
    );

    test.each([
        {
            name: "RoomNotFoundException",
            exception: new RoomNotFoundException(),
            expectedMessage: "Room not found",
        },
        {
            name: "UserNotFoundException",
            exception: new UserNotFoundException(),
            expectedMessage: "User not found",
        },
        {
            name: "UnauthorizedHostActionException",
            exception: new UnauthorizedHostActionException(),
            expectedMessage: "User is not host of room",
        },
    ])("should use default message for $name", ({ exception, expectedMessage }) => {
        expect(() => filter.catch(exception)).toThrow(expectedMessage);
    });
});
