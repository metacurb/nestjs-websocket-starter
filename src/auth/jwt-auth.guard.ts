import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";

import { RoomsService } from "../rooms/rooms.service";
import { JwtAuthService } from "./jwt-auth.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtAuthService: JwtAuthService,
        private readonly roomsService: RoomsService,
    ) {}

    async canActivate(ctx: ExecutionContext) {
        const req = ctx.switchToHttp().getRequest<Request>();
        const token = this.jwtAuthService.extractBearerToken(req.headers.authorization);
        const payload = this.jwtAuthService.verify(token);

        const roomExists = await this.roomsService.getByCode(payload.roomCode);

        if (!roomExists) {
            throw new UnauthorizedException("Room not found");
        }

        const isMember = await this.roomsService.isMember(payload.roomCode, payload.userId);

        if (!isMember) {
            throw new UnauthorizedException("User is not a member of this room");
        }

        req.user = payload;

        return true;
    }
}
