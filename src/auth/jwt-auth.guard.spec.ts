import type { DeepMocked } from "@golevelup/ts-jest";
import { createMock } from "@golevelup/ts-jest";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import type { Request } from "express";

import type { RoomStoreModel } from "../rooms/model/store/room-store.model";
import { RoomsService } from "../rooms/rooms.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JwtAuthService } from "./jwt-auth.service";
import type { JwtPayload } from "./model/jwt-payload";

describe("JwtAuthGuard", () => {
    let guard: JwtAuthGuard;
    let jwtAuthService: DeepMocked<JwtAuthService>;
    let roomsService: DeepMocked<RoomsService>;

    const createMockRequest = (authorization?: string): DeepMocked<Request> =>
        createMock<Request>({
            headers: { authorization },
        });

    const createMockExecutionContext = (
        request: DeepMocked<Request>,
    ): DeepMocked<ExecutionContext> =>
        createMock<ExecutionContext>({
            switchToHttp: () => ({
                getRequest: () => request,
            }),
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

    const mockPayload: JwtPayload = {
        roomCode: "ABCD12",
        userId: "user-123",
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                JwtAuthGuard,
                {
                    provide: JwtAuthService,
                    useValue: createMock<JwtAuthService>(),
                },
                {
                    provide: RoomsService,
                    useValue: createMock<RoomsService>(),
                },
            ],
        }).compile();

        guard = module.get<JwtAuthGuard>(JwtAuthGuard);
        jwtAuthService = module.get(JwtAuthService);
        roomsService = module.get(RoomsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("canActivate", () => {
        test("should throw UnauthorizedException when Authorization header is missing", async () => {
            const request = createMockRequest(undefined);
            const context = createMockExecutionContext(request);
            jwtAuthService.extractBearerToken.mockImplementation(() => {
                throw new UnauthorizedException("Missing or invalid Authorization header");
            });

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
            await expect(guard.canActivate(context)).rejects.toThrow(
                "Missing or invalid Authorization header",
            );
        });

        test("should throw UnauthorizedException when Authorization header does not start with Bearer", async () => {
            const request = createMockRequest("Basic some-token");
            const context = createMockExecutionContext(request);
            jwtAuthService.extractBearerToken.mockImplementation(() => {
                throw new UnauthorizedException("Missing or invalid Authorization header");
            });

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
            await expect(guard.canActivate(context)).rejects.toThrow(
                "Missing or invalid Authorization header",
            );
        });

        test("should throw UnauthorizedException when JWT verification fails", async () => {
            const request = createMockRequest("Bearer invalid-token");
            const context = createMockExecutionContext(request);
            jwtAuthService.extractBearerToken.mockReturnValue("invalid-token");
            jwtAuthService.verify.mockImplementation(() => {
                throw new UnauthorizedException("Invalid or expired token");
            });

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
        });

        test("should throw UnauthorizedException when room does not exist", async () => {
            const request = createMockRequest("Bearer valid-token");
            const context = createMockExecutionContext(request);
            jwtAuthService.extractBearerToken.mockReturnValue("valid-token");
            jwtAuthService.verify.mockReturnValue(mockPayload);
            roomsService.getByCode.mockResolvedValue(null as unknown as RoomStoreModel);

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
            await expect(guard.canActivate(context)).rejects.toThrow("Room not found");
        });

        test("should throw UnauthorizedException when user is not a member of the room", async () => {
            const request = createMockRequest("Bearer valid-token");
            const context = createMockExecutionContext(request);
            jwtAuthService.extractBearerToken.mockReturnValue("valid-token");
            jwtAuthService.verify.mockReturnValue(mockPayload);
            roomsService.getByCode.mockResolvedValue(createMockRoom());
            roomsService.isMember.mockResolvedValue(false);

            await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
            await expect(guard.canActivate(context)).rejects.toThrow(
                "User is not a member of this room",
            );
        });

        test("should return true and set req.user when authentication succeeds", async () => {
            const request = createMockRequest("Bearer valid-token");
            const context = createMockExecutionContext(request);
            jwtAuthService.extractBearerToken.mockReturnValue("valid-token");
            jwtAuthService.verify.mockReturnValue(mockPayload);
            roomsService.getByCode.mockResolvedValue(createMockRoom());
            roomsService.isMember.mockResolvedValue(true);

            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            expect(request.user).toEqual(mockPayload);
            expect(jwtAuthService.verify).toHaveBeenCalledWith("valid-token");
            expect(roomsService.getByCode).toHaveBeenCalledWith("ABCD12");
            expect(roomsService.isMember).toHaveBeenCalledWith("ABCD12", "user-123");
        });

        test("should correctly extract token with extra whitespace", async () => {
            const request = createMockRequest("Bearer   token-with-spaces  ");
            const context = createMockExecutionContext(request);
            jwtAuthService.extractBearerToken.mockReturnValue("token-with-spaces");
            jwtAuthService.verify.mockReturnValue(mockPayload);
            roomsService.getByCode.mockResolvedValue(createMockRoom());
            roomsService.isMember.mockResolvedValue(true);

            await guard.canActivate(context);

            expect(jwtAuthService.verify).toHaveBeenCalledWith("token-with-spaces");
        });
    });
});
