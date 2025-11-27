import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { v4 as uuid } from "uuid";

import { UserNotFoundException } from "../common/exceptions/room.exceptions";
import { ConfigService } from "../config/config.service";
import { RedisService } from "../redis/redis.service";
import { REDIS_USER_KEY } from "./constants";
import { UserStoreModel } from "./model/user-store.model";

@Injectable()
export class UsersService {
    constructor(
        private readonly configService: ConfigService,
        private readonly logger: PinoLogger,
        private readonly redisService: RedisService,
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
        await this.redisService.setJson(
            `${REDIS_USER_KEY}:${user.id}`,
            user,
            ttl ?? this.configService.roomTtlSeconds,
        );
        return user;
    }

    async getById(userId: string): Promise<UserStoreModel> {
        const user = await this.findById(userId);
        if (!user) throw new UserNotFoundException();
        return user;
    }

    findById(userId: string): Promise<UserStoreModel | null> {
        return this.redisService.getJson<UserStoreModel>(`${REDIS_USER_KEY}:${userId}`);
    }

    async updateConnection(userId: string, socketId: string): Promise<UserStoreModel> {
        const user = await this.getById(userId);
        const updated: UserStoreModel = { ...user, isConnected: true, socketId };
        await this.redisService.setJson(`${REDIS_USER_KEY}:${userId}`, updated);
        this.logger.info({ userId, socketId, roomCode: user.roomCode }, "User connected");
        return updated;
    }

    async updateDisconnection(userId: string): Promise<UserStoreModel> {
        const user = await this.getById(userId);
        const updated: UserStoreModel = { ...user, isConnected: false, socketId: null };
        await this.redisService.setJson(`${REDIS_USER_KEY}:${userId}`, updated);
        this.logger.info({ userId, roomCode: user.roomCode }, "User disconnected");
        return updated;
    }

    async delete(userId: string): Promise<void> {
        await this.redisService.del(`${REDIS_USER_KEY}:${userId}`);
    }
}
