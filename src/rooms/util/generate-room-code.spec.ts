import { profanity } from "@2toad/profanity";
import { customAlphabet } from "nanoid";

import { ROOM_CODE_GENERATION_MAX_ATTEMPTS } from "../constants";
import { InvalidOperationException } from "../exceptions/room.exceptions";
import { generateRoomCode } from "./generate-room-code";

jest.mock("@2toad/profanity");

const testRoomCodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const testRoomCodeLength = 4;

describe("generateRoomCode", () => {
    const mockProfanityExsts = jest.mocked(profanity.exists);
    const mockGenerator = jest.fn();
    const mockCustomAlphabet = customAlphabet as jest.Mock;

    beforeEach(() => {
        jest.resetAllMocks();
        mockCustomAlphabet.mockReturnValue(mockGenerator);
    });

    test("should create an ID generator using the correct alphabet and ID length", () => {
        mockProfanityExsts.mockReturnValue(false);
        mockGenerator.mockReturnValue("foo");

        const result = generateRoomCode(testRoomCodeAlphabet, testRoomCodeLength);

        expect(customAlphabet).toHaveBeenCalledWith(testRoomCodeAlphabet, testRoomCodeLength);
        expect(result).toBe("foo");
    });

    test("should keep generating IDs if profane words are returned", () => {
        mockProfanityExsts
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false);

        mockGenerator.mockReturnValueOnce("foo").mockReturnValueOnce("bar").mockReturnValue("baz");

        const result = generateRoomCode(testRoomCodeAlphabet, testRoomCodeLength);

        expect(customAlphabet).toHaveBeenCalledWith(testRoomCodeAlphabet, testRoomCodeLength);
        expect(mockGenerator).toHaveBeenCalledTimes(3);
        expect(result).toBe("baz");
    });

    test("should throw InvalidOperationException after max attempts of profane words", () => {
        mockProfanityExsts.mockReturnValue(true);
        mockGenerator.mockReturnValue("foo");

        expect(() => generateRoomCode(testRoomCodeAlphabet, testRoomCodeLength)).toThrow(
            InvalidOperationException,
        );
        expect(mockGenerator).toHaveBeenCalledTimes(ROOM_CODE_GENERATION_MAX_ATTEMPTS);
    });
});
