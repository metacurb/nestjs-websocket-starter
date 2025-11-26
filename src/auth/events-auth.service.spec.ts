import { createMock } from "@golevelup/ts-jest";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";

import type { JwtPayload } from "../auth/model/jwt-payload";
import { EventsAuthService } from "./events-auth.service";

describe("EventsAuthService", () => {
    let service: EventsAuthService;
    let jwtService: jest.Mocked<JwtService>;

    const mockPayload: JwtPayload = {
        roomCode: "ABCD12",
        userId: "user-123",
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EventsAuthService,
                {
                    provide: JwtService,
                    useValue: createMock<JwtService>(),
                },
                {
                    provide: PinoLogger,
                    useValue: createMock<PinoLogger>(),
                },
            ],
        }).compile();

        service = module.get<EventsAuthService>(EventsAuthService);
        jwtService = module.get(JwtService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("verifyToken", () => {
        test("should throw UnauthorizedException when token is undefined", () => {
            expect(() => service.verifyToken(undefined)).toThrow(UnauthorizedException);
            expect(() => service.verifyToken(undefined)).toThrow("Missing authentication token");
        });

        test("should throw UnauthorizedException when token is empty string", () => {
            expect(() => service.verifyToken("")).toThrow(UnauthorizedException);
            expect(() => service.verifyToken("")).toThrow("Missing authentication token");
        });

        test("should throw UnauthorizedException when JWT verification fails", () => {
            jwtService.verify.mockImplementation(() => {
                throw new Error("jwt expired");
            });

            expect(() => service.verifyToken("expired-token")).toThrow(UnauthorizedException);
            expect(() => service.verifyToken("expired-token")).toThrow("Invalid or expired token");
        });

        test("should return payload when token is valid", () => {
            jwtService.verify.mockReturnValue(mockPayload);

            const result = service.verifyToken("valid-token");

            expect(result).toEqual(mockPayload);
            expect(jwtService.verify).toHaveBeenCalledWith("valid-token");
        });

        test("should handle malformed token", () => {
            jwtService.verify.mockImplementation(() => {
                throw new Error("jwt malformed");
            });

            expect(() => service.verifyToken("malformed.token")).toThrow(UnauthorizedException);
            expect(() => service.verifyToken("malformed.token")).toThrow(
                "Invalid or expired token",
            );
        });
    });
});
