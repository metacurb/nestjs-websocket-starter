import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PinoLogger } from "nestjs-pino";

import { JwtPayload } from "./model/jwt-payload";

@Injectable()
export class EventsAuthService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    verifyToken(rawToken?: string): JwtPayload {
        if (!rawToken) throw new UnauthorizedException("Missing authentication token");

        try {
            const payload = this.jwtService.verify<JwtPayload>(rawToken);
            return payload;
        } catch {
            throw new UnauthorizedException("Invalid or expired token");
        }
    }
}
