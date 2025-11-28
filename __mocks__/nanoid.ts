let nanoidCounter = 0;
let roomCodeCounter = 0;

export const nanoid = jest.fn(() => `mocked-nanoid-${++nanoidCounter}`);
export const customAlphabet = jest.fn(() =>
    jest.fn(() => `MOCK${String(++roomCodeCounter).padStart(2, "0")}`),
);
