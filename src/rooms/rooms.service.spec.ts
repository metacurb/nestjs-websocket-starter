import { createMock } from "@golevelup/ts-jest";
import { getModelToken } from "@nestjs/mongoose";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import mongoose from "mongoose";
import { PinoLogger } from "nestjs-pino";

import {
    InvalidOperationException,
    MemberNotFoundException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "../common/exceptions/room.exceptions";
import { RoomState } from "./model/enum/room-state.enum";
import { RoomsService } from "./rooms.service";
import { Member, type MemberDocument } from "./schema/member.schema";
import { Room } from "./schema/room.schema";

describe("RoomsService", () => {
    let service: RoomsService;

    let mockRoomModel: {
        findOne: jest.Mock;
        findOneAndUpdate: jest.Mock;
        deleteOne: jest.Mock;
    } & jest.Mock;

    let mockMemberModel: jest.Mock;

    const createMockMember = (overrides: Partial<MemberDocument> = {}): MemberDocument =>
        ({
            _id: new mongoose.Types.ObjectId(),
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
            state: RoomState.Created,
            ...overrides,
        }) as Room;

    beforeEach(async () => {
        mockRoomModel = Object.assign(jest.fn(), {
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            deleteOne: jest.fn(),
        });
        mockMemberModel = jest.fn();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoomsService,
                {
                    provide: PinoLogger,
                    useValue: createMock<PinoLogger>(),
                },
                {
                    provide: getModelToken(Room.name),
                    useValue: mockRoomModel,
                },
                {
                    provide: getModelToken(Member.name),
                    useValue: mockMemberModel,
                },
            ],
        }).compile();

        service = module.get<RoomsService>(RoomsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("getByCode", () => {
        test("should return room when found", async () => {
            const room = createMockRoom();
            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            const result = await service.getByCode("ABCD12");

            expect(result).toBe(room);
            expect(mockRoomModel.findOne).toHaveBeenCalledWith({ code: "ABCD12" });
        });

        test("should uppercase the room code", async () => {
            const room = createMockRoom();
            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await service.getByCode("abcd12");

            expect(mockRoomModel.findOne).toHaveBeenCalledWith({ code: "ABCD12" });
        });

        test("should throw RoomNotFoundException when room not found", async () => {
            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(null),
            });

            await expect(service.getByCode("NOTFOUND")).rejects.toThrow(RoomNotFoundException);
        });
    });

    describe("create", () => {
        test("should create a new room with host member", async () => {
            const input = { name: "Host User", maxMembers: 5 };
            const mockMember = createMockMember({ isHost: true, name: "Host User" });
            const mockRoom = createMockRoom({ members: [mockMember] });

            mockMemberModel.mockReturnValue(mockMember);
            mockRoomModel.mockReturnValue({
                ...mockRoom,
                save: jest.fn().mockResolvedValue(mockRoom),
            });

            const result = await service.create(input);

            expect(result).toEqual(mockRoom);
        });
    });

    describe("join", () => {
        test("should add new member to existing room", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host] });
            const newMember = createMockMember({ isHost: false, name: "New User" });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });
            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);
            mockMemberModel.mockReturnValue(newMember);

            const result = await service.join("ABCD12", { name: "New User" });

            expect(result.host).toBe(host);
            expect(result.me).toBe(newMember);
            expect(result.room).toBe(room);
        });

        test("should return existing member if memberId matches", async () => {
            const existingMember = createMockMember({ isHost: false });
            const memberId = existingMember._id.toHexString();
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host, existingMember] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            const result = await service.join("ABCD12", { name: "User", memberId });

            expect(result.me).toBe(existingMember);
            expect(mockRoomModel.findOneAndUpdate).not.toHaveBeenCalled();
        });

        test("should throw InvalidOperationException when room has no host", async () => {
            const room = createMockRoom({ members: [] });
            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(service.join("ABCD12", { name: "User" })).rejects.toThrow(
                InvalidOperationException,
            );
        });

        test("should throw InvalidOperationException when room is locked", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host], isLocked: true });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(service.join("ABCD12", { name: "User" })).rejects.toThrow(
                InvalidOperationException,
            );
        });

        test("should throw InvalidOperationException when room is full", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const member = createMockMember({ isHost: false, socketId: "member-socket" });
            const room = createMockRoom({ members: [host, member], maxMembers: 2 });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(service.join("ABCD12", { name: "User" })).rejects.toThrow(
                InvalidOperationException,
            );
        });

        test("should allow existing member to rejoin locked room", async () => {
            const existingMember = createMockMember({ isHost: false });
            const memberId = existingMember._id.toHexString();
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host, existingMember], isLocked: true });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            const result = await service.join("ABCD12", { name: "User", memberId });

            expect(result.me).toBe(existingMember);
        });

        test("should allow existing member to rejoin full room", async () => {
            const existingMember = createMockMember({ isHost: false });
            const memberId = existingMember._id.toHexString();
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host, existingMember], maxMembers: 2 });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            const result = await service.join("ABCD12", { name: "User", memberId });

            expect(result.me).toBe(existingMember);
        });
    });

    describe("connect", () => {
        test("should update member connection status", async () => {
            const member = createMockMember({ socketId: "socket-123" });
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host, member] });
            const memberId = member._id.toHexString();

            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);

            const result = await service.connect("socket-123", {
                memberId,
                roomCode: "ABCD12",
            });

            expect(result.room).toBe(room);
            expect(mockRoomModel.findOneAndUpdate).toHaveBeenCalled();
        });

        test("should throw RoomNotFoundException when room not found", async () => {
            mockRoomModel.findOneAndUpdate.mockResolvedValue(null);

            await expect(
                service.connect("socket-123", {
                    memberId: "507f1f77bcf86cd799439011",
                    roomCode: "NOTFOUND",
                }),
            ).rejects.toThrow(RoomNotFoundException);
        });
    });

    describe("disconnect", () => {
        test("should update member to disconnected", async () => {
            const member = createMockMember({ socketId: "socket-123" });
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host, member] });

            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);

            const result = await service.disconnect("socket-123");

            expect(result.room).toBe(room);
        });

        test("should throw InvalidOperationException when socketId is empty", async () => {
            await expect(service.disconnect("")).rejects.toThrow(InvalidOperationException);
        });

        test("should throw RoomNotFoundException when member not found", async () => {
            mockRoomModel.findOneAndUpdate.mockResolvedValue(null);

            await expect(service.disconnect("unknown-socket")).rejects.toThrow(
                RoomNotFoundException,
            );
        });
    });

    describe("reconnect", () => {
        test("should update socket ID and reconnect", async () => {
            const member = createMockMember({ socketId: "new-socket" });
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host, member] });

            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);

            const result = await service.reconnect("new-socket", "old-socket");

            expect(result.room).toBe(room);
        });

        test("should throw RoomNotFoundException when old socket not found", async () => {
            mockRoomModel.findOneAndUpdate.mockResolvedValue(null);

            await expect(service.reconnect("new-socket", "unknown-socket")).rejects.toThrow(
                RoomNotFoundException,
            );
        });
    });

    describe("leave", () => {
        test("should remove member from room", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const member = createMockMember({ isHost: false, socketId: "socket-123" });
            const room = createMockRoom({ members: [host, member] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });
            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);

            const result = await service.leave("socket-123", { roomCode: "ABCD12" });

            expect(result?.room).toBe(room);
        });

        test("should delete room when last member leaves", async () => {
            const host = createMockMember({ isHost: true, socketId: "socket-123" });
            const room = createMockRoom({ members: [host] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });
            mockRoomModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const result = await service.leave("socket-123", { roomCode: "ABCD12" });

            expect(result).toBeNull();
            expect(mockRoomModel.deleteOne).toHaveBeenCalledWith({ code: "ABCD12" });
        });

        test("should transfer host when host leaves", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const member = createMockMember({ isHost: false, socketId: "member-socket" });
            const room = createMockRoom({ members: [host, member] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });
            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);

            await service.leave("host-socket", { roomCode: "ABCD12" });

            expect(mockRoomModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
        });

        test("should throw MemberNotFoundException when member not in room", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(service.leave("unknown-socket", { roomCode: "ABCD12" })).rejects.toThrow(
                MemberNotFoundException,
            );
        });
    });

    describe("kick", () => {
        test("should remove kicked member from room", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const member = createMockMember({ isHost: false, socketId: "member-socket" });
            const memberId = member._id.toHexString();
            const room = createMockRoom({ members: [host, member], secret: "secret" });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });
            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);

            const result = await service.kick("host-socket", {
                memberId,
                roomCode: "ABCD12",
                secret: "secret",
            });

            expect(result.kickedMember).toBe(member);
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const member = createMockMember({ isHost: false, socketId: "member-socket" });
            const room = createMockRoom({ members: [host, member] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(
                service.kick("member-socket", {
                    memberId: "any-id",
                    roomCode: "ABCD12",
                    secret: "secret",
                }),
            ).rejects.toThrow(UnauthorizedHostActionException);
        });

        test("should throw MemberNotFoundException when member to kick not found", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(
                service.kick("host-socket", {
                    memberId: "507f1f77bcf86cd799439011",
                    roomCode: "ABCD12",
                    secret: "secret",
                }),
            ).rejects.toThrow(MemberNotFoundException);
        });

        test("should throw InvalidOperationException when trying to kick self", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const memberId = host._id.toHexString();
            const room = createMockRoom({ members: [host] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(
                service.kick("host-socket", {
                    memberId,
                    roomCode: "ABCD12",
                    secret: "secret",
                }),
            ).rejects.toThrow(InvalidOperationException);
        });
    });

    describe("updateHost", () => {
        test("should transfer host to another member", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const member = createMockMember({ isHost: false, socketId: "member-socket" });
            const memberId = member._id.toHexString();
            const room = createMockRoom({ members: [host, member], secret: "secret" });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });
            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);

            const result = await service.updateHost("host-socket", {
                memberId,
                roomCode: "ABCD12",
                secret: "secret",
            });

            expect(result.room).toBe(room);
        });

        test("should throw UnauthorizedHostActionException when not host", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const member = createMockMember({ isHost: false, socketId: "member-socket" });
            const room = createMockRoom({ members: [host, member] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(
                service.updateHost("member-socket", {
                    memberId: "any-id",
                    roomCode: "ABCD12",
                    secret: "secret",
                }),
            ).rejects.toThrow(UnauthorizedHostActionException);
        });

        test("should throw MemberNotFoundException when target member not found", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(
                service.updateHost("host-socket", {
                    memberId: "507f1f77bcf86cd799439011",
                    roomCode: "ABCD12",
                    secret: "secret",
                }),
            ).rejects.toThrow(MemberNotFoundException);
        });

        test("should throw InvalidOperationException when already host", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const memberId = host._id.toHexString();
            const room = createMockRoom({ members: [host] });

            mockRoomModel.findOne.mockReturnValue({
                exec: jest.fn().mockResolvedValue(room),
            });

            await expect(
                service.updateHost("host-socket", {
                    memberId,
                    roomCode: "ABCD12",
                    secret: "secret",
                }),
            ).rejects.toThrow(InvalidOperationException);
        });
    });

    describe("lock", () => {
        test("should toggle room lock status", async () => {
            const host = createMockMember({ isHost: true, socketId: "host-socket" });
            const room = createMockRoom({ members: [host], secret: "secret" });

            mockRoomModel.findOneAndUpdate.mockResolvedValue(room);

            const result = await service.lock("host-socket", {
                roomCode: "ABCD12",
                secret: "secret",
            });

            expect(result.room).toBe(room);
        });

        test("should throw RoomNotFoundException when room not found or unauthorized", async () => {
            mockRoomModel.findOneAndUpdate.mockResolvedValue(null);

            await expect(
                service.lock("socket", { roomCode: "ABCD12", secret: "secret" }),
            ).rejects.toThrow(RoomNotFoundException);
        });
    });
});
