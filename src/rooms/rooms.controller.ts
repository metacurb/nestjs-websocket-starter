import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    UseFilters,
    UsePipes,
    ValidationPipe,
} from "@nestjs/common";
import { from, map, Observable } from "rxjs";
import { HttpDomainExceptionFilter } from "src/filters/http-exception.filter";

import { CreateRoomInput } from "./model/dto/create-room.input";
import { JoinRoomInput } from "./model/dto/join-room.input";
import type { JoinedRoomDtoModel } from "./model/dto/joined-room-dto.model";
import { RoomDtoModel } from "./model/dto/room-dto.model";
import { RoomsService } from "./rooms.service";
import { mapRoomToDto } from "./util/map-room-to-dto";
import { mapRoomToJoinedRoomDtoModel } from "./util/map-room-to-joined-room-dto.model";
@UsePipes(new ValidationPipe())
@UseFilters(HttpDomainExceptionFilter)
@Controller("rooms")
export class RoomsController {
    constructor(private readonly roomsService: RoomsService) {}

    @HttpCode(201)
    @Post()
    create(@Body() body: CreateRoomInput): Observable<JoinedRoomDtoModel> {
        return from(this.roomsService.create(body)).pipe(
            map((room) => mapRoomToJoinedRoomDtoModel(room, room.members[0])),
        );
    }

    @HttpCode(200)
    @Post(":code/join")
    join(@Body() body: JoinRoomInput, @Param("code") code: string): Observable<JoinedRoomDtoModel> {
        return from(this.roomsService.join(code, body)).pipe(
            map((result) => mapRoomToJoinedRoomDtoModel(result.room, result.me)),
        );
    }

    @HttpCode(200)
    @Get(":code")
    get(@Param("code") code: string): Observable<RoomDtoModel> {
        return from(this.roomsService.getByCode(code)).pipe(map((room) => mapRoomToDto(room)));
    }
}
