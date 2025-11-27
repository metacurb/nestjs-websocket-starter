import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PinoLogger } from "nestjs-pino";

import { JwtPayload } from "./model/jwt-payload";

@Injectable()
export class JwtAuthService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    verify(rawToken?: string): JwtPayload {
        if (!rawToken) {
            this.logger.warn("Token verification failed: missing token");
            throw new UnauthorizedException("Missing authentication token");
        }

        try {
            const payload = this.jwtService.verify<JwtPayload>(rawToken);
            this.logger.debug(
                { userId: payload.userId, roomCode: payload.roomCode },
                "Token verified",
            );
            return payload;
        } catch (err) {
            this.logger.warn({ err }, "Token verification failed: invalid or expired");
            throw new UnauthorizedException("Invalid or expired token");
        }
    }

    extractBearerToken(authorizationHeader?: string): string {
        if (!authorizationHeader?.startsWith("Bearer ")) {
            throw new UnauthorizedException("Missing or invalid Authorization header");
        }

        return authorizationHeader.replace("Bearer ", "").trim();
    }
}
