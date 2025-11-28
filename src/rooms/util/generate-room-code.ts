// eslint-disable-next-line @typescript-eslint/no-require-imports
const Filter = require("bad-words");
import { customAlphabet } from "nanoid";

import { RoomErrorCode } from "../../shared/errors/error-codes";
import { ROOM_CODE_GENERATION_MAX_ATTEMPTS } from "../constants";
import { InvalidOperationException } from "../exceptions/room.exceptions";

const filter = new Filter();

export const generateRoomCode = (alphabet: string, length: number): string => {
    const generator = customAlphabet(alphabet, length);

    for (let i = 0; i < ROOM_CODE_GENERATION_MAX_ATTEMPTS; i++) {
        const code = generator();
        if (!filter.isProfane(code)) {
            return code;
        }
    }

    throw new InvalidOperationException(
        `Unable to generate a non-profane room code after ${ROOM_CODE_GENERATION_MAX_ATTEMPTS} attempts.`,
        RoomErrorCode.RoomCodeGenerationFailed,
    );
};
