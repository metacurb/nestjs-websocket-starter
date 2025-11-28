import { Injectable } from "@nestjs/common";

import { RedisService } from "../redis/redis.service";
import { RoomStoreModel } from "./model/store/room-store.model";

@Injectable()
export class RoomsRepository {
    constructor(private readonly redis: RedisService) {}

    private roomKey(code: string): string {
        return `room:${code}`;
    }

    private usersKey(code: string): string {
        return `room:${code}:users`;
    }

    findByCode(code: string): Promise<RoomStoreModel | null> {
        return this.redis.getJson<RoomStoreModel>(this.roomKey(code));
    }

    async save(room: RoomStoreModel, ttl?: number): Promise<void> {
        await this.redis.setJson(this.roomKey(room.code), room, ttl);
    }

    async delete(code: string): Promise<void> {
        const multi = this.redis.multi();
        multi.del(this.usersKey(code));
        multi.del(this.roomKey(code));
        await multi.exec();
    }

    async addMember(code: string, userId: string): Promise<void> {
        await this.redis.sadd(this.usersKey(code), userId);
    }

    async removeMember(code: string, userId: string): Promise<void> {
        await this.redis.srem(this.usersKey(code), userId);
    }

    getMembers(code: string): Promise<string[]> {
        return this.redis.smembers<string>(this.usersKey(code));
    }

    isMember(code: string, userId: string): Promise<boolean> {
        return this.redis.sismember(this.usersKey(code), userId);
    }

    async setMembersTtl(code: string, ttl: number): Promise<void> {
        await this.redis.expire(this.usersKey(code), ttl);
    }

    async reserveRoomCode(code: string, ttl: number): Promise<boolean> {
        const key = this.roomKey(code);
        const placeholder = JSON.stringify({ code });
        return await this.redis.setIfNotExists(key, placeholder, ttl);
    }
}
