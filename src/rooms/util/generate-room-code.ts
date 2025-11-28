import { profanity } from "@2toad/profanity";
import { customAlphabet } from "nanoid";

import { RoomErrorCode } from "../../shared/errors/error-codes";
import { ROOM_CODE_GENERATION_MAX_ATTEMPTS } from "../constants";
import { InvalidOperationException } from "../exceptions/room.exceptions";

export const generateRoomCode = (alphabet: string, length: number): string => {
    const generator = customAlphabet(alphabet, length);

    for (let i = 0; i < ROOM_CODE_GENERATION_MAX_ATTEMPTS; i++) {
        const code = generator();
        if (!profanity.exists(code)) {
            return code;
        }
    }

    throw new InvalidOperationException(
        `Unable to generate a non-profane room code after ${ROOM_CODE_GENERATION_MAX_ATTEMPTS} attempts.`,
        RoomErrorCode.RoomCodeGenerationFailed,
    );
};
