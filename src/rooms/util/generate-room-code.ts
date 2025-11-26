// eslint-disable-next-line @typescript-eslint/no-require-imports
const Filter = require("bad-words");
import { customAlphabet } from "nanoid";

const filter = new Filter();

export const generateRoomCode = (alphabet: string, length: number): string => {
    const generator = customAlphabet(alphabet, length);
    const roomId = generator();
    if (filter.isProfane(roomId)) return generateRoomCode(alphabet, length);
    return roomId;
};
