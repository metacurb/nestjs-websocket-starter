import type { DeepMocked } from "@golevelup/ts-jest";
import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import type { Server, Socket } from "socket.io";

import type { KickedRoomDataModel } from "../rooms/model/kicked-room-data.model";
import type { RoomDataModel } from "../rooms/model/room-data.model";
import { RoomsService } from "../rooms/rooms.service";
import type { MemberDocument } from "../rooms/schema/member.schema";
import type { Room } from "../rooms/schema/room.schema";
import { EventsGateway } from "./events.gateway";
import type { RoomErrorEvent, RoomExitedEvent, RoomUpdatedEvent } from "./model/room.event";
import { RoomErrorCode, RoomEvent, RoomExitReason } from "./model/room.event";

describe("EventsGateway", () => {
    let gateway: EventsGateway;
    let roomsService: DeepMocked<RoomsService>;
    let mockSocket: DeepMocked<Socket>;
    let mockServer: DeepMocked<Server>;

    const createMockMember = (overrides: Partial<MemberDocument> = {}): MemberDocument =>
        ({
            _id: { toHexString: () => "member-id-123" },
            connected: true,
            isHost: false,
            name: "Test User",
            socketId: "socket-123",
            ...overrides,
        }) as unknown as MemberDocument;

    const createMockRoom = (overrides: Partial<Room> = {}): Room =>
        ({
            code: "ABCD12",
            isLocked: false,
            maxMembers: 10,
            members: [createMockMember({ isHost: true })],
            secret: "secret-123",
            state: "CREATED",
            ...overrides,
        }) as Room;

    const createRoomDataModel = (overrides: Partial<RoomDataModel> = {}): RoomDataModel => ({
        host: createMockMember({ isHost: true }),
        me: createMockMember(),
        room: createMockRoom(),
        ...overrides,
    });

    beforeEach(async () => {
        mockSocket = createMock<Socket>({
            id: "socket-123",
            broadcast: { to: jest.fn(), emit: jest.fn() },
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
            ],
        }).compile();

        gateway = module.get<EventsGateway>(EventsGateway);
        roomsService = module.get(RoomsService);

        gateway.server = mockServer;

        (mockSocket.broadcast.to as jest.Mock).mockReturnThis();
        mockSocket.join.mockResolvedValue(undefined);
        mockSocket.leave.mockResolvedValue(undefined);

        mockServer.to.mockReturnThis();
        mockServer.in.mockReturnValue({
            socketsLeave: jest.fn().mockResolvedValue(undefined),
        } as never);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("onJoin", () => {
        test("should connect to room and broadcast update to other members", async () => {
            const input = { memberId: "member-id-123", roomCode: "ABCD12" };
            const roomData = createRoomDataModel();
            roomsService.connect.mockResolvedValue(roomData);

            const result = await gateway.onJoin(mockSocket, input);

            expect(roomsService.connect).toHaveBeenCalledWith("socket-123", input);
            expect(mockSocket.join).toHaveBeenCalledWith("ABCD12");
            expect(mockSocket.broadcast.to).toHaveBeenCalledWith("ABCD12");
            expect(result.opCode).toBe(RoomEvent.Updated);
        });

        test("should include secret in response for host", async () => {
            const hostMember = createMockMember({ isHost: true, socketId: "socket-123" });
            const roomData = createRoomDataModel({ me: hostMember });
            roomsService.connect.mockResolvedValue(roomData);

            const result = await gateway.onJoin(mockSocket, {
                memberId: "member-id-123",
                roomCode: "ABCD12",
            });

            expect(result.opCode).toBe(RoomEvent.Updated);
            expect((result as RoomUpdatedEvent).data.room.secret).toBe("secret-123");
        });
    });

    describe("onLeave", () => {
        test("should handle leave and broadcast update", async () => {
            const input = { roomCode: "ABCD12" };
            const roomData = createRoomDataModel();
            roomsService.leave.mockResolvedValue(roomData);

            const result = await gateway.onLeave(mockSocket, input);

            expect(roomsService.leave).toHaveBeenCalledWith("socket-123", input);
            expect(mockSocket.leave).toHaveBeenCalledWith("ABCD12");
            expect(result.opCode).toBe(RoomEvent.Exited);
            expect((result as RoomExitedEvent).data.reason).toBe(RoomExitReason.Left);
        });

        test("should handle last member leaving and clean up room", async () => {
            const input = { roomCode: "ABCD12" };
            roomsService.leave.mockResolvedValue(null);

            const result = await gateway.onLeave(mockSocket, input);

            expect(mockServer.in).toHaveBeenCalledWith("ABCD12");
            expect(result.opCode).toBe(RoomEvent.Exited);
        });

        test("should notify new host when host leaves", async () => {
            const newHost = createMockMember({ isHost: true, socketId: "new-host-socket" });
            const room = createMockRoom({ secret: "new-secret" });
            const roomData = createRoomDataModel({ host: newHost, room });
            roomsService.leave.mockResolvedValue(roomData);

            await gateway.onLeave(mockSocket, { roomCode: "ABCD12" });

            expect(mockServer.to).toHaveBeenCalledWith("new-host-socket");
        });
    });

    describe("onKick", () => {
        test("should kick member and broadcast update", async () => {
            const input = { memberId: "kicked-member-id", roomCode: "ABCD12", secret: "secret" };
            const kickedMember = createMockMember({ socketId: "kicked-socket" });
            const kickResult: KickedRoomDataModel = {
                ...createRoomDataModel(),
                kickedMember,
            };
            roomsService.kick.mockResolvedValue(kickResult);

            const result = await gateway.onKick(mockSocket, input);

            expect(roomsService.kick).toHaveBeenCalledWith("socket-123", input);
            expect(mockServer.to).toHaveBeenCalledWith("kicked-socket");
            expect(mockServer.in).toHaveBeenCalledWith("kicked-socket");
            expect(result.opCode).toBe(RoomEvent.Updated);
        });

        test("should return error when kick fails", async () => {
            const input = { memberId: "member-id", roomCode: "ABCD12", secret: "secret" };
            roomsService.kick.mockResolvedValue(null as unknown as KickedRoomDataModel);

            const result = await gateway.onKick(mockSocket, input);

            expect(result.opCode).toBe(RoomEvent.Error);
            expect((result as RoomErrorEvent).data.code).toBe(RoomErrorCode.KickFailed);
        });

        test("should return error when room was deleted during kick", async () => {
            const input = { memberId: "member-id", roomCode: "ABCD12", secret: "secret" };
            roomsService.kick.mockResolvedValue({
                kickedMember: createMockMember(),
                room: null,
            } as unknown as KickedRoomDataModel);

            const result = await gateway.onKick(mockSocket, input);

            expect(result.opCode).toBe(RoomEvent.Error);
            expect((result as RoomErrorEvent).data.code).toBe(RoomErrorCode.RoomNotFound);
        });
    });

    describe("onReconnect", () => {
        test("should reconnect and broadcast update", async () => {
            const oldSocketId = "old-socket-123";
            const roomData = createRoomDataModel();
            roomsService.reconnect.mockResolvedValue(roomData);

            const result = await gateway.onReconnect(mockSocket, oldSocketId);

            expect(roomsService.reconnect).toHaveBeenCalledWith("socket-123", oldSocketId);
            expect(mockSocket.join).toHaveBeenCalledWith("ABCD12");
            expect(result.opCode).toBe(RoomEvent.Updated);
        });

        test("should return error when reconnect fails", async () => {
            roomsService.reconnect.mockResolvedValue(null as unknown as RoomDataModel);

            const result = await gateway.onReconnect(mockSocket, "old-socket");

            expect(result.opCode).toBe(RoomEvent.Error);
            expect((result as RoomErrorEvent).data.code).toBe(RoomErrorCode.ReconnectFailed);
        });

        test("should include secret for reconnecting host", async () => {
            const hostMember = createMockMember({ isHost: true, socketId: "socket-123" });
            const roomData = createRoomDataModel({ host: hostMember });
            roomsService.reconnect.mockResolvedValue(roomData);

            const result = await gateway.onReconnect(mockSocket, "old-socket");

            expect(result.opCode).toBe(RoomEvent.Updated);
            expect((result as RoomUpdatedEvent).data.room.secret).toBe("secret-123");
        });
    });

    describe("onUpdateHost", () => {
        test("should update host and notify new host", async () => {
            const input = { memberId: "new-host-id", roomCode: "ABCD12", secret: "secret" };
            const newHost = createMockMember({ isHost: true, socketId: "new-host-socket" });
            const roomData = createRoomDataModel({ host: newHost });
            roomsService.updateHost.mockResolvedValue(roomData);

            const result = await gateway.onUpdateHost(mockSocket, input);

            expect(roomsService.updateHost).toHaveBeenCalledWith("socket-123", input);
            expect(mockServer.to).toHaveBeenCalledWith("new-host-socket");
            expect(result.opCode).toBe(RoomEvent.Updated);
        });

        test("should return error when update host fails", async () => {
            const input = { memberId: "member-id", roomCode: "ABCD12", secret: "secret" };
            roomsService.updateHost.mockResolvedValue(null as unknown as RoomDataModel);

            const result = await gateway.onUpdateHost(mockSocket, input);

            expect(result.opCode).toBe(RoomEvent.Error);
            expect((result as RoomErrorEvent).data.code).toBe(RoomErrorCode.UpdateHostFailed);
        });
    });

    describe("onLock", () => {
        test("should toggle lock and broadcast update", async () => {
            const input = { roomCode: "ABCD12", secret: "secret" };
            const roomData = createRoomDataModel();
            roomsService.lock.mockResolvedValue(roomData);

            const result = await gateway.onLock(mockSocket, input);

            expect(roomsService.lock).toHaveBeenCalledWith("socket-123", input);
            expect(mockSocket.broadcast.to).toHaveBeenCalledWith("ABCD12");
            expect(result.opCode).toBe(RoomEvent.Updated);
        });

        test("should return error when lock fails", async () => {
            const input = { roomCode: "ABCD12", secret: "secret" };
            roomsService.lock.mockResolvedValue(null as unknown as RoomDataModel);

            const result = await gateway.onLock(mockSocket, input);

            expect(result.opCode).toBe(RoomEvent.Error);
            expect((result as RoomErrorEvent).data.code).toBe(RoomErrorCode.LockFailed);
        });
    });

    describe("handleDisconnect", () => {
        test("should handle disconnect and broadcast update", async () => {
            const roomData = createRoomDataModel();
            roomsService.disconnect.mockResolvedValue(roomData);

            const result = await gateway.handleDisconnect(mockSocket);

            expect(roomsService.disconnect).toHaveBeenCalledWith("socket-123");
            expect(mockSocket.broadcast.to).toHaveBeenCalledWith("ABCD12");
            expect(result?.opCode).toBe(RoomEvent.Exited);
            expect((result as RoomExitedEvent).data.reason).toBe(RoomExitReason.Disconnected);
        });

        test("should return null when user was not in any room", async () => {
            roomsService.disconnect.mockResolvedValue(null as unknown as RoomDataModel);

            const result = await gateway.handleDisconnect(mockSocket);

            expect(result).toBeNull();
        });
    });
});
