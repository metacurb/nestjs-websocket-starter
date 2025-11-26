import type { ArgumentsHost } from "@nestjs/common";

import {
    InvalidOperationException,
    MemberNotFoundException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../common/exceptions/room.exceptions";
import { RoomErrorCode, RoomEvent } from "../events/model/room.event";
import { WsDomainExceptionFilter } from "./ws-exception.filter";

describe("WsDomainExceptionFilter", () => {
    let filter: WsDomainExceptionFilter;
    let mockCallback: jest.Mock;
    let mockHost: ArgumentsHost;

    beforeEach(() => {
        filter = new WsDomainExceptionFilter();
        mockCallback = jest.fn();
        mockHost = {
            getArgByIndex: jest.fn().mockReturnValue(mockCallback),
        } as unknown as ArgumentsHost;
    });

    test.each([
        {
            name: "RoomNotFoundException",
            exception: new RoomNotFoundException("Room does not exist"),
            expectedCode: RoomErrorCode.RoomNotFound,
            expectedMessage: "Room does not exist",
        },
        {
            name: "MemberNotFoundException",
            exception: new MemberNotFoundException("Member does not exist"),
            expectedCode: RoomErrorCode.MemberNotFound,
            expectedMessage: "Member does not exist",
        },
        {
            name: "UnauthorizedHostActionException",
            exception: new UnauthorizedHostActionException(),
            expectedCode: RoomErrorCode.NotHost,
            expectedMessage: "Member is not host of room",
        },
        {
            name: "InvalidOperationException",
            exception: new InvalidOperationException(
                "Cannot kick yourself",
                RoomErrorCode.CannotKickSelf,
            ),
            expectedCode: RoomErrorCode.CannotKickSelf,
            expectedMessage: "Cannot kick yourself",
        },
    ])(
        "should return RoomErrorEvent with $expectedCode for $name",
        ({ exception, expectedCode, expectedMessage }) => {
            filter.catch(exception, mockHost);

            expect(mockCallback).toHaveBeenCalledWith({
                opCode: RoomEvent.Error,
                data: {
                    code: expectedCode,
                    message: expectedMessage,
                },
            });
        },
    );

    test("should not call callback if it is not a function", () => {
        mockHost = {
            getArgByIndex: jest.fn().mockReturnValue(undefined),
        } as unknown as ArgumentsHost;

        const exception = new RoomNotFoundException();

        expect(() => filter.catch(exception, mockHost)).not.toThrow();
    });
});
