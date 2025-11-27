import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { v4 as uuid } from "uuid";

import { JwtAuthService } from "../auth/jwt-auth.service";
import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
} from "../common/exceptions/room.exceptions";
import { ConfigService } from "../config/config.service";
import { RedisService } from "../redis/redis.service";
import { RoomErrorCode } from "../shared/errors/error-codes";
import { RoomSessionDtoModel } from "./model/dto/room-session-dto.model";
import type { CreateRoomInput } from "./model/input/create-room.input";
import { RoomStoreModel } from "./model/store/room-store.model";
import { UserStoreModel } from "./model/store/user-store.model";
import { generateRoomCode } from "./util/generate-room-code";

const createUser = (roomCode: string, displayName: string): UserStoreModel => ({
    displayName,
    id: uuid(),
    isConnected: false,
    roomCode,
    socketId: null,
});

@Injectable()
export class RoomsService {
    constructor(
        private readonly configService: ConfigService,
        private readonly jwtAuthService: JwtAuthService,
        private readonly logger: PinoLogger,
        private readonly redisService: RedisService,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    async getByCode(roomCode: string): Promise<RoomStoreModel> {
        this.logger.info({ roomCode }, "Fetching room by code");
        const room = await this.redisService.getJson<RoomStoreModel>(`room:${roomCode}`);
        if (!room) throw new RoomNotFoundException();
        return room;
    }

    async addRoomMember(roomCode: string, userId: string): Promise<void> {
        await this.redisService.sadd(`room:${roomCode}:users`, userId);
    }

    async removeRoomMember(roomCode: string, userId: string): Promise<void> {
        await this.redisService.srem(`room:${roomCode}:users`, userId);
    }

    async getRoomMember(userId: string): Promise<UserStoreModel> {
        const member = await this.redisService.getJson<UserStoreModel>(`user:${userId}`);
        if (!member) throw new UserNotFoundException();
        return member;
    }

    async getRoomMembers(roomCode: string): Promise<string[]> {
        return await this.redisService.smembers<string>(`room:${roomCode}:users`);
    }

    async isMember(roomCode: string, userId: string): Promise<boolean> {
        return await this.redisService.sismember(`room:${roomCode}:users`, userId);
    }

    async create({ displayName, maxUsers }: CreateRoomInput): Promise<RoomSessionDtoModel> {
        const roomCode = generateRoomCode(
            this.configService.roomCodeAlphabet,
            this.configService.roomCodeLength,
        );

        const user = createUser(roomCode, displayName);

        const room: RoomStoreModel = {
            code: roomCode,
            hostId: user.id,
            isLocked: false,
            maxUsers,
            state: "CREATED",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const ttl = this.configService.roomTtlSeconds;
        await this.redisService.setJson(`room:${room.code}`, room, ttl);
        await this.redisService.setJson(`user:${user.id}`, user, ttl);
        await this.addRoomMember(room.code, user.id);
        await this.redisService.expire(`room:${room.code}:users`, ttl);

        this.logger.info({ roomCode: room.code, userId: user.id }, "Room created");

        return {
            roomCode: room.code,
            token: this.jwtAuthService.sign({ roomCode: room.code, userId: user.id }),
        };
    }

    async join(roomCode: string, displayName: string): Promise<RoomSessionDtoModel> {
        const room = await this.getByCode(roomCode);
        const members = await this.getRoomMembers(roomCode);

        if (room.isLocked) {
            this.logger.warn({ roomCode }, "Join rejected: room is locked");
            throw new InvalidOperationException("Room is locked", RoomErrorCode.RoomLocked);
        }

        if (room.maxUsers && members.length >= room.maxUsers) {
            this.logger.warn({ roomCode, maxUsers: room.maxUsers }, "Join rejected: room is full");
            throw new InvalidOperationException("Room is full", RoomErrorCode.RoomFull);
        }

        const user = createUser(room.code, displayName);

        const ttl = this.configService.roomTtlSeconds;
        await this.redisService.setJson(`user:${user.id}`, user, ttl);
        await this.addRoomMember(room.code, user.id);

        this.logger.info({ roomCode: room.code, userId: user.id }, "User joined room");

        return {
            roomCode: room.code,
            token: this.jwtAuthService.sign({ roomCode: room.code, userId: user.id }),
        };
    }

    async rejoin(roomCode: string, userId: string): Promise<RoomSessionDtoModel> {
        const members = await this.getRoomMembers(roomCode);
        if (!members.includes(userId)) throw new UserNotFoundException();

        const user = await this.redisService.getJson<UserStoreModel>(`user:${userId}`);
        if (!user) throw new UserNotFoundException();

        this.logger.info({ roomCode, userId }, "User rejoined room");

        return {
            roomCode,
            token: this.jwtAuthService.sign({ roomCode, userId }),
        };
    }

    async leave(roomCode: string, userId: string): Promise<void> {
        this.logger.info({ roomCode, userId }, "User leaving room");

        const members = await this.getRoomMembers(roomCode);
        if (!members.includes(userId)) throw new UserNotFoundException();

        await this.removeRoomMember(roomCode, userId);

        const room = await this.getByCode(roomCode);

        if (room.hostId === userId) {
            const nextHost = members.find((memberId) => memberId !== userId);
            if (!nextHost) {
                this.logger.info({ roomCode }, "Last member left, deleting room");
                await this.deleteRoom(roomCode);
                return;
            }
            this.logger.info(
                { roomCode, previousHost: userId, newHost: nextHost },
                "Host left, transferring to next member",
            );
            await this.updateHost(room.hostId, roomCode, nextHost);
        }

        this.logger.info({ roomCode, userId }, "User left room");
    }

    async kick(
        userId: string,
        roomCode: string,
        memberToKickUserId: string,
    ): Promise<{ kickedSocketId: string | null }> {
        this.logger.info({ roomCode, userId, memberToKickUserId }, "Attempting to kick user");

        const room = await this.getByCode(roomCode);

        if (room.hostId !== userId) {
            this.logger.warn({ roomCode, userId }, "Kick rejected: user is not host");
            throw new UnauthorizedHostActionException();
        }

        if (room.hostId === memberToKickUserId) {
            this.logger.warn({ roomCode, userId }, "Kick rejected: cannot kick self");
            throw new InvalidOperationException(
                "Cannot kick self from room",
                RoomErrorCode.CannotKickSelf,
            );
        }

        const memberToKick = await this.redisService.getJson<UserStoreModel>(
            `user:${memberToKickUserId}`,
        );

        if (!memberToKick) {
            throw new UserNotFoundException();
        }

        await this.redisService.del(`user:${memberToKick}`);
        await this.removeRoomMember(roomCode, memberToKick.id);

        this.logger.info({ roomCode, kickedUserId: memberToKickUserId }, "User kicked from room");

        return { kickedSocketId: memberToKick.socketId };
    }

    async close(userId: string, roomCode: string): Promise<void> {
        this.logger.info({ roomCode, userId }, "Attempting to close room");

        const room = await this.getByCode(roomCode);

        if (room.hostId !== userId) {
            this.logger.warn({ roomCode, userId }, "Close rejected: user is not host");
            throw new UnauthorizedHostActionException();
        }

        const members = await this.getRoomMembers(roomCode);

        const multi = this.redisService.multi();

        members.forEach((id) => {
            multi.del(`user:${id}`);
        });

        multi.del(`room:${roomCode}:users`);
        multi.del(`room:${roomCode}`);

        await multi.exec();

        this.logger.info({ roomCode, memberCount: members.length }, "Room closed");
    }

    async updateConnectedUser(userId: string, socketId: string): Promise<UserStoreModel> {
        const user = await this.redisService.getJson<UserStoreModel>(`user:${userId}`);
        if (!user) throw new UserNotFoundException();

        const updatedUser = { ...user, isConnected: true, socketId };
        await this.redisService.setJson(`user:${userId}`, updatedUser);

        this.logger.info({ userId, socketId, roomCode: user.roomCode }, "User connected");

        return updatedUser;
    }

    async updateDisconnectedUser(userId: string): Promise<UserStoreModel> {
        const user = await this.redisService.getJson<UserStoreModel>(`user:${userId}`);
        if (!user) throw new UserNotFoundException();

        const updatedUser = { ...user, isConnected: false, socketId: null };
        await this.redisService.setJson(`user:${userId}`, updatedUser);

        this.logger.info({ userId, roomCode: user.roomCode }, "User disconnected");

        return updatedUser;
    }

    async updateHost(userId: string, roomCode: string, newHostId: string): Promise<RoomStoreModel> {
        this.logger.info({ roomCode, userId, newHostId }, "Attempting to transfer host");

        const room = await this.getByCode(roomCode);

        if (room.hostId !== userId) {
            this.logger.warn({ roomCode, userId }, "Host transfer rejected: user is not host");
            throw new UnauthorizedHostActionException();
        }

        if (room.hostId === newHostId) {
            this.logger.warn({ roomCode, newHostId }, "Host transfer rejected: already host");
            throw new InvalidOperationException(
                "User is already host of room",
                RoomErrorCode.AlreadyHost,
            );
        }

        const isMember = await this.isMember(roomCode, newHostId);

        if (!isMember) {
            this.logger.warn(
                { roomCode, newHostId },
                "Host transfer rejected: target not a member",
            );
            throw new UserNotFoundException();
        }

        const updatedRoom = { ...room, hostId: newHostId };

        await this.redisService.setJson(`room:${roomCode}`, updatedRoom);

        this.logger.info(
            { roomCode, previousHost: userId, newHost: newHostId },
            "Host transferred",
        );

        return updatedRoom;
    }

    async toggleLock(userId: string, roomCode: string): Promise<RoomStoreModel> {
        const room = await this.getByCode(roomCode);

        if (room.hostId !== userId) {
            this.logger.warn({ roomCode, userId }, "Toggle lock rejected: user is not host");
            throw new UnauthorizedHostActionException();
        }

        const updatedRoom = { ...room, isLocked: !room.isLocked };

        await this.redisService.setJson(`room:${roomCode}`, updatedRoom);

        this.logger.info({ roomCode, isLocked: updatedRoom.isLocked }, "Room lock toggled");

        return updatedRoom;
    }

    async deleteRoom(roomCode: string): Promise<void> {
        this.logger.info({ roomCode }, "Deleting room");

        const members = await this.getRoomMembers(roomCode);
        await Promise.all(members.map((id) => this.redisService.del(`user:${id}`)));
        await this.redisService.del(`room:${roomCode}:users`);
        await this.redisService.del(`room:${roomCode}`);

        this.logger.info({ roomCode, memberCount: members.length }, "Room deleted");
    }

    async getRoomMembersWithDetails(code: string): Promise<UserStoreModel[]> {
        const memberIds = await this.getRoomMembers(code);
        const members = await Promise.all(
            memberIds.map((id) => this.redisService.getJson<UserStoreModel>(`user:${id}`)),
        );
        return members.filter((m): m is UserStoreModel => m !== null);
    }
}
