import {
    OnModuleDestroy,
    UseFilters,
    UseInterceptors,
    UsePipes,
    ValidationPipe,
} from "@nestjs/common";
import type { OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from "@nestjs/websockets";
import { nanoid } from "nanoid";
import { PinoLogger } from "nestjs-pino";
import { Server, Socket } from "socket.io";

import { JwtAuthService } from "../auth/jwt-auth.service";
import { correlationStorage } from "../logging/correlation.context";
import { CorrelationIdInterceptor } from "../logging/interceptors/correlation-id.interceptor";
import { KickUserInput } from "../rooms/model/input/kick-user.input";
import { UpdateHostInput } from "../rooms/model/input/update-host.input";
import { RoomsService } from "../rooms/rooms.service";
import { WsDomainExceptionFilter } from "../shared/filters/ws-exception.filter";
import { EventsMessages } from "./model/events.messages";
import { type GatewayEvents } from "./model/room.event";

@UseFilters(WsDomainExceptionFilter)
@UseInterceptors(CorrelationIdInterceptor)
@UsePipes(new ValidationPipe())
@WebSocketGateway({ namespace: "rooms" })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer()
    server!: Server;

    constructor(
        private readonly jwtAuthService: JwtAuthService,
        private readonly logger: PinoLogger,
        private readonly roomsService: RoomsService,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    async onModuleDestroy(): Promise<void> {
        this.logger.info("Gracefully disconnecting all WebSocket clients");
        const sockets = await this.server.fetchSockets();
        if (sockets.length > 0) {
            this.server.disconnectSockets(true);
            this.logger.info({ socketCount: sockets.length }, "Disconnected all WebSocket clients");
        }
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
        const { roomCode, userId } = socket.data;

        this.logger.info({ roomCode, userId, kickUserId: input.kickUserId }, "Kicking user");

        const { kickedSocketId } = await this.roomsService.kick(userId, roomCode, input.kickUserId);

        if (kickedSocketId) {
            this.emitToUser(kickedSocketId, "user:kicked", null);
            this.disconnectUser(kickedSocketId);
        }

        this.emitToRoom(roomCode, "user:left", {
            reason: "KICKED",
            userId: input.kickUserId,
        });

        this.logger.info({ roomCode, kickedUserId: input.kickUserId }, "User kicked");
    }

    @SubscribeMessage(EventsMessages.TransferHost)
    async onUpdateHost(
        @ConnectedSocket()
        socket: Socket,
        @MessageBody()
        input: UpdateHostInput,
    ) {
        const { roomCode, userId } = socket.data;

        this.logger.info({ roomCode, userId, newHostId: input.newHostId }, "Transferring host");

        const room = await this.roomsService.updateHost(userId, roomCode, input.newHostId);

        this.emitToRoom(room.code, "room:host_updated", { hostId: room.hostId });

        this.logger.info({ roomCode, newHostId: room.hostId }, "Host transferred");
    }

    @SubscribeMessage(EventsMessages.ToggleLock)
    async onToggleLock(
        @ConnectedSocket()
        socket: Socket,
    ) {
        const { roomCode, userId } = socket.data;

        this.logger.info({ roomCode, userId }, "Toggling room lock");

        const room = await this.roomsService.toggleLock(userId, roomCode);

        this.emitToRoom(room.code, "room:lock_toggled", { isLocked: room.isLocked });

        this.logger.info({ roomCode, isLocked: room.isLocked }, "Room lock toggled");
    }

    @SubscribeMessage(EventsMessages.LeaveRoom)
    async onLeave(
        @ConnectedSocket()
        socket: Socket,
    ) {
        const { roomCode, userId } = socket.data;

        this.logger.info({ roomCode, userId }, "User leaving room");

        await this.roomsService.leave(roomCode, userId);

        this.disconnectUser(socket.id);

        this.emitToRoom(roomCode, "user:left", {
            reason: "LEFT",
            userId,
        });

        this.logger.info({ roomCode, userId }, "User left room");
    }

    @SubscribeMessage(EventsMessages.CloseRoom)
    async onCloseRoom(@ConnectedSocket() socket: Socket) {
        const { roomCode, userId } = socket.data;

        this.logger.info({ roomCode, userId }, "Closing room");

        await this.roomsService.close(userId, roomCode);

        this.emitToRoom(roomCode, "room:closed", { reason: "HOST_CLOSED" });

        const sockets = await this.server.in(roomCode).fetchSockets();

        for (const s of sockets) {
            s.leave(roomCode);
            s.emit("room:closed", { reason: "HOST_CLOSED" });
            s.disconnect(true);
        }

        this.logger.info({ roomCode }, "Room closed");
    }

    async handleConnection(socket: Socket) {
        await correlationStorage.run({ correlationId: nanoid() }, async () => {
            try {
                const token = socket.handshake.auth?.token;
                const payload = this.jwtAuthService.verify(token);
                const { roomCode, userId } = payload;

                this.logger.debug({ userId, roomCode }, "Socket connecting");

                const user = await this.roomsService.getRoomMember(userId);

                if (!user) {
                    this.logger.warn({ userId }, "User not found, disconnecting");
                    socket.disconnect(true);
                    return;
                }

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

                this.logger.info(
                    { roomCode, userId, socketId: socket.id },
                    "User connected to room",
                );
            } catch (err) {
                this.logger.warn({ err }, "Connection failed");
                socket.disconnect(true);
            }
        });
    }

    async handleDisconnect(
        @ConnectedSocket()
        socket: Socket,
    ) {
        await correlationStorage.run({ correlationId: nanoid() }, async () => {
            if (!socket.data?.roomCode || !socket.data?.userId) {
                return;
            }

            const { roomCode, userId } = socket.data;

            try {
                this.logger.debug({ roomCode, userId }, "User disconnecting");

                const updatedUser = await this.roomsService.updateDisconnectedUser(userId);
                this.emitToRoom(roomCode, "user:disconnected", { user: updatedUser });

                this.logger.info({ roomCode, userId }, "User disconnected from room");
            } catch (err) {
                this.logger.info(
                    { err, roomCode, userId },
                    "User disconnected from room, but user not found",
                );
            }
        });
    }
}
