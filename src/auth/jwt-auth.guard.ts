import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

import { RoomsService } from "../rooms/rooms.service";
import { JwtPayload } from "./model/jwt-payload";

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly roomsService: RoomsService,
    ) {}

    private extractToken(request: Request): string {
        const authorization = request.headers.authorization;

        if (!authorization?.startsWith("Bearer ")) {
            throw new UnauthorizedException("Missing or invalid Authorization header");
        }

        return authorization.replace("Bearer ", "").trim();
    }

    async canActivate(ctx: ExecutionContext) {
        const req = ctx.switchToHttp().getRequest<Request>();
        const token = this.extractToken(req);
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

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
