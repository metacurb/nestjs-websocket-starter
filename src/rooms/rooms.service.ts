import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { JwtAuthService } from "../auth/jwt-auth.service";
import { ConfigService } from "../config/config.service";
import { RoomErrorCode } from "../shared/errors/error-codes";
import { UserNotFoundException } from "../users/exceptions/user.exceptions";
import type { UserStoreModel } from "../users/model/user-store.model";
import { UsersService } from "../users/users.service";
import {
    InvalidOperationException,
    RoomNotFoundException,
    UnauthorizedHostActionException,
} from "./exceptions/room.exceptions";
import { RoomSessionDtoModel } from "./model/dto/room-session-dto.model";
import type { CreateRoomInput } from "./model/input/create-room.input";
import { RoomStoreModel } from "./model/store/room-store.model";
import { RoomsRepository } from "./rooms.repository";
import { generateRoomCode } from "./util/generate-room-code";

@Injectable()
export class RoomsService {
    constructor(
        private readonly configService: ConfigService,
        private readonly jwtAuthService: JwtAuthService,
        private readonly logger: PinoLogger,
        private readonly roomsRepository: RoomsRepository,
        private readonly usersService: UsersService,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    async getByCode(roomCode: string): Promise<RoomStoreModel> {
        this.logger.info({ roomCode }, "Fetching room by code");
        const room = await this.roomsRepository.findByCode(roomCode);
        if (!room) throw new RoomNotFoundException();
        return room;
    }

    getRoomMember(userId: string): Promise<UserStoreModel> {
        return this.usersService.getById(userId);
    }

    getRoomMembers(roomCode: string): Promise<string[]> {
        return this.roomsRepository.getMembers(roomCode);
    }

    isMember(roomCode: string, userId: string): Promise<boolean> {
        return this.roomsRepository.isMember(roomCode, userId);
    }

    async create({ displayName, maxUsers }: CreateRoomInput): Promise<RoomSessionDtoModel> {
        const roomCode = generateRoomCode(
            this.configService.roomCodeAlphabet,
            this.configService.roomCodeLength,
        );

        const ttl = this.configService.roomTtlSeconds;
        const user = await this.usersService.create(roomCode, displayName, ttl);

        const room: RoomStoreModel = {
            code: roomCode,
            hostId: user.id,
            isLocked: false,
            maxUsers,
            state: "CREATED",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await this.roomsRepository.save(room, ttl);
        await this.roomsRepository.addMember(room.code, user.id);
        await this.roomsRepository.setMembersTtl(room.code, ttl);

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

        const ttl = this.configService.roomTtlSeconds;
        const user = await this.usersService.create(room.code, displayName, ttl);
        await this.roomsRepository.addMember(room.code, user.id);

        this.logger.info({ roomCode: room.code, userId: user.id }, "User joined room");

        return {
            roomCode: room.code,
            token: this.jwtAuthService.sign({ roomCode: room.code, userId: user.id }),
        };
    }

    async rejoin(roomCode: string, userId: string): Promise<RoomSessionDtoModel> {
        const members = await this.getRoomMembers(roomCode);
        if (!members.includes(userId)) throw new UserNotFoundException();

        await this.usersService.getById(userId);

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

        await this.roomsRepository.removeMember(roomCode, userId);

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

        const memberToKick = await this.usersService.getById(memberToKickUserId);

        await this.usersService.delete(memberToKickUserId);
        await this.roomsRepository.removeMember(roomCode, memberToKick.id);

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
        await Promise.all(members.map((id) => this.usersService.delete(id)));
        await this.roomsRepository.delete(roomCode);

        this.logger.info({ roomCode, memberCount: members.length }, "Room closed");
    }

    updateConnectedUser(userId: string, socketId: string): Promise<UserStoreModel> {
        return this.usersService.updateConnection(userId, socketId);
    }

    updateDisconnectedUser(userId: string): Promise<UserStoreModel> {
        return this.usersService.updateDisconnection(userId);
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
        await this.roomsRepository.save(updatedRoom);

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
        await this.roomsRepository.save(updatedRoom);

        this.logger.info({ roomCode, isLocked: updatedRoom.isLocked }, "Room lock toggled");

        return updatedRoom;
    }

    async deleteRoom(roomCode: string): Promise<void> {
        this.logger.info({ roomCode }, "Deleting room");

        const members = await this.getRoomMembers(roomCode);
        await Promise.all(members.map((id) => this.usersService.delete(id)));
        await this.roomsRepository.delete(roomCode);

        this.logger.info({ roomCode, memberCount: members.length }, "Room deleted");
    }

    async getRoomMembersWithDetails(code: string): Promise<UserStoreModel[]> {
        const memberIds = await this.getRoomMembers(code);
        const members = await Promise.all(memberIds.map((id) => this.usersService.findById(id)));
        return members.filter((m): m is UserStoreModel => m !== null);
    }
}
