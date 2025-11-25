import { customAlphabet } from "nanoid";

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../constants";
import { generateRoomCode } from "./generate-room-code";

jest.mock("nanoid", () => ({
    customAlphabet: jest.fn(),
}));

describe("generateRoomCode", () => {
    const mockGenerator = jest.fn();
    const mockCustomAlphabet = customAlphabet as jest.Mock;

    beforeEach(() => {
        jest.resetAllMocks();
        mockCustomAlphabet.mockReturnValue(mockGenerator);
    });

    test("should create an ID generator using the correct alphabet and ID length", () => {
        mockGenerator.mockReturnValue("foo");

        const result = generateRoomCode();

        expect(customAlphabet).toHaveBeenCalledWith(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);
        expect(result).toBe("foo");
    });

    test("should keep generating IDs if profane words are returned", () => {
        mockGenerator
            .mockReturnValueOnce("SHIT")
            .mockReturnValueOnce("SH1T")
            .mockReturnValueOnce("foo");

        const result = generateRoomCode();

        expect(customAlphabet).toHaveBeenCalledWith(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);
        expect(mockGenerator).toHaveBeenCalledTimes(3);
        expect(result).toBe("foo");
    });
});
