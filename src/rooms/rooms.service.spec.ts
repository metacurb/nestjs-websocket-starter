import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";

import { JwtAuthService } from "../auth/jwt-auth.service";
import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
} from "../common/exceptions/room.exceptions";
import { ConfigService } from "../config/config.service";
import { RedisService } from "../redis/redis.service";
import type { UserStoreModel } from "../users/model/user-store.model";
import { UsersService } from "../users/users.service";
import type { RoomStoreModel } from "./model/store/room-store.model";
import { RoomsService } from "./rooms.service";

describe("RoomsService", () => {
    let service: RoomsService;
    let redisService: jest.Mocked<RedisService>;
    let jwtAuthService: jest.Mocked<JwtAuthService>;
    let configService: jest.Mocked<ConfigService>;
    let usersService: jest.Mocked<UsersService>;

    const createMockUser = (overrides: Partial<UserStoreModel> = {}): UserStoreModel => ({
        displayName: "Test User",
        id: "user-123",
        isConnected: false,
        roomCode: "ABCD12",
        socketId: null,
        ...overrides,
    });

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
                RoomsService,
                {
                    provide: PinoLogger,
                    useValue: createMock<PinoLogger>(),
                },
                {
                    provide: RedisService,
                    useValue: createMock<RedisService>(),
                },
                {
                    provide: JwtAuthService,
                    useValue: createMock<JwtAuthService>(),
                },
                {
                    provide: ConfigService,
                    useValue: createMock<ConfigService>(),
                },
                {
                    provide: UsersService,
                    useValue: createMock<UsersService>(),
                },
            ],
        }).compile();

        service = module.get<RoomsService>(RoomsService);
        redisService = module.get(RedisService);
        jwtAuthService = module.get(JwtAuthService);
        configService = module.get(ConfigService);
        usersService = module.get(UsersService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("getByCode", () => {
        test("should return room when found", async () => {
            const room = createMockRoom();
            redisService.getJson.mockResolvedValue(room);

            const result = await service.getByCode("ABCD12");

            expect(result).toBe(room);
            expect(redisService.getJson).toHaveBeenCalledWith("room:ABCD12");
        });

        test("should throw RoomNotFoundException when room not found", async () => {
            redisService.getJson.mockResolvedValue(null);

            await expect(service.getByCode("NOTFOUND")).rejects.toThrow(RoomNotFoundException);
        });
    });

    describe("getRoomMember", () => {
        test("should return user when found", async () => {
            const user = createMockUser();
            usersService.getById.mockResolvedValue(user);

            const result = await service.getRoomMember("user-123");

            expect(result).toBe(user);
            expect(usersService.getById).toHaveBeenCalledWith("user-123");
        });

        test("should throw UserNotFoundException when user not found", async () => {
            usersService.getById.mockRejectedValue(new UserNotFoundException());

            await expect(service.getRoomMember("unknown")).rejects.toThrow(UserNotFoundException);
        });
    });

    describe("getRoomMembers", () => {
        test("should return members array when found", async () => {
            const members = ["user-1", "user-2"];
            redisService.smembers.mockResolvedValue(members);

            const result = await service.getRoomMembers("ABCD12");

            expect(result).toEqual(members);
            expect(redisService.smembers).toHaveBeenCalledWith("room:ABCD12:users");
        });

        test("should return empty array when no members found", async () => {
            redisService.smembers.mockResolvedValue([]);

            const result = await service.getRoomMembers("ABCD12");

            expect(result).toEqual([]);
        });
    });

    describe("isMember", () => {
        test("should return true when user is a member", async () => {
            redisService.sismember.mockResolvedValue(true);

            const result = await service.isMember("ABCD12", "user-1");

            expect(result).toBe(true);
            expect(redisService.sismember).toHaveBeenCalledWith("room:ABCD12:users", "user-1");
        });

        test("should return false when user is not a member", async () => {
            redisService.sismember.mockResolvedValue(false);

            const result = await service.isMember("ABCD12", "user-3");

            expect(result).toBe(false);
        });
    });

    describe("getRoomMembersWithDetails", () => {
        test("should return array of user details for all members", async () => {
            const user1 = createMockUser({ id: "user-1", displayName: "User 1" });
            const user2 = createMockUser({ id: "user-2", displayName: "User 2" });
            redisService.smembers.mockResolvedValue(["user-1", "user-2"]);
            usersService.findById.mockResolvedValueOnce(user1).mockResolvedValueOnce(user2);

            const result = await service.getRoomMembersWithDetails("ABCD12");

            expect(result).toEqual([user1, user2]);
            expect(redisService.smembers).toHaveBeenCalledWith("room:ABCD12:users");
            expect(usersService.findById).toHaveBeenCalledWith("user-1");
            expect(usersService.findById).toHaveBeenCalledWith("user-2");
        });

        test("should filter out null users", async () => {
            const user1 = createMockUser({ id: "user-1", displayName: "User 1" });
            redisService.smembers.mockResolvedValue(["user-1", "user-2"]);
            usersService.findById.mockResolvedValueOnce(user1).mockResolvedValueOnce(null);

            const result = await service.getRoomMembersWithDetails("ABCD12");

            expect(result).toEqual([user1]);
        });

        test("should return empty array when no members", async () => {
            redisService.smembers.mockResolvedValue([]);

            const result = await service.getRoomMembersWithDetails("ABCD12");

            expect(result).toEqual([]);
        });
    });

    describe("create", () => {
        const mockRoomTtl = 3600;

        beforeEach(() => {
            Object.defineProperty(configService, "roomCodeAlphabet", {
                get: () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                configurable: true,
            });
            Object.defineProperty(configService, "roomCodeLength", {
                get: () => 6,
                configurable: true,
            });
            Object.defineProperty(configService, "roomTtlSeconds", {
                get: () => mockRoomTtl,
                configurable: true,
            });
        });

        test("should create a new room with host user", async () => {
            const mockUser = createMockUser();
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("test-token");

            const result = await service.create({
                displayName: "Host User",
                maxUsers: 5,
            });

            expect(result.roomCode).toBeDefined();
            expect(result.token).toBe("test-token");
            expect(redisService.setJson).toHaveBeenCalledTimes(1); // Only room now
            expect(usersService.create).toHaveBeenCalled();
            expect(redisService.sadd).toHaveBeenCalled();
            expect(jwtAuthService.sign).toHaveBeenCalled();
        });

        test("should set TTL on room, user, and members set", async () => {
            const mockUser = createMockUser();
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("test-token");

            const result = await service.create({
                displayName: "Host User",
                maxUsers: 5,
            });

            // Room should have TTL
            expect(redisService.setJson).toHaveBeenCalledWith(
                `room:${result.roomCode}`,
                expect.objectContaining({ code: result.roomCode }),
                mockRoomTtl,
            );

            // User should have TTL via usersService.create
            expect(usersService.create).toHaveBeenCalledWith(
                result.roomCode,
                "Host User",
                mockRoomTtl,
            );

            // Members set should have expire called
            expect(redisService.expire).toHaveBeenCalledWith(
                `room:${result.roomCode}:users`,
                mockRoomTtl,
            );
        });
    });

    describe("join", () => {
        const mockRoomTtl = 3600;

        beforeEach(() => {
            Object.defineProperty(configService, "roomTtlSeconds", {
                get: () => mockRoomTtl,
                configurable: true,
            });
        });

        test("should add new member to existing room", async () => {
            const room = createMockRoom();
            const mockUser = createMockUser({ displayName: "New User" });
            redisService.getJson.mockResolvedValueOnce(room);
            redisService.smembers.mockResolvedValueOnce(["host-123"]);
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("new-user-token");

            const result = await service.join("ABCD12", "New User");

            expect(result.roomCode).toBe("ABCD12");
            expect(result.token).toBe("new-user-token");
            expect(usersService.create).toHaveBeenCalledTimes(1);
            expect(redisService.sadd).toHaveBeenCalled();
        });

        test("should set TTL on new user", async () => {
            const room = createMockRoom();
            const mockUser = createMockUser({ displayName: "New User" });
            redisService.getJson.mockResolvedValueOnce(room);
            redisService.smembers.mockResolvedValueOnce(["host-123"]);
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("new-user-token");

            await service.join("ABCD12", "New User");

            expect(usersService.create).toHaveBeenCalledWith("ABCD12", "New User", mockRoomTtl);
        });

        test("should throw InvalidOperationException when room is locked", async () => {
            const room = createMockRoom({ isLocked: true });
            redisService.getJson.mockResolvedValueOnce(room);
            redisService.smembers.mockResolvedValueOnce([]);

            await expect(service.join("ABCD12", "User")).rejects.toThrow(InvalidOperationException);
        });

        test("should throw InvalidOperationException when room is full", async () => {
            const room = createMockRoom({ maxUsers: 2 });
            redisService.getJson.mockResolvedValueOnce(room);
            redisService.smembers.mockResolvedValueOnce(["user-1", "user-2"]);

            await expect(service.join("ABCD12", "User")).rejects.toThrow(InvalidOperationException);
        });

        test("should throw RoomNotFoundException when room does not exist", async () => {
            redisService.getJson.mockResolvedValue(null);

            await expect(service.join("NOTFOUND", "User")).rejects.toThrow(RoomNotFoundException);
        });
    });

    describe("rejoin", () => {
        test("should return new session for existing member", async () => {
            const user = createMockUser();
            redisService.smembers.mockResolvedValueOnce(["user-123"]);
            usersService.findById.mockResolvedValueOnce(user);
            jwtAuthService.sign.mockReturnValue("rejoin-token");

            const result = await service.rejoin("ABCD12", "user-123");

            expect(result.roomCode).toBe("ABCD12");
            expect(result.token).toBe("rejoin-token");
        });

        test("should throw UserNotFoundException when user is not a member", async () => {
            redisService.smembers.mockResolvedValueOnce(["other-user"]);

            await expect(service.rejoin("ABCD12", "user-123")).rejects.toThrow(
                UserNotFoundException,
            );
        });

        test("should throw UserNotFoundException when user data not found", async () => {
            redisService.smembers.mockResolvedValueOnce(["user-123"]);
            usersService.findById.mockResolvedValueOnce(null);

            await expect(service.rejoin("ABCD12", "user-123")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("leave", () => {
        test("should remove member from room", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.smembers.mockResolvedValueOnce(["host-123", "user-123"]);
            redisService.getJson.mockResolvedValueOnce(room);

            await service.leave("ABCD12", "user-123");

            expect(redisService.srem).toHaveBeenCalledWith("room:ABCD12:users", "user-123");
        });

        test("should throw UserNotFoundException when user not in room", async () => {
            redisService.smembers.mockResolvedValueOnce(["other-user"]);

            await expect(service.leave("ABCD12", "user-123")).rejects.toThrow(
                UserNotFoundException,
            );
        });

        test("should transfer host when host leaves and other members exist", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.smembers.mockResolvedValueOnce(["host-123", "user-123"]);
            redisService.getJson
                .mockResolvedValueOnce(room) // getByCode in leave
                .mockResolvedValueOnce(room); // getByCode in updateHost
            redisService.sismember.mockResolvedValueOnce(true);

            await service.leave("ABCD12", "host-123");

            expect(redisService.srem).toHaveBeenCalledWith("room:ABCD12:users", "host-123");
            expect(redisService.setJson).toHaveBeenCalledWith(
                "room:ABCD12",
                expect.objectContaining({ hostId: "user-123" }),
            );
        });
    });

    describe("kick", () => {
        test("should remove kicked member from room", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            const memberToKick = createMockUser({ id: "user-123", socketId: "socket-456" });
            redisService.getJson.mockResolvedValueOnce(room);
            usersService.findById.mockResolvedValueOnce(memberToKick);

            const result = await service.kick("host-123", "ABCD12", "user-123");

            expect(result.kickedSocketId).toBe("socket-456");
            expect(usersService.delete).toHaveBeenCalledWith("user-123");
            expect(redisService.srem).toHaveBeenCalledWith("room:ABCD12:users", "user-123");
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValueOnce(room);

            await expect(service.kick("user-123", "ABCD12", "other-user")).rejects.toThrow(
                UnauthorizedHostActionException,
            );
        });

        test("should throw InvalidOperationException when trying to kick self", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValueOnce(room);

            await expect(service.kick("host-123", "ABCD12", "host-123")).rejects.toThrow(
                InvalidOperationException,
            );
        });

        test("should throw UserNotFoundException when member to kick not found", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValueOnce(room);
            usersService.findById.mockResolvedValueOnce(null);

            await expect(service.kick("host-123", "ABCD12", "unknown-user")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("updateConnectedUser", () => {
        test("should delegate to usersService.updateConnection", async () => {
            const updatedUser = createMockUser({ isConnected: true, socketId: "socket-456" });
            usersService.updateConnection.mockResolvedValue(updatedUser);

            const result = await service.updateConnectedUser("user-123", "socket-456");

            expect(result).toBe(updatedUser);
            expect(usersService.updateConnection).toHaveBeenCalledWith("user-123", "socket-456");
        });

        test("should throw UserNotFoundException when user not found", async () => {
            usersService.updateConnection.mockRejectedValue(new UserNotFoundException());

            await expect(service.updateConnectedUser("unknown", "socket")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("updateDisconnectedUser", () => {
        test("should delegate to usersService.updateDisconnection", async () => {
            const updatedUser = createMockUser({ isConnected: false, socketId: null });
            usersService.updateDisconnection.mockResolvedValue(updatedUser);

            const result = await service.updateDisconnectedUser("user-123");

            expect(result).toBe(updatedUser);
            expect(usersService.updateDisconnection).toHaveBeenCalledWith("user-123");
        });

        test("should throw UserNotFoundException when user not found", async () => {
            usersService.updateDisconnection.mockRejectedValue(new UserNotFoundException());

            await expect(service.updateDisconnectedUser("unknown")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("updateHost", () => {
        test("should transfer host to another member", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValueOnce(room);
            redisService.sismember.mockResolvedValueOnce(true);

            const result = await service.updateHost("host-123", "ABCD12", "user-123");

            expect(result.hostId).toBe("user-123");
            expect(redisService.setJson).toHaveBeenCalledWith("room:ABCD12", {
                ...room,
                hostId: "user-123",
            });
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValueOnce(room);

            await expect(service.updateHost("user-123", "ABCD12", "other-user")).rejects.toThrow(
                UnauthorizedHostActionException,
            );
        });

        test("should throw InvalidOperationException when already host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValueOnce(room);

            await expect(service.updateHost("host-123", "ABCD12", "host-123")).rejects.toThrow(
                InvalidOperationException,
            );
        });

        test("should throw UserNotFoundException when target not a member", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValueOnce(room);
            redisService.sismember.mockResolvedValueOnce(false);

            await expect(service.updateHost("host-123", "ABCD12", "unknown-user")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("toggleLock", () => {
        test("should toggle room lock from false to true", async () => {
            const room = createMockRoom({ isLocked: false });
            redisService.getJson.mockResolvedValue(room);

            const result = await service.toggleLock("host-123", "ABCD12");

            expect(result.isLocked).toBe(true);
            expect(redisService.setJson).toHaveBeenCalledWith("room:ABCD12", {
                ...room,
                isLocked: true,
            });
        });

        test("should toggle room lock from true to false", async () => {
            const room = createMockRoom({ isLocked: true });
            redisService.getJson.mockResolvedValue(room);

            const result = await service.toggleLock("host-123", "ABCD12");

            expect(result.isLocked).toBe(false);
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValue(room);

            await expect(service.toggleLock("user-123", "ABCD12")).rejects.toThrow(
                UnauthorizedHostActionException,
            );
        });

        test("should throw RoomNotFoundException when room not found", async () => {
            redisService.getJson.mockResolvedValue(null);

            await expect(service.toggleLock("host-123", "NOTFOUND")).rejects.toThrow(
                RoomNotFoundException,
            );
        });
    });

    describe("close", () => {
        test("should close room and delete all data via transaction", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            const mockMulti = {
                del: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue([]),
            };
            redisService.getJson.mockResolvedValueOnce(room);
            redisService.smembers.mockResolvedValueOnce(["host-123", "user-1", "user-2"]);
            redisService.multi.mockReturnValue(mockMulti as never);

            await service.close("host-123", "ABCD12");

            expect(mockMulti.del).toHaveBeenCalledWith("user:host-123");
            expect(mockMulti.del).toHaveBeenCalledWith("user:user-1");
            expect(mockMulti.del).toHaveBeenCalledWith("user:user-2");
            expect(mockMulti.del).toHaveBeenCalledWith("room:ABCD12:users");
            expect(mockMulti.del).toHaveBeenCalledWith("room:ABCD12");
            expect(mockMulti.exec).toHaveBeenCalled();
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            redisService.getJson.mockResolvedValueOnce(room);

            await expect(service.close("user-123", "ABCD12")).rejects.toThrow(
                UnauthorizedHostActionException,
            );
        });

        test("should throw RoomNotFoundException when room not found", async () => {
            redisService.getJson.mockResolvedValueOnce(null);

            await expect(service.close("host-123", "NOTFOUND")).rejects.toThrow(
                RoomNotFoundException,
            );
        });
    });

    describe("deleteRoom", () => {
        test("should delete room and all member data", async () => {
            redisService.smembers.mockResolvedValue(["user-1", "user-2"]);

            await service.deleteRoom("ABCD12");

            expect(usersService.delete).toHaveBeenCalledWith("user-1");
            expect(usersService.delete).toHaveBeenCalledWith("user-2");
            expect(redisService.del).toHaveBeenCalledWith("room:ABCD12:users");
            expect(redisService.del).toHaveBeenCalledWith("room:ABCD12");
        });

        test("should handle room with no members", async () => {
            redisService.smembers.mockResolvedValue([]);

            await service.deleteRoom("ABCD12");

            expect(redisService.del).toHaveBeenCalledWith("room:ABCD12:users");
            expect(redisService.del).toHaveBeenCalledWith("room:ABCD12");
        });
    });
});
