import type { ArgumentsHost } from "@nestjs/common";
import type { Socket } from "socket.io";

import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
} from "../common/exceptions/room.exceptions";
import { mapDomainExceptionToRoomErrorEvent } from "../events/mapping/map-domain-exception-to-room-error-event";
import { RoomErrorCode } from "../shared/errors/error-codes";
import { WsDomainExceptionFilter } from "./ws-exception.filter";

jest.mock("../events/mapping/map-domain-exception-to-room-error-event");

const mockMapDomainException = mapDomainExceptionToRoomErrorEvent as jest.MockedFunction<
    typeof mapDomainExceptionToRoomErrorEvent
>;

describe("WsDomainExceptionFilter", () => {
    let filter: WsDomainExceptionFilter;
    let mockSocket: jest.Mocked<Socket>;
    let mockHost: ArgumentsHost;

    beforeEach(() => {
        filter = new WsDomainExceptionFilter();
        mockSocket = {
            emit: jest.fn(),
        } as unknown as jest.Mocked<Socket>;
        mockHost = {
            switchToWs: jest.fn().mockReturnValue({
                getClient: jest.fn().mockReturnValue(mockSocket),
            }),
        } as unknown as ArgumentsHost;

        jest.clearAllMocks();
    });

    test("should get WebSocket client from host", () => {
        const exception = new RoomNotFoundException();
        mockMapDomainException.mockReturnValue({
            code: RoomErrorCode.RoomNotFound,
            message: "Room not found",
        });

        filter.catch(exception, mockHost);

        expect(mockHost.switchToWs).toHaveBeenCalled();
    });

    test("should call mapDomainExceptionToRoomErrorEvent with the exception", () => {
        const exception = new UserNotFoundException("User not found");
        mockMapDomainException.mockReturnValue({
            code: RoomErrorCode.UserNotFound,
            message: "User not found",
        });

        filter.catch(exception, mockHost);

        expect(mockMapDomainException).toHaveBeenCalledWith(exception);
    });

    test("should emit room:error event with mapped error", () => {
        const exception = new UnauthorizedHostActionException();
        const mappedError = { code: RoomErrorCode.NotHost, message: "Not the host" };
        mockMapDomainException.mockReturnValue(mappedError);

        filter.catch(exception, mockHost);

        expect(mockSocket.emit).toHaveBeenCalledWith("room:error", mappedError);
    });

    test.each([
        { name: "RoomNotFoundException", exception: new RoomNotFoundException() },
        { name: "UserNotFoundException", exception: new UserNotFoundException() },
        {
            name: "UnauthorizedHostActionException",
            exception: new UnauthorizedHostActionException(),
        },
        {
            name: "InvalidOperationException",
            exception: new InvalidOperationException("error", RoomErrorCode.CannotKickSelf),
        },
    ])("should handle $name", ({ exception }) => {
        const mappedError = { code: RoomErrorCode.UnknownError, message: "test" };
        mockMapDomainException.mockReturnValue(mappedError);

        filter.catch(exception, mockHost);

        expect(mockMapDomainException).toHaveBeenCalledWith(exception);
        expect(mockSocket.emit).toHaveBeenCalledWith("room:error", mappedError);
    });
});
