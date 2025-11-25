import Filter from "bad-words";
import { customAlphabet } from "nanoid";

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants";

const filter = new Filter();

export const generateRoomCode = () => {
    const generator = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);
    const roomId = generator();
    if (filter.isProfane(roomId)) return generateRoomCode();
    return roomId;
};
