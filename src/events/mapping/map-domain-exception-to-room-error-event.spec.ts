import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
} from "../../common/exceptions/room.exceptions";
import { RoomErrorCode } from "../model/room.event";
import { mapDomainExceptionToRoomErrorEvent } from "./map-domain-exception-to-room-error-event";

describe("mapDomainExceptionToRoomErrorEvent", () => {
    describe("RoomNotFoundException", () => {
        test("should map with default message", () => {
            const exception = new RoomNotFoundException();

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.RoomNotFound,
                message: "Room not found",
            });
        });

        test("should map with custom message", () => {
            const exception = new RoomNotFoundException("Room ABCD12 does not exist");

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.RoomNotFound,
                message: "Room ABCD12 does not exist",
            });
        });
    });

    describe("UserNotFoundException", () => {
        test("should map with default message", () => {
            const exception = new UserNotFoundException();

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.UserNotFound,
                message: "User not found",
            });
        });

        test("should map with custom message", () => {
            const exception = new UserNotFoundException("User user-123 not found");

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.UserNotFound,
                message: "User user-123 not found",
            });
        });
    });

    describe("UnauthorizedHostActionException", () => {
        test("should map with default message", () => {
            const exception = new UnauthorizedHostActionException();

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.NotHost,
                message: "User is not host of room",
            });
        });

        test("should map with custom message", () => {
            const exception = new UnauthorizedHostActionException("Only host can kick users");

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.NotHost,
                message: "Only host can kick users",
            });
        });
    });

    describe("InvalidOperationException", () => {
        test("should map RoomFull error", () => {
            const exception = new InvalidOperationException("ROom is full", RoomErrorCode.RoomFull);

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.RoomFull,
                message: "ROom is full",
            });
        });

        test("should map RoomLocked error", () => {
            const exception = new InvalidOperationException(
                "Room is locked",
                RoomErrorCode.RoomLocked,
            );

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.RoomLocked,
                message: "Room is locked",
            });
        });

        test("should map CannotKickSelf error", () => {
            const exception = new InvalidOperationException(
                "Cannot kick yourself",
                RoomErrorCode.CannotKickSelf,
            );

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.CannotKickSelf,
                message: "Cannot kick yourself",
            });
        });

        test("should map AlreadyHost error", () => {
            const exception = new InvalidOperationException(
                "User is already host",
                RoomErrorCode.AlreadyHost,
            );

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.AlreadyHost,
                message: "User is already host",
            });
        });
    });

    describe("generic Error", () => {
        test("should map to UnknownError with message", () => {
            const exception = new Error("Something went wrong");

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.UnknownError,
                message: "Something went wrong",
            });
        });

        test("should map to UnknownError with empty message", () => {
            const exception = new Error("");

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.UnknownError,
                message: "",
            });
        });

        test("should use fallback message when message is undefined", () => {
            const exception = new Error();
            // @ts-expect-error - simulating edge case where message is undefined
            exception.message = undefined;

            const result = mapDomainExceptionToRoomErrorEvent(exception);

            expect(result).toEqual({
                code: RoomErrorCode.UnknownError,
                message: "Unknown error",
            });
        });
    });
});
