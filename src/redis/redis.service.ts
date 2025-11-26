import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { ChainableCommander, Redis } from "ioredis";

import { REDIS_CLIENT } from "./constants";

@Injectable()
export class RedisService implements OnModuleDestroy {
    constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

    onModuleDestroy(): void {
        this.client.disconnect();
    }

    private async get(key: string): Promise<string | null> {
        return await this.client.get(key);
    }

    private async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.client.setex(key, ttlSeconds, value);
        } else {
            await this.client.set(key, value);
        }
    }

    async del(key: string): Promise<void> {
        await this.client.del(key);
    }

    async expire(key: string, ttlSeconds: number): Promise<void> {
        await this.client.expire(key, ttlSeconds);
    }

    async ttl(key: string): Promise<number> {
        return await this.client.ttl(key);
    }

    async getJson<T>(key: string): Promise<T | null> {
        const raw = await this.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    }

    async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const serialized = JSON.stringify(value);
        await this.set(key, serialized, ttlSeconds);
    }

    multi(): ChainableCommander {
        return this.client.multi();
    }

    async sadd(key: string, ...values: string[]): Promise<void> {
        await this.client.sadd(key, values);
    }

    async srem(key: string, ...values: string[]): Promise<void> {
        await this.client.srem(key, values);
    }

    async smembers<T = string>(key: string): Promise<T[]> {
        return (await this.client.smembers(key)) as T[];
    }

    async sismember(key: string, value: string): Promise<boolean> {
        return (await this.client.sismember(key, value)) === 1;
    }

    async keys(pattern: string): Promise<string[]> {
        return await this.client.keys(pattern);
    }
}
