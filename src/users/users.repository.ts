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

    async findByIds(ids: string[]): Promise<(UserStoreModel | null)[]> {
        if (ids.length === 0) return [];
        const keys = ids.map((id) => this.key(id));
        return await this.redis.mgetJson<UserStoreModel>(...keys);
    }

    async save(user: UserStoreModel, ttl?: number): Promise<void> {
        await this.redis.setJson(this.key(user.id), user, ttl);
    }

    async delete(...ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const keys = ids.map((id) => this.key(id));
        await this.redis.del(...keys);
    }
}
