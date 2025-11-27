import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";

import { RedisService } from "../redis/redis.service";
import type { UserStoreModel } from "./model/user-store.model";
import { UsersRepository } from "./users.repository";

describe("UsersRepository", () => {
    let repository: UsersRepository;
    let redisService: jest.Mocked<RedisService>;

    const createMockUser = (overrides: Partial<UserStoreModel> = {}): UserStoreModel => ({
        id: "user-123",
        displayName: "Test User",
        roomCode: "ABCD12",
        isConnected: false,
        socketId: null,
        ...overrides,
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersRepository,
                {
                    provide: RedisService,
                    useValue: createMock<RedisService>(),
                },
            ],
        }).compile();

        repository = module.get<UsersRepository>(UsersRepository);
        redisService = module.get(RedisService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("findById", () => {
        test("should return user when found", async () => {
            const user = createMockUser();
            redisService.getJson.mockResolvedValue(user);

            const result = await repository.findById("user-123");

            expect(result).toEqual(user);
            expect(redisService.getJson).toHaveBeenCalledWith("user:user-123");
        });

        test("should return null when not found", async () => {
            redisService.getJson.mockResolvedValue(null);

            const result = await repository.findById("unknown");

            expect(result).toBeNull();
        });
    });

    describe("save", () => {
        test("should save user without TTL", async () => {
            const user = createMockUser();

            await repository.save(user);

            expect(redisService.setJson).toHaveBeenCalledWith("user:user-123", user, undefined);
        });

        test("should save user with TTL", async () => {
            const user = createMockUser();

            await repository.save(user, 3600);

            expect(redisService.setJson).toHaveBeenCalledWith("user:user-123", user, 3600);
        });
    });

    describe("delete", () => {
        test("should delete user", async () => {
            await repository.delete("user-123");

            expect(redisService.del).toHaveBeenCalledWith("user:user-123");
        });
    });
});

