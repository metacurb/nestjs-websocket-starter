import { UseFilters, UsePipes, ValidationPipe } from "@nestjs/common";
import type { OnGatewayDisconnect } from "@nestjs/websockets";
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from "@nestjs/websockets";
import { PinoLogger } from "nestjs-pino";
import { Server, Socket } from "socket.io";
import { WsDomainExceptionFilter } from "src/filters/ws-exception.filter";

import { ConnectToRoomInput } from "../rooms/model/dto/connect-to-room.input";
import { UpdateHostInput } from "../rooms/model/dto/give-host.input";
import { KickUserInput } from "../rooms/model/dto/kick-user.input";
import { LeaveRoomInput } from "../rooms/model/dto/leave-room.input";
import { LockRoomInput } from "../rooms/model/dto/look-room.input";
import { RoomsService } from "../rooms/rooms.service";
import { mapRoomToDto } from "../rooms/util/map-room-to-dto";
import { EventsMessages } from "./model/events.messages";
import type {
    GatewayEvent,
    RoomExitedEvent,
    RoomHostChangeEvent,
    RoomUpdatedEvent,
} from "./model/room.event";
import { RoomErrorCode, RoomEvent, RoomExitReason } from "./model/room.event";

@UseFilters(WsDomainExceptionFilter)
@UsePipes(new ValidationPipe())
@WebSocketGateway({
    cors: {
        origin: "*",
    },
    namespace: "rooms",
})
export class EventsGateway implements OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly logger: PinoLogger,
        private readonly roomsService: RoomsService,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    private sendToRoom(socket: Socket, roomId: string, payload: GatewayEvent) {
        return socket.broadcast.to(roomId).emit("event", payload);
    }

    private sendToRoomMember(socketId: string, payload: GatewayEvent) {
        return this.server.to(socketId).emit("event", payload);
    }

    @SubscribeMessage(EventsMessages.ConnectToRoom)
    async onJoin(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        input: ConnectToRoomInput,
    ): Promise<GatewayEvent> {
        const result = await this.roomsService.connect(socket.id, input);

        const { me, room } = result;

        await socket.join(room.code);

        await this.sendToRoom(socket, room.code, {
            opCode: RoomEvent.Updated,
            roomCode: room.code,
            data: {
                room: mapRoomToDto(room),
            },
        });

        const event: RoomUpdatedEvent = {
            opCode: RoomEvent.Updated,
            roomCode: room.code,
            data: {
                room: mapRoomToDto(room, me.isHost),
            },
        };

        return event;
    }

    @SubscribeMessage(EventsMessages.LeaveRoom)
    async onLeave(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        input: LeaveRoomInput,
    ): Promise<GatewayEvent> {
        const { roomCode } = input;
        const result = await this.roomsService.leave(socket.id, input);

        const exitEvent: RoomExitedEvent = {
            opCode: RoomEvent.Exited,
            roomCode,
            data: {
                reason: RoomExitReason.Left,
            },
        };

        if (!result) {
            this.logger.info({ roomCode }, "socket was last member of room, removing all sockets");
            await this.sendToRoom(socket, roomCode, exitEvent);
            await this.server.in(roomCode).socketsLeave(roomCode);
            return exitEvent;
        }

        const { host, room } = result;

        const updateEvent: RoomUpdatedEvent = {
            opCode: RoomEvent.Updated,
            roomCode,
            data: {
                room: mapRoomToDto(room),
            },
        };

        if (host.socketId !== socket.id) {
            const hostChangeEvent: RoomHostChangeEvent = {
                opCode: RoomEvent.HostChange,
                roomCode,
                data: {
                    secret: result.room.secret,
                },
            };

            await this.sendToRoomMember(host.socketId, hostChangeEvent);
        }

        await socket.leave(roomCode);
        await this.sendToRoom(socket, room.code, updateEvent);

        return exitEvent;
    }

    @SubscribeMessage(EventsMessages.KickFromRoom)
    async onKick(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        input: KickUserInput,
    ): Promise<GatewayEvent> {
        const result = await this.roomsService.kick(socket.id, input);

        if (!result) {
            return {
                opCode: RoomEvent.Error,
                roomCode: input.roomCode,
                data: {
                    code: RoomErrorCode.KickFailed,
                    message: "Could not kick member from room",
                },
            };
        }

        const { kickedMember, room } = result;

        if (!room) {
            return {
                opCode: RoomEvent.Error,
                roomCode: input.roomCode,
                data: {
                    code: RoomErrorCode.RoomNotFound,
                    message: "Room was deleted",
                },
            };
        }

        const update: RoomUpdatedEvent = {
            opCode: RoomEvent.Updated,
            roomCode: room.code,
            data: {
                room: mapRoomToDto(room),
            },
        };

        await this.sendToRoomMember(kickedMember.socketId, {
            opCode: RoomEvent.Exited,
            roomCode: room.code,
            data: {
                reason: RoomExitReason.Kicked,
            },
        });

        await this.server.in(kickedMember.socketId).socketsLeave(room.code);
        await this.sendToRoom(socket, room.code, update);

        return update;
    }

    @SubscribeMessage(EventsMessages.ReconnectToRoom)
    async onReconnect(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        oldSocketId: string,
    ): Promise<GatewayEvent> {
        const result = await this.roomsService.reconnect(socket.id, oldSocketId);

        if (!result) {
            return {
                opCode: RoomEvent.Error,
                data: {
                    code: RoomErrorCode.ReconnectFailed,
                    message: "Could not reconnect to room",
                },
            };
        }

        const { host, room } = result;

        const roomEvent: RoomUpdatedEvent = {
            opCode: RoomEvent.Updated,
            roomCode: room.code,
            data: {
                room: mapRoomToDto(room),
            },
        };

        await socket.join(room.code);
        await this.sendToRoom(socket, room.code, roomEvent);

        const userEvent: RoomUpdatedEvent = {
            opCode: RoomEvent.Updated,
            roomCode: room.code,
            data: {
                room: mapRoomToDto(room, host.socketId === socket.id),
            },
        };

        return userEvent;
    }

    @SubscribeMessage(EventsMessages.UpdateHost)
    async onUpdateHost(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        input: UpdateHostInput,
    ): Promise<GatewayEvent> {
        const result = await this.roomsService.updateHost(socket.id, input);

        if (!result) {
            return {
                opCode: RoomEvent.Error,
                roomCode: input.roomCode,
                data: {
                    code: RoomErrorCode.UpdateHostFailed,
                    message: "Could not update host",
                },
            };
        }

        const { host, room } = result;

        const updateEvent: RoomUpdatedEvent = {
            opCode: RoomEvent.Updated,
            roomCode: room.code,
            data: {
                room: mapRoomToDto(room),
            },
        };

        await this.sendToRoomMember(host.socketId, {
            opCode: RoomEvent.HostChange,
            roomCode: room.code,
            data: {
                secret: room.secret,
            },
        });
        await this.sendToRoom(socket, room.code, updateEvent);

        return updateEvent;
    }

    @SubscribeMessage(EventsMessages.LockRoom)
    async onLock(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        input: LockRoomInput,
    ): Promise<GatewayEvent> {
        const result = await this.roomsService.lock(socket.id, input);

        if (!result) {
            return {
                opCode: RoomEvent.Error,
                roomCode: input.roomCode,
                data: {
                    code: RoomErrorCode.LockFailed,
                    message: "Could not lock/unlock room",
                },
            };
        }

        const { room } = result;

        const event: RoomUpdatedEvent = {
            opCode: RoomEvent.Updated,
            roomCode: room.code,
            data: {
                room: mapRoomToDto(room),
            },
        };

        await this.sendToRoom(socket, room.code, event);

        return event;
    }

    async handleDisconnect(
        @ConnectedSocket()
        socket: Socket,
    ): Promise<GatewayEvent | null> {
        const result = await this.roomsService.disconnect(socket.id);

        if (!result) {
            // User was not in any rooms - this is expected behavior, not an error
            return null;
        }

        const { room } = result;

        await this.sendToRoom(socket, room.code, {
            opCode: RoomEvent.Updated,
            roomCode: room.code,
            data: {
                room: mapRoomToDto(room),
            },
        });

        return {
            opCode: RoomEvent.Exited,
            roomCode: room.code,
            data: {
                reason: RoomExitReason.Disconnected,
            },
        };
    }
}
