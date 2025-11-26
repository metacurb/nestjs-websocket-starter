import { createMock } from "@golevelup/ts-jest";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import { PinoLogger } from "nestjs-pino";
import { lastValueFrom } from "rxjs";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { RoomSessionDtoModel } from "./model/dto/room-session-dto.model";
import type { RoomStoreModel } from "./model/store/room-store.model";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";

describe("RoomsController", () => {
    let controller: RoomsController;
    let roomsService: jest.Mocked<RoomsService>;

    const mockRoomSession: RoomSessionDtoModel = {
        roomCode: "ABCD12",
        token: "jwt-token-123",
    };

    const mockRoom: RoomStoreModel = {
        code: "ABCD12",
        hostId: "user-123",
        isLocked: false,
        maxUsers: 10,
        state: "CREATED",
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [RoomsController],
            providers: [
                {
                    provide: PinoLogger,
                    useValue: createMock<PinoLogger>(),
                },
                {
                    provide: RoomsService,
                    useValue: createMock<RoomsService>(),
                },
            ],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get<RoomsController>(RoomsController);
        roomsService = module.get(RoomsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("create", () => {
        test("should create a room and return session", async () => {
            const input = { displayName: "Host User", maxUsers: 10 };
            roomsService.create.mockResolvedValue(mockRoomSession);

            const result = await lastValueFrom(controller.create(input));

            expect(result).toEqual(mockRoomSession);
            expect(roomsService.create).toHaveBeenCalledWith(input);
        });

        test("should create a room without maxUsers", async () => {
            const input = { displayName: "Host User" };
            roomsService.create.mockResolvedValue(mockRoomSession);

            const result = await lastValueFrom(controller.create(input));

            expect(result).toEqual(mockRoomSession);
            expect(roomsService.create).toHaveBeenCalledWith(input);
        });
    });

    describe("join", () => {
        test("should join a room and return session", async () => {
            const input = { displayName: "New User" };
            roomsService.join.mockResolvedValue(mockRoomSession);

            const result = await lastValueFrom(controller.join(input, "ABCD12"));

            expect(result).toEqual(mockRoomSession);
            expect(roomsService.join).toHaveBeenCalledWith("ABCD12", "New User");
        });
    });

    describe("rejoin", () => {
        test("should rejoin a room and return new session", async () => {
            const mockRequest = { user: { userId: "user-123" } } as unknown as Request;
            roomsService.rejoin.mockResolvedValue(mockRoomSession);

            const result = await lastValueFrom(controller.rejoin(mockRequest, "ABCD12"));

            expect(result).toEqual(mockRoomSession);
            expect(roomsService.rejoin).toHaveBeenCalledWith("ABCD12", "user-123");
        });
    });

    describe("get", () => {
        test("should return room by code", async () => {
            roomsService.getByCode.mockResolvedValue(mockRoom);

            const result = await lastValueFrom(controller.get("ABCD12"));

            expect(result).toEqual(mockRoom);
            expect(roomsService.getByCode).toHaveBeenCalledWith("ABCD12");
        });
    });
});
