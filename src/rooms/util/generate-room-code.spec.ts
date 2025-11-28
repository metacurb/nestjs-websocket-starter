import { customAlphabet } from "nanoid";

import { ROOM_CODE_GENERATION_MAX_ATTEMPTS } from "../constants";
import { InvalidOperationException } from "../exceptions/room.exceptions";
import { generateRoomCode } from "./generate-room-code";

jest.mock("nanoid", () => ({
    customAlphabet: jest.fn(),
}));

const testRoomCodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const testRoomCodeLength = 4;

describe("generateRoomCode", () => {
    const mockGenerator = jest.fn();
    const mockCustomAlphabet = customAlphabet as jest.Mock;

    beforeEach(() => {
        jest.resetAllMocks();
        mockCustomAlphabet.mockReturnValue(mockGenerator);
    });

    test("should create an ID generator using the correct alphabet and ID length", () => {
        mockGenerator.mockReturnValue("foo");

        const result = generateRoomCode(testRoomCodeAlphabet, testRoomCodeLength);

        expect(customAlphabet).toHaveBeenCalledWith(testRoomCodeAlphabet, testRoomCodeLength);
        expect(result).toBe("foo");
    });

    test("should keep generating IDs if profane words are returned", () => {
        mockGenerator
            .mockReturnValueOnce("SHIT")
            .mockReturnValueOnce("SH1T")
            .mockReturnValueOnce("foo");

        const result = generateRoomCode(testRoomCodeAlphabet, testRoomCodeLength);

        expect(customAlphabet).toHaveBeenCalledWith(testRoomCodeAlphabet, testRoomCodeLength);
        expect(mockGenerator).toHaveBeenCalledTimes(3);
        expect(result).toBe("foo");
    });

    test("should throw InvalidOperationException after max attempts of profane words", () => {
        mockGenerator.mockReturnValue("SHIT");

        expect(() => generateRoomCode(testRoomCodeAlphabet, testRoomCodeLength)).toThrow(
            InvalidOperationException,
        );
        expect(mockGenerator).toHaveBeenCalledTimes(ROOM_CODE_GENERATION_MAX_ATTEMPTS);
    });
});
