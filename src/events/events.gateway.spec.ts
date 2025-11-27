import type { DeepMocked } from "@golevelup/ts-jest";
import { createMock } from "@golevelup/ts-jest";
import { UnauthorizedException } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import type { Server, Socket } from "socket.io";

import { JwtAuthService } from "../auth/jwt-auth.service";
import type { RoomStoreModel } from "../rooms/model/store/room-store.model";
import { RoomsService } from "../rooms/rooms.service";
import type { UserStoreModel } from "../users/model/user-store.model";
import { EventsGateway } from "./events.gateway";

describe("EventsGateway", () => {
    let gateway: EventsGateway;
    let roomsService: DeepMocked<RoomsService>;
    let jwtAuthService: DeepMocked<JwtAuthService>;
    let mockSocket: DeepMocked<Socket>;
    let mockServer: DeepMocked<Server>;

    const createMockUser = (overrides: Partial<UserStoreModel> = {}): UserStoreModel => ({
        displayName: "Test User",
        id: "user-123",
        isConnected: true,
        roomCode: "ABCD12",
        socketId: "socket-123",
        ...overrides,
    });

    const createMockRoom = (overrides: Partial<RoomStoreModel> = {}): RoomStoreModel => ({
        code: "ABCD12",
        hostId: "user-123",
        isLocked: false,
        maxUsers: 10,
        state: "CREATED",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    });

    beforeEach(async () => {
        mockSocket = createMock<Socket>({
            id: "socket-123",
            data: { userId: "user-123", roomCode: "ABCD12" },
            handshake: { auth: { token: "valid-token" } },
        });
        mockServer = createMock<Server>();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EventsGateway,
                {
                    provide: PinoLogger,
                    useValue: createMock<PinoLogger>(),
                },
                {
                    provide: RoomsService,
                    useValue: createMock<RoomsService>(),
                },
                {
                    provide: JwtAuthService,
                    useValue: createMock<JwtAuthService>(),
                },
            ],
        }).compile();

        gateway = module.get<EventsGateway>(EventsGateway);
        roomsService = module.get(RoomsService);
        jwtAuthService = module.get(JwtAuthService);

        gateway.server = mockServer;

        mockSocket.join.mockResolvedValue(undefined);
        mockServer.to.mockReturnThis();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("onKick", () => {
        test("should kick user, emit kicked event, and disconnect socket", async () => {
            const input = { kickUserId: "kicked-user-id" };
            roomsService.kick.mockResolvedValue({ kickedSocketId: "kicked-socket-id" });

            await gateway.onKick(mockSocket, input);

            expect(roomsService.kick).toHaveBeenCalledWith("user-123", "ABCD12", "kicked-user-id");
            expect(mockServer.to).toHaveBeenCalledWith("kicked-socket-id");
            expect(mockServer.emit).toHaveBeenCalledWith("user:kicked", null);
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.emit).toHaveBeenCalledWith("user:left", {
                reason: "KICKED",
                userId: "kicked-user-id",
            });
        });

        test("should not emit to kicked socket when socketId is null", async () => {
            const input = { kickUserId: "kicked-user-id" };
            roomsService.kick.mockResolvedValue({ kickedSocketId: null });

            await gateway.onKick(mockSocket, input);

            expect(mockServer.to).not.toHaveBeenCalledWith(null);
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
        });
    });

    describe("onUpdateHost", () => {
        test("should update host and emit room:host_updated", async () => {
            const input = { newHostId: "new-host-id" };
            const updatedRoom = createMockRoom({ hostId: "new-host-id" });
            roomsService.updateHost.mockResolvedValue(updatedRoom);

            await gateway.onUpdateHost(mockSocket, input);

            expect(roomsService.updateHost).toHaveBeenCalledWith(
                "user-123",
                "ABCD12",
                "new-host-id",
            );
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.emit).toHaveBeenCalledWith("room:host_updated", {
                hostId: "new-host-id",
            });
        });
    });

    describe("onToggleLock", () => {
        test("should toggle lock and emit room:locked with isLocked true", async () => {
            const updatedRoom = createMockRoom({ isLocked: true });
            roomsService.toggleLock.mockResolvedValue(updatedRoom);

            await gateway.onToggleLock(mockSocket);

            expect(roomsService.toggleLock).toHaveBeenCalledWith("user-123", "ABCD12");
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.emit).toHaveBeenCalledWith("room:lock_toggled", { isLocked: true });
        });

        test("should toggle lock and emit room:locked with isLocked false", async () => {
            const updatedRoom = createMockRoom({ isLocked: false });
            roomsService.toggleLock.mockResolvedValue(updatedRoom);

            await gateway.onToggleLock(mockSocket);

            expect(roomsService.toggleLock).toHaveBeenCalledWith("user-123", "ABCD12");
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.emit).toHaveBeenCalledWith("room:lock_toggled", { isLocked: false });
        });
    });

    describe("onLeave", () => {
        test("should leave room, disconnect user, and emit user:left", async () => {
            roomsService.leave.mockResolvedValue(undefined);

            await gateway.onLeave(mockSocket);

            expect(roomsService.leave).toHaveBeenCalledWith("ABCD12", "user-123");
            expect(mockServer.to).toHaveBeenCalledWith("socket-123");
            expect(mockServer.disconnectSockets).toHaveBeenCalledWith(true);
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.emit).toHaveBeenCalledWith("user:left", {
                reason: "LEFT",
                userId: "user-123",
            });
        });
    });

    describe("handleConnection", () => {
        test("should authenticate, join room, emit room:state to user, and emit user:connected to room", async () => {
            const payload = { userId: "user-123", roomCode: "ABCD12" };
            const user = createMockUser();
            const updatedUser = createMockUser({ socketId: "socket-123", isConnected: true });
            const room = createMockRoom();
            const existingUsers = [createMockUser({ id: "other-user", displayName: "Other User" })];

            jwtAuthService.verify.mockReturnValue(payload);
            roomsService.getRoomMember.mockResolvedValue(user);
            roomsService.updateConnectedUser.mockResolvedValue(updatedUser);
            roomsService.getByCode.mockResolvedValue(room);
            roomsService.getRoomMembersWithDetails.mockResolvedValue(existingUsers);

            await gateway.handleConnection(mockSocket);

            expect(jwtAuthService.verify).toHaveBeenCalledWith("valid-token");
            expect(roomsService.getRoomMember).toHaveBeenCalledWith("user-123");
            expect(mockSocket.data.userId).toBe("user-123");
            expect(mockSocket.data.roomCode).toBe("ABCD12");
            expect(roomsService.updateConnectedUser).toHaveBeenCalledWith("user-123", "socket-123");
            expect(roomsService.getByCode).toHaveBeenCalledWith("ABCD12");
            expect(roomsService.getRoomMembersWithDetails).toHaveBeenCalledWith("ABCD12");
            expect(mockSocket.join).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.to).toHaveBeenCalledWith("socket-123");
            expect(mockServer.emit).toHaveBeenCalledWith("room:state", {
                room,
                users: existingUsers,
            });
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.emit).toHaveBeenCalledWith("user:connected", { user: updatedUser });
        });

        test("should disconnect socket when user not found", async () => {
            const payload = { userId: "user-123", roomCode: "ABCD12" };

            jwtAuthService.verify.mockReturnValue(payload);
            roomsService.getRoomMember.mockResolvedValue(null as unknown as UserStoreModel);

            await gateway.handleConnection(mockSocket);

            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
            expect(mockSocket.join).not.toHaveBeenCalled();
        });

        test("should disconnect socket when token verification fails", async () => {
            jwtAuthService.verify.mockImplementation(() => {
                throw new UnauthorizedException("Invalid token");
            });

            await gateway.handleConnection(mockSocket);

            expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
            expect(mockSocket.join).not.toHaveBeenCalled();
        });
    });

    describe("onCloseRoom", () => {
        test("should close room, emit to all sockets, and disconnect them", async () => {
            const mockRemoteSocket1 = createMock<Socket>({ id: "socket-1" });
            const mockRemoteSocket2 = createMock<Socket>({ id: "socket-2" });
            roomsService.close.mockResolvedValue(undefined);
            mockServer.in.mockReturnValue({
                fetchSockets: jest.fn().mockResolvedValue([mockRemoteSocket1, mockRemoteSocket2]),
            } as never);

            await gateway.onCloseRoom(mockSocket);

            expect(roomsService.close).toHaveBeenCalledWith("user-123", "ABCD12");
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.emit).toHaveBeenCalledWith("room:closed", { reason: "HOST_CLOSED" });
            expect(mockServer.in).toHaveBeenCalledWith("ABCD12");
            expect(mockRemoteSocket1.leave).toHaveBeenCalledWith("ABCD12");
            expect(mockRemoteSocket1.emit).toHaveBeenCalledWith("room:closed", {
                reason: "HOST_CLOSED",
            });
            expect(mockRemoteSocket1.disconnect).toHaveBeenCalledWith(true);
            expect(mockRemoteSocket2.leave).toHaveBeenCalledWith("ABCD12");
            expect(mockRemoteSocket2.disconnect).toHaveBeenCalledWith(true);
        });

        test("should handle room with no connected sockets", async () => {
            roomsService.close.mockResolvedValue(undefined);
            mockServer.in.mockReturnValue({
                fetchSockets: jest.fn().mockResolvedValue([]),
            } as never);

            await gateway.onCloseRoom(mockSocket);

            expect(roomsService.close).toHaveBeenCalledWith("user-123", "ABCD12");
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
        });
    });

    describe("handleDisconnect", () => {
        test("should update user and emit user:disconnected", async () => {
            const updatedUser = createMockUser({ isConnected: false, socketId: null });
            roomsService.updateDisconnectedUser.mockResolvedValue(updatedUser);

            await gateway.handleDisconnect(mockSocket);

            expect(roomsService.updateDisconnectedUser).toHaveBeenCalledWith("user-123");
            expect(mockServer.to).toHaveBeenCalledWith("ABCD12");
            expect(mockServer.emit).toHaveBeenCalledWith("user:disconnected", {
                user: updatedUser,
            });
        });

        test("should do nothing when socket has no roomCode", async () => {
            mockSocket.data = { userId: "user-123" };

            await gateway.handleDisconnect(mockSocket);

            expect(roomsService.updateDisconnectedUser).not.toHaveBeenCalled();
        });

        test("should do nothing when socket has no userId", async () => {
            mockSocket.data = { roomCode: "ABCD12" };

            await gateway.handleDisconnect(mockSocket);

            expect(roomsService.updateDisconnectedUser).not.toHaveBeenCalled();
        });

        test("should do nothing when socket.data is undefined", async () => {
            mockSocket.data = undefined as never;

            await gateway.handleDisconnect(mockSocket);

            expect(roomsService.updateDisconnectedUser).not.toHaveBeenCalled();
        });
    });
});
