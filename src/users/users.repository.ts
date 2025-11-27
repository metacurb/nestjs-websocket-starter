import { Injectable } from "@nestjs/common";

import { RedisService } from "../redis/redis.service";
import { UserStoreModel } from "./model/user-store.model";

@Injectable()
export class UsersRepository {
    constructor(private readonly redis: RedisService) {}

    private key(id: string): string {
        return `user:${id}`;
    }

    findById(id: string): Promise<UserStoreModel | null> {
        return this.redis.getJson<UserStoreModel>(this.key(id));
    }

    async save(user: UserStoreModel, ttl?: number): Promise<void> {
        await this.redis.setJson(this.key(user.id), user, ttl);
    }

    async delete(id: string): Promise<void> {
        await this.redis.del(this.key(id));
    }
}
