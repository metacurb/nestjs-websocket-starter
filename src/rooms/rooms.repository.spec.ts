import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";

import { RedisService } from "../redis/redis.service";
import type { RoomStoreModel } from "./model/store/room-store.model";
import { RoomsRepository } from "./rooms.repository";

describe("RoomsRepository", () => {
    let repository: RoomsRepository;
    let redisService: jest.Mocked<RedisService>;

    const createMockRoom = (overrides: Partial<RoomStoreModel> = {}): RoomStoreModel => ({
        code: "ABCD12",
        hostId: "host-123",
        isLocked: false,
        maxUsers: 10,
        state: "CREATED",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoomsRepository,
                {
                    provide: RedisService,
                    useValue: createMock<RedisService>(),
                },
            ],
        }).compile();

        repository = module.get<RoomsRepository>(RoomsRepository);
        redisService = module.get(RedisService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("findByCode", () => {
        test("should return room when found", async () => {
            const room = createMockRoom();
            redisService.getJson.mockResolvedValue(room);

            const result = await repository.findByCode("ABCD12");

            expect(result).toEqual(room);
            expect(redisService.getJson).toHaveBeenCalledWith("room:ABCD12");
        });

        test("should return null when not found", async () => {
            redisService.getJson.mockResolvedValue(null);

            const result = await repository.findByCode("NOTFOUND");

            expect(result).toBeNull();
        });
    });

    describe("save", () => {
        test("should save room without TTL", async () => {
            const room = createMockRoom();

            await repository.save(room);

            expect(redisService.setJson).toHaveBeenCalledWith("room:ABCD12", room, undefined);
        });

        test("should save room with TTL", async () => {
            const room = createMockRoom();

            await repository.save(room, 3600);

            expect(redisService.setJson).toHaveBeenCalledWith("room:ABCD12", room, 3600);
        });
    });

    describe("delete", () => {
        test("should delete room and members set using batch delete", async () => {
            await repository.delete("ABCD12");

            expect(redisService.del).toHaveBeenCalledWith("room:ABCD12:users", "room:ABCD12");
        });
    });

    describe("addMember", () => {
        test("should add member to set", async () => {
            await repository.addMember("ABCD12", "user-123");

            expect(redisService.sadd).toHaveBeenCalledWith("room:ABCD12:users", "user-123");
        });
    });

    describe("removeMember", () => {
        test("should remove member from set", async () => {
            await repository.removeMember("ABCD12", "user-123");

            expect(redisService.srem).toHaveBeenCalledWith("room:ABCD12:users", "user-123");
        });
    });

    describe("getMembers", () => {
        test("should return member IDs", async () => {
            redisService.smembers.mockResolvedValue(["user-1", "user-2"]);

            const result = await repository.getMembers("ABCD12");

            expect(result).toEqual(["user-1", "user-2"]);
            expect(redisService.smembers).toHaveBeenCalledWith("room:ABCD12:users");
        });
    });

    describe("isMember", () => {
        test("should return true when user is member", async () => {
            redisService.sismember.mockResolvedValue(true);

            const result = await repository.isMember("ABCD12", "user-123");

            expect(result).toBe(true);
            expect(redisService.sismember).toHaveBeenCalledWith("room:ABCD12:users", "user-123");
        });

        test("should return false when user is not member", async () => {
            redisService.sismember.mockResolvedValue(false);

            const result = await repository.isMember("ABCD12", "unknown");

            expect(result).toBe(false);
        });
    });

    describe("setMembersTtl", () => {
        test("should set TTL on members set", async () => {
            await repository.setMembersTtl("ABCD12", 3600);

            expect(redisService.expire).toHaveBeenCalledWith("room:ABCD12:users", 3600);
        });
    });

    describe("reserveRoomCode", () => {
        test("should return true when code is successfully reserved", async () => {
            redisService.setIfNotExists.mockResolvedValue(true);

            const result = await repository.reserveRoomCode("ABCD12", 3600);

            expect(result).toBe(true);
            expect(redisService.setIfNotExists).toHaveBeenCalledWith(
                "room:ABCD12",
                JSON.stringify({ code: "ABCD12" }),
                3600,
            );
        });

        test("should return false when code already exists", async () => {
            redisService.setIfNotExists.mockResolvedValue(false);

            const result = await repository.reserveRoomCode("ABCD12", 3600);

            expect(result).toBe(false);
        });
    });
});
