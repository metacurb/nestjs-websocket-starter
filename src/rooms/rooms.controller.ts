import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Req,
    UseFilters,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from "@nestjs/common";
import { Request } from "express";
import { PinoLogger } from "nestjs-pino";
import { from, Observable } from "rxjs";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { HttpDomainExceptionFilter } from "../filters/http-exception.filter";
import type { RoomSessionDtoModel } from "./model/dto/room-session-dto.model";
import { CreateRoomInput } from "./model/input/create-room.input";
import { JoinRoomInput } from "./model/input/join-room.input";
import { RoomStoreModel } from "./model/store/room-store.model";
import { RoomsService } from "./rooms.service";
@UsePipes(new ValidationPipe({ forbidNonWhitelisted: true, whitelist: true }))
@UseFilters(HttpDomainExceptionFilter)
@Controller("rooms")
export class RoomsController {
    constructor(
        private readonly logger: PinoLogger,
        private readonly roomsService: RoomsService,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    @HttpCode(201)
    @Post()
    create(@Body() body: CreateRoomInput): Observable<RoomSessionDtoModel> {
        return from(this.roomsService.create(body));
    }

    @HttpCode(200)
    @Post(":code/join")
    join(
        @Body() body: JoinRoomInput,
        @Param("code") code: string,
    ): Observable<RoomSessionDtoModel> {
        return from(this.roomsService.join(code, body.displayName));
    }

    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    @Post(":code/rejoin")
    rejoin(@Req() req: Request, @Param("code") code: string): Observable<RoomSessionDtoModel> {
        return from(this.roomsService.rejoin(code, req.user!.userId));
    }

    @HttpCode(200)
    @Get(":code")
    get(@Param("code") code: string): Observable<RoomStoreModel> {
        return from(this.roomsService.getByCode(code));
    }
}
