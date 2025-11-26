import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PinoLogger } from "nestjs-pino";
import { v4 as uuid } from "uuid";

import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
    UserNotFoundException,
} from "../common/exceptions/room.exceptions";
import { ConfigService } from "../config/config.service";
import { RoomErrorCode } from "../events/model/room.event";
import { RedisService } from "../redis/redis.service";
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
        private readonly jwtService: JwtService,
        private readonly logger: PinoLogger,
        private readonly redisService: RedisService,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    async getByCode(code: string): Promise<RoomStoreModel> {
        const room = await this.redisService.getJson<RoomStoreModel>(`room:${code}`);
        if (!room) throw new RoomNotFoundException();
        return room;
    }

    async addRoomMember(code: string, userId: string): Promise<void> {
        await this.redisService.sadd(`room:${code}:users`, userId);
    }

    async removeRoomMember(code: string, userId: string): Promise<void> {
        await this.redisService.srem(`room:${code}:users`, userId);
    }

    async getRoomMember(userId: string): Promise<UserStoreModel> {
        const member = await this.redisService.getJson<UserStoreModel>(`user:${userId}`);
        if (!member) throw new UserNotFoundException();
        return member;
    }

    async getRoomMembers(code: string): Promise<string[]> {
        return await this.redisService.smembers<string>(`room:${code}:users`);
    }

    async isMember(code: string, userId: string): Promise<boolean> {
        return await this.redisService.sismember(`room:${code}:users`, userId);
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

        return {
            roomCode: room.code,
            token: this.jwtService.sign({ roomCode: room.code, userId: user.id }),
        };
    }

    async join(roomCode: string, displayName: string): Promise<RoomSessionDtoModel> {
        const room = await this.getByCode(roomCode);
        const members = await this.getRoomMembers(roomCode);

        if (room.isLocked) {
            throw new InvalidOperationException("Room is locked", RoomErrorCode.RoomLocked);
        }

        if (room.maxUsers && members.length >= room.maxUsers) {
            throw new InvalidOperationException("Room is full", RoomErrorCode.RoomFull);
        }

        const user = createUser(room.code, displayName);

        const ttl = this.configService.roomTtlSeconds;
        await this.redisService.setJson(`user:${user.id}`, user, ttl);
        await this.addRoomMember(room.code, user.id);

        return {
            roomCode: room.code,
            token: this.jwtService.sign({ roomCode: room.code, userId: user.id }),
        };
    }

    async rejoin(roomCode: string, userId: string): Promise<RoomSessionDtoModel> {
        const members = await this.getRoomMembers(roomCode);
        if (!members.includes(userId)) throw new UserNotFoundException();

        const user = await this.redisService.getJson<UserStoreModel>(`user:${userId}`);
        if (!user) throw new UserNotFoundException();

        return {
            roomCode,
            token: this.jwtService.sign({ roomCode, userId }),
        };
    }

    async leave(roomCode: string, userId: string): Promise<void> {
        const members = await this.getRoomMembers(roomCode);
        if (!members.includes(userId)) throw new UserNotFoundException();

        await this.removeRoomMember(roomCode, userId);

        const room = await this.getByCode(roomCode);

        if (room.hostId === userId) {
            const nextHost = members.find((memberId) => memberId !== userId);
            if (!nextHost) {
                await this.deleteRoom(roomCode);
                return;
            }
            await this.updateHost(room.hostId, roomCode, nextHost);
        }
    }

    async kick(
        userId: string,
        roomCode: string,
        memberToKickUserId: string,
    ): Promise<{ kickedSocketId: string | null }> {
        const room = await this.getByCode(roomCode);

        if (room.hostId !== userId) {
            throw new UnauthorizedHostActionException();
        }

        if (room.hostId === memberToKickUserId) {
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

        return { kickedSocketId: memberToKick.socketId };
    }

    async close(userId: string, roomCode: string): Promise<void> {
        const room = await this.getByCode(roomCode);

        if (room.hostId !== userId) {
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
    }

    async updateConnectedUser(userId: string, socketId: string): Promise<UserStoreModel> {
        const user = await this.redisService.getJson<UserStoreModel>(`user:${userId}`);
        if (!user) throw new UserNotFoundException();

        const updatedUser = { ...user, isConnected: true, socketId };
        await this.redisService.setJson(`user:${userId}`, updatedUser);

        return updatedUser;
    }

    async updateDisconnectedUser(userId: string): Promise<UserStoreModel> {
        const user = await this.redisService.getJson<UserStoreModel>(`user:${userId}`);
        if (!user) throw new UserNotFoundException();

        const updatedUser = { ...user, isConnected: false, socketId: null };
        await this.redisService.setJson(`user:${userId}`, updatedUser);

        return updatedUser;
    }

    async updateHost(userId: string, roomCode: string, newHostId: string): Promise<RoomStoreModel> {
        const room = await this.getByCode(roomCode);

        if (room.hostId !== userId) {
            throw new UnauthorizedHostActionException();
        }

        if (room.hostId === newHostId) {
            throw new InvalidOperationException(
                "User is already host of room",
                RoomErrorCode.AlreadyHost,
            );
        }

        const isMember = await this.isMember(roomCode, newHostId);

        if (!isMember) {
            throw new UserNotFoundException();
        }

        const updatedRoom = { ...room, hostId: newHostId };

        await this.redisService.setJson(`room:${roomCode}`, updatedRoom);

        return updatedRoom;
    }

    async toggleLock(userId: string, roomCode: string): Promise<RoomStoreModel> {
        const room = await this.getByCode(roomCode);

        if (room.hostId !== userId) {
            throw new UnauthorizedHostActionException();
        }

        const updatedRoom = { ...room, isLocked: !room.isLocked };

        await this.redisService.setJson(`room:${roomCode}`, updatedRoom);

        return updatedRoom;
    }

    async deleteRoom(roomCode: string): Promise<void> {
        const members = await this.getRoomMembers(roomCode);
        await Promise.all(members.map((id) => this.redisService.del(`user:${id}`)));
        await this.redisService.del(`room:${roomCode}:users`);
        await this.redisService.del(`room:${roomCode}`);
    }

    async getRoomMembersWithDetails(code: string): Promise<UserStoreModel[]> {
        const memberIds = await this.getRoomMembers(code);
        const members = await Promise.all(
            memberIds.map((id) => this.redisService.getJson<UserStoreModel>(`user:${id}`)),
        );
        return members.filter((m): m is UserStoreModel => m !== null);
    }
}
