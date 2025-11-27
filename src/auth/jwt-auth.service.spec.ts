import { createMock } from "@golevelup/ts-jest";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";

import type { JwtPayload } from "../auth/model/jwt-payload";
import { JwtAuthService } from "./jwt-auth.service";

describe("JwtAuthService", () => {
    let service: JwtAuthService;
    let jwtService: jest.Mocked<JwtService>;

    const mockPayload: JwtPayload = {
        roomCode: "ABCD12",
        userId: "user-123",
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                JwtAuthService,
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

        service = module.get<JwtAuthService>(JwtAuthService);
        jwtService = module.get(JwtService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("verify", () => {
        test("should throw UnauthorizedException when token is undefined", () => {
            expect(() => service.verify(undefined)).toThrow(UnauthorizedException);
            expect(() => service.verify(undefined)).toThrow("Missing authentication token");
        });

        test("should throw UnauthorizedException when token is empty string", () => {
            expect(() => service.verify("")).toThrow(UnauthorizedException);
            expect(() => service.verify("")).toThrow("Missing authentication token");
        });

        test("should throw UnauthorizedException when JWT verification fails", () => {
            jwtService.verify.mockImplementation(() => {
                throw new Error("jwt expired");
            });

            expect(() => service.verify("expired-token")).toThrow(UnauthorizedException);
            expect(() => service.verify("expired-token")).toThrow("Invalid or expired token");
        });

        test("should return payload when token is valid", () => {
            jwtService.verify.mockReturnValue(mockPayload);

            const result = service.verify("valid-token");

            expect(result).toEqual(mockPayload);
            expect(jwtService.verify).toHaveBeenCalledWith("valid-token");
        });

        test("should handle malformed token", () => {
            jwtService.verify.mockImplementation(() => {
                throw new Error("jwt malformed");
            });

            expect(() => service.verify("malformed.token")).toThrow(UnauthorizedException);
            expect(() => service.verify("malformed.token")).toThrow("Invalid or expired token");
        });
    });

    describe("extractBearerToken", () => {
        test("should throw UnauthorizedException when header is undefined", () => {
            expect(() => service.extractBearerToken(undefined)).toThrow(UnauthorizedException);
            expect(() => service.extractBearerToken(undefined)).toThrow(
                "Missing or invalid Authorization header",
            );
        });

        test("should throw UnauthorizedException when header does not start with Bearer", () => {
            expect(() => service.extractBearerToken("Basic token")).toThrow(UnauthorizedException);
            expect(() => service.extractBearerToken("Basic token")).toThrow(
                "Missing or invalid Authorization header",
            );
        });

        test("should extract token from valid Bearer header", () => {
            const result = service.extractBearerToken("Bearer my-token");
            expect(result).toBe("my-token");
        });

        test("should trim whitespace from extracted token", () => {
            const result = service.extractBearerToken("Bearer   token-with-spaces  ");
            expect(result).toBe("token-with-spaces");
        });
    });

    describe("sign", () => {
        test("should sign payload and return token", () => {
            jwtService.sign.mockReturnValue("signed-token");

            const result = service.sign(mockPayload);

            expect(result).toBe("signed-token");
            expect(jwtService.sign).toHaveBeenCalledWith(mockPayload);
        });
    });
});

