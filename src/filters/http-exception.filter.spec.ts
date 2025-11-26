import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

import {
    InvalidOperationException,
    MemberNotFoundException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../common/exceptions/room.exceptions";
import { RoomErrorCode } from "../events/model/room.event";
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
            name: "MemberNotFoundException",
            exception: new MemberNotFoundException("Member does not exist"),
            expectedType: NotFoundException,
            expectedMessage: "Member does not exist",
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
            name: "MemberNotFoundException",
            exception: new MemberNotFoundException(),
            expectedMessage: "Member not found",
        },
        {
            name: "UnauthorizedHostActionException",
            exception: new UnauthorizedHostActionException(),
            expectedMessage: "Member is not host of room",
        },
    ])("should use default message for $name", ({ exception, expectedMessage }) => {
        expect(() => filter.catch(exception)).toThrow(expectedMessage);
    });
});
