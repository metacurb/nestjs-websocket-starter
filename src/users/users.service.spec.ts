import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";

import { ConfigService } from "../config/config.service";
import { UserNotFoundException } from "./exceptions/user.exceptions";
import type { UserStoreModel } from "./model/user-store.model";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

describe("UsersService", () => {
    let service: UsersService;
    let usersRepository: jest.Mocked<UsersRepository>;
    let configService: jest.Mocked<ConfigService>;

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
                UsersService,
                {
                    provide: PinoLogger,
                    useValue: createMock<PinoLogger>(),
                },
                {
                    provide: UsersRepository,
                    useValue: createMock<UsersRepository>(),
                },
                {
                    provide: ConfigService,
                    useValue: createMock<ConfigService>(),
                },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
        usersRepository = module.get(UsersRepository);
        configService = module.get(ConfigService);

        Object.defineProperty(configService, "roomTtlSeconds", {
            get: () => 3600,
            configurable: true,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        test("should create and save a new user with generated id", async () => {
            const user = await service.create("ABCD12", "Test User");

            expect(user.id).toBeDefined();
            expect(user.displayName).toBe("Test User");
            expect(user.roomCode).toBe("ABCD12");
            expect(user.isConnected).toBe(false);
            expect(user.socketId).toBeNull();
            expect(usersRepository.save).toHaveBeenCalledWith(user, 3600);
        });

        test("should save user with custom TTL", async () => {
            const user = await service.create("ABCD12", "Test User", 7200);

            expect(usersRepository.save).toHaveBeenCalledWith(user, 7200);
        });
    });

    describe("getById", () => {
        test("should return user when found", async () => {
            const user = createMockUser();
            usersRepository.findById.mockResolvedValue(user);

            const result = await service.getById("user-123");

            expect(result).toEqual(user);
            expect(usersRepository.findById).toHaveBeenCalledWith("user-123");
        });

        test("should throw UserNotFoundException when user not found", async () => {
            usersRepository.findById.mockResolvedValue(null);

            await expect(service.getById("unknown")).rejects.toThrow(UserNotFoundException);
        });
    });

    describe("findById", () => {
        test("should return user when found", async () => {
            const user = createMockUser();
            usersRepository.findById.mockResolvedValue(user);

            const result = await service.findById("user-123");

            expect(result).toEqual(user);
        });

        test("should return null when user not found", async () => {
            usersRepository.findById.mockResolvedValue(null);

            const result = await service.findById("unknown");

            expect(result).toBeNull();
        });
    });

    describe("updateConnection", () => {
        test("should update user to connected state", async () => {
            const user = createMockUser({ isConnected: false, socketId: null });
            usersRepository.findById.mockResolvedValue(user);

            const result = await service.updateConnection("user-123", "socket-456");

            expect(result.isConnected).toBe(true);
            expect(result.socketId).toBe("socket-456");
            expect(usersRepository.save).toHaveBeenCalledWith({
                ...user,
                isConnected: true,
                socketId: "socket-456",
            });
        });

        test("should throw UserNotFoundException when user not found", async () => {
            usersRepository.findById.mockResolvedValue(null);

            await expect(service.updateConnection("unknown", "socket")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("updateDisconnection", () => {
        test("should update user to disconnected state", async () => {
            const user = createMockUser({ isConnected: true, socketId: "socket-456" });
            usersRepository.findById.mockResolvedValue(user);

            const result = await service.updateDisconnection("user-123");

            expect(result.isConnected).toBe(false);
            expect(result.socketId).toBeNull();
            expect(usersRepository.save).toHaveBeenCalledWith({
                ...user,
                isConnected: false,
                socketId: null,
            });
        });

        test("should throw UserNotFoundException when user not found", async () => {
            usersRepository.findById.mockResolvedValue(null);

            await expect(service.updateDisconnection("unknown")).rejects.toThrow(
                UserNotFoundException,
            );
        });
    });

    describe("delete", () => {
        test("should delete user", async () => {
            await service.delete("user-123");

            expect(usersRepository.delete).toHaveBeenCalledWith("user-123");
        });
    });

    describe("findByIds", () => {
        test("should return users for multiple ids", async () => {
            const user1 = createMockUser({ id: "user-1" });
            const user2 = createMockUser({ id: "user-2" });
            usersRepository.findByIds.mockResolvedValue([user1, user2]);

            const result = await service.findByIds(["user-1", "user-2"]);

            expect(result).toEqual([user1, user2]);
            expect(usersRepository.findByIds).toHaveBeenCalledWith(["user-1", "user-2"]);
        });

        test("should filter out null users", async () => {
            const user1 = createMockUser({ id: "user-1" });
            usersRepository.findByIds.mockResolvedValue([user1, null]);

            const result = await service.findByIds(["user-1", "user-2"]);

            expect(result).toEqual([user1]);
        });

        test("should return empty array when no users found", async () => {
            usersRepository.findByIds.mockResolvedValue([null, null]);

            const result = await service.findByIds(["user-1", "user-2"]);

            expect(result).toEqual([]);
        });
    });

    describe("deleteMany", () => {
        test("should delete multiple users", async () => {
            await service.deleteMany(["user-1", "user-2", "user-3"]);

            expect(usersRepository.delete).toHaveBeenCalledWith("user-1", "user-2", "user-3");
        });

        test("should handle empty array", async () => {
            await service.deleteMany([]);

            expect(usersRepository.delete).toHaveBeenCalledWith();
        });
    });
});
