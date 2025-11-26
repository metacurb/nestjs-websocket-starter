import { UseFilters, UsePipes, ValidationPipe } from "@nestjs/common";
import type { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from "@nestjs/websockets";
import { PinoLogger } from "nestjs-pino";
import { Server, Socket } from "socket.io";

import { EventsAuthService } from "../auth/events-auth.service";
import { WsDomainExceptionFilter } from "../filters/ws-exception.filter";
import { KickUserInput } from "../rooms/model/input/kick-user.input";
import { UpdateHostInput } from "../rooms/model/input/update-host.input";
import { RoomsService } from "../rooms/rooms.service";
import { EventsMessages } from "./model/events.messages";
import { type GatewayEvents } from "./model/room.event";

@UseFilters(WsDomainExceptionFilter)
@UsePipes(new ValidationPipe())
@WebSocketGateway({
    cors: {
        origin: "*",
    },
    namespace: "rooms",
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly eventsAuthService: EventsAuthService,
        private readonly logger: PinoLogger,
        private readonly roomsService: RoomsService,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    private emitToRoom<E extends keyof GatewayEvents>(
        roomId: string,
        event: E,
        payload: GatewayEvents[E],
    ) {
        return this.server.to(roomId).emit(event, payload);
    }

    private emitToUser<E extends keyof GatewayEvents>(
        socketId: string,
        event: E,
        payload: GatewayEvents[E],
    ) {
        return this.server.to(socketId).emit(event, payload);
    }

    private disconnectUser(socketId: string) {
        return this.server.to(socketId).disconnectSockets(true);
    }

    @SubscribeMessage(EventsMessages.KickFromRoom)
    async onKick(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        input: KickUserInput,
    ) {
        const { kickedSocketId } = await this.roomsService.kick(
            socket.data.userId,
            socket.data.roomCode,
            input.kickUserId,
        );

        if (kickedSocketId) {
            this.emitToUser(kickedSocketId, "user:kicked", null);
            this.disconnectUser(kickedSocketId);
        }

        this.emitToRoom(socket.data.roomCode, "user:left", {
            reason: "KICKED",
            userId: input.kickUserId,
        });
    }

    @SubscribeMessage(EventsMessages.TransferHost)
    async onUpdateHost(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        input: UpdateHostInput,
    ) {
        const room = await this.roomsService.updateHost(
            socket.data.userId,
            socket.data.roomCode,
            input.newHostId,
        );

        this.emitToRoom(room.code, "room:host_updated", { hostId: room.hostId });
    }

    @SubscribeMessage(EventsMessages.ToggleLock)
    async onToggleLock(
        @ConnectedSocket()
        socket: Socket,
    ) {
        const room = await this.roomsService.toggleLock(socket.data.userId, socket.data.roomCode);
        this.emitToRoom(room.code, "room:lock_toggled", { isLocked: room.isLocked });
    }

    @SubscribeMessage(EventsMessages.LeaveRoom)
    async onLeave(
        @ConnectedSocket()
        socket: Socket,
    ) {
        const { roomCode, userId } = socket.data;

        await this.roomsService.leave(roomCode, userId);

        this.disconnectUser(socket.id);

        this.emitToRoom(roomCode, "user:left", {
            reason: "LEFT",
            userId,
        });
    }

    @SubscribeMessage(EventsMessages.CloseRoom)
    async onCloseRoom(socket: Socket) {
        const { roomCode } = socket.data;
        await this.roomsService.close(socket.data.userId, roomCode);
        this.emitToRoom(roomCode, "room:closed", { reason: "HOST_CLOSED" });

        const sockets = await this.server.in(roomCode).fetchSockets();

        for (const socket of sockets) {
            socket.leave(roomCode);
            socket.emit("room:closed", { reason: "HOST_CLOSED" });
            socket.disconnect(true);
        }
    }

    async handleConnection(socket: Socket) {
        try {
            const token = socket.handshake.auth?.token;
            const payload = this.eventsAuthService.verifyToken(token);

            const user = await this.roomsService.getRoomMember(payload.userId);

            if (!user) {
                socket.disconnect(true);
                return;
            }

            const { roomCode, userId } = payload;

            socket.data.userId = userId;
            socket.data.roomCode = roomCode;

            const updatedUser = await this.roomsService.updateConnectedUser(userId, socket.id);

            const [room, existingUsers] = await Promise.all([
                this.roomsService.getByCode(roomCode),
                this.roomsService.getRoomMembersWithDetails(roomCode),
            ]);

            socket.join(roomCode);

            this.emitToUser(socket.id, "room:state", { room, users: existingUsers });
            this.emitToRoom(roomCode, "user:connected", { user: updatedUser });
        } catch (error) {
            this.logger.warn({ error }, "Connection failed");
            socket.disconnect(true);
        }
    }

    async handleDisconnect(
        @ConnectedSocket()
        socket: Socket,
    ) {
        if (!socket.data?.roomCode || !socket.data?.userId) {
            return;
        }

        try {
            const updatedUser = await this.roomsService.updateDisconnectedUser(socket.data.userId);
            this.emitToRoom(socket.data.roomCode, "user:disconnected", { user: updatedUser });
        } catch {
            // User may have been deleted (e.g., room closed), ignore
        }
    }
}
