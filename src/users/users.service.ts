import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { v4 as uuid } from "uuid";

import { ConfigService } from "../config/config.service";
import { UserNotFoundException } from "./exceptions/user.exceptions";
import { UserStoreModel } from "./model/user-store.model";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
    constructor(
        private readonly configService: ConfigService,
        private readonly logger: PinoLogger,
        private readonly usersRepository: UsersRepository,
    ) {
        this.logger.setContext(this.constructor.name);
    }

    async create(roomCode: string, displayName: string, ttl?: number): Promise<UserStoreModel> {
        const user: UserStoreModel = {
            id: uuid(),
            displayName,
            roomCode,
            isConnected: false,
            socketId: null,
        };
        await this.usersRepository.save(user, ttl ?? this.configService.roomTtlSeconds);
        return user;
    }

    async getById(userId: string): Promise<UserStoreModel> {
        const user = await this.findById(userId);
        if (!user) throw new UserNotFoundException();
        return user;
    }

    findById(userId: string): Promise<UserStoreModel | null> {
        return this.usersRepository.findById(userId);
    }

    async findByIds(userIds: string[]): Promise<UserStoreModel[]> {
        const users = await this.usersRepository.findByIds(userIds);
        return users.filter((u): u is UserStoreModel => u !== null);
    }

    async updateConnection(userId: string, socketId: string): Promise<UserStoreModel> {
        const user = await this.getById(userId);
        const updated: UserStoreModel = { ...user, isConnected: true, socketId };
        await this.usersRepository.save(updated);
        this.logger.info({ userId, socketId, roomCode: user.roomCode }, "User connected");
        return updated;
    }

    async updateDisconnection(userId: string): Promise<UserStoreModel> {
        const user = await this.getById(userId);
        const updated: UserStoreModel = { ...user, isConnected: false, socketId: null };
        await this.usersRepository.save(updated);
        this.logger.info({ userId, roomCode: user.roomCode }, "User disconnected");
        return updated;
    }

    async delete(userId: string): Promise<void> {
        await this.usersRepository.delete(userId);
    }

    async deleteMany(userIds: string[]): Promise<void> {
        await this.usersRepository.delete(...userIds);
    }
}
