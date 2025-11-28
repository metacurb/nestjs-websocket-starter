import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";

import { JwtAuthService } from "../auth/jwt-auth.service";
import { ConfigService } from "../config/config.service";
import { UserNotFoundException } from "../users/exceptions/user.exceptions";
import type { UserStoreModel } from "../users/model/user-store.model";
import { UsersService } from "../users/users.service";
import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "./exceptions/room.exceptions";
import type { RoomStoreModel } from "./model/store/room-store.model";
import { RoomsRepository } from "./rooms.repository";
import { RoomsService } from "./rooms.service";

describe("RoomsService", () => {
    let service: RoomsService;
    let roomsRepository: jest.Mocked<RoomsRepository>;
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
                    provide: RoomsRepository,
                    useValue: createMock<RoomsRepository>(),
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
        roomsRepository = module.get(RoomsRepository);
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
            roomsRepository.findByCode.mockResolvedValue(room);

            const result = await service.getByCode("ABCD12");

            expect(result).toBe(room);
            expect(roomsRepository.findByCode).toHaveBeenCalledWith("ABCD12");
        });

        test("should throw RoomNotFoundException when room not found", async () => {
            roomsRepository.findByCode.mockResolvedValue(null);

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
            roomsRepository.getMembers.mockResolvedValue(members);

            const result = await service.getRoomMembers("ABCD12");

            expect(result).toEqual(members);
            expect(roomsRepository.getMembers).toHaveBeenCalledWith("ABCD12");
        });

        test("should return empty array when no members found", async () => {
            roomsRepository.getMembers.mockResolvedValue([]);

            const result = await service.getRoomMembers("ABCD12");

            expect(result).toEqual([]);
        });
    });

    describe("isMember", () => {
        test("should return true when user is a member", async () => {
            roomsRepository.isMember.mockResolvedValue(true);

            const result = await service.isMember("ABCD12", "user-1");

            expect(result).toBe(true);
            expect(roomsRepository.isMember).toHaveBeenCalledWith("ABCD12", "user-1");
        });

        test("should return false when user is not a member", async () => {
            roomsRepository.isMember.mockResolvedValue(false);

            const result = await service.isMember("ABCD12", "user-3");

            expect(result).toBe(false);
        });
    });

    describe("getRoomMembersWithDetails", () => {
        test("should return array of user details for all members", async () => {
            const user1 = createMockUser({ id: "user-1", displayName: "User 1" });
            const user2 = createMockUser({ id: "user-2", displayName: "User 2" });
            roomsRepository.getMembers.mockResolvedValue(["user-1", "user-2"]);
            usersService.findByIds.mockResolvedValue([user1, user2]);

            const result = await service.getRoomMembersWithDetails("ABCD12");

            expect(result).toEqual([user1, user2]);
            expect(roomsRepository.getMembers).toHaveBeenCalledWith("ABCD12");
            expect(usersService.findByIds).toHaveBeenCalledWith(["user-1", "user-2"]);
        });

        test("should filter out null users", async () => {
            const user1 = createMockUser({ id: "user-1", displayName: "User 1" });
            roomsRepository.getMembers.mockResolvedValue(["user-1", "user-2"]);
            usersService.findByIds.mockResolvedValue([user1]);

            const result = await service.getRoomMembersWithDetails("ABCD12");

            expect(result).toEqual([user1]);
        });

        test("should return empty array when no members", async () => {
            roomsRepository.getMembers.mockResolvedValue([]);
            usersService.findByIds.mockResolvedValue([]);

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
            roomsRepository.reserveRoomCode.mockResolvedValue(true);
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("test-token");

            const result = await service.create({
                displayName: "Host User",
                maxUsers: 5,
            });

            expect(result.roomCode).toBeDefined();
            expect(result.token).toBe("test-token");
            expect(roomsRepository.reserveRoomCode).toHaveBeenCalled();
            expect(roomsRepository.save).toHaveBeenCalled();
            expect(usersService.create).toHaveBeenCalled();
            expect(roomsRepository.addMember).toHaveBeenCalled();
            expect(jwtAuthService.sign).toHaveBeenCalled();
        });

        test("should set TTL on room, user, and members set", async () => {
            const mockUser = createMockUser();
            roomsRepository.reserveRoomCode.mockResolvedValue(true);
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("test-token");

            const result = await service.create({
                displayName: "Host User",
                maxUsers: 5,
            });

            // Room code reservation should use TTL
            expect(roomsRepository.reserveRoomCode).toHaveBeenCalledWith(
                expect.any(String),
                mockRoomTtl,
            );

            // Room should have TTL
            expect(roomsRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ code: result.roomCode }),
                mockRoomTtl,
            );

            // User should have TTL via usersService.create
            expect(usersService.create).toHaveBeenCalledWith(
                result.roomCode,
                "Host User",
                mockRoomTtl,
            );

            // Members set should have TTL
            expect(roomsRepository.setMembersTtl).toHaveBeenCalledWith(
                result.roomCode,
                mockRoomTtl,
            );
        });

        test("should retry room code reservation when code already taken", async () => {
            const mockUser = createMockUser();
            roomsRepository.reserveRoomCode
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("test-token");

            const result = await service.create({
                displayName: "Host User",
                maxUsers: 5,
            });

            expect(result.roomCode).toBeDefined();
            expect(roomsRepository.reserveRoomCode).toHaveBeenCalledTimes(3);
        });

        test("should throw InvalidOperationException after max reservation attempts", async () => {
            roomsRepository.reserveRoomCode.mockResolvedValue(false);

            await expect(
                service.create({
                    displayName: "Host User",
                    maxUsers: 5,
                }),
            ).rejects.toThrow(InvalidOperationException);
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
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            roomsRepository.getMembers.mockResolvedValueOnce(["host-123"]);
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("new-user-token");

            const result = await service.join("ABCD12", "New User");

            expect(result.roomCode).toBe("ABCD12");
            expect(result.token).toBe("new-user-token");
            expect(usersService.create).toHaveBeenCalledTimes(1);
            expect(roomsRepository.addMember).toHaveBeenCalled();
        });

        test("should set TTL on new user", async () => {
            const room = createMockRoom();
            const mockUser = createMockUser({ displayName: "New User" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            roomsRepository.getMembers.mockResolvedValueOnce(["host-123"]);
            usersService.create.mockResolvedValue(mockUser);
            jwtAuthService.sign.mockReturnValue("new-user-token");

            await service.join("ABCD12", "New User");

            expect(usersService.create).toHaveBeenCalledWith("ABCD12", "New User", mockRoomTtl);
        });

        test("should throw InvalidOperationException when room is locked", async () => {
            const room = createMockRoom({ isLocked: true });
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            roomsRepository.getMembers.mockResolvedValueOnce([]);

            await expect(service.join("ABCD12", "User")).rejects.toThrow(InvalidOperationException);
        });

        test("should throw InvalidOperationException when room is full", async () => {
            const room = createMockRoom({ maxUsers: 2 });
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            roomsRepository.getMembers.mockResolvedValueOnce(["user-1", "user-2"]);

            await expect(service.join("ABCD12", "User")).rejects.toThrow(InvalidOperationException);
        });

        test("should throw RoomNotFoundException when room does not exist", async () => {
            roomsRepository.findByCode.mockResolvedValue(null);

            await expect(service.join("NOTFOUND", "User")).rejects.toThrow(RoomNotFoundException);
        });
    });

    describe("rejoin", () => {
        test("should return new session for existing member", async () => {
            const user = createMockUser();
            roomsRepository.getMembers.mockResolvedValueOnce(["user-123"]);
            usersService.getById.mockResolvedValueOnce(user);
            jwtAuthService.sign.mockReturnValue("rejoin-token");

            const result = await service.rejoin("ABCD12", "user-123");

            expect(result.roomCode).toBe("ABCD12");
            expect(result.token).toBe("rejoin-token");
        });

        test("should throw UserNotFoundException when user is not a member", async () => {
            roomsRepository.getMembers.mockResolvedValueOnce(["other-user"]);

            await expect(service.rejoin("ABCD12", "user-123")).rejects.toThrow(
                UserNotFoundException,
            );
        });

        test("should throw UserNotFoundException when user data not found", async () => {
            roomsRepository.getMembers.mockResolvedValueOnce(["user-123"]);
            usersService.getById.mockRejectedValueOnce(new UserNotFoundException());

            await expect(service.rejoin("ABCD12", "user-123")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("leave", () => {
        test("should remove member from room and delete user", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.isMember.mockResolvedValueOnce(true);
            roomsRepository.findByCode.mockResolvedValueOnce(room);

            await service.leave("ABCD12", "user-123");

            expect(roomsRepository.removeMember).toHaveBeenCalledWith("ABCD12", "user-123");
            expect(usersService.delete).toHaveBeenCalledWith("user-123");
        });

        test("should throw UserNotFoundException when user not in room", async () => {
            roomsRepository.isMember.mockResolvedValueOnce(false);

            await expect(service.leave("ABCD12", "user-123")).rejects.toThrow(
                UserNotFoundException,
            );
        });

        test("should transfer host when host leaves and other members exist", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.isMember.mockResolvedValueOnce(true);
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            // After removal, remaining members are fetched
            roomsRepository.getMembers.mockResolvedValueOnce(["user-123"]);

            await service.leave("ABCD12", "host-123");

            expect(roomsRepository.removeMember).toHaveBeenCalledWith("ABCD12", "host-123");
            expect(usersService.delete).toHaveBeenCalledWith("host-123");
            expect(roomsRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ hostId: "user-123" }),
            );
        });

        test("should delete room when last member (host) leaves", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.isMember.mockResolvedValueOnce(true);
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            // No remaining members
            roomsRepository.getMembers.mockResolvedValueOnce([]);

            await service.leave("ABCD12", "host-123");

            expect(roomsRepository.removeMember).toHaveBeenCalledWith("ABCD12", "host-123");
            expect(usersService.delete).toHaveBeenCalledWith("host-123");
            expect(roomsRepository.delete).toHaveBeenCalledWith("ABCD12");
        });

        test("should handle room no longer existing during leave", async () => {
            roomsRepository.isMember.mockResolvedValueOnce(true);
            roomsRepository.findByCode.mockResolvedValueOnce(null);

            await service.leave("ABCD12", "user-123");

            expect(roomsRepository.removeMember).toHaveBeenCalledWith("ABCD12", "user-123");
            expect(usersService.delete).toHaveBeenCalledWith("user-123");
            // Should not try to transfer host or delete room
            expect(roomsRepository.save).not.toHaveBeenCalled();
        });
    });

    describe("kick", () => {
        test("should remove kicked member from room", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            const memberToKick = createMockUser({ id: "user-123", socketId: "socket-456" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            usersService.getById.mockResolvedValueOnce(memberToKick);

            const result = await service.kick("host-123", "ABCD12", "user-123");

            expect(result.kickedSocketId).toBe("socket-456");
            expect(usersService.delete).toHaveBeenCalledWith("user-123");
            expect(roomsRepository.removeMember).toHaveBeenCalledWith("ABCD12", "user-123");
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);

            await expect(service.kick("user-123", "ABCD12", "other-user")).rejects.toThrow(
                UnauthorizedHostActionException,
            );
        });

        test("should throw InvalidOperationException when trying to kick self", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);

            await expect(service.kick("host-123", "ABCD12", "host-123")).rejects.toThrow(
                InvalidOperationException,
            );
        });

        test("should throw UserNotFoundException when member to kick not found", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            usersService.getById.mockRejectedValueOnce(new UserNotFoundException());

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
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            roomsRepository.isMember.mockResolvedValueOnce(true);

            const result = await service.updateHost("host-123", "ABCD12", "user-123");

            expect(result.hostId).toBe("user-123");
            expect(roomsRepository.save).toHaveBeenCalledWith({
                ...room,
                hostId: "user-123",
            });
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);

            await expect(service.updateHost("user-123", "ABCD12", "other-user")).rejects.toThrow(
                UnauthorizedHostActionException,
            );
        });

        test("should throw InvalidOperationException when already host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);

            await expect(service.updateHost("host-123", "ABCD12", "host-123")).rejects.toThrow(
                InvalidOperationException,
            );
        });

        test("should throw UserNotFoundException when target not a member", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            roomsRepository.isMember.mockResolvedValueOnce(false);

            await expect(service.updateHost("host-123", "ABCD12", "unknown-user")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("toggleLock", () => {
        test("should toggle room lock from false to true", async () => {
            const room = createMockRoom({ isLocked: false });
            roomsRepository.findByCode.mockResolvedValue(room);

            const result = await service.toggleLock("host-123", "ABCD12");

            expect(result.isLocked).toBe(true);
            expect(roomsRepository.save).toHaveBeenCalledWith({
                ...room,
                isLocked: true,
            });
        });

        test("should toggle room lock from true to false", async () => {
            const room = createMockRoom({ isLocked: true });
            roomsRepository.findByCode.mockResolvedValue(room);

            const result = await service.toggleLock("host-123", "ABCD12");

            expect(result.isLocked).toBe(false);
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValue(room);

            await expect(service.toggleLock("user-123", "ABCD12")).rejects.toThrow(
                UnauthorizedHostActionException,
            );
        });

        test("should throw RoomNotFoundException when room not found", async () => {
            roomsRepository.findByCode.mockResolvedValue(null);

            await expect(service.toggleLock("host-123", "NOTFOUND")).rejects.toThrow(
                RoomNotFoundException,
            );
        });
    });

    describe("close", () => {
        test("should close room and delete all users and room", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);
            roomsRepository.getMembers.mockResolvedValueOnce(["host-123", "user-1", "user-2"]);

            await service.close("host-123", "ABCD12");

            expect(usersService.deleteMany).toHaveBeenCalledWith(["host-123", "user-1", "user-2"]);
            expect(roomsRepository.delete).toHaveBeenCalledWith("ABCD12");
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const room = createMockRoom({ hostId: "host-123" });
            roomsRepository.findByCode.mockResolvedValueOnce(room);

            await expect(service.close("user-123", "ABCD12")).rejects.toThrow(
                UnauthorizedHostActionException,
            );
        });

        test("should throw RoomNotFoundException when room not found", async () => {
            roomsRepository.findByCode.mockResolvedValueOnce(null);

            await expect(service.close("host-123", "NOTFOUND")).rejects.toThrow(
                RoomNotFoundException,
            );
        });
    });
});
